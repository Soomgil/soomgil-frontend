import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SwipeIntroTour from './SwipeIntroTour.vue'

const STORAGE_KEY = 'soomgil:swipe-intro-tour:v1:user-1'
const q = (sel: string) => document.body.querySelector(sel)

describe('SwipeIntroTour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts after a short delay when ready and unseen, and walks steps to finish', async () => {
    const wrapper = mount(SwipeIntroTour, { props: { userId: 'user-1', ready: true } })
    // 아직 지연 전.
    expect(q('[data-testid="swipe-tour"]')).toBeNull()

    await vi.advanceTimersByTimeAsync(750)
    await flushPromises()
    expect(q('[data-testid="swipe-tour"]')).not.toBeNull()
    expect(document.body.textContent).toContain('이렇게 취향을 골라요')

    // 4단계까지 '다음'으로 진행.
    for (let i = 0; i < 3; i++) {
      ;(q('[data-testid="swipe-tour-next"]') as HTMLButtonElement).click()
      await flushPromises()
    }
    // 마지막 단계 버튼은 '시작하기'.
    expect((q('[data-testid="swipe-tour-next"]') as HTMLElement).textContent).toContain('시작하기')

    ;(q('[data-testid="swipe-tour-next"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(q('[data-testid="swipe-tour"]')).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('done')
    wrapper.unmount()
  })

  it('does not auto-start when already seen', async () => {
    localStorage.setItem(STORAGE_KEY, 'done')
    const wrapper = mount(SwipeIntroTour, { props: { userId: 'user-1', ready: true } })
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(q('[data-testid="swipe-tour"]')).toBeNull()
    wrapper.unmount()
  })

  it('does not auto-start until the page reports ready', async () => {
    const wrapper = mount(SwipeIntroTour, { props: { userId: 'user-1', ready: false } })
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(q('[data-testid="swipe-tour"]')).toBeNull()

    await wrapper.setProps({ ready: true })
    await vi.advanceTimersByTimeAsync(750)
    await flushPromises()
    expect(q('[data-testid="swipe-tour"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('can be reopened imperatively via the exposed start()', async () => {
    localStorage.setItem(STORAGE_KEY, 'done') // 자동 시작은 막힌 상태
    const wrapper = mount(SwipeIntroTour, { props: { userId: 'user-1', ready: true } })
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(q('[data-testid="swipe-tour"]')).toBeNull()

    ;(wrapper.vm as unknown as { start: () => void }).start()
    await flushPromises()
    expect(q('[data-testid="swipe-tour"]')).not.toBeNull()
    wrapper.unmount()
  })
})
