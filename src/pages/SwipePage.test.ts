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
    description: '장수역의 역사와 지역 이야기를 전시로 만날 수 있는 공간입니다. '.repeat(8),
    accessibility: {
      openingHours: '09:00~18:00',
      closedDays: null,
      parkingType: 'FREE',
      flags: ['WHEELCHAIR', 'STROLLER'],
    },
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
    expect(wrapper.text()).toContain('09:00~18:00')
    expect(wrapper.text()).toContain('무료')
    expect(wrapper.text()).toContain('휠체어')
    expect(wrapper.text()).toContain('유모차')
    expect(wrapper.text()).toContain('장소 이야기')
    expect(wrapper.find('button[aria-label="LIKE"]').exists()).toBe(false)

    const descriptionToggle = wrapper.get('.place-description-toggle')
    expect(descriptionToggle.attributes('aria-expanded')).toBe('false')
    await descriptionToggle.trigger('click')
    expect(descriptionToggle.attributes('aria-expanded')).toBe('true')
    expect(descriptionToggle.text()).toContain('접기')

    const swipeCard = wrapper.get('.swipe-card')
    swipeCard.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, button: 0, bubbles: true }))
    swipeCard.element.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 0, bubbles: true }))
    swipeCard.element.dispatchEvent(new MouseEvent('pointerup', { clientX: 120, clientY: 0, bubbles: true }))
    await flushPromises()
    expect(react).toHaveBeenCalledWith('KTO', '126508', 'LIKE')

    await vi.runAllTimersAsync()
    expect(wrapper.text()).toContain('취향 수집 완료')

    await wrapper.get('a').trigger('click')
    expect(push).toHaveBeenCalledWith('/my-trips')
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
