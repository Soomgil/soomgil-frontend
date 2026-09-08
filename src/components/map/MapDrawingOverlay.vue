<script setup lang="ts">
import { computed, ref } from 'vue'
import { projectMapObject } from './mapObjectGeometry'
import { createStrokePathBuilder, strokePaths } from './strokePaths'
import type { DrawingPreviewEvent, DrawingPreviewPhase } from '@/types/collaboration'
import type { LngLat } from '@/types/geo'
import type { MapDrawing } from '@/types/itinerary'
import { simplifyWithTolerance } from '@/utils/pathSimplification'

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

const ERASER_RADIUS_PX = 12

const props = withDefaults(defineProps<{
  drawings: MapDrawingStroke[]
  tool: MapDrawingTool
  color: string
  width: number
  enabled: boolean
  drawingsVisible?: boolean
  projectionRevision: number
  routeWaypoints?: LngLat[]
  objects?: MapDrawing[]
  project: (coordinate: LngLat) => ScreenPoint | null
  unproject: (point: ScreenPoint) => LngLat | null
}>(), {
  drawingsVisible: true,
  routeWaypoints: () => [],
  objects: () => [],
})

const emit = defineEmits<{
  create: [drawing: MapDrawingDraft]
  erase: [drawingIds: string[]]
  preview: [event: DrawingPreviewEvent]
  routePoint: [coordinate: LngLat]
  pan: [delta: ScreenPoint]
  wheelZoom: [payload: { point: ScreenPoint; deltaY: number }]
  cursorMove: [coordinate: LngLat]
  cursorLeave: []
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
let activeEraserPointerId: number | null = null
let lastEraserPoint: ScreenPoint | null = null
let erasedDuringGesture = new Set<string>()

const editable = computed(() => props.enabled && (props.tool === 'route-pen' || props.tool === 'pen' || props.tool === 'eraser'))
const currentStrokePathBuilder = createStrokePathBuilder()
const currentPaths = computed(() => currentStrokePathBuilder.update(currentPoints.value))
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
    paths: strokePaths(drawing.coordinates
      .map(props.project)
      .filter((point): point is ScreenPoint => point !== null)),
  }))
})
const projectedObjects = computed(() => {
  void props.projectionRevision
  return props.objects.flatMap((drawing) => {
    if (!drawing.transform) return []
    const projected = projectMapObject(drawing.transform, props.project)
    return projected ? [{ id: drawing.id, corners: projected.corners }] : []
  })
})

function localPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'>): ScreenPoint | null {
  if (!surface.value) return null
  const bounds = surface.value.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function pointDistance(left: ScreenPoint, right: ScreenPoint) {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function pointToSegmentDistance(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return pointDistance(point, start)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return pointDistance(point, { x: start.x + dx * ratio, y: start.y + dy * ratio })
}

function orientation(first: ScreenPoint, second: ScreenPoint, third: ScreenPoint) {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x)
}

function pointOnSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint) {
  return Math.abs(orientation(start, end, point)) < 0.0001
    && point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y)
}

function segmentsIntersect(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint) {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  if (((abC < 0 && abD > 0) || (abC > 0 && abD < 0))
    && ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0))) return true
  return pointOnSegment(c, a, b)
    || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d)
    || pointOnSegment(b, c, d)
}

function segmentDistance(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint) {
  if (segmentsIntersect(a, b, c, d)) return 0
  return Math.min(
    pointToSegmentDistance(a, c, d),
    pointToSegmentDistance(b, c, d),
    pointToSegmentDistance(c, a, b),
    pointToSegmentDistance(d, a, b),
  )
}

function pointInPolygon(point: ScreenPoint, polygon: ScreenPoint[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]!
    const previousPoint = polygon[previous]!
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y || Number.EPSILON) + currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

function collectEraserHits(start: ScreenPoint, end: ScreenPoint) {
  projectedDrawings.value.forEach((drawing) => {
    const points = drawing.coordinates.map(props.project).filter((point): point is ScreenPoint => point !== null)
    for (let index = 1; index < points.length; index += 1) {
      if (segmentDistance(start, end, points[index - 1]!, points[index]!) <= ERASER_RADIUS_PX + drawing.width / 2) {
        erasedDuringGesture.add(drawing.id)
        break
      }
    }
  })
  projectedObjects.value.forEach((object) => {
    if (pointInPolygon(start, object.corners) || pointInPolygon(end, object.corners)) {
      erasedDuringGesture.add(object.id)
      return
    }
    for (let index = 0; index < object.corners.length; index += 1) {
      const edgeStart = object.corners[index]!
      const edgeEnd = object.corners[(index + 1) % object.corners.length]!
      if (segmentDistance(start, end, edgeStart, edgeEnd) <= ERASER_RADIUS_PX) {
        erasedDuringGesture.add(object.id)
        return
      }
    }
  })
}

