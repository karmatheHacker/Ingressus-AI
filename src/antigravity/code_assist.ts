import { createHash, randomUUID } from 'crypto'
import {
  ANTIGRAVITY_API_VERSION,
  ANTIGRAVITY_HUB_USER_AGENT,
  CODE_ASSIST_BASE,
  ANTIGRAVITY_GENERATION_BASE,
} from './constants.js'
import { resolveAntigravityWireModel } from './models.js'

export const ANTIGRAVITY_NODE_API_CLIENT = 'google-api-nodejs-client/10.3.0'
export const ANTIGRAVITY_NODE_X_GOOG_API_CLIENT = 'gl-node/22.21.1'

export interface CodeAssistLoadData {
  cloudaicompanionProject?: string | { id?: string }
  currentTier?: { id?: string; name?: string }
  paidTier?: { id?: string; name?: string }
  allowedTiers?: Array<{
    id?: string
    name?: string
    isDefault?: boolean
    userDefinedCloudaicompanionProject?: boolean
  }>
}

export function antigravityLoadCodeAssistHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': ANTIGRAVITY_HUB_USER_AGENT,
  }
}

export function antigravityOnboardUserHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': `${ANTIGRAVITY_HUB_USER_AGENT} ${ANTIGRAVITY_NODE_API_CLIENT}`,
    'X-Goog-Api-Client': ANTIGRAVITY_NODE_X_GOOG_API_CLIENT,
  }
}

export function antigravityApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': ANTIGRAVITY_HUB_USER_AGENT,
  }
}

function extractProjectId(value: string | { id?: string } | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'object' && typeof value.id === 'string') return value.id.trim() || null
  return null
}

export async function loadCodeAssist(accessToken: string): Promise<CodeAssistLoadData> {
  const res = await fetch(`${CODE_ASSIST_BASE}:loadCodeAssist`, {
    method: 'POST',
    headers: antigravityLoadCodeAssistHeaders(accessToken),
    body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`loadCodeAssist failed (${res.status}): ${text.slice(0, 300)}`)
  }

  return (await res.json()) as CodeAssistLoadData
}

export async function onboardUser(
  accessToken: string,
  tierId = 'free-tier'
): Promise<string | null> {
  const body = {
    tier_id: tierId,
    metadata: {
      ide_type: 'ANTIGRAVITY',
      ide_version: ANTIGRAVITY_API_VERSION,
      ide_name: 'antigravity',
    },
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${CODE_ASSIST_BASE}:onboardUser`, {
      method: 'POST',
      headers: antigravityOnboardUserHeaders(accessToken),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`onboardUser failed (${res.status}): ${text.slice(0, 300)}`)
    }

    const data = await res.json()
    if (data.done === true) {
      const pid = extractProjectId(data.response?.cloudaicompanionProject)
      if (pid) return pid
    }

    await new Promise(r => setTimeout(r, 1200))
  }
  return null
}

export async function ensureCodeAssistReady(accessToken: string): Promise<string> {
  const loadData = await loadCodeAssist(accessToken)
  const directId = extractProjectId(loadData.cloudaicompanionProject)
  if (directId) return directId

  const tierId =
    loadData.allowedTiers?.find(t => t.isDefault)?.id ||
    loadData.currentTier?.id ||
    'free-tier'

  const onboardedId = await onboardUser(accessToken, tierId)
  if (onboardedId) return onboardedId

  // Retry loadCodeAssist once after onboardUser
  const refreshed = await loadCodeAssist(accessToken)
  const finalId = extractProjectId(refreshed.cloudaicompanionProject)
  if (finalId) return finalId

  throw new Error('Could not resolve Code Assist project ID for Antigravity account.')
}

export interface CodeAssistWrapperBody {
  model: string
  userAgent: string
  requestType: string
  project: string
  requestId: string
  request: Record<string, unknown>
}

export function wrapForCodeAssist(
  model: string,
  projectId: string,
  innerRequest: Record<string, unknown>,
  sessionId?: string
): CodeAssistWrapperBody {
  const wireModel = resolveAntigravityWireModel(model)
  const request = { ...innerRequest }

  delete request.safetySettings

  const isClaude = wireModel.includes('claude')
  if (!isClaude) {
    const gc = request.generationConfig as Record<string, unknown> | undefined
    if (gc) {
      const wireConfig = { ...gc }
      delete wireConfig.maxOutputTokens
      request.generationConfig = wireConfig
    }
  }

  request.sessionId = sessionId || `session-${randomUUID()}`

  return {
    model: wireModel,
    userAgent: 'antigravity',
    requestType: 'agent',
    project: projectId,
    requestId: `agent-${randomUUID()}`,
    request,
  }
}

export async function* parseCodeAssistSSE(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<any> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') return

        try {
          const parsed = JSON.parse(payload)
          if (parsed.response) {
            yield parsed.response
          } else {
            yield parsed
          }
        } catch {}
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim()
        if (payload !== '[DONE]') {
          try {
            const parsed = JSON.parse(payload)
            yield parsed.response || parsed
          } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

