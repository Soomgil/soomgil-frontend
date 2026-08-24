<script setup lang="ts">
import { computed, ref } from 'vue'
import { defaultMapObjectTransform, projectMapObject, type ScreenPoint } from './mapObjectGeometry'
import { stickerHref } from './mapStickerCatalog'
import type { LngLat } from '@/types/geo'
import type { MapDrawing, MapObjectTransform } from '@/types/itinerary'

export interface MapObjectLockView {
  drawingId: string
  userId: string
  clientId: string
  expiresAt: string
}

export interface MapCursorView {
  clientId: string
  userId: string
  displayName: string
  color: string
  coordinate: LngLat
}

type EditMode = 'drag' | 'resize' | 'rotate'

const props = defineProps<{
  objects: MapDrawing[]
  imageUrls: Record<string, string>
  previewTransforms: Record<string, MapObjectTransform>
  locks: Record<string, MapObjectLockView>
  cursors: MapCursorView[]
  currentClientId: string | null
  selectedId: string | null
  placementMode: boolean
  projectionRevision: number
  project: (coordinate: LngLat) => ScreenPoint | null
  unproject: (point: ScreenPoint) => LngLat | null
}>()

const emit = defineEmits<{
  select: [drawingId: string | null]
  place: [transform: MapObjectTransform]
  editStart: [drawingId: string]
  editEnd: [drawingId: string]
  preview: [drawingId: string, transform: MapObjectTransform]
  change: [drawingId: string, transform: MapObjectTransform]
}>()

const surface = ref<SVGSVGElement | null>(null)
const draftTransforms = ref<Record<string, MapObjectTransform>>({})
let active: {
  pointerId: number
  drawingId: string
  mode: EditMode
  startPoint: ScreenPoint
  startTransform: MapObjectTransform
  startAngle: number
  startDistance: number
} | null = null

function validTransform(drawing: MapDrawing): MapObjectTransform | null {
  const value = draftTransforms.value[drawing.id] ?? props.previewTransforms[drawing.id] ?? drawing.transform
  if (!value
    || !Number.isFinite(value.centerLng) || !Number.isFinite(value.centerLat)
    || !Number.isFinite(value.widthMeters) || value.widthMeters <= 0
    || !Number.isFinite(value.heightMeters) || value.heightMeters <= 0
    || !Number.isFinite(value.rotationDeg)) return null
  return value
}

const projectedObjects = computed(() => {
  void props.projectionRevision
  return props.objects.flatMap((drawing) => {
    const transform = validTransform(drawing)
    if (!transform) return []
    const projected = projectMapObject(transform, props.project)
    if (!projected) return []
    return [{ drawing, transform, projected }]
  })
})

const projectedCursors = computed(() => {
  void props.projectionRevision
  return props.cursors.flatMap((cursor) => {
    const point = props.project(cursor.coordinate)
    return point ? [{ ...cursor, point }] : []
  })
})

function matrix(value: [number, number, number, number, number, number]) {
  return `matrix(${value.join(' ')})`
}

function localPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'>): ScreenPoint | null {
  if (!surface.value) return null
  const bounds = surface.value.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function isLockedByOther(drawingId: string) {
  const lock = props.locks[drawingId]
  return Boolean(lock && lock.clientId !== props.currentClientId)
}

function placeObject(event: PointerEvent) {
  if (!props.placementMode || event.button !== 0 || event.target !== surface.value) return
  const point = localPoint(event)
  const transform = point ? defaultMapObjectTransform(point, props.unproject) : null
  if (!transform) return
  event.preventDefault()
  emit('place', transform)
}

function startEdit(event: PointerEvent, drawingId: string, mode: EditMode) {
  if (event.button !== 0 || isLockedByOther(drawingId)) return
  const point = localPoint(event)
  const object = projectedObjects.value.find((candidate) => candidate.drawing.id === drawingId)
  if (!point || !object) return
  event.preventDefault()
  event.stopPropagation()
  const center = object.projected.center
  active = {
    pointerId: event.pointerId,
    drawingId,
    mode,
    startPoint: point,
    startTransform: { ...object.transform },
    startAngle: Math.atan2(point.y - center.y, point.x - center.x),
    startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)),
  }
  surface.value?.setPointerCapture?.(event.pointerId)
  emit('select', drawingId)
  emit('editStart', drawingId)
}

function moveEdit(event: PointerEvent) {
  if (!active || event.pointerId !== active.pointerId) return
  const point = localPoint(event)
  if (!point) return
  const current = { ...active.startTransform }
  const projected = projectedObjects.value.find((candidate) => candidate.drawing.id === active!.drawingId)?.projected
  if (!projected) return
  if (active.mode === 'drag') {
    const startCoordinate = props.unproject(active.startPoint)
    const currentCoordinate = props.unproject(point)
    if (!startCoordinate || !currentCoordinate) return
    current.centerLng += currentCoordinate.lng - startCoordinate.lng
    current.centerLat += currentCoordinate.lat - startCoordinate.lat
  } else if (active.mode === 'resize') {
    const ratio = Math.max(0.0001, Math.hypot(point.x - projected.center.x, point.y - projected.center.y) / active.startDistance)
    current.widthMeters *= ratio
    current.heightMeters *= ratio
  } else {
    const angle = Math.atan2(point.y - projected.center.y, point.x - projected.center.x)
    current.rotationDeg += (angle - active.startAngle) * 180 / Math.PI
  }
  draftTransforms.value = { ...draftTransforms.value, [active.drawingId]: current }
  emit('preview', active.drawingId, current)
}

