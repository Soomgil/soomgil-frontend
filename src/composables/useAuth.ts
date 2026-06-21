import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import type { OAuthProvider, RegisterRequest } from '@/types/auth'

export function useAuth() {
  const auth = useAuthStore()
  const router = useRouter()

  async function login(email: string, password: string, rememberMe = false) {
    await auth.login(email, password, rememberMe)
    // login 응답에 user가 포함되어 있지만, 최신 상태를 위해 한 번 더 fetch
    try {
      await auth.fetchUser()
    } catch {
      // user fetch 실패해도 토큰은 유효 → 로그인은 성공으로 간주
    }
    const redirect = router.currentRoute.value.query.redirect as string
    router.push(redirect || '/home')
  }

  /** OAuth 로그인 시작 — Kakao/Google 페이지로 리다이렉트.
   *  콜백 처리는 /auth/oauth/:provider/callback (OAuthCallbackPage)에서. */
  async function loginWithOAuth(provider: OAuthProvider) {
    const redirect = router.currentRoute.value.query.redirect as string
    await auth.loginWithOAuth(provider, redirect || '/home')
  }

  /** 회원가입 → 이메일 인증 페이지로 이동 (토큰 미저장) */
  async function register(payload: RegisterRequest) {
    await auth.register(payload)
    router.push({ path: '/verify-email', query: { email: payload.email } })
  }

  /** 로그아웃 → 서버 무효화 + 로컬 정리 후 루트로 */
  async function logout() {
    await auth.logout()
    router.push('/')
  }

  return { ...auth, login, loginWithOAuth, register, logout }
}
