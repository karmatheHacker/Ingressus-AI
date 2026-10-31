import {
  ANTIGRAVITY_ENDPOINT_DAILY,
  ANTIGRAVITY_ENDPOINT_PROD,
} from './constants.js'
import { antigravityApiHeaders, antigravityLoadCodeAssistHeaders } from './code_assist.js'
import { ANTIGRAVITY_MODELS } from './models.js'

export interface AntigravityQuotaResult {
  modelId: string
  usedTokens: number
  maxTokens: number
  remainingFraction: number
  usedPercent: number
  resetTime?: string | null
  source: 'models' | 'quota' | 'summary' | 'fallback'
}

export function getModelContextWindow(modelId: string): number {
  const norm = modelId.toLowerCase().replace(/^models\//, '')
  const found = ANTIGRAVITY_MODELS.find(m => m.id === norm)
  return found?.contextWindow ?? 1048576
}

function normalizeModel(m: string): string {
  return m.toLowerCase().replace(/^models\//, '').trim()
}

/**
 * Fetch authentic user quota and token usage from Google Code Assist endpoints.
 */
export async function fetchAntigravityQuota(
  accessToken: string,
  projectId: string,
  modelId = 'gemini-4-argon-high'
): Promise<AntigravityQuotaResult | null> {
  const normalizedTarget = normalizeModel(modelId)
  const maxTokens = getModelContextWindow(normalizedTarget)

  // 1. Try fetchAvailableModels
  try {
    const res = await fetch(`${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:fetchAvailableModels`, {
      method: 'POST',
      headers: antigravityApiHeaders(accessToken),
      body: JSON.stringify({ project: projectId }),
    })

    if (res.ok) {
      const data = (await res.json()) as any
      const models = data?.models || data?.response?.models || {}
      
      let matchedModelInfo: any = null
      for (const [key, val] of Object.entries(models)) {
        const normKey = normalizeModel(key)
        if (normKey === normalizedTarget || normKey.includes(normalizedTarget) || normalizedTarget.includes(normKey)) {
          matchedModelInfo = val
          break
        }
      }

      if (!matchedModelInfo) {
        // Fallback to first available model with quota info
        for (const val of Object.values(models) as any[]) {
          if (val?.quotaInfo?.remainingFraction !== undefined) {
            matchedModelInfo = val
            break
          }
        }
      }

      if (matchedModelInfo?.quotaInfo) {
        const remainingFraction = Number(matchedModelInfo.quotaInfo.remainingFraction ?? 1.0)
        const clampedFraction = Math.max(0, Math.min(1, remainingFraction))
        const usedFraction = 1.0 - clampedFraction
        const usedTokens = Math.round(usedFraction * maxTokens)
        const usedPercent = Math.round(usedFraction * 100)
        return {
          modelId: normalizedTarget,
          usedTokens,
          maxTokens,
          remainingFraction: clampedFraction,
          usedPercent,
          resetTime: matchedModelInfo.quotaInfo.resetTime || null,
          source: 'models',
        }
      }
    }
  } catch {
    // try next endpoint
  }

  // 2. Try retrieveUserQuota
  try {
    const res = await fetch(`${ANTIGRAVITY_ENDPOINT_PROD}/v1internal:retrieveUserQuota`, {
      method: 'POST',
      headers: antigravityLoadCodeAssistHeaders(accessToken),
      body: JSON.stringify({ project: projectId }),
    })

    if (res.ok) {
      const data = (await res.json()) as any
      const buckets = Array.isArray(data?.buckets) ? data.buckets : []
      const bucket = buckets.find((b: any) => {
        if (!b?.modelId) return false
        const bModel = normalizeModel(b.modelId)
        return bModel === normalizedTarget || bModel.includes(normalizedTarget) || normalizedTarget.includes(bModel)
      }) || buckets[0]

      if (bucket) {
        const remainingFraction = Number(bucket.remainingFraction ?? 1.0)
        const clampedFraction = Math.max(0, Math.min(1, remainingFraction))
        const usedFraction = 1.0 - clampedFraction
        const usedTokens = Math.round(usedFraction * maxTokens)
        const usedPercent = Math.round(usedFraction * 100)
        return {
          modelId: normalizedTarget,
          usedTokens,
          maxTokens,
          remainingFraction: clampedFraction,
          usedPercent,
          resetTime: bucket.resetTime || null,
          source: 'quota',
        }
      }
    }
  } catch {
    // try next endpoint
  }

  // 3. Try retrieveUserQuotaSummary
  try {
    const res = await fetch(`${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:retrieveUserQuotaSummary`, {
      method: 'POST',
      headers: antigravityApiHeaders(accessToken),
      body: JSON.stringify({ project: projectId }),
    })

    if (res.ok) {
      const data = (await res.json()) as any
      const groups = Array.isArray(data?.groups) ? data.groups : []
      for (const group of groups) {
        if (Array.isArray(group?.buckets) && group.buckets.length > 0) {
          const bucket = group.buckets[0]
          const remainingFraction = Number(bucket?.remainingFraction ?? 1.0)
          const clampedFraction = Math.max(0, Math.min(1, remainingFraction))
          const usedFraction = 1.0 - clampedFraction
          const usedTokens = Math.round(usedFraction * maxTokens)
          return {
            modelId: normalizedTarget,
            usedTokens,
            maxTokens,
            remainingFraction: clampedFraction,
            usedPercent: Math.round(usedFraction * 100),
            resetTime: bucket.resetTime || null,
            source: 'summary',
          }
        }
      }
    }
  } catch {
    // fallback
  }

  return {
    modelId: normalizedTarget,
    usedTokens: 0,
    maxTokens,
    remainingFraction: 1.0,
    usedPercent: 0,
    resetTime: null,
    source: 'fallback',
  }
}

