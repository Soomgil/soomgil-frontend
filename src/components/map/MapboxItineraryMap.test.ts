import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapboxItineraryMap from './MapboxItineraryMap.vue'
import MapDrawingOverlay from './MapDrawingOverlay.vue'

const mapbox = vi.hoisted(() => {
  const handlers = new Map<string, () => void>()
  const map = {
    addControl: vi.fn(),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    getLayer: vi.fn(),
    getSource: vi.fn(),
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng, y: lat })),
    unproject: vi.fn(([x, y]: [number, number]) => ({ lng: x, lat: y })),
    getBounds: vi.fn(() => ({
      getWest: () => 126.9,
      getSouth: () => 37.4,
      getEast: () => 127.2,
      getNorth: () => 37.7,
    })),
    on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
    once: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
    remove: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    resize: vi.fn(),
  }
  const marker = {
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    setLngLat: vi.fn().mockReturnThis(),
  }
  return {
    handlers,
    map,
    marker,
    Map: vi.fn(function Map() { return map }),
    Marker: vi.fn(function Marker(_options: unknown) { return marker }),
    NavigationControl: vi.fn(function NavigationControl() {}),
    LngLatBounds: vi.fn(function LngLatBounds() { return { extend: vi.fn().mockReturnThis() } }),
  }
})

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: mapbox.Map,
    Marker: mapbox.Marker,
    NavigationControl: mapbox.NavigationControl,
    LngLatBounds: mapbox.LngLatBounds,
  },
}))

const stops = [
  { id: 'item-1', placeId: 'place-1', title: '첫 장소', dayIndex: 1, index: 1, lat: 36.35, lng: 127.38 },
  { id: 'item-2', placeId: 'place-2', title: '둘째 장소', dayIndex: 1, index: 2, lat: 36.36, lng: 127.39 },
]

describe('MapboxItineraryMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapbox.handlers.clear()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('access token이 없으면 재시도할 수 없는 설정 오류를 표시한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')

    const wrapper = mount(MapboxItineraryMap, { props: { stops: [] } })
    await nextTick()

    expect(wrapper.get('[role="alert"]').text()).toContain('Mapbox access token')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(mapbox.Map).not.toHaveBeenCalled()
  })

  it('일정 좌표로 마커와 경로선을 그리고 변경된 좌표도 즉시 반영한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const wrapper = mount(MapboxItineraryMap, { props: { stops } })
    await flushPromises()
    mapbox.handlers.get('load')?.()
    mapbox.handlers.get('idle')?.()
    await nextTick()

    expect(mapbox.Map).toHaveBeenCalledOnce()
    expect(mapbox.Marker).toHaveBeenCalledTimes(2)
    expect(mapbox.map.addSource).toHaveBeenCalledWith('itinerary-day-1', expect.objectContaining({ type: 'geojson' }))
    expect(mapbox.map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'itinerary-day-1', type: 'line' }))
    expect(mapbox.map.fitBounds).toHaveBeenCalledOnce()
    expect(wrapper.emitted('viewportChange')).toEqual([[
      { minLng: 126.9, minLat: 37.4, maxLng: 127.2, maxLat: 37.7 },
    ]])

    mapbox.handlers.get('moveend')?.()
    expect(wrapper.emitted('viewportChange')).toHaveLength(1)

    await wrapper.setProps({ stops: [stops[0]] })
    expect(mapbox.marker.remove).toHaveBeenCalledTimes(2)
    expect(mapbox.Marker).toHaveBeenCalledTimes(3)
    expect(mapbox.map.easeTo).toHaveBeenCalledWith({ center: [127.38, 36.35], zoom: 13 })

    const markerCall = mapbox.Marker.mock.calls[0]
    const markerElement = (markerCall![0] as { element: HTMLButtonElement }).element
    expect(getComputedStyle(markerElement.querySelector('.map-pin-info')!).display).toBe('block')
    markerElement.click()
    await nextTick()
    expect(wrapper.emitted('selectPlace')).toEqual([['place-1']])
  })

  it('초기 오류 후 load가 성공하면 오류를 해제하고 재시도 시 observer를 정리한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const observer = { observe: vi.fn(), disconnect: vi.fn() }
    vi.stubGlobal('ResizeObserver', vi.fn(function ResizeObserver() { return observer }))
    const wrapper = mount(MapboxItineraryMap, { props: { stops: [] } })
    await flushPromises()

    mapbox.handlers.get('error')?.()
    await nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('지도를 불러오지 못했습니다.')

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(mapbox.map.remove).toHaveBeenCalledOnce()
    expect(mapbox.Map).toHaveBeenCalledTimes(2)

    mapbox.handlers.get('load')?.()
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    mapbox.handlers.get('error')?.()
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    wrapper.unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(2)
    expect(mapbox.map.remove).toHaveBeenCalledTimes(2)
  })

  it('drawing overlay에 지도 좌표 변환과 drawing 이벤트를 연결한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const drawing = {
      id: 'drawing-1',
      coordinates: [{ lng: 127.38, lat: 36.35 }, { lng: 127.39, lat: 36.36 }],
      color: '#ef4444',
      width: 6,
    }
    const wrapper = mount(MapboxItineraryMap, {
      props: { stops: [], drawings: [drawing], drawingTool: 'pen' },
    })
    await flushPromises()
    mapbox.handlers.get('load')?.()
    await nextTick()

    const overlay = wrapper.getComponent(MapDrawingOverlay)
    expect(overlay.props('drawings')).toEqual([drawing])
    expect(overlay.props('tool')).toBe('pen')
    expect(overlay.props('project')({ lng: 127.38, lat: 36.35 })).toEqual({ x: 127.38, y: 36.35 })

    const draft = { coordinates: drawing.coordinates, color: drawing.color, width: drawing.width }
    overlay.vm.$emit('create', draft)
    overlay.vm.$emit('erase', drawing.id)
    await nextTick()

    expect(wrapper.emitted('drawingCreate')).toEqual([[draft]])
    expect(wrapper.emitted('drawingErase')).toEqual([[drawing.id]])
  })
})
