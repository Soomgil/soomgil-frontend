<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import MapDrawingOverlay from './MapDrawingOverlay.vue'
import type { MapDrawingDraft, MapDrawingStroke, MapDrawingTool } from './MapDrawingOverlay.vue'
import type { DrawingPreviewEvent } from '@/types/collaboration'
import type { LngLat, Viewport } from '@/types/geo'
import type { AccessibilityFlag, PlaceAccessibility } from '@/types/place'
import { useTheme } from '@/composables/useTheme'

export interface ItineraryMapNearbyPlace {
  id: string
  provider: string
  externalPlaceId: string
  title: string
  category: string | null
  lat: number
  lng: number
  image?: string | null
}

export interface ItineraryMapStop {
  id: string
  placeProvider?: string
  placeId?: string
  title: string
  dayIndex: number
  index: number
  lat: number
  lng: number
  image?: string | null
  accessibility?: PlaceAccessibility
}

export interface ItineraryMapRoute {
  id: string
  geometry: Record<string, unknown>
  originItineraryItemId?: string | null
  destinationItineraryItemId?: string | null
}

const props = withDefaults(defineProps<{
  stops: ItineraryMapStop[]
  routes?: ItineraryMapRoute[]
  routeDisplay?: 'route' | 'dashed' | 'hidden'
  cardDisplay?: 'full' | 'min' | 'hidden'
  nearbyPlaces?: ItineraryMapNearbyPlace[]
  previewPlace?: ItineraryMapNearbyPlace | null
  drawings?: MapDrawingStroke[]
  drawingTool?: MapDrawingTool
  drawingColor?: string
  drawingWidth?: number
  drawingsVisible?: boolean
  navigationMode?: boolean
  routeWaypoints?: LngLat[]
}>(), {
  drawings: () => [],
  routes: () => [],
  nearbyPlaces: () => [],
  previewPlace: null,
  routeDisplay: 'route',
  cardDisplay: 'full',
  drawingTool: 'cursor',
  drawingColor: '#1f2937',
  drawingWidth: 6,
  drawingsVisible: true,
  navigationMode: false,
  routeWaypoints: () => [],
})
const emit = defineEmits<{
  selectPlace: [placeProvider: string | undefined, placeId: string | undefined, stopId: string]
  selectNearbyPlace: [placeProvider: string, placeId: string]
  viewportChange: [viewport: Viewport]
  drawingCreate: [drawing: MapDrawingDraft]
  drawingErase: [drawingId: string]
  drawingPreview: [event: DrawingPreviewEvent]
  routePoint: [coordinate: LngLat]
}>()

const DEFAULT_CENTER: [number, number] = [127.3845, 36.3504]
const container = ref<HTMLElement | null>(null)
const mapError = ref('')
const canRetry = ref(false)
const projectionRevision = ref(0)
let mapboxgl: typeof import('mapbox-gl').default | null = null
let map: MapboxMap | null = null
let markers: MapboxMarker[] = []
let resizeObserver: ResizeObserver | null = null
let lineLayerIds: string[] = []
let styleReady = false
let appliedMapStyle = ''
let initializationSequence = 0
let lastEmittedViewport = ''
let lastFittedStopsKey = ''

const { isDarkMode } = useTheme()

const MAPBOX_STYLE_LIGHT = 'mapbox://styles/mapbox/light-v11'
const MAPBOX_STYLE_DARK = 'mapbox://styles/mapbox/dark-v11'

const mapStyle = computed(() => {
  if (isDarkMode.value) {
    return MAPBOX_STYLE_DARK
  }
  return MAPBOX_STYLE_LIGHT
})

function applyMapStyle(style: string) {
  if (!map || appliedMapStyle === style) return
  styleReady = false
  appliedMapStyle = style
  map.setStyle(style)
}

watch(mapStyle, applyMapStyle)

function dayClass(dayIndex: number) {
  return dayIndex <= 0 ? 'day-color-5' : `day-color-${((dayIndex - 1) % 5) + 1}`
}

const ACCESSIBILITY_MARKERS: Partial<Record<AccessibilityFlag, { icon: string; label: string }>> = {
  WHEELCHAIR: { icon: 'accessible', label: '휠체어' },
  PET: { icon: 'pets', label: '반려동물' },
  STROLLER: { icon: 'stroller', label: '유모차' },
}

