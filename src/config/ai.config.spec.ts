import aiConfig from './ai.config';

const original = process.env;

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

  it('is disabled by default and does not require a key', () => {
    const config = aiConfig();
    expect(config.analyticsCopilot).toMatchObject({
      enabled: false,
      provider: 'openai',
      apiKey: null,
      timeoutMs: 10000,
    });
  });

  it('rejects unsupported providers, models outside the allowlist, and unsafe numeric limits', () => {
    process.env.AI_ANALYTICS_COPILOT_ENABLED = 'true';
    process.env.AI_PROVIDER = 'unknown';
    expect(() => aiConfig()).toThrow('AI_PROVIDER');
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_ALLOWED_MODELS = 'model-a';
    process.env.AI_ANALYTICS_MODEL = 'model-b';
    expect(() => aiConfig()).toThrow('AI_ANALYTICS_MODEL');
    process.env.AI_ANALYTICS_MODEL = 'model-a';
    process.env.AI_ANALYTICS_TIMEOUT_MS = '999999';
    expect(() => aiConfig()).toThrow('AI_ANALYTICS_TIMEOUT_MS');
  });

  it('requires explicit current pricing when enabled with a provider key', () => {
    process.env.AI_ANALYTICS_COPILOT_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'configured-in-protected-env';
    expect(() => aiConfig()).toThrow('token pricing');
    process.env.AI_OPENAI_INPUT_COST_MICRO_USD_PER_MILLION_TOKENS = '1000';
    process.env.AI_OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION_TOKENS = '2000';
    expect(() => aiConfig()).not.toThrow();
  });
});
