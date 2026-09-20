import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { replace, logout } = vi.hoisted(() => ({
  replace: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/api/auth.api', () => ({ authApi: { logout } }))

import { useOnboardingStore } from '@/stores/onboarding.store'
import OnboardingHeader from './OnboardingHeader.vue'

describe('OnboardingHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    replace.mockReset()
    logout.mockReset().mockResolvedValue(undefined)
    localStorage.clear()
  })

  it('shows onboarding copy and live progress without service navigation', () => {
    const onboarding = useOnboardingStore()
    onboarding.setAnsweredPlaceCount(4)
    const wrapper = mount(OnboardingHeader)

    expect(wrapper.text()).toContain('취향 수집을 통해 가입을 완료하세요!')
    expect(wrapper.get('.onboarding-header__progress').text()).toContain('4')
    expect(wrapper.get('.onboarding-header__progress').text()).toContain('/ 10')
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('logs out and returns to login', async () => {
    localStorage.setItem('refreshToken', 'refresh-token')
    const wrapper = mount(OnboardingHeader)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(logout).toHaveBeenCalledWith('refresh-token', false)
    expect(replace).toHaveBeenCalledWith('/login')
  })
})
