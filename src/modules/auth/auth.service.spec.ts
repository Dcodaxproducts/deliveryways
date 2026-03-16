import { NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRoleEnum } from '../../common/enums';
import { UsersService } from '../users/users.service';

describe('AuthService updateMyProfile', () => {
  let service: AuthService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let prisma: {
    profile: {
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    usersService = {
      findById: jest.fn(),
    };

    prisma = {
      profile: {
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      {} as never,
    );
  });

  it('updates existing customer profile', async () => {
    usersService
      .findById!.mockResolvedValueOnce({
        id: 'user-1',
        email: 'customer@example.com',
        profile: {
          id: 'profile-1',
          firstName: 'Old',
          lastName: 'Name',
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        profile: {
          id: 'profile-1',
          firstName: 'Bilal',
          lastName: 'Shah',
          phone: '+447700900123',
          bio: 'Updated bio',
        },
      });

    const result = await service.updateMyProfile(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        firstName: 'Bilal',
        lastName: 'Shah',
        phone: '+447700900123',
        bio: 'Updated bio',
      },
    );

    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: {
        firstName: 'Bilal',
        lastName: 'Shah',
        avatarUrl: undefined,
        phone: '+447700900123',
        bio: 'Updated bio',
      },
    });
    expect(result.message).toBe('Profile updated successfully');
  });

  it('creates profile when authenticated user has none', async () => {
    usersService
      .findById!.mockResolvedValueOnce({
        id: 'user-2',
        email: 'newcustomer@example.com',
        profile: null,
      })
      .mockResolvedValueOnce({
        id: 'user-2',
        profile: {
          id: 'profile-2',
          firstName: 'New',
          lastName: 'Customer',
          avatarUrl: 'https://cdn.example.com/avatar.png',
        },
      });

    const result = await service.updateMyProfile(
      {
        uid: 'user-2',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        firstName: 'New',
        lastName: 'Customer',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      },
    );

    expect(prisma.profile.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-2',
        firstName: 'New',
        lastName: 'Customer',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        phone: undefined,
        bio: undefined,
      },
    });
    expect(result.data.id).toBe('user-2');
  });

  it('throws when authenticated user is missing', async () => {
    usersService.findById!.mockResolvedValue(null);

    await expect(
      service.updateMyProfile(
        {
          uid: 'missing-user',
          role: UserRoleEnum.CUSTOMER,
        },
        { firstName: 'Nope' },
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
