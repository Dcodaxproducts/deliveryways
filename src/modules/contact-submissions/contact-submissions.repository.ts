import { Injectable } from '@nestjs/common';
import { ContactSubmissionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { ListContactSubmissionsDto } from './dto';

@Injectable()
export class ContactSubmissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    restaurant: { select: { id: true, name: true, slug: true } },
    branch: { select: { id: true, name: true } },
    repliedBy: { select: { id: true, email: true } },
  } satisfies Prisma.ContactSubmissionInclude;

  create(data: Prisma.ContactSubmissionUncheckedCreateInput) {
    return this.prisma.contactSubmission.create({
      data,
      include: this.include,
    });
  }

  async list(
    where: Prisma.ContactSubmissionWhereInput,
    query: ListContactSubmissionsDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contactSubmission.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: this.include,
      }),
      this.prisma.contactSubmission.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string) {
    return this.prisma.contactSubmission.findUnique({
      where: { id },
      include: this.include,
    });
  }

  updateStatus(id: string, status: ContactSubmissionStatus) {
    return this.prisma.contactSubmission.update({
      where: { id },
      data: { status },
      include: this.include,
    });
  }

  markReplied(
    id: string,
    data: {
      replySubject: string;
      replyMessage: string;
      repliedById: string;
    },
  ) {
    return this.prisma.contactSubmission.update({
      where: { id },
      data: {
        status: ContactSubmissionStatus.REPLIED,
        replySubject: data.replySubject,
        replyMessage: data.replyMessage,
        repliedAt: new Date(),
        repliedById: data.repliedById,
      },
      include: this.include,
    });
  }
}
