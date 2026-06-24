import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { search, getPlace, getRecommendations, react, savePlace, unsavePlace } = vi.hoisted(() => ({
  search: vi.fn(),
  getPlace: vi.fn(),
  getRecommendations: vi.fn(),
  react: vi.fn(),
  savePlace: vi.fn(),
  unsavePlace: vi.fn(),
}))

vi.mock('@/api/place.api', () => ({ placeApi: { search, getPlace } }))
vi.mock('@/api/swipe.api', () => ({ swipeApi: { getRecommendations, react, savePlace, unsavePlace } }))

import PlaceDiscoveryPanel from './PlaceDiscoveryPanel.vue'

const place = {
  provider: 'KTO' as const,
  externalPlaceId: '126508',
  placeName: '해운대해수욕장',
  address: '부산 해운대구',
  lat: 35.1587,
  lng: 129.1604,
  thumbnailUrl: null,
  category: 'ATTRACTION',
  sourceStatus: 'AVAILABLE' as const,
}

describe('PlaceDiscoveryPanel', () => {
  beforeEach(() => {
    search.mockReset()
    getPlace.mockReset()
    getRecommendations.mockReset()
    react.mockReset()
    savePlace.mockReset()
    unsavePlace.mockReset()
    getRecommendations.mockResolvedValue({
      items: [{ place, matchedMembers: [], rank: 1, distanceMeters: 120, recommendationReason: '그룹 취향과 잘 맞아요' }],
      page: { page: 0, size: 20, totalElements: 1, totalPages: 1, sort: [] },
    })
    search.mockResolvedValue({
      items: [place],
      page: { page: 0, size: 20, totalElements: 1, totalPages: 1, sort: [] },
    })
    getPlace.mockResolvedValue({ ...place, description: '부산을 대표하는 해변입니다.' })
    react.mockResolvedValue({ reaction: 'SUPER_LIKE', savedPlaceEligible: true })
    savePlace.mockResolvedValue({ id: 'saved-1', place, createdAt: '2026-06-21T00:00:00Z' })
    unsavePlace.mockResolvedValue(undefined)
  })

  it('loads basic recommendations, searches, emits add, and toggles save', async () => {
    const wrapper = mount(PlaceDiscoveryPanel, {
      props: { tripId: 'trip-1', bbox: '129,35,130,36' },
    })
    await flushPromises()

    expect(getRecommendations).toHaveBeenCalledWith('trip-1', {
      bbox: '129,35,130,36',
      tab: 'BASIC',
      page: 0,
      size: 20,
    })
    expect(wrapper.text()).toContain('해운대해수욕장')

    await wrapper.get('.discovery-result').trigger('click')
    await flushPromises()
    expect(getPlace).toHaveBeenCalledWith('KTO', '126508')
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual(expect.objectContaining({ description: '부산을 대표하는 해변입니다.' }))

    await wrapper.get('button[data-mode="search"]').trigger('click')
    await wrapper.get('input[type="search"]').setValue('해운대')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(search).toHaveBeenCalledWith({ q: '해운대', bbox: '129,35,130,36', page: 0, size: 20 })

    await wrapper.get('button[aria-label="해운대해수욕장 일정에 추가"]').trigger('click')
    expect(wrapper.emitted('add')?.[0]).toEqual([place])

    await wrapper.get('button[aria-label="해운대해수욕장 저장"]').trigger('click')
    await flushPromises()
    expect(react).toHaveBeenCalledWith('KTO', '126508', 'SUPER_LIKE')
    expect(savePlace).toHaveBeenCalledWith('KTO', '126508')
    expect(wrapper.find('button[aria-label="해운대해수욕장 저장 취소"]').exists()).toBe(true)
  })

  it('loads the separate SUPER_LIKE tab and exposes retry on failure', async () => {
    getRecommendations.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [], page: { page: 0, size: 20, totalElements: 0, totalPages: 0, sort: [] } })
    const wrapper = mount(PlaceDiscoveryPanel, {
      props: { tripId: 'trip-1', bbox: '129,35,130,36' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('추천 장소를 불러오지 못했습니다')
    await wrapper.get('button[data-action="retry"]').trigger('click')
    await flushPromises()

    await wrapper.get('button[data-mode="super-like"]').trigger('click')
    await flushPromises()
    expect(getRecommendations).toHaveBeenLastCalledWith('trip-1', expect.objectContaining({ tab: 'SUPER_LIKE' }))
  })

  it('renders a real place image from photos when thumbnail is missing', async () => {
    getRecommendations.mockResolvedValueOnce({
      items: [{
        place: { ...place, photos: ['images/해운대/해운대_1.jpg'] },
        matchedMembers: [],
        rank: 1,
        distanceMeters: 120,
        recommendationReason: null,
      }],
      page: { page: 0, size: 20, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mount(PlaceDiscoveryPanel, {
      props: { tripId: 'trip-1', bbox: '129,35,130,36' },
    })
    await flushPromises()

    expect(wrapper.get('.discovery-thumb img').attributes('src')).toBe('/images/해운대/해운대_1.jpg')
  })
})
