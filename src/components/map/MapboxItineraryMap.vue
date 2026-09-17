<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import MapDrawingOverlay from './MapDrawingOverlay.vue'
import MapObjectOverlay from './MapObjectOverlay.vue'
import type { MapCursorView, MapObjectLockView } from './MapObjectOverlay.vue'
import type { MapDrawingDraft, MapDrawingStroke, MapDrawingTool } from './MapDrawingOverlay.vue'
import type { DrawingPreviewEvent } from '@/types/collaboration'
import type { LngLat, Viewport } from '@/types/geo'
import type { MapDrawing, MapObjectTransform, RouteMode } from '@/types/itinerary'
import type { AccessibilityFlag, PlaceAccessibility } from '@/types/place'
import { cachedMapStyle } from '@/utils/mapStyleCache'
import { MAP_THEMES, type MapTheme } from '@/types/map-theme'

export interface ItineraryMapNearbyPlace {
  id: string
  provider: string
  externalPlaceId: string
  title: string
  category: string | null
  lat: number
  lng: number
  dayIndex?: number
  taste?: 'favorite' | 'star'
  image?: string | null
  accessibility?: PlaceAccessibility
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
  provider?: string
  mode?: RouteMode
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
  tastePlaces?: ItineraryMapNearbyPlace[]
  previewPlace?: ItineraryMapNearbyPlace | null
  drawings?: MapDrawingStroke[]
  drawingTool?: MapDrawingTool
  drawingColor?: string
  drawingWidth?: number
  drawingsVisible?: boolean
  navigationMode?: boolean
  standardView?: boolean
  mapTheme?: MapTheme
  routeWaypoints?: LngLat[]
  mapObjects?: MapDrawing[]
  mapObjectImageUrls?: Record<string, string>
  mapObjectPreviewTransforms?: Record<string, MapObjectTransform>
  mapObjectLocks?: Record<string, MapObjectLockView>
  mapCursors?: MapCursorView[]
  currentClientId?: string | null
  selectedMapObjectId?: string | null
  mapObjectPlacement?: boolean
  mapObjectEpoch?: number
}>(), {
  drawings: () => [],
  routes: () => [],
  nearbyPlaces: () => [],
  tastePlaces: () => [],
  previewPlace: null,
  routeDisplay: 'route',
  cardDisplay: 'full',
  drawingTool: 'cursor',
  drawingColor: '#1f2937',
  drawingWidth: 6,
  drawingsVisible: true,
  navigationMode: false,
  standardView: false,
  mapTheme: 'standard',
  routeWaypoints: () => [],
  mapObjects: () => [],
  mapObjectImageUrls: () => ({}),
  mapObjectPreviewTransforms: () => ({}),
  mapObjectLocks: () => ({}),
  mapCursors: () => [],
  currentClientId: null,
  selectedMapObjectId: null,
  mapObjectPlacement: false,
  mapObjectEpoch: 0,
})
const emit = defineEmits<{
  selectPlace: [placeProvider: string | undefined, placeId: string | undefined, stopId: string]
  selectNearbyPlace: [placeProvider: string, placeId: string]
  viewportChange: [viewport: Viewport]
  drawingCreate: [drawing: MapDrawingDraft]
  drawingErase: [drawingIds: string[]]
  drawingPreview: [event: DrawingPreviewEvent]
  routePoint: [coordinate: LngLat]
  mapObjectPlace: [transform: MapObjectTransform]
  mapObjectSelect: [drawingId: string | null]
  mapObjectEditStart: [drawingId: string]
  mapObjectEditEnd: [drawingId: string]
  mapObjectPreview: [drawingId: string, transform: MapObjectTransform]
  mapObjectChange: [drawingId: string, transform: MapObjectTransform]
  cursorMove: [coordinate: LngLat]
  cursorLeave: []
}>()

const DEFAULT_CENTER: [number, number] = [127.3845, 36.3504]
const container = ref<HTMLElement | null>(null)
const mapError = ref('')
const canRetry = ref(false)
const projectionRevision = ref(0)
let mapboxgl: typeof import('mapbox-gl').default | null = null
let map: MapboxMap | null = null
let markers: MapboxMarker[] = []
let routeModeMarkers: MapboxMarker[] = []
let resizeObserver: ResizeObserver | null = null
let lineLayerIds: string[] = []
let styleReady = false
let appliedMapStyle = ''
let initializationSequence = 0
let lastEmittedViewport = ''
let lastFittedStopsKey = ''
let wasConnectingRoute = false

