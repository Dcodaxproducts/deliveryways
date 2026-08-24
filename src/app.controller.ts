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
      message: 'FeastFlow API is live',
    };
  }

  @Public()
  @Get('/')
  root() {
    return {
      data: {
        name: 'FeastFlow API',
        status: 'online',
        docsUrl: '/docs',
        apiBasePath: '/api/v1',
      },
      message: 'FeastFlow server is running',
    };
  }
}
