// docs/ai/adapters/groq.js
//
// Groq uses OpenAI's wire format with a different base URL. Inherit the
// streaming + tool-call parser unchanged and just override the endpoint + model
// list.
import { OpenAiAdapter } from './openai.js';

export class GroqAdapter extends OpenAiAdapter {
  static supportedModels = [
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
  ];
  static baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
}