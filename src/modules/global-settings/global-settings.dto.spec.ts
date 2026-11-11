import { validate } from 'class-validator';
import { LandingPageSettingsDto } from './dto';

describe('LandingPageSettingsDto package-plan selection', () => {
  it('accepts zero through three unique plan IDs', async () => {
    for (const packagePlanIds of [
      [],
      ['plan-1'],
      ['plan-1', 'plan-2', 'plan-3'],
    ]) {
      const dto = new LandingPageSettingsDto();
      dto.packagePlanIds = packagePlanIds;

      await expect(validate(dto)).resolves.toEqual([]);
    }
  });

  it('rejects more than three plan IDs', async () => {
    const dto = new LandingPageSettingsDto();
    dto.packagePlanIds = ['plan-1', 'plan-2', 'plan-3', 'plan-4'];

    const errors = await validate(dto);

    expect(errors[0]?.constraints).toHaveProperty('arrayMaxSize');
  });
});
