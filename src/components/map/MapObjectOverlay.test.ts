import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import MapObjectOverlay from './MapObjectOverlay.vue'
import type { MapDrawing } from '@/types/itinerary'

const object: MapDrawing = {
  id: 'drawing-1',
  itineraryDayId: null,
  drawingType: 'STICKER',
  geometryFormat: 'GEOJSON',
  geometry: { type: 'Point', coordinates: [127, 37] },
  style: null,
  label: '좋아요',
  mediaFileId: null,
  stickerCode: 'HEART',
  transform: { centerLng: 127, centerLat: 37, widthMeters: 1000, heightMeters: 1000, rotationDeg: 0 },
  sortOrder: 0,
  version: 0,
}

const baseProps = {
  objects: [object],
  imageUrls: {},
  locks: {},
  cursors: [],
  currentClientId: 'session-1',
  selectedId: null,
  placementMode: false,
  projectionRevision: 0,
  project: ({ lng, lat }: { lng: number; lat: number }) => ({ x: 100 + (lng - 127) * 10_000, y: 100 - (lat - 37) * 10_000 }),
  unproject: ({ x, y }: { x: number; y: number }) => ({ lng: 127 + (x - 100) / 10_000, lat: 37 - (y - 100) / 10_000 }),
}

async function dispatchPointer(element: Element, type: string, options: MouseEventInit & { pointerId: number }) {
  const event = new MouseEvent(type, options)
  Object.defineProperty(event, 'pointerId', { value: options.pointerId })
  element.dispatchEvent(event)
  await nextTick()
}

describe('MapObjectOverlay', () => {
  it('renders sticker with a world-coordinate projection matrix', () => {
    const wrapper = mount(MapObjectOverlay, { props: baseProps })

    expect(wrapper.find('.map-object > g').attributes('transform')).toMatch(/^matrix\(/)
    expect(wrapper.find('use').attributes('href')).toContain('#heart')
  })

  it('converts map placement to a meter transform and emits it', async () => {
    const wrapper = mount(MapObjectOverlay, { props: { ...baseProps, placementMode: true } })
    Object.defineProperty(wrapper.find('svg').element, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    })

    await dispatchPointer(wrapper.find('svg').element, 'pointerdown', { button: 0, pointerId: 1, clientX: 200, clientY: 200 })

    const transform = wrapper.emitted('place')?.[0]?.[0] as { widthMeters: number; heightMeters: number }
    expect(transform.widthMeters).toBeGreaterThan(0)
    expect(transform.heightMeters).toBeGreaterThan(0)
  })

  it('does not start editing an object locked by another user', async () => {
    const wrapper = mount(MapObjectOverlay, {
      props: {
        ...baseProps,
        locks: {
          'drawing-1': {
            drawingId: 'drawing-1', userId: 'user-2', clientId: 'session-2', expiresAt: '2026-08-24T00:00:15Z',
          },
        },
      },
    })

    await dispatchPointer(wrapper.find('.map-object > g').element, 'pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 })

    expect(wrapper.emitted('editStart')).toBeUndefined()
  })

  it('moves an object by unprojecting the pointer delta', async () => {
    const wrapper = mount(MapObjectOverlay, { props: baseProps })
    const surface = wrapper.find('svg').element
    Object.defineProperty(surface, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0 }) })

    await dispatchPointer(wrapper.find('.map-object > g').element, 'pointerdown', { button: 0, pointerId: 2, clientX: 100, clientY: 100 })
    await dispatchPointer(surface, 'pointermove', { button: 0, pointerId: 2, clientX: 110, clientY: 100 })
    await dispatchPointer(surface, 'pointerup', { button: 0, pointerId: 2, clientX: 110, clientY: 100 })

    const transform = wrapper.emitted('change')?.[0]?.[1] as { centerLng: number }
    expect(transform.centerLng).toBeCloseTo(127.001)
  })

  it('resizes and rotates a selected object with screen-space handles', async () => {
    const resizeWrapper = mount(MapObjectOverlay, { props: { ...baseProps, selectedId: 'drawing-1' } })
    const resizeSurface = resizeWrapper.find('svg').element
    Object.defineProperty(resizeSurface, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0 }) })
    const resizeHandle = resizeWrapper.find('.map-object-handle')
    const startX = Number(resizeHandle.attributes('cx'))
    const startY = Number(resizeHandle.attributes('cy'))
    await dispatchPointer(resizeHandle.element, 'pointerdown', { button: 0, pointerId: 3, clientX: startX, clientY: startY })
    await dispatchPointer(resizeSurface, 'pointerup', {
      button: 0,
      pointerId: 3,
      clientX: 100 + (startX - 100) * 1.5,
      clientY: 100 + (startY - 100) * 1.5,
    })
    const resized = resizeWrapper.emitted('change')?.[0]?.[1] as { widthMeters: number }
    expect(resized.widthMeters).toBeGreaterThan(1000)

    const rotateWrapper = mount(MapObjectOverlay, { props: { ...baseProps, selectedId: 'drawing-1' } })
    const rotateSurface = rotateWrapper.find('svg').element
    Object.defineProperty(rotateSurface, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0 }) })
    const rotateHandle = rotateWrapper.find('.map-object-rotation-handle')
    const rotateX = Number(rotateHandle.attributes('cx'))
    const rotateY = Number(rotateHandle.attributes('cy'))
    const radius = Math.hypot(rotateX - 100, rotateY - 100)
    await dispatchPointer(rotateHandle.element, 'pointerdown', { button: 0, pointerId: 4, clientX: rotateX, clientY: rotateY })
    await dispatchPointer(rotateSurface, 'pointerup', { button: 0, pointerId: 4, clientX: 100 + radius, clientY: 100 })
    const rotated = rotateWrapper.emitted('change')?.[0]?.[1] as { rotationDeg: number }
    expect(Math.abs(rotated.rotationDeg)).toBeGreaterThan(45)
  })
})
