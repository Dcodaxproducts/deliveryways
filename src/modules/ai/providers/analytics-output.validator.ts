import { AnalyticsExplanation } from '../domain/analytics-copilot.types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const readStringArray = (
  value: unknown,
  maxItems: number,
  maxLength: number,
) => {
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    !value.every((item) => isBoundedString(item, maxLength))
  )
    return null;
  return value.map((item) => item.trim());
};

export const validateAnalyticsExplanation = (
  value: unknown,
  allowedMetricIds: ReadonlySet<string>,
): AnalyticsExplanation | null => {
  if (!isRecord(value) || !isBoundedString(value.summary, 800)) return null;
  if (
    !Array.isArray(value.insights) ||
    value.insights.length < 1 ||
    value.insights.length > 5
  )
    return null;
  const insights: AnalyticsExplanation['insights'] = [];
  for (const raw of value.insights) {
    if (
      !isRecord(raw) ||
      !isBoundedString(raw.title, 120) ||
      !isBoundedString(raw.detail, 600)
    )
      return null;
    const evidenceMetricIds = readStringArray(raw.evidenceMetricIds, 8, 80);
    if (
      !evidenceMetricIds ||
      evidenceMetricIds.length === 0 ||
      evidenceMetricIds.some((id) => !allowedMetricIds.has(id))
    )
      return null;
    insights.push({
      title: raw.title.trim(),
      detail: raw.detail.trim(),
      evidenceMetricIds,
    });
  }
  const caveats = readStringArray(value.caveats, 5, 300);
  const followUpQuestions = readStringArray(value.followUpQuestions, 3, 200);
  if (!caveats || !followUpQuestions) return null;
  return {
    summary: value.summary.trim(),
    insights,
    caveats,
    followUpQuestions,
  };
};
