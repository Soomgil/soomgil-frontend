import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('./http', () => ({ default: mocks.http }))

import { votingApi } from './voting.api'

describe('여행 방 투표 API 클라이언트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.http.get.mockResolvedValue({ data: {} })
    mocks.http.post.mockResolvedValue({ data: {} })
    mocks.http.put.mockResolvedValue({ data: {} })
  })

  it('진입 화면 판정은 current 엔드포인트 한 번으로 조회한다', async () => {
    await votingApi.getCurrentSession('trip-1')

    expect(mocks.http.get).toHaveBeenCalledWith('/trips/trip-1/vote-sessions/current')
  })

  it('방장이 스티커 개수와 선정 개수로 투표를 시작한다', async () => {
    await votingApi.openSession('trip-1', { stickerAllowance: 5, selectionCount: 3 })

    expect(mocks.http.post).toHaveBeenCalledWith('/trips/trip-1/vote-sessions', {
      stickerAllowance: 5,
      selectionCount: 3,
    })
  })

  it('스티커 배치는 PUT으로 전체 치환한다', async () => {
    const placements = [{ candidateId: 'c1', stickerCount: 2 }]

    await votingApi.saveStickers('trip-1', 's1', placements)

    expect(mocks.http.put).toHaveBeenCalledWith('/trips/trip-1/vote-sessions/s1/my-stickers', {
      placements,
    })
  })

  it('제출은 my-submission으로 보낸다', async () => {
    const placements = [{ candidateId: 'c1', stickerCount: 2 }]

    await votingApi.submit('trip-1', 's1', placements)

    expect(mocks.http.post).toHaveBeenCalledWith('/trips/trip-1/vote-sessions/s1/my-submission', {
      placements,
    })
  })

  it('배치를 생략하고 제출하면 빈 본문을 보낸다', async () => {
    await votingApi.submit('trip-1', 's1')

    expect(mocks.http.post).toHaveBeenCalledWith('/trips/trip-1/vote-sessions/s1/my-submission', {})
  })

  it('방장 조기 종료는 미투표자 확인 플래그를 함께 보낸다', async () => {
    await votingApi.closeSession('trip-1', 's1', true)

    expect(mocks.http.post).toHaveBeenCalledWith('/trips/trip-1/vote-sessions/s1/completion', {
      acknowledgeUnvotedParticipants: true,
    })
  })

  it('결과를 조회한다', async () => {
    await votingApi.getResult('trip-1', 's1')

    expect(mocks.http.get).toHaveBeenCalledWith('/trips/trip-1/vote-sessions/s1/result')
  })
})
