import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, put, patch, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(),
}))

vi.mock('@/api/http', () => ({
  default: { get, post, put, patch, delete: del },
}))

import { aiApi } from './ai.api'
import { chatApi } from './chat.api'
import { planningApi } from './planning.api'
import { notificationApi } from './notification.api'
import { adminApi } from './admin.api'

describe('윤정 담당 API 계약', () => {
  beforeEach(() => vi.clearAllMocks())

  it('AI 세션과 메시지를 백엔드 DTO 그대로 반환한다', async () => {
    const session = { id: 'session-1', tripId: 'trip-1', status: 'ACTIVE', summaryUpdatedAt: null, createdAt: null }
    const page = { items: [], page: { offset: 0, limit: 50, nextOffset: null, hasMore: false, sort: [] } }
    get.mockResolvedValueOnce({ data: session }).mockResolvedValueOnce({ data: page })

    await expect(aiApi.getSession('trip-1')).resolves.toEqual(session)
    await expect(aiApi.getMessages('trip-1')).resolves.toEqual(page)
    expect(get).toHaveBeenNthCalledWith(1, '/trips/trip-1/ai/session')
    expect(get).toHaveBeenNthCalledWith(2, '/trips/trip-1/ai/messages', { params: { offset: 0, limit: 50 } })
  })

  it('AI tool calling 응답을 기다릴 수 있는 timeout으로 메시지를 전송한다', async () => {
    const response = { message: { id: 'assistant-1' }, toolCalls: [] }
    post.mockResolvedValue({ data: response })

    await expect(aiApi.sendMessage('trip-1', { content: '맛집 추천해줘', baseVersion: 3 }))
      .resolves.toEqual(response)
    expect(post).toHaveBeenCalledWith('/trips/trip-1/ai/messages', {
      content: '맛집 추천해줘', baseVersion: 3,
    }, { timeout: 60_000 })
  })

  it('여행방 채팅 생성 경로를 사용한다', async () => {
    const message = { id: 'message-1', content: '안녕' }
    post.mockResolvedValue({ data: message })
    await expect(chatApi.sendMessage('trip-1', '안녕')).resolves.toEqual(message)
    expect(post).toHaveBeenCalledWith('/trips/trip-1/chat/messages', { content: '안녕' })
  })

  it('메모와 체크리스트를 planning 계약으로 저장한다', async () => {
    const mutation = { note: { id: 'note-1' }, checklist: null }
    put.mockResolvedValue({ data: mutation })
    await planningApi.saveNote('trip-1', { scopeType: 'DAY', itineraryDayId: 'day-1' }, '예약 확인', 3)
    expect(put).toHaveBeenCalledWith('/trips/trip-1/planning/notes', {
      scopeType: 'DAY', itineraryDayId: 'day-1', content: '예약 확인', baseVersion: 3,
    })
  })

  it('메모 삭제에도 마지막으로 읽은 버전을 전달한다', async () => {
    del.mockResolvedValue({ data: undefined })

    await planningApi.deleteNote('trip-1', 'note-1', 4)

    expect(del).toHaveBeenCalledWith('/trips/trip-1/planning/notes/note-1', {
      data: { baseVersion: 4 },
    })
  })

  it('알림 page 응답을 감싸지 않고 반환한다', async () => {
    const page = { items: [], page: { page: 0, size: 20, totalElements: 0, totalPages: 0, sort: [] } }
    get.mockResolvedValue({ data: page })
    await expect(notificationApi.getNotifications({ unreadOnly: true })).resolves.toEqual(page)
    expect(get).toHaveBeenCalledWith('/notifications', { params: { unreadOnly: true } })
  })

  it('모더레이션 신고 처리 요청을 전달한다', async () => {
    const report = { id: 'report-1', status: 'RESOLVED' }
    patch.mockResolvedValue({ data: report })
    const request = { status: 'RESOLVED' as const, resolutionNote: '처리함' }
    await expect(adminApi.resolveReport('report-1', request)).resolves.toEqual(report)
    expect(patch).toHaveBeenCalledWith('/moderation/reports/report-1', request)
  })
})
