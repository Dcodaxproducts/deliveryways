import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUserContext } from '../../common/decorators';
import { WinOrderConnectionRepository } from './winorder-connection.repository';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderHealthRepository } from './winorder-health.repository';

@Injectable()
export class WinOrderHealthService {
  constructor(
    private readonly connectionService: WinOrderConnectionService,
    private readonly connectionRepository: WinOrderConnectionRepository,
    private readonly healthRepository: WinOrderHealthRepository,
  ) {}

  async get(user: AuthUserContext, branchId: string) {
    const scope = await this.connectionService.resolveAdminScope(
      user,
      branchId,
    );
    const connection = await this.connectionRepository.findByBranch(scope);
    if (!connection) {
      throw new NotFoundException('WinOrder connection not found');
    }
    const health = await this.healthRepository.get(scope, connection.id);
    return {
      data: {
        connection,
        ...health,
      },
      message: 'WinOrder health fetched successfully',
    };
  }

  async retryFailed(user: AuthUserContext, branchId: string) {
    const scope = await this.connectionService.resolveAdminScope(
      user,
      branchId,
      true,
    );
    const connection = await this.connectionRepository.findByBranch(scope);
    if (!connection) {
      throw new NotFoundException('WinOrder connection not found');
    }
    const count = await this.healthRepository.retryFailed(scope, connection.id);
    return {
      data: { retried: count },
      message: 'Eligible WinOrder exports queued for retry',
    };
  }
}
