import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateGlobalSettingsDto } from './dto';

describe('UpdateGlobalSettingsDto', () => {
  it('accepts blank colors so existing theme colors can be cleared', async () => {
    const dto = plainToInstance(UpdateGlobalSettingsDto, {
      primaryColor: '  ',
      secondaryColor: '',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.primaryColor).toBe('');
    expect(dto.secondaryColor).toBe('');
  });

  it('returns readable validation messages for invalid colors', async () => {
    const dto = plainToInstance(UpdateGlobalSettingsDto, {
      primaryColor: 'orange',
      secondaryColor: '#12',
    });

    const errors = await validate(dto);
    const messages = Object.fromEntries(
      errors.map((error) => [error.property, error.constraints?.matches]),
    );

    expect(messages).toEqual({
      primaryColor: 'Primary color must be a valid hex color',
      secondaryColor: 'Secondary color must be a valid hex color',
    });
  });
});
