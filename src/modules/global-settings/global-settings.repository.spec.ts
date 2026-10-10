import { GlobalSettingsRepository } from './global-settings.repository';

describe('GlobalSettingsRepository', () => {
  const existingSettings = {
    id: 'global-settings-1',
    scopeKey: 'GLOBAL',
  };

  it('keeps concurrent existing-setting reads off the singleton write path', async () => {
    const findUnique = jest.fn().mockResolvedValue(existingSettings);
    const upsert = jest.fn(() => new Promise<never>(() => undefined));
    const repository = new GlobalSettingsRepository({
      globalSetting: { findUnique, upsert },
    } as never);

    const result = await Promise.race([
      Promise.all(
        Array.from({ length: 8 }, () =>
          repository.ensureSingleton({ scopeKey: 'GLOBAL' } as never),
        ),
      ),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 100),
      ),
    ]);

    expect(result).not.toBe('timeout');
    expect(result).toEqual(Array.from({ length: 8 }, () => existingSettings));
    expect(findUnique).toHaveBeenCalledTimes(8);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('uses the race-safe upsert only when the singleton is missing', async () => {
    const createdSettings = {
      id: 'global-settings-1',
      scopeKey: 'GLOBAL',
    };
    const findUnique = jest.fn().mockResolvedValue(null);
    const upsert = jest.fn().mockResolvedValue(createdSettings);
    const repository = new GlobalSettingsRepository({
      globalSetting: { findUnique, upsert },
    } as never);

    await expect(
      repository.ensureSingleton({ scopeKey: 'GLOBAL' } as never),
    ).resolves.toBe(createdSettings);
    expect(upsert).toHaveBeenCalledWith({
      where: { scopeKey: 'GLOBAL' },
      update: {},
      create: { scopeKey: 'GLOBAL' },
    });
  });
});
