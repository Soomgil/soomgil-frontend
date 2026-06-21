import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapboxItineraryMap from '@/components/map/MapboxItineraryMap.vue'
import RoutePage from './RoutePage.vue'

const holder = vi.hoisted(() => ({ state: null as any, tripStore: null as any, viewportState: null as any }))
const geo = vi.hoisted(() => ({ simplifyCoordinates: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { tripId: 'trip-1' } }),
}))

vi.mock('@/composables/useItinerary', async () => {
  const { computed, ref } = await import('vue')
  const days = ref<any[]>([])
  holder.state = {
    days,
    routes: ref([]),
    mapDrawings: ref([]),
    loading: ref(false),
    mutating: ref(false),
    error: ref(null),
    fetchItinerary: vi.fn(),
    createDay: vi.fn(),
    ensureUnscheduledDay: vi.fn(),
    deleteDay: vi.fn(),
    createItem: vi.fn(),
    deleteItem: vi.fn(),
    reorder: vi.fn(),
    unscheduledDay: computed(() => days.value.find((day) => day.groupType === 'UNSCHEDULED') ?? null),
  }
  return { useItinerary: () => holder.state }
})

vi.mock('@/stores/trip.store', () => ({
  useTripStore: () => holder.tripStore,
}))

vi.mock('@/api/geo.api', () => ({ geoApi: geo }))

vi.mock('@/composables/useMapViewport', async () => {
  const { computed, ref } = await import('vue')
  holder.viewportState = {
    viewport: ref(null),
    summary: ref(null),
    center: computed(() => null),
    loading: ref(false),
    error: ref(null),
    updateViewport: vi.fn(),
    retry: vi.fn(),
  }
  return { useMapViewport: () => holder.viewportState }
})

