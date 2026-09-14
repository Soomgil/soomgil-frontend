import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyVoteParticipation, TripVoteSessionDetail, TripVoteSessionState } from '@/types/voting'

const mocks = vi.hoisted(() => ({
  votingApi: {
    getCurrentSession: vi.fn(),
    openSession: vi.fn(),
    saveStickers: vi.fn(),
    submit: vi.fn(),
    closeSession: vi.fn(),
    getResult: vi.fn(),
  },
}))

vi.mock('@/api/voting.api', () => ({ votingApi: mocks.votingApi }))

import { useVotingStore } from './voting.store'

function session(overrides: Partial<TripVoteSessionDetail> = {}): TripVoteSessionDetail {
  return {
    id: 'session-1',
    tripId: 'trip-1',
    status: 'OPEN',
    stickerAllowance: 5,
    selectionCount: 3,
    candidateCount: 2,
    openedAt: '2026-08-24T10:00:00Z',
    completedAt: null,
    completionReason: null,
    participantSummary: { total: 3, submitted: 1 },
    candidates: [
      {
        id: 'c1', rank: 1, provider: 'KTO', externalPlaceId: '126508', name: '성산일출봉',
        address: null, lat: null, lng: null, thumbnailUrl: null, category: null, stickerCount: null,
      },
      {
        id: 'c2', rank: 2, provider: 'KTO', externalPlaceId: '126509', name: '우도',
        address: null, lat: null, lng: null, thumbnailUrl: null, category: null, stickerCount: null,
      },
    ],
    ...overrides,
  }
}

function participation(overrides: Partial<MyVoteParticipation> = {}): MyVoteParticipation {
  return {
    participantId: 'p1',
    status: 'NOT_STARTED',
    stickerAllowance: 5,
    usedStickerCount: 0,
    remainingStickerCount: 5,
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

describe('투표 스토어', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.votingApi.getCurrentSession.mockResolvedValue(state())
  })

  it('게이트는 서버가 준 nextScreen을 그대로 돌려준다', async () => {
    const store = useVotingStore()

    await expect(store.ensureGate('trip-1')).resolves.toBe('VOTE')
    expect(store.session?.id).toBe('session-1')
  })

  it('게이트 조회가 실패해도 지도로 통과시킨다', async () => {
    mocks.votingApi.getCurrentSession.mockRejectedValue(new Error('network'))
    const store = useVotingStore()

    await expect(store.ensureGate('trip-1')).resolves.toBe('MAP')
    expect(store.session).toBeNull()
  })

  it('제출한 참여자는 대기 화면으로 보낸다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(
      state({ nextScreen: 'WAITING', myParticipation: participation({ status: 'SUBMITTED' }) }),
    )
    const store = useVotingStore()

    await expect(store.ensureGate('trip-1')).resolves.toBe('WAITING')
    expect(store.isSubmitted).toBe(true)
  })

  it('스티커를 한 후보에 몰아붙일 수 있고 남은 개수가 줄어든다', async () => {
    const store = useVotingStore()
    await store.load('trip-1')

    store.placeSticker('c1')
    store.placeSticker('c1')
    store.placeSticker('c2')

    expect(store.stickerCountFor('c1')).toBe(2)
    expect(store.usedStickerCount).toBe(3)
    expect(store.remainingStickerCount).toBe(2)
  })

  it('지급량을 모두 쓰면 더 붙일 수 없다', async () => {
    const store = useVotingStore()
    await store.load('trip-1')

    for (let index = 0; index < 7; index += 1) store.placeSticker('c1')

    expect(store.usedStickerCount).toBe(5)
    expect(store.remainingStickerCount).toBe(0)
  })

  it('스티커를 회수하면 다시 붙일 수 있다', async () => {
    const store = useVotingStore()
    await store.load('trip-1')

    store.placeSticker('c1')
    store.placeSticker('c1')
    store.withdrawSticker('c1')

    expect(store.stickerCountFor('c1')).toBe(1)

    store.withdrawSticker('c1')
    expect(store.stickerCountFor('c1')).toBe(0)
    expect(store.draftPlacements).toHaveLength(0)
  })

  it('제출한 뒤에는 스티커를 바꿀 수 없다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(
      state({ myParticipation: participation({ status: 'SUBMITTED', placements: [{ candidateId: 'c1', stickerCount: 2 }] }) }),
    )
    const store = useVotingStore()
    await store.load('trip-1')

    store.placeSticker('c1')
    store.withdrawSticker('c1')

    expect(store.stickerCountFor('c1')).toBe(2)
  })

  it('스티커를 하나도 안 붙이면 제출할 수 없다', async () => {
    const store = useVotingStore()
    await store.load('trip-1')

    expect(store.canSubmit).toBe(false)

    store.placeSticker('c1')
    expect(store.canSubmit).toBe(true)
  })

  it('제출하면 서버 상태로 갱신된다', async () => {
    mocks.votingApi.submit.mockResolvedValue(
      state({ nextScreen: 'WAITING', myParticipation: participation({ status: 'SUBMITTED' }) }),
    )
    const store = useVotingStore()
    await store.load('trip-1')
    store.placeSticker('c1')

    await store.submit()

    expect(mocks.votingApi.submit).toHaveBeenCalledWith('trip-1', 'session-1', [
      { candidateId: 'c1', stickerCount: 1 },
    ])
    expect(store.nextScreen).toBe('WAITING')
  })

  it('미투표 참여자가 있는지 요약으로 판단한다', async () => {
    const store = useVotingStore()
    await store.load('trip-1')

    expect(store.hasUnvotedParticipants).toBe(true)
  })

  it('전원 제출이면 미투표자가 없다고 본다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(
      state({ session: session({ participantSummary: { total: 3, submitted: 3 } }) }),
    )
    const store = useVotingStore()
    await store.load('trip-1')

    expect(store.hasUnvotedParticipants).toBe(false)
  })

  it('종료된 세션이면 지도로 보내고 완료 상태가 된다', async () => {
    mocks.votingApi.getCurrentSession.mockResolvedValue(
      state({ nextScreen: 'MAP', session: session({ status: 'COMPLETED' }) }),
    )
    const store = useVotingStore()

    await expect(store.ensureGate('trip-1')).resolves.toBe('MAP')
    expect(store.isCompleted).toBe(true)
  })

  it('polling을 시작하고 멈출 수 있다', async () => {
    vi.useFakeTimers()
    const store = useVotingStore()
    await store.load('trip-1')

    store.startPolling()
    vi.advanceTimersByTime(5000)
    expect(mocks.votingApi.getCurrentSession).toHaveBeenCalledTimes(2)

    store.stopPolling()
    vi.advanceTimersByTime(15000)
    expect(mocks.votingApi.getCurrentSession).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
