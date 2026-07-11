// docs/ai/adapters/base.js
//
// Abstract base for AI provider adapters. Concrete adapters (OpenAI, Groq,
// Anthropic, Gemini, OpenAI-compat) extend AiAdapter and implement
// `async *streamChat(...)` which yields `StreamEvent`s:
//
//   { type: 'text',     delta: string }
//   { type: 'tool_call', id, name, args }   // args is a fully-parsed object
//   { type: 'error',    error: Error }
//   { type: 'done' }
//
// Adapters MUST yield 'done' exactly once at the end of a successful stream
// and an 'error' event (not throw) on failure — the caller is responsible
// for the agent loop, not for parsing or validation.
export class AiAdapter {
  // eslint-disable-next-line require-yield
  async *streamChat(_opts) {
    throw new Error('AiAdapter.streamChat is abstract');
  }
  static supportedModels = [];
}