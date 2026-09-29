import { SetMetadata } from '@nestjs/common';

export const POS_PRINTER_ACCESS_KEY = 'posPrinterAccess';

export const PosPrinterAccess = () => SetMetadata(POS_PRINTER_ACCESS_KEY, true);
