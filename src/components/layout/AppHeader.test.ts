import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  getNearestTrip: vi.fn(),
  getItinerary: vi.fn(),
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
vi.mock('@/api/trip.api', () => ({ tripApi: { getNearestTrip: mocks.getNearestTrip } }))
vi.mock('@/api/itinerary.api', () => ({ itineraryApi: { getItinerary: mocks.getItinerary } }))

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
  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-22T16:00:00Z'))
    vi.clearAllMocks()
    mocks.getNotifications.mockImplementation(async (params) => params?.unreadOnly ? { ...page([]), page: { ...page([]).page, totalElements: 32 } } : page([]))
    mocks.getNearestTrip.mockResolvedValue({ id: 'trip-1', title: '부산 여행' })
    mocks.getItinerary.mockResolvedValue({
      days: [{ id: 'day-1', groupType: 'DAY', date: '2026-06-23', items: [{ id: 'item-1', placeName: '부산역', address: '부산 동구' }] }],
    })
  })

  it('서비스 헤더에서 취향 수집 화면으로 이동한다', async () => {
    const wrapper = mount(AppHeader)
    const swipeLink = wrapper.findAll('nav a').find((link) => link.text() === '취향 수집')

    expect(swipeLink).toBeDefined()
    await swipeLink!.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/swipe')
  })

  it('선택 메뉴의 접근성 상태와 장식용 이동 알약을 제공한다', () => {
    const wrapper = mount(AppHeader)
    expect(wrapper.get('nav a[aria-current="page"]').attributes('data-nav-key')).toBe('home')
    expect(wrapper.get('.nav-indicator').attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('nav a[data-nav-key]')).toHaveLength(4)
    wrapper.unmount()
  })

  it('빈 알림 page를 명시적으로 표시한다', async () => {
    const wrapper = mount(AppHeader)
    await flushPromises()
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()

    expect(mocks.getNotifications).toHaveBeenCalledWith({ page: 0, size: 20 })
    expect(wrapper.text()).toContain('새 알림이 없습니다.')
  })

  it('다음 page를 요청하고 기존 알림 목록에 추가한다', async () => {
    mocks.getNotifications.mockImplementation(async (params) => params?.unreadOnly
      ? page([notification]) : params?.page === 1
      ? page([{ ...notification, id: 'notification-2', title: '일정 변경' }], 1, 2) : page([notification], 0, 2))
    const wrapper = mount(AppHeader)
    await flushPromises()
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="load-more-notifications"]').trigger('click')
    await flushPromises()

    expect(mocks.getNotifications).toHaveBeenCalledWith({ page: 1, size: 20 })
    expect(wrapper.text()).toContain('여행 초대')
    expect(wrapper.text()).toContain('일정 변경')
  })

  it('읽음 처리 실패를 안내하고 읽지 않은 상태를 유지한다', async () => {
    mocks.getNotifications.mockResolvedValue(page([notification]))
    mocks.markAsRead.mockRejectedValue(new Error('offline'))
    const wrapper = mount(AppHeader)
    await flushPromises()
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()
    await wrapper.get('article button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('알림을 읽음 처리하지 못했습니다.')
    expect(mocks.push).not.toHaveBeenCalled()
    expect(wrapper.get('#header-notif-btn').text()).toContain('1')
  })

  it('오늘 일정 브리핑을 실제 여행 일정 API로 표시한다', async () => {
    const wrapper = mount(AppHeader)
    await flushPromises()

    expect(wrapper.get('#header-briefing-btn').text()).toContain('1')
    expect(wrapper.get('#header-briefing-btn').attributes('aria-label')).toContain('예정 장소 1곳')

    await wrapper.get('#header-briefing-btn').trigger('click')
    await flushPromises()

    expect(mocks.getNearestTrip).toHaveBeenCalled()
    expect(mocks.getItinerary).toHaveBeenCalledWith('trip-1')
    expect(wrapper.get('#header-briefing-panel .inbox-heading').text()).toContain('1')
    expect(wrapper.text()).toContain('부산역')
    expect(wrapper.text()).toContain('부산 동구')
  })
  it('패널을 열기 전 전체 미읽음 개수를 표시한다', async () => {
    const wrapper = mount(AppHeader)
    await flushPromises()
    expect(wrapper.get('#header-notif-btn').attributes('aria-label')).toContain('32')
    wrapper.unmount()
  })

  it('한국 날짜의 오늘 일정을 우선하고 과거 첫날을 표시하지 않는다', async () => {
    mocks.getItinerary.mockResolvedValue({ days: [
      { id: 'old', groupType: 'DAY', date: '2026-06-22', items: [{ id: 'old-item', placeName: '어제 장소' }] },
      { id: 'today', groupType: 'DAY', date: '2026-06-23', dayNumber: 2, items: [{ id: 'today-item', placeName: '오늘 장소', sortOrder: 1 }] },
    ] })
    const wrapper = mount(AppHeader)
    await wrapper.get('#header-briefing-btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('#header-briefing-panel').text()).toContain('오늘 장소')
    expect(wrapper.get('#header-briefing-panel').text()).not.toContain('어제 장소')
    expect(wrapper.get('#header-briefing-panel').text()).toContain('부산 여행')
    wrapper.unmount()
  })

  it('여행이 없으면 오류 대신 빈 상태를 보여준다', async () => {
    mocks.getNearestTrip.mockResolvedValue(null)
    const wrapper = mount(AppHeader)
    await wrapper.get('#header-briefing-btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('#header-briefing-panel').text()).toContain('예정된 여행이 없어요')
    expect(mocks.getItinerary).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('읽음 성공 후 초대 수락 화면으로 이동한다', async () => {
    mocks.getNotifications.mockResolvedValue(page([notification]))
    mocks.markAsRead.mockResolvedValue({ ...notification, readAt: new Date().toISOString() })
    const wrapper = mount(AppHeader)
    await flushPromises()
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()
    await wrapper.get('.notification-open').trigger('click')
    await flushPromises()
    expect(mocks.push).toHaveBeenCalledWith('/trip-invites/invite-code')
    wrapper.unmount()
  })

  it('미래 일정은 다가오는 여행으로 구분한다', async () => {
    mocks.getItinerary.mockResolvedValue({ days: [{ id: 'future', groupType: 'DAY', date: '2026-06-25', dayNumber: 1, items: [] }] })
    const wrapper = mount(AppHeader)
    await wrapper.get('#header-briefing-btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('#header-briefing-panel').text()).toContain('다가오는 여행')
    expect(wrapper.get('#header-briefing-panel').text()).toContain('아직 방문할 장소를 정하지 않았어요')
    wrapper.unmount()
  })

  it('삭제 실패 시 기존 알림과 다시 시도할 수 있는 목록을 유지한다', async () => {
    mocks.getNotifications.mockResolvedValue(page([notification]))
    mocks.deleteNotification.mockRejectedValue(new Error('offline'))
    const wrapper = mount(AppHeader)
    await flushPromises()
    await wrapper.get('#header-notif-btn').trigger('click')
    await flushPromises()
    await wrapper.get('.notification-dismiss').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.notification-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('알림을 삭제하지 못했습니다.')
    wrapper.unmount()
  })

})
