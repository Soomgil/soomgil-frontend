<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import mapboxgl from 'mapbox-gl'

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

const props = defineProps<{ stops: ItineraryMapStop[] }>()
const emit = defineEmits<{ selectPlace: [placeId: string] }>()

const DEFAULT_CENTER: [number, number] = [127.3845, 36.3504]
const container = ref<HTMLElement | null>(null)
const mapError = ref('')
let map: mapboxgl.Map | null = null
let markers: mapboxgl.Marker[] = []
let resizeObserver: ResizeObserver | null = null
let lineLayerIds: string[] = []

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
  if (!map) return
  lineLayerIds.forEach((id) => {
    if (map?.getLayer(id)) map.removeLayer(id)
    if (map?.getSource(id)) map.removeSource(id)
  })
  lineLayerIds = []
}

function renderStops() {
  if (!map || !map.loaded()) return
  clearMapContent()

  props.stops.forEach((stop) => {
    markers.push(new mapboxgl.Marker({ element: createMarkerElement(stop), anchor: 'bottom' })
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
    const bounds = new mapboxgl.LngLatBounds()
    props.stops.forEach((stop) => bounds.extend([stop.lng, stop.lat]))
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 500 })
  }
}

function initializeMap() {
  if (!container.value) return
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim()
  if (!accessToken) {
    mapError.value = 'Mapbox access token이 설정되지 않았습니다.'
    return
  }

  mapError.value = ''
  mapboxgl.accessToken = accessToken
  try {
    map = new mapboxgl.Map({
      container: container.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: 10,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', renderStops)
    map.on('error', () => {
      if (!map?.loaded()) mapError.value = '지도를 불러오지 못했습니다.'
    })
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map?.resize())
      resizeObserver.observe(container.value)
    }
  } catch {
    mapError.value = '지도를 초기화하지 못했습니다.'
  }
}

function retry() {
  map?.remove()
  map = null
  initializeMap()
}

watch(() => props.stops, renderStops, { deep: true })
onMounted(initializeMap)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  clearMapContent()
  map?.remove()
  map = null
})
</script>

<template>
  <div class="itinerary-map">
    <div ref="container" class="itinerary-map__canvas" aria-label="여행 일정 지도"></div>
    <div v-if="mapError" class="itinerary-map__error" role="alert">
      <span>{{ mapError }}</span>
      <button type="button" class="btn ghost" @click="retry">다시 시도</button>
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
