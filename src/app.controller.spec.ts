import { IS_PUBLIC_KEY } from './common/decorators';
import { AppController } from './app.controller';

describe('AppController', () => {
  const controller = new AppController();

  describe('liveness', () => {
    it('returns the stable process liveness response', () => {
      expect(controller.liveness()).toEqual({
        data: {
          status: 'ok',
        },
        message: 'DeliveryWays API is live',
      });
    });

    it('is publicly accessible', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller.liveness)).toBe(
        true,
      );
    });
  });
});