function createMarkerElement(stop: ItineraryMapStop) {
  const marker = document.createElement('button')
  marker.type = 'button'
  // Mapbox positions the marker itself with translate(x, y). Keeping the
  // element out of normal document flow is essential for that projection.
  marker.style.position = 'absolute'
  marker.className = `map-pin-card map-pin-card--${props.cardDisplay} ${dayClass(stop.dayIndex)}`
  marker.setAttribute('aria-label', `${stop.title} 지도 위치`)

  const imageWrapper = document.createElement('span')
  imageWrapper.className = 'map-pin-img-wrapper'
  imageWrapper.style.display = 'block'
  if (stop.image) {
    const image = document.createElement('img')
    image.className = 'map-pin-img'
    image.src = stop.image
    image.alt = ''
    imageWrapper.appendChild(image)
  } else {
    const placeholder = document.createElement('span')
    placeholder.className = 'map-pin-icon-placeholder'
    const icon = document.createElement('span')
    icon.className = 'material-symbols-rounded'
    icon.textContent = 'location_on'
    placeholder.appendChild(icon)
    imageWrapper.appendChild(placeholder)
  }

  const info = document.createElement('span')
  info.className = 'map-pin-info'
  info.style.display = 'block'
  const title = document.createElement('span')
  title.className = 'map-pin-title'
  title.textContent = stop.title
  const day = document.createElement('span')
  day.className = 'map-pin-day-badge'
  day.textContent = stop.dayIndex <= 0 ? '일차 미정' : `${stop.dayIndex}일차`
  info.append(title, day)

  const supportedFlags = stop.accessibility?.flags.filter((flag) => ACCESSIBILITY_MARKERS[flag]) ?? []
  if (supportedFlags.length > 0) {
    const accessibility = document.createElement('span')
    accessibility.className = 'map-pin-accessibility'
    accessibility.setAttribute(
      'aria-label',
      `접근성: ${supportedFlags.map((flag) => ACCESSIBILITY_MARKERS[flag]!.label).join(', ')}`,
    )
    supportedFlags.forEach((flag) => {
      const markerInfo = ACCESSIBILITY_MARKERS[flag]!
      const icon = document.createElement('span')
      icon.className = 'material-symbols-rounded'
      icon.textContent = markerInfo.icon
      icon.title = markerInfo.label
      accessibility.appendChild(icon)
    })
    info.appendChild(accessibility)
  }

  const badge = document.createElement('span')
  badge.className = 'map-pin-badge'
  badge.textContent = String(stop.index)
  const pointer = document.createElement('span')
  pointer.className = 'map-pin-pointer'
  marker.append(imageWrapper, info, badge, pointer)
  marker.addEventListener('click', () => emit('selectPlace', stop.placeProvider, stop.placeId, stop.id))
  return marker
}

function createNearbyMarkerElement(place: ItineraryMapNearbyPlace): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'map-nearby-place-marker'
  el.setAttribute('aria-label', `${place.title} 주변 관광지`)

  const icon = document.createElement('span')
  icon.className = 'material-symbols-rounded'
  icon.textContent = 'explore'
  el.appendChild(icon)

  const label = document.createElement('span')
  label.className = 'map-nearby-place-label'
  label.textContent = place.title
  el.appendChild(label)

  el.addEventListener('click', (event) => {
    event.stopPropagation()
    emit('selectNearbyPlace', place.provider, place.externalPlaceId)
  })

  return el
}

function createPreviewPlaceMarkerElement(place: ItineraryMapNearbyPlace): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'map-preview-place-card'
  el.setAttribute('aria-label', `${place.title} 추천 관광지`)

  const media = document.createElement('span')
  media.className = 'map-preview-place-media'
  if (place.image) {
    const image = document.createElement('img')
    image.src = place.image
    image.alt = ''
    media.appendChild(image)
  } else {
    const icon = document.createElement('span')
    icon.className = 'material-symbols-rounded'
    icon.textContent = 'location_on'
    media.appendChild(icon)
  }

  const info = document.createElement('span')
  info.className = 'map-preview-place-info'
  const title = document.createElement('span')
  title.className = 'map-preview-place-title'
  title.textContent = place.title
  info.appendChild(title)
  if (place.category) {
    const category = document.createElement('span')
    category.className = 'map-preview-place-category'
    category.textContent = place.category
    info.appendChild(category)
  }

  const pointer = document.createElement('span')
  pointer.className = 'map-preview-place-pointer'
  el.append(media, info, pointer)
  el.addEventListener('click', (event) => {
    event.stopPropagation()
    emit('selectNearbyPlace', place.provider, place.externalPlaceId)
  })
  return el
}

