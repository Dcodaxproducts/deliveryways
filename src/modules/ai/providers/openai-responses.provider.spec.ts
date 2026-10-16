/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-base-to-string */
import { ConfigService } from '@nestjs/config';
import { OpenAiResponsesProvider } from './openai-responses.provider';
import { AiProviderError } from './ai-provider.error';
import { AnalyticsIntent } from '../domain/analytics-copilot.types';

const request = {
  requestId: 'r',
  promptVersion: 'v1',
  locale: 'en' as const,
  question: 'Explain revenue',
  snapshot: {
    schemaVersion: 'analytics-copilot-v1' as const,
    intent: AnalyticsIntent.OVERVIEW,
    timezone: 'UTC',
    currency: 'EUR',
    period: { fromDate: '2026-10-10', toDate: '2026-10-16' },
    metrics: [
      { id: 'revenue', label: 'Revenue', value: 10, unit: 'currency' as const },
    ],
    paymentTypes: [],
    popularItems: [],
    busyHours: [],
    staffPerformance: [],
    definitions: [],
  },
  maxInputTokens: 4000,
  maxOutputTokens: 600,
  timeoutMs: 1000,
};
const config = (apiKey: string | null) =>
  new ConfigService({
    ai: {
      analyticsCopilot: {
        apiKey,
        model: 'model-1',
        allowedModels: ['model-1'],
        inputCostMicroUsdPerMillionTokens: 1000,
        outputCostMicroUsdPerMillionTokens: 2000,
      },
    },
  });

describe('OpenAiResponsesProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not issue a network call without a key', async () => {
    const network = jest.spyOn(globalThis, 'fetch');
    const provider = new OpenAiResponsesProvider(config(null));
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: 'AI_KEY_MISSING',
    });
    expect(network).not.toHaveBeenCalled();
  });

  it('uses a fixed endpoint, strict JSON schema, and parses fake structured output', async () => {
    const network = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            summary: 'Safe',
            insights: [
              {
                title: 'Revenue',
                detail: '10 EUR',
                evidenceMetricIds: ['revenue'],
              },
            ],
            caveats: [],
            followUpQuestions: [],
          }),
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiResponsesProvider(config('test-key'));
    const result = await provider.generate(request);
    expect(result).toMatchObject({
      provider: 'openai',
      model: 'model-1',
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(network).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    const call = network.mock.calls[0][1];
    const body = JSON.parse(String(call?.body));
    expect(body).not.toHaveProperty('tools');
    expect(String(body.instructions)).toContain('Respond in locale: en.');
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
    });
    expect(String(body.input[0].content[0].text)).toContain(
      '<untrusted_user_question>',
    );
  });

  it('maps provider errors without retrying', async () => {
    const network = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 429 }));
    const provider = new OpenAiResponsesProvider(config('test-key'));
    await expect(provider.generate(request)).rejects.toBeInstanceOf(
      AiProviderError,
    );
    expect(network).toHaveBeenCalledTimes(1);
  });
});
