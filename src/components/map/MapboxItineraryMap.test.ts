import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapboxItineraryMap from './MapboxItineraryMap.vue'

const mapbox = vi.hoisted(() => {
  const map = {
    addControl: vi.fn(),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    getLayer: vi.fn(),
    getSource: vi.fn(),
    loaded: vi.fn(() => true),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'load') callback()
    }),
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

describe('MapboxItineraryMap', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('access token이 없으면 설정 오류와 재시도를 표시한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')

    const wrapper = mount(MapboxItineraryMap, { props: { stops: [] } })
    await nextTick()

    expect(wrapper.get('[role="alert"]').text()).toContain('Mapbox access token')
    expect(wrapper.get('button').text()).toBe('다시 시도')
    expect(mapbox.Map).not.toHaveBeenCalled()
  })

  it('일정 좌표로 마커와 일차별 경로선을 그리고 viewport를 맞춘다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const stops = [
      { id: 'item-1', placeId: 'place-1', title: '첫 장소', dayIndex: 1, index: 1, lat: 36.35, lng: 127.38 },
      { id: 'item-2', placeId: 'place-2', title: '둘째 장소', dayIndex: 1, index: 2, lat: 36.36, lng: 127.39 },
    ]

    const wrapper = mount(MapboxItineraryMap, { props: { stops } })
    await nextTick()

    expect(mapbox.Map).toHaveBeenCalledOnce()
    expect(mapbox.Marker).toHaveBeenCalledTimes(2)
    expect(mapbox.map.addSource).toHaveBeenCalledWith('itinerary-day-1', expect.objectContaining({ type: 'geojson' }))
    expect(mapbox.map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'itinerary-day-1', type: 'line' }))
    expect(mapbox.map.fitBounds).toHaveBeenCalledOnce()

    const markerCall = mapbox.Marker.mock.calls[0]
    expect(markerCall).toBeDefined()
    const markerElement = (markerCall![0] as { element: HTMLButtonElement }).element
    markerElement.click()
    await nextTick()
    expect(wrapper.emitted('selectPlace')).toEqual([['place-1']])
  })
})
