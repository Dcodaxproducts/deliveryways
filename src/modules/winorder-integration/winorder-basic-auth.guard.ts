import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderMachineContext } from './winorder-machine-context';

@Injectable()
export class WinOrderBasicAuthGuard implements CanActivate {
  constructor(private readonly connectionService: WinOrderConnectionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      winOrderMachine?: WinOrderMachineContext;
    }>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    if (!value?.startsWith('Basic ')) {
      throw new UnauthorizedException('Invalid integration credentials');
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
