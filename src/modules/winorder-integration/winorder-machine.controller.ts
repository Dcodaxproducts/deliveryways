import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { WinOrderBasicAuthGuard } from './winorder-basic-auth.guard';
import {
  WinOrderMachine,
  WinOrderMachineContext,
} from './winorder-machine-context';
import { WinOrderPollingService } from './winorder-polling.service';
import { WinOrderTrackingStatusDto } from './dto';
import { WinOrderStatusService } from './winorder-status.service';

@Public()
@ApiTags('WinOrder Machine API')
@ApiBasicAuth()
@Controller('winorder')
@UseGuards(WinOrderBasicAuthGuard)
export class WinOrderMachineController {
  constructor(
    private readonly pollingService: WinOrderPollingService,
    private readonly statusService: WinOrderStatusService,
  ) {}

  @Get('GetNewOrders')
  getNewOrders(@WinOrderMachine() machine: WinOrderMachineContext) {
    return this.pollingService.getNewOrders(machine);
  }

  @Post('SendTrackingStatus')
  sendTrackingStatus(
    @WinOrderMachine() machine: WinOrderMachineContext,
    @Headers('username') username: string | undefined,
    @Headers('password') password: string | undefined,
    @Body() dto: WinOrderTrackingStatusDto,
  ) {
    return this.statusService.process(machine, username, password, dto);
  }
}
