import { WinOrderMachineController } from './winorder-machine.controller';

describe('WinOrderMachineController', () => {
  const machine = {
    connectionId: 'connection-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    storeId: 41,
  };

  const makeController = () => {
    const pollingService = { getNewOrders: jest.fn() };
    const statusService = { process: jest.fn() };
    const connectionService = { assertStoreRoute: jest.fn() };
    return {
      controller: new WinOrderMachineController(
        pollingService as never,
        statusService as never,
        connectionService as never,
      ),
      pollingService,
      statusService,
      connectionService,
    };
  };

  it('validates the Store ID before polling orders', () => {
    const { controller, pollingService, connectionService } = makeController();

    controller.getNewOrders(machine, { storeId: 41 });

    expect(connectionService.assertStoreRoute).toHaveBeenCalledWith(
      machine,
      41,
    );
    expect(pollingService.getNewOrders).toHaveBeenCalledWith(machine);
  });

  it('validates the Store ID before processing a tracking callback', () => {
    const { controller, statusService, connectionService } = makeController();
    const dto = { ordersid: 'order-1', trackingstatus: '1' };

    controller.sendTrackingStatus(
      machine,
      { storeId: 41 },
      'wo_user',
      'secret',
      dto,
    );

    expect(connectionService.assertStoreRoute).toHaveBeenCalledWith(
      machine,
      41,
    );
    expect(statusService.process).toHaveBeenCalledWith(
      machine,
      'wo_user',
      'secret',
      dto,
    );
  });
});
