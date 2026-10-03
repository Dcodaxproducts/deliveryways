import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  CreatePosPrinterAccountDto,
  ResetPosPrinterPasswordDto,
  UpdatePosPrinterStatusDto,
} from './dto';
import { PosPrinterService } from './pos-printer.service';

@ApiTags('POS Printer Accounts')
@ApiBearerAuth()
@Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN)
@Controller('pos-printer/accounts')
export class PosPrinterController {
  constructor(private readonly service: PosPrinterService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreatePosPrinterAccountDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUserContext) {
    return this.service.list(user);
  }

  @Get('branches')
  listBranches(@CurrentUser() user: AuthUserContext) {
    return this.service.listBranches(user);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdatePosPrinterStatusDto,
  ) {
    return this.service.updateStatus(user, id, dto);
  }

  @Patch(':id/password')
  resetPassword(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: ResetPosPrinterPasswordDto,
  ) {
    return this.service.resetPassword(user, id, dto);
  }
}
