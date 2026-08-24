import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapboxItineraryMap from './MapboxItineraryMap.vue'
import type { ItineraryMapStop } from './MapboxItineraryMap.vue'
import MapDrawingOverlay from './MapDrawingOverlay.vue'
import { useTheme } from '@/composables/useTheme'

const mapbox = vi.hoisted(() => {
  const handlers = new Map<string, () => void>()
  const map = {
    addControl: vi.fn(),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    cameraForBounds: vi.fn(() => ({ center: [127.385, 36.355], zoom: 14 })),
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    getLayer: vi.fn(),
    getSource: vi.fn(),
    panBy: vi.fn(),
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng, y: lat })),
    unproject: vi.fn(([x, y]: [number, number]) => ({ lng: x, lat: y })),
    getBounds: vi.fn(() => ({
      getWest: () => 126.9,
      getSouth: () => 37.4,
      getEast: () => 127.2,
      getNorth: () => 37.7,
    })),
    getZoom: vi.fn(() => 12),
    on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
    once: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
    remove: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    resize: vi.fn(),
    setStyle: vi.fn(),
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

const stops: ItineraryMapStop[] = [
  {
    id: 'item-1',
    placeId: 'place-1',
    title: '첫 장소',
    dayIndex: 1,
    index: 1,
    lat: 36.35,
    lng: 127.38,
    image: 'https://images.example.test/place.jpg',
    accessibility: {
      openingHours: null,
      closedDays: null,
      parkingType: 'UNKNOWN',
      flags: ['WHEELCHAIR', 'PET'],
      unavailableFlags: [],
    },
  },
  { id: 'item-2', placeId: 'place-2', title: '둘째 장소', dayIndex: 1, index: 2, lat: 36.36, lng: 127.39 },
]
const routes = [{
	id: 'route-1',
  originItineraryItemId: 'item-1',
  destinationItineraryItemId: 'item-2',
	geometry: { type: 'LineString', coordinates: [[127.38, 36.35], [127.39, 36.36]] },
}]

