import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('extracts allowed enum values from validation messages', () => {
    const filter = new GlobalExceptionFilter();
    const result = (
      filter as unknown as {
        mapValidationMessage: (message: string) => {
          name: string;
          message: string;
          allowedValues?: string[];
        };
      }
    ).mapValidationMessage(
      'status must be one of the following values: PLACED, CONFIRMED, DELIVERED',
    );

    expect(result).toEqual({
      name: 'status',
      message:
        'status must be one of the following values: PLACED, CONFIRMED, DELIVERED',
      allowedValues: ['PLACED', 'CONFIRMED', 'DELIVERED'],
    });
  });
});
