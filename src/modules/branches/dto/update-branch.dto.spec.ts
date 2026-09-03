import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateBranchDto } from './update-branch.dto';

describe('UpdateBranchDto', () => {
  it('allows updating one branch admin field without resending the full admin', () => {
    const dto = plainToInstance(UpdateBranchDto, {
      name: 'Berlin Mitte',
      branchAdmin: {
        phone: '+49 30 1234567',
      },
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('validates a branch admin email when it is provided', () => {
    const dto = plainToInstance(UpdateBranchDto, {
      branchAdmin: {
        email: 'not-an-email',
      },
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('branchAdmin');
    expect(errors[0]?.children?.[0]?.property).toBe('email');
    expect(errors[0]?.children?.[0]?.constraints?.isEmail).toBe(
      'Enter a valid branch admin email address',
    );
  });
});
