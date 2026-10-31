/**
 * Provider Registry and Selection
 *
 * Sourced from Tau (`src/utils/model/providerRegistry.ts` and `src/utils/model/providers.ts`)
 */

export const API_PROVIDERS = [
  'antigravity',
  'tinyfish',
  'firstParty',
  'openai',
  'gemini',
  'bedrock',
  'vertex',
  'openrouter',
  'deepseek',
  'groq',
  'mistral',
  'ollama',
] as const

export type APIProvider = (typeof API_PROVIDERS)[number]

export const SELECTABLE_PROVIDERS: readonly APIProvider[] = [
  'antigravity',
  'tinyfish',
  'firstParty',
  'openai',
  'gemini',
  'openrouter',
  'deepseek',
  'ollama',
]

export const PROVIDER_DISPLAY_NAMES: Record<APIProvider, string> = {
  antigravity: 'Google Antigravity',
  tinyfish: 'Tiny Fish AI',
  firstParty: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  bedrock: 'AWS Bedrock',
  vertex: 'Google Vertex AI',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  mistral: 'Mistral',
  ollama: 'Ollama',
}

let _activeProvider: APIProvider = 'antigravity'

export function getAPIProvider(): APIProvider {
  return _activeProvider
}

export function setActiveProvider(provider: APIProvider): void {
  _activeProvider = provider
}

