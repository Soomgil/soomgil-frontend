import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyVoteParticipation, TripVoteSessionDetail, TripVoteSessionState } from '@/types/voting'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  user: { id: 'owner-1', displayName: '방장' } as { id: string } | null,
  votingApi: {
    getCurrentSession: vi.fn(),
    openSession: vi.fn(),
    saveStickers: vi.fn(),
    submit: vi.fn(),
    closeSession: vi.fn(),
    getResult: vi.fn(),
  },
  tripApi: {
    getTrip: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ params: { tripId: 'trip-1' } }),
}))
vi.mock('@/api/voting.api', () => ({ votingApi: mocks.votingApi }))
vi.mock('@/api/trip.api', () => ({ tripApi: mocks.tripApi }))
vi.mock('@/composables/useToast', () => ({ useToast: () => mocks.toast }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    get user() {
      return mocks.user
    },
    get isAuthenticated() {
      return Boolean(mocks.user)
    },
    fetchUser: vi.fn(),
  }),
}))

import TripVotePage from './TripVotePage.vue'

const stubs = { AppShell: { template: '<div><slot /></div>' } }

function session(overrides: Partial<TripVoteSessionDetail> = {}): TripVoteSessionDetail {
  return {
    id: 'session-1',
    tripId: 'trip-1',
    status: 'OPEN',
    stickerAllowance: 3,
    selectionCount: 2,
    candidateCount: 2,
    openedAt: '2026-08-24T10:00:00Z',
    completedAt: null,
    completionReason: null,
    participantSummary: { total: 3, submitted: 1 },
    candidates: [
      {
        id: 'c1', rank: 1, provider: 'KTO', externalPlaceId: '126508', name: '성산일출봉',
        address: '제주', lat: null, lng: null, thumbnailUrl: null, category: null, stickerCount: null,
      },
      {
        id: 'c2', rank: 2, provider: 'KTO', externalPlaceId: '126509', name: '우도',
        address: '제주', lat: null, lng: null, thumbnailUrl: null, category: null, stickerCount: null,
      },
    ],
    ...overrides,
  }
}

function participation(overrides: Partial<MyVoteParticipation> = {}): MyVoteParticipation {
  return {
    participantId: 'p1',
    status: 'NOT_STARTED',
    stickerAllowance: 3,
    usedStickerCount: 0,
    remainingStickerCount: 3,
    placements: [],
    submittedAt: null,
    ...overrides,
  }
}

function state(overrides: Partial<TripVoteSessionState> = {}): TripVoteSessionState {
  return {
    hasSession: true,
    nextScreen: 'VOTE',
    session: session(),
    myParticipation: participation(),
    ...overrides,
  }
}

function tripDetail(ownerUserId = 'owner-1') {
  return { id: 'trip-1', title: '제주 3박 4일', ownerUserId, regions: [], members: [] }
}

