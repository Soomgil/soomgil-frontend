export function isUsableAccessToken(token: string | null | undefined): token is string {
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const claims = JSON.parse(atob(padded)) as { exp?: number }
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() + 5000
  } catch {
    return false
  }
}

export function getStoredAccessToken() {
  const token = localStorage.getItem('accessToken')
  return isUsableAccessToken(token) ? token : null
}
