import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TripSettingsModal from './TripSettingsModal.vue'
import type { TripSummary } from '@/types/trip'

const geo = vi.hoisted(() => ({ searchLegalRegions: vi.fn() }))

const store = vi.hoisted(() => ({
  mutating: false,
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))
vi.mock('@/api/geo.api', () => ({ geoApi: geo }))

const trip: TripSummary = {
  id: 'trip-1',
  title: '부산 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE',
  myRole: 'OWNER',
  itineraryVersion: 0,
  createdAt: '2026-06-20T00:00:00Z',
}

describe('TripSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    geo.searchLegalRegions.mockResolvedValue({
      items: [],
      page: { page: 0, size: 10, totalElements: 0, totalPages: 0, sort: [] },
    })
  })

  afterEach(() => vi.useRealTimers())

  it('수정한 제목과 상태를 저장한다', async () => {
    store.updateTrip.mockResolvedValue({ ...trip, title: '여름 부산 여행', status: 'ARCHIVED' })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="title"]').setValue('여름 부산 여행')
    await wrapper.get('button[data-status="ARCHIVED"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '여름 부산 여행',
      displayDestination: '부산광역시',
      status: 'ARCHIVED',
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('목적지를 직접 변경하면 기존 법정동 연결을 제거한다', async () => {
    store.updateTrip.mockResolvedValue({ ...trip, displayDestination: '남해' })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="displayDestination"]').setValue('남해')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '부산 여행',
      displayDestination: '남해',
      legalRegionCodes: [],
      status: 'ACTIVE',
    })
  })

  it('목적지를 원래 값으로 되돌리면 기존 법정동 연결을 유지한다', async () => {
    store.updateTrip.mockResolvedValue(trip)
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="displayDestination"]').setValue('서울')
    await wrapper.get('input[name="displayDestination"]').setValue('부산광역시')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '부산 여행',
      displayDestination: '부산광역시',
      status: 'ACTIVE',
    })
  })

  it('검색 결과를 선택하면 법정동 연결을 교체한다', async () => {
    vi.useFakeTimers()
    geo.searchLegalRegions.mockResolvedValue({
      items: [{
        code: '1100000000', name: '서울특별시', fullName: '서울특별시',
        level: 'SIDO', parentCode: null, isActive: true,
      }],
      page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    store.updateTrip.mockResolvedValue({ ...trip, displayDestination: '서울특별시' })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="displayDestination"]').setValue('서울')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await Promise.resolve()

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '부산 여행',
      displayDestination: '서울특별시',
      legalRegionCodes: ['1100000000'],
      status: 'ACTIVE',
    })
    wrapper.unmount()
  })

  it('삭제 확인 후 여행을 삭제하고 deleted 이벤트를 보낸다', async () => {
    store.deleteTrip.mockResolvedValue(undefined)
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('[data-testid="delete-open"]').trigger('click')
    await wrapper.get('[data-testid="delete-confirm"]').trigger('click')

    expect(store.deleteTrip).toHaveBeenCalledWith(trip.id)
    expect(wrapper.emitted('deleted')).toEqual([[trip.id]])
  })
})