const STANDARD_VIEW_CAMERA = { pitch: 60, bearing: -20 }
const DAY_ROUTE_COLORS = ['#0066ff', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#f59e0b', '#64748b']
const ROUTE_MODE_META: Record<RouteMode, { icon: string; label: string; color: string; bg: string }> = {
  WALKING: { icon: 'directions_walk', label: '도보', color: '#2563eb', bg: '#eff6ff' },
  CYCLING: { icon: 'directions_bike', label: '자전거', color: '#059669', bg: '#ecfdf5' },
  DRIVING: { icon: 'directions_car', label: '자동차', color: '#ea580c', bg: '#fff7ed' },
}

const mapStyle = computed(() => MAP_THEMES.find(theme => theme.value === props.mapTheme)!.style)

function applyMapStyle(style: string) {
  if (!map || appliedMapStyle === style) return
  styleReady = false
  appliedMapStyle = style
  map.setStyle(cachedMapStyle(style, import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '') ?? style)
}

watch(mapStyle, applyMapStyle)

function syncStandardViewCamera(isStandardView: boolean) {
  if (!map) return
  map.easeTo({
    pitch: isStandardView ? STANDARD_VIEW_CAMERA.pitch : 0,
    bearing: isStandardView ? STANDARD_VIEW_CAMERA.bearing : 0,
    duration: 500,
  })
}

watch(() => props.standardView, syncStandardViewCamera)

function dayClass(dayIndex: number) {
  return dayIndex <= 0 ? `day-color-${DAY_ROUTE_COLORS.length}` : `day-color-${((dayIndex - 1) % DAY_ROUTE_COLORS.length) + 1}`
}

function dayRouteColor(dayIndex: number) {
  if (dayIndex <= 0) return DAY_ROUTE_COLORS[DAY_ROUTE_COLORS.length - 1]
  return DAY_ROUTE_COLORS[(dayIndex - 1) % DAY_ROUTE_COLORS.length]
}

function routeLineColor(route: ItineraryMapRoute) {
  const origin = props.stops.find((stop) => stop.id === route.originItineraryItemId)
  const destination = props.stops.find((stop) => stop.id === route.destinationItineraryItemId)
  return dayRouteColor(origin?.dayIndex ?? destination?.dayIndex ?? 1)
}

function routeModeMeta(mode: RouteMode | undefined) {
  return ROUTE_MODE_META[mode ?? 'WALKING']
}

const ACCESSIBILITY_MARKERS: Partial<Record<AccessibilityFlag, { icon: string; label: string }>> = {
  WHEELCHAIR: { icon: 'accessible', label: '휠체어' },
  PET: { icon: 'pets', label: '반려동물' },
  STROLLER: { icon: 'stroller', label: '유모차' },
}

function createAccessibilityElement(accessibilityInfo: PlaceAccessibility | undefined) {
  const supportedFlags = accessibilityInfo?.flags.filter((flag) => ACCESSIBILITY_MARKERS[flag]) ?? []
  if (supportedFlags.length === 0) return null
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
  return accessibility
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
  info.appendChild(title)

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
  el.className = place.taste ? `map-taste-marker${place.taste === 'star' ? ' is-super' : ''}` : `map-nearby-place-marker ${dayClass(place.dayIndex ?? 1)}`
  el.setAttribute('aria-label', place.taste ? place.title : `${place.title} 주변 관광지`)

  const icon = document.createElement('span')
  icon.className = 'material-symbols-rounded'
  icon.textContent = place.taste ?? 'explore'
  el.appendChild(icon)

  const label = document.createElement('span')
  label.className = 'map-nearby-place-label'
  label.textContent = place.title
  el.appendChild(label)
  const accessibility = createAccessibilityElement(place.accessibility)
  if (accessibility) {
    el.appendChild(accessibility)
  }

  el.addEventListener('click', (event) => {
    event.stopPropagation()
    emit('selectNearbyPlace', place.provider, place.externalPlaceId)
  })

  return el
}

let tasteMarkers: MapboxMarker[] = []
function clearTasteMarkers() { tasteMarkers.forEach(marker => marker.remove()); tasteMarkers = [] }
function renderTasteMarkers() {
  clearTasteMarkers()
  if (!map || !mapboxgl || !styleReady) return
  const groups: { x: number; y: number; places: ItineraryMapNearbyPlace[] }[] = []
  for (const place of props.tastePlaces) {
    const point = map.project([place.lng, place.lat])
    const group = groups.find(g => Math.hypot(g.x - point.x, g.y - point.y) < 48)
    if (group) group.places.push(place)
    else groups.push({ x: point.x, y: point.y, places: [place] })
  }
  for (const group of groups) {
    const first = group.places[0]
    let element: HTMLElement
    if (group.places.length === 1) element = createNearbyMarkerElement(first)
    else {
      const details = document.createElement('details')
      details.className = 'map-taste-cluster'
      const summary = document.createElement('summary')
      const icon = document.createElement('span')
      icon.className = 'material-symbols-rounded'
      icon.textContent = 'favorite'
      icon.setAttribute('aria-hidden', 'true')
      const count = document.createElement('span')
      count.textContent = String(group.places.length)
      summary.append(icon, count)
      const list = document.createElement('div')
      list.className = 'map-taste-cluster-list'
      group.places.forEach(place => list.appendChild(createNearbyMarkerElement(place)))
      details.append(summary, list)
      details.addEventListener('click', e => e.stopPropagation())
      element = details
    }
    tasteMarkers.push(new mapboxgl.Marker({ element, anchor: 'bottom', offset: [0, -6] })
      .setLngLat([first.lng, first.lat]).addTo(map))
  }
}

function createPreviewPlaceMarkerElement(place: ItineraryMapNearbyPlace): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `map-preview-place-card ${dayClass(place.dayIndex ?? 1)}`
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
  routeModeMarkers.forEach((marker) => marker.remove())
  routeModeMarkers = []
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

function routeMidpointCoordinate(coordinates: [number, number][]) {
  if (coordinates.length === 0) return null
  return coordinates[Math.floor((coordinates.length - 1) / 2)] ?? null
}

function createRouteModeMarkerElement(route: ItineraryMapRoute) {
  const meta = routeModeMeta(route.mode)
  const el = document.createElement('span')
  el.className = 'map-route-mode-marker'
  el.style.setProperty('--route-mode-color', meta.color)
  el.style.setProperty('--route-mode-bg', meta.bg)
  el.setAttribute('aria-label', `${meta.label} 경로`)

  const icon = document.createElement('span')
  icon.className = 'material-symbols-rounded'
  icon.textContent = meta.icon

  const label = document.createElement('span')
  label.textContent = meta.label

  el.append(icon, label)
  return el
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
        'line-color': routeLineColor(route),
        'line-width': 5,
        'line-opacity': 0.95,
        'line-dasharray': route.provider === 'USER_TRACE' ? [2, 2] : [1, 0],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    lineLayerIds.push(id)

    const midpoint = routeMidpointCoordinate(geometry.coordinates)
    if (midpoint && mapboxgl) {
      routeModeMarkers.push(new mapboxgl.Marker({
        element: createRouteModeMarkerElement(route),
        anchor: 'center',
      })
        .setLngLat(midpoint)
        .addTo(map!))
    }
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
  const stopsKey = props.stops.map((stop) => `${stop.id}:${stop.lng}:${stop.lat}`).sort().join('|')
  const preserveCamera = props.navigationMode || wasConnectingRoute
  wasConnectingRoute = props.navigationMode
  if (preserveCamera) {
    lastFittedStopsKey = stopsKey
    return
  }
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
  clearTasteMarkers()
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
  wasConnectingRoute = false
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
      pitch: props.standardView ? STANDARD_VIEW_CAMERA.pitch : 0,
      bearing: props.standardView ? STANDARD_VIEW_CAMERA.bearing : 0,
    })
    map = createdMap
    appliedMapStyle = mapStyle.value
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
      renderTasteMarkers()
      updateDrawingProjection()
    })
    createdMap.once('idle', emitViewport)
    createdMap.on('error', () => {
      if (sequence !== initializationSequence || map !== createdMap || styleReady) return
      mapError.value = '지도를 불러오지 못했습니다.'
      canRetry.value = true
    })
    createdMap.on('moveend', () => { emitViewport(); renderTasteMarkers() })
    createdMap.on('move', updateDrawingProjection)
    createdMap.on('resize', updateDrawingProjection)
    createdMap.on('mousemove', (event) => emit('cursorMove', { lng: event.lngLat.lng, lat: event.lngLat.lat }))
    createdMap.on('mouseleave', () => emit('cursorLeave'))
    createdMap.on('click', () => {
      if (!props.mapObjectPlacement) emit('mapObjectSelect', null)
    })
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

