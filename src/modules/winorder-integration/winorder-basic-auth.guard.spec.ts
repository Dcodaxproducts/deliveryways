import { ExecutionContext } from '@nestjs/common';
import { WinOrderBasicAuthGuard } from './winorder-basic-auth.guard';
import { WinOrderRateLimitException } from './winorder-admission.service';

const context = (
  request: Record<string, unknown>,
  response: { setHeader: jest.Mock },
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  }) as unknown as ExecutionContext;

describe('WinOrderBasicAuthGuard admission', () => {
  it('rejects before database and bcrypt authentication with Retry-After', async () => {
    const connectionService = { authenticate: jest.fn() };
    const admission = {
      admitPreAuthentication: jest.fn().mockReturnValue({
        allowed: false,
        retryAfterSeconds: 9,
      }),
    };
    const guard = new WinOrderBasicAuthGuard(
      connectionService as never,
      admission as never,
    );
    const response = { setHeader: jest.fn() };
    const request = {
      headers: {
        authorization: [
          'Basic',
          Buffer.from('user:' + 'pass').toString('base64'),
        ].join(' '),
      },
      ip: '198.51.100.1',
    };

    await expect(
      guard.canActivate(context(request, response)),
    ).rejects.toBeInstanceOf(WinOrderRateLimitException);
    expect(connectionService.authenticate).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '9');
  });

  it('authenticates and stores machine scope after admission', async () => {
    const machine = {
      connectionId: 'connection-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      storeId: 41,
    };
    const connectionService = {
      authenticate: jest.fn().mockResolvedValue(machine),
    };
    const admission = {
      admitPreAuthentication: jest.fn().mockReturnValue({ allowed: true }),
    };
    const guard = new WinOrderBasicAuthGuard(
      connectionService as never,
      admission as never,
    );
    const response = { setHeader: jest.fn() };
    const request: {
      headers: Record<string, string>;
      winOrderMachine?: typeof machine;
    } = {
      headers: {
        authorization: [
          'Basic',
          Buffer.from('user:' + 'pass').toString('base64'),
        ].join(' '),
      },
    };

    await expect(guard.canActivate(context(request, response))).resolves.toBe(
      true,
    );
    expect(connectionService.authenticate).toHaveBeenCalledWith('user', 'pass');
    expect(request.winOrderMachine).toEqual(machine);
  });
});
