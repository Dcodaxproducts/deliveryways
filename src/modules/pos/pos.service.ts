import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { PosRepository } from './pos.repository';
import { CreatePosOrderDto, ListPosOrdersDto, UpdatePosOrderDto } from './dto';

@Injectable()
export class PosService {
  constructor(private readonly posRepository: PosRepository) {}

  async create(user: AuthUserContext, dto: CreatePosOrderDto) {
    this.assertPosActor(user);
    this.assertSupportedOrderType(dto.orderType);

    const branch = await this.posRepository.findActiveBranch(dto.branchId);
    if (!branch) {
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
    branch: { id: string; name: string; coverImage: string | null };
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
