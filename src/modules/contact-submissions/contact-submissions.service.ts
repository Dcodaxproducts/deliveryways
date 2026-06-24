import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactSubmissionStatus, Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { MailerService } from '../mailer/mailer.service';
import { ContactSubmissionsRepository } from './contact-submissions.repository';
import {
  ListContactSubmissionsDto,
  ReplyContactSubmissionDto,
  UpdateContactSubmissionStatusDto,
} from './dto';

type ContactSubmissionRecord = Awaited<
  ReturnType<ContactSubmissionsRepository['findById']>
>;

@Injectable()
export class ContactSubmissionsService {
  constructor(
    private readonly contactSubmissionsRepository: ContactSubmissionsRepository,
    private readonly mailerService: MailerService,
  ) {}

  createPublicSubmission(input: {
    tenantId: string;
    restaurantId: string;
    branchId?: string | null;
    customerId?: string | null;
    name: string;
    email: string;
    subject: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.contactSubmissionsRepository.create({
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      branchId: input.branchId ?? null,
      customerId: input.customerId ?? null,
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      status: ContactSubmissionStatus.NEW,
      metadata: input.metadata,
    });
  }

  async list(user: AuthUserContext, query: ListContactSubmissionsDto) {
    const where = this.buildScopedWhere(user, query);
    const { items, total } = await this.contactSubmissionsRepository.list(
      where,
      query,
    );

    return {
      data: items,
      message: 'Contact submissions fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const submission = await this.getAccessibleSubmission(user, id);

    return {
      data: submission,
      message: 'Contact submission fetched successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateContactSubmissionStatusDto,
  ) {
    await this.getAccessibleSubmission(user, id);
    const data = await this.contactSubmissionsRepository.updateStatus(
      id,
      dto.status,
    );

    return {
      data,
      message: 'Contact submission status updated successfully',
    };
  }

  async reply(
    user: AuthUserContext,
    id: string,
    dto: ReplyContactSubmissionDto,
  ) {
    const submission = await this.getAccessibleSubmission(user, id);
    const replyMessage = dto.message.trim();
    if (!replyMessage) {
      throw new BadRequestException('Reply message is required');
    }

    const replySubject =
      this.resolveOptionalString(dto.subject) ?? `Re: ${submission.subject}`;

    await this.mailerService.sendEmail(
      submission.email,
      replySubject,
      [
        replyMessage,
        '',
        '---',
        `Original message from ${submission.name}:`,
        submission.message,
      ].join('\n'),
    );

    const data = await this.contactSubmissionsRepository.markReplied(id, {
      replySubject,
      replyMessage,
      repliedById: user.uid,
    });

    return {
      data,
      message: 'Contact submission reply sent successfully',
    };
  }

  private buildScopedWhere(
    user: AuthUserContext,
    query: ListContactSubmissionsDto,
  ): Prisma.ContactSubmissionWhereInput {
    const base: Prisma.ContactSubmissionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { subject: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return {
        ...base,
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      };
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      return {
        ...base,
        tenantId: user.tid,
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      };
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      return {
        ...base,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    throw new ForbiddenException('Insufficient permissions');
  }

  private async getAccessibleSubmission(user: AuthUserContext, id: string) {
    const submission = await this.contactSubmissionsRepository.findById(id);
    if (!submission) {
      throw new NotFoundException('Contact submission not found');
    }

    this.assertAccess(user, submission);
    return submission;
  }

  private assertAccess(
    user: AuthUserContext,
    submission: NonNullable<ContactSubmissionRecord>,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid || submission.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access contact submissions outside your tenant',
        );
      }

      return;
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (
        !user.rid ||
        !user.bid ||
        submission.restaurantId !== user.rid ||
        submission.branchId !== user.bid
      ) {
        throw new ForbiddenException(
          'Branch admins can only access their own branch submissions',
        );
      }

      return;
    }

    throw new ForbiddenException('Insufficient permissions');
  }

  private resolveOptionalString(value: string | undefined) {
    const normalized = value?.trim();
    return normalized?.length ? normalized : undefined;
  }
}
