import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WinOrderCatalogMappingType } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import {
  MENU_INTEGRATION_CATALOG_PORT,
  MenuIntegrationCatalogPort,
} from '../menu';
import {
  ReplaceWinOrderCatalogMappingsDto,
  ReplaceWinOrderPaymentMappingsDto,
} from './dto';
import { WinOrderConnectionRepository } from './winorder-connection.repository';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderMappingRepository } from './winorder-mapping.repository';

@Injectable()
export class WinOrderMappingService {
  constructor(
    private readonly connectionService: WinOrderConnectionService,
    private readonly connectionRepository: WinOrderConnectionRepository,
    private readonly mappingRepository: WinOrderMappingRepository,
    @Inject(MENU_INTEGRATION_CATALOG_PORT)
    private readonly menuCatalog: MenuIntegrationCatalogPort,
  ) {}

  async get(user: AuthUserContext, branchId: string) {
    const scope = await this.connectionService.resolveAdminScope(
      user,
      branchId,
    );
    const connection = await this.requireConnection(scope);
    const [catalog, mappings] = await Promise.all([
      this.menuCatalog.getCatalog(scope),
      this.mappingRepository.list(scope, connection.id),
    ]);
    return {
      data: {
        catalog,
        ...mappings,
        matchingMode: 'ARTICLE_NAME' as const,
        missingCatalogKeys: [],
      },
      message: 'WinOrder mappings fetched successfully',
    };
  }

  async replaceCatalog(
    user: AuthUserContext,
    branchId: string,
    dto: ReplaceWinOrderCatalogMappingsDto,
  ) {
    const scope = await this.connectionService.resolveAdminScope(
      user,
      branchId,
      true,
    );
    const connection = await this.requireConnection(scope);
    const catalog = await this.menuCatalog.getCatalog(scope);
    const names = new Map<string, string>([
      ...catalog.items.map(
        (item) =>
          [
            item.key,
            'menuItemName' in item
              ? item.variationName
                ? `${item.menuItemName} — ${item.variationName}`
                : item.menuItemName
              : (item.dealName ?? item.packageName ?? item.key),
          ] as const,
      ),
      ...catalog.modifiers.map(
        (modifier) => [modifier.key, modifier.name] as const,
      ),
      ['service_charge', 'Service charge'],
    ]);
    const uniqueKeys = new Set<string>();
    const mappings = dto.mappings.map((mapping) => {
      const expectedType =
        mapping.localKey.startsWith('item:') ||
        mapping.localKey.startsWith('deal:') ||
        mapping.localKey.startsWith('package:')
          ? WinOrderCatalogMappingType.ITEM
          : mapping.localKey.startsWith('modifier:')
            ? WinOrderCatalogMappingType.MODIFIER
            : WinOrderCatalogMappingType.SERVICE_CHARGE;
      const canonicalName =
        names.get(mapping.localKey) ??
        this.resolveLegacyDealName(mapping.localKey, names);
      if (
        !canonicalName ||
        expectedType !== mapping.mappingType ||
        uniqueKeys.has(`${mapping.mappingType}:${mapping.localKey}`)
      ) {
        throw new BadRequestException(
          `Invalid or duplicate catalog mapping key: ${mapping.localKey}`,
        );
      }
      const externalArticleNo = mapping.externalArticleNo?.trim() || null;
      const externalArticleName = mapping.externalArticleName?.trim() || null;
      if (!externalArticleNo && !externalArticleName) {
        throw new BadRequestException(
          `Catalog mapping requires a WinOrder name or article number: ${mapping.localKey}`,
        );
      }
      uniqueKeys.add(`${mapping.mappingType}:${mapping.localKey}`);
      return {
        mappingType: mapping.mappingType,
        localKey: mapping.localKey,
        localName: canonicalName,
        externalArticleNo,
        externalArticleName,
      };
    });

    await this.mappingRepository.replaceCatalog(scope, connection.id, mappings);
    return this.get(user, branchId);
  }

  async replacePayments(
    user: AuthUserContext,
    branchId: string,
    dto: ReplaceWinOrderPaymentMappingsDto,
  ) {
    const scope = await this.connectionService.resolveAdminScope(
      user,
      branchId,
      true,
    );
    const connection = await this.requireConnection(scope);
    const uniqueMethods = new Set(
      dto.mappings.map((item) => item.paymentMethod),
    );
    if (uniqueMethods.size !== dto.mappings.length) {
      throw new BadRequestException('Duplicate payment mapping');
    }
    await this.mappingRepository.replacePayments(
      scope,
      connection.id,
      dto.mappings,
    );
    return this.get(user, branchId);
  }

  private resolveLegacyDealName(
    localKey: string,
    names: ReadonlyMap<string, string>,
  ): string | undefined {
    const match = /^(deal|package):(.+)$/.exec(localKey);
    if (!match) {
      return undefined;
    }
    const alternatePrefix = match[1] === 'deal' ? 'package' : 'deal';
    return names.get(`${alternatePrefix}:${match[2]}`);
  }

  private async requireConnection(scope: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
  }) {
    const connection = await this.connectionRepository.findByBranch(scope);
    if (!connection) {
      throw new NotFoundException('WinOrder connection not found');
    }
    return connection;
  }
}
