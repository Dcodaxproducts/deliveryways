import { CallHandler, ExecutionContext } from '@nestjs/common';
import { StaffActivityAction } from '@prisma/client';
import { Request, Response } from 'express';
import { firstValueFrom, of } from 'rxjs';
import { UserRoleEnum } from '../../common/enums';
import { StaffActivityInterceptor } from './staff-activity.interceptor';
import { StaffActivityLogsService } from './staff-activity-logs.service';

describe('StaffActivityInterceptor', () => {
  const record = jest.fn().mockResolvedValue(undefined);
  const service = { record } as unknown as StaffActivityLogsService;
  const interceptor = new StaffActivityInterceptor(service);

  beforeEach(() => {
    record.mockClear();
  });

  it('captures successful staff mutations without sensitive body fields', async () => {
    const request = {
      method: 'PATCH',
      originalUrl: '/api/v1/orders/order-1/status',
      params: { orderId: 'order-1' },
      query: {},
      body: {
        status: 'CONFIRMED',
        password: 'must-not-be-recorded',
        refreshToken: 'must-not-be-recorded',
      },
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
      ip: '10.0.0.2',
      get: jest.fn().mockReturnValue('Audit Test Browser'),
      user: {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
      },
    } as unknown as Request;
    const response = { statusCode: 200 } as Response;
    const context = thisContext(request, response);
    const handler = { handle: () => of({ data: { restaurantId: 'r-1' } }) };

    await firstValueFrom(
      interceptor.intercept(context, handler as CallHandler),
    );

    expect(record).toHaveBeenCalledWith({
      staffUserId: 'staff-1',
      action: StaffActivityAction.UPDATE,
      module: 'orders',
      targetType: 'orders',
      targetId: 'order-1',
      restaurantId: 'r-1',
      branchId: undefined,
      httpMethod: 'PATCH',
      requestPath: '/api/v1/orders/order-1/status',
      statusCode: 200,
      ipAddress: '203.0.113.10',
      userAgent: 'Audit Test Browser',
      changedFields: ['status'],
    });
  });

  it('captures successful public staff login from the response identity', async () => {
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/auth/staff/login',
      params: {},
      query: {},
      body: { email: 'employee@example.com', password: 'secret' },
      headers: {},
      get: jest.fn(),
    } as unknown as Request;
    const response = { statusCode: 201 } as Response;
    const context = thisContext(request, response);
    const handler = {
      handle: () =>
        of({
          data: {
            user: {
              id: 'staff-1',
              actorType: 'STAFF',
              restaurantId: 'restaurant-1',
            },
          },
        }),
    };

    await firstValueFrom(
      interceptor.intercept(context, handler as CallHandler),
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: 'staff-1',
        action: StaffActivityAction.LOGIN,
        module: 'authentication',
        restaurantId: 'restaurant-1',
        changedFields: ['email'],
      }),
    );
  });

  it('ignores routine read requests', async () => {
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/orders',
      params: {},
      query: {},
      body: {},
      headers: {},
      get: jest.fn(),
      user: {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
      },
    } as unknown as Request;
    const response = { statusCode: 200 } as Response;

    await firstValueFrom(
      interceptor.intercept(thisContext(request, response), {
        handle: () => of({ data: [] }),
      } as CallHandler),
    );

    expect(record).not.toHaveBeenCalled();
  });
});

function thisContext(request: Request, response: Response): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}
