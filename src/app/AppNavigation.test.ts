import { mount } from '@vue/test-utils'
import { defineComponent, onMounted } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import App from './App.vue'

vi.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ token: null }) }))
vi.mock('@/stores/swipe.store', () => ({ useSwipeStore: () => ({ reset: vi.fn(), warm: vi.fn() }) }))
vi.mock('@/i18n/ui-localizer', () => ({ useUiLocalizer: vi.fn() }))

it('keeps the same header through navigation and hides it only on immersive routes', async () => {
  const mounted = vi.fn()
  const Header = defineComponent({ setup() { onMounted(mounted) }, template: '<header>Navigation</header>' })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: { template: '<div>Home</div>' } },
    { path: '/mypage', component: { template: '<div>Profile</div>' } },
    { path: '/map', meta: { hideLayout: true }, component: { template: '<div>Map</div>' } },
  ] })
  await router.push('/home')
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router], stubs: { AppHeader: Header, VoteResultMapOverlay: true } } })
  const header = wrapper.get('header').element
  await router.push('/mypage')
  expect(wrapper.get('header').element).toBe(header)
  expect(wrapper.find('.service-backdrop').exists()).toBe(true)
  await router.push('/map')
  expect(wrapper.get('header').isVisible()).toBe(false)
  expect(wrapper.find('.service-backdrop').exists()).toBe(true)
  await router.push('/home')
  expect(wrapper.get('header').isVisible()).toBe(true)
  expect(mounted).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

