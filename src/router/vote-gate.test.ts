import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import { applyGuards } from './guards'

const mocks = vi.hoisted(() => ({
  ensureGate: vi.fn(),
  warm: vi.fn(),
  isAuthenticated: true,
}))

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    get isAuthenticated() {
      return mocks.isAuthenticated
    },
  }),
}))
vi.mock('@/stores/swipe.store', () => ({ useSwipeStore: () => ({ warm: mocks.warm }) }))
vi.mock('@/stores/voting.store', () => ({ useVotingStore: () => ({ ensureGate: mocks.ensureGate }) }))

const blank = { template: '<div />' }

function buildRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'Landing', component: blank },
      { path: '/login', name: 'Login', component: blank },
      { path: '/home', name: 'Home', component: blank },
      { path: '/trips/:tripId/route', name: 'Route', component: blank, meta: { requiresAuth: true } },
      { path: '/trips/:tripId/vote', name: 'TripVote', component: blank, meta: { requiresAuth: true } },
    ],
  })
  applyGuards(router)
  return router
}

describe('여행 방 투표 진입 가드', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.isAuthenticated = true
  })

  it('아직 제출하지 않은 참여자는 지도 대신 투표 화면으로 간다', async () => {
    mocks.ensureGate.mockResolvedValue('VOTE')
    const router = buildRouter()

    await router.push('/trips/trip-1/route')

    expect(router.currentRoute.value.name).toBe('TripVote')
    expect(router.currentRoute.value.params.tripId).toBe('trip-1')
    expect(mocks.ensureGate).toHaveBeenCalledWith('trip-1')
  })

  it('제출을 마친 참여자도 투표가 끝날 때까지 대기 화면에 머문다', async () => {
    mocks.ensureGate.mockResolvedValue('WAITING')
    const router = buildRouter()

    await router.push('/trips/trip-1/route')

    expect(router.currentRoute.value.name).toBe('TripVote')
  })

  it('참여할 투표가 없으면 지도로 그대로 진입한다', async () => {
    mocks.ensureGate.mockResolvedValue('MAP')
    const router = buildRouter()

    await router.push('/trips/trip-1/route')

    expect(router.currentRoute.value.name).toBe('Route')
  })

  it('투표가 끝난 뒤 투표 화면에 들어가면 지도로 돌려보낸다', async () => {
    mocks.ensureGate.mockResolvedValue('MAP')
    const router = buildRouter()

    await router.push('/trips/trip-1/vote')

    expect(router.currentRoute.value.name).toBe('Route')
  })

  it('투표가 필요한 상태면 투표 화면에 머문다', async () => {
    mocks.ensureGate.mockResolvedValue('VOTE')
    const router = buildRouter()

    await router.push('/trips/trip-1/vote')

    expect(router.currentRoute.value.name).toBe('TripVote')
  })

  it('게이트 조회가 실패해도 여행 방 진입을 막지 않는다', async () => {
    mocks.ensureGate.mockResolvedValue('MAP')
    const router = buildRouter()

    await router.push('/trips/trip-1/route')

    expect(router.currentRoute.value.name).toBe('Route')
  })

  it('비로그인 사용자는 게이트를 호출하지 않고 로그인으로 보낸다', async () => {
    mocks.isAuthenticated = false
    const router = buildRouter()

    await router.push('/trips/trip-1/route')

    expect(router.currentRoute.value.name).toBe('Login')
    expect(mocks.ensureGate).not.toHaveBeenCalled()
  })
})
