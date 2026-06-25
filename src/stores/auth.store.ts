import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  OAuthProvider,
  RegisterRequest,
  RegisterResponse,
  User,
} from '@/types/auth'
import { authApi } from '@/api/auth.api'
import { userApi } from '@/api/user.api'
import { clearCollaborationSessionIds } from '@/realtime/collaborationSession'

/* ── OAuth 진행 중 상태 (CSRF state 검증용) ──
 * 리다이렉트 전 sessionStorage에 저장, 콜백 페이지에서 state 일치 여부 검증.
 */
const OAUTH_SESSION_KEY = 'oauth.pending'

interface PendingOAuth {
  provider: OAuthProvider
  state: string
  redirectUri: string
  // 로그인 성공 후 돌아갈 경로 (없으면 /home)
  next: string
}

function readPendingOAuth(): PendingOAuth | null {
  const raw = sessionStorage.getItem(OAUTH_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingOAuth
  } catch {
    return null
  }
}

function clearPendingOAuth() {
  sessionStorage.removeItem(OAUTH_SESSION_KEY)
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('accessToken'))
  const isAuthenticated = computed(() => !!token.value)

  function _persistAuth(accessToken: string, refreshToken: string, expiresIn?: number) {
    token.value = accessToken
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
      localStorage.setItem('tokenExpiresAt', String(Date.now() + expiresIn * 1000))
    } else {
      localStorage.removeItem('tokenExpiresAt')
    }
  }

  function _clearAuth() {
    user.value = null
    token.value = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('tokenExpiresAt')
    clearCollaborationSessionIds()
  }

  /** 이메일/비밀번호 로그인 → 토큰 저장 + user 채우기 */
  async function login(email: string, password: string, _rememberMe = false) {
    const { token: authToken, user: fetchedUser } = await authApi.login(email, password)
    user.value = fetchedUser
    _persistAuth(authToken.accessToken, authToken.refreshToken, authToken.expiresIn)
  }

  /** OAuth 로그인 시작 — 인증 URL 받아 Kakao/Google로 리다이렉트.
   *  실제 토큰 저장은 completeOAuthLogin에서. */
  async function loginWithOAuth(provider: OAuthProvider, next = '/home') {
    const redirectUri = `${window.location.origin}/auth/oauth/${provider}/callback`
    const { authorizationUrl, state } = await authApi.getOAuthAuthorizationUrl(provider, redirectUri)

    const pending: PendingOAuth = { provider, state, redirectUri, next }
    sessionStorage.setItem(OAUTH_SESSION_KEY, JSON.stringify(pending))

    // 전체 페이지 리다이렉트 (Kakao/Google 로그인 페이지로)
    window.location.href = authorizationUrl
  }

  /** OAuth 콜백 처리 — code/state 검증 후 토큰 저장.
   *  OAuthCallbackPage에서 호출. 성공 시 next 경로 반환, 실패 시 throw. */
  async function completeOAuthLogin(
    provider: OAuthProvider,
    code: string,
    state: string,
  ): Promise<string> {
    const pending = readPendingOAuth()
    if (!pending) {
      throw new Error('OAuth 세션 정보가 없습니다. 다시 로그인해주세요.')
    }
    if (pending.provider !== provider || pending.state !== state) {
      clearPendingOAuth()
      throw new Error('OAuth state가 일치하지 않습니다. 다시 시도해주세요.')
    }

    try {
      const { token: authToken, user: fetchedUser } = await authApi.completeOAuthLogin(provider, {
        code,
        redirectUri: pending.redirectUri,
        state,
      })
      user.value = fetchedUser
      _persistAuth(authToken.accessToken, authToken.refreshToken, authToken.expiresIn)
      if (!authToken.onboarded) {
        return '/register?oauth=1'
      }
      return pending.next
    } finally {
      clearPendingOAuth()
    }
  }

  /** 회원가입 → 토큰 미반환, 이메일 인증 필요 */
  async function register(req: RegisterRequest): Promise<RegisterResponse> {
    return await authApi.register(req)
  }

  /** 이메일 인증 토큰 검증 → 인증 완료된 User (아직 로그인 아님) */
  async function verifyEmail(token: string): Promise<User> {
    const verified = await authApi.verifyEmail({ token })
    // 인증 완료 시 user 정보 채움 (자동 로그인은 아님 → /login 이동)
    user.value = verified
    return verified
  }

  /** /me 재조회 → user 동기화 */
  async function fetchUser() {
    user.value = await userApi.getMe()
  }

  /** 소셜 최초 온보딩 완료 처리 → 토큰 저장 및 user 채우기 */
  async function onboard(displayName: string, acceptedPolicyDocumentIds: string[]) {
    const { token: authToken, user: fetchedUser } = await authApi.onboard({
      displayName,
      acceptedPolicyDocumentIds,
    })
    user.value = fetchedUser
    _persistAuth(authToken.accessToken, authToken.refreshToken, authToken.expiresIn)
  }

  /** 로그아웃 (refreshToken 무효화 + 로컬 정리) */
  async function logout(allDevices = false) {
    const refreshToken = localStorage.getItem('refreshToken')
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken, allDevices)
      } catch {
        // 서버 실패해도 로컬 정리는 진행
      }
    }
    _clearAuth()
  }

  return { user, token, isAuthenticated, login, loginWithOAuth, completeOAuthLogin, register, verifyEmail, fetchUser, onboard, logout }
})
