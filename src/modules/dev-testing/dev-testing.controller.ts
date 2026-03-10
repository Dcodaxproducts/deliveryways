import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QueryDto } from '../../common/dto';
import { Public } from '../../common/decorators';
import { LoginDto, RegisterTenantDto } from '../auth/dto';
import { AuthService } from '../auth/auth.service';
import { ListPublicBranchesDto } from '../branches/dto';
import { BranchesService } from '../branches/branches.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

@ApiTags('DEV_TESTING')
@Controller('dev-testing')
@Public()
export class DevTestingController {
  constructor(
    private readonly authService: AuthService,
    private readonly restaurantsService: RestaurantsService,
    private readonly branchesService: BranchesService,
  ) {}

  private assertDevMode(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('DEV_TESTING endpoints are disabled in production');
    }
  }

  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto) {
    this.assertDevMode();
    return this.authService.registerTenant(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    this.assertDevMode();
    return this.authService.login(dto);
  }

  @Get('restaurants')
  listPublicRestaurants(@Query('tenantId') tenantId: string, @Query() query: QueryDto) {
    this.assertDevMode();
    return this.restaurantsService.listPublic(tenantId, query);
  }

  @Get('branches')
  listPublicBranches(@Query() query: ListPublicBranchesDto) {
    this.assertDevMode();
    return this.branchesService.listPublic(query);
  }
}
