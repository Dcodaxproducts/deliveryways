import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';

@Controller()
export class AppController {
  @Public()
  @Get('/health/live')
  liveness(this: void) {
    return {
      data: {
        status: 'ok',
      },
      message: 'DeliveryWays API is live',
    };
  }

  @Public()
  @Get('/')
  root() {
    return {
      data: {
        name: 'DeliveryWays API',
        status: 'online',
        docsUrl: '/docs',
        apiBasePath: '/api/v1',
      },
      message: 'DeliveryWays server is running',
    };
  }
}
