import { ConfigService } from '@nestjs/config';
import { ANALYTICS_DEVELOPER_PROMPT } from '../prompts/analytics.prompt';
import {
  AiTextGenerationRequest,
  AiTextGenerationResult,
  AiTextProvider,
} from '../domain/analytics-copilot.types';
import { AiProviderError } from './ai-provider.error';

interface OpenAiConfig {
  apiKey: string | null;
  model: string;
  allowedModels: string[];
  inputCostMicroUsdPerMillionTokens: number;
  outputCostMicroUsdPerMillionTokens: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class OpenAiResponsesProvider implements AiTextProvider {
  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(this.config().apiKey);
  }

  async generate(
    request: AiTextGenerationRequest,
  ): Promise<AiTextGenerationResult> {
    const config = this.config();
    if (!config.apiKey)
      throw new AiProviderError('AI_KEY_MISSING', 'AI provider key is missing');
    if (!config.allowedModels.includes(config.model))
      throw new AiProviderError(
        'AI_MODEL_NOT_ALLOWED',
        'Configured model is not allowed',
      );
    const input = JSON.stringify({
      question: request.question,
      snapshot: request.snapshot,
    });
    if (
      Math.ceil((ANALYTICS_DEVELOPER_PROMPT.length + input.length) / 4) >
      request.maxInputTokens
    )
      throw new AiProviderError(
        'AI_INPUT_TOO_LARGE',
        'AI input exceeds the configured token bound',
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await globalThis.fetch(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + config.apiKey,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model,
            instructions:
              ANALYTICS_DEVELOPER_PROMPT +
              ' Respond in locale: ' +
              request.locale +
              '.',
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text:
                      '<untrusted_user_question>' +
                      request.question +
                      '</untrusted_user_question>\n<analytics_snapshot>' +
                      JSON.stringify(request.snapshot) +
                      '</analytics_snapshot>',
                  },
                ],
              },
            ],
            max_output_tokens: request.maxOutputTokens,
            text: {
              format: {
                type: 'json_schema',
                name: 'analytics_explanation',
                strict: true,
                schema: this.outputSchema(),
              },
            },
          }),
        },
      );
      if (!response.ok)
        throw new AiProviderError(
          'AI_PROVIDER_HTTP_ERROR',
          'AI provider returned HTTP ' + response.status,
        );
      const body: unknown = await response.json();
      const outputText = this.readOutputText(body);
      if (!outputText)
        throw new AiProviderError(
          'AI_PROVIDER_EMPTY_OUTPUT',
          'AI provider returned no structured output',
        );
      let output: unknown;
      try {
        output = JSON.parse(outputText);
      } catch {
        throw new AiProviderError(
          'AI_PROVIDER_MALFORMED_OUTPUT',
          'AI provider returned malformed JSON',
        );
      }
      const usage = this.readUsage(body);
      const estimatedCostMicroUsd = Math.ceil(
        (usage.inputTokens * config.inputCostMicroUsdPerMillionTokens +
          usage.outputTokens * config.outputCostMicroUsdPerMillionTokens) /
          1_000_000,
      );
      return {
        output,
        provider: 'openai',
        model: config.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostMicroUsd,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError')
        throw new AiProviderError(
          'AI_PROVIDER_TIMEOUT',
          'AI provider request timed out',
        );
      throw new AiProviderError(
        'AI_PROVIDER_ERROR',
        'AI provider request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private readOutputText(body: unknown) {
    if (!isRecord(body)) return null;
    if (typeof body.output_text === 'string') return body.output_text;
    if (!Array.isArray(body.output)) return null;
    for (const item of body.output) {
      if (!isRecord(item) || !Array.isArray(item.content)) continue;
      for (const entry of item.content) {
        if (isRecord(entry) && typeof entry.text === 'string')
          return entry.text;
      }
    }
    return null;
  }

  private readUsage(body: unknown) {
    if (!isRecord(body) || !isRecord(body.usage))
      return { inputTokens: 0, outputTokens: 0 };
    return {
      inputTokens:
        typeof body.usage.input_tokens === 'number'
          ? body.usage.input_tokens
          : 0,
      outputTokens:
        typeof body.usage.output_tokens === 'number'
          ? body.usage.output_tokens
          : 0,
    };
  }

  private outputSchema() {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'insights', 'caveats', 'followUpQuestions'],
      properties: {
        summary: { type: 'string', maxLength: 800 },
        insights: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'detail', 'evidenceMetricIds'],
            properties: {
              title: { type: 'string', maxLength: 120 },
              detail: { type: 'string', maxLength: 600 },
              evidenceMetricIds: {
                type: 'array',
                minItems: 1,
                maxItems: 8,
                items: { type: 'string', maxLength: 80 },
              },
            },
          },
        },
        caveats: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', maxLength: 300 },
        },
        followUpQuestions: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', maxLength: 200 },
        },
      },
    };
  }

  private config(): OpenAiConfig {
    return {
      apiKey: this.configService.get<string | null>(
        'ai.analyticsCopilot.apiKey',
        null,
      ),
      model: this.configService.getOrThrow<string>('ai.analyticsCopilot.model'),
      allowedModels: this.configService.getOrThrow<string[]>(
        'ai.analyticsCopilot.allowedModels',
      ),
      inputCostMicroUsdPerMillionTokens: this.configService.get<number>(
        'ai.analyticsCopilot.inputCostMicroUsdPerMillionTokens',
        0,
      ),
      outputCostMicroUsdPerMillionTokens: this.configService.get<number>(
        'ai.analyticsCopilot.outputCostMicroUsdPerMillionTokens',
        0,
      ),
    };
  }
}
