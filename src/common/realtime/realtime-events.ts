export const REALTIME_REDIS_CHANNEL = 'deliveryways:realtime:v1';

export const RealtimeEventName = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_UPDATED: 'order.status.updated',
  ORDER_UPDATED: 'order.updated',
  ORDER_TRACKING_UPDATED: 'order.tracking.updated',
  CHAT_THREAD_CREATED: 'chat.thread.created',
  CHAT_THREAD_UPDATED: 'chat.thread.updated',
  CHAT_MESSAGE_CREATED: 'chat.message.created',
  CHAT_THREAD_READ: 'chat.thread.read',
} as const;

export type RealtimeEventName =
  (typeof RealtimeEventName)[keyof typeof RealtimeEventName];

export interface RealtimeEventEnvelope {
  version: 1;
  event: RealtimeEventName;
  payload: unknown;
  publishedAt: string;
}

export const RealtimeRooms = {
  orderTracking: (orderId: string): string => 'orders:tracking:' + orderId,
  tenantOrders: (tenantId: string): string => 'orders:tenant:' + tenantId,
  restaurantOrders: (restaurantId: string): string =>
    'orders:restaurant:' + restaurantId,
  branchOrders: (restaurantId: string, branchId: string): string =>
    'orders:restaurant:' + restaurantId + ':branch:' + branchId,
  chatThread: (threadId: string): string => 'chat:thread:' + threadId,
  chatCustomer: (customerId: string): string => 'chat:user:' + customerId,
  chatDeliveryman: (deliverymanId: string): string =>
    'chat:deliveryman:' + deliverymanId,
  chatTenant: (tenantId: string): string => 'chat:tenant:' + tenantId,
  chatBranch: (branchId: string): string => 'chat:branch:' + branchId,
  chatGlobal: (): string => 'chat:global',
};
