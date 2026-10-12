import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderMachineContext } from './winorder-machine-context';
import {
  WinOrderAdmissionService,
  WinOrderRateLimitException,
} from './winorder-admission.service';

@Injectable()
export class WinOrderBasicAuthGuard implements CanActivate {
  constructor(
    private readonly connectionService: WinOrderConnectionService,
    private readonly admission: WinOrderAdmissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string };
      winOrderMachine?: WinOrderMachineContext;
    }>();
    const response = http.getResponse<{
      setHeader(name: string, value: string): void;
    }>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    if (!value?.startsWith('Basic ')) {
      throw new UnauthorizedException('Invalid integration credentials');
    }

    const admission = this.admission.admitPreAuthentication(request, value);
    if (!admission.allowed) {
      response.setHeader('Retry-After', String(admission.retryAfterSeconds));
      throw new WinOrderRateLimitException(admission.retryAfterSeconds);
    }

    let decoded: string;
    try {
      decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
    } catch {
      throw new UnauthorizedException('Invalid integration credentials');
    }
    const separator = decoded.indexOf(':');
    if (separator <= 0) {
      throw new UnauthorizedException('Invalid integration credentials');
    }

    request.winOrderMachine = await this.connectionService.authenticate(
      decoded.slice(0, separator),
      decoded.slice(separator + 1),
    );
    return true;
  }
}
