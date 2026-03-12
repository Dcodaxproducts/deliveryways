import { Injectable } from '@nestjs/common';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { AuthService } from '../auth/auth.service';
import { RegisterTenantDto } from '../auth/dto';
import { InventoryCategoryService } from '../inventory/category/category.service';
import { InventoryItemService } from '../inventory/item/item.service';
import { MenuCategoryService } from '../menu/category/category.service';
import { MenuItemService } from '../menu/item/item.service';
import { MenuVariationService } from '../menu/variation/variation.service';
import { DevBootstrapStoreDto } from './dto';

@Injectable()
export class DevTestingService {
  constructor(
    private readonly authService: AuthService,
    private readonly menuCategoryService: MenuCategoryService,
    private readonly menuItemService: MenuItemService,
    private readonly menuVariationService: MenuVariationService,
    private readonly inventoryCategoryService: InventoryCategoryService,
    private readonly inventoryItemService: InventoryItemService,
  ) {}

  async bootstrapStore(dto: DevBootstrapStoreDto) {
    const suffix = Date.now().toString().slice(-6);
    const normalizedBase = (dto.baseName ?? 'Seed Store').trim();
    const slugBase = normalizedBase
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const ownerPassword = dto.ownerPassword ?? 'Pass@12345';
    const customerPassword = dto.customerPassword ?? 'Pass@12345';

    const registerPayload: RegisterTenantDto = {
      user: {
        email: dto.ownerEmail ?? `owner.${suffix}@deliveryways.dev`,
        password: ownerPassword,
        firstName: 'Seed',
        lastName: 'Owner',
      },
      tenant: {
        name: `${normalizedBase} Tenant`,
        slug: `${slugBase || 'seed-store'}-${suffix}`,
      },
      restaurant: {
        name: `${normalizedBase} Restaurant`,
      },
      branch: {
        name: `${normalizedBase} Main Branch`,
        street: 'Main Boulevard',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
    };

    const tenantResult = await this.authService.registerTenant(registerPayload);

    const ownerContext: AuthUserContext = {
      uid: tenantResult.data.ownerId,
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: tenantResult.data.tenantId,
      rid: tenantResult.data.restaurantId,
      bid: tenantResult.data.branchId,
    };

    const burgerCategory = await this.menuCategoryService.create(ownerContext, {
      name: 'Burgers',
      slug: `burgers-${suffix}`,
      isActive: true,
    });

    await this.menuCategoryService.create(ownerContext, {
      name: 'Drinks',
      slug: `drinks-${suffix}`,
      isActive: true,
    });

    const zingerItem = await this.menuItemService.create(ownerContext, {
      categoryId: burgerCategory.data.id,
      name: 'Zinger Burger',
      slug: `zinger-burger-${suffix}`,
      basePrice: 650,
      prepTimeMinutes: 20,
      dietaryFlags: ['NON_VEG'],
      allergenFlags: ['GLUTEN'],
      isActive: true,
    });

    await this.menuVariationService.create(ownerContext, {
      menuItemId: zingerItem.data.id,
      name: 'Large',
      price: 740,
      sortOrder: 1,
      isDefault: false,
      isActive: true,
    });

    const inventoryCategory = await this.inventoryCategoryService.create(
      ownerContext,
      {
        name: 'Protein',
        slug: `protein-${suffix}`,
        isActive: true,
      },
    );

    await this.inventoryItemService.create(ownerContext, {
      inventoryCategoryId: inventoryCategory.data.id,
      name: 'Chicken Fillet',
      sku: `CHK-${suffix}`,
      unit: 'pcs',
      currentQty: 200,
      reorderLevel: 30,
      costPerUnit: 120,
    });

    const customerEmail =
      dto.customerEmail ?? `customer.${suffix}@deliveryways.dev`;

    await this.authService.registerCustomer({
      restaurantId: tenantResult.data.restaurantId,
      email: customerEmail,
      password: customerPassword,
      firstName: 'Seed',
      lastName: 'Customer',
      phone: '+923001234567',
    });

    return {
      data: {
        owner: {
          email: registerPayload.user.email,
          password: ownerPassword,
        },
        customer: {
          email: customerEmail,
          password: customerPassword,
        },
        ids: {
          tenantId: tenantResult.data.tenantId,
          restaurantId: tenantResult.data.restaurantId,
          branchId: tenantResult.data.branchId,
          categoryId: burgerCategory.data.id,
          menuItemId: zingerItem.data.id,
        },
      },
      message: 'Development store bootstrap completed successfully',
    };
  }
}
