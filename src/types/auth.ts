/* ── Enums ── */
export type AuthProviderCode = 'LOCAL' | 'KAKAO' | 'GOOGLE'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED'

/* ── Requests ── */
export interface LoginRequest {
  email: string
  password: string
  rememberMe?: boolean
}

export interface SocialLoginRequest {
  providerCode: AuthProviderCode
  providerToken: string
}

export interface RegisterRequest {
  displayName: string
  email: string
  password: string
  agreeTerms: boolean
}

/* ── Responses ── */
export interface AuthResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: User
}

/* ── Domain ── */
export interface User {
  id: string
  email: string
  displayName: string
  profileImageUrl: string | null
  profileMediaFileId: string | null
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
}

/** UI 표시용 avatar 이니셜 (displayName 첫 글자) */
export function getUserAvatar(user: Pick<User, 'displayName'>): string {
  return user.displayName.charAt(0).toUpperCase()
}