function beginEraser(event: PointerEvent) {
  if (props.tool !== 'eraser' || event.button !== 0) return false
  const point = localPoint(event)
  if (!point) return true
  event.preventDefault()
  activeEraserPointerId = event.pointerId
  lastEraserPoint = point
  erasedDuringGesture = new Set()
  collectEraserHits(point, point)
  surface.value?.setPointerCapture?.(event.pointerId)
  return true
}

function extendEraser(event: PointerEvent) {
  if (activeEraserPointerId !== event.pointerId || !lastEraserPoint) return false
  for (const sample of pointerSamples(event)) {
    const point = localPoint(sample)
    if (!point) continue
    collectEraserHits(lastEraserPoint, point)
    lastEraserPoint = point
  }
  event.preventDefault()
  return true
}

function finishEraser(event: PointerEvent, commit = true) {
  if (activeEraserPointerId !== event.pointerId) return false
  if (commit) extendEraser(event)
  const drawingIds = [...erasedDuringGesture]
  activeEraserPointerId = null
  lastEraserPoint = null
  erasedDuringGesture = new Set()
  releasePointerCapture(event.pointerId)
  if (commit && drawingIds.length > 0) emit('erase', drawingIds)
  return true
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
  // Bound visual error instead of discarding detail to meet a fixed point count.
  return points.length <= 100 ? points : simplifyWithTolerance(points, 0.75, point => point)
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
  if (beginEraser(event)) return
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
  currentStrokePathBuilder.reset()
  currentPoints.value = [point]
  surface.value?.setPointerCapture?.(event.pointerId)
}

function extendStroke(event: PointerEvent) {
  if (extendEraser(event)) return
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

function movePointer(event: PointerEvent) {
  const point = localPoint(event)
  const coordinate = point ? props.unproject(point) : null
  if (coordinate) emit('cursorMove', coordinate)
  extendStroke(event)
}

function releasePointerCapture(pointerId: number) {
  const element = surface.value
  if (element?.hasPointerCapture?.(pointerId)) {
    element.releasePointerCapture(pointerId)
  }
}

function finishStroke(event: PointerEvent) {
  if (finishEraser(event)) return
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
  const coordinates = points
    .map(props.unproject)
    .filter((coordinate): coordinate is LngLat => coordinate !== null)
  emitPreview('END')
  if (coordinates.length >= 2) {
    emit('create', { coordinates, color: props.color, width: props.width })
  }
  activePointerId = null
  activePreviewId = null
  currentPoints.value = []
  releasePointerCapture(event.pointerId)
}

function finishCapturedStroke(pointerId: number) {
  const points = naturalStrokePoints([...currentPoints.value])
  const coordinates = points
    .map(props.unproject)
    .filter((coordinate): coordinate is LngLat => coordinate !== null)
  emitPreview('END')
  if (coordinates.length >= 2) {
    emit('create', { coordinates, color: props.color, width: props.width })
  }
  activePointerId = null
  activePreviewId = null
  currentPoints.value = []
  releasePointerCapture(pointerId)
}

function cancelStroke(event: PointerEvent) {
  if (finishEraser(event, false)) return
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
  if (finishEraser(event)) return
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
    @pointermove="movePointer"
    @pointerleave="emit('cursorLeave')"
    @pointerup="finishStroke"
    @pointercancel="cancelStroke"
    @lostpointercapture="handleLostPointerCapture"
    @contextmenu="preventContextMenu"
    @wheel="zoomThroughOverlay"
  >
    <template v-for="drawing in projectedDrawings" :key="drawing.id">
      <path
        v-for="(path, index) in drawing.paths"
        :key="index"
        class="map-drawing-stroke"
        :d="path"
        :stroke="drawing.color"
        :stroke-width="drawing.width"
      />
    </template>
    <path
      v-for="(path, index) in currentPaths"
      :key="index"
      class="map-drawing-stroke is-current"
      :d="path"
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
  z-index: 5;
}

.map-drawing-stroke {
  fill: none;
  pointer-events: none;
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
