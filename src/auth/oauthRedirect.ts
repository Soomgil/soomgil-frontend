import type { OAuthProvider } from '@/types/auth'

function normalizedPublicAppUrl(): string {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim()
  const baseUrl = configuredUrl || window.location.origin
  return baseUrl.replace(/\/+$/, '')
}

/** OAuth 공급자 콘솔에 등록하는 canonical callback URI를 반환한다. */
export function resolveOAuthRedirectUri(provider: OAuthProvider): string {
  return `${normalizedPublicAppUrl()}/auth/oauth/${provider}/callback`
}
