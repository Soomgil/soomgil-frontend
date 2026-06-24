import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
	trip: {
		getInvites: vi.fn(),
		createInvite: vi.fn(),
		updateTrip: vi.fn(),
	},
  place: {
    getPlace: vi.fn(),
    getAccessibilityBatch: vi.fn(),
  },
  swipe: {
    getRecommendations: vi.fn(),
  },
}))

vi.mock('@/api/ai.api', () => ({ aiApi: connectedApis.ai }))
vi.mock('@/api/chat.api', () => ({ chatApi: connectedApis.chat }))
vi.mock('@/api/planning.api', () => ({ planningApi: connectedApis.planning }))
vi.mock('@/api/trip.api', () => ({ tripApi: connectedApis.trip }))
vi.mock('@/api/place.api', () => ({ placeApi: connectedApis.place }))
vi.mock('@/api/swipe.api', () => ({ swipeApi: connectedApis.swipe }))

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
    itineraryVersion: ref(3),
    loading: ref(false),
    mutating: ref(false),
    error: ref(null),
    fetchItinerary: vi.fn(),
    createDay: vi.fn(),
    updateDay: vi.fn(),
    ensureUnscheduledDay: vi.fn(),
    deleteDay: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    reorder: vi.fn(),
		mapMatchRoute: vi.fn(),
		deleteRoute: vi.fn(),
		createDrawing: vi.fn(),
		deleteDrawing: vi.fn(),
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
		connectedApis.place.getAccessibilityBatch.mockResolvedValue({})
    connectedApis.swipe.getRecommendations.mockResolvedValue({
      items: [],
      page: { page: 0, size: 30, totalElements: 0, totalPages: 0, sort: [] },
    })
		connectedApis.trip.getInvites.mockResolvedValue([])
		connectedApis.trip.createInvite.mockResolvedValue({
			id: 'invite-1', tripId: 'trip-1', inviteCode: 'CODE', inviteUrl: 'https://soomgil.test/invite/CODE',
			inviteeUserId: null, status: 'PENDING', expiresAt: null, createdAt: '2026-06-20',
		})
		connectedApis.trip.updateTrip.mockResolvedValue({})
		holder.state.createDay.mockResolvedValue({})
		holder.state.updateDay.mockResolvedValue({})
		holder.state.updateItem.mockResolvedValue({})
		holder.state.deleteDay.mockResolvedValue({})
		holder.state.ensureUnscheduledDay.mockResolvedValue({})
		holder.state.createDrawing.mockResolvedValue({ id: 'drawing-1' })
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
    holder.state.routes.value = []
    holder.state.mapDrawings.value = []
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

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
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

  it('AI history가 비어 있으면 첫 질문 안내를 표시한다', async () => {
    const wrapper = mount(RoutePage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('AI에게 첫 질문을 보내보세요.')
  })

  it('AI history 조회 실패 후 다시 시도하여 응답을 복구한다', async () => {
    connectedApis.ai.getMessages
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        items: [{ id: 'ai-1', role: 'ASSISTANT', requester: null, content: '복구된 답변', toolCallId: null, createdAt: '2026-06-22T00:00:00Z' }],
        page: { offset: 0, limit: 50, nextOffset: null, hasMore: false, sort: [] },
      })
    const wrapper = mount(RoutePage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('일부 대화 내역을 불러오지 못했습니다.')
    const retry = wrapper.findAll('button').find((button) => button.text().includes('다시 시도'))
    await retry!.trigger('click')
    await flushPromises()

    expect(connectedApis.ai.getMessages).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('복구된 답변')
  })

  it('AI 전송 실패 시 입력 내용을 복원해 재시도할 수 있게 한다', async () => {
    connectedApis.ai.sendMessage.mockRejectedValue({ response: { data: { code: 'AI_PROVIDER_UNAVAILABLE' } } })
    const wrapper = mount(RoutePage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
    })
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.get('.ai-status').text()).not.toContain('불러오는 중'))

    const input = wrapper.get('#ai-chat-input')
    await input.setValue('일정을 요약해줘')
    await wrapper.get('#ai-chat-send-btn').trigger('click')
    await flushPromises()

    expect(connectedApis.ai.sendMessage).toHaveBeenCalledWith('trip-1', expect.objectContaining({ content: '일정을 요약해줘' }))
    expect((input.element as HTMLInputElement).value).toBe('일정을 요약해줘')
    expect(wrapper.text()).toContain('AI 모델 연결 설정이 필요합니다.')
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

	it('실제 여행 멤버와 체크리스트 완료자의 프로필 이미지를 표시한다', async () => {
		connectedApis.planning.getChecklists.mockResolvedValue([{
			id: 'checklist-1', tripId: 'trip-1', scopeType: 'TRIP', itineraryDayId: null,
			title: '전체 체크리스트',
			items: [{
				id: 'todo-1', checklistId: 'checklist-1', sortOrder: 0, content: '여권 챙기기', deletedAt: null,
				memberStatuses: [{
					user: { id: 'user-1', displayName: '김지훈', profileImageUrl: 'https://cdn.example.com/user-1.jpg' },
					isCompleted: true, completedAt: '2026-06-22T00:00:00Z', updatedAt: '2026-06-22T00:00:00Z',
				}],
			}],
		}])
		holder.tripStore.fetchTrip.mockImplementationOnce(async () => {
			holder.tripStore.currentTrip = {
				id: 'trip-1', title: '대전 여행', displayDestination: '대전광역시', status: 'ACTIVE',
				myRole: 'OWNER', itineraryVersion: 3, createdAt: '2026-06-20', ownerUserId: 'user-1',
				regions: [], retrippedFromPostId: null,
				members: [{
					id: 'member-1', tripId: 'trip-1', role: 'OWNER', accessRole: 'OWNER', status: 'ACTIVE',
					joinedAt: '2026-06-20',
					user: { id: 'user-1', displayName: '김지훈', profileImageUrl: 'https://cdn.example.com/user-1.jpg' },
				}],
			}
		})
		const wrapper = mount(RoutePage, {
			global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
		})
		await flushPromises()

		expect(wrapper.get('.avatars .avatar-img').attributes('src')).toBe('https://cdn.example.com/user-1.jpg')
		await wrapper.get('#todo-fab').trigger('click')
		await flushPromises()
		expect(wrapper.get('.todo-member-avatar img').attributes('src')).toBe('https://cdn.example.com/user-1.jpg')
		expect(wrapper.get('.todo-member-avatar').attributes('title')).toContain('김지훈')
	})

	it('일정 장소를 다른 일차로 드래그하면 전체 재정렬 API를 호출한다', async () => {
		const wrapper = mount(RoutePage, {
			global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
		})
		await flushPromises()
		const itineraryEl = wrapper.get('[data-sidebar-itinerary]').element as HTMLElement
		const separators = wrapper.findAll('.day-separator')
		const stop = wrapper.get('.stop')
		vi.spyOn(itineraryEl, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 320, width: 320, height: 320,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separators[0].element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 32, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separators[1].element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 72, top: 72, left: 0, right: 320, bottom: 104, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(stop.element, 'getBoundingClientRect').mockReturnValue({
			x: 12, y: 112, top: 112, left: 12, right: 300, bottom: 152, width: 288, height: 40,
			toJSON: () => ({}),
		} as DOMRect)

		stop.find('.stop-num').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 122 }))
		stop.element.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 76 }))
		stop.element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 76 }))
		await flushPromises()

		expect(holder.state.reorder).toHaveBeenCalledWith({
			days: [
				{ dayId: 'unscheduled', sortOrder: 0, itemOrders: [{ itemId: 'item-1', sortOrder: 0 }] },
				{ dayId: 'day-1', sortOrder: 1, itemOrders: [] },
			],
		})
	})

	it('순서 저장이 stale snapshot으로 실패하면 최신 전체 일정으로 보강해 한 번 재시도한다', async () => {
		const wrapper = mount(RoutePage, {
			global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
		})
		await flushPromises()
		holder.state.reorder
			.mockRejectedValueOnce(new Error('stale itinerary version'))
			.mockResolvedValueOnce({})
		holder.state.fetchItinerary.mockImplementationOnce(async () => {
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
						{
							id: 'item-extra', itineraryDayId: 'day-1', sortOrder: 1,
							itemType: 'CUSTOM_PLACE', place: null, placeName: '새로 추가된 일정',
							address: null, lat: null, lng: null, thumbnailUrl: null,
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

		const itineraryEl = wrapper.get('[data-sidebar-itinerary]').element as HTMLElement
		const separators = wrapper.findAll('.day-separator')
		const stop = wrapper.get('.stop')
		vi.spyOn(itineraryEl, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 320, width: 320, height: 320,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separators[0].element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 32, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separators[1].element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 72, top: 72, left: 0, right: 320, bottom: 104, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(stop.element, 'getBoundingClientRect').mockReturnValue({
			x: 12, y: 112, top: 112, left: 12, right: 300, bottom: 152, width: 288, height: 40,
			toJSON: () => ({}),
		} as DOMRect)

		stop.find('.stop-num').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 122 }))
		stop.element.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 76 }))
		stop.element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 76 }))
		await flushPromises()

		expect(holder.state.reorder).toHaveBeenCalledTimes(2)
		expect(holder.state.reorder).toHaveBeenNthCalledWith(2, {
			days: [
				{ dayId: 'unscheduled', sortOrder: 0, itemOrders: [{ itemId: 'item-1', sortOrder: 0 }] },
				{ dayId: 'day-1', sortOrder: 1, itemOrders: [{ itemId: 'item-extra', sortOrder: 0 }] },
			],
		})
		expect(wrapper.text()).not.toContain('일정 순서를 저장하지 못해 최신 상태로 되돌렸습니다.')
	})

	it('전체 보기에서 일차 구분선을 드래그하면 해당 일차 블록을 함께 이동한다', async () => {
		holder.state.fetchItinerary.mockImplementationOnce(async () => {
			holder.state.days.value = [
				{
					id: 'unscheduled', tripId: 'trip-1', groupType: 'UNSCHEDULED', dayNumber: null,
					date: null, title: null, sortOrder: 0, items: [],
				},
				{
					id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
					date: '2026-07-01', title: null, sortOrder: 1,
					items: [{
						id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0,
						itemType: 'CUSTOM_PLACE', place: null, placeName: '첫째 날 장소',
						address: null, lat: 36.35, lng: 127.38, thumbnailUrl: null,
						sourceStatus: 'AVAILABLE',
					}],
				},
				{
					id: 'day-2', tripId: 'trip-1', groupType: 'DAY', dayNumber: 2,
					date: '2026-07-02', title: null, sortOrder: 2,
					items: [{
						id: 'item-2', itineraryDayId: 'day-2', sortOrder: 0,
						itemType: 'CUSTOM_PLACE', place: null, placeName: '둘째 날 장소',
						address: null, lat: 36.36, lng: 127.39, thumbnailUrl: null,
						sourceStatus: 'AVAILABLE',
					}],
				},
			]
		})
		const wrapper = mount(RoutePage, {
			global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
		})
		await flushPromises()
		const itineraryEl = wrapper.get('[data-sidebar-itinerary]').element as HTMLElement
		const separators = wrapper.findAll('.day-separator')
		const stops = wrapper.findAll('.stop')
		vi.spyOn(itineraryEl, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 360, width: 320, height: 360,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separators[0].element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 32, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separators[1].element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 48, top: 48, left: 0, right: 320, bottom: 80, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(stops[0].element, 'getBoundingClientRect').mockReturnValue({
			x: 12, y: 88, top: 88, left: 12, right: 300, bottom: 128, width: 288, height: 40,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separators[2].element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 136, top: 136, left: 0, right: 320, bottom: 168, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(stops[1].element, 'getBoundingClientRect').mockReturnValue({
			x: 12, y: 176, top: 176, left: 12, right: 300, bottom: 216, width: 288, height: 40,
			toJSON: () => ({}),
		} as DOMRect)

		separators[2].find('.grip-icon').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 280, clientY: 146 }))
		separators[2].element.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 280, clientY: 54 }))
		separators[2].element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 280, clientY: 54 }))
		await flushPromises()

		expect(holder.state.reorder).toHaveBeenCalledWith({
			days: [
				{ dayId: 'unscheduled', sortOrder: 0, itemOrders: [] },
				{ dayId: 'day-2', sortOrder: 1, itemOrders: [{ itemId: 'item-2', sortOrder: 0 }] },
				{ dayId: 'day-1', sortOrder: 2, itemOrders: [{ itemId: 'item-1', sortOrder: 0 }] },
			],
		})
	})

	it('특정 일차 보기에서 카드 순서를 위로 드래그하면 구분선을 제외하고 저장한다', async () => {
		holder.state.fetchItinerary.mockImplementationOnce(async () => {
			holder.state.days.value = [
				{
					id: 'unscheduled', tripId: 'trip-1', groupType: 'UNSCHEDULED', dayNumber: null,
					date: null, title: null, sortOrder: 0, items: [],
				},
				{
					id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
					date: '2026-07-01', title: null, sortOrder: 1,
					items: [
						{
							id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0,
							itemType: 'CUSTOM_PLACE', place: null, placeName: '첫 번째 장소',
							address: null, lat: 36.35, lng: 127.38, thumbnailUrl: null,
							sourceStatus: 'AVAILABLE',
						},
						{
							id: 'item-2', itineraryDayId: 'day-1', sortOrder: 1,
							itemType: 'CUSTOM_PLACE', place: null, placeName: '두 번째 장소',
							address: null, lat: 36.36, lng: 127.39, thumbnailUrl: null,
							sourceStatus: 'AVAILABLE',
						},
					],
				},
			]
		})
		const wrapper = mount(RoutePage, {
			global: { stubs: { AppShell: { template: '<div><slot /></div>' }, LoadingState: true, ErrorState: true, EmptyState: true } },
		})
		await flushPromises()
		const dayTab = wrapper.findAll('.day-tab').find((button) => button.text().includes('1일차'))
		expect(dayTab).toBeTruthy()
		await dayTab!.trigger('click')
		await nextTick()

		const itineraryEl = wrapper.get('[data-sidebar-itinerary]').element as HTMLElement
		const separator = wrapper.get('.day-separator')
		const stops = wrapper.findAll('.stop')
		vi.spyOn(itineraryEl, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 260, width: 320, height: 260,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(separator.element, 'getBoundingClientRect').mockReturnValue({
			x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 32, width: 320, height: 32,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(stops[0].element, 'getBoundingClientRect').mockReturnValue({
			x: 12, y: 40, top: 40, left: 12, right: 300, bottom: 80, width: 288, height: 40,
			toJSON: () => ({}),
		} as DOMRect)
		vi.spyOn(stops[1].element, 'getBoundingClientRect').mockReturnValue({
			x: 12, y: 88, top: 88, left: 12, right: 300, bottom: 128, width: 288, height: 40,
			toJSON: () => ({}),
		} as DOMRect)

		stops[1].find('.stop-num').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 98 }))
		stops[1].element.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 48 }))
		stops[1].element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 48 }))
		await flushPromises()

		expect(holder.state.reorder).toHaveBeenCalledWith({
			days: [
				{ dayId: 'unscheduled', sortOrder: 0, itemOrders: [] },
				{
					dayId: 'day-1',
					sortOrder: 1,
					itemOrders: [
						{ itemId: 'item-2', sortOrder: 0 },
						{ itemId: 'item-1', sortOrder: 1 },
					],
				},
			],
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
    expect(wrapper.text()).toContain('일정 추가')

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

  it('KTO 일정 장소의 접근성을 batch 조회해 지도 마커에 전달한다', async () => {
    holder.state.fetchItinerary.mockImplementationOnce(async () => {
      holder.state.days.value = [{
        id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
        date: '2026-07-01', title: null, sortOrder: 0,
        items: [{
          id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0,
          itemType: 'PLACE', place: { provider: 'KTO', externalPlaceId: '126508' },
          placeName: '해운대해수욕장', address: '부산 해운대구',
          lat: 35.1587, lng: 129.1604, thumbnailUrl: null, sourceStatus: 'AVAILABLE',
        }],
      }]
    })
    connectedApis.place.getAccessibilityBatch.mockResolvedValueOnce({
      'KTO:126508': {
        openingHours: '09:00~18:00',
        closedDays: null,
        parkingType: 'FREE',
        flags: ['WHEELCHAIR'],
      },
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

    expect(connectedApis.place.getAccessibilityBatch).toHaveBeenCalledWith([
      { provider: 'KTO', externalPlaceId: '126508' },
    ])
    expect(wrapper.getComponent(MapboxItineraryMap).props('stops')).toEqual([
      expect.objectContaining({
        placeId: '126508',
        accessibility: expect.objectContaining({ flags: ['WHEELCHAIR'] }),
      }),
    ])
  })

  it('경로 펜에서 지도 마커의 일정 item id로 두 장소를 연결한다', async () => {
    holder.state.fetchItinerary.mockImplementationOnce(async () => {
      holder.state.days.value = [{
        id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
        date: '2026-07-01', title: null, sortOrder: 0,
        items: [
          {
            id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0,
            itemType: 'CUSTOM_PLACE', place: null, placeName: '출발지',
            address: null, lat: 36.35, lng: 127.38, thumbnailUrl: null, sourceStatus: 'AVAILABLE',
          },
          {
            id: 'item-2', itineraryDayId: 'day-1', sortOrder: 1,
            itemType: 'CUSTOM_PLACE', place: null, placeName: '도착지',
            address: null, lat: 36.36, lng: 127.39, thumbnailUrl: null, sourceStatus: 'AVAILABLE',
          },
        ],
      }]
    })
    holder.state.mapMatchRoute.mockResolvedValueOnce({
      id: 'route-1',
      originItineraryItemId: 'item-1',
      destinationItineraryItemId: 'item-2',
      mode: 'WALKING',
      provider: 'MAPBOX',
      providerProfile: 'walking',
      geometryFormat: 'GEOJSON',
      geometry: { type: 'LineString', coordinates: [[127.38, 36.35], [127.39, 36.36]] },
      distanceMeters: null,
      durationSeconds: null,
      confidence: null,
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
    const map = wrapper.getComponent(MapboxItineraryMap)

    await wrapper.get('button[data-tool="route-pen"]').trigger('click')
    map.vm.$emit('selectPlace', undefined, undefined, 'item-1')
    await nextTick()
    map.vm.$emit('selectPlace', undefined, undefined, 'item-2')
    await flushPromises()

    expect(holder.state.mapMatchRoute).toHaveBeenCalledWith({
      originItineraryItemId: 'item-1',
      destinationItineraryItemId: 'item-2',
      mode: 'WALKING',
      coordinates: [{ lng: 127.38, lat: 36.35 }, { lng: 127.39, lat: 36.36 }],
      tidy: true,
    })
    expect(connectedApis.swipe.getRecommendations).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      tab: 'BASIC',
      page: 0,
      size: 30,
    }))
  })

  it('Mapbox 상세 경로 좌표가 많아도 경로 매칭 요청은 100개 이하로 보낸다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'mapbox-token')
    const directionsCoordinates = Array.from({ length: 150 }, (_, index) => [
      127.38 + index / 10000,
      36.35 + index / 10000,
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        code: 'Ok',
        routes: [{ geometry: { coordinates: directionsCoordinates } }],
      }),
    }))
    holder.state.fetchItinerary.mockImplementationOnce(async () => {
      holder.state.days.value = [{
        id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
        date: '2026-07-01', title: null, sortOrder: 0,
        items: [
          {
            id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0,
            itemType: 'CUSTOM_PLACE', place: null, placeName: '출발지',
            address: null, lat: 36.35, lng: 127.38, thumbnailUrl: null, sourceStatus: 'AVAILABLE',
          },
          {
            id: 'item-2', itineraryDayId: 'day-1', sortOrder: 1,
            itemType: 'CUSTOM_PLACE', place: null, placeName: '도착지',
            address: null, lat: 36.36, lng: 127.39, thumbnailUrl: null, sourceStatus: 'AVAILABLE',
          },
        ],
      }]
    })
    holder.state.mapMatchRoute.mockResolvedValueOnce({
      id: 'route-1',
      originItineraryItemId: 'item-1',
      destinationItineraryItemId: 'item-2',
      mode: 'WALKING',
      provider: 'MAPBOX',
      providerProfile: 'walking',
      geometryFormat: 'GEOJSON',
      geometry: { type: 'LineString', coordinates: [[127.38, 36.35], [127.39, 36.36]] },
      distanceMeters: null,
      durationSeconds: null,
      confidence: null,
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
    const map = wrapper.getComponent(MapboxItineraryMap)

    await wrapper.get('button[data-tool="route-pen"]').trigger('click')
    map.vm.$emit('selectPlace', undefined, undefined, 'item-1')
    await nextTick()
    map.vm.$emit('selectPlace', undefined, undefined, 'item-2')
    await flushPromises()

    const request = holder.state.mapMatchRoute.mock.calls[0][0]
    expect(request.coordinates).toHaveLength(100)
    expect(request.coordinates[0]).toEqual({ lng: 127.38, lat: 36.35 })
    expect(request.coordinates.at(-1).lng).toBeCloseTo(127.3949)
    expect(request.coordinates.at(-1).lat).toBeCloseTo(36.3649)
  })

  it('새로고침 후 기존 연결 경로로 주변 관광지를 다시 불러온다', async () => {
    holder.state.routes.value = [{
      id: 'route-1',
      originItineraryItemId: 'item-1',
      destinationItineraryItemId: 'item-2',
      geometry: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [{ lng: 127.38, lat: 36.35 }, { lng: 127.39, lat: 36.36 }],
        },
      },
    }]
    connectedApis.swipe.getRecommendations.mockResolvedValueOnce({
      items: [{
        place: {
          provider: 'KTO',
          externalPlaceId: 'nearby-1',
          placeName: '주변 명소',
          category: '관광지',
          lat: 36.355,
          lng: 127.385,
        },
      }],
      page: { page: 0, size: 30, totalElements: 1, totalPages: 1, sort: [] },
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

    await wrapper.get('button[data-toggle="nearby"]').trigger('click')
    await flushPromises()

    expect(connectedApis.swipe.getRecommendations).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      bbox: '127.365,36.335,127.405,36.375',
      tab: 'BASIC',
      page: 0,
      size: 30,
    }))
    expect(wrapper.getComponent(MapboxItineraryMap).props('nearbyPlaces')).toEqual([expect.objectContaining({
      externalPlaceId: 'nearby-1',
      title: '주변 명소',
    })])
  })

  it('관리 모달에서 여행 날짜를 수정할 때 순서 저장을 다시 호출하지 않는다', async () => {
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
    holder.state.reorder.mockClear()
    holder.state.fetchItinerary.mockClear()

    await wrapper.get('#edit-trip-start-date').setValue('2026-07-01')
    await wrapper.get('#edit-trip-end-date').setValue('2026-07-02')
    await wrapper.get('#trip-settings-form').trigger('submit')
    await flushPromises()

    expect(holder.state.updateDay).toHaveBeenCalledWith('day-1', {
      dayNumber: 1,
      date: '2026-07-01',
      sortOrder: 1,
    })
    expect(holder.state.createDay).toHaveBeenCalledWith({
      groupType: 'DAY',
      dayNumber: 2,
      date: '2026-07-02',
      sortOrder: 2,
    })
    expect(holder.state.reorder).not.toHaveBeenCalled()
    expect(holder.state.fetchItinerary).toHaveBeenCalled()
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
      id: 'drawing-1',
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      color: '#ef4444',
      width: 6,
    }])

    map.vm.$emit('drawingErase', 'drawing-1')
    await flushPromises()
    expect(map.props('drawings')).toEqual([])
		expect(holder.state.deleteDrawing).toHaveBeenCalledWith('drawing-1')
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

    map.vm.$emit('drawingErase', 'drawing-1')
    await flushPromises()
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
