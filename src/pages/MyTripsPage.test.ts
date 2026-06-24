import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyTripsPage from './MyTripsPage.vue'
import type { TripSummary } from '@/types/trip'

const geo = vi.hoisted(() => ({ searchLegalRegions: vi.fn() }))
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: {} as Record<string, string> }))

const trip = {
  id: 'trip-1',
  title: '새 부산 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE' as const,
  myRole: 'OWNER' as const,
  itineraryVersion: 0,
  createdAt: '2026-06-20T00:00:00Z',
}

const store = vi.hoisted(() => ({
  trips: [] as TripSummary[],
  loading: false,
  error: null as string | null,
  creating: false,
  loadingMore: false,
  loadMoreError: null as string | null,
  hasMoreTrips: false,
  fetchTrips: vi.fn().mockResolvedValue(undefined),
  fetchNextPage: vi.fn().mockResolvedValue(undefined),
  createTrip: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ user: { displayName: '김숨길' } }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routing.push, replace: routing.replace }),
  useRoute: () => ({ query: routing.query }),
}))
vi.mock('@/api/geo.api', () => ({ geoApi: geo }))

describe('MyTripsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routing.query = {}
    store.trips = []
    store.loading = false
    store.error = null
    store.loadingMore = false
    store.loadMoreError = null
    store.hasMoreTrips = false
    store.createTrip.mockResolvedValue(trip)
    geo.searchLegalRegions.mockResolvedValue({
      items: [],
      page: { page: 0, size: 10, totalElements: 0, totalPages: 0, sort: [] },
    })
  })

  afterEach(() => vi.useRealTimers())

  it('보관됨 필터에서 여행 생성 후 진행 중 필터로 전환한다', async () => {
    const wrapper = mount(MyTripsPage, {
      global: {
        stubs: {
          AppHeader: true,
          TripAccessModal: true,
          TripSettingsModal: true,
        },
      },
    })
    await flushPromises()

    const archivedFilter = wrapper.findAll('button').find((button) => button.text() === '보관됨')
    expect(archivedFilter).toBeDefined()
    await archivedFilter!.trigger('click')
    await wrapper.get('button.btn.primary').trigger('click')
    await wrapper.get('input[name="title"]').setValue('새 부산 여행')
    await wrapper.get('input[name="displayDestination"]').setValue('부산광역시')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const activeFilter = wrapper.findAll('button').find((button) => button.text() === '진행 중')
    expect(store.createTrip).toHaveBeenCalledWith({
      title: '새 부산 여행',
      displayDestination: '부산광역시',
    })
    expect(activeFilter?.attributes('aria-pressed')).toBe('true')
  })

  it('새 여행 버튼을 누르면 생성 모달을 표시한다', async () => {
    const wrapper = mount(MyTripsPage, {
      global: {
        stubs: {
          AppHeader: true,
          TripAccessModal: true,
          TripSettingsModal: true,
        },
      },
    })

    await wrapper.get('button.btn.primary').trigger('click')

    expect(wrapper.get('.trip-create-modal').classes()).toContain('show')
    expect(wrapper.get('.trip-create-modal').attributes('aria-hidden')).toBe('false')
  })

  it('선택한 법정동 코드를 여행 생성 요청에 포함한다', async () => {
    vi.useFakeTimers()
    geo.searchLegalRegions.mockResolvedValue({
      items: [{
        code: '2600000000', name: '부산광역시', fullName: '부산광역시',
        level: 'SIDO', parentCode: null, isActive: true,
      }],
      page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mount(MyTripsPage, {
      global: {
        stubs: {
          AppHeader: true,
          TripAccessModal: true,
          TripSettingsModal: true,
        },
      },
    })
    await wrapper.get('button.btn.primary').trigger('click')
    await wrapper.get('input[name="title"]').setValue('부산 여행')
    await wrapper.get('input[name="displayDestination"]').setValue('부산')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await Promise.resolve()

    expect(store.createTrip).toHaveBeenCalledWith({
      title: '부산 여행',
      displayDestination: '부산광역시',
      legalRegionCodes: ['2600000000'],
    })
    wrapper.unmount()
  })

  it('첫 진입에서 실제 여행 목록의 첫 페이지를 요청한다', async () => {
    mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()

    expect(store.fetchTrips).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      status: undefined,
      sort: ['createdAt,desc'],
    })
  })

  it('목록 실패를 표시하고 다시 시도한다', async () => {
    store.error = '여행 목록을 불러오지 못했습니다.'
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()
    store.fetchTrips.mockClear()

    expect(wrapper.text()).toContain('여행 목록을 불러오지 못했습니다.')
    const retryButton = wrapper.findAll('button').find((button) => button.text() === '다시 시도')
    await retryButton!.trigger('click')
    expect(store.fetchTrips).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      status: undefined,
      sort: ['createdAt,desc'],
    })
  })

  it('목록을 불러오는 동안 로딩 상태를 표시한다', () => {
    store.loading = true
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })

    expect(wrapper.find('.animate-spin').exists()).toBe(true)
  })

  it('다음 페이지가 있으면 여행 더 보기를 요청한다', async () => {
    store.trips = [trip]
    store.hasMoreTrips = true
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })

    const loadMoreButton = wrapper.findAll('button').find((button) => button.text() === '여행 더 보기')
    await loadMoreButton!.trigger('click')

    expect(store.fetchNextPage).toHaveBeenCalledOnce()
  })

  it('필터에 맞는 빈 상태 문구를 표시한다', async () => {
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    const archivedFilter = wrapper.findAll('button').find((button) => button.text() === '보관됨')
    await archivedFilter!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('보관한 여행이 없습니다.')
  })

  it('보관된 여행 필터에서도 보딩패스 티켓 UI를 유지한다', async () => {
    store.trips = [{
      ...trip,
      id: 'archived-1',
      title: '지난 부산 여행',
      status: 'ARCHIVED',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    }]
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()
    const archivedFilter = wrapper.findAll('button').find((button) => button.text() === '보관됨')!
    await archivedFilter.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="trip-ticket"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('지난 부산 여행')
    expect(wrapper.text()).toContain('2026.07.10 - 2026.07.12')
  })

  it('캐러셀 조작부를 티켓 바깥 아래에 표시한다', async () => {
    store.trips = [trip, { ...trip, id: 'trip-2', title: '두 번째 여행' }]
    const wrapper = mount(MyTripsPage, {
      global: { stubs: { AppHeader: true, TripAccessModal: true, TripSettingsModal: true } },
    })
    await flushPromises()

    const panel = wrapper.get('.next-trip-panel')
    const ticket = panel.get('[data-testid="trip-ticket"]')
    const navigation = panel.get('.next-trip-nav')

    expect(ticket.find('.next-trip-nav').exists()).toBe(false)
    expect(navigation.element.parentElement).toBe(panel.element)
    expect(navigation.findAll('.carousel-dot')).toHaveLength(2)
    expect(navigation.findAll('button')).toHaveLength(2)
  })
})