watch(() => [props.stops, props.nearbyPlaces, props.previewPlace, props.cardDisplay, props.navigationMode], renderStops, { deep: true })
watch(() => [props.routes, props.routeDisplay], renderRoutes, { deep: true })
watch(() => props.tastePlaces, renderTasteMarkers, { deep: true })
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
      :drawings-visible="drawingsVisible"
      :projection-revision="projectionRevision"
      :route-waypoints="routeWaypoints"
      :objects="mapObjects"
      :project="projectDrawingCoordinate"
      :unproject="unprojectDrawingPoint"
      @create="emit('drawingCreate', $event)"
      @erase="emit('drawingErase', $event)"
      @preview="emit('drawingPreview', $event)"
      @route-point="emit('routePoint', $event)"
      @pan="panMapByOverlayDelta"
      @wheel-zoom="zoomMapByOverlayWheel"
      @cursor-move="emit('cursorMove', $event)"
      @cursor-leave="emit('cursorLeave')"
    />
    <MapObjectOverlay
      :key="mapObjectEpoch"
      :objects="mapObjects"
      :image-urls="mapObjectImageUrls"
      :preview-transforms="mapObjectPreviewTransforms"
      :locks="mapObjectLocks"
      :cursors="mapCursors"
      :current-client-id="currentClientId"
      :selected-id="selectedMapObjectId"
      :placement-mode="mapObjectPlacement"
      :projection-revision="projectionRevision"
      :project="projectDrawingCoordinate"
      :unproject="unprojectDrawingPoint"
      @place="emit('mapObjectPlace', $event)"
      @select="emit('mapObjectSelect', $event)"
      @edit-start="emit('mapObjectEditStart', $event)"
      @edit-end="emit('mapObjectEditEnd', $event)"
      @preview="(drawingId, transform) => emit('mapObjectPreview', drawingId, transform)"
      @change="(drawingId, transform) => emit('mapObjectChange', drawingId, transform)"
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

