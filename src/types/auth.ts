/* ── Enums ── */
export type AuthProviderCode = 'LOCAL' | 'KAKAO' | 'GOOGLE'
export type UserStatus = 'ACTIVE' | 'PENDING' | 'PENDING_ONBOARDING' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED'
export type UserProfileVisibility = 'PUBLIC' | 'PRIVATE'

/* ── 백엔드 중첩 User 구조 (매핑 소스) ── */
export interface BackendUserProfile {
  displayName: string
  profileImageUrl: string | null
  profileMediaFileId: string | null
  bio: string | null
  profileVisibility: UserProfileVisibility
}
export interface BackendUserSettings {
  displayLanguage: string
  timezone: string
  marketingEmailOptIn: boolean
  marketingEmailOptedInAt: string | null
  marketingEmailOptedOutAt: string | null
  tripInviteEmailOptIn: boolean
}
export interface BackendUser {
  id: string
  primaryEmail: string | null
  primaryEmailVerifiedAt: string | null
  status: UserStatus
  statusReason: string | null
  deletionRequestedAt: string | null
  deletionScheduledAt: string | null
  profile: BackendUserProfile
  settings: BackendUserSettings
  createdAt: string
}

/* ── 프론트 평면 User (UI 호환) ── */
export interface User {
  id: string
  email: string
  displayName: string
  profileImageUrl: string | null
  profileMediaFileId: string | null
  bio: string | null
  profileVisibility: UserProfileVisibility
  status: UserStatus
  statusReason?: string | null
  deletionRequestedAt?: string | null
  deletionScheduledAt?: string | null
  displayLanguage: string
  timezone: string
  marketingEmailOptIn: boolean
  tripInviteEmailOptIn: boolean
  lastLoginAt: string | null
  createdAt: string
}

/** 백엔드 중첩 User → 프론트 평면 User */
export function mapBackendUser(b: BackendUser): User {
  return {
    id: b.id,
    email: b.primaryEmail ?? '',
    displayName: b.profile.displayName,
    profileImageUrl: b.profile.profileImageUrl,
    profileMediaFileId: b.profile.profileMediaFileId,
    bio: b.profile.bio,
    profileVisibility: b.profile.profileVisibility,
    status: b.status,
    statusReason: b.statusReason,
    deletionRequestedAt: b.deletionRequestedAt,
    deletionScheduledAt: b.deletionScheduledAt,
    displayLanguage: b.settings.displayLanguage,
    timezone: b.settings.timezone,
    marketingEmailOptIn: b.settings.marketingEmailOptIn,
    tripInviteEmailOptIn: b.settings.tripInviteEmailOptIn,
    lastLoginAt: null,
    createdAt: b.createdAt,
  }
}

/* ── Auth Requests ── */
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  displayName: string
  displayLanguage?: string
  timezone?: string
  marketingEmailOptIn?: boolean
  acceptedPolicyDocumentIds: string[]
}

export interface SocialLoginRequest {
  providerCode: AuthProviderCode
  providerToken: string
}

/* ── OAuth (Kakao/Google) ──
 * URL path에서 소문자 사용 (/auth/oauth/kakao/callback).
 * AuthProviderCode('LOCAL'|'KAKAO'|'GOOGLE')와 구분.
 */
export type OAuthProvider = 'kakao' | 'google'

export interface OAuthAuthorizationUrlResponse {
  authorizationUrl: string
  state: string
}

export interface VerifyEmailRequest {
  token: string
}

export interface SendEmailVerificationRequest {
  email: string
}

export interface PasswordResetRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  newPassword: string
}

export interface UpdateMeRequest {
  displayName?: string
  profileMediaFileId?: string
  bio?: string
  profileVisibility?: UserProfileVisibility
}

export interface UpdateUserSettingsRequest {
  displayLanguage?: string
  timezone?: string
  marketingEmailOptIn?: boolean
  tripInviteEmailOptIn?: boolean
}

export interface OnboardRequest {
  displayName: string
  acceptedPolicyDocumentIds: string[]
}

/* ── Auth Responses ── */
export interface AuthTokenResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn?: number
  user: BackendUser
  onboarded: boolean
}

export interface RegisterResponse {
  userId: string
  email: string
  message: string
}

export interface PolicyDocument {
  id: string
  policyCode: string
  version: string
  languageCode: string
  title: string
  contentUrl: string | null
  contentHash: string | null
  isRequired: boolean
  publishedAt: string
}

export interface UserSettings {
  displayLanguage: string
  timezone: string
  marketingEmailOptIn: boolean
  marketingEmailOptedInAt: string | null
  marketingEmailOptedOutAt: string | null
  tripInviteEmailOptIn: boolean
}

export interface UserSummary {
  id: string
  displayName: string
  profileImageUrl: string | null
  bio?: string | null
}

/** UI 표시용 avatar 이니셜 (displayName 첫 글자) */
export function getUserAvatar(user: Pick<User, 'displayName'>): string {
  return (user.displayName || '?').charAt(0).toUpperCase()
}
