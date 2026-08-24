import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

let refreshPromise: Promise<string> | null = null

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

export function clearStoredAuthTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('tokenExpiresAt')
}

export function refreshStoredAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return Promise.reject(new Error('no refresh token'))

  refreshPromise = refreshClient
    .post<{ accessToken: string; refreshToken: string; expiresIn?: number }>(
      '/auth/refresh',
      { refreshToken },
    )
    .then(({ data }) => {
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.setItem('refreshToken', data.refreshToken)
      if (typeof data.expiresIn === 'number' && Number.isFinite(data.expiresIn)) {
        localStorage.setItem('tokenExpiresAt', String(Date.now() + data.expiresIn * 1000))
      } else {
        localStorage.removeItem('tokenExpiresAt')
      }
      return data.accessToken
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function ensureStoredAccessToken(): Promise<string | null> {
  const accessToken = getStoredAccessToken()
  if (accessToken) return accessToken
  if (!localStorage.getItem('refreshToken')) return null
  return refreshStoredAccessToken()
}
