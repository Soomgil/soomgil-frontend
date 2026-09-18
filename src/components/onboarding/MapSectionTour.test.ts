import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapSectionTour from './MapSectionTour.vue'

describe('MapSectionTour', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    for (const section of ['itinerary', 'map', 'map-tools', 'trip-management', 'collaboration']) {
      const target = document.createElement('div')
      target.dataset.tourSection = section
      Object.defineProperty(target, 'offsetWidth', { value: 300 })
      Object.defineProperty(target, 'offsetHeight', { value: 200 })
      target.getBoundingClientRect = () => new DOMRect(20, 20, 300, 200)
      document.body.appendChild(target)
    }
  })

  it('walks through five map sections and remembers completion', async () => {
    const wrapper = mount(MapSectionTour, {
      props: { userId: 'user-1' },
      attachTo: document.body,
    })
    await wrapper.vm.start()

    expect(document.body.textContent).toContain('일차별 계획을 한눈에')
    for (let index = 0; index < 4; index += 1) {
      const button = document.body.querySelector<HTMLButtonElement>('.map-tour-next')
      button?.click()
      await wrapper.vm.$nextTick()
    }
    expect(document.body.textContent).toContain('함께 계획하는 모든 도구')

    document.body.querySelector<HTMLButtonElement>('.map-tour-next')?.click()
    await wrapper.vm.$nextTick()

    expect(localStorage.getItem('soomgil:map-section-tour:v1:user-1')).toBe('done')
    expect(document.body.querySelector('.map-tour')).toBeNull()
    wrapper.unmount()
  })
})
