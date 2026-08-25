import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyVoteParticipation, TripVoteSessionDetail, TripVoteSessionState } from '@/types/voting'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  votingApi: {
    getCurrentSession: vi.fn(),
    openSession: vi.fn(),
    saveStickers: vi.fn(),
    submit: vi.fn(),
    closeSession: vi.fn(),
    getResult: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ params: { tripId: 'trip-1' } }),
}))
vi.mock('@/api/voting.api', () => ({ votingApi: mocks.votingApi }))
vi.mock('@/composables/useToast', () => ({ useToast: () => mocks.toast }))

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

describe('여행 방 투표 화면', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.votingApi.getCurrentSession.mockResolvedValue(state())
  })

  it('후보 목록과 남은 스티커를 보여준다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="candidate-name"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toBe('3')
  })

  it('한 후보에 스티커를 몰아 붙일 수 있다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    const plus = wrapper.findAll('[data-testid="candidate-place"]')[0]
    await plus.trigger('click')
    await plus.trigger('click')

    expect(wrapper.findAll('[data-testid="candidate-sticker-count"]')[0].text()).toBe('2')
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toBe('1')
  })

  it('스티커를 회수하면 남은 개수가 늘어난다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.findAll('[data-testid="candidate-place"]')[0].trigger('click')
    await wrapper.findAll('[data-testid="candidate-withdraw"]')[0].trigger('click')

    expect(wrapper.findAll('[data-testid="candidate-sticker-count"]')[0].text()).toBe('0')
    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toBe('3')
  })

  it('지급량을 다 쓰면 더 붙일 수 없다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    const plus = wrapper.findAll('[data-testid="candidate-place"]')[0]
    await plus.trigger('click')
    await plus.trigger('click')
    await plus.trigger('click')

    expect(wrapper.find('[data-testid="vote-remaining"]').text()).toBe('0')
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
    expect(wrapper.find('[data-testid="vote-candidates"]').exists()).toBe(false)
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

  it('전원 제출이면 경고 없이 바로 마감할 수 있다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(
      state({ session: session({ participantSummary: { total: 2, submitted: 2 } }) }),
    )
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="vote-close-open"]').trigger('click')

    expect(wrapper.find('[data-testid="vote-close-warning"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="vote-close-confirm"]').attributes('disabled')).toBeUndefined()
  })

  it('투표가 이미 끝났으면 지도 화면으로 보낸다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(
      state({ nextScreen: 'MAP', session: session({ status: 'COMPLETED' }) }),
    )
    mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(mocks.push).toHaveBeenCalledWith({ name: 'Route', params: { tripId: 'trip-1' } })
  })

  it('참여 현황을 진행률로 보여준다', async () => {
    const wrapper = mount(TripVotePage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="vote-progress"]').text()).toContain('1/3')
  })
})
