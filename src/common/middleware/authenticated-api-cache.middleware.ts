import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const CONDITIONAL_REQUEST_HEADERS = [
  'if-none-match',
  'if-modified-since',
] as const;
const AUTH_RESPONSE_PATH = /^(?:\/api\/v1)?\/auth(?:\/|$)/;

@Injectable()
export class AuthenticatedApiCacheMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestPath = request.originalUrl.split('?', 1)[0];
    const returnsAuthenticationData =
      request.method === 'POST' && AUTH_RESPONSE_PATH.test(requestPath);

    if (!request.headers.authorization && !returnsAuthenticationData) {
      next();
      return;
    }

    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');

    if (request.method === 'GET' || request.method === 'HEAD') {
      for (const header of CONDITIONAL_REQUEST_HEADERS) {
        delete request.headers[header];
      }
    }

    next();
  }
}
