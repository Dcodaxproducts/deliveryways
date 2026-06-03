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

  it.each([
    ['menu', 'menu-import-sample.csv', 'restaurantId,name,slug,description'],
    [
      'menu-items',
      'menu-items-import-sample.csv',
      'restaurantId,categoryId,categoryIds,name',
    ],
    [
      'deliverymen',
      'deliverymen-import-sample.csv',
      'restaurantId,branchId,firstName,lastName',
    ],
    [
      'coupons',
      'coupons-import-sample.csv',
      'restaurantId,branchId,code,title',
    ],
    [
      'promotions',
      'promotions-import-sample.csv',
      'restaurantId,branchId,code,title',
    ],
    [
      'happy-hours',
      'happy-hours-import-sample.csv',
      'restaurantId,branchId,code,title',
    ],
  ])(
    'downloads %s sample as CSV instead of response envelope JSON',
    async (type, fileName, headerPrefix) => {
      const server = app.getHttpServer() as Server;
      const response = await request(server)
        .get(`/admin/import-samples/${type}/download`)
        .expect(200)
        .expect('Content-Type', /text\/csv/);

      expect(response.headers['content-disposition']).toContain(
        `attachment; filename="${fileName}"`,
      );
      expect(response.text).toContain(headerPrefix);
      expect(response.text).not.toContain('"success":true');
      expect(response.text).not.toContain('_readableState');
    },
  );
});
