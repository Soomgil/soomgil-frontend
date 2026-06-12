import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types/auth'
import type { AuthProviderCode } from '@/types/auth'
import { authApi } from '@/api/auth.api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('accessToken'))
  const isAuthenticated = computed(() => !!token.value)

  function _persistAuth(accessToken: string, refreshToken: string, expiresIn: number) {
    token.value = accessToken
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    // expiresIn은 필요시 만료 시간 계산에 사용
    localStorage.setItem('tokenExpiresAt', String(Date.now() + expiresIn * 1000))
  }

  /** 이메일/비밀번호 로그인 */
  async function login(email: string, password: string, rememberMe = false) {
    const res = await authApi.login({ email, password, rememberMe })
    user.value = res.data.user
    _persistAuth(res.data.accessToken, res.data.refreshToken, res.data.expiresIn)
  }

  /** 소셜 로그인 */
  async function socialLogin(providerCode: AuthProviderCode, providerToken: string) {
    const res = await authApi.socialLogin({ providerCode, providerToken })
    user.value = res.data.user
    _persistAuth(res.data.accessToken, res.data.refreshToken, res.data.expiresIn)
  }

  /** 회원가입 */
  async function register(displayName: string, email: string, password: string) {
    const res = await authApi.register({ displayName, email, password, agreeTerms: true })
    user.value = res.data.user
    _persistAuth(res.data.accessToken, res.data.refreshToken, res.data.expiresIn)
  }

  /** 현재 사용자 조회 */
  async function fetchUser() {
    const res = await authApi.getMe()
    user.value = res.data
  }

  /** 로그아웃 */
  function logout() {
    authApi.logout().catch(() => {}) // 실패해도 로컬 정리는 진행
    user.value = null
    token.value = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('tokenExpiresAt')
  }

  return { user, token, isAuthenticated, login, socialLogin, register, fetchUser, logout }
})