describe('MapboxItineraryMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapbox.handlers.clear()
    const { isDarkMode, toggleTheme } = useTheme()
    if (isDarkMode.value) toggleTheme()
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
	const wrapper = mount(MapboxItineraryMap, { props: { stops, routes } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    mapbox.handlers.get('idle')?.()
    await nextTick()

    expect(mapbox.Map).toHaveBeenCalledOnce()
    expect(mapbox.map.addControl).toHaveBeenCalledWith(expect.any(Object), 'top-right')
    expect(mapbox.Marker).toHaveBeenCalledTimes(2)
    expect(mapbox.Marker).toHaveBeenNthCalledWith(1, expect.objectContaining({
      anchor: 'bottom',
      offset: [0, -10],
    }))
	expect(mapbox.map.addSource).toHaveBeenCalledWith('itinerary-route-route-1', expect.objectContaining({ type: 'geojson' }))
    expect(mapbox.map.addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'itinerary-route-route-1',
      type: 'line',
      paint: expect.objectContaining({ 'line-color': '#0066ff' }),
    }))
    expect(mapbox.map.cameraForBounds).toHaveBeenCalledOnce()
    expect(wrapper.emitted('viewportChange')).toEqual([[
      { minLng: 126.9, minLat: 37.4, maxLng: 127.2, maxLat: 37.7 },
    ]])

    mapbox.handlers.get('moveend')?.()
    expect(wrapper.emitted('viewportChange')).toHaveLength(1)

    await wrapper.setProps({ stops: [stops[0]] })
    expect(mapbox.marker.remove).toHaveBeenCalledTimes(2)
    expect(mapbox.Marker).toHaveBeenCalledTimes(3)
    expect(mapbox.map.easeTo).toHaveBeenCalledWith({ center: [127.38, 36.35], zoom: 11 })

    const markerCall = mapbox.Marker.mock.calls[0]
    const markerElement = (markerCall![0] as { element: HTMLButtonElement }).element
    expect(markerElement.style.position).toBe('absolute')
    expect((markerElement.querySelector('.map-pin-img') as HTMLImageElement)?.src).toBe('https://images.example.test/place.jpg')
    expect(getComputedStyle(markerElement.querySelector('.map-pin-info')!).display).toBe('block')
    expect(markerElement.querySelector('.map-pin-accessibility')?.getAttribute('aria-label')).toBe('접근성: 휠체어, 반려동물')
    markerElement.click()
    await nextTick()
    expect(wrapper.emitted('selectPlace')).toEqual([[undefined, 'place-1', 'item-1']])
  })

  it('경로 표시 변경만으로 지도 viewport를 다시 맞추지 않는다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const wrapper = mount(MapboxItineraryMap, { props: { stops, routes: [] } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()
    expect(mapbox.map.cameraForBounds).toHaveBeenCalledTimes(1)
    const cameraFitCallCount = mapbox.map.cameraForBounds.mock.calls.length
    const easeToCallCount = mapbox.map.easeTo.mock.calls.length

    await wrapper.setProps({ routes })

    expect(mapbox.map.cameraForBounds).toHaveBeenCalledTimes(cameraFitCallCount)
    expect(mapbox.map.easeTo).toHaveBeenCalledTimes(easeToCallCount)
    expect(mapbox.map.addSource).toHaveBeenCalledWith('itinerary-route-route-1', expect.objectContaining({ type: 'geojson' }))
  })

  it('route geometry가 도로 스냅 좌표에서 끝나도 실제 일정 마커 좌표까지 선을 잇는다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    mount(MapboxItineraryMap, {
      props: {
        stops,
        routes: [{
          id: 'route-snapped',
          originItineraryItemId: 'item-1',
          destinationItineraryItemId: 'item-2',
          geometry: { type: 'LineString', coordinates: [[127.381, 36.351], [127.388, 36.358]] },
        }],
      },
    })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()

    expect(mapbox.map.addSource).toHaveBeenCalledWith('itinerary-route-route-snapped', {
      type: 'geojson',
      data: expect.objectContaining({
        geometry: {
          type: 'LineString',
          coordinates: [
            [127.38, 36.35],
            [127.381, 36.351],
            [127.388, 36.358],
            [127.39, 36.36],
          ],
        },
      }),
    })
  })

  it('겹치는 주변 장소 마커를 분산하고 클릭한 장소 ID를 그대로 전달한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const nearbyPlaces = [
      { id: 'KTO:near-1', provider: 'KTO' as const, externalPlaceId: 'near-1', title: '창덕궁', category: null, lat: 37.58, lng: 126.99, dayIndex: 2 },
      { id: 'KTO:near-2', provider: 'KTO' as const, externalPlaceId: 'near-2', title: '창경궁', category: null, lat: 37.58, lng: 126.99, dayIndex: 2 },
    ]
    const wrapper = mount(MapboxItineraryMap, { props: { stops: [], nearbyPlaces } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()

    const firstOptions = mapbox.Marker.mock.calls[0]![0] as { element: HTMLButtonElement; offset: [number, number] }
    const secondOptions = mapbox.Marker.mock.calls[1]![0] as { element: HTMLButtonElement; offset: [number, number] }
    expect(firstOptions.element.tagName).toBe('BUTTON')
    expect(firstOptions.element.classList.contains('day-color-2')).toBe(true)
    expect(firstOptions.offset).not.toEqual(secondOptions.offset)

    secondOptions.element.click()
    expect(wrapper.emitted('selectNearbyPlace')).toEqual([['KTO', 'near-2']])
  })

  it('선택된 추천 관광지를 카드 마커로 표시하고 해당 위치로 이동한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const previewPlace = {
      id: 'recommendation:KTO:pick-1',
      provider: 'KTO',
      externalPlaceId: 'pick-1',
      title: '추천 명소',
      category: '관광지',
      lat: 35.1587,
      lng: 129.1604,
      dayIndex: 3,
      image: 'https://cdn.example.com/pick.jpg',
    }
    const wrapper = mount(MapboxItineraryMap, { props: { stops: [], previewPlace } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()

    const markerOptions = mapbox.Marker.mock.calls[0]![0] as { element: HTMLButtonElement; offset: [number, number] }
    expect(markerOptions.element.classList.contains('map-preview-place-card')).toBe(true)
    expect(markerOptions.element.classList.contains('day-color-3')).toBe(true)
    expect(markerOptions.element.textContent).toContain('추천 명소')
    expect((markerOptions.element.querySelector('img') as HTMLImageElement).src).toBe('https://cdn.example.com/pick.jpg')
    expect(mapbox.map.easeTo).toHaveBeenLastCalledWith({ center: [129.1604, 35.1587], zoom: 14 })

    markerOptions.element.click()
    expect(wrapper.emitted('selectNearbyPlace')).toEqual([['KTO', 'pick-1']])
  })

  it('경로 펜 전환과 카드 축소는 지도 스타일을 다시 로드하지 않고 마커만 갱신한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const wrapper = mount(MapboxItineraryMap, { props: { stops, drawingTool: 'cursor', cardDisplay: 'full' } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()
    mapbox.map.setStyle = vi.fn()

    await wrapper.setProps({ drawingTool: 'route-pen', cardDisplay: 'min' })
    await nextTick()

    expect(mapbox.map.setStyle).not.toHaveBeenCalled()
    const markerCall = mapbox.Marker.mock.calls.at(-1)
    const markerElement = (markerCall![0] as { element: HTMLButtonElement }).element
    expect(markerElement.classList.contains('map-pin-card--min')).toBe(true)
  })

  it('navigation mode를 켜면 Mapbox navigation day 스타일로 전환한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const wrapper = mount(MapboxItineraryMap, { props: { stops, navigationMode: false } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()
    mapbox.map.setStyle = vi.fn()

    await wrapper.setProps({ navigationMode: true })
    await nextTick()

    expect(mapbox.map.setStyle).toHaveBeenCalledWith('mapbox://styles/mapbox/navigation-day-v1')
  })

  it('일반 모드에서 헤더 다크모드 토글이 지도 스타일을 Mapbox dark 스타일로 전환한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    mount(MapboxItineraryMap, { props: { stops, navigationMode: false } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()
    expect(mapbox.Map).toHaveBeenCalledWith(expect.objectContaining({
      style: 'mapbox://styles/mapbox/light-v11',
    }))
    mapbox.map.setStyle = vi.fn()

    const { toggleTheme } = useTheme()
    toggleTheme()
    await nextTick()

    expect(mapbox.map.setStyle).toHaveBeenCalledWith('mapbox://styles/mapbox/dark-v11')
  })

  it('경로 그리기 모드에서 헤더 다크모드 토글이 지도 스타일을 Mapbox navigation night 스타일로 전환한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    mount(MapboxItineraryMap, { props: { stops, navigationMode: true } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()
    mapbox.map.setStyle = vi.fn()

    const { toggleTheme } = useTheme()
    toggleTheme()
    await nextTick()

    expect(mapbox.map.setStyle).toHaveBeenCalledWith('mapbox://styles/mapbox/navigation-night-v1')
  })

  it('지도 스타일 로딩 중 다크모드로 바뀌어도 load 후 경로 그리기용 night 스타일로 보정한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    mount(MapboxItineraryMap, { props: { stops, navigationMode: true } })
    await flushPromises()

    const { toggleTheme } = useTheme()
    toggleTheme()
    await nextTick()
    mapbox.handlers.get('style.load')?.()

    expect(mapbox.map.setStyle).toHaveBeenCalledWith('mapbox://styles/mapbox/navigation-night-v1')
  })

  it('standard view를 켜면 Mapbox Standard 스타일과 3D 카메라로 전환한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const wrapper = mount(MapboxItineraryMap, { props: { stops, standardView: false } })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()
    mapbox.map.setStyle = vi.fn()
    mapbox.map.easeTo = vi.fn()

    await wrapper.setProps({ standardView: true })
    await nextTick()

    expect(mapbox.map.setStyle).toHaveBeenCalledWith('mapbox://styles/mapbox/standard')
    expect(mapbox.map.easeTo).toHaveBeenCalledWith({
      pitch: 60,
      bearing: -20,
      duration: 500,
    })
  })

  it('경로선 색상을 출발 일정의 일차 색상으로 그린다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    mount(MapboxItineraryMap, {
      props: {
        stops: [
          { ...stops[0], id: 'day-2-origin', dayIndex: 2 },
          { ...stops[1], id: 'day-2-destination', dayIndex: 2 },
        ],
        routes: [{
          id: 'day-2-route',
          originItineraryItemId: 'day-2-origin',
          destinationItineraryItemId: 'day-2-destination',
          geometry: { type: 'LineString', coordinates: [[127.38, 36.35], [127.39, 36.36]] },
        }],
      },
    })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()

    expect(mapbox.map.addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'itinerary-route-day-2-route',
      paint: expect.objectContaining({ 'line-color': '#3b82f6' }),
    }))
  })

  it('경로 geometry 좌표 객체 배열도 GeoJSON 선으로 정규화해 그린다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    mount(MapboxItineraryMap, {
      props: {
        stops,
        routes: [{
          id: 'route-object-coordinates',
          geometry: {
            type: 'LineString',
            coordinates: [{ lng: 127.38, lat: 36.35 }, { lng: 127.39, lat: 36.36 }],
          },
        }],
      },
    })
    await flushPromises()
    mapbox.handlers.get('style.load')?.()
    await nextTick()

    expect(mapbox.map.addSource).toHaveBeenCalledWith('itinerary-route-route-object-coordinates', {
      type: 'geojson',
      data: expect.objectContaining({
        geometry: {
          type: 'LineString',
          coordinates: [[127.38, 36.35], [127.39, 36.36]],
        },
      }),
    })
    expect(mapbox.map.addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'itinerary-route-route-object-coordinates',
      type: 'line',
    }))
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

    mapbox.handlers.get('style.load')?.()
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
    mapbox.handlers.get('style.load')?.()
    await nextTick()

    const overlay = wrapper.getComponent(MapDrawingOverlay)
    expect(overlay.props('drawings')).toEqual([drawing])
    expect(overlay.props('tool')).toBe('pen')
    expect(overlay.props('project')({ lng: 127.38, lat: 36.35 })).toEqual({ x: 127.38, y: 36.35 })

    const draft = { coordinates: drawing.coordinates, color: drawing.color, width: drawing.width }
    const preview = { previewId: 'preview-1', sequence: 1, phase: 'UPDATE', ...draft }
    overlay.vm.$emit('create', draft)
    overlay.vm.$emit('erase', drawing.id)
    overlay.vm.$emit('preview', preview)
    overlay.vm.$emit('routePoint', { lng: 127.4, lat: 36.4 })
    overlay.vm.$emit('pan', { x: 12, y: -8 })
    await nextTick()

    expect(wrapper.emitted('drawingCreate')).toEqual([[draft]])
    expect(wrapper.emitted('drawingErase')).toEqual([[drawing.id]])
    expect(wrapper.emitted('drawingPreview')).toEqual([[preview]])
    expect(wrapper.emitted('routePoint')).toEqual([[{ lng: 127.4, lat: 36.4 }]])
    expect(mapbox.map.panBy).toHaveBeenCalledWith([-12, 8], { duration: 0 })
  })

  it('route-pen에서는 지도 그림 표시가 꺼져도 중간점 클릭 레이어를 활성화한다', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token')
    const wrapper = mount(MapboxItineraryMap, {
      props: { stops: [], drawingTool: 'route-pen', drawingsVisible: false },
    })
    await flushPromises()

    expect(wrapper.getComponent(MapDrawingOverlay).props('enabled')).toBe(true)
    expect(wrapper.getComponent(MapDrawingOverlay).props('drawingsVisible')).toBe(false)
  })
})
