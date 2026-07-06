import { ForbiddenException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { UserRoleEnum } from '../../common/enums';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;

  const getConfig = (key: string, defaultValue?: number) => {
    const values: Record<string, string | number | undefined> = {
      AWS_ACCESS_KEY_ID: 'access-key',
      AWS_SECRET_ACCESS_KEY: 'secret-key',
      AWS_REGION: 'eu-west-2',
      AWS_BUCKET_NAME: 'deliveryway',
      AWS_PUBLIC_BASE_URL: 'https://deliveryway.s3.eu-west-2.amazonaws.com',
      AWS_PRESIGNED_UPLOAD_EXPIRY_SECONDS: 300,
    };

    return values[key] ?? defaultValue;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn(getConfig),
    } as unknown as ConfigService;

    service = new StorageService(configService);
    (getSignedUrl as jest.Mock).mockResolvedValue('https://signed-url.example');
    jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ $metadata: {} } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates signed view URL from stored S3 file url', async () => {
    const result = await service.resolveViewUrl(
      'https://deliveryway.s3.eu-west-2.amazonaws.com/uploads/tenant-1/restaurant-1/user-1/2026-03-16/burger.png',
      180,
    );

    expect(result).toBe('https://signed-url.example');
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it('creates signed view URL from stored S3 object key', async () => {
    const result = await service.resolveViewUrl(
      'uploads/tenant-1/restaurant-1/user-1/2026-03-16/burger.png',
      180,
    );

    expect(result).toBe('https://signed-url.example');
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it('targets WebP object uploads for image content types', async () => {
    const result = await service.createPresignedUploadUrl(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        fileName: 'burger.png',
        contentType: 'image/png',
      },
    );

    expect(result.method).toBe('PUT');
    expect(result.uploadUrl).toBe('https://signed-url.example');
    expect(result.key).toMatch(
      /^uploads\/tenant-1\/restaurant-1\/user-1\/\d{4}-\d{2}-\d{2}\/.*-burger\.webp$/,
    );
    expect(result.fileUrl).toContain(result.key);
    expect(result.headers).toEqual({ 'Content-Type': 'image/webp' });
  });

  it('targets WebP public uploads for unauthenticated business registration images', async () => {
    const result = await service.createPresignedUploadUrl(undefined, {
      fileName: 'business-logo.png',
      contentType: 'image/png',
    });

    expect(result.method).toBe('PUT');
    expect(result.uploadUrl).toBe('https://signed-url.example');
    expect(result.key).toMatch(
      /^uploads\/public\/tenant-registration\/\d{4}-\d{2}-\d{2}\/.*-business-logo\.webp$/,
    );
    expect(result.fileUrl).toContain(result.key);
    expect(result.headers).toEqual({ 'Content-Type': 'image/webp' });
  });

  it('allows PDF upload content types', async () => {
    const result = await service.createPresignedUploadUrl(
      {
        uid: 'user-2',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        fileName: 'allergens.pdf',
        contentType: 'application/pdf',
      },
    );

    expect(result.method).toBe('PUT');
    expect(result.headers).toEqual({ 'Content-Type': 'application/pdf' });
  });

  it('allows deliveryman avatar uploads scoped to the driver account', async () => {
    const result = await service.createPresignedUploadUrl(
      {
        uid: 'dm-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'DELIVERYMAN',
      },
      {
        fileName: 'avatar.png',
        contentType: 'image/png',
      },
    );

    expect(result.method).toBe('PUT');
    expect(result.key).toMatch(
      /^uploads\/tenant-1\/restaurant-1\/branch-1\/dm-1\/\d{4}-\d{2}-\d{2}\//,
    );
  });

  it('rejects non-image and non-PDF upload content types', async () => {
    await expect(
      service.createPresignedUploadUrl(
        {
          uid: 'user-2',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          fileName: 'menu.txt',
          contentType: 'text/plain',
        },
      ),
    ).rejects.toThrow('Only image and PDF uploads are supported');
  });

  it('creates presigned view URL from fileUrl for customer upload', async () => {
    const result = await service.createPresignedViewUrl(
      {
        uid: 'user-2',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        fileUrl:
          'https://deliveryway.s3.eu-west-2.amazonaws.com/uploads/tenant-1/restaurant-1/branch-1/user-2/2026-03-16/profile.png',
        expiresIn: 180,
      },
    );

    expect(result.method).toBe('GET');
    expect(result.url).toBe('https://signed-url.example');
    expect(result.key).toBe(
      'uploads/tenant-1/restaurant-1/branch-1/user-2/2026-03-16/profile.png',
    );
    expect(result.expiresIn).toBe(180);
  });

  it('blocks cross-scope delete access', async () => {
    await expect(
      service.deleteObject(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        {
          key: 'uploads/tenant-2/restaurant-9/user-9/2026-03-16/logo.png',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('resolves nested media fields with one reusable helper', async () => {
    const resolveViewUrlSpy = jest.spyOn(service, 'resolveViewUrl');

    const result = await service.resolveMediaUrlsDeep({
      profile: {
        avatarUrl:
          'https://deliveryway.s3.eu-west-2.amazonaws.com/uploads/tenant-1/user-1/avatar.png',
      },
      restaurant: {
        logoUrl:
          'https://deliveryway.s3.eu-west-2.amazonaws.com/uploads/tenant-1/restaurant-1/logo.png',
      },
      deal: {
        thumbnailUrl:
          'https://deliveryway.s3.eu-west-2.amazonaws.com/uploads/tenant-1/deals/combo.png',
      },
      items: [
        {
          imageUrl:
            'https://deliveryway.s3.eu-west-2.amazonaws.com/uploads/tenant-1/menu-items/burger.png',
        },
        {
          imageUrl:
            'https://deliveryway.s3.eu-west-2.amazonaws.com/uploads/tenant-1/menu-items/burger.png',
        },
      ],
    });

    expect(result.profile.avatarUrl).toBe('https://signed-url.example');
    expect(result.restaurant.logoUrl).toBe('https://signed-url.example');
    expect(result.deal.thumbnailUrl).toBe('https://signed-url.example');
    expect(result.items[0].imageUrl).toBe('https://signed-url.example');
    expect(result.items[1].imageUrl).toBe('https://signed-url.example');
    expect(resolveViewUrlSpy).toHaveBeenCalledTimes(4);
  });
});
