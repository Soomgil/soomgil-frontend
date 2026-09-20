import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { applyGuards } from './guards'

const mocks = vi.hoisted(() => ({
  ensureStatus: vi.fn(),
}))

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: true,
    user: { id: 'user-1', status: 'ACTIVE' },
  }),
}))
vi.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({ ensureStatus: mocks.ensureStatus }),
}))
vi.mock('@/stores/swipe.store', () => ({ useSwipeStore: () => ({ warm: vi.fn() }) }))
vi.mock('@/stores/voting.store', () => ({ useVotingStore: () => ({ ensureGate: vi.fn() }) }))

const blank = { template: '<div />' }

function buildRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', name: 'Home', component: blank, meta: { requiresAuth: true } },
      {
        path: '/onboarding/preferences',
        name: 'OnboardingPreferences',
        component: blank,
        meta: { requiresAuth: true },
      },
      { path: '/trips/:tripId/route', name: 'Route', component: blank, meta: { requiresAuth: true } },
    ],
  })
  applyGuards(router)
  return router
}

describe('가입 취향 설문 진입 가드', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('미완료 사용자를 설문으로 보내고 원래 목적지를 보존한다', async () => {
    mocks.ensureStatus.mockResolvedValue(false)
    const router = buildRouter()

    await router.push('/trips/trip-1/route')

    expect(router.currentRoute.value.name).toBe('OnboardingPreferences')
    expect(router.currentRoute.value.query.redirect).toBe('/trips/trip-1/route')
  })

  it('완료 사용자가 설문 주소로 들어오면 안전한 내부 목적지로 보낸다', async () => {
    mocks.ensureStatus.mockResolvedValue(true)
    const router = buildRouter()

    await router.push('/onboarding/preferences?redirect=/home')

    expect(router.currentRoute.value.name).toBe('Home')
  })

  it('완료 상태를 확인하지 못해도 필수 설문 화면 안에서 재시도하게 한다', async () => {
    mocks.ensureStatus.mockResolvedValue(null)
    const router = buildRouter()

    await router.push('/home')

    expect(router.currentRoute.value.name).toBe('OnboardingPreferences')
    expect(router.currentRoute.value.query.redirect).toBe('/home')
  })
})
