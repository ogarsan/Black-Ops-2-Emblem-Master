// docs/ai/adapters/openai_compat.js
//
// Generic adapter for any OpenAI-compatible endpoint (Together, Anyscale,
// MiniMax at api.minimax.io, local llama.cpp / ollama with --openai-compatible,
// etc). Requires the user to supply a baseUrl at runtime; we append the
// `/v1/chat/completions` suffix if it isn't already present, then defer to
// OpenAiAdapter for everything else.
//
// The baseUrl can be any of:
//   - host only                   e.g. https://api.minimax.io
//   - host with /v1               e.g. https://api.minimax.io/v1
//   - full path with /chat/...    e.g. https://api.minimax.io/v1/chat/completions
// All three produce the same final endpoint (avoids accidental /v1/v1 doubling).
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
    let baseUrl;
    if (trimmed.endsWith('/v1/chat/completions')) {
      baseUrl = trimmed;
    } else if (trimmed.endsWith('/v1')) {
      baseUrl = `${trimmed}/chat/completions`;
    } else {
      baseUrl = `${trimmed}/v1/chat/completions`;
    }
    yield* super.streamChat({ ...opts, baseUrl });
  }
}