function clearMapContent() {
  markers.forEach((marker) => marker.remove())
  markers = []
}

function clearRouteLayers() {
  if (!map || !styleReady) {
    lineLayerIds = []
    return
  }
  lineLayerIds.forEach((id) => {
    if (map?.getLayer(id)) map.removeLayer(id)
    if (map?.getSource(id)) map.removeSource(id)
  })
  lineLayerIds = []
}

function routeAnchorCoordinate(itemId?: string | null): [number, number] | null {
  if (!itemId) return null
  const stop = props.stops.find((candidate) => candidate.id === itemId)
  return stop ? [stop.lng, stop.lat] : null
}

function coordinateDistance(left: [number, number], right: [number, number]) {
  return Math.hypot(left[0] - right[0], left[1] - right[1])
}

function sameRouteCoordinate(left: [number, number], right: [number, number]) {
  return coordinateDistance(left, right) < 0.000001
}

function anchorRouteLine(route: ItineraryMapRoute, coordinates: [number, number][]) {
  const origin = routeAnchorCoordinate(route.originItineraryItemId)
  const destination = routeAnchorCoordinate(route.destinationItineraryItemId)
  if (!origin && !destination) return coordinates

  let anchored = [...coordinates]
  if (
    origin && destination && anchored.length >= 2
    && coordinateDistance(anchored[0], destination) < coordinateDistance(anchored[0], origin)
    && coordinateDistance(anchored[anchored.length - 1], origin) < coordinateDistance(anchored[anchored.length - 1], destination)
  ) {
    anchored = anchored.reverse()
  }

  if (origin && !sameRouteCoordinate(anchored[0], origin)) {
    anchored.unshift(origin)
  }
  if (destination && !sameRouteCoordinate(anchored[anchored.length - 1], destination)) {
    anchored.push(destination)
  }
  return anchored
}

function routeLineString(route: ItineraryMapRoute): { type: 'LineString'; coordinates: [number, number][] } | null {
  const geometry = route.geometry as { type?: unknown; geometry?: unknown; coordinates?: unknown }
  const candidate = (
    geometry.type === 'Feature' && typeof geometry.geometry === 'object' && geometry.geometry !== null
      ? geometry.geometry as { type?: unknown; coordinates?: unknown }
      : geometry
  )
  if (candidate.type !== 'LineString' || !Array.isArray(candidate.coordinates)) return null

  const coordinates = candidate.coordinates.flatMap((coordinate) => {
    if (Array.isArray(coordinate) && typeof coordinate[0] === 'number' && typeof coordinate[1] === 'number') {
      return [[coordinate[0], coordinate[1]] as [number, number]]
    }
    if (
      typeof coordinate === 'object' && coordinate !== null
      && typeof (coordinate as { lng?: unknown }).lng === 'number'
      && typeof (coordinate as { lat?: unknown }).lat === 'number'
    ) {
      return [[(coordinate as { lng: number }).lng, (coordinate as { lat: number }).lat] as [number, number]]
    }
    return []
  })

  if (coordinates.length < 2) return null
  const anchoredCoordinates = anchorRouteLine(route, coordinates)
  return anchoredCoordinates.length >= 2 ? { type: 'LineString', coordinates: anchoredCoordinates } : null
}

