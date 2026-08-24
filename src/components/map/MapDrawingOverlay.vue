<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DrawingPreviewEvent, DrawingPreviewPhase } from '@/types/collaboration'
import type { LngLat } from '@/types/geo'
import { simplifyPathToLimit } from '@/utils/pathSimplification'

export type MapDrawingTool = 'cursor' | 'route-pen' | 'pen' | 'eraser' | 'sticker' | 'image'

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

const STORED_STROKE_MAX_POINTS = 100

const props = withDefaults(defineProps<{
  drawings: MapDrawingStroke[]
  tool: MapDrawingTool
  color: string
  width: number
  enabled: boolean
  drawingsVisible?: boolean
  projectionRevision: number
  routeWaypoints?: LngLat[]
  project: (coordinate: LngLat) => ScreenPoint | null
  unproject: (point: ScreenPoint) => LngLat | null
}>(), {
  drawingsVisible: true,
  routeWaypoints: () => [],
})

const emit = defineEmits<{
  create: [drawing: MapDrawingDraft]
  erase: [drawingId: string]
  preview: [event: DrawingPreviewEvent]
  routePoint: [coordinate: LngLat]
  pan: [delta: ScreenPoint]
  wheelZoom: [payload: { point: ScreenPoint; deltaY: number }]
}>()

const surface = ref<SVGSVGElement | null>(null)
const currentPoints = ref<ScreenPoint[]>([])
let activePointerId: number | null = null
let activePreviewId: string | null = null
let activePreviewSequence = 0
let previewIdSequence = 0
let activeRoutePointPointerId: number | null = null
let routePointStart: ScreenPoint | null = null
let activePanPointerId: number | null = null
let lastPanPoint: ScreenPoint | null = null

const editable = computed(() => props.enabled && (props.tool === 'route-pen' || props.tool === 'pen' || props.tool === 'eraser'))
const currentPath = computed(() => smoothStrokePath(currentPoints.value))
const projectedRouteWaypoints = computed(() => {
  void props.projectionRevision
  return (props.routeWaypoints ?? [])
    .map(props.project)
    .filter((point): point is ScreenPoint => point !== null)
})
const routeWaypointPointString = computed(() => projectedRouteWaypoints.value.map((point) => `${point.x},${point.y}`).join(' '))
const projectedDrawings = computed(() => {
  void props.projectionRevision
  if (props.drawingsVisible === false) return []
  return props.drawings.map((drawing) => ({
    ...drawing,
    path: smoothStrokePath(drawing.coordinates
      .map(props.project)
      .filter((point): point is ScreenPoint => point !== null)),
  }))
})

