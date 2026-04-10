import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
  OrderType,
  PaymentMethod,
  PosActorType,
  PosOrderDraftStatus,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import {
  CreatePosDraftItemDto,
  CreatePosOrderDto,
  ListPosOrdersDto,
  UpdatePosDraftItemDto,
  UpdatePosOrderDto,
} from './dto';
import { PosRepository } from './pos.repository';

@Injectable()
export class PosService {
  constructor(
    private readonly posRepository: PosRepository,
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
  ) {}

  async create(user: AuthUserContext, dto: CreatePosOrderDto) {
    this.assertPosActor(user);
    this.assertSupportedOrderType(dto.orderType);

    const effectiveBranchId = this.resolveRequestedBranchId(user, dto.branchId);
    if (!effectiveBranchId) {
      throw new BadRequestException('branchId is required');
    }

    const branch = await this.posRepository.findActiveBranch(effectiveBranchId);
    if (!branch) {
      if (
        (user.role === UserRoleEnum.BRANCH_ADMIN ||
          user.role === UserRoleEnum.STAFF) &&
        user.bid === effectiveBranchId
      ) {
        throw new BadRequestException(
          'Assigned branch not found or inactive for current user',
        );
      }

      throw new BadRequestException('Branch not found');
    }

    this.assertBranchAccess(user, branch);
    await this.assertScopedCustomer(
      dto.customerId,
      branch.tenantId,
      branch.restaurantId,
    );

    const data = await this.posRepository.createDraft({
      tenantId: branch.tenantId,
      restaurantId: branch.restaurantId,
      branchId: branch.id,
      createdByActorId: user.uid,
      createdByActorType: this.resolveActorType(user),
      customerId: dto.customerId,
      orderType: dto.orderType as never,
      paymentMethod: dto.paymentMethod as never,
      guestName: this.resolveOptionalString(dto.guestName),
      guestPhone: this.resolveOptionalString(dto.guestPhone),
      tableLabel: this.resolveOptionalString(dto.tableLabel),
      guestCount: dto.guestCount,
      couponCode: this.resolveOptionalString(dto.couponCode),
      note: this.resolveOptionalString(dto.note),
    });

    return {
      data: this.toDraftResponse(data),
      message: 'POS draft created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListPosOrdersDto) {
    this.assertPosActor(user);

    const effectiveBranchId = this.resolveRequestedBranchId(
      user,
      query.branchId,
    );
    const { items, total } = await this.posRepository.listDrafts(
      user.role === UserRoleEnum.SUPER_ADMIN ? undefined : user.tid,
      this.resolveRestaurantScope(user),
      effectiveBranchId,
      query,
    );

    return {
      data: items.map((item) => this.toDraftResponse(item)),
      message: 'POS drafts fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, id);

    return {
      data: this.toDraftResponse(draft),
      message: 'POS draft fetched successfully',
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdatePosOrderDto) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, id);
    this.assertDraftMutable(draft.status);

    if (dto.orderType !== undefined) {
      this.assertSupportedOrderType(dto.orderType);
    }

    if (dto.customerId !== undefined && dto.customerId !== null) {
      await this.assertScopedCustomer(
        dto.customerId,
        draft.tenantId,
        draft.restaurantId,
      );
    }

    const data = await this.posRepository.updateDraft(id, {
      customer:
        dto.customerId !== undefined
          ? dto.customerId
            ? { connect: { id: dto.customerId } }
            : { disconnect: true }
          : undefined,
      orderType: dto.orderType as never,
      paymentMethod:
        dto.paymentMethod === undefined
          ? undefined
          : dto.paymentMethod === null
            ? { set: null }
            : dto.paymentMethod,
      guestName:
        dto.guestName === undefined
          ? undefined
          : dto.guestName === null
            ? { set: null }
            : dto.guestName,
      guestPhone:
        dto.guestPhone === undefined
          ? undefined
          : dto.guestPhone === null
            ? { set: null }
            : dto.guestPhone,
      tableLabel:
        dto.tableLabel === undefined
          ? undefined
          : dto.tableLabel === null
            ? { set: null }
            : dto.tableLabel,
      guestCount:
        dto.guestCount === undefined
          ? undefined
          : dto.guestCount === null
            ? { set: null }
            : dto.guestCount,
      couponCode:
        dto.couponCode === undefined
          ? undefined
          : dto.couponCode === null
            ? { set: null }
            : dto.couponCode,
      note:
        dto.note === undefined
          ? undefined
          : dto.note === null
            ? { set: null }
            : dto.note,
    });

    return {
      data: this.toDraftResponse(data),
      message: 'POS draft updated successfully',
    };
  }

  async addItem(
    user: AuthUserContext,
    draftId: string,
    dto: CreatePosDraftItemDto,
  ) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, draftId);
    this.assertDraftMutable(draft.status);

