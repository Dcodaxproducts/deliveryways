import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
import {
  WinOrderAdmissionService,
  WinOrderRateLimitException,
} from './winorder-admission.service';

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
    private readonly admission: WinOrderAdmissionService,
  ) {}

  @Get('GetNewOrders')
  async getNewOrders(
    @WinOrderMachine() machine: WinOrderMachineContext,
    @Param() route: WinOrderStoreRouteDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.connectionService.assertStoreRoute(machine, route.storeId);
    try {
      return await this.admission.executePoll(machine.connectionId, () =>
        this.pollingService.getNewOrders(machine),
      );
    } catch (error) {
      if (error instanceof WinOrderRateLimitException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
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
