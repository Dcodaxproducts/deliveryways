import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, ListAddressesDto, UpdateAddressDto } from './dto';

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUserContext, @Query() query: ListAddressesDto) {
    return this.addressesService.list(user, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.addressesService.remove(user, id);
  }
}
