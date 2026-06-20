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
const store = vi.hoisted(() => ({
  acceptingInvite: false,
  acceptInvite: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { inviteCode: 'JOIN-ME' } }),
  useRouter: () => ({ push: routerPush }),
}))

describe('TripInviteAcceptPage', () => {
  beforeEach(() => vi.resetAllMocks())

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
})
