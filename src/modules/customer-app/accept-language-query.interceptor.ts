import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { normalizeLocaleStrict } from '../localizations';

@Injectable()
export class AcceptLanguageQueryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestUrl = new URL(request.url, 'http://localhost');

    if (!requestUrl.searchParams.has('locale')) {
      const locale = this.resolveHeaderLocale(
        request.headers['accept-language'],
      );

      if (locale) {
        requestUrl.searchParams.set('locale', locale);
        request.url = `${requestUrl.pathname}${requestUrl.search}`;
      }
    }

    return next.handle();
  }

  private resolveHeaderLocale(
    headerValue: string | string[] | undefined,
  ): string | undefined {
    const header = Array.isArray(headerValue)
      ? headerValue.join(',')
      : headerValue;

    if (!header) {
      return undefined;
    }

    const candidates = header
      .split(',')
      .map((part, index) => {
        const [languageTag = '', ...parameters] = part.split(';');
        const qualityParameter = parameters.find((parameter) =>
          parameter.trim().startsWith('q='),
        );
        const quality = qualityParameter
          ? Number(qualityParameter.trim().slice(2))
          : 1;

        return {
          languageTag: languageTag.trim(),
          quality: Number.isFinite(quality) ? quality : 0,
          index,
        };
      })
      .filter(
        (candidate) =>
          candidate.languageTag.length > 0 &&
          candidate.languageTag !== '*' &&
          candidate.quality > 0,
      )
      .sort(
        (left, right) =>
          right.quality - left.quality || left.index - right.index,
      );

    for (const candidate of candidates) {
      try {
        const locale = normalizeLocaleStrict(candidate.languageTag);

        if (locale === 'de' || locale.startsWith('de-')) {
          return 'de';
        }

        if (locale === 'en' || locale.startsWith('en-')) {
          return 'en';
        }

        return locale;
      } catch {
        continue;
      }
    }

    return undefined;
  }
}
