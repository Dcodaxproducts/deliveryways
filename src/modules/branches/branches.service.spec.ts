import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { BranchScheduleDayEnum } from './dto';
import { BranchesService } from './branches.service';

describe('BranchesService', () => {
  const makeService = () => {
    const repository = {
      create: jest.fn(),
      update: jest.fn(),
      listByBranchId: jest.fn(),
      listByRestaurant: jest.fn(),
      listAllByRestaurant: jest.fn(),
      findTenantIdByRestaurant: jest.fn(),
      findById: jest.fn(),
      listBranchAddresses: jest.fn(),
      findActiveCustomer: jest.fn(),
      findActiveCustomerById: jest.fn(),
      findOwnedCustomerAddress: jest.fn(),
      findActiveBranchAddress: jest.fn(),
      updateBranchAddress: jest.fn(),
      createBranchAddress: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      getDeleteSummary: jest.fn(),
      forceDelete: jest.fn(),
      transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({}),
      ),
      findStaffBranchAccess: jest.fn(),
      findBranchTenant: jest.fn(),
      findBranchRestaurant: jest.fn(),
      findRestaurantInTenant: jest.fn(),
    };

    const usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const prisma = {
      $transaction: jest.fn(),
      branch: { findUnique: jest.fn() },
      staffUser: { findUnique: jest.fn() },
    };
    repository.findStaffBranchAccess.mockImplementation(
      () => prisma.staffUser.findUnique() as Promise<unknown>,
    );

    const storageService = {
      resolveViewUrl: jest.fn((value?: string | null) => value ?? null),
    };

    const service = new BranchesService(
      repository as never,
      usersService as never,
      storageService as never,
    );

    return {
      service,
      repository,
      usersService,
      prisma,
      storageService,
    };
  };

  it('updates branch address fields through branch update endpoint', async () => {
    const { service, repository, prisma } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Updated Branch',
    });
    repository.updateBranchAddress.mockResolvedValue({
      id: 'address-1',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        name: 'Updated Branch',
        street: 'Street 99',
        shopNumber: 'Shop 8',
        postalCode: '54000',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5700',
        lng: '74.3300',
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        name: 'Updated Branch',
      }),
      expect.any(Object),
    );
    expect(repository.updateBranchAddress).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        street: 'Street 99',
        area: 'Shop 8',
        postalCode: '54000',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      }),
      expect.any(Object),
    );
    expect(repository.createBranchAddress).not.toHaveBeenCalled();
    expect(result.message).toBe('Branch updated successfully');
  });

  it('updates order notification settings without validating unrelated branch fields', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        deliveryConfig: {
          mode: 'POSTAL_CODE',
          postalCodeRules: [],
        },
        notificationSettings: {
          notificationTypes: {
            newOrder: { sms: true },
          },
        },
      },
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      settings: {
        notificationSettings: {
          emailAddress: 'info@webandco.de',
          notificationTypes: {
            newOrder: { email: true, sms: true },
          },
        },
      },
    });

    await expect(
      service.updateNotificationSettings(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'branch-1',
        {
          emailAddress: ' Info@WebAndCo.de ',
          enabled: true,
        },
      ),
    ).resolves.toMatchObject({
      data: {
        settings: {
          notificationSettings: {
            emailAddress: 'info@webandco.de',
          },
        },
      },
    });

    expect(repository.update).toHaveBeenCalledWith('branch-1', {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      settings: expect.objectContaining({
        deliveryConfig: {
          mode: 'POSTAL_CODE',
          postalCodeRules: [],
        },
        notificationSettings: {
          emailAddress: 'info@webandco.de',
          notificationTypes: {
            newOrder: { email: true, sms: true },
          },
        },
      }),
    });
  });

  it('rejects enabling order notifications without an email address', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {},
    });

    await expect(
      service.updateNotificationSettings(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'branch-1',
        { enabled: true },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows branch admin to update assigned branch details', async () => {
    const { service, repository, prisma } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Updated Branch',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.update(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'branch-1',
      {
        name: 'Updated Branch',
        description: 'Updated branch description',
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        name: 'Updated Branch',
        description: 'Updated branch description',
      }),
      expect.any(Object),
    );
    expect(result.message).toBe('Branch updated successfully');
  });

  it('ignores branch admin payload when an assigned branch admin updates branch details', async () => {
    const { service, repository, usersService, prisma } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      managerId: null,
      manager: null,
      isActive: true,
      deletedAt: null,
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Updated Branch',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.update(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        branchId: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'branch-1',
      {
        name: 'Updated Branch',
        branchAdmin: {
          email: 'branch.admin@example.com',
          firstName: 'Branch',
          lastName: 'Admin',
        },
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({ name: 'Updated Branch' }),
      expect.any(Object),
    );
    expect(usersService.findByEmail).not.toHaveBeenCalled();
    expect(usersService.update).not.toHaveBeenCalled();
    expect(result.message).toBe('Branch updated successfully');
  });

  it('preserves opening hours when branch settings update omits them', async () => {
    const { service, repository, prisma } = makeService();
    const existingOpeningHours = [
      {
        dayOfWeek: BranchScheduleDayEnum.MONDAY,
        isClosed: false,
        openTime: '09:00',
        closeTime: '22:00',
      },
    ];
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        openingHours: existingOpeningHours,
        contact: { phone: '123' },
      },
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Updated Branch',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        settings: {
          contact: { phone: '456' },
        } as never,
      },
    );

    const updateCalls = repository.update.mock.calls as Array<
      [
        string,
        {
          settings?: {
            contact?: { phone?: string };
            openingHours?: typeof existingOpeningHours;
          };
        },
        unknown,
      ]
    >;
    const updatePayload = updateCalls[0]?.[1] as {
      settings?: {
        contact?: { phone?: string };
        openingHours?: typeof existingOpeningHours;
      };
    };
    expect(updatePayload.settings?.contact?.phone).toBe('456');
    expect(updatePayload.settings?.openingHours).toEqual(existingOpeningHours);
  });

  it('hides and ignores service charge for branch settings outside super admin', async () => {
    const { service, repository, prisma } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        contact: { phone: '123' },
        serviceCharge: { isEnabled: true, type: 'PERCENTAGE', value: 5 },
      },
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Updated Branch',
      settings: {
        contact: { phone: '456' },
        serviceCharge: { isEnabled: false, type: 'AMOUNT', value: 10 },
      },
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BRANCH_ADMIN,
        rid: 'restaurant-1',
        bid: 'branch-1',
      },
      'branch-1',
      {
        settings: {
          contact: { phone: '456' },
          serviceCharge: { isEnabled: false, type: 'AMOUNT', value: 10 },
        } as never,
      },
    );

    const updateCalls = repository.update.mock.calls as Array<
      [
        string,
        {
          settings?: {
            serviceCharge?: unknown;
            contact?: { phone?: string };
          };
        },
        unknown,
      ]
    >;
    const updatePayload = updateCalls[0]?.[1];
    expect(updatePayload.settings?.serviceCharge).toEqual({
      isEnabled: true,
      type: 'PERCENTAGE',
      value: 5,
    });
    expect(updatePayload.settings?.contact?.phone).toBe('456');
    expect(result.data.settings).not.toHaveProperty('serviceCharge');
  });

  it('updates assigned branch admin info through branch update endpoint', async () => {
    const { service, repository, usersService, prisma } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      managerId: 'branch-admin-1',
      manager: {
        id: 'branch-admin-1',
        email: 'old.branch.admin@example.com',
        profile: {
          firstName: 'Old',
          lastName: 'Admin',
          phone: '+920000000000',
        },
      },
      isActive: true,
      deletedAt: null,
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Updated Branch',
    });
    usersService.findByEmail.mockResolvedValue(null);
    usersService.update.mockResolvedValue({
      id: 'branch-admin-1',
      email: 'new.branch.admin@example.com',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.update(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        name: 'Updated Branch',
        branchAdmin: {
          email: 'new.branch.admin@example.com',
          firstName: 'New',
          lastName: 'Manager',
          phone: '+921111111111',
        },
      },
    );

    expect(usersService.update).toHaveBeenCalledWith(
      'branch-admin-1',
      expect.objectContaining({
        email: 'new.branch.admin@example.com',
        profile: {
          firstName: 'New',
          lastName: 'Manager',
          phone: '+921111111111',
        },
      }),
      expect.any(Object),
    );
    expect(result.message).toBe('Branch updated successfully');
  });

  it('allows business admin to update branch details when branch admin payload is present but no manager is assigned', async () => {
    const { service, repository, usersService, prisma } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      managerId: null,
      manager: null,
      isActive: true,
      deletedAt: null,
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'American Corner',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.update(
      {
        uid: 'business-admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        name: 'American Corner',
        branchAdmin: {
          email: 'americancorner@yopmail.com',
          firstName: 'Rames',
          lastName: 'Kanth',
          phone: '1234567898',
        },
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({ name: 'American Corner' }),
      expect.any(Object),
    );
    expect(usersService.update).not.toHaveBeenCalled();
    expect(result.message).toBe('Branch updated successfully');
  });

  it('blocks branch admin from updating another branch details', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });

    await expect(
      service.update(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'branch-2',
        {
          name: 'Other Branch',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks branch admin branch updates when token has no branch context', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });

    await expect(
      service.update(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'branch-1',
        {
          name: 'Updated Branch',
        },
      ),
    ).rejects.toThrow('Branch context is required');

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows branch admin to update assigned branch images', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      logoUrl: 'branches/branch-1/logo.png',
      coverImage: 'branches/branch-1/cover.png',
    });

    const result = await service.updateImages(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'branch-1',
      {
        logoUrl: 'branches/branch-1/logo.png',
        coverImage: 'branches/branch-1/cover.png',
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        logoUrl: 'branches/branch-1/logo.png',
        coverImage: 'branches/branch-1/cover.png',
      }),
      undefined,
    );
    expect(result.message).toBe('Branch images updated successfully');
  });

  it('blocks branch admin from updating another branch images', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });

    await expect(
      service.updateImages(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'branch-2',
        {
          logoUrl: 'branches/branch-2/logo.png',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects overlapping zone bands during branch update', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });

    await expect(
      service.update(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'branch-1',
        {
          settings: {
            allowedOrderTypes: [],
            allowedPaymentMethods: [],
            deliveryConfig: {
              mode: 'ZONE_BANDS',
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 100,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
              zones: [],
              zoneBands: [
                { fromKm: 0, toKm: 2, deliveryFee: 100 },
                { fromKm: 1.5, toKm: 4, deliveryFee: 180 },
              ],
              postalCodeRules: [],
            },
            automation: { autoAcceptOrders: false, estimatedPrepTime: 20 },
            taxation: { taxPercentage: 0 },
          },
        },
      ),
    ).rejects.toThrow('zoneBands cannot overlap');
  });

  it('rejects duplicate postal-code delivery rules during branch update', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
    });

    await expect(
      service.update(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'branch-1',
        {
          settings: {
            allowedOrderTypes: [],
            allowedPaymentMethods: [],
            deliveryConfig: {
              mode: 'POSTAL_CODE',
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 100,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
              zones: [],
              zoneBands: [],
              postalCodeRules: [
                { postalCode: '54000', deliveryFee: 100 },
                { postalCode: ' 54000 ', deliveryFee: 150 },
              ],
            },
            automation: { autoAcceptOrders: false, estimatedPrepTime: 20 },
            taxation: { taxPercentage: 0 },
          },
        },
      ),
    ).rejects.toThrow('postalCodeRules cannot have duplicates');
  });

  it('creates branch for business admin without requiring restaurantId in body', async () => {
    const { service, repository, usersService } = makeService();
    repository.create.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
    });
    usersService.findByEmail.mockResolvedValue(null);

    const result = await service.createFromUser(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        name: 'Main Branch',
        street: 'Street 12',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5204',
        lng: '74.3587',
        settings: {
          deliveryTime: 45,
          deliveryIntervalMinutes: 15,
          pickupIntervalMinutes: 10,
          allowedOrderTypes: [],
          allowedPaymentMethods: [],
          deliveryConfig: {
            radiusKm: 5,
            minOrderAmount: 0,
            deliveryFee: 100,
            isFreeDelivery: false,
          },
          automation: { autoAcceptOrders: false, estimatedPrepTime: 20 },
          taxation: { taxPercentage: 0 },
        },
      },
    );

    const [createPayload] = repository.create.mock.calls[0] as [
      {
        tenantId: string;
        restaurantId: string;
        settings?: {
          deliveryTime?: number;
          deliveryIntervalMinutes?: number;
          pickupIntervalMinutes?: number;
        };
      },
      unknown,
    ];
    expect(createPayload).toMatchObject({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    expect(createPayload.settings?.deliveryTime).toBe(45);
    expect(createPayload.settings?.deliveryIntervalMinutes).toBe(15);
    expect(createPayload.settings?.pickupIntervalMinutes).toBe(10);
    expect(result.message).toBe('Branch created successfully');
  });

  it('creates branch admin with resolved restaurant scope for business admin', async () => {
    const { service, repository, usersService, prisma } = makeService();
    repository.create.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      name: 'Main Branch',
      managerId: 'branch-admin-1',
    });
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({
      id: 'branch-admin-1',
      email: 'branch.admin@example.com',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
    );

    const result = await service.createFromUser(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        name: 'Main Branch',
        street: 'Street 12',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5204',
        lng: '74.3587',
        branchAdmin: {
          email: 'branch.admin@example.com',
          password: 'Admin@12345',
          firstName: 'Branch',
          lastName: 'Admin',
        },
      },
    );

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: UserRoleEnum.BRANCH_ADMIN,
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      }),
      expect.any(Object),
    );
    expect(result.message).toBe('Branch and branch user created successfully');
  });

  it('fetches branch details with populated address', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
      logoUrl: null,
      coverImage: null,
      description: null,
      settings: null,
      isMain: true,
      isActive: true,
      deletedAt: null,
      managerId: 'branch-admin-1',
      manager: {
        id: 'branch-admin-1',
        email: 'branch.admin@example.com',
        role: UserRoleEnum.BRANCH_ADMIN,
        isActive: true,
        profile: {
          firstName: 'Branch',
          lastName: 'Admin',
          phone: '+49123456789',
          avatarUrl: null,
        },
      },
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
    });
    repository.listBranchAddresses.mockResolvedValue([
      {
        referenceId: 'branch-1',
        lat: 31.5204,
        lng: 74.3587,
        street: 'Street 1',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
    ]);

    const result = await service.details(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'branch-1',
    );

    expect(repository.findById).toHaveBeenCalledWith('branch-1');
    expect(
      (result.data as { address?: { city: string } | null }).address?.city,
    ).toBe('Lahore');
    expect(result.data).toEqual(
      expect.objectContaining({
        branchAdmin: {
          id: 'branch-admin-1',
          email: 'branch.admin@example.com',
          firstName: 'Branch',
          lastName: 'Admin',
          phone: '+49123456789',
        },
      }),
    );
  });

  it('allows all-restaurant staff to fetch a selected branch for editing', async () => {
    const { service, repository, prisma } = makeService();
    prisma.staffUser.findUnique.mockResolvedValue({
      restaurantId: null,
      branchId: null,
      restaurantAccess: { allRestaurants: true },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [
          { access: 'branch-management', operations: ['read', 'update'] },
        ],
        restaurantAccess: { allRestaurants: true },
        isActive: true,
        deletedAt: null,
      },
    });
    repository.findById.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-2',
      name: 'Selected Restaurant Branch',
      logoUrl: null,
      coverImage: null,
      description: null,
      settings: null,
      isMain: false,
      isActive: true,
      deletedAt: null,
      managerId: null,
      manager: null,
      restaurant: {
        id: 'restaurant-2',
        name: 'Selected Restaurant',
        slug: 'selected-restaurant',
        logoUrl: null,
        coverImage: null,
      },
    });
    repository.listBranchAddresses.mockResolvedValue([]);

    const result = await service.details(
      {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        staffRoleId: 'role-1',
      },
      'branch-2',
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'branch-2',
        restaurantId: 'restaurant-2',
      }),
    );
  });

  it('allows super admin to fetch all branches without restaurant filter', async () => {
    const { service, repository } = makeService();
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });
    repository.listBranchAddresses.mockResolvedValue([]);

    const result = await service.list(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      undefined,
      undefined,
      expect.any(Object),
      false,
      false,
      false,
    );
    expect(result.message).toBe('Branches fetched successfully');
  });

  it('uses super admin restaurant filter to resolve tenant scope', async () => {
    const { service, repository } = makeService();
    repository.findTenantIdByRestaurant.mockResolvedValue('tenant-1');
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });
    repository.listBranchAddresses.mockResolvedValue([]);

    await service.list(
      {
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        restaurantId: 'restaurant-1',
      },
    );

    expect(repository.findTenantIdByRestaurant).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      'tenant-1',
      'restaurant-1',
      expect.any(Object),
      false,
      false,
      false,
    );
  });

  it('forces customer branch list to token restaurant scope', async () => {
    const { service, repository } = makeService();
    repository.listByRestaurant.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          name: 'Main',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          logoUrl: null,
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
      ],
      total: 1,
    });
    repository.listBranchAddresses.mockResolvedValue([
      {
        referenceId: 'branch-1',
        lat: 31.5204,
        lng: 74.3587,
        street: 'Street 1',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
    ]);

    const result = await service.list(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      'tenant-1',
      'restaurant-1',
      expect.any(Object),
      false,
      false,
      false,
    );
    expect(
      (result.data[0] as { address?: { city: string } | null }).address?.city,
    ).toBe('Lahore');
  });

  it('rejects customer access to another restaurant', async () => {
    const { service } = makeService();

    await expect(
      service.list(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          restaurantId: 'restaurant-2',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows staff with branch management read permission to list assigned restaurant branches', async () => {
    const { service, repository, prisma } = makeService();
    prisma.staffUser.findUnique.mockResolvedValue({
      restaurantId: null,
      branchId: null,
      restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [
          {
            access: 'branch_management',
            operations: ['read', 'write', 'create', 'update', 'delete'],
          },
        ],
        restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
        isActive: true,
        deletedAt: null,
      },
    });
    repository.findTenantIdByRestaurant.mockResolvedValue('tenant-1');
    repository.listByRestaurant.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          name: 'Main',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          logoUrl: null,
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
      ],
      total: 1,
    });
    repository.listBranchAddresses.mockResolvedValue([]);

    const result = await service.list(
      {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        ownerUserId: 'owner-1',
        staffRoleId: 'role-1',
        panelType: 'SUPER_ADMIN',
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'ASC',
        restaurantId: 'restaurant-1',
      },
    );

    expect(repository.findTenantIdByRestaurant).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      'tenant-1',
      'restaurant-1',
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
      false,
      false,
      false,
    );
    expect(result.data).toHaveLength(1);
  });

  it('filters staff branch list by assigned branch ids', async () => {
    const { service, repository, prisma } = makeService();
    prisma.staffUser.findUnique.mockResolvedValue({
      restaurantId: null,
      branchId: null,
      restaurantAccess: {
        restaurantIds: ['restaurant-1'],
        branchIds: ['branch-2'],
      },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [{ access: 'branches', operations: ['read'] }],
        restaurantAccess: null,
        isActive: true,
        deletedAt: null,
      },
    });
    repository.findTenantIdByRestaurant.mockResolvedValue('tenant-1');
    repository.listByRestaurant.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          name: 'Main',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          logoUrl: null,
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
        {
          id: 'branch-2',
          name: 'Downtown',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          logoUrl: null,
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
      ],
      total: 2,
    });
    repository.listBranchAddresses.mockResolvedValue([]);

    const result = await service.list(
      {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'ASC',
        restaurantId: 'restaurant-1',
      },
    );

    expect(result.data).toEqual([
      expect.objectContaining({ id: 'branch-2', name: 'Downtown' }),
    ]);
    expect(result.meta.total).toBe(1);
  });

  it('allows staff with branch management write permission to update an assigned branch', async () => {
    const { service, repository, prisma } = makeService();
    prisma.staffUser.findUnique.mockResolvedValue({
      restaurantId: null,
      branchId: null,
      restaurantAccess: {
        restaurantIds: ['restaurant-1'],
        branchIds: ['branch-1'],
      },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [
          { access: 'branch-management', operations: ['read', 'update'] },
        ],
        restaurantAccess: null,
        isActive: true,
        deletedAt: null,
      },
    });
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: null,
    });
    repository.update.mockResolvedValue({ id: 'branch-1' });

    await expect(
      service.updateOpeningHours(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          staffRoleId: 'role-1',
        },
        'branch-1',
        {
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: false,
              openTime: '09:00',
              closeTime: '18:00',
            },
          ],
        },
      ),
    ).resolves.toMatchObject({
      message: 'Branch opening hours updated successfully',
    });
  });

  it('rejects staff branch writes outside assigned branch ids', async () => {
    const { service, repository, prisma } = makeService();
    prisma.staffUser.findUnique.mockResolvedValue({
      restaurantId: null,
      branchId: null,
      restaurantAccess: {
        restaurantIds: ['restaurant-1'],
        branchIds: ['branch-1'],
      },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [
          { access: 'branch-management', operations: ['read', 'update'] },
        ],
        restaurantAccess: null,
        isActive: true,
        deletedAt: null,
      },
    });
    repository.findById.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: null,
    });

    await expect(
      service.updateOpeningHours(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          staffRoleId: 'role-1',
        },
        'branch-2',
        { openingHours: [] },
      ),
    ).rejects.toThrow('Staff account is not assigned to this branch');
  });

  it('rejects staff branch list without branch management read permission', async () => {
    const { service, prisma } = makeService();
    prisma.staffUser.findUnique.mockResolvedValue({
      restaurantId: null,
      branchId: null,
      restaurantAccess: { restaurantIds: ['restaurant-1'], branchIds: [] },
      isActive: true,
      deletedAt: null,
      staffRole: {
        permissions: [{ access: 'orders', operations: ['read'] }],
        restaurantAccess: null,
        isActive: true,
        deletedAt: null,
      },
    });

    await expect(
      service.list(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          actorType: 'STAFF',
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'ASC',
          restaurantId: 'restaurant-1',
        },
      ),
    ).rejects.toThrow('Staff role does not allow branch access');
  });

  it('sorts branches by nearest distance using provided lat/lng', async () => {
    const { service, repository } = makeService();
    repository.listAllByRestaurant.mockResolvedValue({
      items: [
        {
          id: 'branch-1',
          name: 'Far',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          logoUrl: null,
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
        {
          id: 'branch-2',
          name: 'Near',
          createdAt: new Date(),
          updatedAt: new Date(),
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          logoUrl: null,
          coverImage: null,
          description: null,
          settings: null,
          isMain: false,
          isActive: true,
          deletedAt: null,
          managerId: null,
        },
      ],
      total: 2,
    });
    repository.listBranchAddresses.mockResolvedValue([
      {
        referenceId: 'branch-1',
        lat: 31.7,
        lng: 74.5,
        street: 'A',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
      {
        referenceId: 'branch-2',
        lat: 31.5205,
        lng: 74.3588,
        street: 'B',
        area: null,
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
      },
    ]);

    const result = await service.list(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        lat: 31.5204,
        lng: 74.3587,
      },
    );

    const firstBranch = result.data[0] as {
      id: string;
      distanceKm?: number | null;
    };
    expect(firstBranch.id).toBe('branch-2');
    expect(firstBranch.distanceKm).not.toBeNull();
    expect(repository.listAllByRestaurant).toHaveBeenCalled();
  });

  it('requires lat and lng together for nearest branch fetch', async () => {
    const { service } = makeService();

    await expect(
      service.list(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          lat: 31.5204,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gets branch opening hours from branch settings', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: false,
            openTime: '09:00',
            closeTime: '22:00',
          },
        ],
      },
    });

    const result = await service.getOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
    );

    expect(result.data).toEqual([
      {
        dayOfWeek: BranchScheduleDayEnum.MONDAY,
        isClosed: false,
        openTime: '09:00',
        closeTime: '22:00',
      },
    ]);
  });

  it('updates branch opening hours for business admin within tenant scope', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: { contact: { phone: '123' }, deliveryTime: 30 },
    });
    repository.update.mockResolvedValue({ id: 'branch-1' });

    const result = await service.updateOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.TUESDAY,
            isClosed: false,
            openTime: '10:00',
            closeTime: '21:00',
          },
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: true,
          },
        ],
        settings: {
          contact: { phone: '3444', whatsapp: '3444' },
          deliveryTime: 45,
        },
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        settings: {
          contact: { phone: '3444', whatsapp: '3444' },
          deliveryTime: 45,
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: true,
              openTime: null,
              closeTime: null,
            },
            {
              dayOfWeek: BranchScheduleDayEnum.TUESDAY,
              isClosed: false,
              openTime: '10:00',
              closeTime: '21:00',
            },
          ],
        },
      }),
      undefined,
    );
    expect(
      (result.data as { openingHours: unknown[] }).openingHours,
    ).toHaveLength(2);
  });

  it('preserves branch opening hours when opening-hours edit omits them', async () => {
    const { service, repository } = makeService();
    const existingOpeningHours = [
      {
        dayOfWeek: BranchScheduleDayEnum.MONDAY,
        isClosed: false,
        openTime: '09:00',
        closeTime: '22:00',
      },
    ];
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        openingHours: existingOpeningHours,
        contact: { phone: '123' },
      },
    });
    repository.update.mockResolvedValue({ id: 'branch-1' });

    const result = await service.updateOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        settings: {
          contact: { phone: '456' },
        },
      },
    );

    const updateCalls = repository.update.mock.calls as Array<
      [
        string,
        {
          settings?: {
            contact?: { phone?: string };
            openingHours?: typeof existingOpeningHours;
          };
        },
        unknown?,
      ]
    >;
    const updatePayload = updateCalls[0]?.[1] as {
      settings?: {
        contact?: { phone?: string };
        openingHours?: typeof existingOpeningHours;
      };
    };
    expect(updatePayload.settings?.contact?.phone).toBe('456');
    expect(updatePayload.settings?.openingHours).toEqual(existingOpeningHours);
    expect(result.data).toEqual({
      branchId: 'branch-1',
      openingHours: existingOpeningHours,
    });
  });

  it('fetches branch delivery time from admin-managed settings', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        deliveryTime: 35,
        deliveryIntervalMinutes: 15,
        pickupIntervalMinutes: 10,
      },
    });

    const result = await service.getDeliveryTime(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
    );

    expect(result).toEqual({
      data: {
        branchId: 'branch-1',
        deliveryTime: 35,
        deliveryIntervalMinutes: 15,
        pickupIntervalMinutes: 10,
      },
      message: 'Branch delivery time fetched successfully',
    });
  });

  it('updates branch delivery time without changing other settings', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        contact: { phone: '123' },
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: false,
            openTime: '09:00',
            closeTime: '22:00',
          },
        ],
      },
    });
    repository.update.mockResolvedValue({ id: 'branch-1' });

    const result = await service.updateDeliveryTime(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'branch-1',
      {
        deliveryTime: 45,
        deliveryIntervalMinutes: 20,
        pickupIntervalMinutes: 10,
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      {
        settings: {
          contact: { phone: '123' },
          deliveryTime: 45,
          deliveryIntervalMinutes: 20,
          pickupIntervalMinutes: 10,
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: false,
              openTime: '09:00',
              closeTime: '22:00',
            },
          ],
        },
      },
      undefined,
    );
    expect(result).toEqual({
      data: {
        branchId: 'branch-1',
        deliveryTime: 45,
        deliveryIntervalMinutes: 20,
        pickupIntervalMinutes: 10,
      },
      message: 'Branch delivery time updated successfully',
    });
  });

  it('fetches branch delivery hours from admin-managed settings', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        deliveryHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.WEDNESDAY,
            isClosed: false,
            openTime: '11:00',
            closeTime: '23:00',
          },
        ],
      },
    });

    const result = await service.getDeliveryHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
    );

    expect(result).toEqual({
      data: {
        branchId: 'branch-1',
        deliveryHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.WEDNESDAY,
            isClosed: false,
            openTime: '11:00',
            closeTime: '23:00',
          },
        ],
      },
      message: 'Branch delivery hours fetched successfully',
    });
  });

  it('falls back to opening hours when branch delivery hours are not configured', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: false,
            openTime: '09:00',
            closeTime: '18:00',
          },
        ],
      },
    });

    const result = await service.getDeliveryHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
    );

    expect(result.data.deliveryHours).toEqual([
      {
        dayOfWeek: BranchScheduleDayEnum.MONDAY,
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
      },
    ]);
  });

  it('updates branch delivery hours without changing other settings', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {
        contact: { phone: '123' },
        deliveryTime: 45,
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: false,
            openTime: '09:00',
            closeTime: '22:00',
          },
        ],
      },
    });
    repository.update.mockResolvedValue({ id: 'branch-1' });

    const result = await service.updateDeliveryHours(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'branch-1',
      {
        deliveryHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.FRIDAY,
            isClosed: false,
            openTime: '12:00',
            closeTime: '20:00',
          },
          {
            dayOfWeek: BranchScheduleDayEnum.THURSDAY,
            isClosed: true,
          },
        ],
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      {
        settings: {
          contact: { phone: '123' },
          deliveryTime: 45,
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: false,
              openTime: '09:00',
              closeTime: '22:00',
            },
          ],
          deliveryHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.THURSDAY,
              isClosed: true,
              openTime: null,
              closeTime: null,
            },
            {
              dayOfWeek: BranchScheduleDayEnum.FRIDAY,
              isClosed: false,
              openTime: '12:00',
              closeTime: '20:00',
            },
          ],
        },
      },
      undefined,
    );
    expect(result).toEqual({
      data: {
        branchId: 'branch-1',
        deliveryHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.THURSDAY,
            isClosed: true,
            openTime: null,
            closeTime: null,
          },
          {
            dayOfWeek: BranchScheduleDayEnum.FRIDAY,
            isClosed: false,
            openTime: '12:00',
            closeTime: '20:00',
          },
        ],
      },
      message: 'Branch delivery hours updated successfully',
    });
  });

  it('updates branch opening hours with regular break times', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {},
    });
    repository.update.mockResolvedValue({ id: 'branch-1' });

    const result = await service.updateOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        openingHours: [
          {
            dayOfWeek: BranchScheduleDayEnum.MONDAY,
            isClosed: false,
            openTime: '09:00',
            closeTime: '22:00',
            breakTimes: [
              {
                startTime: '14:00',
                endTime: '15:00',
                note: 'Lunch break',
              },
            ],
          },
        ],
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({
        settings: {
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: false,
              openTime: '09:00',
              closeTime: '22:00',
              breakTimes: [
                {
                  startTime: '14:00',
                  endTime: '15:00',
                  note: 'Lunch break',
                },
              ],
            },
          ],
        },
      }),
      undefined,
    );
    expect(
      (result.data as { openingHours: Array<{ breakTimes?: unknown[] }> })
        .openingHours[0].breakTimes,
    ).toHaveLength(1);
  });

  it('updates date-specific holiday opening hours with notes', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: { contact: { phone: '123' } },
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      isActive: true,
      settings: {},
    });

    const result = await service.updateHolidayOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        holidayOpeningHours: [
          {
            date: '2026-12-25',
            isClosed: true,
            note: 'Christmas holiday',
          },
          {
            date: '2026-12-31',
            isClosed: false,
            openTime: '10:00',
            closeTime: '18:00',
            note: 'New year eve custom hours',
          },
        ],
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      {
        settings: {
          contact: { phone: '123' },
          holidayOpeningHours: [
            {
              date: '2026-12-25',
              isClosed: true,
              openTime: null,
              closeTime: null,
              note: 'Christmas holiday',
            },
            {
              date: '2026-12-31',
              isClosed: false,
              openTime: '10:00',
              closeTime: '18:00',
              note: 'New year eve custom hours',
            },
          ],
        },
      },
      undefined,
    );
    expect(result.message).toBe(
      'Branch holiday opening hours updated successfully',
    );
  });

  it('updates holiday opening hours with date ranges', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: {},
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      isActive: true,
      settings: {},
    });

    await service.updateHolidayOpeningHours(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        holidayOpeningHours: [
          {
            fromDate: '2026-06-17',
            toDate: '2026-06-19',
            isClosed: true,
            note: 'Eid holidays',
          },
        ],
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      {
        settings: {
          holidayOpeningHours: [
            {
              fromDate: '2026-06-17',
              toDate: '2026-06-19',
              isClosed: true,
              openTime: null,
              closeTime: null,
              note: 'Eid holidays',
            },
          ],
        },
      },
      undefined,
    );
  });

  it('blocks branch admin from updating another branch opening hours', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: null,
    });

    await expect(
      service.updateOpeningHours(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'branch-2',
        {
          openingHours: [
            {
              dayOfWeek: BranchScheduleDayEnum.MONDAY,
              isClosed: false,
              openTime: '09:00',
              closeTime: '18:00',
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves tenant automatically for public branch listing', async () => {
    const { service, repository } = makeService();
    repository.findTenantIdByRestaurant.mockResolvedValue('tenant-1');
    repository.listByRestaurant.mockResolvedValue({ items: [], total: 0 });
    repository.listBranchAddresses.mockResolvedValue([]);

    await service.listPublic({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      restaurantId: 'restaurant-1',
    });

    expect(repository.findTenantIdByRestaurant).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(repository.listByRestaurant).toHaveBeenCalledWith(
      'tenant-1',
      'restaurant-1',
      expect.any(Object),
      true,
    );
  });

  it('temporarily closes a branch with reason and reopen time', async () => {
    const { service, repository } = makeService();
    const closedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: { contact: { phone: '123' } },
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      isActive: true,
      settings: {},
    });

    const result = await service.updateTemporaryClosure(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'branch-1',
      {
        isClosed: true,
        closedUntil,
        reason: 'Kitchen maintenance',
        message: 'We are closed for maintenance',
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.any(Object),
      undefined,
    );
    const updateCalls = repository.update.mock.calls as unknown as [
      string,
      {
        settings?: {
          contact?: { phone?: string };
          temporaryClosure?: {
            isClosed?: boolean;
            closedUntil?: string | null;
            reason?: string | null;
            message?: string | null;
          };
        };
      },
      unknown,
    ][];
    const updatePayload = updateCalls[0]?.[1];
    expect(updatePayload?.settings?.contact?.phone).toBe('123');
    expect(updatePayload?.settings?.temporaryClosure).toMatchObject({
      isClosed: true,
      closedUntil,
      reason: 'Kitchen maintenance',
      message: 'We are closed for maintenance',
    });
    expect(result.data.availability).toEqual(
      expect.objectContaining({
        isAvailable: false,
        isTemporarilyClosed: true,
      }),
    );
    expect(result.message).toBe('Branch temporarily closed successfully');
  });

  it('reopens a temporarily closed branch', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      deletedAt: null,
      settings: { temporaryClosure: { isClosed: true } },
    });
    repository.update.mockResolvedValue({
      id: 'branch-1',
      isActive: true,
      settings: {},
    });

    const result = await service.updateTemporaryClosure(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'branch-1',
      { isClosed: false },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'branch-1',
      expect.any(Object),
      undefined,
    );
    const updateCalls = repository.update.mock.calls as unknown as [
      string,
      { settings?: { temporaryClosure?: { isClosed?: boolean } } },
      unknown,
    ][];
    const updatePayload = updateCalls[0]?.[1];
    expect(updatePayload?.settings?.temporaryClosure).toEqual({
      isClosed: false,
    });
    expect(result.message).toBe('Branch reopened successfully');
  });
});
