import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiTags } from '@nestjs/swagger';
import { Public, RawResponse } from '../../common/decorators';
import { WinOrderBasicAuthGuard } from './winorder-basic-auth.guard';
import {
  WinOrderMachine,
  WinOrderMachineContext,
} from './winorder-machine-context';
import { WinOrderPollingService } from './winorder-polling.service';
import { WinOrderStoreRouteDto, WinOrderTrackingStatusDto } from './dto';
import { WinOrderConnectionService } from './winorder-connection.service';
import { WinOrderStatusService } from './winorder-status.service';

@Public()
@ApiTags('WinOrder Machine API')
@ApiBasicAuth()
@RawResponse()
@Controller(['winorder', 'winorder/:storeId'])
@UseGuards(WinOrderBasicAuthGuard)
export class WinOrderMachineController {
  constructor(
    private readonly pollingService: WinOrderPollingService,
    private readonly statusService: WinOrderStatusService,
    private readonly connectionService: WinOrderConnectionService,
  ) {}

  @Get('GetNewOrders')
  getNewOrders(
    @WinOrderMachine() machine: WinOrderMachineContext,
    @Param() route: WinOrderStoreRouteDto,
  ) {
    this.connectionService.assertStoreRoute(machine, route.storeId);
    return this.pollingService.getNewOrders(machine);
  }

  @Post('SendTrackingStatus')
  sendTrackingStatus(
    @WinOrderMachine() machine: WinOrderMachineContext,
    @Param() route: WinOrderStoreRouteDto,
    @Headers('username') username: string | undefined,
    @Headers('password') password: string | undefined,
    @Body() dto: WinOrderTrackingStatusDto,
  ) {
    this.connectionService.assertStoreRoute(machine, route.storeId);
    return this.statusService.process(machine, username, password, dto);
  }
}
