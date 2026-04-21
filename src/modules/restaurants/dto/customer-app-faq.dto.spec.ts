import { validate } from 'class-validator';
import {
  CreateRestaurantCustomerAppFaqDto,
  UpdateRestaurantCustomerAppFaqDto,
} from './customer-app-faq.dto';

describe('RestaurantCustomerAppFaqDto validation', () => {
  it('rejects create payload with category outside allowed values', async () => {
    const dto = Object.assign(new CreateRestaurantCustomerAppFaqDto(), {
      question: 'How does this work?',
      answer: 'Like this.',
      category: 'Random',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'category')).toBe(true);
  });

  it('rejects update payload with category outside allowed values', async () => {
    const dto = Object.assign(new UpdateRestaurantCustomerAppFaqDto(), {
      category: 'Anything',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'category')).toBe(true);
  });
});