describe('RoutePage itinerary integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    holder.tripStore = reactive({
      currentTrip: null,
      fetchTrip: vi.fn(async () => {
        holder.tripStore.currentTrip = {
          id: 'trip-1', title: '대전 여행', displayDestination: '대전광역시',
          status: 'ACTIVE', myRole: 'OWNER', itineraryVersion: 3, createdAt: '2026-06-20',
          ownerUserId: 'user-1', regions: [], retrippedFromPostId: null,
          members: [{
            id: 'member-1', tripId: 'trip-1', role: 'OWNER', accessRole: 'OWNER', status: 'ACTIVE',
            joinedAt: '2026-06-20', user: { id: 'user-1', displayName: '김지훈', profileImageUrl: null },
          }],
        }
      }),
    })
    holder.state.days.value = []
    holder.state.error.value = null
    holder.viewportState.loading.value = false
    holder.viewportState.error.value = null
    geo.simplifyCoordinates.mockResolvedValue({
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      originalCount: 2,
      simplifiedCount: 2,
      maxPoints: 100,
    })
    holder.state.fetchItinerary.mockImplementation(async () => {
      holder.state.days.value = [
        {
          id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
          date: '2026-07-01', title: null, sortOrder: 0,
          items: [
            {
              id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0,
              itemType: 'CUSTOM_PLACE', place: null, placeName: '자유 시간',
              address: null, lat: 36.35, lng: 127.38, thumbnailUrl: null,
              sourceStatus: 'AVAILABLE',
            },
          ],
        },
        {
          id: 'unscheduled', tripId: 'trip-1', groupType: 'UNSCHEDULED', dayNumber: null,
          date: null, title: null, sortOrder: 1, items: [],
        },
      ]
    })
  })

  it('route의 trip 일정과 일차 미정을 실제 상태에서 표시한다', async () => {
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()

    expect(holder.state.fetchItinerary).toHaveBeenCalledOnce()
    expect(holder.tripStore.fetchTrip).toHaveBeenCalledWith('trip-1')
    expect(wrapper.text()).toContain('대전 여행')
    expect(wrapper.text()).toContain('대전광역시')
    expect(wrapper.text()).toContain('1일차')
    expect(wrapper.text()).toContain('일차 미정')
    expect(wrapper.text()).toContain('자유 시간')
    expect(wrapper.findComponent(MapboxItineraryMap).props('stops')).toEqual([
      expect.objectContaining({ id: 'item-1', title: '자유 시간', lat: 36.35, lng: 127.38 }),
    ])
    expect(wrapper.get('button[aria-label="일차 추가"]').attributes('aria-label')).toBe('일차 추가')

    await wrapper.get('button[aria-label="일차 추가"]').trigger('click')
    expect(holder.state.createDay).toHaveBeenCalledWith({
      groupType: 'DAY',
      dayNumber: 2,
      sortOrder: 2,
    })

    await wrapper.get('.search-panel-custom-trigger').trigger('click')
    await wrapper.get('#inline-custom-title').setValue('점심 식사')
    await wrapper.get('#inline-custom-submit').trigger('click')
    expect(holder.state.createItem).toHaveBeenCalledWith({
      itineraryDayId: 'day-1',
      sortOrder: 1,
      itemType: 'CUSTOM_PLACE',
      placeName: '점심 식사',
    })
  })

  it('식별자가 없는 목 검색 장소는 일정에 추가하지 못하게 한다', async () => {
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    await wrapper.get('.search-panel-custom-trigger').trigger('click')

    const addButton = wrapper.get('.search-result-add-btn')
    expect(addButton.attributes('disabled')).toBeDefined()
    expect(holder.state.createItem).not.toHaveBeenCalled()
  })

  it('지도 범위 동기화 실패를 표시하고 재시도한다', async () => {
    holder.viewportState.error.value = '지도 범위를 동기화하지 못했습니다.'
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('.map-viewport-status[role="alert"]').text()).toContain('지도 범위를 동기화하지 못했습니다.')
    await wrapper.get('.map-viewport-retry').trigger('click')
    expect(holder.viewportState.retry).toHaveBeenCalledOnce()
  })

  it('새 지도 그림을 좌표 단순화한 뒤 표시하고 지운다', async () => {
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    const map = wrapper.getComponent(MapboxItineraryMap)
    const draft = {
      coordinates: [{ lng: 127, lat: 36 }, { lng: 127.5, lat: 36.5 }, { lng: 128, lat: 37 }],
      color: '#ef4444',
      width: 6,
    }

    map.vm.$emit('drawingCreate', draft)
    await flushPromises()

    expect(geo.simplifyCoordinates).toHaveBeenCalledWith({ coordinates: draft.coordinates, maxPoints: 100 })
    expect(map.props('drawings')).toEqual([{
      id: 'local-drawing-1',
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      color: '#ef4444',
      width: 6,
    }])

    map.vm.$emit('drawingErase', 'local-drawing-1')
    await nextTick()
    expect(map.props('drawings')).toEqual([])
  })

  it('저장 전 지도 그림 생성과 삭제를 로컬에서 실행 취소하고 다시 실행한다', async () => {
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    const map = wrapper.getComponent(MapboxItineraryMap)

    map.vm.$emit('drawingCreate', {
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      color: '#1f2937',
      width: 4,
    })
    await flushPromises()

    const undoButton = wrapper.get('button[data-action="undo"]')
    const redoButton = wrapper.get('button[data-action="redo"]')
    expect(undoButton.attributes('disabled')).toBeUndefined()

    await undoButton.trigger('click')
    expect(map.props('drawings')).toEqual([])
    expect(redoButton.attributes('disabled')).toBeUndefined()

    await redoButton.trigger('click')
    expect(map.props('drawings')).toHaveLength(1)

    map.vm.$emit('drawingErase', 'local-drawing-1')
    await nextTick()
    expect(map.props('drawings')).toEqual([])

    await undoButton.trigger('click')
    expect(map.props('drawings')).toHaveLength(1)
  })

  it('실행 취소 후 새 그림을 만들면 로컬 다시 실행 이력을 비운다', async () => {
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    const map = wrapper.getComponent(MapboxItineraryMap)
    const draft = {
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      color: '#1f2937',
      width: 4,
    }

    map.vm.$emit('drawingCreate', draft)
    await flushPromises()
    await wrapper.get('button[data-action="undo"]').trigger('click')
    expect(wrapper.get('button[data-action="redo"]').attributes('disabled')).toBeUndefined()

    map.vm.$emit('drawingCreate', { ...draft, color: '#ef4444' })
    await flushPromises()

    expect(wrapper.get('button[data-action="redo"]').attributes('disabled')).toBeDefined()
    expect(map.props('drawings')).toHaveLength(1)
  })

  it('좌표 단순화 중 실행 취소와 다시 실행을 해도 요청을 중복하지 않는다', async () => {
    let resolveSimplification: ((value: {
      coordinates: Array<{ lng: number; lat: number }>
      originalCount: number
      simplifiedCount: number
      maxPoints: number
    }) => void) | undefined
    geo.simplifyCoordinates.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSimplification = resolve
    }))
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    const map = wrapper.getComponent(MapboxItineraryMap)

    map.vm.$emit('drawingCreate', {
      coordinates: [{ lng: 127, lat: 36 }, { lng: 127.5, lat: 36.5 }, { lng: 128, lat: 37 }],
      color: '#1f2937',
      width: 4,
    })
    await nextTick()
    await wrapper.get('button[data-action="undo"]').trigger('click')
    await wrapper.get('button[data-action="redo"]').trigger('click')

    expect(geo.simplifyCoordinates).toHaveBeenCalledOnce()
    resolveSimplification?.({
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      originalCount: 3,
      simplifiedCount: 2,
      maxPoints: 100,
    })
    await flushPromises()

    const drawings = map.props('drawings') ?? []
    expect(drawings).toHaveLength(1)
    expect(drawings[0]?.coordinates).toEqual([
      { lng: 127, lat: 36 },
      { lng: 128, lat: 37 },
    ])
  })

  it('로컬 실행 취소 이력을 최근 5개로 제한한다', async () => {
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    const map = wrapper.getComponent(MapboxItineraryMap)
    const undoButton = wrapper.get('button[data-action="undo"]')

    for (let index = 0; index < 6; index += 1) {
      map.vm.$emit('drawingCreate', {
        coordinates: [{ lng: 127 + index, lat: 36 }, { lng: 128 + index, lat: 37 }],
        color: '#1f2937',
        width: 4,
      })
      await flushPromises()
    }
    for (let index = 0; index < 5; index += 1) {
      await undoButton.trigger('click')
    }

    expect(map.props('drawings')).toHaveLength(1)
    expect(undoButton.attributes('disabled')).toBeDefined()
  })

  it('좌표 단순화 실패를 표시하고 재시도한다', async () => {
    geo.simplifyCoordinates
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
        originalCount: 2,
        simplifiedCount: 2,
        maxPoints: 100,
      })
    const wrapper = mount(RoutePage, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          LoadingState: true,
          ErrorState: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    wrapper.getComponent(MapboxItineraryMap).vm.$emit('drawingCreate', {
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      color: '#1f2937',
      width: 4,
    })
    await flushPromises()

    expect(wrapper.get('.map-drawing-status[role="alert"]').text()).toContain('그림 좌표를 정리하지 못했습니다.')
    wrapper.getComponent(MapboxItineraryMap).vm.$emit('drawingCreate', {
      coordinates: [{ lng: 126, lat: 35 }, { lng: 127, lat: 36 }],
      color: '#ef4444',
      width: 2,
    })
    await flushPromises()
    expect(wrapper.find('.map-drawing-status').exists()).toBe(true)

    await wrapper.get('.map-drawing-status button').trigger('click')
    await flushPromises()
    expect(geo.simplifyCoordinates).toHaveBeenCalledTimes(3)
    expect(wrapper.find('.map-drawing-status').exists()).toBe(false)
  })
})
