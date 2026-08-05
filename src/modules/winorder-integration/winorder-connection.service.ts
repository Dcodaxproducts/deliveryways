import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  CreateWinOrderConnectionDto,
  UpdateWinOrderConnectionDto,
} from './dto';
import {
  WinOrderConnectionRepository,
  WinOrderConnectionScope,
} from './winorder-connection.repository';
import { WinOrderMachineContext } from './winorder-machine-context';

const INVALID_CREDENTIAL_HASH =
  '$2b$12$y1sgTSFF4V9ES.9URMh55e0eI4graIsv335Sl18QrpAslPhp9d62a';

@Injectable()
export class WinOrderConnectionService {
  constructor(private readonly repository: WinOrderConnectionRepository) {}

  async get(user: AuthUserContext, branchId: string) {
    const scope = await this.resolveAuthorizedScope(user, branchId, false);
    const connection = await this.repository.findByBranch(scope);

    return {
      data: connection ? this.withEndpoint(connection) : null,
      message: 'WinOrder connection fetched successfully',
    };
  }

  async create(user: AuthUserContext, dto: CreateWinOrderConnectionDto) {
    const scope = await this.resolveAuthorizedScope(user, dto.branchId, true);
    if (await this.repository.findByBranch(scope)) {
      throw new ConflictException('WinOrder connection already exists');
    }

    const credentials = this.generateCredentials(scope.branchId);
    const connection = await this.repository.create(scope, {
      ...credentials,
      passwordHash: await bcrypt.hash(credentials.password, 12),
      storeId: dto.storeId,
      storeName: dto.storeName,
      actorId: user.uid,
    });

    return {
      data: {
        ...this.withEndpoint(connection),
        password: credentials.password,
        passwordVisibleOnce: true,
      },
      message: 'WinOrder connection created successfully',
    };
  }

  async update(
    user: AuthUserContext,
    branchId: string,
    dto: UpdateWinOrderConnectionDto,
  ) {
    const scope = await this.resolveAuthorizedScope(user, branchId, true);
    await this.requireConnection(scope);
    await this.repository.update(scope, { ...dto, actorId: user.uid });

    return this.get(user, branchId);
  }

  async rotate(user: AuthUserContext, branchId: string) {
    const scope = await this.resolveAuthorizedScope(user, branchId, true);
    await this.requireConnection(scope);
    const credentials = this.generateCredentials(scope.branchId);
    await this.repository.rotate(scope, {
      username: credentials.username,
      passwordHash: await bcrypt.hash(credentials.password, 12),
      actorId: user.uid,
    });
    const connection = await this.repository.findByBranch(scope);

    return {
      data: {
        ...this.withEndpoint(connection!),
        password: credentials.password,
        passwordVisibleOnce: true,
      },
      message: 'WinOrder credentials rotated successfully',
    };
  }

  async authenticate(
    username: string,
    password: string,
  ): Promise<WinOrderMachineContext> {
    const connection = await this.repository.findAuthenticationRecord(username);
    const valid = await bcrypt.compare(
      password,
      connection?.passwordHash ?? INVALID_CREDENTIAL_HASH,
    );

    if (!connection || !valid) {
      throw new UnauthorizedException('Invalid integration credentials');
    }

    return {
      connectionId: connection.id,
      tenantId: connection.tenantId,
      restaurantId: connection.restaurantId,
      branchId: connection.branchId,
    };
  }

  private async requireConnection(scope: WinOrderConnectionScope) {
    const connection = await this.repository.findByBranch(scope);
    if (!connection) {
      throw new NotFoundException('WinOrder connection not found');
    }
    return connection;
  }

  private async resolveAuthorizedScope(
    user: AuthUserContext,
    branchId: string,
    mutation: boolean,
  ): Promise<WinOrderConnectionScope> {
    const branch = await this.repository.findBranch(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return this.toScope(branch);
    }

    if (!user.tid || branch.tenantId !== user.tid) {
      throw new ForbiddenException('Branch is outside the tenant scope');
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (mutation || (user.bid ?? user.branchId) !== branch.id) {
        throw new ForbiddenException('Branch access denied');
      }
      return this.toScope(branch);
    }

    if (user.role !== UserRoleEnum.BUSINESS_ADMIN) {
      throw new ForbiddenException('WinOrder administration access denied');
    }

    const restaurantAccess = user.restaurantAccess;
    const canAccessRestaurant =
      user.rid === branch.restaurantId ||
      restaurantAccess?.allRestaurants === true ||
      restaurantAccess?.hasAllRestaurantsAccess === true ||
      restaurantAccess?.restaurantIds?.includes(branch.restaurantId) === true;
    if (!canAccessRestaurant) {
      throw new ForbiddenException('Restaurant access denied');
    }

    return this.toScope(branch);
  }

  private generateCredentials(branchId: string) {
    return {
      username: `wo_${branchId.slice(-8)}_${randomBytes(5).toString('hex')}`,
      password: randomBytes(32).toString('base64url'),
    };
  }

  private toScope(branch: {
    id: string;
    tenantId: string;
    restaurantId: string;
  }): WinOrderConnectionScope {
    return {
      tenantId: branch.tenantId,
      restaurantId: branch.restaurantId,
      branchId: branch.id,
    };
  }

  private withEndpoint<T>(connection: T) {
    return { ...connection, endpointPath: '/winorder' };
  }
}
