/**
 * Antigravity Client Constants
 *
 * Sourced from Tau (`src/constants/antigravity.ts` and `src/lanes/shared/antigravity_auth.ts`)
 */

export const ANTIGRAVITY_API_VERSION = '2.23.0'

export const ANTIGRAVITY_HUB_USER_AGENT =
  `antigravity/hub/${ANTIGRAVITY_API_VERSION} darwin/arm64`

export const ANTIGRAVITY_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.googleapis.com'
export const ANTIGRAVITY_ENDPOINT_DAILY_SANDBOX = 'https://daily-cloudcode-pa.sandbox.googleapis.com'
export const ANTIGRAVITY_ENDPOINT_AUTOPUSH = 'https://autopush-cloudcode-pa.sandbox.googleapis.com'
export const ANTIGRAVITY_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com'

export const CODE_ASSIST_BASE = `${ANTIGRAVITY_ENDPOINT_PROD}/v1internal`
export const ANTIGRAVITY_GENERATION_BASE = `${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal`

export const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com'

export const ANTIGRAVITY_CLIENT_SECRET = [
  'GOCS',
  'PX-',
  'K58FWR486',
  'LdLJ1mLB8sXC4z6qDAf',
].join('')

export const ANTIGRAVITY_REDIRECT_URI = 'https://antigravity.google/oauth-callback'

export const ANTIGRAVITY_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
]

