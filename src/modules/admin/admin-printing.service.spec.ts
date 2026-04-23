import { ForbiddenException } from '@nestjs/common';
import { AdminPrintingService } from './admin-printing.service';

describe('AdminPrintingService', () => {
  it('returns branch settings with restaurant fallback for branch admin', async () => {
    const repository = {
      getRestaurantWithSettings: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        settings: {
          printing: {
            enabled: true,
            autoPrintOnNewOrder: true,
            printKitchenTicket: true,
            printerName: 'Restaurant Printer',
          },
        },
      }),
      getBranchWithSettings: jest.fn().mockResolvedValue({
        id: 'branch-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        settings: {
          printing: {
            printerName: 'Branch Printer',
          },
        },
      }),
    };
    const metrics = {
      getIntegrationLogs: jest.fn().mockReturnValue({ items: [] }),
    };
    const service = new AdminPrintingService(
      repository as never,
      metrics as never,
    );

    await expect(
      service.getSettings(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: 'BRANCH_ADMIN',
        } as never,
        {},
      ),
    ).resolves.toEqual({
      data: {
        scope: {
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
        },
        settings: {
          enabled: true,
          autoPrintOnNewOrder: true,
          autoPrintOnStatusChange: false,
          printCustomerReceipt: false,
          printKitchenTicket: true,
          connectionType: null,
          printerName: 'Branch Printer',
          printerTarget: null,
          deviceId: null,
          ipAddress: null,
          queueName: null,
        },
        source: 'branch',
        inheritedFromRestaurant: false,
      },
      message: 'Admin printing settings fetched successfully',
    });
  });

  it('updates restaurant printing settings for business admin restaurant scope', async () => {
    const repository = {
      getRestaurantWithSettings: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'restaurant-1',
          tenantId: 'tenant-1',
          settings: {},
        })
        .mockResolvedValueOnce({
          id: 'restaurant-1',
          tenantId: 'tenant-1',
          settings: {
            printing: {
              enabled: true,
              autoPrintOnNewOrder: true,
              printerName: 'Kitchen LAN',
            },
          },
        }),
      updateRestaurantSettings: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        settings: {
          printing: {
            enabled: true,
            autoPrintOnNewOrder: true,
            printerName: 'Kitchen LAN',
          },
        },
      }),
    };
    const metrics = {
      getIntegrationLogs: jest.fn().mockReturnValue({ items: [] }),
    };
    const service = new AdminPrintingService(
      repository as never,
      metrics as never,
    );

    const result = await service.updateSettings(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {},
      {
        enabled: true,
        autoPrintOnNewOrder: true,
        printerName: 'Kitchen LAN',
      },
    );

    expect(repository.updateRestaurantSettings).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({
        printing: expect.objectContaining({
          enabled: true,
          autoPrintOnNewOrder: true,
          printerName: 'Kitchen LAN',
        }),
      }),
    );
    expect(result.data.settings.printerName).toBe('Kitchen LAN');
    expect(result.data.source).toBe('restaurant');
  });

  it('filters printer logs to branch scope when building status', async () => {
    const repository = {
      getRestaurantWithSettings: jest.fn().mockResolvedValue({
        id: 'restaurant-1',
        tenantId: 'tenant-1',
        settings: {},
      }),
      getBranchWithSettings: jest.fn().mockResolvedValue({
        id: 'branch-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        settings: {},
      }),
    };
    const metrics = {
      getIntegrationLogs: jest.fn().mockReturnValue({
        items: [
          {
            id: 'log-1',
            type: 'printer',
            status: 'failed',
            message: 'Printer offline',
            timestamp: '2026-04-23T05:00:00.000Z',
            meta: { restaurantId: 'restaurant-1', branchId: 'branch-1' },
          },
          {
            id: 'log-2',
            type: 'printer',
            status: 'success',
            message: 'Printed kitchen ticket',
            timestamp: '2026-04-23T04:00:00.000Z',
            meta: { restaurantId: 'restaurant-1', branchId: 'branch-1' },
          },
          {
            id: 'log-3',
            type: 'printer',
            status: 'warning',
            message: 'Other branch warning',
            timestamp: '2026-04-23T03:00:00.000Z',
            meta: { restaurantId: 'restaurant-1', branchId: 'branch-2' },
          },
        ],
      }),
    };
    const service = new AdminPrintingService(
      repository as never,
      metrics as never,
    );

    const result = await service.getStatus(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'BRANCH_ADMIN',
      } as never,
      {},
    );

    expect(result.data.health.totalEvents).toBe(2);
    expect(result.data.health.latest?.id).toBe('log-1');
    expect(result.data.health.latestErrorMessage).toBe('Printer offline');
  });

  it('forbids branch admin from querying another branch logs', async () => {
    const service = new AdminPrintingService({} as never, {
      getIntegrationLogs: jest.fn(),
    } as never);

    await expect(
      service.getLogs(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: 'BRANCH_ADMIN',
        } as never,
        { branchId: 'branch-2', limit: 20 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
