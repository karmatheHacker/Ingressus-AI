/**
 * Antigravity Model Catalog and Mapping
 *
 * Sourced from Tau (`src/utils/model/antigravityClaudeTiers.ts`,
 * `src/services/api/providers/gemini_code_assist.ts`, `src/lanes/shared/antigravity_auth.ts`)
 */

import {
  parseAntigravityClaudeTier,
  ANTIGRAVITY_CLAUDE_TIER_MODELS,
  type AntigravityClaudeTierModel,
  type AntigravityClaudeEffort,
} from './claude_tiers.js'

export interface ModelInfo {
  id: string
  name: string
  contextWindow: number
  tags?: string[]
}

export type ModelFamily = 'gemini' | 'claude'

export const ANTIGRAVITY_MODELS: readonly ModelInfo[] = [
  { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)', contextWindow: 1048576 },
  { id: 'gemini-4-argon-medium', name: 'Gemini 4 Argon (Medium)', contextWindow: 1048576 },
  { id: 'gemini-4-argon-low', name: 'Gemini 4 Argon (Low)', contextWindow: 1048576 },
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', contextWindow: 1048576 },
  { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)', contextWindow: 1048576 },
  { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)', contextWindow: 1048576 },
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)', contextWindow: 1048576 },
  { id: 'gemini-3.7-flash-medium', name: 'Gemini 3.7 Flash (Medium)', contextWindow: 1048576 },
  { id: 'gemini-3.7-flash-low', name: 'Gemini 3.7 Flash (Low)', contextWindow: 1048576 },
  { id: 'gemini-3.6-flash-high', name: 'Gemini 3.6 Flash (High)', contextWindow: 1048576 },
  { id: 'gemini-3.6-flash-medium', name: 'Gemini 3.6 Flash (Medium)', contextWindow: 1048576 },
  { id: 'gemini-3.6-flash-low', name: 'Gemini 3.6 Flash (Low)', contextWindow: 1048576 },
  { id: 'gemini-3.5-flash-high', name: 'Gemini 3.5 Flash (High)', contextWindow: 1048576 },
  { id: 'gemini-3.5-flash-medium', name: 'Gemini 3.5 Flash (Medium)', contextWindow: 1048576 },
  { id: 'gemini-3.5-flash-low', name: 'Gemini 3.5 Flash (Low)', contextWindow: 1048576 },
  { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', contextWindow: 1048576 },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)', contextWindow: 1048576 },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', contextWindow: 1048576 },
  { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 (High)', contextWindow: 1000000, tags: ['pro-ultra'] },
  { id: 'claude-opus-5-5-medium', name: 'Claude Opus 5.5 (Medium)', contextWindow: 1000000, tags: ['pro-ultra'] },
  { id: 'claude-opus-5-5-low', name: 'Claude Opus 5.5 (Low)', contextWindow: 1000000, tags: ['pro-ultra'] },
  { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)', contextWindow: 1000000, tags: ['pro-ultra'] },
  { id: 'claude-sonnet-5-5-medium', name: 'Claude Sonnet 5.5 (Medium)', contextWindow: 1000000, tags: ['pro-ultra'] },
  { id: 'claude-sonnet-5-5-low', name: 'Claude Sonnet 5.5 (Low)', contextWindow: 1000000, tags: ['pro-ultra'] },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 1000000 },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', contextWindow: 1000000 },
]

export const ANTIGRAVITY_MODEL_IDS = new Set(
  ANTIGRAVITY_MODELS.map(m => m.id)
)

export function isAntigravityModelId(model: string): boolean {
  return ANTIGRAVITY_MODEL_IDS.has(model.toLowerCase().replace(/^models\//, ''))
}

export function isAntigravityGeminiModel(model: string): boolean {
  const normalized = model.toLowerCase().replace(/^models\//, '')
  return ANTIGRAVITY_MODEL_IDS.has(normalized) && !normalized.includes('claude')
}

export function getAntigravityModelFamily(model: string): ModelFamily {
  return model.toLowerCase().includes('claude') ? 'claude' : 'gemini'
}

export function resolveAntigravityWireModel(model: string): string {
  const normalized = model.toLowerCase().replace(/^models\//, '')

  if (/^gemini-4-argon-(?:high|medium|low)$/.test(normalized)) {
    return normalized
  }

  const tiered = normalized.match(/^gemini-(3\.[6-8])-flash-(?:high|medium|low)$/)
  if (tiered) {
    if (tiered[1] === '3.7') return normalized
    return `gemini-${tiered[1]}-flash-tiered`
  }

  if (normalized === 'gemini-3.1-pro-high') {
    return 'gemini-pro-agent'
  }
  if (normalized === 'gemini-3.5-flash-high') {
    return 'gemini-3-flash-agent'
  }
  if (normalized === 'gemini-3.5-flash-medium') {
    return 'gemini-3.5-flash-low'
  }
  if (normalized === 'gemini-3.5-flash-low') {
    return 'gemini-3.5-flash-extra-low'
  }

  return normalized
}