function smoothStrokePath(points: ScreenPoint[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`
  const commands = [`M ${points[0]!.x} ${points[0]!.y}`]

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]!
    const current = points[index]!
    const next = points[index + 1]!
    const following = points[Math.min(points.length - 1, index + 2)]!
    const firstControl = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    }
    const secondControl = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    }
    commands.push(`C ${firstControl.x} ${firstControl.y} ${secondControl.x} ${secondControl.y} ${next.x} ${next.y}`)
  }

  return commands.join(' ')
}

function localPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'>): ScreenPoint | null {
  if (!surface.value) return null
  const bounds = surface.value.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function pointDistance(left: ScreenPoint, right: ScreenPoint) {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function createPreviewId() {
  return globalThis.crypto?.randomUUID?.() ?? `drawing-preview-${Date.now()}-${++previewIdSequence}`
}

function emitPreview(phase: DrawingPreviewPhase, points = currentPoints.value) {
  if (!activePreviewId) return
  const coordinates = points
    .map(props.unproject)
    .filter((coordinate): coordinate is LngLat => coordinate !== null)
  if (phase !== 'CANCEL' && coordinates.length < 2) return
  emit('preview', {
    previewId: activePreviewId,
    sequence: ++activePreviewSequence,
    phase,
    coordinates,
    color: props.color,
    width: props.width,
  })
}

function appendPoint(point: ScreenPoint) {
  const previous = currentPoints.value.at(-1)
  if (!previous || pointDistance(previous, point) >= 1) {
    currentPoints.value.push(point)
    return true
  }
  return false
}

function naturalStrokePoints(points: ScreenPoint[]) {
  return simplifyPathToLimit(points, STORED_STROKE_MAX_POINTS, point => point, 0.75)
}

function pointerSamples(event: PointerEvent): Array<Pick<PointerEvent, 'clientX' | 'clientY'>> {
  const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
  return samples.length > 0 ? samples : [event]
}

function beginStroke(event: PointerEvent) {
  if (!props.enabled) return
  if ((props.tool === 'route-pen' || props.tool === 'pen' || props.tool === 'eraser') && event.button === 2) {
    const point = localPoint(event)
    if (!point) return
    event.preventDefault()
    activePanPointerId = event.pointerId
    lastPanPoint = point
    surface.value?.setPointerCapture?.(event.pointerId)
    return
  }
  if ((props.tool !== 'route-pen' && props.tool !== 'pen') || event.button !== 0) return
  const point = localPoint(event)
  if (!point) return
  event.preventDefault()
  if (props.tool === 'route-pen') {
    activeRoutePointPointerId = event.pointerId
    routePointStart = point
    surface.value?.setPointerCapture?.(event.pointerId)
    return
  }
  activePointerId = event.pointerId
  activePreviewId = createPreviewId()
  activePreviewSequence = 0
  currentPoints.value = [point]
  surface.value?.setPointerCapture?.(event.pointerId)
}

function extendStroke(event: PointerEvent) {
  if (activePanPointerId === event.pointerId) {
    const point = localPoint(event)
    if (!point || !lastPanPoint) return
    const delta = { x: point.x - lastPanPoint.x, y: point.y - lastPanPoint.y }
    lastPanPoint = point
    if (delta.x !== 0 || delta.y !== 0) {
      event.preventDefault()
      emit('pan', delta)
    }
    return
  }
  if (activeRoutePointPointerId === event.pointerId) return
  if (activePointerId !== event.pointerId || currentPoints.value.length === 0) return
  let changed = false
  for (const sample of pointerSamples(event)) {
    const point = localPoint(sample)
    if (point) changed = appendPoint(point) || changed
  }
  if (changed) emitPreview('UPDATE')
}

function releasePointerCapture(pointerId: number) {
  const element = surface.value
  if (element?.hasPointerCapture?.(pointerId)) {
    element.releasePointerCapture(pointerId)
  }
}

function finishStroke(event: PointerEvent) {
  if (activePanPointerId === event.pointerId) {
    activePanPointerId = null
    lastPanPoint = null
    releasePointerCapture(event.pointerId)
    return
  }
  if (activeRoutePointPointerId === event.pointerId) {
    finishRoutePoint(event)
    return
  }
  if (activePointerId !== event.pointerId) return
  extendStroke(event)
  const points = naturalStrokePoints([...currentPoints.value])
  emitPreview('END', points)
  activePointerId = null
  activePreviewId = null
  currentPoints.value = []
  releasePointerCapture(event.pointerId)

  const coordinates = points
    .map(props.unproject)
    .filter((coordinate): coordinate is LngLat => coordinate !== null)
  if (coordinates.length < 2) return
  emit('create', { coordinates, color: props.color, width: props.width })
}

function finishCapturedStroke(pointerId: number) {
  const points = naturalStrokePoints([...currentPoints.value])
  emitPreview('END', points)
  activePointerId = null
  activePreviewId = null
  currentPoints.value = []

  const coordinates = points
    .map(props.unproject)
    .filter((coordinate): coordinate is LngLat => coordinate !== null)
  if (coordinates.length < 2) return
  emit('create', { coordinates, color: props.color, width: props.width })
  releasePointerCapture(pointerId)
}

function cancelStroke(event: PointerEvent) {
  if (activePanPointerId === event.pointerId) {
    activePanPointerId = null
    lastPanPoint = null
    releasePointerCapture(event.pointerId)
    return
  }
  if (activeRoutePointPointerId === event.pointerId) {
    activeRoutePointPointerId = null
    routePointStart = null
    releasePointerCapture(event.pointerId)
    return
  }
  if (activePointerId !== event.pointerId) return
  emitPreview('CANCEL')
  activePointerId = null
  activePreviewId = null
  currentPoints.value = []
  releasePointerCapture(event.pointerId)
}

function handleLostPointerCapture(event: PointerEvent) {
  if (activePanPointerId === event.pointerId) {
    activePanPointerId = null
    lastPanPoint = null
    return
  }
  if (activeRoutePointPointerId === event.pointerId) {
    activeRoutePointPointerId = null
    routePointStart = null
    return
  }
  if (activePointerId !== event.pointerId) return
  finishCapturedStroke(event.pointerId)
}

function finishRoutePoint(event: PointerEvent) {
  if (activeRoutePointPointerId !== event.pointerId || !routePointStart) return
  const point = localPoint(event)
  const start = routePointStart
  activeRoutePointPointerId = null
  routePointStart = null
  releasePointerCapture(event.pointerId)
  if (!point || pointDistance(start, point) > 10) return
  const coordinate = props.unproject(point)
  if (coordinate) emit('routePoint', coordinate)
}

function eraseDrawing(event: PointerEvent, drawingId: string) {
  if (!props.enabled || props.tool !== 'eraser') return
  event.preventDefault()
  event.stopPropagation()
  emit('erase', drawingId)
}

function preventContextMenu(event: MouseEvent) {
  if (props.enabled && (props.tool === 'route-pen' || props.tool === 'pen' || props.tool === 'eraser')) {
    event.preventDefault()
  }
}

function zoomThroughOverlay(event: WheelEvent) {
  if (!editable.value) return
  const point = localPoint(event)
  if (!point) return
  event.preventDefault()
  emit('wheelZoom', { point, deltaY: event.deltaY })
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
    @pointerrawupdate="extendStroke"
    @pointerup="finishStroke"
    @pointercancel="cancelStroke"
    @lostpointercapture="handleLostPointerCapture"
    @contextmenu="preventContextMenu"
    @wheel="zoomThroughOverlay"
  >
    <template v-for="drawing in projectedDrawings" :key="drawing.id">
      <path
        v-if="tool === 'eraser'"
        class="map-drawing-hit-target"
        :d="drawing.path"
        stroke="transparent"
        :stroke-width="Math.max(drawing.width, 24)"
        @pointerdown="eraseDrawing($event, drawing.id)"
      />
      <path
        class="map-drawing-stroke"
        :d="drawing.path"
        :stroke="drawing.color"
        :stroke-width="drawing.width"
      />
    </template>
    <path
      v-if="currentPoints.length > 1"
      class="map-drawing-stroke is-current"
      :d="currentPath"
      :stroke="color"
      :stroke-width="width"
    />
    <polyline
      v-if="tool === 'route-pen' && projectedRouteWaypoints.length > 1"
      class="map-route-waypoint-line"
      :points="routeWaypointPointString"
    />
    <g v-if="tool === 'route-pen'">
      <g
        v-for="(point, index) in projectedRouteWaypoints"
        :key="`${index}-${point.x}-${point.y}`"
        class="map-route-waypoint"
      >
        <circle :cx="point.x" :cy="point.y" r="8" />
        <text :x="point.x" :y="point.y + 4">{{ index + 1 }}</text>
      </g>
    </g>
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
  z-index: 1;
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

.map-drawing-hit-target {
  fill: none;
  pointer-events: stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-route-waypoint-line {
  fill: none;
  pointer-events: none;
  stroke: #6d4aff;
  stroke-dasharray: 6 6;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.map-route-waypoint {
  pointer-events: none;
}

.map-route-waypoint circle {
  fill: #6d4aff;
  stroke: #fff;
  stroke-width: 2;
}

.map-route-waypoint text {
  fill: #fff;
  font-size: 10px;
  font-weight: 800;
  text-anchor: middle;
}
</style>
