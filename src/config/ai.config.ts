import { registerAs } from '@nestjs/config';

const parseInteger = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
};

const parseModels = () => {
  const models = (process.env.AI_ALLOWED_MODELS ?? 'gpt-6-luna,gpt-6.1-sol')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  if (models.length === 0 || models.length > 10) {
    throw new Error('AI_ALLOWED_MODELS must contain between 1 and 10 models');
  }
  return [...new Set(models)];
};

export default registerAs('ai', () => {
  const enabled = process.env.AI_ANALYTICS_COPILOT_ENABLED === 'true';
  const provider = process.env.AI_PROVIDER ?? 'openai';
  const allowedModels = parseModels();
  const model = process.env.AI_ANALYTICS_MODEL ?? allowedModels[0];
  if (provider !== 'openai' && provider !== 'disabled')
    throw new Error('AI_PROVIDER must be openai or disabled');
  if (!allowedModels.includes(model))
    throw new Error('AI_ANALYTICS_MODEL must be included in AI_ALLOWED_MODELS');
  const hasProviderKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const inputCostMicroUsdPerMillionTokens = parseInteger(
    'AI_OPENAI_INPUT_COST_MICRO_USD_PER_MILLION_TOKENS',
    0,
    0,
    1_000_000_000,
  );
  const outputCostMicroUsdPerMillionTokens = parseInteger(
    'AI_OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION_TOKENS',
    0,
    0,
    1_000_000_000,
  );
  if (
    enabled &&
    provider === 'openai' &&
    hasProviderKey &&
    (inputCostMicroUsdPerMillionTokens === 0 ||
      outputCostMicroUsdPerMillionTokens === 0)
  ) {
    throw new Error(
      'OpenAI token pricing must be configured before enabling provider mode',
    );
  }
  return {
    analyticsCopilot: {
      enabled,
      provider,
      model,
      allowedModels,
      apiKey: process.env.OPENAI_API_KEY?.trim() || null,
      timeoutMs: parseInteger('AI_ANALYTICS_TIMEOUT_MS', 10_000, 1_000, 30_000),
      maxInputTokens: parseInteger(
        'AI_ANALYTICS_MAX_INPUT_TOKENS',
        4_000,
        500,
        16_000,
      ),
      maxOutputTokens: parseInteger(
        'AI_ANALYTICS_MAX_OUTPUT_TOKENS',
        600,
        100,
        2_000,
      ),
      maxCostMicroUsdPerRequest: parseInteger(
        'AI_ANALYTICS_MAX_COST_MICRO_USD_PER_REQUEST',
        20_000,
        0,
        10_000_000,
      ),
      dailyRestaurantRequestLimit: parseInteger(
        'AI_ANALYTICS_DAILY_RESTAURANT_REQUEST_LIMIT',
        100,
        1,
        10_000,
      ),
      dailyRestaurantTokenLimit: parseInteger(
        'AI_ANALYTICS_DAILY_RESTAURANT_TOKEN_LIMIT',
        250_000,
        1_000,
        100_000_000,
      ),
      dailyRestaurantCostMicroUsdLimit: parseInteger(
        'AI_ANALYTICS_DAILY_RESTAURANT_COST_MICRO_USD_LIMIT',
        2_000_000,
        0,
        1_000_000_000,
      ),
      maxProviderConcurrency: parseInteger(
        'AI_ANALYTICS_MAX_PROVIDER_CONCURRENCY',
        10,
        1,
        100,
      ),
      retentionDays: parseInteger('AI_ANALYTICS_RETENTION_DAYS', 30, 1, 365),
      inputCostMicroUsdPerMillionTokens,
      outputCostMicroUsdPerMillionTokens,
    },
  };
});
