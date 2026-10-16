import {
  AiTextGenerationRequest,
  AiTextGenerationResult,
  AiTextProvider,
} from '../domain/analytics-copilot.types';
import { AiProviderError } from './ai-provider.error';

export class DisabledAiTextProvider implements AiTextProvider {
  isConfigured() {
    return false;
  }
  generate(request: AiTextGenerationRequest): Promise<AiTextGenerationResult> {
    void request;
    return Promise.reject(
      new AiProviderError(
        'AI_PROVIDER_UNAVAILABLE',
        'AI provider is not configured',
      ),
    );
  }
}
