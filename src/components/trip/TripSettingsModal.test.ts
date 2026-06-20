import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripSettingsModal from './TripSettingsModal.vue'
import type { TripSummary } from '@/types/trip'

const store = vi.hoisted(() => ({
  mutating: false,
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))

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
  beforeEach(() => vi.clearAllMocks())

  it('수정한 제목과 상태를 저장한다', async () => {
    store.updateTrip.mockResolvedValue({ ...trip, title: '여름 부산 여행', status: 'ARCHIVED' })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="title"]').setValue('여름 부산 여행')
    await wrapper.get('input[name="displayDestination"]').setValue('')
    await wrapper.get('button[data-status="ARCHIVED"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '여름 부산 여행',
      displayDestination: '',
      status: 'ARCHIVED',
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
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
