import http from './http'
import type {
  AuthTokenResponse,
  BackendUser,
  OAuthAuthorizationUrlResponse,
  OAuthProvider,
  PolicyDocument,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  SendEmailVerificationRequest,
  User,
  VerifyEmailRequest,
} from '@/types/auth'
import { mapBackendUser } from '@/types/auth'

/* ── 로그인 결과 (토큰 + 평면 user) ──
 * auth.store에서 토큰 저장과 user 채우기를 동시에 처리하기 위한 묶음.
 */
export interface LoginResult {
  token: AuthTokenResponse
  user: User
}

export const authApi = {
  /** 이메일/비밀번호 로그인 */
  login: async (email: string, password: string): Promise<LoginResult> => {
    const res = await http.post<AuthTokenResponse>('/auth/login', { email, password })
    return { token: res.data, user: mapBackendUser(res.data.user) }
  },

  /** OAuth 인증 URL 발급 (Kakao/Google 로그인 페이지 진입용) */
  getOAuthAuthorizationUrl: async (
    provider: OAuthProvider,
    redirectUri: string,
  ): Promise<OAuthAuthorizationUrlResponse> => {
    // 백엔드 OAuthProviderCode enum이 대소문자 구분 → path는 대문자로.
    // redirectUri 자체는 소문자 그대로 (카카오/구글 콘솔에 등록된 값과 일치해야 함).
    const res = await http.get<OAuthAuthorizationUrlResponse>(
      `/auth/oauth/${provider.toUpperCase()}/authorization-url`,
      { params: { redirectUri } },
    )
    return res.data
  },

  /** OAuth 콜백 — authorization code를 JWT로 교환 */
  completeOAuthLogin: async (
    provider: OAuthProvider,
    payload: { code: string; redirectUri: string; state: string },
  ): Promise<LoginResult> => {
    const res = await http.post<AuthTokenResponse>(
      `/auth/oauth/${provider.toUpperCase()}/callback`,
      { code: payload.code, redirectUri: payload.redirectUri, state: payload.state },
    )
    return { token: res.data, user: mapBackendUser(res.data.user) }
  },

  /** 회원가입 → RegisterResponse (토큰 없음, 이메일 인증 필요) */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const res = await http.post<RegisterResponse>('/auth/register', data)
    return res.data
  },

  /** 토큰 갱신 → AuthTokenResponse (http 인터셉터에서 자동 호출됨) */
  refresh: async (refreshToken: string): Promise<AuthTokenResponse> => {
    const res = await http.post<AuthTokenResponse>('/auth/refresh', { refreshToken })
    return res.data
  },

  /** 로그아웃 (refreshToken 무효화) */
  logout: async (refreshToken: string, allDevices = false): Promise<void> => {
    await http.post('/auth/logout', { refreshToken, allDevices })
  },

  /** 필수 약관 문서 목록 */
  getPolicyDocuments: async (languageCode = 'ko', requiredOnly = true): Promise<PolicyDocument[]> => {
    const res = await http.get<PolicyDocument[]>('/auth/policy-documents', { params: { languageCode, requiredOnly } })
    return res.data
  },

  /** 이메일 인증 메일 (재)발송 */
  sendEmailVerification: async (data: SendEmailVerificationRequest): Promise<void> => {
    await http.post('/auth/email-verification-requests', data)
  },

  /** 이메일 인증 토큰 검증 → 인증 완료된 User */
  verifyEmail: async (data: VerifyEmailRequest): Promise<User> => {
    const res = await http.post<BackendUser>('/auth/email-verifications', data)
    return mapBackendUser(res.data)
  },

  /** 비밀번호 재설정 요청 (이메일로 토큰 발송) */
  requestPasswordReset: async (email: string): Promise<void> => {
    await http.post('/auth/password-reset-requests', { email })
  },

  /** 비밀번호 재설정 (토큰 + 새 비밀번호) */
  resetPassword: async (data: ResetPasswordRequest): Promise<void> => {
    await http.post('/auth/password-resets', data)
  },

  /** 소셜 가입자 최초 온보딩 완료 처리 */
  onboard: async (data: { displayName: string; acceptedPolicyDocumentIds: string[] }): Promise<LoginResult> => {
    const res = await http.post<AuthTokenResponse>('/auth/onboard', data)
    return { token: res.data, user: mapBackendUser(res.data.user) }
  },
}
