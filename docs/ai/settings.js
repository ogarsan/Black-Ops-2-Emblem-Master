// docs/ai/settings.js
//
// Persists AI provider/key/model/baseUrl in localStorage.
// Key: 'bo2_ai_settings_v1'. Corrupt JSON → silently fall back to defaults.

const KEY = 'bo2_ai_settings_v1';

const DEFAULTS = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  baseUrl: '',
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function clearKey() {
  const s = loadSettings();
  s.apiKey = '';
  saveSettings(s);
}