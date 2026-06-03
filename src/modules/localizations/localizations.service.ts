import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocalizationEntityType as PrismaLocalizationEntityType } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import {
  isLocalizationEntityType,
  normalizeLocale,
  pickAllowedTranslationFields,
} from './localization.util';
import { ListEntityTranslationsDto, UpsertEntityTranslationDto } from './dto';
import { LocalizationsRepository } from './localizations.repository';

@Injectable()
export class LocalizationsService {
  constructor(
    private readonly localizationsRepository: LocalizationsRepository,
  ) {}

  async upsert(
    user: AuthUserContext,
    entityTypeParam: string,
    entityId: string,
    localeParam: string,
    dto: UpsertEntityTranslationDto,
  ) {
    const entityType = this.parseEntityType(entityTypeParam);
    const locale = normalizeLocale(localeParam);
    const restaurantId = await this.resolveRequiredRestaurantId(
      user,
      dto.restaurantId,
    );

    if (entityType === 'RESTAURANT' && entityId !== restaurantId) {
      throw new BadRequestException(
        'Restaurant translations must target the requested restaurant',
      );
    }

    const entityScope = await this.localizationsRepository.findEntityScope(
      entityType,
      entityId,
      restaurantId,
    );

    if (!entityScope) {
      throw new NotFoundException('Translatable entity not found');
    }

    const tenantId = this.readEntityTenantId(entityScope);
    this.ensureTenantAccess(user, tenantId);

    const fields = pickAllowedTranslationFields(entityType, dto.fields);
    if (!Object.keys(fields).length) {
      throw new BadRequestException(
        'At least one supported translation field is required',
      );
    }

    const data = await this.localizationsRepository.upsert({
      tenantId,
      restaurantId,
      entityType,
      entityId,
      locale,
      fields,
      isActive: dto.isActive ?? true,
      userId: user.uid,
    });

    return {
      data,
      message: 'Translation saved successfully',
    };
  }

  async list(user: AuthUserContext, query: ListEntityTranslationsDto) {
    const restaurantId = await this.resolveOptionalRestaurantId(
      user,
      query.restaurantId,
      true,
    );
    const normalizedQuery = {
      ...query,
      locale: query.locale ? normalizeLocale(query.locale) : undefined,
    };
    const { items, total } = await this.localizationsRepository.list(
      restaurantId,
      normalizedQuery,
    );

    return {
      data: items,
      message: 'Translations fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async deactivate(
    user: AuthUserContext,
    entityTypeParam: string,
    entityId: string,
    localeParam: string,
    restaurantIdParam?: string,
  ) {
    const entityType = this.parseEntityType(entityTypeParam);
    const locale = normalizeLocale(localeParam);
    const restaurantId = await this.resolveRequiredRestaurantId(
      user,
      restaurantIdParam,
    );

    const entityScope = await this.localizationsRepository.findEntityScope(
      entityType,
      entityId,
      restaurantId,
    );

    if (!entityScope) {
      throw new NotFoundException('Translatable entity not found');
    }

    this.ensureTenantAccess(user, this.readEntityTenantId(entityScope));

    const data = await this.localizationsRepository.deactivate({
      restaurantId,
      entityType,
      entityId,
      locale,
      userId: user.uid,
    });

    return {
      data,
      message: 'Translation deactivated successfully',
    };
  }

  private parseEntityType(value: string): PrismaLocalizationEntityType {
    const normalized = value.trim().toUpperCase();
    if (!isLocalizationEntityType(normalized)) {
      throw new BadRequestException('Unsupported translation entity type');
    }

    return normalized;
  }

  private async resolveRequiredRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    const restaurantId = await this.resolveOptionalRestaurantId(
      user,
      requestedRestaurantId,
      false,
    );

    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return restaurantId;
  }

  private async resolveOptionalRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    allowSuperAdminWithoutRestaurant = false,
  ): Promise<string | undefined> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId && !allowSuperAdminWithoutRestaurant) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    const restaurantId = requestedRestaurantId ?? user.rid;
    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    if (user.rid && user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot manage translations outside your restaurant',
      );
    }

    if (user.tid) {
      const restaurant = await this.localizationsRepository.findRestaurantScope(
        restaurantId,
        user.tid,
      );
      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot manage translations outside your tenant restaurants',
        );
      }
    }

    return restaurantId;
  }

  private ensureTenantAccess(user: AuthUserContext, tenantId: string): void {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (!user.tid || user.tid !== tenantId) {
      throw new ForbiddenException(
        'You cannot manage translations outside your tenant',
      );
    }
  }

  private readEntityTenantId(entity: {
    tenantId?: string;
    restaurant?: { tenantId: string };
  }): string {
    return entity.tenantId ?? entity.restaurant?.tenantId ?? '';
  }
}
