import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveOAuthRedirectUri } from './oauthRedirect'

describe('resolveOAuthRedirectUri', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses the configured public app URL in deployed environments', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://soomgil.me/')

    expect(resolveOAuthRedirectUri('google')).toBe('https://soomgil.me/auth/oauth/google/callback')
    expect(resolveOAuthRedirectUri('kakao')).toBe('https://soomgil.me/auth/oauth/kakao/callback')
  })

  it('falls back to the current browser origin during local development', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', '')

    expect(resolveOAuthRedirectUri('google')).toBe(`${window.location.origin}/auth/oauth/google/callback`)
  })
})
