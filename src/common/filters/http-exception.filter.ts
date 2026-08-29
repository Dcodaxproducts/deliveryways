import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

type ValidationErrorDetail = {
  name: string;
  message: string;
  allowedValues?: string[];
};

type ErrorDetails =
  | ValidationErrorDetail[]
  | Record<string, unknown>
  | undefined;

type ErrorLocale = 'de' | 'en';

const GERMAN_ERROR_MESSAGES: Record<string, string> = {
  'Delivery is not available at requested order time':
    'Eine Lieferung ist zur gewünschten Bestellzeit nicht verfügbar.',
  'Pickup is not available at requested order time':
    'Eine Abholung ist zur gewünschten Bestellzeit nicht verfügbar.',
  'Selected menu is not available at requested order time':
    'Das ausgewählte Menü ist zur gewünschten Bestellzeit nicht verfügbar.',
  'Payment transaction not found':
    'Die Zahlungstransaktion wurde nicht gefunden.',
  'Only charge transactions can be refunded':
    'Nur Belastungstransaktionen können erstattet werden.',
  'Only paid transactions can be refunded':
    'Nur bezahlte Transaktionen können erstattet werden.',
  'Refund amount cannot exceed charge amount':
    'Der Erstattungsbetrag darf den Belastungsbetrag nicht überschreiten.',
  'Refund amount exceeds remaining refundable amount':
    'Der Erstattungsbetrag übersteigt den noch erstattungsfähigen Betrag.',
};

const GERMAN_STATUS_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]:
    'Die Anfrage enthält ungültige oder unvollständige Daten.',
  [HttpStatus.UNAUTHORIZED]: 'Bitte melden Sie sich an, um fortzufahren.',
  [HttpStatus.FORBIDDEN]: 'Sie sind für diese Aktion nicht berechtigt.',
  [HttpStatus.NOT_FOUND]: 'Die angeforderte Ressource wurde nicht gefunden.',
  [HttpStatus.CONFLICT]:
    'Die Anfrage steht im Konflikt mit dem aktuellen Datenstand.',
  [HttpStatus.UNPROCESSABLE_ENTITY]:
    'Die übermittelten Daten konnten nicht verarbeitet werden.',
  [HttpStatus.TOO_MANY_REQUESTS]:
    'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
  [HttpStatus.BAD_GATEWAY]:
    'Der externe Dienst konnte die Anfrage nicht abschließen.',
  [HttpStatus.SERVICE_UNAVAILABLE]:
    'Der Dienst ist vorübergehend nicht verfügbar.',
  [HttpStatus.INTERNAL_SERVER_ERROR]:
    'Ein interner Serverfehler ist aufgetreten.',
};

