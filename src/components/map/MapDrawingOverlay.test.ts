import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import MapDrawingOverlay from './MapDrawingOverlay.vue'

const project = ({ lng, lat }: { lng: number; lat: number }) => ({ x: lng, y: lat })
const unproject = ({ x, y }: { x: number; y: number }) => ({ lng: x, lat: y })

async function dispatchPointer(
  element: Element,
  type: string,
  options: MouseEventInit & {
    pointerId: number
    coalescedEvents?: Array<Pick<MouseEvent, 'clientX' | 'clientY'>>
  },
) {
  const event = new MouseEvent(type, options)
  Object.defineProperty(event, 'pointerId', { value: options.pointerId })
  if (options.coalescedEvents) {
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => options.coalescedEvents })
  }
  element.dispatchEvent(event)
  await nextTick()
}

describe('MapDrawingOverlay', () => {
  it('포인터 이동을 지도 좌표 stroke로 변환한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'pen',
        color: '#ef4444',
        width: 6,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 })
    await dispatchPointer(surface.element, 'pointermove', { pointerId: 1, clientX: 20, clientY: 30 })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, clientX: 30, clientY: 40 })

    expect(wrapper.emitted('create')).toEqual([{
      coordinates: [
        { lng: 10, lat: 20 },
        { lng: 20, lat: 30 },
        { lng: 30, lat: 40 },
      ],
      color: '#ef4444',
      width: 6,
    }].map((drawing) => [drawing]))
    const previews = wrapper.emitted('preview')?.map(([event]) => event as { previewId: string; sequence: number; phase: string }) ?? []
    expect(previews.map(({ phase }) => phase)).toEqual(['UPDATE', 'UPDATE', 'END'])
    expect(previews.map(({ sequence }) => sequence)).toEqual([1, 2, 3])
    expect(new Set(previews.map(({ previewId }) => previewId)).size).toBe(1)
  })

  it('지우개로 선택한 stroke id를 전달한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [{
          id: 'drawing-1',
          coordinates: [{ lng: 10, lat: 20 }, { lng: 30, lat: 40 }],
          color: '#1f2937',
          width: 4,
        }],
        tool: 'eraser',
        color: '#1f2937',
        width: 4,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })

    const hitTarget = wrapper.get('.map-drawing-hit-target')
    expect(hitTarget.attributes('stroke-width')).toBe('24')
    await dispatchPointer(hitTarget.element, 'pointerdown', { pointerId: 1, button: 0 })

    expect(wrapper.emitted('erase')).toEqual([['drawing-1']])
  })

  it('경로 연결 펜은 클릭한 지도 좌표를 routePoint로 전달한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'route-pen',
        color: '#6d4aff',
        width: 5,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, clientX: 12, clientY: 22 })

    expect(wrapper.emitted('routePoint')).toEqual([[{ lng: 12, lat: 22 }]])
    expect(wrapper.emitted('create')).toBeUndefined()
  })

  it('경로 연결 펜에서 드래그는 중간점으로 처리하지 않는다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'route-pen',
        color: '#6d4aff',
        width: 5,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 })
    await dispatchPointer(surface.element, 'pointermove', { pointerId: 1, clientX: 30, clientY: 40 })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, clientX: 30, clientY: 40 })

    expect(wrapper.emitted('routePoint')).toBeUndefined()
    expect(wrapper.emitted('create')).toBeUndefined()
  })

  it('그리기 도구에서 우클릭 드래그는 stroke 대신 지도 이동 delta로 전달한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'pen',
        color: '#ef4444',
        width: 6,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 2, clientX: 10, clientY: 20 })
    await dispatchPointer(surface.element, 'pointermove', { pointerId: 1, button: 2, clientX: 25, clientY: 35 })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, button: 2, clientX: 25, clientY: 35 })

    expect(wrapper.emitted('pan')).toEqual([[{ x: 15, y: 15 }]])
    expect(wrapper.emitted('create')).toBeUndefined()
    expect(wrapper.emitted('routePoint')).toBeUndefined()
  })

  it('경로 연결 펜에서도 우클릭 드래그는 중간점 대신 지도 이동 delta로 전달한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'route-pen',
        color: '#6d4aff',
        width: 5,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 2, clientX: 30, clientY: 40 })
    await dispatchPointer(surface.element, 'pointermove', { pointerId: 1, button: 2, clientX: 20, clientY: 50 })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, button: 2, clientX: 20, clientY: 50 })

    expect(wrapper.emitted('pan')).toEqual([[{ x: -10, y: 10 }]])
    expect(wrapper.emitted('routePoint')).toBeUndefined()
    expect(wrapper.emitted('create')).toBeUndefined()
  })

  it('그리기 도구에서는 우클릭 컨텍스트 메뉴를 막는다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'pen',
        color: '#ef4444',
        width: 6,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const event = new MouseEvent('contextmenu', { cancelable: true })

    wrapper.get('svg').element.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
  })

  it('자유 그리기는 빠른 포인터 이동의 coalesced sample까지 stroke에 반영한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'pen',
        color: '#6d4aff',
        width: 5,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 })
    await dispatchPointer(surface.element, 'pointermove', {
      pointerId: 1,
      clientX: 50,
      clientY: 60,
      coalescedEvents: [
        { clientX: 20, clientY: 30 },
        { clientX: 35, clientY: 45 },
        { clientX: 50, clientY: 60 },
      ],
    })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, clientX: 70, clientY: 80 })

    expect(wrapper.emitted('create')?.[0]?.[0]).toEqual(expect.objectContaining({
      coordinates: [
        { lng: 10, lat: 20 },
        { lng: 20, lat: 30 },
        { lng: 35, lat: 45 },
        { lng: 50, lat: 60 },
        { lng: 70, lat: 80 },
      ],
    }))
  })

  it('포인터 캡처를 이미 잃은 경우에도 stroke를 정상 완료한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'pen',
        color: '#ef4444',
        width: 6,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })
    const releasePointerCapture = vi.fn()
    Object.defineProperties(surface.element, {
      hasPointerCapture: { value: vi.fn(() => false), configurable: true },
      releasePointerCapture: { value: releasePointerCapture, configurable: true },
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, clientX: 30, clientY: 40 })

    expect(releasePointerCapture).not.toHaveBeenCalled()
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('포인터 캡처가 사라져도 진행 중인 stroke를 완료한다', async () => {
    const wrapper = mount(MapDrawingOverlay, {
      props: {
        drawings: [],
        tool: 'pen',
        color: '#ef4444',
        width: 6,
        enabled: true,
        projectionRevision: 0,
        project,
        unproject,
      },
    })
    const surface = wrapper.get('svg')
    vi.spyOn(surface.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    await dispatchPointer(surface.element, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 20 })
    await dispatchPointer(surface.element, 'pointermove', { pointerId: 1, clientX: 20, clientY: 30 })
    expect(wrapper.find('.is-current').exists()).toBe(true)

    await dispatchPointer(surface.element, 'lostpointercapture', { pointerId: 1 })
    await dispatchPointer(surface.element, 'pointerup', { pointerId: 1, clientX: 30, clientY: 40 })

    expect(wrapper.find('.is-current').exists()).toBe(false)
    expect(wrapper.emitted('create')).toEqual([[
      {
        coordinates: [
          { lng: 10, lat: 20 },
          { lng: 20, lat: 30 },
        ],
        color: '#ef4444',
        width: 6,
      },
    ]])
    expect(wrapper.emitted('preview')?.at(-1)?.[0]).toEqual(expect.objectContaining({ phase: 'END' }))
  })
})
