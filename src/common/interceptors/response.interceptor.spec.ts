import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { RAW_RESPONSE_METADATA_KEY } from '../decorators';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const handler = () => undefined;
  const controller = class TestController {};
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;

  const handlePayload = async (payload: unknown) => {
    const handler: CallHandler = {
      handle: () => of(payload),
    };

    return new Promise((resolve, reject) => {
      interceptor.intercept(context, handler).subscribe({
        next: resolve,
        error: reject,
      });
    });
  };

  it('wraps regular payloads in the success envelope', async () => {
    await expect(handlePayload({ data: { id: 'sample' } })).resolves.toEqual({
      success: true,
      data: { id: 'sample' },
      message: 'Request successful',
      meta: undefined,
    });
  });

  it('does not wrap streamable file downloads', async () => {
    const file = new StreamableFile(Buffer.from('restaurantId,name\n'));

    await expect(handlePayload(file)).resolves.toBe(file);
  });

  it('preserves raw machine API response contracts', async () => {
    Reflect.defineMetadata(RAW_RESPONSE_METADATA_KEY, true, handler);

    await expect(
      handlePayload({ OrderList: { Order: [{ OrderID: 'order-1' }] } }),
    ).resolves.toEqual({
      OrderList: { Order: [{ OrderID: 'order-1' }] },
    });

    Reflect.deleteMetadata(RAW_RESPONSE_METADATA_KEY, handler);
  });
});
