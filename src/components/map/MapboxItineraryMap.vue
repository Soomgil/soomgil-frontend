<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import MapDrawingOverlay from './MapDrawingOverlay.vue'
import type { MapDrawingDraft, MapDrawingStroke, MapDrawingTool } from './MapDrawingOverlay.vue'
import type { LngLat, Viewport } from '@/types/geo'

export interface ItineraryMapStop {
  id: string
  placeId?: string
  title: string
  dayIndex: number
  index: number
  lat: number
  lng: number
  image?: string | null
}

const props = withDefaults(defineProps<{
  stops: ItineraryMapStop[]
  drawings?: MapDrawingStroke[]
  drawingTool?: MapDrawingTool
  drawingColor?: string
  drawingWidth?: number
  drawingsVisible?: boolean
}>(), {
  drawings: () => [],
  drawingTool: 'cursor',
  drawingColor: '#1f2937',
  drawingWidth: 6,
  drawingsVisible: true,
})
const emit = defineEmits<{
  selectPlace: [placeId: string]
  viewportChange: [viewport: Viewport]
  drawingCreate: [drawing: MapDrawingDraft]
  drawingErase: [drawingId: string]
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
let initializationSequence = 0
let lastEmittedViewport = ''

function dayColor(dayIndex: number) {
  const colors = ['#0066ff', '#3b82f6', '#10b981', '#f97316', '#ec4899']
  return dayIndex <= 0 ? colors[4] : colors[(dayIndex - 1) % colors.length]
}

function dayClass(dayIndex: number) {
  return dayIndex <= 0 ? 'day-color-5' : `day-color-${((dayIndex - 1) % 5) + 1}`
}

function createMarkerElement(stop: ItineraryMapStop) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = `map-pin-card ${dayClass(stop.dayIndex)}`
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

  const badge = document.createElement('span')
  badge.className = 'map-pin-badge'
  badge.textContent = String(stop.index)
  marker.append(imageWrapper, info, badge)
  if (stop.placeId) marker.addEventListener('click', () => emit('selectPlace', stop.placeId!))
  return marker
}

function clearMapContent() {
  markers.forEach((marker) => marker.remove())
  markers = []
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

function renderStops() {
  if (!map || !mapboxgl || !styleReady) return
  const mapbox = mapboxgl
  clearMapContent()

  props.stops.forEach((stop) => {
    markers.push(new mapbox.Marker({ element: createMarkerElement(stop), anchor: 'bottom' })
      .setLngLat([stop.lng, stop.lat])
      .addTo(map!))
  })

  const grouped = new Map<number, ItineraryMapStop[]>()
  props.stops.forEach((stop) => {
    const stops = grouped.get(stop.dayIndex) ?? []
    stops.push(stop)
    grouped.set(stop.dayIndex, stops)
  })
  grouped.forEach((stops, dayIndex) => {
    if (stops.length < 2) return
    const id = `itinerary-day-${dayIndex <= 0 ? 'unscheduled' : dayIndex}`
    map!.addSource(id, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: stops.map((stop) => [stop.lng, stop.lat]) },
      },
    })
    map!.addLayer({
      id,
      type: 'line',
      source: id,
      paint: { 'line-color': dayColor(dayIndex), 'line-width': 4, 'line-opacity': 0.8 },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    lineLayerIds.push(id)
  })

  if (props.stops.length === 0) {
    map.easeTo({ center: DEFAULT_CENTER, zoom: 10 })
  } else if (props.stops.length === 1) {
    map.easeTo({ center: [props.stops[0].lng, props.stops[0].lat], zoom: 13 })
  } else {
    const bounds = new mapbox.LngLatBounds()
    props.stops.forEach((stop) => bounds.extend([stop.lng, stop.lat]))
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 500 })
  }
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

function cleanupMapResources() {
  resizeObserver?.disconnect()
  resizeObserver = null
  clearMapContent()
  map?.remove()
  map = null
  styleReady = false
  lastEmittedViewport = ''
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
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: 10,
    })
    map = createdMap
    createdMap.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    createdMap.on('load', () => {
      if (sequence !== initializationSequence || map !== createdMap) return
      styleReady = true
      mapError.value = ''
      canRetry.value = false
      renderStops()
      updateDrawingProjection()
      createdMap.once('idle', emitViewport)
    })
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

watch(() => props.stops, renderStops, { deep: true })
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
      :enabled="drawingsVisible && !mapError"
      :projection-revision="projectionRevision"
      :project="projectDrawingCoordinate"
      :unproject="unprojectDrawingPoint"
      @create="emit('drawingCreate', $event)"
      @erase="emit('drawingErase', $event)"
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
