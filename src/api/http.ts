import axios from 'axios'
import type { ApiResponse, ProblemDetail } from '@/types/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

/* ── Request: JWT 주입 ── */
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/* ── Response: 에러 처리 (RFC 7807) ── */
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const problem: ProblemDetail | undefined = error.response?.data

    if (status === 401) {
      // TODO: 토큰 갱신 로직 (refresh token으로 재시도)
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
    }

    // RFC 7807 Problem Detail이 있으면 구조화된 에러 제공
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

/* ── Typed API helper ── */
export async function apiCall<T>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, data?: unknown): Promise<ApiResponse<T>> {
  const response = await http[method]<ApiResponse<T>>(url, data)
  return response.data
}

export default http
