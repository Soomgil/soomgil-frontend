import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegisterPage from './RegisterPage.vue'

const register = vi.hoisted(() => vi.fn())
const loginWithOAuth = vi.hoisted(() => vi.fn())
const getPolicyDocuments = vi.hoisted(() => vi.fn())

vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ register, loginWithOAuth }) }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ user: null, onboard: vi.fn() }),
}))
vi.mock('@/api/auth.api', () => ({
  authApi: { getPolicyDocuments },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

const policy = {
  id: 'policy-1',
  policyCode: 'TERMS',
  version: '1.0',
  languageCode: 'ko',
  title: '서비스 이용약관',
  contentUrl: null,
  contentHash: null,
  isRequired: true,
  publishedAt: '2026-06-22T00:00:00Z',
}

async function submitRegistration(error: unknown) {
  getPolicyDocuments.mockResolvedValue([policy])
  register.mockRejectedValue(error)
  const wrapper = mount(RegisterPage, { global: { stubs: { AppHeader: true } } })
  await flushPromises()
  await wrapper.get('input[aria-label="닉네임"]').setValue('민경철')
  await wrapper.get('input[aria-label="이메일"]').setValue('min@example.com')
  await wrapper.get('input[aria-label="비밀번호"]').setValue('password123!')
  await wrapper.get('.auth-check input[type="checkbox"]').setValue(true)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('RegisterPage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('백엔드에 연결할 수 없으면 폼 안에서 명확하게 안내한다', async () => {
    const wrapper = await submitRegistration({ isAxiosError: true, code: 'ERR_NETWORK' })

    expect(wrapper.get('[role="alert"]').text()).toContain('서버에 연결할 수 없습니다')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('이미 가입된 이메일이면 원인을 구체적으로 안내한다', async () => {
    const wrapper = await submitRegistration({
      isAxiosError: true,
      response: { status: 409, data: { code: 'EMAIL_ALREADY_USED' } },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('이미 가입된 이메일입니다')
  })

  it('약관 조회가 실패하면 재시도 가능한 오류를 표시한다', async () => {
    getPolicyDocuments.mockRejectedValue({ isAxiosError: true, code: 'ERR_NETWORK' })
    const wrapper = mount(RegisterPage, { global: { stubs: { AppHeader: true } } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('약관을 불러오지 못했습니다')
    expect(wrapper.get('[data-testid="retry-policies"]').text()).toContain('다시 시도')
  })

  it('간편 가입 버튼이 실제 OAuth 흐름을 시작한다', async () => {
    getPolicyDocuments.mockResolvedValue([policy])
    loginWithOAuth.mockResolvedValue(undefined)
    const wrapper = mount(RegisterPage, { global: { stubs: { AppHeader: true } } })
    await flushPromises()

    const passwordInput = wrapper.get('input[aria-label="비밀번호"]').element
    const submitButton = wrapper.get('button[type="submit"]').element
    const googleButton = wrapper.get('[aria-label="Google 계정으로 가입"]').element

    expect(passwordInput.compareDocumentPosition(googleButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(submitButton.compareDocumentPosition(googleButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await wrapper.get('[aria-label="Google 계정으로 가입"]').trigger('click')

    expect(loginWithOAuth).toHaveBeenCalledWith('google')
  })
})
