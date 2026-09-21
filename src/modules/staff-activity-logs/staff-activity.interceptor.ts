import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { StaffActivityAction } from '@prisma/client';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthUserContext } from '../../common/decorators';
import { StaffActivityLogsService } from './staff-activity-logs.service';

type UnknownRecord = Record<string, unknown>;

interface StaffActivityRequest extends Request {
  user?: AuthUserContext;
}

const SENSITIVE_FIELD_PARTS = [
  'authorization',
  'card',
  'credential',
  'cvv',
  'otp',
  'password',
  'secret',
  'token',
];

const NON_CREATE_POST_ACTIONS = new Set([
  'approve',
  'cancel',
  'charge',
  'complete',
  'confirm',
  'login',
  'logout',
  'manual-paid',
  'publish',
  'refund',
  'reject',
  'restore',
  'send-email',
  'status',
  'unpublish',
]);

@Injectable()
export class StaffActivityInterceptor implements NestInterceptor {
  constructor(private readonly service: StaffActivityLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<StaffActivityRequest>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap((payload: unknown) => {
        if (response.statusCode >= 400) {
          return;
        }

        const identity = this.resolveStaffIdentity(request, payload);
        const action = this.resolveAction(request);
        if (!identity.staffUserId || !action) {
          return;
        }

        const module = this.resolveModule(request);
        const targetId = this.resolveTargetId(request, payload);
        const restaurantId =
          this.findString(
            [request.params, request.body, request.query, payload],
            ['restaurantId', 'rid'],
          ) ?? (module === 'restaurants' ? targetId : request.user?.rid);
        const branchId =
          this.findString(
            [request.params, request.body, request.query, payload],
            ['branchId', 'bid'],
          ) ?? (module === 'branches' ? targetId : request.user?.bid);

        void this.service.record({
          staffUserId: identity.staffUserId,
          action,
          module,
          targetType: module,
          targetId,
          restaurantId,
          branchId,
          httpMethod: request.method,
          requestPath: request.originalUrl.split('?')[0],
          statusCode: response.statusCode,
          ipAddress: this.resolveIpAddress(request),
          userAgent: request.get('user-agent'),
          changedFields: this.resolveChangedFields(request.body),
        });
      }),
    );
  }

  private resolveStaffIdentity(
    request: StaffActivityRequest,
    payload: unknown,
  ): { staffUserId?: string } {
    if (request.user?.actorType === 'STAFF') {
      return { staffUserId: request.user.uid };
    }

    if (!this.isStaffLogin(request)) {
      return {};
    }

    const user = this.findRecord(payload, ['user']);
    return user?.actorType === 'STAFF' && typeof user.id === 'string'
      ? { staffUserId: user.id }
      : {};
  }

  private resolveAction(
    request: StaffActivityRequest,
  ): StaffActivityAction | undefined {
    if (this.isStaffLogin(request)) {
      return StaffActivityAction.LOGIN;
    }

    if (request.user?.actorType !== 'STAFF') {
      return undefined;
    }

    const path = request.originalUrl.split('?')[0];
    if (request.method === 'POST' && path.endsWith('/auth/logout')) {
      return StaffActivityAction.LOGOUT;
    }

    if (request.method === 'PATCH' || request.method === 'PUT') {
      return StaffActivityAction.UPDATE;
    }
    if (request.method === 'DELETE') {
      return StaffActivityAction.DELETE;
    }
    if (request.method === 'POST') {
      const finalSegment = path.split('/').filter(Boolean).at(-1) ?? '';
      return NON_CREATE_POST_ACTIONS.has(finalSegment)
        ? StaffActivityAction.OTHER
        : StaffActivityAction.CREATE;
    }

    return undefined;
  }

  private isStaffLogin(request: StaffActivityRequest): boolean {
    const path = request.originalUrl.split('?')[0];
    return request.method === 'POST' && path.endsWith('/auth/staff/login');
  }

  private resolveModule(request: StaffActivityRequest): string {
    const segments = request.originalUrl
      .split('?')[0]
      .split('/')
      .filter(Boolean)
      .filter((segment) => !['api', 'v1', 'admin'].includes(segment));

    if (segments[0] === 'auth') {
      return 'authentication';
    }

    return segments[0] ?? 'platform';
  }

  private resolveTargetId(
    request: StaffActivityRequest,
    payload: unknown,
  ): string | undefined {
    const parameterId = this.findString(request.params, [
      'id',
      'orderId',
      'paymentId',
      'subscriptionId',
      'restaurantId',
    ]);
    return parameterId ?? this.findString(payload, ['id']);
  }

  private resolveChangedFields(body: unknown): string[] {
    if (!this.isRecord(body)) {
      return [];
    }

    return Object.keys(body).filter((field) => {
      const normalized = field.toLowerCase();
      return !SENSITIVE_FIELD_PARTS.some((part) => normalized.includes(part));
    });
  }

  private resolveIpAddress(request: StaffActivityRequest): string | undefined {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return request.ip;
  }

  private findRecord(
    source: unknown,
    keys: string[],
    depth = 0,
  ): UnknownRecord | undefined {
    if (depth > 4) {
      return undefined;
    }
    if (Array.isArray(source)) {
      for (const item of source.slice(0, 5)) {
        const match = this.findRecord(item, keys, depth + 1);
        if (match) return match;
      }
      return undefined;
    }
    if (!this.isRecord(source)) {
      return undefined;
    }

    for (const key of keys) {
      if (this.isRecord(source[key])) {
        return source[key];
      }
    }
    for (const value of Object.values(source)) {
      const match = this.findRecord(value, keys, depth + 1);
      if (match) return match;
    }
    return undefined;
  }

  private findString(
    source: unknown,
    keys: string[],
    depth = 0,
  ): string | undefined {
    if (depth > 4) {
      return undefined;
    }
    if (Array.isArray(source)) {
      for (const item of source.slice(0, 5)) {
        const match = this.findString(item, keys, depth + 1);
        if (match) return match;
      }
      return undefined;
    }
    if (!this.isRecord(source)) {
      return undefined;
    }

    for (const key of keys) {
      if (typeof source[key] === 'string' && source[key]) {
        return source[key];
      }
    }
    for (const value of Object.values(source)) {
      const match = this.findString(value, keys, depth + 1);
      if (match) return match;
    }
    return undefined;
  }

  private isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
  }
}
