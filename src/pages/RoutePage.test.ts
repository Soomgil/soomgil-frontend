import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapboxItineraryMap from '@/components/map/MapboxItineraryMap.vue'
import PlaceDiscoveryPanel from '@/components/place/PlaceDiscoveryPanel.vue'
import RoutePage from './RoutePage.vue'

const holder = vi.hoisted(() => ({ state: null as any, tripStore: null as any, viewportState: null as any }))
const geo = vi.hoisted(() => ({ simplifyCoordinates: vi.fn() }))
const realtime = vi.hoisted(() => ({ instances: [] as any[] }))
const connectedApis = vi.hoisted(() => ({
  ai: {
    getSession: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
  chat: {
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
  planning: {
    getNote: vi.fn(),
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
    getChecklists: vi.fn(),
    saveChecklist: vi.fn(),
    addChecklistItem: vi.fn(),
    updateMyItemStatus: vi.fn(),
    deleteChecklistItem: vi.fn(),
  },
}))

vi.mock('@/api/ai.api', () => ({ aiApi: connectedApis.ai }))
vi.mock('@/api/chat.api', () => ({ chatApi: connectedApis.chat }))
vi.mock('@/api/planning.api', () => ({ planningApi: connectedApis.planning }))

vi.mock('@/components/place/PlaceDiscoveryPanel.vue', () => ({
  default: {
    name: 'PlaceDiscoveryPanel',
    props: ['tripId', 'bbox'],
    emits: ['add', 'select'],
    template: '<div data-testid="place-discovery" />',
  },
}))

vi.mock('@/realtime/stompTransport', () => ({
  resolveWebSocketUrl: () => 'ws://localhost/ws',
  StompTransport: class FakeStompTransport {
    connected = false
    published: Array<{ destination: string; payload: unknown }> = []
    subscriptions = new Map<string, (payload: unknown) => void>()

    constructor() {
      realtime.instances.push(this)
    }

    connect() { this.connected = true }
    async disconnect() { this.connected = false }
    publish(destination: string, payload: unknown) {
      if (!this.connected) return false
      this.published.push({ destination, payload })
      return true
    }
    subscribe(destination: string, handler: (payload: unknown) => void) {
      this.subscriptions.set(destination, handler)
      return () => this.subscriptions.delete(destination)
    }
  },
}))

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
    localStorage.clear()
    realtime.instances.length = 0
    connectedApis.ai.getSession.mockResolvedValue({
      id: 'ai-session-1', tripId: 'trip-1', status: 'ACTIVE', summaryUpdatedAt: null, createdAt: null,
    })
    connectedApis.ai.getMessages.mockResolvedValue({
      items: [], page: { offset: 0, limit: 50, nextOffset: null, hasMore: false, sort: [] },
    })
    connectedApis.chat.getMessages.mockResolvedValue({
      items: [], page: { offset: 0, limit: 50, nextOffset: null, hasMore: false, sort: [] },
    })
    connectedApis.planning.getNote.mockRejectedValue({ response: { status: 404 } })
    connectedApis.planning.getChecklists.mockResolvedValue([])
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

  it('지도 화면 진입 시 AI·메모·체크리스트를 백엔드에서 불러온다', async () => {
    mount(RoutePage, {
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

    expect(connectedApis.ai.getSession).toHaveBeenCalledWith('trip-1')
    expect(connectedApis.ai.getMessages).toHaveBeenCalledWith('trip-1')
    expect(connectedApis.planning.getNote).toHaveBeenCalledWith('trip-1', {
      scopeType: 'TRIP', itineraryDayId: null,
    })
    expect(connectedApis.planning.getChecklists).toHaveBeenCalledWith('trip-1')
  })

  it('지도 패널에서 여행 메모와 체크리스트 항목을 바로 저장한다', async () => {
    connectedApis.planning.saveNote.mockResolvedValue({
      note: {
        id: 'note-1', tripId: 'trip-1', scopeType: 'TRIP', itineraryDayId: null,
        content: '렌터카 예약 확인', deletedAt: null,
      },
    })
    connectedApis.planning.saveChecklist.mockResolvedValue({
      checklist: {
        id: 'checklist-1', tripId: 'trip-1', scopeType: 'TRIP', itineraryDayId: null,
        title: '전체 체크리스트', items: [],
      },
    })
    connectedApis.planning.addChecklistItem.mockResolvedValue({ item: { id: 'item-1' } })
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

    await wrapper.get('#memo-fab').trigger('click')
    await flushPromises()
    await wrapper.get('#memo-textarea').setValue('렌터카 예약 확인')
    await wrapper.get('#memo-copy-btn').trigger('click')
    await flushPromises()
    expect(connectedApis.planning.saveNote).toHaveBeenCalledWith('trip-1', {
      scopeType: 'TRIP', itineraryDayId: null,
    }, '렌터카 예약 확인')

    await wrapper.get('#todo-fab').trigger('click')
    await flushPromises()
    await wrapper.get('#todo-input').setValue('여권 챙기기')
    await wrapper.get('#todo-add-btn').trigger('click')
    await flushPromises()
    expect(connectedApis.planning.saveChecklist).toHaveBeenCalledWith('trip-1', {
      scopeType: 'TRIP', itineraryDayId: null,
    }, '전체 체크리스트')
    expect(connectedApis.planning.addChecklistItem).toHaveBeenCalledWith(
      'trip-1', 'checklist-1', '여권 챙기기', 0,
    )
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

  it('장소 탐색 결과를 실제 장소 참조로 일정에 추가한다', async () => {
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
    const discovery = wrapper.getComponent(PlaceDiscoveryPanel)
    expect(discovery.props('tripId')).toBe('trip-1')
    expect(discovery.props('bbox')).toBe('127.38,36.35,127.38,36.35')

    discovery.vm.$emit('add', {
      provider: 'KTO',
      externalPlaceId: '126508',
      placeName: '해운대해수욕장',
      address: '부산 해운대구',
      lat: 35.1587,
      lng: 129.1604,
      thumbnailUrl: 'https://cdn.example.com/haeundae.jpg',
    })
    await flushPromises()

    expect(holder.state.createItem).toHaveBeenCalledWith({
      itineraryDayId: 'day-1',
      sortOrder: 1,
      itemType: 'PLACE',
      place: { provider: 'KTO', externalPlaceId: '126508' },
      placeName: '해운대해수욕장',
      address: '부산 해운대구',
      lat: 35.1587,
      lng: 129.1604,
      thumbnailUrl: 'https://cdn.example.com/haeundae.jpg',
    })
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

  it('지도 drawing preview를 전송하고 다른 사용자의 preview를 표시한다', async () => {
    localStorage.setItem('accessToken', 'test-token')
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
    const transport = realtime.instances[0]
    const coordinates = Array.from({ length: 40 }, (_, index) => ({ lng: 127 + index / 100, lat: 36 }))

    map.vm.$emit('drawingPreview', {
      previewId: 'local-preview', sequence: 1, phase: 'UPDATE', coordinates,
      color: '#1f2937', width: 4,
    })
    await nextTick()

    expect(transport.connected).toBe(true)
    expect(transport.published).toEqual([expect.objectContaining({
      destination: '/app/trips/trip-1/map-drawing-preview',
      payload: expect.objectContaining({ previewId: 'local-preview', coordinates: expect.any(Array) }),
    })])
    expect(transport.published[0].payload.coordinates).toHaveLength(32)

    transport.subscriptions.get('/topic/trips/trip-1/map-drawings')?.({
      tripId: 'trip-1', clientId: 'remote-client', previewId: 'remote-preview', sequence: 1,
      phase: 'UPDATE', coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      color: '#ef4444', width: 6, sentAt: '2026-06-21T05:00:00Z',
    })
    await nextTick()

    expect(map.props('drawings')).toEqual([expect.objectContaining({
      id: 'remote:remote-client:remote-preview', color: '#ef4444', width: 6,
    })])
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

  it('지도 그림 실행 취소가 이후 반영된 일정 상태를 되돌리지 않는다', async () => {
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

    holder.state.days.value[0].items[0].placeName = '외부에서 갱신된 일정'
    await nextTick()
    await wrapper.get('button[data-action="undo"]').trigger('click')

    expect(map.props('drawings')).toEqual([])
    expect(wrapper.text()).toContain('외부에서 갱신된 일정')
    expect(holder.state.reorder).not.toHaveBeenCalled()
  })

  it('텍스트 입력 중에는 실행 취소 단축키로 지도 그림을 변경하지 않는다', async () => {
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

    const textInput = wrapper.get('#todo-input')
    await textInput.setValue('부산')
    await textInput.trigger('keydown', { key: 'z', ctrlKey: true })

    expect(map.props('drawings')).toHaveLength(1)
    expect(textInput.element).toHaveProperty('value', '부산')
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
