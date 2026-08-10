import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface WinOrderMachineContext {
  connectionId: string;
  tenantId: string;
  restaurantId: string;
  branchId: string;
  storeId: number | null;
}

export const WinOrderMachine = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WinOrderMachineContext => {
    const request = context.switchToHttp().getRequest<{
      winOrderMachine: WinOrderMachineContext;
    }>();
    return request.winOrderMachine;
  },
);
