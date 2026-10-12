import { WinOrderMachineController } from './winorder-machine.controller';
import { RAW_RESPONSE_METADATA_KEY } from '../../common/decorators';
import { WinOrderRateLimitException } from './winorder-admission.service';

describe('WinOrderMachineController', () => {
  const machine = {
    connectionId: 'connection-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    storeId: 41,
  };

  it('returns the vendor machine contract without the platform envelope', () => {
    expect(
      Reflect.getMetadata(RAW_RESPONSE_METADATA_KEY, WinOrderMachineController),
    ).toBe(true);
  });

  const makeController = () => {
    const pollingService = { getNewOrders: jest.fn() };
    const statusService = { process: jest.fn() };
    const connectionService = { assertStoreRoute: jest.fn() };
    const admission = {
      executePoll: jest.fn(
        async (_connectionId: string, work: () => Promise<unknown>) => work(),
      ),
    };
    return {
      controller: new WinOrderMachineController(
        pollingService as never,
        statusService as never,
        connectionService as never,
        admission as never,
      ),
      pollingService,
      statusService,
      connectionService,
      admission,
    };
  };

  it('validates the Store ID before polling orders', async () => {
    const { controller, pollingService, connectionService } = makeController();

    await controller.getNewOrders(machine, { storeId: 41 }, {
      setHeader: jest.fn(),
    } as never);

    expect(connectionService.assertStoreRoute).toHaveBeenCalledWith(
      machine,
      41,
    );
    expect(pollingService.getNewOrders).toHaveBeenCalledWith(machine);
  });

  it('returns Retry-After when per-connection poll admission rejects work', async () => {
    const { controller, admission, pollingService } = makeController();
    const response = { setHeader: jest.fn() };
    admission.executePoll.mockRejectedValueOnce(
      new WinOrderRateLimitException(12),
    );

    await expect(
      controller.getNewOrders(machine, { storeId: 41 }, response as never),
    ).rejects.toBeInstanceOf(WinOrderRateLimitException);

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '12');
    expect(pollingService.getNewOrders).not.toHaveBeenCalled();
  });

  it('validates the Store ID before processing a tracking callback', async () => {
    const { controller, statusService, connectionService } = makeController();
    const dto = { ordersid: 'order-1', trackingstatus: '1' };

    await controller.sendTrackingStatus(
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
