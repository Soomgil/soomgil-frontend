import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string>, params: {} as Record<string, string> },
  push: vi.fn(), replace: vi.fn(),
  login: vi.fn(), loginWithOAuth: vi.fn(), verifyEmail: vi.fn(), completeOAuthLogin: vi.fn(),
  sendEmailVerification: vi.fn(), requestPasswordReset: vi.fn(), resetPassword: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, currentRoute: { value: { query: mocks.route.query } } }),
}))
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ login: mocks.login, loginWithOAuth: mocks.loginWithOAuth, verifyEmail: mocks.verifyEmail }),
}))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ completeOAuthLogin: mocks.completeOAuthLogin }),
}))
vi.mock('@/api/auth.api', () => ({
  authApi: {
    sendEmailVerification: mocks.sendEmailVerification,
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
  },
}))
vi.mock('@/components/layout/AppHeader.vue', () => ({ default: { template: '<header />' } }))
vi.mock('@/components/auth/OAuthButtons.vue', () => ({ default: { template: '<div />' } }))

import LoginPage from './LoginPage.vue'
import OAuthCallbackPage from './OAuthCallbackPage.vue'
import ResetPasswordPage from './ResetPasswordPage.vue'
import VerifyEmailPage from './VerifyEmailPage.vue'

describe('인증 API 화면 흐름', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.route.query = {}
    mocks.route.params = {}
  })

  it('이메일 인증과 비밀번호 변경 완료 상태를 로그인 화면에 안내한다', () => {
    mocks.route.query = { verified: '1' }
    const verified = mount(LoginPage)
    expect(verified.get('[role="status"]').text()).toContain('이메일 인증이 완료')
    verified.unmount()

    mocks.route.query = { reset: '1' }
    const reset = mount(LoginPage)
    expect(reset.get('[role="status"]').text()).toContain('비밀번호가 변경')
  })

  it('인증 메일 link의 token을 자동으로 검증한다', async () => {
    mocks.route.query = { token: 'verify-token', email: 'demo@example.com' }
    mocks.verifyEmail.mockResolvedValue({ id: 'user-1', email: 'demo@example.com' })
    const wrapper = mount(VerifyEmailPage)
    await flushPromises()

    expect(mocks.verifyEmail).toHaveBeenCalledWith('verify-token')
    expect(wrapper.get('[role="status"]').text()).toContain('이메일 인증이 완료')
    await wrapper.get('[data-testid="go-login"]').trigger('click')
    expect(mocks.replace).toHaveBeenCalledWith({ path: '/login', query: { verified: '1' } })
  })

  it('다른 탭에서 인증되면 가입 대기 화면도 완료 상태로 바뀐다', async () => {
    mocks.route.query = { email: 'demo@example.com' }
    const wrapper = mount(VerifyEmailPage)

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'soomgil.email-verification.completed',
      newValue: JSON.stringify({ email: 'demo@example.com', completedAt: Date.now() }),
    }))
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('계정이 활성화되었습니다')
  })

  it('만료된 이메일 인증 link를 화면 안에서 안내한다', async () => {
    mocks.route.query = { token: 'expired-token', email: 'demo@example.com' }
    mocks.verifyEmail.mockRejectedValue(new Error('expired'))
    const wrapper = mount(VerifyEmailPage)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('만료되었거나 유효하지 않습니다')
  })

  it('비밀번호 재설정 link의 token으로 바로 변경 단계를 열고 서버 실패를 안내한다', async () => {
    mocks.route.query = { token: 'reset-token', email: 'demo@example.com' }
    mocks.resetPassword.mockRejectedValue(new Error('expired'))
    const wrapper = mount(ResetPasswordPage)

    expect((wrapper.get('input[aria-label="재설정 토큰"]').element as HTMLInputElement).value).toBe('reset-token')
    await wrapper.get('input[aria-label="새 비밀번호"]').setValue('New-password-123!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.resetPassword).toHaveBeenCalledWith({ token: 'reset-token', newPassword: 'New-password-123!' })
    expect(wrapper.get('[role="alert"]').text()).toContain('재설정 링크가 만료')
  })

  it('OAuth callback 실패를 복구 경로와 함께 안내한다', async () => {
    mocks.route.params = { provider: 'google' }
    mocks.route.query = { code: 'code', state: 'state' }
    mocks.completeOAuthLogin.mockRejectedValue(new Error('OAuth state가 일치하지 않습니다.'))
    const wrapper = mount(OAuthCallbackPage)
    await flushPromises()

    expect(wrapper.text()).toContain('OAuth state가 일치하지 않습니다.')
    expect(wrapper.text()).toContain('로그인 페이지로')
  })
})
