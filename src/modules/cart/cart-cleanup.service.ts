import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import { CartRepository } from './cart.repository';

const DEFAULT_CART_EXPIRY_MINUTES = 720;
const MINUTE_IN_MS = 60 * 1000;

@Injectable()
export class CartCleanupService {
  private readonly logger = new Logger(CartCleanupService.name);

  constructor(
    private readonly cartRepository: CartRepository,
    @Optional() private readonly globalSettingsService?: GlobalSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async clearExpiredCarts() {
    const cutoff = new Date(Date.now() - (await this.getCartExpiryMs()));
    const result = await this.cartRepository.deleteExpiredBefore(cutoff);

    if (result.count > 0) {
      this.logger.log(`Cleared ${result.count} expired customer carts`);
    }
  }

  private async getCartExpiryMs() {
    const minutes =
      (await this.globalSettingsService?.getCartExpiryMinutes()) ??
      DEFAULT_CART_EXPIRY_MINUTES;

    return minutes * MINUTE_IN_MS;
  }
}
