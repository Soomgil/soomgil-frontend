import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import type { ApiResponse, ProblemDetail } from '@/types/api'
import {
  clearStoredAuthTokens,
  isUsableAccessToken,
  refreshStoredAccessToken,
} from '@/auth/accessToken'
import {
  clearCollaborationSessionIds,
  COLLABORATION_SESSION_HEADER,
  getCollaborationSessionId,
} from '@/realtime/collaborationSession'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export function buildLoginRedirectUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const currentPath = `${location.pathname}${location.search}${location.hash}`
  if (location.pathname === '/login') return '/login'

  const params = new URLSearchParams({ redirect: currentPath })
  return `/login?${params.toString()}`
}

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

type RetryableConfig = AxiosRequestConfig & { _retried?: boolean }

/* ── Request: JWT 주입 ── */
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token && isUsableAccessToken(token)) {
    config.headers.Authorization = `Bearer ${token}`
    const collaborationSessionId = getCollaborationSessionId()
    if (collaborationSessionId) {
      config.headers[COLLABORATION_SESSION_HEADER] = collaborationSessionId
    }
  } else if (token) {
    // 손상되거나 만료된 access token은 공개 API까지 401로 만드는 원인이 된다.
    // refresh token은 유지해 보호 API의 401 응답에서 정상 갱신하도록 한다.
    localStorage.removeItem('accessToken')
    localStorage.removeItem('tokenExpiresAt')
    clearCollaborationSessionIds()
  }
  return config
})

/* ── 토큰 갱신 (재귀 방지용 raw 인스턴스) ── */
function clearAuthAndRedirect() {
  clearStoredAuthTokens()
  clearCollaborationSessionIds()
  window.location.href = buildLoginRedirectUrl(window.location)
}

/* ── Response: 에러 처리 (RFC 7807) + 401 refresh 재시도 ── */
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const original = error.config as RetryableConfig | undefined
    const problem: ProblemDetail | undefined = error.response?.data

    if (status === 401 && original) {
      // refresh 자체 실패 → 영구 로그아웃
      if (original.url?.includes('/auth/refresh')) {
        clearAuthAndRedirect()
        return Promise.reject(error)
      }
      // login/register 실패는 재시도 금지
      if (original.url?.includes('/auth/login') || original.url?.includes('/auth/register')) {
        return Promise.reject(error)
      }
      // 중복 재시도 방지
      if (original._retried) {
        clearAuthAndRedirect()
        return Promise.reject(error)
      }
      original._retried = true

      try {
        const newToken = await refreshStoredAccessToken()
        original.headers = original.headers ?? {}
        ;(original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`
        return http.request(original)
      } catch (refreshError) {
        clearAuthAndRedirect()
        return Promise.reject(refreshError)
      }
    }

    if (problem?.type) {
      console.error(`[${problem.status}] ${problem.title}: ${problem.detail}`)
    } else if (status === 403) {
      console.error('접근 권한이 없습니다.')
    } else if (status === 500) {
      console.error('서버 오류가 발생했습니다.')
    }

    return Promise.reject(error)
  },
)

/* ── Typed API helper (다른 도메인에서 사용) ── */
export async function apiCall<T>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, data?: unknown): Promise<ApiResponse<T>> {
  const response = await http[method]<ApiResponse<T>>(url, data)
  return response.data
}

export default http
