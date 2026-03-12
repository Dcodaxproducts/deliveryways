import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database';
import { AuthUserContext } from '../../common/decorators';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
import {
  ChangePasswordDto,
  DevBootstrapSuperAdminDto,
  DevTokenDto,
  ForgotPasswordDto,
  ListCustomersDto,
  LoginDto,
  RefreshDto,
  RegisterCustomerDto,
  RegisterTenantDto,
  ResendVerificationDto,
  ResetPasswordDto,
  UpdateMyAvatarDto,
  VerifyEmailDto,
} from './dto';
import { TenantsService } from '../tenants/tenants.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { BranchesService } from '../branches/branches.service';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tenantsService: TenantsService,
    private readonly restaurantsService: RestaurantsService,
    private readonly branchesService: BranchesService,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
  ) {}

  async registerTenant(dto: RegisterTenantDto) {
    const existing = await this.usersService.findByEmail(dto.user.email);
    if (existing) {
      throw new BadRequestException('User already exists');
    }

    const existingTenant = await this.tenantsService.findBySlug(
      dto.tenant.slug,
    );
    if (existingTenant) {
      throw new ConflictException('Tenant slug already exists');
    }

    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldAutoVerifyUser = this.shouldAutoVerifyUser(emailEnabled);
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const verificationToken = this.generateToken();

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await this.tenantsService.create(
        {
          name: dto.tenant.name,
          slug: dto.tenant.slug,
          bio: dto.tenant.bio,
          logoUrl: dto.tenant.logoUrl,
          socialLinks: dto.tenant.socialLinks,
          settings: dto.tenant.settings,
        },
        tx,
      );

      const restaurant = await this.restaurantsService.create(
        tenant.id,
        {
          name: dto.restaurant.name,
          slug: dto.restaurant.slug,
          logoUrl: dto.restaurant.logoUrl,
          customDomain: dto.restaurant.customDomain,
          bio: dto.restaurant.bio,
          tagline: dto.restaurant.tagline,
          supportContact: dto.restaurant.supportContact,
          branding: dto.restaurant.branding,
          socialMedia: dto.restaurant.socialMedia,
        },
        tx,
      );

      const defaultMainBranchSettings = {
        allowedOrderTypes: [OrderTypeEnum.DELIVERY, OrderTypeEnum.TAKEAWAY],
        allowedPaymentMethods: [PaymentMethodEnum.COD],
        deliveryConfig: {
          radiusKm: 5,
          minOrderAmount: 0,
          deliveryFee: 150,
          isFreeDelivery: false,
          freeDeliveryThreshold: 0,
        },
        automation: {
          autoAcceptOrders: false,
          estimatedPrepTime: 30,
        },
        taxation: {
          taxPercentage: 0,
        },
        contact: {
          whatsapp: dto.restaurant.supportContact?.whatsapp as
            | string
            | undefined,
          phone: dto.restaurant.supportContact?.phone as string | undefined,
        },
      };

      const branch = await this.branchesService.create(
        tenant.id,
        {
          restaurantId: restaurant.id,
          name: dto.branch.name,
          isMain: true,
          street: dto.branch.street,
          area: dto.branch.area,
          city: dto.branch.city,
          state: dto.branch.state,
          country: dto.branch.country,
          coverImage: dto.branch.coverImage,
          description: dto.branch.description,
          settings: dto.branch.settings
            ? { ...defaultMainBranchSettings, ...dto.branch.settings }
            : defaultMainBranchSettings,
        },
        tx,
      );

      const user = await this.usersService.create(
        {
          email: dto.user.email,
          password: await bcrypt.hash(dto.user.password, 10),
          role: UserRoleEnum.BUSINESS_ADMIN,
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          branchId: branch.id,
          verificationToken: shouldAutoVerifyUser
            ? undefined
            : verificationToken,
          isVerified: shouldAutoVerifyUser,
          profile: {
            firstName: dto.user.firstName,
            lastName: dto.user.lastName,
            avatarUrl: dto.user.avatarUrl,
            bio: dto.user.bio,
          },
        },
        tx,
      );

      await this.tenantsService.assignOwner(tenant.id, user.id, tx);

      return {
        ownerId: user.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        email: user.email,
      };
    });

    if (emailEnabled) {
      await this.mailerService.sendVerificationEmail(
        dto.user.email,
        verificationToken,
      );
    }

    return {
      data: {
        ...result,
        verificationToken: shouldExposeDevToken ? verificationToken : undefined,
      },
      message: shouldAutoVerifyUser
        ? 'Tenant registration completed. Email verification is disabled.'
        : 'Tenant registration initiated. Please verify your email.',
    };
  }

  async registerCustomer(dto: RegisterCustomerDto) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        id: dto.restaurantId,
        deletedAt: null,
      },
      select: {
        tenantId: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const existing = await this.usersService.findByEmail(
      dto.email,
      dto.restaurantId,
    );
    if (existing) {
      throw new BadRequestException(
        'Customer already exists for this restaurant',
      );
    }

    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldAutoVerifyUser = this.shouldAutoVerifyUser(emailEnabled);
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const verificationToken = this.generateToken();

    await this.prisma.$transaction(async (tx) => {
      await this.usersService.create(
        {
          email: dto.email,
          password: await bcrypt.hash(dto.password, 10),
          role: UserRoleEnum.CUSTOMER,
          restaurantId: dto.restaurantId,
          tenantId: restaurant.tenantId,
          verificationToken: shouldAutoVerifyUser
            ? undefined
            : verificationToken,
          isVerified: shouldAutoVerifyUser,
          profile: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
          },
        },
        tx,
      );
    });

    if (emailEnabled) {
      await this.mailerService.sendVerificationEmail(
        dto.email,
        verificationToken,
      );
    }

    return {
      data: {
        verificationToken: shouldExposeDevToken ? verificationToken : undefined,
      },
      message: shouldAutoVerifyUser
        ? 'Customer registration completed. Email verification is disabled.'
        : 'Customer registration started. Verify email with OTP.',
    };
  }

  async listCustomers(user: AuthUserContext, query: ListCustomersDto) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const scopedQuery: ListCustomersDto = { ...query };

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === UserRoleEnum.BUSINESS_ADMIN
    ) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      scopedQuery.restaurantId = user.rid;
    }

    const allowWithDeleted =
      user.role === UserRoleEnum.SUPER_ADMIN && !!scopedQuery.withDeleted;
    const { items, total } = await this.usersService.listCustomers(
      user.tid,
      scopedQuery,
      allowWithDeleted,
    );

    return {
      data: items,
      message: 'Customers fetched successfully',
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        hasNext: query.page * query.limit < total,
        hasPrevious: query.page > 1,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(
      dto.email,
      dto.restaurantId,
    );

    if (!user || user.deletedAt) {
      if (!dto.restaurantId) {
        const restaurantScopedUsersCount = await this.prisma.user.count({
          where: {
            email: dto.email,
            restaurantId: { not: null },
            deletedAt: null,
          },
        });

        if (restaurantScopedUsersCount > 0) {
          throw new BadRequestException(
            'restaurantId is required for this account',
          );
        }
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwtService.signAsync({
      uid: user.id,
      role: user.role,
      tid: user.tenantId,
      rid: user.restaurantId,
      bid: user.branchId,
    });

    const refreshToken = await this.jwtService.signAsync(
      { uid: user.id, type: 'refresh' },
      {
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as never,
        secret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.setRefreshTokenHash(user.id, refreshTokenHash);

    return {
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          restaurantId: user.restaurantId,
          branchId: user.branchId,
          profile: user.profile,
        },
      },
      message: 'Login successful',
    };
  }

  async refreshTokens(dto: RefreshDto) {
    let payload: { uid: string; type?: string };

    try {
      payload = await this.jwtService.verifyAsync<{
        uid: string;
        type?: string;
      }>(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload?.uid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const dbUser = await this.usersService.findById(payload.uid);
    if (!dbUser || !dbUser.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isValid = await bcrypt.compare(
      dto.refreshToken,
      dbUser.refreshTokenHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.jwtService.signAsync({
      uid: dbUser.id,
      role: dbUser.role,
      tid: dbUser.tenantId,
      rid: dbUser.restaurantId,
      bid: dbUser.branchId,
    });

    const refreshToken = await this.jwtService.signAsync(
      { uid: dbUser.id, type: 'refresh' },
      {
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as never,
        secret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.setRefreshTokenHash(dbUser.id, refreshTokenHash);

    return {
      data: { accessToken, refreshToken },
      message: 'Token refreshed',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const result = await this.usersService.verifyEmail(dto.email, dto.token);

    if (result.count === 0) {
      throw new BadRequestException('Invalid verification token');
    }

    return {
      data: null,
      message: 'Email verified successfully',
    };
  }

  async generateDevToken(dto: DevTokenDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'dev-token endpoint is disabled in production',
      );
    }

    const payload = {
      uid: dto.uid ?? 'dev-user-id',
      role: dto.role ?? UserRoleEnum.SUPER_ADMIN,
      tid: dto.tid,
      rid: dto.rid,
      bid: dto.bid,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      data: {
        accessToken,
        payload,
      },
      message: 'Development token generated',
    };
  }

  async bootstrapDevSuperAdmin(dto: DevBootstrapSuperAdminDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'dev-bootstrap-super-admin endpoint is disabled in production',
      );
    }

    const email =
      dto.email ??
      process.env.DEV_SUPER_ADMIN_EMAIL ??
      'superadmin@deliveryways.dev';
    const password =
      dto.password ?? process.env.DEV_SUPER_ADMIN_PASSWORD ?? 'Admin@123456';

    const existing = await this.usersService.findByEmail(email);
    const hashedPassword = await bcrypt.hash(password, 10);

    if (!existing) {
      const user = await this.usersService.create({
        email,
        password: hashedPassword,
        role: UserRoleEnum.SUPER_ADMIN,
        isVerified: true,
      });

      return {
        data: {
          id: user.id,
          email,
          password,
          role: user.role,
        },
        message: 'Super admin created successfully',
      };
    }

    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isVerified: true,
        tenantId: null,
        restaurantId: null,
        branchId: null,
        deletedAt: null,
        isActive: true,
      },
    });

    return {
      data: {
        id: updated.id,
        email,
        password,
        role: updated.role,
      },
      message: 'Super admin already existed. Credentials refreshed.',
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const token = this.generateToken();
    const result = await this.usersService.setVerificationToken(
      dto.email,
      token,
    );

    if (result.count === 0) {
      throw new NotFoundException('User not found');
    }

    if (emailEnabled) {
      await this.mailerService.sendVerificationEmail(dto.email, token);
    }

    return {
      data: {
        verificationToken: shouldExposeDevToken ? token : undefined,
      },
      message: 'Verification token resent',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    await this.ensureRestaurantIdForRestaurantScopedEmail(
      dto.email,
      dto.restaurantId,
    );

    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const token = this.generateToken();
    const result = await this.usersService.setVerificationToken(
      dto.email,
      token,
      dto.restaurantId,
    );

    if (result.count === 0) {
      return {
        data: null,
        message: 'If account exists, reset instructions are sent',
      };
    }

    if (emailEnabled) {
      await this.mailerService.sendPasswordResetEmail(dto.email, token);
    }

    return {
      data: {
        resetToken: shouldExposeDevToken ? token : undefined,
      },
      message: 'If account exists, reset instructions are sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    await this.ensureRestaurantIdForRestaurantScopedEmail(
      dto.email,
      dto.restaurantId,
    );

    const user = await this.usersService.findByEmail(
      dto.email,
      dto.restaurantId,
    );

    if (!user || user.verificationToken !== dto.token) {
      throw new BadRequestException('Invalid reset token');
    }

    await this.usersService.setVerificationToken(
      dto.email,
      null,
      dto.restaurantId,
    );
    await this.usersService.setRefreshTokenHash(user.id, null);
    await this.usersService.updatePassword(user.id, dto.newPassword);

    return {
      data: null,
      message: 'Password reset successful',
    };
  }

  async changePassword(user: AuthUserContext, dto: ChangePasswordDto) {
    const dbUser = await this.usersService.findById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    const isValidPassword = await bcrypt.compare(
      dto.currentPassword,
      dbUser.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Current password is invalid');
    }

    await this.usersService.updatePassword(dbUser.id, dto.newPassword);

    return {
      data: null,
      message: 'Password changed successfully',
    };
  }

  async me(user: AuthUserContext) {
    const dbUser = await this.usersService.findById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    return {
      data: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        tenantId: dbUser.tenantId,
        restaurantId: dbUser.restaurantId,
        branchId: dbUser.branchId,
        profile: dbUser.profile,
      },
      message: 'Current user context fetched',
    };
  }

  async updateMyAvatar(user: AuthUserContext, dto: UpdateMyAvatarDto) {
    const dbUser = await this.usersService.findById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    if (dbUser.profile) {
      await this.prisma.profile.update({
        where: { id: dbUser.profile.id },
        data: { avatarUrl: dto.avatarUrl },
      });
    } else {
      const emailPrefix = dbUser.email.split('@')[0] || 'user';
      await this.prisma.profile.create({
        data: {
          userId: dbUser.id,
          firstName: emailPrefix,
          lastName: emailPrefix,
          avatarUrl: dto.avatarUrl,
        },
      });
    }

    const updated = await this.usersService.findById(user.uid);

    return {
      data: {
        id: updated?.id,
        profile: updated?.profile,
      },
      message: 'Profile avatar updated successfully',
    };
  }

  async deleteAccount(user: AuthUserContext) {
    await this.usersService.softDeleteUser(user.uid);
    return {
      data: null,
      message: 'Account scheduled for deletion in 30 days',
    };
  }

  async cancelDeletion(user: AuthUserContext) {
    await this.usersService.cancelDeleteUser(user.uid);
    return {
      data: null,
      message: 'Account deletion canceled',
    };
  }

  private async ensureRestaurantIdForRestaurantScopedEmail(
    email: string,
    restaurantId?: string,
  ) {
    if (restaurantId) {
      return;
    }

    const restaurantScopedUsersCount = await this.prisma.user.count({
      where: {
        email,
        restaurantId: { not: null },
        deletedAt: null,
      },
    });

    if (restaurantScopedUsersCount > 0) {
      throw new BadRequestException(
        'restaurantId is required for this account',
      );
    }
  }

  private shouldAutoVerifyUser(emailEnabled: boolean): boolean {
    const isDevMode = process.env.NODE_ENV !== 'production';
    return !emailEnabled && !isDevMode;
  }

  private shouldExposeDevToken(emailEnabled: boolean): boolean {
    return !emailEnabled && process.env.NODE_ENV !== 'production';
  }

  private generateToken(): string {
    return randomBytes(16).toString('hex');
  }
}
