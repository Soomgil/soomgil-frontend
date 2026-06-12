import http from './http'
import type { ApiResponse } from '@/types/api'
import type { AuthResponse, LoginRequest, SocialLoginRequest, RegisterRequest, User } from '@/types/auth'

// TODO: 실제 API 연동 시 mock import 제거
import { mockUser } from '@/mocks/mockUser'

export const authApi = {
  /** 이메일/비밀번호 로그인 */
  login: async (_data: LoginRequest): Promise<ApiResponse<AuthResponse>> => {
    // TODO: return http.post('/auth/login', data)
    return { status: 200, message: 'ok', data: { accessToken: 'mock-token', refreshToken: 'mock-refresh', expiresIn: 3600, user: mockUser } }
  },

  /** 소셜 로그인 (KAKAO, GOOGLE) */
  socialLogin: async (_data: SocialLoginRequest): Promise<ApiResponse<AuthResponse>> => {
    // TODO: return http.post('/auth/social-login', data)
    return { status: 200, message: 'ok', data: { accessToken: 'mock-token', refreshToken: 'mock-refresh', expiresIn: 3600, user: mockUser } }
  },

  /** 회원가입 */
  register: async (_data: RegisterRequest): Promise<ApiResponse<AuthResponse>> => {
    // TODO: return http.post('/auth/register', data)
    return { status: 200, message: 'ok', data: { accessToken: 'mock-token', refreshToken: 'mock-refresh', expiresIn: 3600, user: mockUser } }
  },

  /** 현재 사용자 조회 */
  getMe: async (): Promise<ApiResponse<User>> => {
    // TODO: return http.get('/me')
    return { status: 200, message: 'ok', data: mockUser }
  },

  /** 토큰 갱신 */
  refresh: async (refreshToken: string): Promise<ApiResponse<AuthResponse>> => {
    return http.post('/auth/refresh', { refreshToken })
  },

  /** 로그아웃 */
  logout: async (): Promise<ApiResponse<void>> => {
    // TODO: return http.post('/auth/logout')
    return { status: 200, message: 'ok', data: undefined as unknown as void }
  },
}
