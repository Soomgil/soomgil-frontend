import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LandingPage from './LandingPage.vue'

const push = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/components/layout/AppFooter.vue', () => ({
  default: { template: '<footer />' },
}))

describe('LandingPage', () => {
  beforeEach(() => {
    push.mockReset()
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
    })
  })

  it('connects the primary journey actions to login', async () => {
    const wrapper = mount(LandingPage)

    await wrapper.get('button.landing-button--classic').trigger('click')
    await wrapper.get('button.landing-button--light').trigger('click')

    expect(push).toHaveBeenNthCalledWith(1, '/login')
    expect(push).toHaveBeenNthCalledWith(2, '/login')
  })
})
