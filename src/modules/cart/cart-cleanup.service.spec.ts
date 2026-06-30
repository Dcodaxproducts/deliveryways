import { CartCleanupService } from './cart-cleanup.service';

describe('CartCleanupService', () => {
  const makeService = () => {
    const cartRepository = {
      deleteExpiredBefore: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const globalSettingsService = {
      getCartExpiryMinutes: jest.fn().mockResolvedValue(45),
    };
    const service = new CartCleanupService(
      cartRepository as never,
      globalSettingsService as never,
    );

    return { service, cartRepository, globalSettingsService };
  };

  it('deletes carts older than the super admin configured expiry', async () => {
    const { service, cartRepository, globalSettingsService } = makeService();
    cartRepository.deleteExpiredBefore.mockResolvedValue({ count: 3 });

    await service.clearExpiredCarts();

    expect(globalSettingsService.getCartExpiryMinutes).toHaveBeenCalled();
    expect(cartRepository.deleteExpiredBefore).toHaveBeenCalledWith(
      expect.any(Date),
    );
    const [[cutoff]] = cartRepository.deleteExpiredBefore.mock.calls as [
      [Date],
    ];
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(
      44 * 60 * 1000,
    );
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(46 * 60 * 1000);
  });
});
