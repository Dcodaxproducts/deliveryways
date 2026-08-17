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
    const mappedKeys = new Set(
      mappings.catalogMappings.map((mapping) => mapping.localKey),
    );

    return {
      data: {
        catalog,
        ...mappings,
        missingCatalogKeys: [
          ...catalog.items
            .filter(
              (item) =>
                !mappedKeys.has(item.key) &&
                !(
                  item.variationId &&
                  mappedKeys.has(`item:${item.menuItemId}:base`)
                ),
            )
            .map((item) => item.key),
          ...catalog.modifiers.map((modifier) => modifier.key),
        ].filter((key) => !mappedKeys.has(key)),
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
            item.variationName
              ? `${item.menuItemName} — ${item.variationName}`
              : item.menuItemName,
          ] as const,
      ),
      ...catalog.modifiers.map(
        (modifier) => [modifier.key, modifier.name] as const,
      ),
      ['service_charge', 'Service charge'],
    ]);
    const uniqueKeys = new Set<string>();
    const mappings = dto.mappings.map((mapping) => {
      const expectedType = mapping.localKey.startsWith('item:')
        ? WinOrderCatalogMappingType.ITEM
        : mapping.localKey.startsWith('modifier:')
          ? WinOrderCatalogMappingType.MODIFIER
          : WinOrderCatalogMappingType.SERVICE_CHARGE;
      if (
        !names.has(mapping.localKey) ||
        expectedType !== mapping.mappingType ||
        uniqueKeys.has(`${mapping.mappingType}:${mapping.localKey}`)
      ) {
        throw new BadRequestException(
          `Invalid or duplicate catalog mapping key: ${mapping.localKey}`,
        );
      }
      uniqueKeys.add(`${mapping.mappingType}:${mapping.localKey}`);
      return {
        ...mapping,
        localName: names.get(mapping.localKey)!,
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
