import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database';

@Injectable()
export class UsersCleanupService {
  private readonly logger = new Logger(UsersCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async removeStaleUnverifiedUsers(): Promise<void> {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleUsers = await this.prisma.user.findMany({
      where: {
        isVerified: false,
        createdAt: { lt: threshold },
      },
      select: { id: true },
    });

    if (staleUsers.length === 0) {
      return;
    }

    const userIds = staleUsers.map((u) => u.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.profile.deleteMany({
        where: { userId: { in: userIds } },
      });

      await tx.user.deleteMany({
        where: { id: { in: userIds } },
      });
    });

    this.logger.log(
      `Removed ${userIds.length} stale unverified users/profiles older than 24h`,
    );
  }
}
