import {
  ANTIGRAVITY_ENDPOINT_DAILY,
} from './constants.js'
import {
  antigravityApiHeaders,
  wrapForCodeAssist,
  parseCodeAssistSSE,
  ensureCodeAssistReady,
} from './code_assist.js'
import {
  loadStore,
  saveStore,
  selectActiveAntigravityAccount,
  refreshAccessToken,
  pickAccountForFamily,
  markAccountRateLimited,
  type AntigravityAccount,
} from './auth.js'
import { getAntigravityModelFamily } from './models.js'

export interface AntigravityGenerateParams {
  model: string
  contents: Array<{
    role: 'user' | 'model' | 'system'
    parts: Array<{ text: string }>
  }>
  systemInstruction?: {
    parts: Array<{ text: string }>
  }
  tools?: any[]
  signal?: AbortSignal
}

export interface AntigravityUsageMetadata {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
  cachedContentTokenCount?: number
}

export class AntigravityTransport {
  lastUsage: AntigravityUsageMetadata | null = null

  async getValidAccount(model: string): Promise<AntigravityAccount> {
    const store = loadStore()
    const family = getAntigravityModelFamily(model)
    let account = pickAccountForFamily(store, family) || selectActiveAntigravityAccount(store)

    if (!account) {
      throw new Error(
        'No active Antigravity account found. Run `/login antigravity` in Ingressus AI to authenticate with Google.'
      )
    }

    // Refresh if expiring within 5 minutes
    if (Date.now() > account.expires - 5 * 60 * 1000) {
      try {
        const tokens = await refreshAccessToken(account.refreshToken)
        account.accessToken = tokens.access_token
        account.expires = Date.now() + tokens.expires_in * 1000
        saveStore(store)
      } catch (err: any) {
        throw new Error(`Failed to refresh Antigravity token for ${account.email}: ${err.message}`)
      }
    }

    // Ensure project ID is discovered and cached
    if (!account.projectId) {
      account.projectId = await ensureCodeAssistReady(account.accessToken)
      saveStore(store)
    }

    return account
  }

  async *streamGenerateContent(
    params: AntigravityGenerateParams
  ): AsyncGenerator<string> {
    const account = await this.getValidAccount(params.model)
    const store = loadStore()
    const family = getAntigravityModelFamily(params.model)

    const innerRequest: Record<string, unknown> = {
      contents: params.contents,
    }

    if (params.systemInstruction) {
      innerRequest.systemInstruction = params.systemInstruction
    }

    if (params.tools && params.tools.length > 0) {
      innerRequest.tools = params.tools
    }

    const wrapped = wrapForCodeAssist(
      params.model,
      account.projectId,
      innerRequest
    )

    const url = `${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:streamGenerateContent?alt=sse`

    const response = await fetch(url, {
      method: 'POST',
      headers: antigravityApiHeaders(account.accessToken),
      body: JSON.stringify(wrapped),
      signal: params.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      if (response.status === 429) {
        // Mark account rate-limited for 60s
        markAccountRateLimited(store, account.email, family, 60_000)
        throw new Error(
          `Antigravity quota exhausted (429) on ${account.email} for family ${family}. Marked for rotation: ${errorText.slice(0, 200)}`
        )
      }
      throw new Error(`Antigravity stream failed (${response.status}): ${errorText.slice(0, 300)}`)
    }

    if (!response.body) {
      throw new Error('Antigravity returned an empty response body.')
    }

    account.lastUsed = Date.now()
    saveStore(store)

    for await (const chunk of parseCodeAssistSSE(response.body)) {
      const usage = chunk.usageMetadata || chunk.response?.usageMetadata
      if (usage) {
        this.lastUsage = {
          promptTokenCount: Number(usage.promptTokenCount ?? 0),
          candidatesTokenCount: Number(usage.candidatesTokenCount ?? 0),
          totalTokenCount: Number(
            usage.totalTokenCount ??
              ((usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0))
          ),
          cachedContentTokenCount: usage.cachedContentTokenCount
            ? Number(usage.cachedContentTokenCount)
            : undefined,
        }
      }

      const candidate = chunk.candidates?.[0]
      const parts = candidate?.content?.parts || []
      for (const part of parts) {
        if (part.text) {
          yield part.text
        }
      }
    }
  }

  async generateContent(params: AntigravityGenerateParams): Promise<string> {
    let result = ''
    for await (const chunk of this.streamGenerateContent(params)) {
      result += chunk
    }
    return result
  }

  async generateContentWithUsage(
    params: AntigravityGenerateParams
  ): Promise<{ text: string; usage: AntigravityUsageMetadata | null }> {
    let text = ''
    for await (const chunk of this.streamGenerateContent(params)) {
      text += chunk
    }
    return { text, usage: this.lastUsage }
  }
}

export const antigravityTransport = new AntigravityTransport()


