import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('./http', () => ({ default: mocks.http }))

import { communityThreadApi } from './community-thread.api'

describe('커뮤니티 쓰레드 API 클라이언트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.http.get.mockResolvedValue({ data: { items: [], page: {} } })
    mocks.http.post.mockResolvedValue({ data: {} })
    mocks.http.patch.mockResolvedValue({ data: {} })
    mocks.http.put.mockResolvedValue({ data: {} })
    mocks.http.delete.mockResolvedValue({ data: {} })
  })

  it('공개 피드는 page/size 파라미터로 조회한다', async () => {
    await communityThreadApi.getThreads({ page: 2, size: 20 })

    expect(mocks.http.get).toHaveBeenCalledWith('/community/threads', {
      params: { page: 2, size: 20 },
    })
  })

  it('작성자 필터와 검색어를 그대로 전달한다', async () => {
    await communityThreadApi.getThreads({ authorId: 'user-1', query: '성심당' })

    expect(mocks.http.get).toHaveBeenCalledWith('/community/threads', {
      params: { authorId: 'user-1', query: '성심당' },
    })
  })

  it('쓰레드를 작성한다', async () => {
    await communityThreadApi.createThread({ content: '성심당 줄이 미쳤어요', mediaFileIds: ['m1'] })

    expect(mocks.http.post).toHaveBeenCalledWith('/community/threads', {
      content: '성심당 줄이 미쳤어요',
      mediaFileIds: ['m1'],
    })
  })

  it('쓰레드 상세를 조회한다', async () => {
    await communityThreadApi.getThread('t1')

    expect(mocks.http.get).toHaveBeenCalledWith('/community/threads/t1')
  })

  it('쓰레드를 PATCH로 수정한다', async () => {
    await communityThreadApi.updateThread('t1', { content: '수정' })

    expect(mocks.http.patch).toHaveBeenCalledWith('/community/threads/t1', { content: '수정' })
  })

  it('쓰레드를 DELETE로 삭제한다', async () => {
    await communityThreadApi.deleteThread('t1')

    expect(mocks.http.delete).toHaveBeenCalledWith('/community/threads/t1')
  })

  it('좋아요는 PUT, 취소는 DELETE로 멱등하게 처리한다', async () => {
    await communityThreadApi.likeThread('t1')
    await communityThreadApi.unlikeThread('t1')

    expect(mocks.http.put).toHaveBeenCalledWith('/community/threads/t1/like')
    expect(mocks.http.delete).toHaveBeenCalledWith('/community/threads/t1/like')
  })

  it('likedByMe에 따라 좋아요와 취소를 전환한다', async () => {
    await communityThreadApi.toggleLike({ id: 't1', likedByMe: false })
    expect(mocks.http.put).toHaveBeenCalledWith('/community/threads/t1/like')

    await communityThreadApi.toggleLike({ id: 't1', likedByMe: true })
    expect(mocks.http.delete).toHaveBeenCalledWith('/community/threads/t1/like')
  })

  it('답글 목록을 page/size로 조회한다', async () => {
    await communityThreadApi.getReplies('t1', 1, 30)

    expect(mocks.http.get).toHaveBeenCalledWith('/community/threads/t1/replies', {
      params: { page: 1, size: 30 },
    })
  })

  it('답글을 작성한다', async () => {
    await communityThreadApi.createReply('t1', { content: '저도 갔어요', parentReplyId: 'r1' })

    expect(mocks.http.post).toHaveBeenCalledWith('/community/threads/t1/replies', {
      content: '저도 갔어요',
      parentReplyId: 'r1',
    })
  })

  it('답글을 수정하고 삭제한다', async () => {
    await communityThreadApi.updateReply('t1', 'r1', '수정한 답글')
    await communityThreadApi.deleteReply('t1', 'r1')

    expect(mocks.http.patch).toHaveBeenCalledWith('/community/threads/t1/replies/r1', {
      content: '수정한 답글',
    })
    expect(mocks.http.delete).toHaveBeenCalledWith('/community/threads/t1/replies/r1')
  })

  it('쓰레드 신고는 기존 신고 API에 THREAD 대상으로 보낸다', async () => {
    await communityThreadApi.reportThread('t1', 'SPAM', '광고입니다')

    expect(mocks.http.post).toHaveBeenCalledWith('/community/reports', {
      targetType: 'THREAD',
      targetId: 't1',
      reasonCode: 'SPAM',
      detail: '광고입니다',
    })
  })

  it('답글 신고는 THREAD_REPLY 대상으로 보낸다', async () => {
    await communityThreadApi.reportReply('r1', 'HARASSMENT_OR_HATE')

    expect(mocks.http.post).toHaveBeenCalledWith('/community/reports', {
      targetType: 'THREAD_REPLY',
      targetId: 'r1',
      reasonCode: 'HARASSMENT_OR_HATE',
      detail: undefined,
    })
  })
})