function renderRoutes() {
  if (!map || !styleReady) return
  clearRouteLayers()
  if (props.routeDisplay === 'hidden') return

  props.routes.forEach((route, index) => {
    const geometry = routeLineString(route)
    if (!geometry) return
    const id = `itinerary-route-${route.id}`
    map!.addSource(id, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: { routeIndex: index },
        geometry,
      },
    })
    map!.addLayer({
      id,
      type: 'line',
      source: id,
      paint: {
        'line-color': '#6d4aff',
        'line-width': 5,
        'line-opacity': 0.95,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    lineLayerIds.push(id)
  })
}

function renderStops() {
  if (!map || !mapboxgl || !styleReady) return
  const mapbox = mapboxgl
  clearMapContent()

  if (props.cardDisplay !== 'hidden') {
    props.stops.forEach((stop) => {
      markers.push(new mapbox.Marker({ element: createMarkerElement(stop), anchor: 'bottom', offset: [0, -10] })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map!))
    })
  }

  props.nearbyPlaces.forEach((place, index) => {
    const ring = Math.floor(index / 8)
    const angle = (index % 8) * (Math.PI / 4)
    const radius = 14 + ring * 8
    const offset: [number, number] = [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]
    markers.push(new mapbox.Marker({ element: createNearbyMarkerElement(place), anchor: 'bottom', offset })
      .setLngLat([place.lng, place.lat])
      .addTo(map!))
  })

  if (props.previewPlace) {
    markers.push(new mapbox.Marker({
      element: createPreviewPlaceMarkerElement(props.previewPlace),
      anchor: 'bottom',
      offset: [0, -18],
    })
      .setLngLat([props.previewPlace.lng, props.previewPlace.lat])
      .addTo(map!))
  }

  renderRoutes()
  fitToStopsIfNeeded(mapbox)
  focusPreviewPlace()
}

function fitToStopsIfNeeded(mapbox: typeof import('mapbox-gl').default) {
  if (!map) return
  const stopsKey = props.stops.map((stop) => `${stop.id}:${stop.lng}:${stop.lat}`).join('|')
  if (stopsKey === lastFittedStopsKey) return
  lastFittedStopsKey = stopsKey
  if (props.stops.length === 0) {
    return
  } else if (props.stops.length === 1) {
    map.easeTo({ center: [props.stops[0].lng, props.stops[0].lat], zoom: 11 })
  } else {
    const bounds = new mapbox.LngLatBounds()
    props.stops.forEach((stop) => bounds.extend([stop.lng, stop.lat]))
    const camera = map.cameraForBounds(bounds, { padding: 80, maxZoom: 14 })
    if (camera) {
      map.easeTo({
        ...camera,
        zoom: Math.max((camera.zoom ?? map.getZoom()) - 2, 0),
        duration: 500,
      })
    }
  }
}

function focusPreviewPlace() {
  if (!map || !props.previewPlace) return
  map.easeTo({ center: [props.previewPlace.lng, props.previewPlace.lat], zoom: 14 })
}

function emitViewport() {
  if (!map || !styleReady) return
  const bounds = map.getBounds()
  if (!bounds) return
  const viewport = {
    minLng: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLng: bounds.getEast(),
    maxLat: bounds.getNorth(),
  }
  const viewportKey = `${viewport.minLng},${viewport.minLat},${viewport.maxLng},${viewport.maxLat}`
  if (viewportKey === lastEmittedViewport) return
  lastEmittedViewport = viewportKey
  emit('viewportChange', viewport)
}

function updateDrawingProjection() {
  projectionRevision.value += 1
}

function projectDrawingCoordinate(coordinate: LngLat) {
  if (!map) return null
  const point = map.project([coordinate.lng, coordinate.lat])
  return { x: point.x, y: point.y }
}

function unprojectDrawingPoint(point: { x: number; y: number }) {
  if (!map) return null
  const coordinate = map.unproject([point.x, point.y])
  return { lng: coordinate.lng, lat: coordinate.lat }
}

function panMapByOverlayDelta(delta: { x: number; y: number }) {
  map?.panBy([-delta.x, -delta.y], { duration: 0 })
}

function zoomMapByOverlayWheel(payload: { point: { x: number; y: number }; deltaY: number }) {
  if (!map) return
  void payload.point
  const zoomDelta = Math.max(-1, Math.min(1, -payload.deltaY / 300))
  map.zoomTo(map.getZoom() + zoomDelta, { duration: 0 })
}

function cleanupMapResources() {
  resizeObserver?.disconnect()
  resizeObserver = null
  clearMapContent()
  clearRouteLayers()
  map?.remove()
  map = null
  styleReady = false
  appliedMapStyle = ''
  lastEmittedViewport = ''
  lastFittedStopsKey = ''
  updateDrawingProjection()
}

