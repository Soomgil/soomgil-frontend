import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getFeed, react, push } = vi.hoisted(() => ({
  getFeed: vi.fn(),
  react: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/api/swipe.api', () => ({ swipeApi: { getFeed, react } }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { tripId: 'trip-1' } }),
}))

import SwipePage from './SwipePage.vue'

const feedItem = {
  place: {
    provider: 'KTO',
    externalPlaceId: '126508',
    placeName: '해운대해수욕장',
    address: '부산 해운대구',
    lat: 35.1587,
    lng: 129.1604,
    thumbnailUrl: 'https://cdn.example.com/haeundae.jpg',
    category: 'ATTRACTION',
    sourceStatus: 'AVAILABLE',
  },
  myReaction: null,
  likedByFollowees: [],
}

describe('SwipePage', () => {
  beforeEach(() => {
    getFeed.mockReset()
    react.mockReset()
    push.mockReset()
  })

  it('loads a place, persists LIKE, and shows the completed state', async () => {
    vi.useFakeTimers()
    getFeed.mockResolvedValue({ items: [feedItem], nextSeed: null })
    react.mockResolvedValue({ reaction: 'LIKE', savedPlaceEligible: true })
    const wrapper = mount(SwipePage, {
      global: { stubs: { AppHeader: true } },
    })

    await flushPromises()
    expect(wrapper.text()).toContain('해운대해수욕장')

    await wrapper.get('button[aria-label="LIKE"]').trigger('click')
    await flushPromises()
    expect(react).toHaveBeenCalledWith('KTO', '126508', 'LIKE')

    await vi.runAllTimersAsync()
    expect(wrapper.text()).toContain('취향 수집 완료')
    vi.useRealTimers()
  })

  it('shows a retry action when feed loading fails', async () => {
    getFeed.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [], nextSeed: null })
    const wrapper = mount(SwipePage, {
      global: { stubs: { AppHeader: true } },
    })

    await flushPromises()
    expect(wrapper.text()).toContain('장소를 불러오지 못했습니다')

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(getFeed).toHaveBeenCalledTimes(2)
  })

  it('shows stable placeholders when place and friend images are missing', async () => {
    getFeed.mockResolvedValue({
      items: [{
        ...feedItem,
        place: { ...feedItem.place, thumbnailUrl: null },
        likedByFollowees: [{ id: 'friend-1', displayName: '지호', profileImageUrl: null }],
      }],
      nextSeed: null,
    })
    const wrapper = mount(SwipePage, {
      global: { stubs: { AppHeader: true } },
    })

    await flushPromises()

    expect(wrapper.get('.swipe-place-placeholder').text()).toContain('해운대해수욕장')
    expect(wrapper.get('.liked-by-avatar-fallback').text()).toBe('지')
    expect(wrapper.find('img[src=""]').exists()).toBe(false)
  })
})