    await this.posRepository.createDraftItem({
      draft: { connect: { id: draft.id } },
      menuItemId: dto.menuItemId,
      variationId: dto.variationId,
      quantity: dto.quantity,
      note: this.resolveOptionalString(dto.note),
      modifiers: this.normalizeModifiers(dto.modifiers),
    });

    const refreshed = await this.getScopedDraftOrThrow(user, draftId);

    return {
      data: this.toDraftResponse(refreshed),
      message: 'POS draft item added successfully',
    };
  }

  async updateItem(
    user: AuthUserContext,
    draftId: string,
    itemId: string,
    dto: UpdatePosDraftItemDto,
  ) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, draftId);
    this.assertDraftMutable(draft.status);

    const item = await this.posRepository.findDraftItem(itemId, draft.id);
    if (!item) {
      throw new NotFoundException('POS draft item not found');
    }

    await this.posRepository.updateDraftItem(itemId, {
      quantity: dto.quantity,
      note:
        dto.note === undefined
          ? undefined
          : dto.note === null
            ? { set: null }
            : dto.note,
      modifiers:
        dto.modifiers === undefined
          ? undefined
          : this.normalizeModifiers(dto.modifiers),
    });

    const refreshed = await this.getScopedDraftOrThrow(user, draftId);

    return {
      data: this.toDraftResponse(refreshed),
      message: 'POS draft item updated successfully',
    };
  }

  async removeItem(user: AuthUserContext, draftId: string, itemId: string) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, draftId);
    this.assertDraftMutable(draft.status);

    const item = await this.posRepository.findDraftItem(itemId, draft.id);
    if (!item) {
      throw new NotFoundException('POS draft item not found');
    }

    await this.posRepository.deleteDraftItem(itemId);
    const refreshed = await this.getScopedDraftOrThrow(user, draftId);

    return {
      data: this.toDraftResponse(refreshed),
      message: 'POS draft item removed successfully',
    };
  }

  async quote(user: AuthUserContext, draftId: string) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, draftId);
    this.assertDraftMutable(draft.status);
    this.assertDraftHasItems(draft.items.length);

    const checkoutCustomerId = await this.ensureDraftCheckoutCustomer(draft);

    return this.ordersService.quote(user, {
      branchId: draft.branchId,
      customerId: checkoutCustomerId,
      orderType: draft.orderType as never,
      items: draft.items.map((item) => ({
        menuItemId: item.menuItemId,
        variationId: item.variationId ?? undefined,
        quantity: item.quantity,
        modifiers: this.toOrderModifiers(item.modifiers),
        note: item.note ?? undefined,
      })),
      couponCode: draft.couponCode ?? undefined,
      orderTime: new Date().toISOString(),
    });
  }

  async checkout(user: AuthUserContext, draftId: string) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, draftId);
    this.assertDraftMutable(draft.status);
    this.assertDraftHasItems(draft.items.length);

    if (!draft.paymentMethod) {
      throw new BadRequestException('paymentMethod is required for POS checkout');
    }

    const checkoutCustomerId = await this.ensureDraftCheckoutCustomer(draft);
    const orderResult = await this.ordersService.create(user, {
      branchId: draft.branchId,
      customerId: checkoutCustomerId,
      orderType: draft.orderType as never,
      items: draft.items.map((item) => ({
        menuItemId: item.menuItemId,
        variationId: item.variationId ?? undefined,
        quantity: item.quantity,
        modifiers: this.toOrderModifiers(item.modifiers),
        note: item.note ?? undefined,
      })),
      couponCode: draft.couponCode ?? undefined,
      orderTime: new Date().toISOString(),
      paymentMethod: draft.paymentMethod as never,
      customerNote: draft.note ?? undefined,
    });

    const updatedDraft = await this.posRepository.updateDraft(draft.id, {
      status: PosOrderDraftStatus.CHECKED_OUT,
      checkedOutAt: new Date(),
      finalOrderId: orderResult.data.id,
    });

    return {
      data: {
        draft: this.toDraftResponse(updatedDraft),
        order: orderResult.data,
      },
      message: 'POS order checked out successfully',
    };
  }

  async cancel(user: AuthUserContext, id: string) {
    this.assertPosActor(user);
    const draft = await this.getScopedDraftOrThrow(user, id);
    this.assertDraftMutable(draft.status);

    const data = await this.posRepository.updateDraft(id, {
      status: PosOrderDraftStatus.CANCELLED,
    });

    return {
      data: this.toDraftResponse(data),
      message: 'POS draft cancelled successfully',
    };
  }

  private async getScopedDraftOrThrow(user: AuthUserContext, id: string) {
    const draft = await this.posRepository.findDraftById(id);
    if (!draft) {
      throw new NotFoundException('POS draft not found');
    }

    this.assertBranchAccess(user, {
      id: draft.branchId,
      tenantId: draft.tenantId,
      restaurantId: draft.restaurantId,
    });

    return draft;
  }

  private assertPosActor(user: AuthUserContext) {
    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN &&
      user.role !== UserRoleEnum.BRANCH_ADMIN &&
      user.role !== UserRoleEnum.STAFF
    ) {
      throw new ForbiddenException('Only internal staff can access POS');
    }

    if (!user.uid) {
      throw new ForbiddenException('Authenticated actor is required');
    }
  }

  private assertSupportedOrderType(orderType: string) {
    if (orderType === 'DELIVERY') {
      throw new BadRequestException(
        'POS currently supports TAKEAWAY and DINE_IN only',
      );
    }
  }

  private assertDraftMutable(status: PosOrderDraftStatus) {
    if (status !== PosOrderDraftStatus.OPEN) {
      throw new BadRequestException('Only open POS drafts can be changed');
    }
  }

  private assertDraftHasItems(itemCount: number) {
    if (!itemCount) {
      throw new BadRequestException('Add at least one item before checkout');
    }
  }

  private async assertScopedCustomer(
    customerId: string | undefined,
    tenantId: string,
    restaurantId: string,
  ) {
    if (!customerId) {
      return;
    }

    const customer = await this.posRepository.findScopedCustomer(
      customerId,
      tenantId,
      restaurantId,
    );
    if (!customer) {
      throw new BadRequestException(
        'Customer not found for current branch scope',
      );
    }
  }

  private async ensureDraftCheckoutCustomer(draft: {
    id: string;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    customerId: string | null;
    guestName: string | null;
    guestPhone: string | null;
  }) {
    if (draft.customerId) {
      return draft.customerId;
    }

    const password = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const guestName = draft.guestName?.trim() || 'Walk-in';
    const nameParts = guestName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Walk-in';
    const lastName = nameParts.slice(1).join(' ') || 'Customer';

    const guestCustomer = await this.usersService.create({
      email: this.generateGuestEmail(draft.restaurantId, draft.branchId),
      password,
      role: UserRoleEnum.CUSTOMER,
      tenantId: draft.tenantId,
      restaurantId: draft.restaurantId,
      branchId: draft.branchId,
      isVerified: false,
      isApproved: true,
      isGuest: true,
      profile: {
        firstName,
        lastName,
        phone: draft.guestPhone ?? undefined,
      },
    });

    await this.posRepository.updateDraft(draft.id, {
      customer: { connect: { id: guestCustomer.id } },
    });

    return guestCustomer.id;
  }

  private generateGuestEmail(restaurantId: string, branchId: string) {
    const token = randomBytes(6).toString('hex');
    return `pos-guest-${restaurantId}-${branchId}-${Date.now()}-${token}@deliveryways.local`;
  }

  private normalizeModifiers(
    modifiers:
      | Array<{ modifierId: string; quantity?: number }>
      | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (!modifiers) {
      return undefined;
    }

    return modifiers.map((modifier) => ({
      modifierId: modifier.modifierId,
      quantity: modifier.quantity ?? 1,
    })) as Prisma.InputJsonValue;
  }

  private toOrderModifiers(
    modifiers: Prisma.JsonValue | null,
  ): Array<{ modifierId: string; quantity?: number }> | undefined {
    if (!Array.isArray(modifiers)) {
      return undefined;
    }

    return modifiers
      .filter((modifier): modifier is Prisma.JsonObject =>
        typeof modifier === 'object' && modifier !== null && !Array.isArray(modifier),
      )
      .map((modifier) => {
        const modifierId = modifier['modifierId'];
        const quantity = modifier['quantity'];

        return {
          modifierId: typeof modifierId === 'string' ? modifierId : '',
          quantity: typeof quantity === 'number' ? quantity : undefined,
        };
      })
      .filter((modifier) => modifier.modifierId.length > 0);
  }

  private assertBranchAccess(
    user: AuthUserContext,
    branch: { id: string; tenantId: string; restaurantId: string },
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (!user.tid || branch.tenantId !== user.tid) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant restaurants',
      );
    }

    if (
      (user.role === UserRoleEnum.BRANCH_ADMIN ||
        user.role === UserRoleEnum.STAFF) &&
      user.bid &&
      user.bid !== branch.id
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }

    if (
      (user.role === UserRoleEnum.BRANCH_ADMIN ||
        user.role === UserRoleEnum.STAFF) &&
      user.rid &&
      user.rid !== branch.restaurantId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private resolveRequestedBranchId(
    user: AuthUserContext,
    requestedBranchId?: string,
  ) {
    if (
      (user.role === UserRoleEnum.BRANCH_ADMIN ||
        user.role === UserRoleEnum.STAFF) &&
      user.bid
    ) {
      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return user.bid;
    }

    return requestedBranchId;
  }

  private resolveRestaurantScope(user: AuthUserContext) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return undefined;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      return undefined;
    }

    return user.rid;
  }

  private resolveActorType(user: AuthUserContext) {
    return user.role === UserRoleEnum.STAFF
      ? PosActorType.STAFF
      : PosActorType.USER;
  }

  private resolveOptionalString(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private toDraftResponse(draft: {
    id: string;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    createdByActorId: string;
    createdByActorType: PosActorType;
    customerId: string | null;
    orderType: OrderType;
    paymentMethod: PaymentMethod | null;
    guestName: string | null;
    guestPhone: string | null;
    tableLabel: string | null;
    guestCount: number | null;
    couponCode: string | null;
    note: string | null;
    status: PosOrderDraftStatus;
    checkedOutAt: Date | null;
    finalOrderId: string | null;
    createdAt: Date;
    updatedAt: Date;
    restaurant: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      coverImage: string | null;
    };
    branch: {
      id: string;
      name: string;
      logoUrl: string | null;
      coverImage: string | null;
    };
    customer: {
      id: string;
      email: string;
      isGuest: boolean;
      profile: {
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
      } | null;
    } | null;
    items: Array<{
      id: string;
      menuItemId: string;
      variationId: string | null;
      quantity: number;
      note: string | null;
      modifiers: Prisma.JsonValue | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }) {
    return {
      id: draft.id,
      tenantId: draft.tenantId,
      restaurantId: draft.restaurantId,
      branchId: draft.branchId,
      createdBy: {
        actorId: draft.createdByActorId,
        actorType: draft.createdByActorType,
      },
      customerId: draft.customerId,
      orderType: draft.orderType,
      paymentMethod: draft.paymentMethod,
      guestName: draft.guestName,
      guestPhone: draft.guestPhone,
      tableLabel: draft.tableLabel,
      guestCount: draft.guestCount,
      couponCode: draft.couponCode,
      note: draft.note,
      status: draft.status,
      checkedOutAt: draft.checkedOutAt,
      finalOrderId: draft.finalOrderId,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      restaurant: draft.restaurant,
      branch: draft.branch,
      customer: draft.customer
        ? {
            id: draft.customer.id,
            email: draft.customer.email,
            isGuest: draft.customer.isGuest,
            firstName: draft.customer.profile?.firstName ?? null,
            lastName: draft.customer.profile?.lastName ?? null,
            phone: draft.customer.profile?.phone ?? null,
            avatarUrl: draft.customer.profile?.avatarUrl ?? null,
          }
        : null,
      itemCount: draft.items.length,
      items: draft.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        variationId: item.variationId,
        quantity: item.quantity,
        note: item.note,
        modifiers: item.modifiers,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }
}
