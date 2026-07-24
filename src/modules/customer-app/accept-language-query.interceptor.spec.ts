import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { AcceptLanguageQueryInterceptor } from './accept-language-query.interceptor';

describe('AcceptLanguageQueryInterceptor', () => {
  const next: CallHandler = {
    handle: () => of({ success: true }),
  };

  const createContext = (
    url: string,
    acceptLanguage?: string,
  ): {
    context: ExecutionContext;
    request: {
      url: string;
      headers: Record<string, string | undefined>;
    };
  } => {
    const request = {
      url,
      headers: {
        'accept-language': acceptLanguage,
      },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  };

  it('adds the preferred Accept-Language locale to the query string', () => {
    const interceptor = new AcceptLanguageQueryInterceptor();
    const { context, request } = createContext(
      '/customer-app/home?restaurantId=restaurant-1',
      'en-US;q=0.8, de-DE;q=0.9',
    );

    interceptor.intercept(context, next);

    expect(request.url).toBe(
      '/customer-app/home?restaurantId=restaurant-1&locale=de',
    );
  });

  it('preserves an explicit locale query parameter', () => {
    const interceptor = new AcceptLanguageQueryInterceptor();
    const { context, request } = createContext(
      '/customer-app/home?restaurantId=restaurant-1&locale=en',
      'de',
    );

    interceptor.intercept(context, next);

    expect(request.url).toBe(
      '/customer-app/home?restaurantId=restaurant-1&locale=en',
    );
  });

  it('ignores invalid and wildcard language values', () => {
    const interceptor = new AcceptLanguageQueryInterceptor();
    const { context, request } = createContext(
      '/customer-app/home',
      '*, invalid locale',
    );

    interceptor.intercept(context, next);

    expect(request.url).toBe('/customer-app/home');
  });
});
