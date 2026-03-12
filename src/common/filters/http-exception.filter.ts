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
    const mustIndex = rawMessage.toLowerCase().indexOf(' must ');
    const reason =
      mustIndex >= 0 ? rawMessage.slice(mustIndex + 1).trim() : rawMessage;
    const message = reason.startsWith('must')
      ? `${name} ${reason}`
      : rawMessage;

    return { name, message };
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
        const fieldLabel =
          target.length > 0 ? target.join(', ') : (fallbackField ?? 'field');

        return {
          status: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: `${fieldLabel} already exists`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RECORD_NOT_FOUND',
          message: 'Requested record was not found',
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
    let details: ValidationErrorDetail[] | undefined;

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
