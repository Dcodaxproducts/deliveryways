export const ORDERS_INTEGRATION_PORT = Symbol('ORDERS_INTEGRATION_PORT');

export type IntegrationOrderStatus =
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'READY_TO_SERVE'
  | 'SERVED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export interface IntegrationScope {
  tenantId: string;
  restaurantId: string;
  branchId: string;
}

export interface IntegrationOrderModifier {
  modifierId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface IntegrationOrderSection {
  slot: 'LEFT' | 'RIGHT';
  menuItemId: string;
  menuItemName: string;
  unitPrice: number;
}

export interface IntegrationOrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  variationId: string | null;
  variationName: string | null;
  quantity: number;
  unitPrice: number;
  depositAmount: number;
  lineTotal: number;
  taxPercentage: number | null;
  note: string | null;
  dealId: string | null;
  modifiers: IntegrationOrderModifier[];
  sections: IntegrationOrderSection[];
}

export interface IntegrationOrder {
  id: string;
  orderType: 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';
  paymentMethod: string;
  paymentStatus: string;
  orderTime: Date | null;
  createdAt: Date;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  serviceChargeAmount: number;
  tipAmount: number;
  discountAmount: number;
  totalAmount: number;
  customerNote: string | null;
  customer: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  deliveryAddress: {
    street: string;
    area: string | null;
    postalCode: string | null;
    city: string;
    state: string;
    country: string;
  } | null;
  paymentReference: string | null;
  currency: string | null;
  items: IntegrationOrderItem[];
}

export interface ApplyIntegrationOrderStatusInput extends IntegrationScope {
  orderId: string;
  status: IntegrationOrderStatus;
  estimatedPreparationMinutes?: number;
  estimatedCompletionAt?: Date;
}

export interface OrdersIntegrationPort {
  listExportCandidates(
    scope: IntegrationScope,
    limit: number,
  ): Promise<IntegrationOrder[]>;
  applyStatus(input: ApplyIntegrationOrderStatusInput): Promise<void>;
}
