import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
    document.querySelectorAll('[data-tour-section]').forEach(target => target.remove())
    vi.unstubAllGlobals()
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

  it('highlights only the visible toolbox and describes the map management controls', async () => {
    const tools = document.querySelector<HTMLElement>('[data-tour-section="map-tools"]')!
    const viewport = document.createElement('div')
    viewport.className = 'map-tools-viewport'
    viewport.getBoundingClientRect = () => new DOMRect(100, 590, 420, 102)
    tools.className = 'map-tools'
    tools.getBoundingClientRect = () => new DOMRect(140, 638, 520, 54)
    viewport.appendChild(tools)
    document.body.appendChild(viewport)

    const wrapper = mount(MapSectionTour, {
      props: { userId: 'user-2' },
      attachTo: document.body,
    })
    await wrapper.vm.start()
    document.body.querySelector<HTMLButtonElement>('.map-tour-next')?.click()
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.map-tour-next')?.click()
    await flushPromises()

    const spotlight = document.body.querySelector<HTMLElement>('.map-tour-spotlight')!
    expect(spotlight.style.top).toBe('630px')
    expect(spotlight.style.left).toBe('132px')
    expect(spotlight.style.width).toBe('396px')
    expect(spotlight.style.height).toBe('70px')

    document.body.querySelector<HTMLButtonElement>('.map-tour-next')?.click()
    await flushPromises()
    expect(document.body.querySelector('.map-tour-card')?.textContent).toContain('취향 보기')
    expect(document.body.querySelector('.map-tour-card')?.textContent).toContain('주변 여행지')
    expect(document.body.querySelector('.map-tour-card')?.textContent).toContain('지도 테마')
    wrapper.unmount()
    viewport.remove()
  })
})
