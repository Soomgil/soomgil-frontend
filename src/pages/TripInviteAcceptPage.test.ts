import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripInviteAcceptPage from './TripInviteAcceptPage.vue'

const trip = {
  id: 'trip-1',
  title: '부산 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE' as const,
  myRole: 'MEMBER' as const,
  itineraryVersion: 0,
  createdAt: '2026-06-20T00:00:00Z',
  ownerUserId: 'user-1',
  regions: [],
  members: [],
  retrippedFromPostId: null,
}

const routerPush = vi.hoisted(() => vi.fn())
const route = vi.hoisted(() => ({
  current: null as { params: { inviteCode: string } } | null,
}))
const store = vi.hoisted(() => ({
  acceptingInvite: false,
  acceptInvite: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ isAuthenticated: true }) }))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  route.current = reactive({ params: { inviteCode: 'JOIN-ME' } })
  return {
    useRoute: () => route.current,
    useRouter: () => ({ push: routerPush }),
  }
})

describe('TripInviteAcceptPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    route.current!.params.inviteCode = 'JOIN-ME'
  })

  it('초대 수락 후 여행 이동을 제공한다', async () => {
    store.acceptInvite.mockResolvedValue(trip)
    const wrapper = mount(TripInviteAcceptPage, {
      global: { stubs: { AppHeader: true } },
    })
    await flushPromises()

    expect(store.acceptInvite).toHaveBeenCalledWith('JOIN-ME')
    expect(wrapper.text()).toContain('초대 수락 완료')

    await wrapper.get('[data-testid="go-trip"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith({ name: 'Route', params: { tripId: trip.id } })
  })

  it('만료된 초대를 구체적으로 안내한다', async () => {
    store.acceptInvite.mockRejectedValue({
      response: { status: 409, data: { code: 'CONFLICT', detail: 'Trip invite has expired.' } },
    })
    const wrapper = mount(TripInviteAcceptPage, {
      global: { stubs: { AppHeader: true } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('초대가 만료되었습니다')
    expect(wrapper.find('[data-testid="retry-invite"]').exists()).toBe(false)
  })

  it.each([
    ['Trip invite is not pending.', '이미 사용되었거나 취소된 초대 링크입니다.'],
    ['User is already a trip member.', '이미 참여 중인 여행입니다'],
  ])('충돌 상세에 맞는 안내를 표시한다', async (detail, expectedMessage) => {
    store.acceptInvite.mockRejectedValue({
      response: { status: 409, data: { code: 'CONFLICT', detail } },
    })
    const wrapper = mount(TripInviteAcceptPage, {
      global: { stubs: { AppHeader: true } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain(expectedMessage)
  })

  it('같은 페이지에서 초대 코드가 변경되면 새 초대를 처리한다', async () => {
    store.acceptInvite
      .mockResolvedValueOnce(trip)
      .mockResolvedValueOnce({ ...trip, id: 'trip-2', title: '제주 여행' })
    const wrapper = mount(TripInviteAcceptPage, {
      global: { stubs: { AppHeader: true } },
    })
    await flushPromises()

    route.current!.params.inviteCode = 'NEXT-INVITE'
    await flushPromises()

    expect(store.acceptInvite).toHaveBeenNthCalledWith(2, 'NEXT-INVITE')
    expect(wrapper.text()).toContain('제주 여행')
  })

  it('이전 초대 응답이 늦게 도착해도 새 초대 결과를 유지한다', async () => {
    let resolveFirstInvite!: (value: typeof trip) => void
    const firstInvite = new Promise<typeof trip>((resolve) => {
      resolveFirstInvite = resolve
    })
    store.acceptInvite
      .mockReturnValueOnce(firstInvite)
      .mockResolvedValueOnce({ ...trip, id: 'trip-2', title: '제주 여행' })
    const wrapper = mount(TripInviteAcceptPage, {
      global: { stubs: { AppHeader: true } },
    })

    route.current!.params.inviteCode = 'NEXT-INVITE'
    await flushPromises()
    resolveFirstInvite(trip)
    await flushPromises()

    expect(wrapper.text()).toContain('제주 여행')
    expect(wrapper.text()).not.toContain('부산 여행')
  })
})