describe('여행 방 투표 화면', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.user = { id: 'owner-1' }
    mocks.votingApi.getCurrentSession.mockResolvedValue(state())
    mocks.tripApi.getTrip.mockResolvedValue(tripDetail())
  })

  it('후보 목록과 남은 스티커를 보여준다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="candidate-name"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="deck-thumb"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('3 / 3')
  })

  it('한 후보에 스티커를 몰아 붙일 수 있다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    const plus = wrapper.findAll('[data-testid="candidate-place"]')[0]
    await plus.trigger('click')
    await plus.trigger('click')

    expect(wrapper.findAll('[data-testid="candidate-sticker-count"]')[0].text()).toBe('2')
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('1 / 3')
  })

  it('스티커를 회수하면 남은 개수가 늘어난다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.findAll('[data-testid="candidate-place"]')[0].trigger('click')
    await wrapper.findAll('[data-testid="candidate-withdraw"]')[0].trigger('click')

    expect(wrapper.findAll('[data-testid="candidate-sticker-count"]')[0].text()).toBe('0')
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('3 / 3')
  })

  it('덱을 넘기면 다음 후보가 보이고, 붙인 곳은 장바구니에 쌓인다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    // 1번 후보에 1개
    await wrapper.find('[data-testid="candidate-place"]').trigger('click')
    // 다음 후보로 넘겨서 2개
    await wrapper.find('[data-testid="deck-next"]').trigger('click')
    await wrapper.find('[data-testid="candidate-place"]').trigger('click')
    await wrapper.find('[data-testid="candidate-place"]').trigger('click')

    const items = wrapper.findAll('[data-testid="cart-item"]')
    expect(items).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="cart-count"]').map((node) => node.text())).toEqual(['1', '2'])
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('0 / 3')

    // 장바구니에서 바로 회수할 수 있다
    await wrapper.findAll('[data-testid="cart-minus"]')[1].trigger('click')
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('1 / 3')
  })

  it('모두 회수하면 장바구니가 비워진다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="candidate-place"]').trigger('click')
    await wrapper.find('[data-testid="vote-reset"]').trigger('click')

    expect(wrapper.find('[data-testid="cart-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('3 / 3')
  })

  it('polling 갱신이 제출 전 로컬 스티커 초안을 덮어쓰지 않는다', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await vi.runOnlyPendingTimersAsync()

    await wrapper.find('[data-testid="candidate-place"]').trigger('click')
    await wrapper.find('[data-testid="candidate-place"]').trigger('click')

    // 5초 polling → 서버는 아직 빈 placements를 돌려준다
    await vi.advanceTimersByTimeAsync(5000)
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
    await flushPromises()

    expect(wrapper.find('[data-testid="candidate-sticker-count"]').text()).toBe('2')
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('1 / 3')
  })

  it('지급량을 다 쓰면 더 붙일 수 없다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    const plus = wrapper.findAll('[data-testid="candidate-place"]')[0]
    await plus.trigger('click')
    await plus.trigger('click')
    await plus.trigger('click')

    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toContain('0 / 3')
    expect(
      wrapper.findAll('[data-testid="candidate-place"]')[0].attributes('disabled'),
    ).toBeDefined()
  })

  it('스티커를 하나도 안 붙이면 제출 버튼이 비활성이다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.findAll('[data-testid="candidate-place"]')[0].trigger('click')
    expect(wrapper.find('[data-testid="vote-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('제출하면 대기 화면으로 바뀐다', async () => {
    mocks.votingApi.submit.mockResolvedValue(
      state({ nextScreen: 'WAITING', myParticipation: participation({ status: 'SUBMITTED' }) }),
    )
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.findAll('[data-testid="candidate-place"]')[0].trigger('click')
    await wrapper.find('[data-testid="vote-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-waiting"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vote-deck"]').exists()).toBe(false)
  })

  it('제출한 참여자는 처음부터 대기 화면을 본다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(
      state({ nextScreen: 'WAITING', myParticipation: participation({ status: 'SUBMITTED' }) }),
    )
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-waiting"]').exists()).toBe(true)
  })

  it('미투표자가 있으면 확인 전에는 마감 버튼이 비활성이다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="vote-close-open"]').trigger('click')

    expect(wrapper.find('[data-testid="vote-close-warning"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vote-close-confirm"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="vote-close-ack"]').setValue(true)
    expect(wrapper.find('[data-testid="vote-close-confirm"]').attributes('disabled')).toBeUndefined()
  })

  it('확인 후 마감하면 조기 종료를 요청한다', async () => {
    mocks.votingApi.closeSession.mockResolvedValue({ sessionId: 'session-1', results: [] })
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="vote-close-open"]').trigger('click')
    await wrapper.find('[data-testid="vote-close-ack"]').setValue(true)
    await wrapper.find('[data-testid="vote-close-confirm"]').trigger('click')
    await flushPromises()

    expect(mocks.votingApi.closeSession).toHaveBeenCalledWith('trip-1', 'session-1', true)
  })

  it('마감 버튼은 방장에게만 보인다', async () => {
    mocks.user = { id: 'member-9' }
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-close-open"]').exists()).toBe(false)
  })

  it('참여 현황을 진행률로 보여준다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-progress"]').text()).toContain('1/3')
  })

  it('세션이 없으면 방장에게 투표 시작 패널을 보여준다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue({
      hasSession: false, nextScreen: 'MAP', session: null, myParticipation: null,
    })
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-setup"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="setup-open"]').exists()).toBe(true)
  })

  it('세션이 없으면 멤버에게는 안내와 지도 이동만 보여준다', async () => {
    mocks.user = { id: 'member-9' }
    mocks.votingApi.getCurrentSession.mockResolvedValue({
      hasSession: false, nextScreen: 'MAP', session: null, myParticipation: null,
    })
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-idle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vote-setup"]').exists()).toBe(false)
  })

  it('방장이 스티커/선정 개수를 정해 투표를 시작한다', async () => {
    mocks.votingApi.getCurrentSession
      .mockResolvedValueOnce({ hasSession: false, nextScreen: 'MAP', session: null, myParticipation: null })
      .mockResolvedValue(state())
    mocks.votingApi.openSession.mockResolvedValue(session())
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    // 스티커 5 → 4, 선정 3 → 4
    await wrapper.find('[data-testid="setup-sticker-minus"]').trigger('click')
    await wrapper.find('[data-testid="setup-selection-plus"]').trigger('click')
    expect(wrapper.find('[data-testid="setup-sticker-count"]').text()).toBe('4')
    expect(wrapper.find('[data-testid="setup-selection-count"]').text()).toBe('4')

    await wrapper.find('[data-testid="setup-open"]').trigger('click')
    await flushPromises()

    expect(mocks.votingApi.openSession).toHaveBeenCalledWith('trip-1', {
      stickerAllowance: 4,
      selectionCount: 4,
    })
    // 시작 후 투표 화면으로 전환된다.
    expect(wrapper.find('[data-testid="vote-deck"]').exists()).toBe(true)
  })

  it('후보 부족으로 시작이 거절되면 안내 메시지를 보여준다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue({
      hasSession: false, nextScreen: 'MAP', session: null, myParticipation: null,
    })
    mocks.votingApi.openSession.mockRejectedValue({
      response: { data: { code: 'VOTE_CANDIDATE_POOL_INSUFFICIENT' } },
    })
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="setup-open"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="setup-error"]').text()).toContain('후보 관광지를 충분히 찾지 못했어요')
  })

  it('종료된 세션은 결과 화면을 보여준다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(state({
      nextScreen: 'MAP',
      session: session({ status: 'COMPLETED', completionReason: 'ALL_SUBMITTED' }),
      myParticipation: participation({ status: 'SUBMITTED' }),
    }))
    mocks.votingApi.getResult.mockResolvedValue({
      sessionId: 'session-1', tripId: 'trip-1', status: 'COMPLETED',
      completionReason: 'ALL_SUBMITTED', completedAt: null, selectionCount: 2,
      results: [
        {
          candidateId: 'c1', provider: 'KTO', externalPlaceId: '126508', name: '성산일출봉',
          thumbnailUrl: null, stickerCount: 5, selected: true, selectedRank: 1,
          itineraryOutcome: 'ADDED', itineraryItemId: 'item-1',
        },
        {
          candidateId: 'c2', provider: 'KTO', externalPlaceId: '126509', name: '우도',
          thumbnailUrl: null, stickerCount: 1, selected: false, selectedRank: null,
          itineraryOutcome: null, itineraryItemId: null,
        },
      ],
      unscheduledDayId: null, itineraryVersion: null,
    })
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-result"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="result-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="result-added"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="vote-result-map"]').exists()).toBe(true)
  })

  it('종료된 세션에서 방장은 새 투표 시작 패널을 열 수 있다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(state({
      nextScreen: 'MAP',
      session: session({ status: 'COMPLETED', completionReason: 'OWNER_EARLY_CLOSE' }),
    }))
    mocks.votingApi.getResult.mockResolvedValue(null)
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="vote-restart"]').trigger('click')

    expect(wrapper.find('[data-testid="vote-setup"]').exists()).toBe(true)
  })

  it('머무는 동안 투표가 끝나면 지도 화면으로 이동한다', async () => {
    mocks.votingApi.getCurrentSession
      .mockResolvedValueOnce(state({ nextScreen: 'WAITING', myParticipation: participation({ status: 'SUBMITTED' }) }))
      .mockResolvedValue(state({
        nextScreen: 'MAP',
        session: session({ status: 'COMPLETED', completionReason: 'ALL_SUBMITTED' }),
        myParticipation: participation({ status: 'SUBMITTED' }),
      }))
    vi.useFakeTimers()
    mount(TripVotePage, { global: { stubs } })
    await vi.runOnlyPendingTimersAsync()

    // polling 1회 후 COMPLETED 전환 → 지도 이동
    await vi.advanceTimersByTimeAsync(5000)
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
    await flushPromises()

    expect(mocks.push).toHaveBeenCalledWith({ name: 'Route', params: { tripId: 'trip-1' }, query: { voteCompleted: '1' } })
  })
})
