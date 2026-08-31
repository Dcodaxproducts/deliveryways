import { BadRequestException } from '@nestjs/common';
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

  it('localizes known API errors from the global Accept-Language contract', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/orders',
          headers: { 'accept-language': 'de-DE,de;q=0.9' },
        }),
      }),
    };

    filter.catch(
      new BadRequestException(
        'Delivery is not available at requested order time',
      ),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Eine Lieferung ist zur gewünschten Bestellzeit nicht verfügbar.',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        error: expect.objectContaining({
          message:
            'Eine Lieferung ist zur gewünschten Bestellzeit nicht verfügbar.',
        }),
      }),
    );
  });

  it('never returns an untranslated domain error to German clients', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/example',
          headers: { 'accept-language': 'de' },
        }),
      }),
    };

    filter.catch(
      new BadRequestException('Some future English domain error'),
      host as never,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Die Anfrage enthält ungültige oder unvollständige Daten.',
      }),
    );
  });
});
