import { ForbiddenException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { UserRoleEnum } from '../../common/enums';
import { StorageFolderEnum } from './dto';
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

  it('creates upload URL for business admin in allowed folder', async () => {
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
        folder: StorageFolderEnum.MENU_ITEMS,
      },
    );

    expect(result.method).toBe('PUT');
    expect(result.uploadUrl).toBe('https://signed-url.example');
    expect(result.key).toMatch(
      /^menu-items\/tenant-1\/restaurant-1\/user-1\/\d{4}-\d{2}-\d{2}\//,
    );
    expect(result.fileUrl).toContain(result.key);
  });

  it('rejects customer upload to menu-items folder', async () => {
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
          fileName: 'burger.png',
          contentType: 'image/png',
          folder: StorageFolderEnum.MENU_ITEMS,
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates presigned view URL from fileUrl for customer avatar', async () => {
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
          'https://deliveryway.s3.eu-west-2.amazonaws.com/avatars/tenant-1/restaurant-1/branch-1/user-2/2026-03-16/profile.png',
        expiresIn: 180,
      },
    );

    expect(result.method).toBe('GET');
    expect(result.url).toBe('https://signed-url.example');
    expect(result.key).toBe(
      'avatars/tenant-1/restaurant-1/branch-1/user-2/2026-03-16/profile.png',
    );
    expect(result.expiresIn).toBe(180);
  });

  it('deletes object within business admin scope', async () => {
    const sendSpy = jest.spyOn(S3Client.prototype, 'send');

    const result = await service.deleteObject(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      {
        key: 'restaurant-logos/tenant-1/restaurant-1/user-9/2026-03-16/logo.png',
      },
    );

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(result.message).toBe('File deleted successfully');
    expect(result.data.key).toBe(
      'restaurant-logos/tenant-1/restaurant-1/user-9/2026-03-16/logo.png',
    );
  });
});
