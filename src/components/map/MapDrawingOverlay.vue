<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LngLat } from '@/types/geo'

export type MapDrawingTool = 'cursor' | 'route-pen' | 'pen' | 'eraser'

export interface MapDrawingStroke {
  id: string
  coordinates: LngLat[]
  color: string
  width: number
}

export interface MapDrawingDraft {
  coordinates: LngLat[]
  color: string
  width: number
}

interface ScreenPoint {
  x: number
  y: number
}

const props = defineProps<{
  drawings: MapDrawingStroke[]
  tool: MapDrawingTool
  color: string
  width: number
  enabled: boolean
  projectionRevision: number
  project: (coordinate: LngLat) => ScreenPoint | null
  unproject: (point: ScreenPoint) => LngLat | null
}>()

const emit = defineEmits<{
  create: [drawing: MapDrawingDraft]
  erase: [drawingId: string]
}>()

const surface = ref<SVGSVGElement | null>(null)
const currentPoints = ref<ScreenPoint[]>([])
let activePointerId: number | null = null

const editable = computed(() => props.enabled && (props.tool === 'pen' || props.tool === 'eraser'))
const currentPointString = computed(() => currentPoints.value.map((point) => `${point.x},${point.y}`).join(' '))
const projectedDrawings = computed(() => {
  void props.projectionRevision
  return props.drawings.map((drawing) => ({
    ...drawing,
    points: drawing.coordinates
      .map(props.project)
      .filter((point): point is ScreenPoint => point !== null)
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
  }))
})

function localPoint(event: PointerEvent): ScreenPoint | null {
  if (!surface.value) return null
  const bounds = surface.value.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function pointDistance(left: ScreenPoint, right: ScreenPoint) {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function beginStroke(event: PointerEvent) {
  if (!props.enabled || props.tool !== 'pen' || event.button !== 0) return
  const point = localPoint(event)
  if (!point) return
  event.preventDefault()
  activePointerId = event.pointerId
  currentPoints.value = [point]
  surface.value?.setPointerCapture?.(event.pointerId)
}

function extendStroke(event: PointerEvent) {
  if (activePointerId !== event.pointerId || currentPoints.value.length === 0) return
  const point = localPoint(event)
  const previous = currentPoints.value.at(-1)
  if (!point || !previous || pointDistance(previous, point) < 2) return
  currentPoints.value.push(point)
}

function finishStroke(event: PointerEvent) {
  if (activePointerId !== event.pointerId) return
  extendStroke(event)
  surface.value?.releasePointerCapture?.(event.pointerId)
  activePointerId = null

  const coordinates = currentPoints.value
    .map(props.unproject)
    .filter((coordinate): coordinate is LngLat => coordinate !== null)
  currentPoints.value = []
  if (coordinates.length < 2) return
  emit('create', { coordinates, color: props.color, width: props.width })
}

function cancelStroke(event: PointerEvent) {
  if (activePointerId !== event.pointerId) return
  surface.value?.releasePointerCapture?.(event.pointerId)
  activePointerId = null
  currentPoints.value = []
}

function eraseDrawing(event: PointerEvent, drawingId: string) {
  if (!props.enabled || props.tool !== 'eraser') return
  event.preventDefault()
  event.stopPropagation()
  emit('erase', drawingId)
}
</script>

<template>
  <svg
    v-show="enabled"
    ref="surface"
    class="map-drawing-overlay"
    :class="{ editable, erasing: tool === 'eraser' }"
    aria-label="지도 그림 레이어"
    @pointerdown="beginStroke"
    @pointermove="extendStroke"
    @pointerup="finishStroke"
    @pointercancel="cancelStroke"
  >
    <polyline
      v-for="drawing in projectedDrawings"
      :key="drawing.id"
      class="map-drawing-stroke"
      :points="drawing.points"
      :stroke="drawing.color"
      :stroke-width="drawing.width"
      @pointerdown="eraseDrawing($event, drawing.id)"
    />
    <polyline
      v-if="currentPoints.length > 1"
      class="map-drawing-stroke is-current"
      :points="currentPointString"
      :stroke="color"
      :stroke-width="width"
    />
  </svg>
</template>

<style scoped>
.map-drawing-overlay {
  height: 100%;
  inset: 0;
  pointer-events: none;
  position: absolute;
  touch-action: none;
  width: 100%;
  z-index: 4;
}

.map-drawing-overlay.editable {
  cursor: crosshair;
  pointer-events: auto;
}

.map-drawing-overlay.erasing {
  cursor: cell;
}

.map-drawing-stroke {
  fill: none;
  pointer-events: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-drawing-overlay.erasing .map-drawing-stroke:not(.is-current) {
  pointer-events: stroke;
}
</style>
