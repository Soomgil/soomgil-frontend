import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from './http'
import { collaborationApi } from './collaboration.api'

vi.mock('./http', () => ({
  default: { post: vi.fn() },
}))

describe('collaboration API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('서버 협업 stack에 undo와 redo를 요청한다', async () => {
    vi.mocked(http.post)
      .mockResolvedValueOnce({ data: { itineraryVersion: 4, undoAvailable: false, redoAvailable: true } })
      .mockResolvedValueOnce({ data: { itineraryVersion: 5, undoAvailable: true, redoAvailable: false } })

    await collaborationApi.undo('trip-1', { baseVersion: 3, commandEventId: null })
    await collaborationApi.redo('trip-1', { baseVersion: 4, commandEventId: null })

    expect(http.post).toHaveBeenNthCalledWith(1, '/trips/trip-1/collaboration/undo', {
      baseVersion: 3,
      commandEventId: null,
    })
    expect(http.post).toHaveBeenNthCalledWith(2, '/trips/trip-1/collaboration/redo', {
      baseVersion: 4,
      commandEventId: null,
    })
  })
})
