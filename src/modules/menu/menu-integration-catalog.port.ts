export const MENU_INTEGRATION_CATALOG_PORT = Symbol(
  'MENU_INTEGRATION_CATALOG_PORT',
);

export interface MenuIntegrationScope {
  tenantId: string;
  restaurantId: string;
  branchId: string;
}

export interface MenuIntegrationItemOption {
  key: string;
  menuItemId: string;
  menuItemName: string;
  variationId: string | null;
  variationName: string | null;
  sku: string | null;
  price: number;
}

export interface MenuIntegrationModifier {
  key: string;
  modifierId: string;
  name: string;
  priceDelta: number;
}

export interface MenuIntegrationCatalog {
  items: MenuIntegrationItemOption[];
  modifiers: MenuIntegrationModifier[];
}

export interface MenuIntegrationCatalogPort {
  getCatalog(scope: MenuIntegrationScope): Promise<MenuIntegrationCatalog>;
}
