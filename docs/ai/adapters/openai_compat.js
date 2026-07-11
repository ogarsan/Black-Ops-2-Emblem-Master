// docs/ai/adapters/openai_compat.js
//
// Generic adapter for any OpenAI-compatible endpoint (Together, Anyscale,
// local llama.cpp / ollama with --openai-compatible, etc). Requires the user
// to supply a baseUrl at runtime; we just append `/v1/chat/completions` if it
// isn't already present, then defer to OpenAiAdapter for everything else.
import { OpenAiAdapter } from './openai.js';

export class OpenAiCompatAdapter extends OpenAiAdapter {
  // No fixed models — users type whatever the server exposes.
  static supportedModels = [];
  static baseUrl = null;

  async *streamChat(opts) {
    if (!opts.baseUrl) {
      yield { type: 'error', error: Object.assign(new Error('OpenAI-compat requires baseUrl'), { status: 0 }) };
      return;
    }
    const trimmed = opts.baseUrl.replace(/\/$/, '');
    const baseUrl = trimmed.endsWith('/v1/chat/completions')
      ? trimmed
      : `${trimmed}/v1/chat/completions`;
    yield* super.streamChat({ ...opts, baseUrl });
  }
}