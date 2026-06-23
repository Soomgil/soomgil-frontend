import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/home' }),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    user: { displayName: '테스트 사용자', email: 'demo@example.com', profileImageUrl: null },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))
vi.mock('@/api/notification.api', () => ({
  notificationApi: {
    getNotifications: mocks.getNotifications,
    markAsRead: mocks.markAsRead,
    markAllAsRead: mocks.markAllAsRead,
    deleteNotification: mocks.deleteNotification,
  },
}))

import AppHeader from './AppHeader.vue'

const notification = {
  id: 'notification-1', actor: null, tripId: 'trip-1', type: 'TRIP_INVITE', title: '여행 초대', body: '서울 여행에 초대됐어요.',
  payload: { tripId: 'trip-1', inviteId: 'invite-1', inviteCode: 'invite-code', route: null },
  readAt: null, createdAt: '2026-06-22T00:00:00Z',
}

function page(items: typeof notification[], pageNumber = 0, totalPages = 1) {
  return { items, page: { page: pageNumber, size: 20, totalElements: items.length, totalPages, sort: [] } }
}

describe('AppHeader 알림 API 연동', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getNotifications.mockResolvedValue(page([]))
  })

  it('서비스 헤더에서 취향 수집 화면으로 이동한다', async () => {
    const wrapper = mount(AppHeader)
    const swipeLink = wrapper.findAll('nav a').find((link) => link.text() === '취향 수집')

    expect(swipeLink).toBeDefined()
    await swipeLink!.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/swipe')
  })

  it('빈 알림 page를 명시적으로 표시한다', async () => {
    const wrapper = mount(AppHeader)
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()

    expect(mocks.getNotifications).toHaveBeenCalledWith({ page: 0, size: 20 })
    expect(wrapper.text()).toContain('새 알림이 없습니다.')
  })

  it('다음 page를 요청하고 기존 알림 목록에 추가한다', async () => {
    mocks.getNotifications
      .mockResolvedValueOnce(page([notification], 0, 2))
      .mockResolvedValueOnce(page([{ ...notification, id: 'notification-2', title: '일정 변경' }], 1, 2))
    const wrapper = mount(AppHeader)
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="load-more-notifications"]').trigger('click')
    await flushPromises()

    expect(mocks.getNotifications).toHaveBeenNthCalledWith(2, { page: 1, size: 20 })
    expect(wrapper.text()).toContain('여행 초대')
    expect(wrapper.text()).toContain('일정 변경')
  })

  it('읽음 처리 실패를 안내하고 읽지 않은 상태를 유지한다', async () => {
    mocks.getNotifications.mockResolvedValue(page([notification]))
    mocks.markAsRead.mockRejectedValue(new Error('offline'))
    const wrapper = mount(AppHeader)
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()
    await wrapper.get('article button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('알림을 읽음 처리하지 못했습니다.')
    expect(mocks.push).not.toHaveBeenCalled()
    expect(wrapper.get('#header-notif-btn').text()).toContain('1')
  })
})