.itinerary-map :deep(.map-route-mode-marker) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border: 1px solid color-mix(in srgb, var(--route-mode-color) 34%, #ffffff);
  border-radius: 999px;
  background: var(--route-mode-bg);
  color: var(--route-mode-color);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.18);
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}

.itinerary-map :deep(.map-route-mode-marker .material-symbols-rounded) {
  font-size: 15px;
}

.itinerary-map :deep(.day-color-6) {
  --day-color: #8b5cf6;
  --day-color-bg: rgba(139, 92, 246, 0.08);
  --day-color-border: rgba(139, 92, 246, 0.22);
}

.itinerary-map :deep(.day-color-7) {
  --day-color: #06b6d4;
  --day-color-bg: rgba(6, 182, 212, 0.08);
  --day-color-border: rgba(6, 182, 212, 0.22);
}

.itinerary-map :deep(.day-color-8) {
  --day-color: #84cc16;
  --day-color-bg: rgba(132, 204, 22, 0.08);
  --day-color-border: rgba(132, 204, 22, 0.22);
}

.itinerary-map :deep(.day-color-9) {
  --day-color: #f59e0b;
  --day-color-bg: rgba(245, 158, 11, 0.08);
  --day-color-border: rgba(245, 158, 11, 0.22);
}

.itinerary-map :deep(.day-color-10) {
  --day-color: #64748b;
  --day-color-bg: rgba(100, 116, 139, 0.08);
  --day-color-border: rgba(100, 116, 139, 0.22);
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
  border: 1px solid var(--day-color-border, rgba(15, 23, 42, 0.12));
  border-radius: 8px;
  background: linear-gradient(135deg, #ffffff, var(--day-color-bg, #ffffff));
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
  background: var(--day-color-bg, #eef2ff);
  color: var(--day-color, #4f46e5);
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
  border-right: 1px solid var(--day-color-border, rgba(15, 23, 42, 0.12));
  border-bottom: 1px solid var(--day-color-border, rgba(15, 23, 42, 0.12));
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
