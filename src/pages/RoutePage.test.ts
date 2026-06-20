import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoutePage from './RoutePage.vue'

const holder = vi.hoisted(() => ({ state: null as any, tripStore: null as any }))

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
    holder.state.fetchItinerary.mockImplementation(async () => {
      holder.state.days.value = [
        {
          id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
          date: '2026-07-01', title: null, sortOrder: 0,
          items: [
            {
              id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0,
              itemType: 'CUSTOM_PLACE', place: null, placeName: '자유 시간',
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
})
