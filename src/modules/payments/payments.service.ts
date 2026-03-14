import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, PaymentTransactionType, Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  CreatePaymentAttemptDto,
  ListPaymentsDto,
  RefundPaymentDto,
  UpdatePaymentStatusDto,
} from './dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createAttempt(
    user: AuthUserContext,
    orderId: string,
    dto: CreatePaymentAttemptDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        customerId: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertOrderAccess(user, order.restaurantId, order.customerId);

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }

    const data = await this.paymentsRepository.create({
      order: { connect: { id: order.id } },
      tenant: { connect: { id: order.tenantId } },
      restaurant: { connect: { id: order.restaurantId } },
      branch: { connect: { id: order.branchId } },
      paymentMethod: dto.paymentMethod ?? order.paymentMethod,
      type: PaymentTransactionType.CHARGE,
      status: PaymentStatus.PENDING,
      amount: order.totalAmount,
      currency: dto.currency ?? 'PKR',
      note: dto.note,
    });

    await this.notificationsService.notifyPaymentAttemptCreated(data.id);

    return {
      data,
      message: 'Payment attempt created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListPaymentsDto) {
    const restaurantId = this.resolveRestaurantId(user, query.restaurantId);
    const customerId =
      user.role === UserRoleEnum.CUSTOMER ? user.uid : undefined;
    const { items, total } = await this.paymentsRepository.list(
      restaurantId,
      query,
      customerId,
    );

    return {
      data: items,
      message: 'Payments fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    this.assertOrderAccess(
      user,
      payment.order.restaurantId,
      payment.order.customerId,
    );

    return {
      data: payment,
      message: 'Payment fetched successfully',
    };
  }

  async markPaid(
    user: AuthUserContext,
    id: string,
    dto: UpdatePaymentStatusDto,
  ) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    this.assertAdminPaymentAccess(user, payment.order.restaurantId, true);

    if (payment.type !== PaymentTransactionType.CHARGE) {
      throw new BadRequestException(
        'Only charge transactions can be marked paid',
      );
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException(
        'Refunded transactions cannot be marked paid',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.paymentsRepository.updateStatus(
        id,
        {
          status: PaymentStatus.PAID,
          providerRef: dto.providerRef,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );

      await this.paymentsRepository.updateOrderPaymentStatus(
        payment.orderId,
        PaymentStatus.PAID,
        tx,
      );

      return updatedPayment;
    });

    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: 'Payment marked as paid successfully',
    };
  }

  async fail(user: AuthUserContext, id: string, dto: UpdatePaymentStatusDto) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    this.assertAdminPaymentAccess(user, payment.order.restaurantId, true);

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Refunded transactions cannot be failed');
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.paymentsRepository.updateStatus(
        id,
        {
          status: PaymentStatus.FAILED,
          providerRef: dto.providerRef,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );

      await this.paymentsRepository.updateOrderPaymentStatus(
        payment.orderId,
        PaymentStatus.FAILED,
        tx,
      );

      return updatedPayment;
    });

    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: 'Payment marked as failed successfully',
    };
  }

  async cancel(user: AuthUserContext, id: string, dto: UpdatePaymentStatusDto) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    const isCustomer = user.role === UserRoleEnum.CUSTOMER;
    if (isCustomer) {
      this.assertOrderAccess(
        user,
        payment.order.restaurantId,
        payment.order.customerId,
      );
    } else {
      this.assertAdminPaymentAccess(user, payment.order.restaurantId, true);
    }

    if (payment.status === PaymentStatus.PAID) {
      throw new BadRequestException('Paid transactions cannot be cancelled');
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.paymentsRepository.updateStatus(
        id,
        {
          status: PaymentStatus.CANCELLED,
          providerRef: dto.providerRef,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );

      await this.paymentsRepository.updateOrderPaymentStatus(
        payment.orderId,
        PaymentStatus.CANCELLED,
        tx,
      );

      return updatedPayment;
    });

    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: 'Payment cancelled successfully',
    };
  }

  async refund(user: AuthUserContext, id: string, dto: RefundPaymentDto) {
    const payment = await this.paymentsRepository.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    this.assertAdminPaymentAccess(user, payment.order.restaurantId);

    if (payment.type !== PaymentTransactionType.CHARGE) {
      throw new BadRequestException('Only charge transactions can be refunded');
    }

    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Only paid transactions can be refunded');
    }

    const refundAmount = dto.amount
      ? new Prisma.Decimal(dto.amount)
      : payment.amount;

    if (refundAmount.greaterThan(payment.amount)) {
      throw new BadRequestException(
        'Refund amount cannot exceed charge amount',
      );
    }

    const refundedSoFar = await this.paymentsRepository.sumSuccessfulRefunds(
      payment.orderId,
    );

    if (refundedSoFar.plus(refundAmount).greaterThan(payment.amount)) {
      throw new BadRequestException(
        'Refund amount exceeds remaining refundable amount',
      );
    }

    const currency = dto.currency ?? payment.currency;

    const data = await this.prisma.$transaction(async (tx) => {
      const refundTransaction = await this.paymentsRepository.create(
        {
          order: { connect: { id: payment.orderId } },
          tenant: { connect: { id: payment.tenantId } },
          restaurant: { connect: { id: payment.restaurantId } },
          branch: { connect: { id: payment.branchId } },
          paymentMethod: payment.paymentMethod,
          type: PaymentTransactionType.REFUND,
          status: PaymentStatus.REFUNDED,
          amount: refundAmount,
          currency,
          providerRef: dto.providerRef,
          providerData: dto.providerData as Prisma.InputJsonValue,
          note: dto.note,
          processedAt: new Date(),
        },
        tx,
      );

      const updatedStatus = refundedSoFar
        .plus(refundAmount)
        .equals(payment.amount)
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PAID;

      await this.paymentsRepository.updateOrderPaymentStatus(
        payment.orderId,
        updatedStatus,
        tx,
      );

      if (updatedStatus === PaymentStatus.REFUNDED) {
        await this.paymentsRepository.updateStatus(
          payment.id,
          {
            status: PaymentStatus.REFUNDED,
            processedAt: new Date(),
          },
          tx,
        );
      }

      return refundTransaction;
    });

    await this.notificationsService.notifyPaymentStatusChanged(data.id);

    return {
      data,
      message: 'Payment refunded successfully',
    };
  }

  private resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): string | undefined {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException('Cross-restaurant access denied');
      }

      return user.rid;
    }

    return this.assertAdminPaymentAccess(user, requestedRestaurantId, true);
  }

  private assertOrderAccess(
    user: AuthUserContext,
    restaurantId: string,
    customerId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (user.uid !== customerId) {
        throw new ForbiddenException('Cross-customer access denied');
      }

      if (user.rid && user.rid !== restaurantId) {
        throw new ForbiddenException('Cross-restaurant access denied');
      }

      return;
    }

    this.assertAdminPaymentAccess(user, restaurantId, true);
  }

  private assertAdminPaymentAccess(
    user: AuthUserContext,
    restaurantId?: string,
    allowBranchAdmin = false,
  ): string | undefined {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return restaurantId;
    }

    if (
      user.role !== UserRoleEnum.BUSINESS_ADMIN &&
      !(allowBranchAdmin && user.role === UserRoleEnum.BRANCH_ADMIN)
    ) {
      throw new ForbiddenException('Insufficient permissions for payments');
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (restaurantId && restaurantId !== user.rid) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }

    return user.rid;
  }
}
