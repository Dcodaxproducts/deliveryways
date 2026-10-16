import { ANALYTICS_DEVELOPER_PROMPT } from '../prompts/analytics.prompt';
import { validateAnalyticsExplanation } from './analytics-output.validator';

describe('validateAnalyticsExplanation', () => {
  const allowed = new Set(['revenue', 'successful_orders']);

  it('accepts bounded structured explanations with valid evidence', () => {
    expect(
      validateAnalyticsExplanation(
        {
          summary: 'Revenue increased.',
          insights: [
            {
              title: 'Revenue',
              detail: 'The snapshot reports revenue.',
              evidenceMetricIds: ['revenue'],
            },
          ],
          caveats: [],
          followUpQuestions: ['Compare periods?'],
        },
        allowed,
      ),
    ).toMatchObject({ summary: 'Revenue increased.' });
  });

  it('rejects malformed output and invented evidence IDs', () => {
    expect(
      validateAnalyticsExplanation(
        { summary: 'x', insights: [], caveats: [], followUpQuestions: [] },
        allowed,
      ),
    ).toBeNull();
    expect(
      validateAnalyticsExplanation(
        {
          summary: 'x',
          insights: [
            { title: 'x', detail: 'x', evidenceMetricIds: ['drop_tables'] },
          ],
          caveats: [],
          followUpQuestions: [],
        },
        allowed,
      ),
    ).toBeNull();
  });

  it('pins prompt-injection text beneath higher-priority snapshot-only rules', () => {
    expect(ANALYTICS_DEVELOPER_PROMPT).toContain('untrusted data');
    expect(ANALYTICS_DEVELOPER_PROMPT).toContain('Never invent numbers');
    expect(ANALYTICS_DEVELOPER_PROMPT).toContain('evidenceMetricIds');
  });
});