async function initializeMap() {
  if (!container.value) return
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim()
  if (!accessToken) {
    mapError.value = 'Mapbox access token이 설정되지 않았습니다.'
    canRetry.value = false
    return
  }

  const sequence = ++initializationSequence
  mapError.value = ''
  canRetry.value = false
  try {
    const module = await import('mapbox-gl')
    if (sequence !== initializationSequence || !container.value) return
    mapboxgl = module.default
    mapboxgl.accessToken = accessToken
    const createdMap = new mapboxgl.Map({
      container: container.value,
      style: mapStyle.value,
      center: DEFAULT_CENTER,
      zoom: 10,
    })
    map = createdMap
    appliedMapStyle = mapStyle.value
    createdMap.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left')
    createdMap.on('style.load', () => {
      if (sequence !== initializationSequence || map !== createdMap) return
      if (appliedMapStyle !== mapStyle.value) {
        applyMapStyle(mapStyle.value)
        return
      }
      styleReady = true
      mapError.value = ''
      canRetry.value = false
      lineLayerIds = []
      renderStops()
      updateDrawingProjection()
    })
    createdMap.once('idle', emitViewport)
    createdMap.on('error', () => {
      if (sequence !== initializationSequence || map !== createdMap || styleReady) return
      mapError.value = '지도를 불러오지 못했습니다.'
      canRetry.value = true
    })
    createdMap.on('moveend', emitViewport)
    createdMap.on('move', updateDrawingProjection)
    createdMap.on('resize', updateDrawingProjection)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map?.resize())
      resizeObserver.observe(container.value)
    }
  } catch {
    if (sequence !== initializationSequence) return
    cleanupMapResources()
    mapError.value = '지도를 초기화하지 못했습니다.'
    canRetry.value = true
  }
}

function retry() {
  initializationSequence++
  cleanupMapResources()
  void initializeMap()
}

watch(() => [props.stops, props.nearbyPlaces, props.previewPlace, props.cardDisplay], renderStops, { deep: true })
watch(() => [props.routes, props.routeDisplay], renderRoutes, { deep: true })
onMounted(initializeMap)
onBeforeUnmount(() => {
  initializationSequence++
  cleanupMapResources()
})
</script>

<template>
  <div class="itinerary-map">
    <div ref="container" class="itinerary-map__canvas" aria-label="여행 일정 지도"></div>
    <MapDrawingOverlay
      :drawings="drawings"
      :tool="drawingTool"
      :color="drawingColor"
      :width="drawingWidth"
      :enabled="(drawingsVisible || drawingTool === 'route-pen') && !mapError"
      :projection-revision="projectionRevision"
      :route-waypoints="routeWaypoints"
      :project="projectDrawingCoordinate"
      :unproject="unprojectDrawingPoint"
      @create="emit('drawingCreate', $event)"
      @erase="emit('drawingErase', $event)"
      @preview="emit('drawingPreview', $event)"
      @route-point="emit('routePoint', $event)"
      @pan="panMapByOverlayDelta"
      @wheel-zoom="zoomMapByOverlayWheel"
    />
    <div v-if="mapError" class="itinerary-map__error" role="alert">
      <span>{{ mapError }}</span>
      <button v-if="canRetry" type="button" class="btn ghost" @click="retry">다시 시도</button>
    </div>
  </div>
</template>

<style scoped>
.itinerary-map,
.itinerary-map__canvas {
  width: 100%;
  height: 100%;
}

.itinerary-map {
  position: relative;
}

.itinerary-map :deep(.mapboxgl-marker) {
  z-index: 2;
}

.itinerary-map :deep(.map-preview-place-card) {
  position: absolute;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 190px;
  min-height: 64px;
  padding: 8px 10px 10px 8px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.2);
  cursor: pointer;
  text-align: left;
}

.itinerary-map :deep(.map-preview-place-media) {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: 6px;
  background: #eef2ff;
  color: #4f46e5;
}

.itinerary-map :deep(.map-preview-place-media img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.itinerary-map :deep(.map-preview-place-info) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.itinerary-map :deep(.map-preview-place-title) {
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.itinerary-map :deep(.map-preview-place-category) {
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.itinerary-map :deep(.map-preview-place-pointer) {
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 14px;
  height: 14px;
  border-right: 1px solid rgba(15, 23, 42, 0.12);
  border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  transform: translateX(-50%) rotate(45deg);
}

.itinerary-map__error {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  background: #f8fafc;
  color: #475569;
}
</style>
