export const supportedModels = [
  { key: 'luna', name: 'GPT-6 Luna', vercel: 'openai/gpt-6-luna', openrouter: 'openai/gpt-6-luna' },
  { key: 'sol', name: 'GPT-6.1 Sol', vercel: 'openai/gpt-6.1-sol', openrouter: 'openai/gpt-6.1-sol' },
  { key: 'sonnet', name: 'Claude Sonnet 5.5', vercel: 'anthropic/claude-sonnet-5.5', openrouter: 'anthropic/claude-sonnet-5.5' },
  { key: 'opus', name: 'Claude Opus 5.5', vercel: 'anthropic/claude-opus-5.5', openrouter: 'anthropic/claude-opus-5.5' },
  { key: 'gemini', name: 'Gemini 4 Argon', vercel: 'google/gemini-4-argon', openrouter: 'google/gemini-4-argon' },
] as const;
