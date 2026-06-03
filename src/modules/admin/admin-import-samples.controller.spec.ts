import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import * as request from 'supertest';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { ResponseInterceptor } from '../../common/interceptors';
import { AdminImportSamplesController } from './admin-import-samples.controller';
import { AdminImportSamplesService } from './admin-import-samples.service';

describe('AdminImportSamplesController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminImportSamplesController],
      providers: [AdminImportSamplesService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('downloads menu sample as CSV instead of response envelope JSON', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server)
      .get('/admin/import-samples/menu/download')
      .expect(200)
      .expect('Content-Type', /text\/csv/);

    expect(response.text).toContain('restaurantId,name,slug,description');
    expect(response.text).not.toContain('"success":true');
  });
});
