import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyTripsPage from './MyTripsPage.vue'

const geo = vi.hoisted(() => ({ searchLegalRegions: vi.fn() }))

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
  trips: [],
  loading: false,
  error: null,
  creating: false,
  loadingMore: false,
  loadMoreError: null,
  hasMoreTrips: false,
  fetchTrips: vi.fn().mockResolvedValue(undefined),
  fetchNextPage: vi.fn().mockResolvedValue(undefined),
  createTrip: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/api/geo.api', () => ({ geoApi: geo }))

describe('MyTripsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
