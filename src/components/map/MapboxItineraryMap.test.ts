import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapboxItineraryMap from './MapboxItineraryMap.vue'

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
    on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
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
    await nextTick()

    expect(mapbox.Map).toHaveBeenCalledOnce()
    expect(mapbox.Marker).toHaveBeenCalledTimes(2)
    expect(mapbox.map.addSource).toHaveBeenCalledWith('itinerary-day-1', expect.objectContaining({ type: 'geojson' }))
    expect(mapbox.map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'itinerary-day-1', type: 'line' }))
    expect(mapbox.map.fitBounds).toHaveBeenCalledOnce()

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
})
