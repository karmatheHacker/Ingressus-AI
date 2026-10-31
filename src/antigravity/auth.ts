import { createHash, randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { URL } from 'url'
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_REDIRECT_URI,
  ANTIGRAVITY_SCOPES,
} from './constants.js'
import type { ModelFamily } from './models.js'

export const ANTIGRAVITY_TOKEN_MARGIN_MS = 5 * 60 * 1000

const STORAGE_DIR = join(homedir(), '.claudex')
const STORAGE_FILE = join(STORAGE_DIR, 'antigravity-accounts.json')

export interface AntigravityTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}

export interface AntigravityAccount {
  email: string
  refreshToken: string
  accessToken: string
  expires: number
  projectId: string
  managedProjectId?: string
  addedAt: number
  lastUsed: number
  enabled: boolean
  rateLimitResetTimes: Record<string, number | null>
}

export interface AntigravityStore {
  version: number
  accounts: AntigravityAccount[]
  activeIndex: number
  activeIndexByFamily: Partial<Record<string, number>>
}

export interface PKCEPair {
  verifier: string
  challenge: string
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generatePKCE(): PKCEPair {
  const verifier = base64urlEncode(randomBytes(32))
  const challenge = base64urlEncode(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function buildAuthorizationUrl(opts: {
  pkce: PKCEPair
  redirectUri?: string
  state?: string
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  const redirectUri = opts.redirectUri ?? ANTIGRAVITY_REDIRECT_URI
  url.searchParams.set('client_id', ANTIGRAVITY_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', ANTIGRAVITY_SCOPES.join(' '))
  url.searchParams.set('code_challenge', opts.pkce.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', opts.state ?? base64urlEncode(randomBytes(16)))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

export function parseAntigravityOAuthCallback(input: string): {
  code?: string
  state?: string
} {
  const trimmed = input.trim()
  if (!trimmed) return {}

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      return {
        code: url.searchParams.get('code') || undefined,
        state: url.searchParams.get('state') || undefined,
      }
    } catch {
      return {}
    }
  }

  const candidate = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed
  if (candidate.includes('=')) {
    const params = new URLSearchParams(candidate)
    const code = params.get('code') || undefined
    const state = params.get('state') || undefined
    if (code || state) return { code, state }
  }

  return { code: trimmed }
}

export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  redirectUri = ANTIGRAVITY_REDIRECT_URI,
): Promise<AntigravityTokens> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'google-api-nodejs-client/9.15.1',
    },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Antigravity token exchange failed (${resp.status}): ${text.slice(0, 300)}`)
  }
  return (await resp.json()) as AntigravityTokens
}

export async function refreshAccessToken(refreshToken: string): Promise<AntigravityTokens> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'google-api-nodejs-client/9.15.1',
    },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Antigravity token refresh failed (${resp.status}): ${text.slice(0, 300)}`)
  }
  return (await resp.json()) as AntigravityTokens
}

export function loadStore(): AntigravityStore {
  if (!existsSync(STORAGE_FILE)) {
    return { version: 1, accounts: [], activeIndex: 0, activeIndexByFamily: {} }
  }
  try {
    const raw = readFileSync(STORAGE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as AntigravityStore
    parsed.accounts ??= []
    parsed.activeIndexByFamily ??= {}
    return parsed
  } catch {
    return { version: 1, accounts: [], activeIndex: 0, activeIndexByFamily: {} }
  }
}

export function saveStore(store: AntigravityStore): void {
  if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true })
  const tmp = STORAGE_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  try {
    renameSync(tmp, STORAGE_FILE)
  } catch {
    writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf8')
  }
  try {
    chmodSync(STORAGE_FILE, 0o600)
  } catch {}
}

export function selectActiveAntigravityAccount(
  store: AntigravityStore = loadStore(),
): AntigravityAccount | null {
  if (store.accounts.length === 0) return null
  const active = store.accounts[store.activeIndex]
  if (active?.enabled) return active
  return store.accounts.find(account => account.enabled) ?? null
}

export type AntigravityPeek =
  | { kind: 'ready'; account: AntigravityAccount }
  | { kind: 'stale'; account: AntigravityAccount }
  | { kind: 'none' }

export function peekAntigravityAccount(
  now: number = Date.now(),
  store: AntigravityStore = loadStore(),
): AntigravityPeek {
  const account = selectActiveAntigravityAccount(store)
  if (!account) return { kind: 'none' }
  if (account.expires > now + ANTIGRAVITY_TOKEN_MARGIN_MS) {
    return { kind: 'ready', account }
  }
  return { kind: 'stale', account }
}

export function pickAccountForFamily(
  store: AntigravityStore,
  family: ModelFamily,
): AntigravityAccount | null {
  const now = Date.now()
  const eligible = store.accounts.filter(a => {
    if (!a.enabled) return false
    const reset = a.rateLimitResetTimes[family]
    if (reset && reset > now) return false
    return true
  })
  if (eligible.length === 0) return null
  eligible.sort((a, b) => a.lastUsed - b.lastUsed)
  return eligible[0]
}

export function markAccountRateLimited(
  store: AntigravityStore,
  email: string,
  family: ModelFamily,
  retryAfterMs: number,
): void {
  const account = store.accounts.find(a => a.email === email)
  if (!account) return
  account.rateLimitResetTimes[family] = Date.now() + retryAfterMs
  saveStore(store)
}

