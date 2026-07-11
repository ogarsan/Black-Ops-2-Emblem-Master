import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, clearKey } from '../../../docs/ai/settings.js';

describe('settings', () => {
  beforeEach(() => localStorage.clear());

  it('loadSettings returns defaults when empty', () => {
    const s = loadSettings();
    expect(s.provider).toBe('openai');
    expect(s.model).toBe('gpt-4o-mini');
    expect(s.apiKey).toBe('');
  });

  it('saveSettings + loadSettings round-trips', () => {
    saveSettings({ provider: 'anthropic', apiKey: 'sk-x', model: 'claude-3-5-sonnet-latest', baseUrl: '' });
    const s = loadSettings();
    expect(s).toEqual({ provider: 'anthropic', apiKey: 'sk-x', model: 'claude-3-5-sonnet-latest', baseUrl: '' });
  });

  it('clearKey wipes apiKey but keeps other fields', () => {
    saveSettings({ provider: 'openai', apiKey: 'sk-x', model: 'gpt-4o-mini', baseUrl: '' });
    clearKey();
    const s = loadSettings();
    expect(s.apiKey).toBe('');
    expect(s.provider).toBe('openai');
  });

  it('loadSettings recovers from corrupt JSON', () => {
    localStorage.setItem('bo2_ai_settings_v1', '{not json');
    const s = loadSettings();
    expect(s.provider).toBe('openai');
  });
});