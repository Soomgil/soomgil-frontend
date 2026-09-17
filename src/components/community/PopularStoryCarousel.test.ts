import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PopularStoryCarousel from './PopularStoryCarousel.vue'

const stories = ['바다', '하늘', '숲'].map((title, i) => ({ id: String(i), title, summary: `${title} 여행 이야기`, image: `/photo-${i}.jpg`, author: '여행자', authorProfileImageUrl: null, avatar: '여', likes: 3, comments: 1 }))
afterEach(() => vi.useRealTimers())
describe('PopularStoryCarousel', () => {
  it('shows one photo with its summary, wraps navigation and opens the selected story', async () => {
    const wrapper = mount(PopularStoryCarousel, { props: { stories, fallbackImage: '/fallback.jpg' } })
    expect(wrapper.findAll('.featured-polaroid')).toHaveLength(1)
    await wrapper.get('[aria-label="이전 인기 게시물"]').trigger('click')
    expect(wrapper.get('h3').text()).toBe('숲')
    expect(wrapper.get('.featured-summary').text()).toBe('숲 여행 이야기')
    await wrapper.get('[aria-label="다음 인기 게시물"]').trigger('click')
    await wrapper.get('.read-story').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['0']])
    wrapper.unmount()
  })
  it('autoplays, pauses on hover and keyboard focus, and allows explicit resume', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PopularStoryCarousel, { props: { stories, fallbackImage: '' } })
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.get('h3').text()).toBe('하늘')
    await wrapper.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.get('h3').text()).toBe('하늘')
    await wrapper.trigger('mouseleave')
    await wrapper.trigger('focusin')
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.get('h3').text()).toBe('하늘')
    await wrapper.get('[aria-label="자동재생 시작"]').trigger('click')
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.get('h3').text()).toBe('숲')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
