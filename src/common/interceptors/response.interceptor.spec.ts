import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const context = {} as ExecutionContext;

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
});
