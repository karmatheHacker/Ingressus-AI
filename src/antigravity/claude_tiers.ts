export type AntigravityClaudeEffort = 'low' | 'medium' | 'high'

export const ANTIGRAVITY_CLAUDE_EFFORTS: readonly AntigravityClaudeEffort[] = [
  'low',
  'medium',
  'high',
]

export const ANTIGRAVITY_CLAUDE_DEFAULT_EFFORT: AntigravityClaudeEffort = 'high'

export interface AntigravityClaudeTierModel {
  id: string
  name: string
  marketingName: string
  knowledgeCutoff: string | null
  contextWindow: number
  maxOutputTokens: { default: number; upperLimit: number }
}

export const ANTIGRAVITY_CLAUDE_TIER_MODELS: readonly AntigravityClaudeTierModel[] = [
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    marketingName: 'Opus 5.5',
    knowledgeCutoff: 'June 2026',
    contextWindow: 1_000_000,
    maxOutputTokens: { default: 64_000, upperLimit: 128_000 },
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    marketingName: 'Sonnet 5.5',
    knowledgeCutoff: null,
    contextWindow: 1_000_000,
    maxOutputTokens: { default: 32_000, upperLimit: 128_000 },
  },
]

export function parseAntigravityClaudeTier(
  modelId: string,
): { model: AntigravityClaudeTierModel; effort: AntigravityClaudeEffort } | null {
  const normalized = modelId.trim().toLowerCase().replace(/^models\//, '')
  for (const model of ANTIGRAVITY_CLAUDE_TIER_MODELS) {
    if (!normalized.startsWith(`${model.id}-`)) continue
    const effort = normalized.slice(model.id.length + 1)
    if ((ANTIGRAVITY_CLAUDE_EFFORTS as readonly string[]).includes(effort)) {
      return { model, effort: effort as AntigravityClaudeEffort }
    }
  }
  return null
}

