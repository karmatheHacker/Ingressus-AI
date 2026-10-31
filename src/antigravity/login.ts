import {
  generatePKCE,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  loadStore,
  saveStore,
  parseAntigravityOAuthCallback,
  type AntigravityAccount,
  type PKCEPair,
} from './auth.js'
import { ensureCodeAssistReady } from './code_assist.js'

let activeLoginSession: {
  pkce: PKCEPair
  state: string
  url: string
} | null = null

export function startAntigravityLogin(): { url: string } {
  const pkce = generatePKCE()
  const state = Math.random().toString(36).slice(2)
  const url = buildAuthorizationUrl({ pkce, state })
  activeLoginSession = { pkce, state, url }
  return { url }
}

export async function finishAntigravityLogin(
  callbackOrCode: string
): Promise<{ email?: string; projectId: string; accessToken: string }> {
  if (!activeLoginSession) {
    throw new Error('No active Antigravity login session. Start with /login antigravity first.')
  }

  const parsed = parseAntigravityOAuthCallback(callbackOrCode)
  const code = parsed.code
  if (!code) {
    throw new Error('Invalid code or URL. Please paste the authorization code from Google.')
  }

  const tokens = await exchangeCodeForTokens(code, activeLoginSession.pkce.verifier)
  activeLoginSession = null

  // Discover Project ID
  const projectId = await ensureCodeAssistReady(tokens.access_token)

  // Fetch email if possible
  let email = 'user@google.com'
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (userRes.ok) {
      const u = await userRes.json()
      if (u.email) email = u.email
    }
  } catch {}

  const store = loadStore()
  const now = Date.now()

  const existingIdx = store.accounts.findIndex(a => a.email === email)
  const account: AntigravityAccount = {
    email,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expires: now + tokens.expires_in * 1000,
    projectId,
    addedAt: now,
    lastUsed: now,
    enabled: true,
    rateLimitResetTimes: {},
  }

  if (existingIdx >= 0) {
    store.accounts[existingIdx] = account
    store.activeIndex = existingIdx
  } else {
    store.accounts.push(account)
    store.activeIndex = store.accounts.length - 1
  }

  saveStore(store)
  return { email, projectId, accessToken: tokens.access_token }
}