function finishEdit(event: PointerEvent) {
  if (!active || event.pointerId !== active.pointerId) return
  moveEdit(event)
  const editing = active
  const transform = draftTransforms.value[editing.drawingId] ?? editing.startTransform
  active = null
  if (surface.value?.hasPointerCapture?.(event.pointerId)) surface.value.releasePointerCapture(event.pointerId)
  emit('change', editing.drawingId, transform)
}

function cancelEdit(event: PointerEvent) {
  if (!active || event.pointerId !== active.pointerId) return
  const editing = active
  const next = { ...draftTransforms.value }
  delete next[editing.drawingId]
  draftTransforms.value = next
  active = null
  emit('editEnd', editing.drawingId)
}
</script>

<template>
  <svg
    ref="surface"
    class="map-object-overlay"
    :class="{ 'is-placing': placementMode }"
    aria-label="지도 스티커와 이미지 레이어"
    @pointerdown="placeObject"
    @pointermove="moveEdit"
    @pointerup="finishEdit"
    @pointercancel="cancelEdit"
  >
    <g
      v-for="item in projectedObjects"
      :key="item.drawing.id"
      class="map-object"
      :class="{
        'is-selected': selectedId === item.drawing.id,
        'is-locked': isLockedByOther(item.drawing.id),
      }"
    >
      <g :transform="matrix(item.projected.matrix)" @pointerdown="startEdit($event, item.drawing.id, 'drag')">
        <rect class="map-object-hitbox" x="-.5" y="-.5" width="1" height="1" rx=".08" />
        <svg v-if="item.drawing.drawingType === 'STICKER' && item.drawing.stickerCode" x="-.5" y="-.5" width="1" height="1" viewBox="0 0 64 64" overflow="visible">
          <use :href="stickerHref(item.drawing.stickerCode) ?? undefined" />
        </svg>
        <image
          v-else-if="item.drawing.drawingType === 'IMAGE' && item.drawing.mediaFileId && imageUrls[item.drawing.mediaFileId]"
          class="map-object-image"
          x="-.5"
          y="-.5"
          width="1"
          height="1"
          preserveAspectRatio="xMidYMid slice"
          :href="imageUrls[item.drawing.mediaFileId]"
        />
        <rect v-else class="map-object-placeholder" x="-.5" y="-.5" width="1" height="1" />
        <rect v-if="isLockedByOther(item.drawing.id)" class="map-object-lock-mask" x="-.5" y="-.5" width="1" height="1" />
      </g>

      <template v-if="selectedId === item.drawing.id && !isLockedByOther(item.drawing.id)">
        <polygon class="map-object-selection" :points="item.projected.corners.map(point => `${point.x},${point.y}`).join(' ')" />
        <circle
          v-for="(corner, index) in item.projected.corners"
          :key="index"
          class="map-object-handle"
          :cx="corner.x"
          :cy="corner.y"
          r="7"
          @pointerdown="startEdit($event, item.drawing.id, 'resize')"
        />
        <line
          class="map-object-rotation-line"
          :x1="item.projected.center.x"
          :y1="item.projected.center.y"
          :x2="item.projected.rotationHandle.x"
          :y2="item.projected.rotationHandle.y"
        />
        <circle
          class="map-object-rotation-handle"
          :cx="item.projected.rotationHandle.x"
          :cy="item.projected.rotationHandle.y"
          r="8"
          @pointerdown="startEdit($event, item.drawing.id, 'rotate')"
        />
      </template>
    </g>

    <g v-for="cursor in projectedCursors" :key="cursor.clientId" class="map-remote-cursor" :transform="`translate(${cursor.point.x} ${cursor.point.y})`">
      <path :fill="cursor.color" d="M0 0 2 24 8 17 14 27 19 24 13 14 22 12Z" />
      <text :x="12" :y="-6" :fill="cursor.color">{{ cursor.displayName }}</text>
    </g>
  </svg>
</template>

<style scoped>
.map-object-overlay {
  height: 100%;
  inset: 0;
  pointer-events: none;
  position: absolute;
  touch-action: none;
  width: 100%;
  z-index: 4;
}

.map-object-overlay.is-placing {
  cursor: copy;
  pointer-events: auto;
}

.map-object,
.map-object-handle,
.map-object-rotation-handle {
  pointer-events: auto;
}

.map-object:not(.is-locked) {
  cursor: move;
}

.map-object.is-locked {
  cursor: not-allowed;
}

.map-object-hitbox {
  fill: transparent;
  pointer-events: all;
  stroke: transparent;
  stroke-width: 16;
  vector-effect: non-scaling-stroke;
}

.map-object-image {
  pointer-events: none;
}

.map-object-placeholder {
  fill: rgba(148, 163, 184, .45);
  stroke: #64748b;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}

.map-object-lock-mask {
  fill: rgba(15, 23, 42, .25);
  pointer-events: none;
}

.map-object-selection {
  fill: none;
  pointer-events: none;
  stroke: #2563eb;
  stroke-dasharray: 5 4;
  stroke-width: 2;
}

.map-object-handle,
.map-object-rotation-handle {
  fill: #fff;
  stroke: #2563eb;
  stroke-width: 2;
}

.map-object-handle { cursor: nwse-resize; }
.map-object-rotation-handle { cursor: grab; }
.map-object-rotation-line { pointer-events: none; stroke: #2563eb; stroke-width: 2; }

.map-remote-cursor {
  pointer-events: none;
}

.map-remote-cursor path {
  stroke: #fff;
  stroke-linejoin: round;
  stroke-width: 2;
}

.map-remote-cursor text {
  font-size: 12px;
  font-weight: 800;
  paint-order: stroke;
  stroke: #fff;
  stroke-width: 4px;
}
</style>
