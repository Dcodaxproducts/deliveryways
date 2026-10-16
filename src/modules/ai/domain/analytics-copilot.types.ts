export enum AnalyticsIntent {
  OVERVIEW = 'OVERVIEW',
  REVENUE = 'REVENUE',
  BUSY_HOURS = 'BUSY_HOURS',
  CANCELLATIONS = 'CANCELLATIONS',
  PAYMENT_TYPES = 'PAYMENT_TYPES',
  POPULAR_ITEMS = 'POPULAR_ITEMS',
  STAFF_PERFORMANCE = 'STAFF_PERFORMANCE',
}
export enum AnalyticsPeriodPreset {
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS',
  CUSTOM = 'CUSTOM',
}
export enum AnalyticsComparison {
  NONE = 'NONE',
  PREVIOUS_PERIOD = 'PREVIOUS_PERIOD',
}
export interface AnalyticsScope {
  tenantId: string;
  restaurantId: string;
  branchId: string | null;
  ownerUserId: string;
}
export interface AnalyticsDateRange {
  fromDate: string;
  toDate: string;
  startUtc: Date;
  endExclusiveUtc: Date;
  dayCount: number;
}
export interface AnalyticsMetric {
  id: string;
  label: string;
  value: number;
  unit: 'currency' | 'count' | 'percent' | 'hour';
  comparisonValue?: number;
  changePercent?: number | null;
}
export interface AnalyticsPeriodSnapshot {
  sales: {
    successfulOrders: number;
    revenue: number;
    averageOrderValue: number;
  };
  cancellations: {
    cancelledOrders: number;
    consideredOrders: number;
    rate: number;
  };
  paymentTypes: Array<{
    paymentMethod: string;
    count: number;
    revenue: number;
  }>;
  popularItems: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  busyHours: Array<{ hour: number; orderCount: number; revenue: number }>;
  staffPerformance: Array<{
    staffRef: string;
    displayName: string;
    activityCount: number;
  }>;
}
export interface AnalyticsProviderSnapshot {
  schemaVersion: 'analytics-copilot-v1';
  intent: AnalyticsIntent;
  timezone: string;
  currency: string;
  period: { fromDate: string; toDate: string };
  metrics: AnalyticsMetric[];
  paymentTypes: AnalyticsPeriodSnapshot['paymentTypes'];
  popularItems: AnalyticsPeriodSnapshot['popularItems'];
  busyHours: AnalyticsPeriodSnapshot['busyHours'];
  staffPerformance: Array<{ staffRef: string; activityCount: number }>;
  definitions: string[];
}
export interface AnalyticsExplanation {
  summary: string;
  insights: Array<{
    title: string;
    detail: string;
    evidenceMetricIds: string[];
  }>;
  caveats: string[];
  followUpQuestions: string[];
}
export interface AnalyticsCopilotResponse {
  requestId: string;
  mode: 'AI' | 'DETERMINISTIC_FALLBACK';
  intent: AnalyticsIntent;
  generatedAt: string;
  period: { fromDate: string; toDate: string; timezone: string };
  comparison: { fromDate: string; toDate: string } | null;
  currency: string;
  answer: AnalyticsExplanation;
  evidence: {
    metrics: AnalyticsMetric[];
    paymentTypes: AnalyticsPeriodSnapshot['paymentTypes'];
    popularItems: AnalyticsPeriodSnapshot['popularItems'];
    busyHours: AnalyticsPeriodSnapshot['busyHours'];
    staffPerformance: AnalyticsPeriodSnapshot['staffPerformance'];
    definitions: string[];
  };
  fallbackReason?: string;
}
export interface AiTextGenerationRequest {
  requestId: string;
  promptVersion: string;
  locale: 'en' | 'de';
  question: string;
  snapshot: AnalyticsProviderSnapshot;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
}
export interface AiTextGenerationResult {
  output: unknown;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicroUsd: number;
  latencyMs: number;
}
export interface AiTextProvider {
  isConfigured(): boolean;
  generate(request: AiTextGenerationRequest): Promise<AiTextGenerationResult>;
}
export const AI_TEXT_PROVIDER = Symbol('AI_TEXT_PROVIDER');
