import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
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
      code: 'INVALID_ENUM_VALUE',
      message:
        'status must be one of the following values: PLACED, CONFIRMED, DELIVERED',
      allowedValues: ['PLACED', 'CONFIRMED', 'DELIVERED'],
    });
  });

  it('returns a generic validation message with structured violations', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/admin/menu',
          headers: { 'accept-language': 'en' },
        }),
      }),
    };

    filter.catch(
      new BadRequestException([
        'property selectedMenuItems should not exist',
        'status must be one of the following values: ACTIVE, INACTIVE',
      ]),
      host as never,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Request validation failed',
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [
            {
              name: 'selectedMenuItems',
              code: 'FIELD_NOT_ALLOWED',
              message: 'property selectedMenuItems should not exist',
            },
            {
              name: 'status',
              code: 'INVALID_ENUM_VALUE',
              message:
                'status must be one of the following values: ACTIVE, INACTIVE',
              allowedValues: ['ACTIVE', 'INACTIVE'],
            },
          ],
        }) as unknown,
      }),
    );
  });

  it('adds stable modifier codes and localization params without changing legacy copy', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/cart/items',
          headers: { 'accept-language': 'en' },
        }),
      }),
    };

    filter.catch(
      new BadRequestException(
        'Choose Sauces requires at least 2 modifier selection(s)',
      ),
      host as never,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Choose Sauces requires at least 2 modifier selection(s)',
        error: expect.objectContaining({
          code: 'MODIFIER_MIN_SELECTIONS_NOT_MET',
          params: { groupName: 'Choose Sauces', minSelections: 2 },
        }) as unknown,
      }),
    );
  });

  it('keeps required field names out of user-facing copy', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/admin/reports',
          headers: { 'accept-language': 'en' },
        }),
      }),
    };

    filter.catch(
      new BadRequestException('restaurantId is required'),
      host as never,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Required information is missing',
        error: expect.objectContaining({
          code: 'REQUIRED_FIELD_MISSING',
          message: 'Required information is missing',
          params: { field: 'restaurantId' },
        }) as unknown,
      }),
    );
  });

  it('maps throttler responses to a stable 429 envelope', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/notifications/claim-pending-orders',
          headers: { 'accept-language': 'en' },
        }),
      }),
    };

    filter.catch(
      new HttpException('ThrottlerException: Too Many Requests', 429),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Too many requests. Please wait before trying again.',
        error: expect.objectContaining({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please wait before trying again.',
        }) as unknown,
      }),
    );
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

  it('localizes the minimum-order shortfall for German checkout requests', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/cart/checkout',
          headers: { 'accept-language': 'de-DE,de;q=0.9' },
        }),
      }),
    };

    filter.catch(
      new BadRequestException({
        message:
          'Subtotal is below zone minimum order amount. Add 4.00 more to checkout.',
        error: 'MINIMUM_ORDER_AMOUNT_NOT_MET',
        details: {
          scope: 'zone',
          subtotal: 8,
          minOrderAmount: 12,
          shortfall: 4,
        },
      }),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Der Mindestbestellwert ist noch nicht erreicht. Bitte bestellen Sie noch für 4,00 €',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        error: expect.objectContaining({
          code: 'MINIMUM_ORDER_AMOUNT_NOT_MET',
          message:
            'Der Mindestbestellwert ist noch nicht erreicht. Bitte bestellen Sie noch für 4,00 €',
          details: {
            scope: 'zone',
            subtotal: 8,
            minOrderAmount: 12,
            shortfall: 4,
          },
        }),
      }),
    );
  });

  it('localizes guest-contact errors without exposing DTO field names', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          url: '/api/v1/cart/checkout',
          headers: { 'accept-language': 'de-DE,de;q=0.9' },
        }),
      }),
    };

    filter.catch(
      new BadRequestException({
        message: 'Guest contact details are required to place this order.',
        error: 'GUEST_CONTACT_REQUIRED',
      }),
      host as never,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Bitte geben Sie die Kontaktdaten des Gastes ein, um die Bestellung abzuschließen.',
        error: expect.objectContaining({
          code: 'GUEST_CONTACT_REQUIRED',
          message:
            'Bitte geben Sie die Kontaktdaten des Gastes ein, um die Bestellung abzuschließen.',
        }) as unknown,
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('guestContact');
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
