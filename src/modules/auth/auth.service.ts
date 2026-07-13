import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  BillingInterval,
  PackageBillingModel,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../database';
import { AuthUserContext } from '../../common/decorators';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
import {
  CancelDeletionByLoginDto,
  ChangePasswordDto,
  CheckEmailRoleDto,
  CustomerDetailsQueryDto,
  DevBootstrapSuperAdminDto,
  DevTokenDto,
  DevUserDeleteDto,
  DevUserLookupDto,
  DevUserUpdateDto,
  ForceDeleteUsersDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  ListCustomersDto,
  LoginDto,
  RefreshDto,
  RegisterCustomerDto,
  RegisterGuestCustomerDto,
  RegisterTenantDto,
  OtpPurposeEnum,
  ResendOtpDto,
  ResetPasswordDto,
  UpdateMyAvatarDto,
  UpdateMyProfileDto,
  VerifyDeliverymanTwoFactorDto,
  VerifyEmailDto,
} from './dto';
import { TenantsService } from '../tenants/tenants.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { BranchesService } from '../branches/branches.service';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';
import { StaffManagementRepository } from '../staff-management/staff-management.repository';
import { StorageService } from '../storage/storage.service';

type DevUserRecord = {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
  restaurantId: string | null;
  branchId: string | null;
  isVerified: boolean;
  isApproved: boolean;
  isGuest: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  deleteAfter: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profile?: unknown;
};

type GoogleTokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  sub?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tenantsService: TenantsService,
    private readonly restaurantsService: RestaurantsService,
    private readonly branchesService: BranchesService,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
    private readonly staffManagementRepository: StaffManagementRepository,
    private readonly storageService?: StorageService,
  ) {}

  async checkEmailRole(dto: CheckEmailRoleDto) {
    const email = dto.email.trim().toLowerCase();
    const trimmedRestaurantId = dto.restaurantId?.trim();
    const restaurantId = trimmedRestaurantId?.length
      ? trimmedRestaurantId
      : undefined;
    const exists = await this.usersService.existsByEmailAndRole({
      email,
      role: dto.role,
      restaurantId: restaurantId ?? undefined,
    });

    return {
      data: {
        exists,
        email,
        role: dto.role,
        restaurantId,
      },
      message: exists
        ? 'Email already exists for this role'
        : 'Email is available for this role',
    };
  }

  async registerTenant(dto: RegisterTenantDto) {
    return this.registerTenantInternal(dto, {
      autoApproveOwner: false,
      skipEmailVerification: false,
    });
  }

  async registerTenantBySuperAdmin(
    user: AuthUserContext,
    dto: RegisterTenantDto,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admin can create tenant accounts',
      );
    }

    return this.registerTenantInternal(dto, {
      autoApproveOwner: true,
      skipEmailVerification: true,
      createdBy: user.uid,
      successMessage: 'Tenant account created by super admin.',
    });
  }

  private async registerTenantInternal(
    dto: RegisterTenantDto,
    options: {
      autoApproveOwner: boolean;
      skipEmailVerification: boolean;
      createdBy?: string;
      successMessage?: string;
    },
  ) {
    const ownerEmail = dto.user.email.trim().toLowerCase();
    const branchAdminInput = dto.branchAdmin;
    const branchAdminEmail = branchAdminInput?.email.trim().toLowerCase();
    const branchAdminPassword = branchAdminInput
      ? (branchAdminInput.password ?? this.generateBranchAdminPassword())
      : undefined;
    const existingBusinessAdmin = await this.usersService.existsByEmailAndRole({
      email: ownerEmail,
      role: UserRoleEnum.BUSINESS_ADMIN,
    });
    if (existingBusinessAdmin) {
      throw new BadRequestException('User already exists');
    }

    const existingTenant = await this.tenantsService.findBySlug(
      dto.tenant.slug,
    );
    if (existingTenant) {
      throw new ConflictException('Tenant slug already exists');
    }

    const packagePlan = await this.prisma.packagePlan.findFirst({
      where: {
        id: dto.packagePlanId,
        isActive: true,
        deletedAt: null,
      },
    });
    if (!packagePlan) {
      throw new BadRequestException('Active package plan is required');
    }

    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldAutoVerifyUser = options.skipEmailVerification
      ? true
      : this.shouldAutoVerifyUser(emailEnabled);
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const verificationOtp = shouldAutoVerifyUser ? null : this.generateOtp();
    const verificationOtpExpiresAt = shouldAutoVerifyUser
      ? null
      : this.generateOtpExpiry();

    if (!options.skipEmailVerification && emailEnabled && verificationOtp) {
      await this.ensureVerificationEmailCanBeSent(ownerEmail);
    }

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
          coverImage: dto.restaurant.coverImage,
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
        tableReservationsEnabled: false,
        tableReservationAutoAccept: false,
        tableCount: 0,
        allowedOrderTypes: [OrderTypeEnum.DELIVERY, OrderTypeEnum.TAKEAWAY],
        allowedPaymentMethods: [
          PaymentMethodEnum.COD,
          PaymentMethodEnum.CARD_ON_DELIVERY,
          PaymentMethodEnum.PAYPAL,
        ],
        deliveryConfig: {
          mode: 'RADIUS' as const,
          radiusKm: 5,
          minOrderAmount: 0,
          deliveryFee: 150,
          isFreeDelivery: false,
          freeDeliveryThreshold: 0,
          zones: [],
          zoneBands: [],
          postalCodeRules: [],
        },
        automation: {
          autoAcceptOrders: false,
          estimatedPrepTime: 30,
        },
        taxation: {
          taxPercentage: 0,
        },
        serviceCharge: {
          isEnabled: false,
          type: 'PERCENTAGE' as const,
          value: 0,
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
          shopNumber: dto.branch.shopNumber,
          area: dto.branch.area,
          postalCode: dto.branch.postalCode,
          city: dto.branch.city,
          state: dto.branch.state,
          country: dto.branch.country,
          lat: dto.branch.lat,
          lng: dto.branch.lng,
          logoUrl: dto.branch.logoUrl,
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
          email: ownerEmail,
          password: await bcrypt.hash(dto.user.password, 10),
          role: UserRoleEnum.BUSINESS_ADMIN,
          tenantId: tenant.id,
          verificationOtp: verificationOtp ?? undefined,
          verificationOtpExpiresAt: verificationOtpExpiresAt
            ? verificationOtpExpiresAt.toISOString()
            : undefined,
          verificationOtpAttempts: 0,
          isVerified: shouldAutoVerifyUser,
          isApproved: options.autoApproveOwner,
          profile: {
            firstName: dto.user.firstName,
            lastName: dto.user.lastName,
            avatarUrl: dto.user.avatarUrl,
            bio: dto.user.bio,
          },
        },
        tx,
      );

      let branchAdmin:
        | {
            id: string;
            email: string;
          }
        | undefined;

      if (branchAdminInput && branchAdminEmail && branchAdminPassword) {
        branchAdmin = await this.usersService.create(
          {
            email: branchAdminEmail,
            password: await bcrypt.hash(branchAdminPassword, 10),
            role: UserRoleEnum.BRANCH_ADMIN,
            tenantId: tenant.id,
            restaurantId: restaurant.id,
            branchId: branch.id,
            isVerified: true,
            isApproved: true,
            profile: {
              firstName: branchAdminInput.firstName,
              lastName: branchAdminInput.lastName,
              phone: branchAdminInput.phone,
            },
          },
          tx,
        );

        await tx.branch.update({
          where: { id: branch.id },
          data: {
            manager: {
              connect: {
                id: branchAdmin.id,
              },
            },
          },
        });
      }

      await this.tenantsService.assignOwner(tenant.id, user.id, tx);
      const subscriptionStartsAt = new Date();
      const subscriptionPaymentRequired =
        this.isPackagePlanPaymentRequiredNow(packagePlan);
      const subscription = await tx.tenantSubscription.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          restaurant: { connect: { id: restaurant.id } },
          packagePlan: { connect: { id: packagePlan.id } },
          status:
            packagePlan.trialDays > 0
              ? SubscriptionStatus.TRIALING
              : SubscriptionStatus.ACTIVE,
          paymentStatus: subscriptionPaymentRequired
            ? PaymentStatus.PENDING
            : PaymentStatus.PAID,
          startsAt: subscriptionStartsAt,
          nextBillingAt: this.resolvePackagePlanNextBillingAt(
            packagePlan.billingInterval,
            subscriptionStartsAt,
            packagePlan.trialDays,
          ),
          planSnapshot: this.buildPackagePlanSnapshot(packagePlan),
          note: subscriptionPaymentRequired
            ? options.autoApproveOwner
              ? 'Created by super admin. Payment required to activate selected package plan.'
              : 'Payment required to activate selected package plan.'
            : options.autoApproveOwner
              ? 'Created by super admin.'
              : 'Selected during business owner registration.',
          createdBy: options.createdBy ?? user.id,
          updatedBy: options.createdBy ?? user.id,
        },
        select: {
          id: true,
          packagePlanId: true,
          status: true,
          paymentStatus: true,
          startsAt: true,
          nextBillingAt: true,
        },
      });

      return {
        ownerId: user.id,
        branchAdminId: branchAdmin?.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        subscription,
        paymentRequiredNow: subscriptionPaymentRequired,
        email: user.email,
        branchAdminCredentials: branchAdmin
          ? {
              email: branchAdmin.email,
              password: branchAdminPassword,
            }
          : undefined,
      };
    });

    if (!options.skipEmailVerification && emailEnabled && verificationOtp) {
      await this.mailerService.sendVerificationEmail(
        ownerEmail,
        verificationOtp,
      );
    }

    const auth = await this.issueAuthTokens({
      uid: result.ownerId,
      actorType: 'USER',
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: result.tenantId,
      rid: result.restaurantId,
      bid: result.branchId,
      isGuest: false,
    });

    return {
      data: {
        ownerId: result.ownerId,
        branchAdminId: result.branchAdminId,
        tenantId: result.tenantId,
        restaurantId: result.restaurantId,
        branchId: result.branchId,
        email: result.email,
        branchAdminCredentials: result.branchAdminCredentials,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: {
          id: result.ownerId,
          email: result.email,
          role: UserRoleEnum.BUSINESS_ADMIN,
          tenantId: result.tenantId,
          restaurantId: null,
          branchId: null,
          isVerified: shouldAutoVerifyUser,
          isApproved: options.autoApproveOwner,
          isGuest: false,
        },
        subscription: {
          id: result.subscription.id,
          packagePlanId: result.subscription.packagePlanId,
          status: result.subscription.status,
          paymentStatus: result.subscription.paymentStatus,
          startsAt: result.subscription.startsAt,
          nextBillingAt: result.subscription.nextBillingAt,
          paymentRequiredNow: result.paymentRequiredNow,
          plan: {
            id: packagePlan.id,
            name: packagePlan.name,
            billingModel: packagePlan.billingModel,
            billingInterval: packagePlan.billingInterval,
            planPrice: Number(packagePlan.planPrice),
            currency: packagePlan.currency,
            trialDays: packagePlan.trialDays,
          },
        },
        verificationOtp:
          shouldExposeDevToken && !options.skipEmailVerification
            ? verificationOtp
            : undefined,
      },
      message:
        options.successMessage ??
        (shouldAutoVerifyUser
          ? 'Tenant registration completed. Email verification is disabled.'
          : 'Tenant registration completed. Verify email with OTP.'),
    };
  }

  private isPackagePlanPaymentRequiredNow(packagePlan: {
    billingModel: PackageBillingModel;
    planPrice: Prisma.Decimal;
    trialDays: number;
  }): boolean {
    if (packagePlan.trialDays > 0) {
      return false;
    }

    return (
      packagePlan.billingModel !== PackageBillingModel.COMMISSION &&
      packagePlan.planPrice.greaterThan(0)
    );
  }

  private resolvePackagePlanNextBillingAt(
    billingInterval: BillingInterval,
    startsAt: Date,
    trialDays: number,
  ): Date {
    const nextBillingAt = new Date(startsAt);
    if (trialDays > 0) {
      nextBillingAt.setDate(nextBillingAt.getDate() + trialDays);
      return nextBillingAt;
    }

    if (billingInterval === BillingInterval.YEARLY) {
      nextBillingAt.setFullYear(nextBillingAt.getFullYear() + 1);
      return nextBillingAt;
    }

    nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);
    return nextBillingAt;
  }

  private buildPackagePlanSnapshot(packagePlan: {
    id: string;
    name: string;
    billingModel: PackageBillingModel;
    billingInterval: BillingInterval;
    planPrice: Prisma.Decimal;
    commissionType: string;
    commissionPercentage: Prisma.Decimal;
    commissionFixedAmount: Prisma.Decimal;
    commissionCapAmount: Prisma.Decimal | null;
    vatPercentage: Prisma.Decimal;
    payoutCycle: string;
    currency: string;
    trialDays: number;
    features: Prisma.JsonValue | null;
  }): Prisma.InputJsonValue {
    return {
      id: packagePlan.id,
      name: packagePlan.name,
      billingModel: packagePlan.billingModel,
      billingInterval: packagePlan.billingInterval,
      planPrice: Number(packagePlan.planPrice),
      commissionType: packagePlan.commissionType,
      commissionPercentage: Number(packagePlan.commissionPercentage),
      commissionFixedAmount: Number(packagePlan.commissionFixedAmount),
      commissionCapAmount:
        packagePlan.commissionCapAmount === null
          ? null
          : Number(packagePlan.commissionCapAmount),
      vatPercentage: Number(packagePlan.vatPercentage),
      payoutCycle: packagePlan.payoutCycle,
      currency: packagePlan.currency,
      trialDays: packagePlan.trialDays,
      features: packagePlan.features,
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
      throw new BadRequestException('Email already exists');
    }

    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldAutoVerifyUser = this.shouldAutoVerifyUser(emailEnabled);
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const verificationOtp = shouldAutoVerifyUser ? null : this.generateOtp();
    const verificationOtpExpiresAt = shouldAutoVerifyUser
      ? null
      : this.generateOtpExpiry();

    if (emailEnabled && verificationOtp) {
      await this.ensureVerificationEmailCanBeSent(dto.email);
    }

    const createdUser = await this.prisma.$transaction(async (tx) => {
      return this.usersService.create(
        {
          email: dto.email,
          password: await bcrypt.hash(dto.password, 10),
          role: UserRoleEnum.CUSTOMER,
          restaurantId: dto.restaurantId,
          tenantId: restaurant.tenantId,
          verificationOtp: verificationOtp ?? undefined,
          verificationOtpExpiresAt: verificationOtpExpiresAt
            ? verificationOtpExpiresAt.toISOString()
            : undefined,
          verificationOtpAttempts: 0,
          isVerified: shouldAutoVerifyUser,
          isApproved: true,
          profile: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
          },
        },
        tx,
      );
    });

    if (emailEnabled && verificationOtp) {
      await this.mailerService.sendVerificationEmail(
        dto.email,
        verificationOtp,
      );
    }

    const auth = await this.issueAuthTokens({
      uid: createdUser.id,
      actorType: 'USER',
      role: createdUser.role,
      tid: createdUser.tenantId,
      rid: createdUser.restaurantId,
      bid: createdUser.branchId,
      isGuest: createdUser.isGuest,
    });

    return {
      data: {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: {
          id: createdUser.id,
          email: createdUser.email,
          role: createdUser.role,
          tenantId: createdUser.tenantId,
          restaurantId: createdUser.restaurantId,
          branchId: createdUser.branchId,
          isVerified: createdUser.isVerified,
          isApproved: createdUser.isApproved,
          isGuest: createdUser.isGuest,
        },
        verificationOtp: shouldExposeDevToken ? verificationOtp : undefined,
      },
      message: shouldAutoVerifyUser
        ? 'Customer registration completed. Email verification is disabled.'
        : 'Customer registration completed. Verify email with OTP.',
    };
  }

  async registerGuestCustomer(dto: RegisterGuestCustomerDto) {
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

    const guestEmail = this.generateGuestEmail(dto.restaurantId);
    const guestPassword = await bcrypt.hash(
      randomBytes(24).toString('hex'),
      10,
    );

    const createdUser = await this.prisma.$transaction(async (tx) => {
      return this.usersService.create(
        {
          email: guestEmail,
          password: guestPassword,
          role: UserRoleEnum.CUSTOMER,
          restaurantId: dto.restaurantId,
          tenantId: restaurant.tenantId,
          isVerified: true,
          isApproved: true,
          isGuest: true,
          profile: {
            firstName: dto.firstName?.trim() || 'Guest',
            lastName: dto.lastName?.trim() || 'Customer',
            phone: dto.phone,
          },
        },
        tx,
      );
    });

    const auth = await this.issueAuthTokens({
      uid: createdUser.id,
      actorType: 'USER',
      role: createdUser.role,
      tid: createdUser.tenantId,
      rid: createdUser.restaurantId,
      bid: createdUser.branchId,
      isGuest: createdUser.isGuest,
    });

    return {
      data: {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: {
          id: createdUser.id,
          email: createdUser.email,
          role: createdUser.role,
          tenantId: createdUser.tenantId,
          restaurantId: createdUser.restaurantId,
          branchId: createdUser.branchId,
          isVerified: createdUser.isVerified,
          isApproved: createdUser.isApproved,
          isActive: createdUser.isActive,
          isGuest: createdUser.isGuest,
          profile: {
            firstName: dto.firstName?.trim() || 'Guest',
            lastName: dto.lastName?.trim() || 'Customer',
            phone: dto.phone,
          },
        },
      },
      message: 'Guest customer session created successfully',
    };
  }

  async listCustomers(user: AuthUserContext, query: ListCustomersDto) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const scopedQuery: ListCustomersDto = { ...query };

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      scopedQuery.restaurantId = user.rid;
    }

    const allowWithDeleted =
      user.role === UserRoleEnum.SUPER_ADMIN && !!scopedQuery.withDeleted;
    const tenantId =
      user.role === UserRoleEnum.SUPER_ADMIN ? undefined : user.tid;
    const { items, total } = await this.usersService.listCustomers(
      tenantId,
      scopedQuery,
      allowWithDeleted,
    );

    return {
      data: await this.resolveMediaResponse(
        items.map((item) => this.withDeletionState(item)),
      ),
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

  async customerDetails(
    user: AuthUserContext,
    id: string,
    query: CustomerDetailsQueryDto,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const restaurantId =
      user.role === UserRoleEnum.SUPER_ADMIN ? query.restaurantId : user.rid;

    if (
      (user.role === UserRoleEnum.BRANCH_ADMIN ||
        user.role === UserRoleEnum.BUSINESS_ADMIN) &&
      !restaurantId
    ) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const customer = await this.usersService.findCustomerById(id, {
      tenantId: user.role === UserRoleEnum.SUPER_ADMIN ? undefined : user.tid,
      restaurantId,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return {
      data: await this.resolveMediaResponse(this.withDeletionState(customer)),
      message: 'Customer fetched successfully',
    };
  }

  async forceDeleteUsers(_user: AuthUserContext, dto: ForceDeleteUsersDto) {
    const emails = [
      ...new Set(dto.emails.map((email) => email.trim().toLowerCase())),
    ];
    const result = await this.usersService.forceDeleteUsersByEmails(emails);

    return {
      data: result,
      message: 'Force delete users request processed',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.resolveLoginUser(dto);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role === 'CUSTOMER' && !dto.restaurantId) {
      throw new BadRequestException(
        'restaurantId is required for customer login',
      );
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const loginDeletionState = this.resolveRecoverableLoginState(user);

    this.assertBusinessAdminLoginAccess(user);

    if (!user.isActive && !loginDeletionState) {
      throw new ForbiddenException('Your account is inactive');
    }

    if (!loginDeletionState) {
      await this.assertAssignedBranchContext(user);
    }

    const auth = await this.issueAuthTokens({
      uid: user.id,
      actorType: 'USER',
      role: user.role,
      tid: user.tenantId,
      rid: user.restaurantId,
      bid: user.branchId,
      isGuest: user.isGuest,
    });

    return {
      data: await this.resolveMediaResponse({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          actorType: 'USER',
          tenantId: user.tenantId,
          restaurantId:
            user.role === 'BUSINESS_ADMIN' ? null : user.restaurantId,
          branchId: user.role === 'BUSINESS_ADMIN' ? null : user.branchId,
          isVerified: user.isVerified,
          isApproved: user.isApproved,
          isGuest: user.isGuest,
          profile: user.profile,
          deletionScheduled: !!loginDeletionState,
          deleteAfter: loginDeletionState?.deleteAfter ?? null,
          canCancelDeletion: !!loginDeletionState,
          deletionReason: loginDeletionState?.reason ?? null,
        },
        deletionState: loginDeletionState,
      }),
      message: loginDeletionState?.message ?? 'Login successful',
    };
  }

  async googleLogin(dto: GoogleLoginDto) {
    const tokenInfo = await this.verifyGoogleIdToken(dto.idToken);
    const email = tokenInfo.email?.trim().toLowerCase();

    if (!email) {
      throw new UnauthorizedException('Invalid Google credentials');
    }

    const user = await this.resolveLoginUser({
      email,
      restaurantId: dto.restaurantId,
      role: dto.role,
    });

    if (!user) {
      throw new UnauthorizedException(
        'No account is linked to this Google email',
      );
    }

    if (user.email.trim().toLowerCase() !== email) {
      throw new UnauthorizedException('Invalid Google credentials');
    }

    if (user.role === 'CUSTOMER' && !dto.restaurantId) {
      throw new BadRequestException(
        'restaurantId is required for customer login',
      );
    }

    const loginDeletionState = this.resolveRecoverableLoginState(user);

    this.assertBusinessAdminLoginAccess(user);

    if (!user.isActive && !loginDeletionState) {
      throw new ForbiddenException('Your account is inactive');
    }

    if (!loginDeletionState) {
      await this.assertAssignedBranchContext(user);
    }

    const auth = await this.issueAuthTokens({
      uid: user.id,
      actorType: 'USER',
      role: user.role,
      tid: user.tenantId,
      rid: user.restaurantId,
      bid: user.branchId,
      isGuest: user.isGuest,
    });

    return {
      data: await this.resolveMediaResponse({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          actorType: 'USER',
          tenantId: user.tenantId,
          restaurantId:
            user.role === 'BUSINESS_ADMIN' ? null : user.restaurantId,
          branchId: user.role === 'BUSINESS_ADMIN' ? null : user.branchId,
          isVerified: user.isVerified,
          isApproved: user.isApproved,
          isGuest: user.isGuest,
          profile: user.profile,
          deletionScheduled: !!loginDeletionState,
          deleteAfter: loginDeletionState?.deleteAfter ?? null,
          canCancelDeletion: !!loginDeletionState,
          deletionReason: loginDeletionState?.reason ?? null,
          authProvider: 'GOOGLE',
        },
        deletionState: loginDeletionState,
      }),
      message: loginDeletionState?.message ?? 'Google login successful',
    };
  }

  async cancelDeletionByLogin(dto: CancelDeletionByLoginDto) {
    const user = await this.resolveLoginUser(dto);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role === 'CUSTOMER' && !dto.restaurantId) {
      throw new BadRequestException(
        'restaurantId is required for customer login',
      );
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (
      !user.deletedAt ||
      !user.deleteAfter ||
      user.deleteAfter <= new Date()
    ) {
      throw new BadRequestException('Account is not scheduled for deletion');
    }

    await this.assertAssignedBranchContext(user);
    await this.usersService.cancelDeleteUser(user.id);

    const auth = await this.issueAuthTokens({
      uid: user.id,
      actorType: 'USER',
      role: user.role,
      tid: user.tenantId,
      rid: user.restaurantId,
      bid: user.branchId,
      isGuest: user.isGuest,
    });

    return {
      data: await this.resolveMediaResponse({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          actorType: 'USER',
          tenantId: user.tenantId,
          restaurantId:
            user.role === 'BUSINESS_ADMIN' ? null : user.restaurantId,
          branchId: user.role === 'BUSINESS_ADMIN' ? null : user.branchId,
          isVerified: user.isVerified,
          isApproved: user.isApproved,
          isGuest: user.isGuest,
          profile: user.profile,
          deletionScheduled: false,
          deleteAfter: null,
        },
      }),
      message: 'Account deletion cancelled successfully',
    };
  }

  private assertBusinessAdminLoginAccess(user: {
    role: string;
    isVerified: boolean;
    isApproved: boolean;
    isActive: boolean;
  }) {
    if (user.role !== 'BUSINESS_ADMIN') {
      return;
    }

    if (!user.isVerified) {
      throw new ForbiddenException(
        'Your tenant profile is pending verification',
      );
    }

    if (!user.isApproved) {
      throw new ForbiddenException(
        'Your tenant profile is pending super admin approval',
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your account is inactive');
    }
  }

  async loginStaff(dto: LoginDto) {
    const staff = await this.staffManagementRepository.findByEmail(
      dto.email.trim().toLowerCase(),
    );

    if (!staff || staff.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(dto.password, staff.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!staff.isActive) {
      throw new ForbiddenException('Your account is inactive');
    }

    if (
      !staff.staffRole ||
      staff.staffRole.deletedAt ||
      !staff.staffRole.isActive
    ) {
      throw new ForbiddenException('Your assigned staff role is inactive');
    }

    const auth = await this.issueAuthTokens({
      uid: staff.id,
      actorType: 'STAFF',
      role: UserRoleEnum.STAFF,
      tid: staff.tenantId,
      rid: staff.restaurantId,
      bid: staff.branchId,
      ownerUserId: staff.ownerUserId,
      staffRoleId: staff.staffRoleId,
      panelType: staff.panelType,
    });

    return {
      data: await this.resolveMediaResponse({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: {
          id: staff.id,
          email: staff.email,
          role: UserRoleEnum.STAFF,
          actorType: 'STAFF',
          ownerUserId: staff.ownerUserId,
          staffRoleId: staff.staffRoleId,
          panelType: staff.panelType,
          tenantId: staff.tenantId,
          restaurantId: staff.restaurantId,
          branchId: staff.branchId,
          restaurantAccess:
            staff.restaurantAccess ?? staff.staffRole.restaurantAccess ?? null,
          isVerified: staff.isVerified,
          isApproved: staff.isApproved,
          isGuest: false,
          profile: {
            firstName: staff.firstName,
            lastName: staff.lastName,
            phone: staff.phone,
            avatarUrl: staff.avatarUrl,
            bio: staff.bio,
          },
          staffRole: staff.staffRole,
        },
      }),
      message: 'Staff login successful',
    };
  }

  async loginDeliveryman(dto: LoginDto) {
    const deliveryman = await this.prisma.deliveryman.findFirst({
      where: {
        email: dto.email.trim().toLowerCase(),
        deletedAt: null,
      },
    });

    if (!deliveryman?.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(
      dto.password,
      deliveryman.password,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!deliveryman.isActive) {
      throw new ForbiddenException('Your account is inactive');
    }

    if (deliveryman.twoFactorEnabled) {
      const otp = this.generateOtp();
      const expiresAt = this.generateOtpExpiry();
      const emailEnabled = process.env.EMAIL_ENABLED === 'true';
      const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);

      await this.prisma.deliveryman.update({
        where: { id: deliveryman.id },
        data: {
          twoFactorOtp: otp,
          twoFactorOtpExpiresAt: expiresAt,
          twoFactorOtpAttempts: 0,
        },
      });

      if (emailEnabled) {
        await this.mailerService.sendEmail(
          deliveryman.email,
          'Deliveryman login verification',
          `Your deliveryman login OTP is: ${otp}. It expires in 10 minutes.`,
        );
      }

      return {
        data: {
          requiresTwoFactor: true,
          twoFactorToken: await this.issueDeliverymanTwoFactorToken(
            deliveryman.id,
          ),
          twoFactorOtp: shouldExposeDevToken ? otp : undefined,
        },
        message: 'Two-factor verification required',
      };
    }

    const auth = await this.issueAuthTokens({
      uid: deliveryman.id,
      actorType: 'DELIVERYMAN',
      role: 'DELIVERYMAN',
      tid: deliveryman.tenantId,
      rid: deliveryman.restaurantId,
      bid: deliveryman.branchId,
    });

    return {
      data: await this.resolveMediaResponse({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: this.toDeliverymanAuthUser(deliveryman),
      }),
      message: 'Deliveryman login successful',
    };
  }

  async verifyDeliverymanTwoFactor(dto: VerifyDeliverymanTwoFactorDto) {
    const payload = await this.verifyDeliverymanTwoFactorToken(
      dto.twoFactorToken,
    );
    const deliveryman = await this.prisma.deliveryman.findUnique({
      where: { id: payload.uid },
    });

    if (
      !deliveryman ||
      deliveryman.deletedAt ||
      !deliveryman.isActive ||
      !deliveryman.twoFactorEnabled
    ) {
      throw new UnauthorizedException('Invalid two-factor verification');
    }

    if (
      !deliveryman.twoFactorOtp ||
      !deliveryman.twoFactorOtpExpiresAt ||
      deliveryman.twoFactorOtpExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (deliveryman.twoFactorOtpAttempts >= 5) {
      throw new BadRequestException(
        'Too many invalid attempts. Please login again.',
      );
    }

    if (deliveryman.twoFactorOtp !== dto.otp) {
      await this.prisma.deliveryman.update({
        where: { id: deliveryman.id },
        data: { twoFactorOtpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prisma.deliveryman.update({
      where: { id: deliveryman.id },
      data: {
        twoFactorOtp: null,
        twoFactorOtpExpiresAt: null,
        twoFactorOtpAttempts: 0,
      },
    });

    const auth = await this.issueAuthTokens({
      uid: deliveryman.id,
      actorType: 'DELIVERYMAN',
      role: 'DELIVERYMAN',
      tid: deliveryman.tenantId,
      rid: deliveryman.restaurantId,
      bid: deliveryman.branchId,
    });

    return {
      data: await this.resolveMediaResponse({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: this.toDeliverymanAuthUser(deliveryman),
      }),
      message: 'Deliveryman login successful',
    };
  }

  async logout(user: AuthUserContext) {
    if (user.actorType === 'STAFF') {
      const staff = await this.staffManagementRepository.findById(user.uid);

      if (!staff || staff.deletedAt) {
        throw new NotFoundException('Staff account not found');
      }

      await this.staffManagementRepository.update(user.uid, {
        refreshTokenHash: null,
      });

      return {
        data: null,
        message: 'Logout successful',
      };
    }

    if (user.actorType === 'DELIVERYMAN') {
      const deliveryman = await this.prisma.deliveryman.findUnique({
        where: { id: user.uid },
      });

      if (!deliveryman || deliveryman.deletedAt) {
        throw new NotFoundException('Deliveryman account not found');
      }

      await this.prisma.deliveryman.update({
        where: { id: user.uid },
        data: { refreshTokenHash: null },
      });

      return {
        data: null,
        message: 'Logout successful',
      };
    }

    const dbUser = await this.usersService.findById(user.uid);

    if (!dbUser || dbUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    await this.usersService.setRefreshTokenHash(user.uid, null);

    return {
      data: null,
      message: 'Logout successful',
    };
  }

  async refreshTokens(dto: RefreshDto) {
    let payload: {
      uid: string;
      type?: string;
      actorType?: 'USER' | 'STAFF' | 'DELIVERYMAN';
    };

    try {
      payload = await this.jwtService.verifyAsync<{
        uid: string;
        type?: string;
        actorType?: 'USER' | 'STAFF' | 'DELIVERYMAN';
      }>(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload?.uid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.actorType === 'STAFF') {
      const staff = await this.staffManagementRepository.findById(payload.uid);
      if (!staff || !staff.refreshTokenHash || staff.deletedAt) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(
        dto.refreshToken,
        staff.refreshTokenHash,
      );
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const auth = await this.issueAuthTokens({
        uid: staff.id,
        actorType: 'STAFF',
        role: UserRoleEnum.STAFF,
        tid: staff.tenantId,
        rid: staff.restaurantId,
        bid: staff.branchId,
        ownerUserId: staff.ownerUserId,
        staffRoleId: staff.staffRoleId,
        panelType: staff.panelType,
      });

      return {
        data: {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
        },
        message: 'Token refreshed',
      };
    }

    if (payload.actorType === 'DELIVERYMAN') {
      const deliveryman = await this.prisma.deliveryman.findUnique({
        where: { id: payload.uid },
      });

      if (
        !deliveryman ||
        !deliveryman.refreshTokenHash ||
        deliveryman.deletedAt
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(
        dto.refreshToken,
        deliveryman.refreshTokenHash,
      );
      if (!isValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const auth = await this.issueAuthTokens({
        uid: deliveryman.id,
        actorType: 'DELIVERYMAN',
        role: 'DELIVERYMAN',
        tid: deliveryman.tenantId,
        rid: deliveryman.restaurantId,
        bid: deliveryman.branchId,
      });

      return {
        data: {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
        },
        message: 'Token refreshed',
      };
    }

    const dbUser = await this.usersService.findById(payload.uid);
    if (!dbUser || !dbUser.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.assertAssignedBranchContext(dbUser);

    const isValid = await bcrypt.compare(
      dto.refreshToken,
      dbUser.refreshTokenHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const auth = await this.issueAuthTokens({
      uid: dbUser.id,
      actorType: 'USER',
      role: dbUser.role,
      tid: dbUser.tenantId,
      rid: dbUser.restaurantId,
      bid: dbUser.branchId,
      isGuest: dbUser.isGuest,
    });

    return {
      data: { accessToken: auth.accessToken, refreshToken: auth.refreshToken },
      message: 'Token refreshed',
    };
  }

  async verifyEmail(user: AuthUserContext, dto: VerifyEmailDto) {
    const dbUser = await this.usersService.findById(user.uid);

    if (!dbUser || dbUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (dbUser.isVerified) {
      return {
        data: null,
        message: 'Email already verified',
      };
    }

    if (!dbUser.verificationOtp || !dbUser.verificationOtpExpiresAt) {
      throw new BadRequestException(
        'No active OTP found. Please request a new OTP.',
      );
    }

    if (dbUser.verificationOtpAttempts >= 5) {
      throw new BadRequestException(
        'Too many invalid attempts. Please request a new OTP.',
      );
    }

    const result = await this.usersService.verifyEmailByOtp(user.uid, dto.otp);

    if (result.count === 0) {
      await this.usersService.incrementVerificationOtpAttempts(user.uid);
      throw new BadRequestException('Invalid or expired OTP');
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
        isApproved: true,
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
        isApproved: true,
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

  async devUserDetails(query: DevUserLookupDto) {
    this.assertDevUserToolsEnabled();
    const users = await this.resolveDevUsers(query);

    return {
      data: users.map((user) => this.toDevUserResponse(user)),
      message: 'Development user details fetched',
    };
  }

  async updateDevUser(dto: DevUserUpdateDto) {
    this.assertDevUserToolsEnabled();
    const user = await this.resolveSingleDevUser(dto);
    const updateData: Prisma.UserUpdateInput = {};
    const normalizedNewEmail = dto.newEmail?.trim().toLowerCase();

    if (normalizedNewEmail && normalizedNewEmail !== user.email) {
      const existing = await this.usersService.findByEmail(
        normalizedNewEmail,
        user.restaurantId ?? undefined,
      );

      if (existing && existing.id !== user.id) {
        throw new BadRequestException(
          'A user with this email already exists in this scope',
        );
      }

      updateData.email = normalizedNewEmail;
    }

    if (dto.newPassword) {
      updateData.password = await bcrypt.hash(dto.newPassword, 10);
      updateData.refreshTokenHash = null;
    }

    if (dto.isVerified !== undefined) {
      updateData.isVerified = dto.isVerified;
    }

    if (dto.isApproved !== undefined) {
      updateData.isApproved = dto.isApproved;
    }

    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
      if (dto.isActive) {
        updateData.deletedAt = null;
        updateData.deleteAfter = null;
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: { profile: true },
    });

    if (
      dto.firstName !== undefined ||
      dto.lastName !== undefined ||
      dto.phone !== undefined
    ) {
      const emailPrefix = updatedUser.email.split('@')[0] || 'user';
      await this.prisma.profile.upsert({
        where: { userId: updatedUser.id },
        create: {
          userId: updatedUser.id,
          firstName: dto.firstName ?? emailPrefix,
          lastName: dto.lastName ?? emailPrefix,
          phone: dto.phone,
        },
        update: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
        },
      });
    }

    const refreshed = await this.usersService.findById(user.id);
    if (!refreshed) {
      throw new NotFoundException('User not found after update');
    }

    return {
      data: this.toDevUserResponse(refreshed),
      message: 'Development user updated',
    };
  }

  async deleteDevUser(dto: DevUserDeleteDto) {
    this.assertDevUserToolsEnabled();
    const user = await this.resolveSingleDevUser(dto);

    if (dto.force) {
      const result = await this.usersService.deleteManyByIds([user.id]);
      return {
        data: {
          id: user.id,
          deletedCount: result.count,
          force: true,
        },
        message: 'Development user hard-deleted',
      };
    }

    const deleted = await this.usersService.softDeleteUser(user.id);

    return {
      data: this.toDevUserResponse(deleted),
      message: 'Development user scheduled for deletion',
    };
  }

  async approveBusinessAdmin(_user: AuthUserContext, targetUserId: string) {
    const dbUser = await this.usersService.findById(targetUserId);

    if (!dbUser || dbUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (dbUser.role !== 'BUSINESS_ADMIN') {
      throw new BadRequestException(
        'Only business admin accounts can be approved',
      );
    }

    if (dbUser.isApproved && dbUser.isVerified) {
      return {
        data: {
          id: dbUser.id,
          isApproved: dbUser.isApproved,
          isVerified: dbUser.isVerified,
        },
        message: 'Business admin already approved',
      };
    }

    const updated = await this.usersService.setApprovalStatus(
      targetUserId,
      true,
    );

    return {
      data: {
        id: updated.id,
        isApproved: updated.isApproved,
        isVerified: updated.isVerified,
      },
      message: 'Business admin approved successfully',
    };
  }

  async resendVerification(user: AuthUserContext) {
    const dbUser = await this.usersService.findById(user.uid);

    if (!dbUser || dbUser.deletedAt) {
      throw new NotFoundException('User not found');
    }

    return this.issueVerificationOtp({
      email: dbUser.email,
      restaurantId: dbUser.restaurantId ?? undefined,
    });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    return this.issuePasswordResetOtp(dto);
  }

  async resendOtp(dto: ResendOtpDto) {
    return dto.purpose === OtpPurposeEnum.VERIFICATION
      ? this.issueVerificationOtp(dto)
      : this.issuePasswordResetOtp(dto);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(
      dto.email,
      dto.restaurantId,
    );

    if (!user) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (user.resetPasswordOtpAttempts >= 5) {
      throw new BadRequestException(
        'Too many invalid attempts. Please request a new OTP.',
      );
    }

    const isOtpValid =
      !!user.resetPasswordOtp &&
      !!user.resetPasswordOtpExpiresAt &&
      user.resetPasswordOtp === dto.otp &&
      user.resetPasswordOtpExpiresAt.getTime() >= Date.now();

    if (!isOtpValid) {
      await this.usersService.incrementPasswordResetOtpAttempts(user.id);
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.usersService.clearPasswordResetOtp(user.id);
    await this.usersService.setRefreshTokenHash(user.id, null);
    await this.usersService.updatePassword(user.id, dto.newPassword);

    return {
      data: null,
      message: 'Password reset successful',
    };
  }

  async changePassword(user: AuthUserContext, dto: ChangePasswordDto) {
    if (user.actorType === 'STAFF') {
      const staff = await this.staffManagementRepository.findById(user.uid);
      if (!staff || staff.deletedAt) {
        throw new NotFoundException('Staff account not found');
      }

      const isValidPassword = await bcrypt.compare(
        dto.currentPassword,
        staff.password,
      );

      if (!isValidPassword) {
        throw new BadRequestException('Current password is invalid');
      }

      await this.staffManagementRepository.update(staff.id, {
        password: await bcrypt.hash(dto.newPassword, 10),
      });

      return {
        data: null,
        message: 'Password changed successfully',
      };
    }

    if (user.actorType === 'DELIVERYMAN') {
      const deliveryman = await this.prisma.deliveryman.findUnique({
        where: { id: user.uid },
      });
      if (!deliveryman?.password || deliveryman.deletedAt) {
        throw new NotFoundException('Deliveryman account not found');
      }

      const isValidPassword = await bcrypt.compare(
        dto.currentPassword,
        deliveryman.password,
      );

      if (!isValidPassword) {
        throw new BadRequestException('Current password is invalid');
      }

      await this.prisma.deliveryman.update({
        where: { id: deliveryman.id },
        data: { password: await bcrypt.hash(dto.newPassword, 10) },
      });

      return {
        data: null,
        message: 'Password changed successfully',
      };
    }

    const dbUser = await this.usersService.findById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    const isValidPassword = await bcrypt.compare(
      dto.currentPassword,
      dbUser.password,
    );

    if (!isValidPassword) {
      throw new BadRequestException('Current password is invalid');
    }

    await this.usersService.updatePassword(dbUser.id, dto.newPassword);

    return {
      data: null,
      message: 'Password changed successfully',
    };
  }

  async me(user: AuthUserContext) {
    if (user.actorType === 'STAFF') {
      const staff = await this.staffManagementRepository.findById(user.uid);
      if (!staff || staff.deletedAt) {
        throw new NotFoundException('Staff account not found');
      }

      return {
        data: await this.resolveMediaResponse(
          this.withDeletionState({
            id: staff.id,
            email: staff.email,
            role: UserRoleEnum.STAFF,
            actorType: 'STAFF',
            ownerUserId: staff.ownerUserId,
            staffRoleId: staff.staffRoleId,
            panelType: staff.panelType,
            tenantId: staff.tenantId,
            restaurantId: staff.restaurantId,
            branchId: staff.branchId,
            restaurantAccess:
              staff.restaurantAccess ??
              staff.staffRole.restaurantAccess ??
              null,
            isVerified: staff.isVerified,
            isApproved: staff.isApproved,
            isGuest: false,
            profile: {
              firstName: staff.firstName,
              lastName: staff.lastName,
              phone: staff.phone,
              avatarUrl: staff.avatarUrl,
              bio: staff.bio,
            },
            staffRole: staff.staffRole,
            isActive: staff.isActive,
            deletedAt: staff.deletedAt,
          }),
        ),
        message: 'Current user context fetched',
      };
    }

    if (user.actorType === 'DELIVERYMAN') {
      const deliveryman = await this.prisma.deliveryman.findUnique({
        where: { id: user.uid },
      });
      if (!deliveryman || deliveryman.deletedAt) {
        throw new NotFoundException('Deliveryman account not found');
      }

      return {
        data: await this.resolveMediaResponse(
          this.withDeletionState({
            ...this.toDeliverymanAuthUser(deliveryman),
            isActive: deliveryman.isActive,
            deletedAt: deliveryman.deletedAt,
          }),
        ),
        message: 'Current user context fetched',
      };
    }

    const dbUser = await this.usersService.findById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    await this.assertAssignedBranchContext(dbUser);

    return {
      data: await this.resolveMediaResponse(
        this.withDeletionState({
          id: dbUser.id,
          email: dbUser.email,
          role: dbUser.role,
          actorType: 'USER',
          tenantId: dbUser.tenantId,
          restaurantId: dbUser.restaurantId,
          branchId: dbUser.branchId,
          isVerified: dbUser.isVerified,
          isApproved: dbUser.isApproved,
          isGuest: dbUser.isGuest,
          profile: dbUser.profile,
          isActive: dbUser.isActive,
          deletedAt: dbUser.deletedAt,
          deleteAfter: dbUser.deleteAfter,
        }),
      ),
      message: 'Current user context fetched',
    };
  }

  async updateMyAvatar(user: AuthUserContext, dto: UpdateMyAvatarDto) {
    return this.updateMyProfile(user, { avatarUrl: dto.avatarUrl }, true);
  }

  private toDeliverymanAuthUser(deliveryman: {
    id: string;
    email: string;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    firstName: string;
    lastName: string;
    phone: string;
    vehicleType?: string | null;
    vehicleNumber?: string | null;
    avatarUrl?: string | null;
    twoFactorEnabled?: boolean;
  }) {
    return {
      id: deliveryman.id,
      email: deliveryman.email,
      role: 'DELIVERYMAN',
      actorType: 'DELIVERYMAN',
      tenantId: deliveryman.tenantId,
      restaurantId: deliveryman.restaurantId,
      branchId: deliveryman.branchId,
      isVerified: true,
      isApproved: true,
      isGuest: false,
      profile: {
        firstName: deliveryman.firstName,
        lastName: deliveryman.lastName,
        phone: deliveryman.phone,
        avatarUrl: deliveryman.avatarUrl ?? null,
        bio: null,
      },
      vehicle: {
        type: deliveryman.vehicleType ?? null,
        number: deliveryman.vehicleNumber ?? null,
      },
      twoFactorEnabled: deliveryman.twoFactorEnabled ?? false,
    };
  }

  async updateMyProfile(
    user: AuthUserContext,
    dto: UpdateMyProfileDto,
    avatarOnly = false,
  ) {
    if (user.actorType === 'STAFF') {
      const staff = await this.staffManagementRepository.findById(user.uid);
      if (!staff || staff.deletedAt) {
        throw new NotFoundException('Staff account not found');
      }

      const emailPrefix = staff.email.split('@')[0] || 'staff';
      const updated = await this.staffManagementRepository.update(staff.id, {
        firstName: dto.firstName ?? staff.firstName ?? emailPrefix,
        lastName: dto.lastName ?? staff.lastName ?? emailPrefix,
        avatarUrl: dto.avatarUrl,
        phone: dto.phone,
        bio: dto.bio,
      });

      return {
        data: await this.resolveMediaResponse({
          id: updated.id,
          profile: {
            firstName: updated.firstName,
            lastName: updated.lastName,
            phone: updated.phone,
            avatarUrl: updated.avatarUrl,
            bio: updated.bio,
          },
        }),
        message: avatarOnly
          ? 'Profile avatar updated successfully'
          : 'Profile updated successfully',
      };
    }

    if (user.actorType === 'DELIVERYMAN') {
      const deliveryman = await this.prisma.deliveryman.findUnique({
        where: { id: user.uid },
      });

      if (!deliveryman || deliveryman.deletedAt) {
        throw new NotFoundException('Deliveryman account not found');
      }

      if (dto.bio !== undefined) {
        throw new ForbiddenException(
          'Deliveryman bio updates are not supported',
        );
      }

      if (dto.phone && dto.phone !== deliveryman.phone) {
        const existingPhone = await this.prisma.deliveryman.findFirst({
          where: {
            branchId: deliveryman.branchId,
            phone: dto.phone,
            id: { not: deliveryman.id },
          },
          select: { id: true },
        });

        if (existingPhone) {
          throw new BadRequestException(
            'A deliveryman with this phone already exists in this branch',
          );
        }
      }

      const updated = await this.prisma.deliveryman.update({
        where: { id: deliveryman.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          avatarUrl: dto.avatarUrl,
        },
      });

      return {
        data: await this.resolveMediaResponse({
          id: updated.id,
          profile: {
            firstName: updated.firstName,
            lastName: updated.lastName,
            phone: updated.phone,
            avatarUrl: updated.avatarUrl,
            bio: null,
          },
        }),
        message: avatarOnly
          ? 'Profile avatar updated successfully'
          : 'Profile updated successfully',
      };
    }

    const dbUser = await this.usersService.findById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    const emailPrefix = dbUser.email.split('@')[0] || 'user';

    if (dbUser.profile) {
      await this.prisma.profile.update({
        where: { id: dbUser.profile.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          avatarUrl: dto.avatarUrl,
          phone: dto.phone,
          bio: dto.bio,
        },
      });
    } else {
      await this.prisma.profile.create({
        data: {
          userId: dbUser.id,
          firstName: dto.firstName ?? emailPrefix,
          lastName: dto.lastName ?? emailPrefix,
          avatarUrl: dto.avatarUrl,
          phone: dto.phone,
          bio: dto.bio,
        },
      });
    }

    const updated = await this.usersService.findById(user.uid);

    return {
      data: await this.resolveMediaResponse({
        id: updated?.id,
        profile: updated?.profile,
      }),
      message: avatarOnly
        ? 'Profile avatar updated successfully'
        : 'Profile updated successfully',
    };
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  async deleteAccount(user: AuthUserContext) {
    if (user.actorType === 'STAFF') {
      await this.staffManagementRepository.softDelete(user.uid);
      return {
        data: null,
        message: 'Account deleted successfully',
      };
    }

    if (user.actorType === 'DELIVERYMAN') {
      throw new ForbiddenException(
        'Deliveryman accounts must be managed by admins',
      );
    }

    await this.usersService.softDeleteUser(user.uid);
    return {
      data: null,
      message: 'Account scheduled for deletion in 30 days',
    };
  }

  async cancelDeletion(user: AuthUserContext) {
    if (user.actorType === 'STAFF') {
      throw new ForbiddenException('Staff accounts cannot cancel deletion');
    }

    if (user.actorType === 'DELIVERYMAN') {
      throw new ForbiddenException(
        'Deliveryman accounts cannot cancel deletion',
      );
    }

    const dbUser = await this.usersService.findById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    let didRecover = false;

    if (
      dbUser.deletedAt &&
      dbUser.deleteAfter &&
      dbUser.deleteAfter > new Date()
    ) {
      await this.usersService.cancelDeleteUser(user.uid);
      didRecover = true;
    }

    if (
      dbUser.role === 'BRANCH_ADMIN' &&
      dbUser.branchId &&
      dbUser.tenantId &&
      dbUser.restaurantId
    ) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dbUser.branchId,
          tenantId: dbUser.tenantId,
          restaurantId: dbUser.restaurantId,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

      if (branch?.deletedAt) {
        await this.prisma.branch.update({
          where: { id: branch.id },
          data: {
            deletedAt: null,
            isActive: true,
          },
        });
        didRecover = true;
      }
    }

    if (!didRecover) {
      throw new BadRequestException('Account is not scheduled for deletion');
    }

    return {
      data: null,
      message: 'Account deletion canceled',
    };
  }

  private resolveRecoverableLoginState(user: {
    deletedAt: Date | null;
    deleteAfter?: Date | null;
  }) {
    if (user.deletedAt && user.deleteAfter && user.deleteAfter > new Date()) {
      return {
        reason: 'ACCOUNT_DELETION_SCHEDULED',
        message:
          'Your account is scheduled to delete. Request cancel deletion in order to cancel.',
        deleteAfter: user.deleteAfter.toISOString(),
        canCancelDeletion: true,
      };
    }

    return null;
  }

  private async issueAuthTokens(payload: {
    uid: string;
    actorType: 'USER' | 'STAFF' | 'DELIVERYMAN';
    role: string;
    tid: string | null | undefined;
    rid: string | null | undefined;
    bid: string | null | undefined;
    ownerUserId?: string;
    staffRoleId?: string;
    panelType?: string;
    isGuest?: boolean;
  }) {
    const normalizedPayload = this.normalizeAuthPayload(payload);
    const accessToken = await this.jwtService.signAsync(normalizedPayload);

    const refreshToken = await this.jwtService.signAsync(
      { uid: payload.uid, type: 'refresh', actorType: payload.actorType },
      {
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as never,
        secret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    if (payload.actorType === 'STAFF') {
      await this.staffManagementRepository.update(payload.uid, {
        refreshTokenHash,
      });
    } else if (payload.actorType === 'DELIVERYMAN') {
      await this.prisma.deliveryman.update({
        where: { id: payload.uid },
        data: { refreshTokenHash },
      });
    } else {
      await this.usersService.setRefreshTokenHash(
        payload.uid,
        refreshTokenHash,
      );
    }

    return {
      accessToken,
      refreshToken,
    };
  }

  private async issueDeliverymanTwoFactorToken(deliverymanId: string) {
    return this.jwtService.signAsync(
      {
        uid: deliverymanId,
        actorType: 'DELIVERYMAN',
        purpose: 'DELIVERYMAN_2FA',
      },
      {
        expiresIn: '10m',
        secret: process.env.JWT_ACCESS_SECRET || 'change-me',
      },
    );
  }

  private async verifyDeliverymanTwoFactorToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        uid?: string;
        actorType?: string;
        purpose?: string;
      }>(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'change-me',
      });

      if (
        !payload.uid ||
        payload.actorType !== 'DELIVERYMAN' ||
        payload.purpose !== 'DELIVERYMAN_2FA'
      ) {
        throw new UnauthorizedException('Invalid two-factor token');
      }

      return { uid: payload.uid };
    } catch {
      throw new UnauthorizedException('Invalid two-factor token');
    }
  }

  private normalizeAuthPayload(payload: {
    uid: string;
    actorType: 'USER' | 'STAFF' | 'DELIVERYMAN';
    role: string;
    tid: string | null | undefined;
    rid: string | null | undefined;
    bid: string | null | undefined;
    ownerUserId?: string;
    staffRoleId?: string;
    panelType?: string;
    isGuest?: boolean;
  }) {
    if (payload.actorType === 'STAFF') {
      return payload;
    }

    if (payload.role === 'BUSINESS_ADMIN') {
      return {
        ...payload,
        rid: null,
        bid: null,
      };
    }

    return payload;
  }

  private withDeletionState<
    T extends {
      deletedAt?: Date | null;
      deleteAfter?: Date | null;
      isActive?: boolean;
    },
  >(entity: T) {
    const deletionState = entity.deletedAt
      ? {
          isDeleted: true,
          deletionScheduled:
            !!entity.deleteAfter && entity.deleteAfter.getTime() > Date.now(),
          deletedAt: entity.deletedAt,
          deleteAfter: entity.deleteAfter ?? null,
          isActive: entity.isActive ?? false,
        }
      : {
          isDeleted: false,
          deletionScheduled: false,
          deletedAt: null,
          deleteAfter: entity.deleteAfter ?? null,
          isActive: entity.isActive ?? true,
        };

    return {
      ...entity,
      deletionState,
    };
  }

  private assertDevUserToolsEnabled() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'dev-users endpoint is disabled in production',
      );
    }
  }

  private async resolveDevUsers(query: DevUserLookupDto) {
    const userId = query.userId?.trim();
    const email = query.email?.trim().toLowerCase();
    const restaurantId = query.restaurantId?.trim();

    if (!userId && !email) {
      throw new BadRequestException('userId or email is required');
    }

    return this.usersService.findManyForDevResolution({
      id: userId || undefined,
      email: email || undefined,
      restaurantId: restaurantId || undefined,
      role: query.role,
      includeDeleted: query.includeDeleted,
    });
  }

  private async resolveSingleDevUser(query: DevUserLookupDto) {
    const users = await this.resolveDevUsers({
      ...query,
      includeDeleted: query.includeDeleted ?? true,
    });

    if (users.length === 0) {
      throw new NotFoundException('User not found');
    }

    if (users.length > 1) {
      throw new BadRequestException(
        'Multiple users matched. Pass userId, restaurantId, or role to narrow the lookup.',
      );
    }

    return users[0];
  }

  private toDevUserResponse(user: DevUserRecord) {
    return this.withDeletionState({
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      restaurantId: user.restaurantId,
      branchId: user.branchId,
      isVerified: user.isVerified,
      isApproved: user.isApproved,
      isGuest: user.isGuest,
      isActive: user.isActive,
      deletedAt: user.deletedAt,
      deleteAfter: user.deleteAfter,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile ?? null,
    });
  }

  private async resolveLoginUser(dto: {
    email: string;
    restaurantId?: string;
    role?: UserRoleEnum;
  }) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    if (dto.role) {
      const [user] = await this.usersService.findManyForDevResolution({
        email: normalizedEmail,
        restaurantId: dto.restaurantId,
        role: dto.role,
        includeDeleted: true,
      });

      return user ?? null;
    }

    if (dto.restaurantId) {
      return this.usersService.findByEmailIncludingDeleted(
        normalizedEmail,
        dto.restaurantId,
      );
    }

    const candidates = await this.usersService.findManyForDevResolution({
      email: normalizedEmail,
      includeDeleted: true,
    });

    const adminCandidates = candidates.filter(
      (candidate) => candidate.role !== 'CUSTOMER',
    );

    if (adminCandidates.length > 1) {
      throw new BadRequestException(
        'Multiple admin accounts use this email. Specify role to login.',
      );
    }

    return adminCandidates[0] ?? candidates[0] ?? null;
  }

  private async verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        idToken,
      )}`,
    );

    if (!response.ok) {
      throw new UnauthorizedException('Invalid Google credentials');
    }

    const tokenInfo = (await response.json()) as GoogleTokenInfo;
    const verified =
      tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';

    if (!verified || !tokenInfo.email) {
      throw new UnauthorizedException('Google email is not verified');
    }

    const allowedAudiences = (process.env.GOOGLE_CLIENT_ID ?? '')
      .split(',')
      .map((audience) => audience.trim())
      .filter(Boolean);

    if (allowedAudiences.length === 0) {
      throw new UnauthorizedException('Google login is not configured');
    }

    if (!tokenInfo.aud || !allowedAudiences.includes(tokenInfo.aud)) {
      throw new UnauthorizedException('Invalid Google credentials');
    }

    return tokenInfo;
  }

  private async assertAssignedBranchContext(user: {
    role: string;
    id: string;
    tenantId: string | null;
    restaurantId: string | null;
    branchId: string | null;
  }) {
    if (
      user.role !== 'BRANCH_ADMIN' ||
      !user.branchId ||
      !user.restaurantId ||
      !user.tenantId
    ) {
      return;
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: user.branchId,
        tenantId: user.tenantId,
        restaurantId: user.restaurantId,
      },
      select: {
        id: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!branch) {
      throw new NotFoundException({
        message: 'Assigned branch not found for current user',
        error: 'ASSIGNED_BRANCH_NOT_FOUND',
        details: {
          branchId: user.branchId,
          isDeleted: false,
          deletionScheduled: false,
          deletedAt: null,
          canRestore: false,
        },
      });
    }

    if (branch.deletedAt) {
      throw new ForbiddenException({
        message:
          'Assigned branch is soft-deleted. Restore branch to continue login.',
        error: 'ASSIGNED_BRANCH_SOFT_DELETED',
        details: {
          branchId: branch.id,
          isDeleted: true,
          deletionScheduled: false,
          deletedAt: branch.deletedAt.toISOString(),
          canRestore: true,
        },
      });
    }

    if (!branch.isActive) {
      throw new ForbiddenException({
        message: 'Assigned branch is inactive for current user',
        error: 'ASSIGNED_BRANCH_INACTIVE',
        details: {
          branchId: branch.id,
          isDeleted: false,
          deletionScheduled: false,
          deletedAt: null,
          canRestore: false,
        },
      });
    }
  }

  private shouldAutoVerifyUser(emailEnabled: boolean): boolean {
    const isDevMode = process.env.NODE_ENV !== 'production';
    return !emailEnabled && !isDevMode;
  }

  private shouldExposeDevToken(emailEnabled: boolean): boolean {
    return !emailEnabled && process.env.NODE_ENV !== 'production';
  }

  private async ensureVerificationEmailCanBeSent(email: string): Promise<void> {
    try {
      await this.mailerService.verifyConnection();
    } catch (error) {
      this.logger.error(
        `SMTP verification failed before registration for ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Email service is unavailable. Please try again later.',
      );
    }
  }

  private async issueVerificationOtp(
    dto: Pick<ResendOtpDto, 'email' | 'restaurantId'>,
  ) {
    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const user = await this.usersService.findByEmail(
      dto.email,
      dto.restaurantId,
    );

    if (!user || user.deletedAt || user.isVerified) {
      return {
        data: null,
        message: 'If account exists, OTP has been sent',
      };
    }

    const otp = this.generateOtp();
    const expiresAt = this.generateOtpExpiry();
    await this.usersService.setVerificationOtpByEmail(
      dto.email,
      otp,
      expiresAt,
      dto.restaurantId,
    );

    if (emailEnabled) {
      await this.mailerService.sendVerificationEmail(dto.email, otp);
    }

    return {
      data: {
        verificationOtp: shouldExposeDevToken ? otp : undefined,
        purpose: OtpPurposeEnum.VERIFICATION,
      },
      message: 'If account exists, OTP has been sent',
    };
  }

  private async issuePasswordResetOtp(
    dto: Pick<ForgotPasswordDto, 'email' | 'restaurantId'>,
  ) {
    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    const shouldExposeDevToken = this.shouldExposeDevToken(emailEnabled);
    const otp = this.generateOtp();
    const expiresAt = this.generateOtpExpiry();
    const result = await this.usersService.setPasswordResetOtp(
      dto.email,
      otp,
      expiresAt,
      dto.restaurantId,
    );

    if (result.count === 0) {
      return {
        data: null,
        message: 'If account exists, reset instructions are sent',
      };
    }

    if (emailEnabled) {
      await this.mailerService.sendPasswordResetEmail(dto.email, otp);
    }

    return {
      data: {
        resetOtp: shouldExposeDevToken ? otp : undefined,
        purpose: OtpPurposeEnum.PASSWORD_RESET,
      },
      message: 'If account exists, reset instructions are sent',
    };
  }

  private generateGuestEmail(restaurantId: string): string {
    return `guest+${restaurantId}+${Date.now()}-${randomBytes(4).toString('hex')}@guest.deliveryways.local`;
  }

  private generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  private generateBranchAdminPassword(): string {
    return `Branch@${randomBytes(6).toString('hex')}`;
  }

  private generateOtpExpiry(): Date {
    return new Date(Date.now() + 10 * 60 * 1000);
  }
}
