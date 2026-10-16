import aiConfig from './ai.config';

const original = process.env;

const configureEnabledOpenAi = () => {
  process.env.AI_ANALYTICS_COPILOT_ENABLED = 'true';
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_ALLOWED_MODELS = 'approved-model';
  process.env.AI_ANALYTICS_MODEL = 'approved-model';
  process.env.OPENAI_API_KEY = 'configured-in-protected-env';
  process.env.AI_OPENAI_INPUT_COST_MICRO_USD_PER_MILLION_TOKENS = '1000';
  process.env.AI_OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION_TOKENS = '2000';
};

describe('aiConfig', () => {
  beforeEach(() => {
    process.env = { ...original };
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_ANALYTICS_COPILOT_ENABLED;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_ALLOWED_MODELS;
    delete process.env.AI_ANALYTICS_MODEL;
    delete process.env.AI_ANALYTICS_TIMEOUT_MS;
    delete process.env.AI_OPENAI_INPUT_COST_MICRO_USD_PER_MILLION_TOKENS;
    delete process.env.AI_OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION_TOKENS;
  });
  afterAll(() => {
    process.env = original;
  });

  it('defaults to disabled with no provider, model, key, or pricing', () => {
    const config = aiConfig();
    expect(config.analyticsCopilot).toMatchObject({
      enabled: false,
      provider: 'disabled',
      allowedModels: [],
      model: '',
      apiKey: null,
      inputCostMicroUsdPerMillionTokens: 0,
      outputCostMicroUsdPerMillionTokens: 0,
      timeoutMs: 10000,
    });
  });

  it('allows empty OpenAI settings while the feature remains disabled', () => {
    process.env.AI_PROVIDER = 'openai';
    expect(() => aiConfig()).not.toThrow();
  });

  it('allows intentional deterministic-only mode when explicitly enabled with a disabled provider', () => {
    process.env.AI_ANALYTICS_COPILOT_ENABLED = 'true';
    process.env.AI_PROVIDER = 'disabled';
    expect(aiConfig().analyticsCopilot).toMatchObject({
      enabled: true,
      provider: 'disabled',
      allowedModels: [],
      model: '',
      apiKey: null,
    });
  });

  it('requires an explicit provider selection when the feature is enabled', () => {
    process.env.AI_ANALYTICS_COPILOT_ENABLED = 'true';
    expect(() => aiConfig()).toThrow('AI_PROVIDER');
  });

  it('requires an explicit allowlist, selected model, key, and pricing for enabled OpenAI mode', () => {
    process.env.AI_ANALYTICS_COPILOT_ENABLED = 'true';
    process.env.AI_PROVIDER = 'openai';
    expect(() => aiConfig()).toThrow('AI_ALLOWED_MODELS');

    process.env.AI_ALLOWED_MODELS = 'approved-model';
    expect(() => aiConfig()).toThrow('AI_ANALYTICS_MODEL');

    process.env.AI_ANALYTICS_MODEL = 'other-model';
    expect(() => aiConfig()).toThrow('AI_ANALYTICS_MODEL');

    process.env.AI_ANALYTICS_MODEL = 'approved-model';
    expect(() => aiConfig()).toThrow('OPENAI_API_KEY');

    process.env.OPENAI_API_KEY = 'configured-in-protected-env';
    expect(() => aiConfig()).toThrow('token pricing');

    process.env.AI_OPENAI_INPUT_COST_MICRO_USD_PER_MILLION_TOKENS = '1000';
    process.env.AI_OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION_TOKENS = '2000';
    expect(() => aiConfig()).not.toThrow();
  });

  it('rejects unsupported providers, oversized allowlists, and unsafe numeric limits', () => {
    process.env.AI_PROVIDER = 'unknown';
    expect(() => aiConfig()).toThrow('AI_PROVIDER');

    process.env.AI_PROVIDER = 'disabled';
    process.env.AI_ALLOWED_MODELS = Array.from(
      { length: 11 },
      (_, index) => 'model-' + index,
    ).join(',');
    expect(() => aiConfig()).toThrow('AI_ALLOWED_MODELS');

    configureEnabledOpenAi();
    process.env.AI_ANALYTICS_TIMEOUT_MS = '999999';
    expect(() => aiConfig()).toThrow('AI_ANALYTICS_TIMEOUT_MS');
  });
});