const FIELD_LABELS: Record<string, string> = {
  restaurantId: 'restaurant',
  restaurant_id: 'restaurant',
  branchId: 'branch',
  branch_id: 'branch',
  tenantId: 'tenant',
  tenant_id: 'tenant',
  userId: 'user',
  user_id: 'user',
  email: 'email',
  phone: 'phone',
  slug: 'slug',
  sku: 'SKU',
  code: 'code',
  name: 'name',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private mapValidationMessage(rawMessage: string): ValidationErrorDetail {
    const inFieldMatch = rawMessage.match(/ in ([A-Za-z0-9_.[\]-]+)\s+must\b/i);
    const directFieldMatch = rawMessage.match(
      /^([A-Za-z0-9_.[\]-]+)\s+must\b/i,
    );

    const name = inFieldMatch?.[1] ?? directFieldMatch?.[1] ?? 'field';
    const enumMatch = rawMessage.match(
      /^([A-Za-z0-9_.[\]-]+) must be one of the following values:\s*(.+)$/i,
    );

    if (enumMatch) {
      const allowedValues = enumMatch[2]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      return {
        name,
        message: `${name} must be one of the following values: ${allowedValues.join(', ')}`,
        allowedValues,
      };
    }

    const mustIndex = rawMessage.toLowerCase().indexOf(' must ');
    const reason =
      mustIndex >= 0 ? rawMessage.slice(mustIndex + 1).trim() : rawMessage;
    const message = reason.startsWith('must')
      ? `${name} ${reason}`
      : rawMessage;

    return { name, message };
  }

  private resolveLocale(value: string | string[] | undefined): ErrorLocale {
    const language = Array.isArray(value) ? value[0] : value;
    return language?.trim().toLowerCase().startsWith('de') ? 'de' : 'en';
  }

  private localizeMessage(
    message: string,
    status: number,
    locale: ErrorLocale,
  ): string {
    if (locale !== 'de') return message;

    return (
      GERMAN_ERROR_MESSAGES[message] ??
      GERMAN_STATUS_MESSAGES[status] ??
      (status >= 500
        ? GERMAN_STATUS_MESSAGES[HttpStatus.INTERNAL_SERVER_ERROR]
        : GERMAN_STATUS_MESSAGES[HttpStatus.BAD_REQUEST])
    );
  }

  private localizeValidationDetails(
    details: ValidationErrorDetail[],
    locale: ErrorLocale,
  ): ValidationErrorDetail[] {
    if (locale !== 'de') return details;

    return details.map((detail) => ({
      ...detail,
      message: detail.allowedValues?.length
        ? `Für ${this.normalizeFieldLabel(detail.name)} ist nur einer dieser Werte erlaubt: ${detail.allowedValues.join(', ')}`
        : `${this.normalizeFieldLabel(detail.name)} ist ungültig.`,
    }));
  }

  private normalizeFieldLabel(field: string): string {
    const cleaned = field.replace(/["'`]/g, '').trim();
    return (
      FIELD_LABELS[cleaned] ??
      cleaned
        .replace(/_id$/i, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .trim()
        .toLowerCase()
    );
  }

  private buildUniqueConstraintMessage(fields: string[]): string {
    const normalized = fields.map((field) => this.normalizeFieldLabel(field));

    if (normalized.includes('email') && normalized.includes('restaurant')) {
      return 'A record with this email already exists in this restaurant';
    }

    if (normalized.includes('phone') && normalized.includes('branch')) {
      return 'A record with this phone already exists in this branch';
    }

    if (normalized.length === 1) {
      return `A record with this ${normalized[0]} already exists`;
    }

    return `A record with this combination of ${normalized.join(', ')} already exists`;
  }

  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = Array.isArray(exception.meta?.target)
          ? (exception.meta?.target as string[])
          : [];
        const messageTargetMatch = exception.message.match(
          /fields:\s*\(`([^`]+)`\)/i,
        );
        const fallbackField = messageTargetMatch?.[1] ?? null;
        const rawFields =
          target.length > 0
            ? target
            : fallbackField
              ? fallbackField.split(',').map((field) => field.trim())
              : ['field'];

        return {
          status: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: this.buildUniqueConstraintMessage(rawFields),
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RECORD_NOT_FOUND',
          message:
            'The requested resource was not found or may have been deleted',
        };
      case 'P1000':
      case 'P1001':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'DATABASE_CONNECTION_ERROR',
          message: 'Database is temporarily unavailable',
        };
      default:
        this.logger.error(
          `Unhandled Prisma error: ${exception.code} ${exception.message}`,
        );

        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'DATABASE_ERROR',
          message: 'Database operation failed',
        };
    }
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: ErrorDetails;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        const responseMessage = resp.message;

        if (Array.isArray(responseMessage)) {
          details = responseMessage
            .filter((item): item is string => typeof item === 'string')
            .map((item) => this.mapValidationMessage(item));

          if (details.length > 0) {
            message = details[0].message;
            code = 'VALIDATION_ERROR';
          }
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
        }

        if ('details' in resp) {
          const responseDetails = resp.details;
          if (
            Array.isArray(responseDetails) ||
            (typeof responseDetails === 'object' && responseDetails !== null)
          ) {
            details = responseDetails as ErrorDetails;
          }
        }

        if (code !== 'VALIDATION_ERROR') {
          code = (resp.error as string) || code;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception);
      status = mapped.status;
      message = mapped.message;
      code = mapped.code;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }

    const locale = this.resolveLocale(request.headers['accept-language']);
    if (Array.isArray(details)) {
      details = this.localizeValidationDetails(details, locale);
    }
    message = this.localizeMessage(message, status, locale);

    response.status(status).json({
      success: false,
      message,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
