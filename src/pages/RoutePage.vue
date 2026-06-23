<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { geoApi } from '@/api/geo.api'
import { aiApi } from '@/api/ai.api'
import { chatApi } from '@/api/chat.api'
import { planningApi } from '@/api/planning.api'
import { tripApi } from '@/api/trip.api'
import { dayPlanLabel, toDayPlans } from '@/components/itinerary/itineraryViewModel'
import type { DayPlanViewModel, RouteStopViewModel } from '@/components/itinerary/itineraryViewModel'
import MapboxItineraryMap from '@/components/map/MapboxItineraryMap.vue'
import type { ItineraryMapStop } from '@/components/map/MapboxItineraryMap.vue'
import type { MapDrawingDraft, MapDrawingStroke, MapDrawingTool } from '@/components/map/MapDrawingOverlay.vue'
import PlaceDiscoveryPanel from '@/components/place/PlaceDiscoveryPanel.vue'
import { getAiRefreshTargets } from './routeBackendSync'
import { useItinerary } from '@/composables/useItinerary'
import { useMapViewport } from '@/composables/useMapViewport'
import { placeApi } from '@/api/place.api'
import { useDrawingPreviewChannel } from '@/realtime/drawingPreview'
import { resolveWebSocketUrl, StompTransport } from '@/realtime/stompTransport'
import { useTripStore } from '@/stores/trip.store'
import type { AiChatMessage } from '@/types/ai'
import type { TripChatMessage } from '@/types/chat'
import type { Checklist, Note, PlanningScope } from '@/types/planning'
import type { DrawingPreviewEvent } from '@/types/collaboration'
import type { ParkingType, Place, PlaceAccessibility } from '@/types/place'

/* ── RoutePage 내부 전용 타입 ── */
type RouteStop = RouteStopViewModel
type DayPlan = DayPlanViewModel
interface RouteLink {
  id: string
  fromItemId: string
  toItemId: string
}

interface ItineraryHistoryState {
  domain: 'itinerary'
  plans: DayPlan[]
}

interface RouteLinksHistoryState {
  domain: 'route-links'
  links: RouteLink[]
}

interface DrawingHistoryState {
  domain: 'drawing'
  drawings: MapDrawingStroke[]
  drawingRetryIds: string[]
}

type RouteHistoryState = ItineraryHistoryState | RouteLinksHistoryState | DrawingHistoryState
type RouteHistoryDomain = RouteHistoryState['domain']

/* ── Data ── */
const route = useRoute()
const tripIdParam = route.params.tripId
const tripId = Array.isArray(tripIdParam) ? tripIdParam[0] ?? '' : tripIdParam ?? ''
const itinerary = useItinerary(tripId)
const mapViewport = useMapViewport()
const tripStore = useTripStore()
const currentUserId = computed(() => {
  const token = localStorage.getItem('accessToken')
  if (!token) return null
  try {
    const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? ''
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { sub?: string; userId?: string }
    return claims.userId ?? claims.sub ?? null
  } catch {
    return null
  }
})
const trip = computed(() => {
  const detail = tripStore.currentTrip?.id === tripId ? tripStore.currentTrip : null
  return {
    title: detail?.title ?? '여행',
    destinationName: detail?.displayDestination ?? '',
    statusLabel: detail?.status === 'ARCHIVED' ? '보관된 여행' : '진행 중인 여행',
    members: (detail?.members ?? [])
      .filter((member) => member.status === 'ACTIVE')
      .map((member) => ({
        id: member.id,
        displayName: member.user.displayName,
        profileImageUrl: member.user.profileImageUrl,
      })),
  }
})
const dayPlans = ref<DayPlan[]>([])
const placeAccessibilityByKey = ref<Record<string, PlaceAccessibility>>({})
let accessibilityRequestRevision = 0

function placeAccessibilityKey(provider: string, externalPlaceId: string) {
  return `${provider}:${externalPlaceId}`
}

async function loadRouteAccessibility(plans: DayPlan[]) {
  const revision = ++accessibilityRequestRevision
  const unique = new Map<string, { provider: 'KTO'; externalPlaceId: string }>()
  plans.forEach((day) => day.items.forEach((item) => {
    if (item.placeProvider !== 'KTO' || !item.placeExternalId) return
    const key = placeAccessibilityKey(item.placeProvider, item.placeExternalId)
    unique.set(key, { provider: 'KTO', externalPlaceId: item.placeExternalId })
  }))
  if (unique.size === 0) {
    placeAccessibilityByKey.value = {}
    return
  }
  try {
    const result = await placeApi.getAccessibilityBatch([...unique.values()])
    if (revision === accessibilityRequestRevision) placeAccessibilityByKey.value = result
  } catch {
    if (revision === accessibilityRequestRevision) placeAccessibilityByKey.value = {}
  }
}

const mapStops = computed<ItineraryMapStop[]>(() => {
  let index = 1
  return dayPlans.value.flatMap((day) => day.items.flatMap((item) => {
    const currentIndex = index++
    if (item.lat == null || item.lng == null) return []
    return [{
      id: item.id,
      placeProvider: item.placeProvider,
      placeId: item.placeExternalId,
      title: item.title,
      dayIndex: day.day,
      index: currentIndex,
      lat: item.lat,
      lng: item.lng,
      image: item.thumbnailUrl ?? '',
      accessibility: item.placeProvider && item.placeExternalId
        ? placeAccessibilityByKey.value[placeAccessibilityKey(item.placeProvider, item.placeExternalId)]
        : undefined,
    }]
  }))
})
const discoveryBbox = computed(() => {
  const viewport = mapViewport.viewport.value
  if (viewport) {
    return `${viewport.minLng},${viewport.minLat},${viewport.maxLng},${viewport.maxLat}`
  }
  if (mapStops.value.length > 0) {
    const lngs = mapStops.value.map((stop) => stop.lng)
    const lats = mapStops.value.map((stop) => stop.lat)
    return `${Math.min(...lngs)},${Math.min(...lats)},${Math.max(...lngs)},${Math.max(...lats)}`
  }
  return '127.18,36.15,127.59,36.55'
})

const activeDay = ref(0)
const activePlan = computed(() => dayPlans.value.find((day) => day.day === activeDay.value) ?? null)
const itineraryLoadError = ref(false)
const itineraryActionsDisabled = computed(() => itinerary.loading.value || itinerary.mutating.value || itineraryLoadError.value)
const dayColors = ['day-color-1', 'day-color-2', 'day-color-3', 'day-color-4', 'day-color-5']
function getDayColorClass(day: number) { return day <= 0 ? dayColors[4] : dayColors[(day - 1) % dayColors.length] }

async function loadItinerary() {
  if (!tripId) {
    itineraryLoadError.value = true
    return
  }
  itineraryLoadError.value = false
  try {
    await itinerary.fetchItinerary()
  } catch {
    itineraryLoadError.value = true
  }
}

async function loadTrip() {
  if (!tripId) return
  try {
    await tripStore.fetchTrip(tripId)
  } catch {
    itineraryActionError.value = '여행 정보를 불러오지 못했습니다.'
  }
}

watch(itinerary.days, (days) => {
  dayPlans.value = toDayPlans(days)
  void loadRouteAccessibility(dayPlans.value)
  if (activeDay.value !== 0 && !dayPlans.value.some((day) => day.day === activeDay.value)) {
    activeDay.value = 0
  }
  if (!dayPlans.value.some((day) => day.day === customDay.value)) {
    customDay.value = dayPlans.value[0]?.day ?? 1
  }
  nextTick(() => {
    initDragDrop()
  })
}, { deep: true })

onMounted(() => {
  void loadTrip()
  void loadItinerary()
  void loadConversations()
  void loadNote()
  void loadChecklists()
  nextTick(() => {
    initDragDrop()
  })
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

/* ── Undo / Redo ── */
const HISTORY_LIMIT = 5
const undoStack = ref<RouteHistoryState[]>([])
const redoStack = ref<RouteHistoryState[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function cloneHistoryValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function currentHistoryState(domain: RouteHistoryDomain): RouteHistoryState {
  if (domain === 'itinerary') {
    return { domain, plans: cloneHistoryValue(dayPlans.value) }
  }
  if (domain === 'route-links') {
    return { domain, links: cloneHistoryValue(routeLinks.value) }
  }
  return {
    domain,
    drawings: cloneHistoryValue(localDrawings.value),
    drawingRetryIds: [...drawingRetryIds.value],
  }
}

function pushHistoryState(stack: RouteHistoryState[], state: RouteHistoryState) {
  stack.push(state)
  if (stack.length > HISTORY_LIMIT) stack.shift()
}

function pushUndoState(domain: RouteHistoryDomain) {
  pushHistoryState(undoStack.value, currentHistoryState(domain))
  redoStack.value = []
}

function restoreDrawingState(state: DrawingHistoryState) {
  localDrawings.value = state.drawings.map((drawing) => {
    const simplified = simplifiedDrawingCoordinates.get(drawing.id)
    return simplified ? { ...drawing, coordinates: simplified } : drawing
  })
  const drawingIds = new Set(localDrawings.value.map((drawing) => drawing.id))
  drawingRetryIds.value = state.drawingRetryIds
    .filter((id) => drawingIds.has(id) && !simplifiedDrawingCoordinates.has(id))
  localDrawings.value.forEach((drawing) => {
    if (
      !simplifiedDrawingCoordinates.has(drawing.id)
      && !pendingDrawingIds.value.includes(drawing.id)
      && !drawingRetryIds.value.includes(drawing.id)
    ) {
      void simplifyLocalDrawing(drawing.id)
    }
  })
}

async function undo() {
  if (!canUndo.value || itinerary.mutating.value) return
  const previous = undoStack.value.pop()!
  pushHistoryState(redoStack.value, currentHistoryState(previous.domain))
  if (previous.domain === 'drawing') {
    restoreDrawingState(previous)
    return
  }
  if (previous.domain === 'route-links') {
    routeLinks.value = previous.links
    pendingRouteFrom.value = null
    nextTick(initDragDrop)
    return
  }
  const plansChanged = JSON.stringify(dayPlans.value) !== JSON.stringify(previous.plans)
  dayPlans.value = previous.plans
  pendingRouteFrom.value = null
  nextTick(initDragDrop)
  if (plansChanged) await persistItineraryOrder()
}

async function redo() {
  if (!canRedo.value || itinerary.mutating.value) return
  const next = redoStack.value.pop()!
  pushHistoryState(undoStack.value, currentHistoryState(next.domain))
  if (next.domain === 'drawing') {
    restoreDrawingState(next)
    return
  }
  if (next.domain === 'route-links') {
    routeLinks.value = next.links
    pendingRouteFrom.value = null
    nextTick(initDragDrop)
    return
  }
  const plansChanged = JSON.stringify(dayPlans.value) !== JSON.stringify(next.plans)
  dayPlans.value = next.plans
  pendingRouteFrom.value = null
  nextTick(initDragDrop)
  if (plansChanged) await persistItineraryOrder()
}

function isTextEditingTarget(target: EventTarget | null) {
  return target instanceof Element
    && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

function handleKeydown(e: KeyboardEvent) {
  if (isTextEditingTarget(e.target)) return
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); void undo()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
    e.preventDefault(); void redo()
  }
}

/* ── Route Links ── */
const routeLinks = ref<RouteLink[]>([])
const pendingRouteFrom = ref<string | null>(null)

watch(itinerary.routes, (routes) => {
	routeLinks.value = routes.map(route => ({
		id: route.id,
		fromItemId: route.originItineraryItemId,
		toItemId: route.destinationItineraryItemId,
	}))
}, { deep: true, immediate: true })

function getLinkedPartner(itemId: string): string | null {
  const link = routeLinks.value.find(l => l.fromItemId === itemId || l.toItemId === itemId)
  if (!link) return null
  return link.fromItemId === itemId ? link.toItemId : link.fromItemId
}

function hasRouteLinkBetween(id1: string | undefined, id2: string | undefined): boolean {
  if (!id1 || !id2) return false
  return routeLinks.value.some(l =>
    (l.fromItemId === id1 && l.toItemId === id2) ||
    (l.fromItemId === id2 && l.toItemId === id1)
  )
}

async function removeRouteLinkBetween(id1: string, id2: string) {
	const link = routeLinks.value.find(l =>
		(l.fromItemId === id1 && l.toItemId === id2) || (l.fromItemId === id2 && l.toItemId === id1)
	)
	if (!link || itinerary.mutating.value) return
	pushUndoState('route-links')
	try {
		await itinerary.deleteRoute(link.id)
		showToast('경로 연결이 해제되었습니다')
	} catch {
		itineraryActionError.value = '경로 연결을 해제하지 못했습니다.'
	}
}

async function handleRoutePenClick(item: RouteStop) {
  if (!pendingRouteFrom.value) {
    pendingRouteFrom.value = item.id
    showToast('연결할 도착 지점을 선택하세요')
    return
  }
  if (pendingRouteFrom.value === item.id) {
    pendingRouteFrom.value = null
    return
  }
  if (hasRouteLinkBetween(pendingRouteFrom.value, item.id)) {
    showToast('이미 연결된 경로입니다')
    pendingRouteFrom.value = null
    return
  }
	const origin = dayPlans.value.flatMap(day => day.items).find(candidate => candidate.id === pendingRouteFrom.value)
	if (!origin || origin.lat == null || origin.lng == null || item.lat == null || item.lng == null) {
		showToast('좌표가 있는 두 장소만 경로로 연결할 수 있습니다')
		pendingRouteFrom.value = null
		return
	}
	pushUndoState('route-links')
	try {
		await itinerary.mapMatchRoute({
			originItineraryItemId: origin.id,
			destinationItineraryItemId: item.id,
			mode: 'WALKING',
			coordinates: [{ lng: origin.lng, lat: origin.lat }, { lng: item.lng, lat: item.lat }],
			tidy: true,
		})
		showToast('경로가 연결되었습니다')
	} catch {
		itineraryActionError.value = '경로를 계산하지 못했습니다.'
	}
	pendingRouteFrom.value = null
}

function handleStopClick(item: RouteStop) {
  if (activeTool.value === 'route-pen') {
		void handleRoutePenClick(item)
    return
  }
  if (item.placeExternalId) selectPlace(item.placeExternalId)
}

/* ── Drag & Drop (data-driven) ── */
const itineraryRef = ref<HTMLElement | null>(null)
const dayTabsRef = ref<HTMLElement | null>(null)

function scrollDayTabs(direction: 'prev' | 'next') {
  const el = dayTabsRef.value
  if (!el) return
  const delta = el.clientWidth * 0.8
  el.scrollBy({ left: direction === 'next' ? delta : -delta, behavior: 'smooth' })
}

interface DragSource {
  type: 'stop' | 'separator'
  dayIdx: number
  itemIdx: number
  dayNum: number
}

function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  if (
    e.button !== 0 || (
      !(e.target as HTMLElement).closest('.grip-icon') &&
      !(e.target as HTMLElement).closest('.stop-num')
    )
  ) return
  if (itinerary.mutating.value) return

  const stop = (e.currentTarget as HTMLElement)
  const containerEl = itineraryRef.value
  if (!containerEl) return
  const dragContainer: HTMLElement = containerEl

  stop.setPointerCapture(e.pointerId)

  // Identify drag source from data attributes
  const isDraggingSeparator = stop.classList.contains('day-separator')
  let source: DragSource | null = null

  if (isDraggingSeparator) {
    const dayNum = parseInt(stop.getAttribute('data-day') || '1')
    const dayIdx = dayPlans.value.findIndex(d => d.day === dayNum)
    source = { type: 'separator', dayIdx: dayIdx === -1 ? 0 : dayIdx, itemIdx: -1, dayNum }
  } else {
    const stepId = stop.getAttribute('data-step-id')
    for (let di = 0; di < dayPlans.value.length; di++) {
      const ii = dayPlans.value[di].items.findIndex(item => item.id === stepId)
      if (ii !== -1) {
        source = { type: 'stop', dayIdx: di, itemIdx: ii, dayNum: dayPlans.value[di].day }
        break
      }
    }
  }

  if (!source) return

  const containerRect = dragContainer.getBoundingClientRect()
  const stopRect = stop.getBoundingClientRect()
  const offsetY = e.clientY - stopRect.top
  const originalY = stopRect.top - containerRect.top

  stop.classList.add('is-dragging')
  stop.style.zIndex = '100'
  stop.style.width = stopRect.width + 'px'
  stop.style.position = 'relative'
  stop.style.top = '0px'

  if (isDraggingSeparator) {
    dragContainer.classList.add('dragging-separator')
  } else {
    dragContainer.classList.add('dragging-stop')
  }

  const allItems = Array.from(dragContainer.querySelectorAll('.stop:not(.is-dragging), .day-separator:not(.is-dragging)'))

  function onPointerMove(ev: PointerEvent) {
    let absoluteY = ev.clientY - containerRect.top - offsetY
    const maxTop = containerRect.height - stopRect.height
    absoluteY = Math.max(0, Math.min(absoluteY, maxTop))
    stop.style.top = (absoluteY - originalY) + 'px'

    const dragCenter = ev.clientY - offsetY + stopRect.height / 2
    let targetIdx = allItems.length
    for (let i = 0; i < allItems.length; i++) {
      const itemRect = (allItems[i] as HTMLElement).getBoundingClientRect()
      const itemCenter = itemRect.top + itemRect.height / 2
      if (dragCenter < itemCenter) {
        targetIdx = i
        break
      }
    }

    allItems.forEach((item) => {
      item.classList.remove('is-drag-over-top', 'is-drag-over-bottom')
    })
    if (targetIdx < allItems.length) {
      allItems[targetIdx].classList.add('is-drag-over-top')
    } else if (allItems.length > 0) {
      allItems[allItems.length - 1].classList.add('is-drag-over-bottom')
    }
  }

  function onPointerUp(ev: PointerEvent) {
    stop.removeEventListener('pointermove', onPointerMove)
    stop.removeEventListener('pointerup', onPointerUp)

    const dragCenter = ev.clientY - offsetY + stopRect.height / 2
    let targetIdx = allItems.length
    for (let i = 0; i < allItems.length; i++) {
      const itemRect = (allItems[i] as HTMLElement).getBoundingClientRect()
      const itemCenter = itemRect.top + itemRect.height / 2
      if (dragCenter < itemCenter) {
        targetIdx = i
        break
      }
    }

    // Reset visual state (no DOM reorder — let Vue handle it)
    stop.classList.remove('is-dragging')
    stop.style.zIndex = ''
    stop.style.width = ''
    stop.style.position = ''
    stop.style.top = ''

    dragContainer.classList.remove('dragging-separator', 'dragging-stop')
    dragContainer.querySelectorAll('.stop, .day-separator').forEach((item) => {
      item.classList.remove('is-drag-over', 'is-drag-over-separator', 'is-drag-over-top', 'is-drag-over-bottom')
    })

    // Update data model directly
    if (activeDay.value === 0) {
      reorderAllDays(source!, targetIdx)
    } else {
      reorderSingleDay(source!, targetIdx)
    }
    void persistItineraryOrder()

    nextTick(() => {
      initDragDrop()
    })
  }

  stop.addEventListener('pointermove', onPointerMove)
  stop.addEventListener('pointerup', onPointerUp)
}

/** 전체 보기: flat list 기반 재배치 */
function reorderAllDays(source: DragSource, targetIdx: number) {
  pushUndoState('itinerary')
  // Build flat ordered list from current data
  const flatList: { type: 'separator' | 'stop'; dayIdx: number; itemIdx: number }[] = []
  dayPlans.value.forEach((day, di) => {
    flatList.push({ type: 'separator', dayIdx: di, itemIdx: -1 })
    day.items.forEach((_, ii) => {
      flatList.push({ type: 'stop', dayIdx: di, itemIdx: ii })
    })
  })

  // Find source in flat list
  const sourceFlatIdx = flatList.findIndex(item => {
    if (source.type === 'separator') {
      return item.type === 'separator' && item.dayIdx === source.dayIdx
    }
    return item.type === 'stop' && item.dayIdx === source.dayIdx && item.itemIdx === source.itemIdx
  })
  if (sourceFlatIdx === -1) return

  // Find linked partner in flat list
  const sourceItemId = source.type === 'stop' ? dayPlans.value[source.dayIdx]?.items[source.itemIdx]?.id : null
  const partnerId = sourceItemId ? getLinkedPartner(sourceItemId) : null
  let partnerFlatIdx = -1
  if (partnerId) {
    partnerFlatIdx = flatList.findIndex((fi, i) => {
      if (i === sourceFlatIdx || fi.type !== 'stop') return false
      return dayPlans.value[fi.dayIdx]?.items[fi.itemIdx]?.id === partnerId
    })
  }

  // Remove source (and partner if linked)
  const toRemoveIdxs = partnerFlatIdx === -1
    ? [sourceFlatIdx]
    : sourceFlatIdx < partnerFlatIdx ? [sourceFlatIdx, partnerFlatIdx] : [partnerFlatIdx, sourceFlatIdx]
  const removed = toRemoveIdxs.map(i => flatList[i])
  for (let i = toRemoveIdxs.length - 1; i >= 0; i--) flatList.splice(toRemoveIdxs[i], 1)

  // Adjust targetIdx: it was relative to allItems (excluded source, included partner)
  let adjustedTarget = targetIdx
  if (partnerFlatIdx !== -1) {
    const partnerInAllItems = sourceFlatIdx < partnerFlatIdx ? partnerFlatIdx - 1 : partnerFlatIdx
    if (adjustedTarget > partnerInAllItems) adjustedTarget--
  }

  // Insert removed items at target
  for (let i = 0; i < removed.length; i++) {
    flatList.splice(adjustedTarget + i, 0, removed[i])
  }

  // Convert flat list back to dayPlans
  const originalPlans = [...dayPlans.value]
  const originalDates = originalPlans.map(d => d.date)
  const newPlans: DayPlan[] = []
  let currentItems: RouteStop[] = []

  for (const item of flatList) {
    if (item.type === 'separator') {
      if (newPlans.length > 0 || currentItems.length > 0) {
        const sourcePlan = originalPlans[newPlans.length]
        const dayNum = sourcePlan?.day ?? newPlans.length + 1
        newPlans.push({
          id: sourcePlan?.id ?? `local-day-${dayNum}`,
          groupType: sourcePlan?.groupType ?? 'DAY',
          day: dayNum,
          date: originalDates[newPlans.length] || '',
          items: currentItems.map((it, idx) => ({ ...it, order: idx + 1, day: dayNum }))
        })
        currentItems = []
      }
    } else {
      const originalItem = dayPlans.value[item.dayIdx]?.items[item.itemIdx]
      if (originalItem) {
        currentItems.push({ ...originalItem })
      }
    }
  }
  // Last day
  if (currentItems.length > 0 || newPlans.length < originalDates.length) {
    const sourcePlan = originalPlans[newPlans.length]
    const dayNum = sourcePlan?.day ?? newPlans.length + 1
    newPlans.push({
      id: sourcePlan?.id ?? `local-day-${dayNum}`,
      groupType: sourcePlan?.groupType ?? 'DAY',
      day: dayNum,
      date: originalDates[newPlans.length] || '',
      items: currentItems.map((it, idx) => ({ ...it, order: idx + 1, day: dayNum }))
    })
  }

  dayPlans.value = newPlans
}

/** 특정 일차: 같은 날 내에서 순서만 변경 */
function reorderSingleDay(source: DragSource, targetIdx: number) {
  pushUndoState('itinerary')
  const plan = dayPlans.value[source.dayIdx]
  if (!plan) return

  const items = [...plan.items]
  const [moved] = items.splice(source.itemIdx, 1)
  const insertAt = Math.min(targetIdx, items.length)
  items.splice(insertAt, 0, moved)
  plan.items = items.map((it, idx) => ({ ...it, order: idx + 1 }))
}

async function persistItineraryOrder() {
  if (dayPlans.value.length === 0) return
  itineraryActionError.value = ''
  try {
    await itinerary.reorder({
      days: dayPlans.value.map((day, dayIndex) => ({
        dayId: day.id,
        sortOrder: dayIndex,
        itemOrders: day.items.map((item, itemIndex) => ({
          itemId: item.id,
          sortOrder: itemIndex,
        })),
      })),
    })
  } catch {
    itineraryActionError.value = '일정 순서를 저장하지 못해 최신 상태로 되돌렸습니다.'
    undoStack.value = []
    redoStack.value = []
    await loadItinerary()
  }
}

/* 드래그앤드롭 초기화 */
function initDragDrop() {
	// Vue template의 pointer/drag 이벤트로 직접 연결한다.
}

const nativeDragSource = ref<{ dayId: string; itemId: string } | null>(null)

function startNativeStopDrag(event: DragEvent, dayId: string, itemId: string) {
	if (itinerary.mutating.value) {
		event.preventDefault()
		return
	}
	nativeDragSource.value = { dayId, itemId }
	event.dataTransfer?.setData('text/plain', itemId)
	if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function finishNativeStopDrag() {
	nativeDragSource.value = null
}

function dropNativeStop(targetDayId: string, targetItemId?: string) {
	const source = nativeDragSource.value
	if (!source || itinerary.mutating.value) return
	const sourceDay = dayPlans.value.find(day => day.id === source.dayId)
	const targetDay = dayPlans.value.find(day => day.id === targetDayId)
	const moved = sourceDay?.items.find(item => item.id === source.itemId)
	if (!sourceDay || !targetDay || !moved) return
	if (source.dayId === targetDayId && source.itemId === targetItemId) return

	pushUndoState('itinerary')
	sourceDay.items = sourceDay.items.filter(item => item.id !== source.itemId)
	const targetIndex = targetItemId
		? Math.max(0, targetDay.items.findIndex(item => item.id === targetItemId))
		: targetDay.items.length
	targetDay.items.splice(targetIndex, 0, { ...moved, day: targetDay.day })
	dayPlans.value = dayPlans.value.map(day => ({
		...day,
		items: day.items.map((item, index) => ({ ...item, day: day.day, order: index + 1 })),
	}))
	nativeDragSource.value = null
	void persistItineraryOrder()
}

/* activeDay 변경 시 드래그 재초기화 + 지도 다시 그리기 */
watch(activeDay, () => {
  nextTick(() => {
    initDragDrop()
  })
})

/* ── Panels ── */
const isAiChatOpen = ref(false)
const isMemoOpen = ref(false)
const isTodoOpen = ref(false)
const activeConversation = ref<'ai' | 'chat'>('ai')

function togglePanel(panel: 'ai' | 'memo' | 'todo') {
  if (panel === 'ai') {
    isAiChatOpen.value = !isAiChatOpen.value
    isMemoOpen.value = false
    isTodoOpen.value = false
    if (isAiChatOpen.value) void loadConversations()
  } else if (panel === 'memo') {
    isMemoOpen.value = !isMemoOpen.value
    isAiChatOpen.value = false
    isTodoOpen.value = false
    if (isMemoOpen.value) void loadNote()
  } else {
    isTodoOpen.value = !isTodoOpen.value
    isAiChatOpen.value = false
    isMemoOpen.value = false
    if (isTodoOpen.value) void loadChecklists()
  }
}

/* ── AI / trip chat ── */
const aiMessage = ref('')
const aiMessages = ref<AiChatMessage[]>([])
const chatMessages = ref<TripChatMessage[]>([])
const aiSessionStatus = ref('')
const conversationLoading = ref(false)
const conversationError = ref('')

function oldestFirst<T extends { createdAt: string }>(messages: T[]) {
  return [...messages].sort((left, right) => (
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  ))
}

async function loadConversations() {
  if (!tripId) return
  conversationLoading.value = true
  conversationError.value = ''
  try {
    const [sessionResult, aiResult, chatResult] = await Promise.allSettled([
      aiApi.getSession(tripId),
      aiApi.getMessages(tripId),
      chatApi.getMessages(tripId),
    ])
    if (sessionResult.status === 'fulfilled') aiSessionStatus.value = sessionResult.value.status
    if (aiResult.status === 'fulfilled') aiMessages.value = oldestFirst(aiResult.value.items)
    if (chatResult.status === 'fulfilled') chatMessages.value = oldestFirst(chatResult.value.items)
    if (aiResult.status === 'rejected' || chatResult.status === 'rejected') {
      conversationError.value = '일부 대화 내역을 불러오지 못했습니다.'
    }
  } finally {
    conversationLoading.value = false
  }
}

async function sendAiMessage() {
  const content = aiMessage.value.trim()
  if (!content || conversationLoading.value) return
  aiMessage.value = ''
  conversationLoading.value = true
  conversationError.value = ''
  try {
    if (activeConversation.value === 'ai') {
      const response = await aiApi.sendMessage(tripId, {
        content,
        baseVersion: itinerary.itineraryVersion.value,
        viewport: mapViewport.viewport.value,
      })
      await syncAfterAiResponse(response)
      await loadConversations()
      if (!aiMessages.value.some((message) => message.id === response.message.id)) {
        aiMessages.value.push(response.message)
      }
    } else {
      chatMessages.value.push(await chatApi.sendMessage(tripId, content))
    }
  } catch (error: any) {
    aiMessage.value = content
    const code = error?.response?.data?.code ?? error?.response?.data?.errorCode
    conversationError.value = code === 'AI_PROVIDER_UNAVAILABLE'
      ? 'AI 모델 연결 설정이 필요합니다. 관리자에게 문의해 주세요.'
      : '메시지를 보내지 못했습니다. 다시 시도해 주세요.'
  } finally {
    conversationLoading.value = false
  }
}

async function syncAfterAiResponse(response: import('@/types/ai').AiMessageResponse) {
  const targets = getAiRefreshTargets(response, itinerary.itineraryVersion.value)

  const refreshes: Promise<unknown>[] = []
  if (targets.itinerary) refreshes.push(itinerary.fetchItinerary())
  if (targets.note) refreshes.push(loadNote())
  if (targets.checklist) refreshes.push(loadChecklists())
  await Promise.allSettled(refreshes)
}

/* ── Memo (day-filtered) ── */
const dayTagLabels = computed(() => [
  '전체',
  ...dayPlans.value.filter((day) => day.groupType === 'DAY').map((day) => `${day.day}일차`),
])
const activeMemoDay = ref('전체')
const notes = ref<Record<string, Note | null>>({})
const memoLoading = ref(false)
const memoStatus = ref('')

function scopeForTag(tag: string): PlanningScope {
  if (tag === '전체') return { scopeType: 'TRIP', itineraryDayId: null }
  const dayNumber = Number.parseInt(tag, 10)
  const day = dayPlans.value.find((candidate) => candidate.groupType === 'DAY' && candidate.day === dayNumber)
  return { scopeType: 'DAY', itineraryDayId: day?.id ?? null }
}

async function switchMemoDay(tag: string) {
  activeMemoDay.value = tag
  await loadNote(tag)
}

const memoTextDisplay = ref('')

async function loadNote(tag = activeMemoDay.value) {
  if (!tripId) return
  const scope = scopeForTag(tag)
  if (scope.scopeType === 'DAY' && !scope.itineraryDayId) return
  memoLoading.value = true
  memoStatus.value = ''
  try {
    const note = await planningApi.getNote(tripId, scope)
    notes.value[tag] = note
    memoTextDisplay.value = note?.content ?? ''
  } catch (error: any) {
    if (error?.response?.status === 404) {
      notes.value[tag] = null
      memoTextDisplay.value = ''
    } else {
      memoStatus.value = '불러오기 실패'
    }
  } finally {
    memoLoading.value = false
  }
}

async function saveNote() {
  const content = memoTextDisplay.value.trim()
  const scope = scopeForTag(activeMemoDay.value)
  if (!content || (scope.scopeType === 'DAY' && !scope.itineraryDayId)) return
  memoLoading.value = true
  memoStatus.value = '저장 중…'
  try {
    const result = await planningApi.saveNote(tripId, scope, content)
    notes.value[activeMemoDay.value] = result.note
    memoStatus.value = '저장됨'
  } catch {
    memoStatus.value = '저장 실패'
  } finally {
    memoLoading.value = false
  }
}

async function clearNote() {
  const note = notes.value[activeMemoDay.value]
  if (!note) {
    memoTextDisplay.value = ''
    return
  }
  if (!window.confirm('이 메모를 삭제할까요?')) return
  memoLoading.value = true
  try {
    await planningApi.deleteNote(tripId, note.id)
    notes.value[activeMemoDay.value] = null
    memoTextDisplay.value = ''
    memoStatus.value = '삭제됨'
  } catch {
    memoStatus.value = '삭제 실패'
  } finally {
    memoLoading.value = false
  }
}

/* ── Todo (day-filtered) ── */
const activeTodoDay = ref('전체')
const checklists = ref<Checklist[]>([])
const todoLoading = ref(false)
const todoError = ref('')
const newTodo = ref('')

const activeChecklist = computed(() => {
  const scope = scopeForTag(activeTodoDay.value)
  return checklists.value.find((list) => (
    list.scopeType === scope.scopeType && (list.itineraryDayId ?? null) === (scope.itineraryDayId ?? null)
  )) ?? null
})
const currentTodos = computed(() => (activeChecklist.value?.items ?? []).map((item) => ({
	id: item.id,
	text: item.content,
	done: item.memberStatuses.some((status) => status.user.id === currentUserId.value && status.isCompleted),
	completedMembers: item.memberStatuses
		.filter((status) => status.isCompleted)
		.map((status) => status.user),
})))
const completedCount = computed(() => currentTodos.value.filter(t => t.done).length)
const totalCount = computed(() => currentTodos.value.length)
const progressPercent = computed(() => totalCount.value === 0 ? 0 : Math.round((completedCount.value / totalCount.value) * 100))

async function loadChecklists() {
  if (!tripId) return
  todoLoading.value = true
  todoError.value = ''
  try {
    checklists.value = await planningApi.getChecklists(tripId)
  } catch {
    todoError.value = '체크리스트를 불러오지 못했습니다.'
  } finally {
    todoLoading.value = false
  }
}

async function addTodo() {
  const content = newTodo.value.trim()
  if (!content || todoLoading.value) return
  todoLoading.value = true
  todoError.value = ''
  try {
    let checklist = activeChecklist.value
    if (!checklist) {
      const created = await planningApi.saveChecklist(tripId, scopeForTag(activeTodoDay.value), `${activeTodoDay.value} 체크리스트`)
      checklist = created.checklist
    }
    if (!checklist) throw new Error('Checklist was not returned')
    await planningApi.addChecklistItem(tripId, checklist.id, content, checklist.items.length)
    newTodo.value = ''
    await loadChecklists()
  } catch {
    todoError.value = '할 일을 추가하지 못했습니다.'
  } finally {
    todoLoading.value = false
  }
}

async function toggleTodo(id: string) {
  const checklist = activeChecklist.value
  const todo = currentTodos.value.find((item) => item.id === id)
  if (!checklist || !todo || todoLoading.value) return
  todoLoading.value = true
  todoError.value = ''
  try {
    await planningApi.updateMyItemStatus(tripId, checklist.id, id, !todo.done)
    await loadChecklists()
  } catch {
    todoError.value = '완료 상태를 변경하지 못했습니다.'
  } finally {
    todoLoading.value = false
  }
}

async function deleteTodo(id: string) {
  const checklist = activeChecklist.value
  if (!checklist || todoLoading.value) return
  todoLoading.value = true
  todoError.value = ''
  try {
    await planningApi.deleteChecklistItem(tripId, checklist.id, id)
    await loadChecklists()
  } catch {
    todoError.value = '할 일을 삭제하지 못했습니다.'
  } finally {
    todoLoading.value = false
  }
}

/* ── Map tools ── */
const routeState = ref<'route' | 'dashed' | 'hidden'>('route')
const cardState = ref<'full' | 'min' | 'hidden'>('full')
const nearbyOn = ref(false)
const drawingOn = ref(true)
const isPenPopoverOpen = ref(false)
const penSize = ref(6)
const penColor = ref('#1f2937')
const activeTool = ref<MapDrawingTool>('cursor')
const localDrawings = ref<MapDrawingStroke[]>([])
const pendingDrawingIds = ref<string[]>([])
const drawingRetryIds = ref<string[]>([])
const simplifiedDrawingCoordinates = new Map<string, MapDrawingStroke['coordinates']>()
const drawingPreviewTransport = new StompTransport({
  brokerUrl: resolveWebSocketUrl(import.meta.env.VITE_WS_URL),
  accessToken: () => localStorage.getItem('accessToken'),
})
const drawingPreviewChannel = useDrawingPreviewChannel({
  tripId,
  clientId: globalThis.crypto?.randomUUID?.() ?? `drawing-client-${Date.now()}`,
  transport: drawingPreviewTransport,
})
const mapDrawings = computed(() => [
  ...localDrawings.value,
  ...drawingPreviewChannel.remoteDrawings.value,
])
let localDrawingSequence = 0

watch(itinerary.mapDrawings, (drawings) => {
	localDrawings.value = drawings.flatMap((drawing) => {
		const geometry = drawing.geometry as { type?: string; coordinates?: unknown }
		if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return []
		const coordinates = geometry.coordinates.flatMap((coordinate) => (
			Array.isArray(coordinate) && typeof coordinate[0] === 'number' && typeof coordinate[1] === 'number'
				? [{ lng: coordinate[0], lat: coordinate[1] }]
				: []
		))
		if (coordinates.length < 2) return []
		return [{
			id: drawing.id,
			coordinates,
			color: typeof drawing.style?.color === 'string' ? drawing.style.color : '#1f2937',
			width: typeof drawing.style?.width === 'number' ? drawing.style.width : 6,
		}]
	})
}, { deep: true, immediate: true })

onMounted(() => {
  if (tripId && localStorage.getItem('accessToken')) drawingPreviewChannel.connect()
})

onUnmounted(() => {
  void drawingPreviewChannel.disconnect()
})

async function simplifyLocalDrawing(drawingId: string) {
  const drawing = localDrawings.value.find((candidate) => candidate.id === drawingId)
  if (!drawing || pendingDrawingIds.value.includes(drawingId)) return
  pendingDrawingIds.value = [...pendingDrawingIds.value, drawingId]
  drawingRetryIds.value = drawingRetryIds.value.filter((id) => id !== drawingId)
  try {
    const simplified = await geoApi.simplifyCoordinates({
      coordinates: drawing.coordinates,
      maxPoints: 100,
    })
    simplifiedDrawingCoordinates.set(drawingId, simplified.coordinates)
    const index = localDrawings.value.findIndex((candidate) => candidate.id === drawingId)
		if (index >= 0) {
			localDrawings.value[index] = { ...localDrawings.value[index], coordinates: simplified.coordinates }
		}
		if (drawingId.startsWith('local-drawing-')) {
			const created = await itinerary.createDrawing({
				itineraryDayId: activePlan.value?.id ?? null,
				drawingType: 'FREEHAND',
				geometry: {
					type: 'LineString',
					coordinates: simplified.coordinates.map(coordinate => [coordinate.lng, coordinate.lat]),
				},
				style: { color: drawing.color, width: drawing.width },
				sortOrder: itinerary.mapDrawings.value.length,
			})
			const currentIndex = localDrawings.value.findIndex(candidate => candidate.id === drawingId)
			if (currentIndex >= 0) localDrawings.value[currentIndex] = { ...localDrawings.value[currentIndex], id: created.id }
		}
  } catch {
    if (localDrawings.value.some((candidate) => candidate.id === drawingId)) {
      if (!drawingRetryIds.value.includes(drawingId)) {
        drawingRetryIds.value = [...drawingRetryIds.value, drawingId]
      }
    }
  } finally {
    pendingDrawingIds.value = pendingDrawingIds.value.filter((id) => id !== drawingId)
  }
}

function createLocalDrawing(draft: MapDrawingDraft) {
  pushUndoState('drawing')
  const drawing: MapDrawingStroke = {
    id: `local-drawing-${++localDrawingSequence}`,
    ...draft,
  }
  localDrawings.value = [...localDrawings.value, drawing]
  void simplifyLocalDrawing(drawing.id)
}

async function eraseLocalDrawing(drawingId: string) {
	if (!localDrawings.value.some((drawing) => drawing.id === drawingId)) return
	pushUndoState('drawing')
	localDrawings.value = localDrawings.value.filter((drawing) => drawing.id !== drawingId)
	drawingRetryIds.value = drawingRetryIds.value.filter((id) => id !== drawingId)
	if (!drawingId.startsWith('local-drawing-')) {
		try {
			await itinerary.deleteDrawing(drawingId)
		} catch {
			itineraryActionError.value = '지도 그림을 삭제하지 못했습니다.'
			await loadItinerary()
		}
	}
}

function publishDrawingPreview(event: DrawingPreviewEvent) {
  drawingPreviewChannel.publish(event)
}

function retryDrawingSimplification() {
  const retryIds = [...drawingRetryIds.value]
  drawingRetryIds.value = []
  retryIds.forEach((drawingId) => void simplifyLocalDrawing(drawingId))
}

function toggleRouteState() {
  const states: Array<'route' | 'dashed' | 'hidden'> = ['route', 'dashed', 'hidden']
  routeState.value = states[(states.indexOf(routeState.value) + 1) % states.length]
}
function toggleCardState() {
  const states: Array<'full' | 'min' | 'hidden'> = ['full', 'min', 'hidden']
  cardState.value = states[(states.indexOf(cardState.value) + 1) % states.length]
}

/* ── Search panel ── */
const isSearchPanelOpen = ref(false)
const showCustomForm = ref(false)

function openSearchPanel() { isSearchPanelOpen.value = true }
function closeSearchPanel() { isSearchPanelOpen.value = false; showCustomForm.value = false }

/* ── Custom schedule form ── */
const customTitle = ref('')
const customDay = ref(1)
const itineraryActionError = ref('')

function targetPlan(dayNumber = customDay.value) {
  return dayPlans.value.find((day) => day.day === dayNumber) ?? dayPlans.value[0] ?? null
}

async function submitCustomSchedule() {
  if (!customTitle.value.trim()) return
  const plan = targetPlan()
  if (!plan) {
    itineraryActionError.value = '일정을 추가할 일차를 먼저 만들어 주세요.'
    return
  }

  itineraryActionError.value = ''
  try {
    await itinerary.createItem({
      itineraryDayId: plan.id,
      sortOrder: plan.items.length,
      itemType: 'CUSTOM_PLACE',
      placeName: customTitle.value.trim(),
    })
    showToast(`"${customTitle.value.trim()}" 일정이 추가되었습니다.`)
    customTitle.value = ''
    showCustomForm.value = false
  } catch {
    itineraryActionError.value = '일정을 추가하지 못했습니다. 다시 시도해 주세요.'
  }
}

async function createNextDay() {
  const scheduledDays = dayPlans.value.filter((day) => day.groupType === 'DAY')
  const nextDayNumber = Math.max(0, ...scheduledDays.map((day) => day.day)) + 1
  const nextSortOrder = Math.max(-1, ...dayPlans.value.map((day) => itinerary.days.value.find((item) => item.id === day.id)?.sortOrder ?? -1)) + 1
  itineraryActionError.value = ''
  try {
    await itinerary.createDay({ groupType: 'DAY', dayNumber: nextDayNumber, sortOrder: nextSortOrder })
    activeDay.value = nextDayNumber
  } catch {
    itineraryActionError.value = '일차를 추가하지 못했습니다. 다시 시도해 주세요.'
  }
}

async function createUnscheduledDay() {
  itineraryActionError.value = ''
  try {
    const day = await itinerary.ensureUnscheduledDay()
    activeDay.value = day.groupType === 'UNSCHEDULED' ? -1 : (day.dayNumber ?? 0)
  } catch {
    itineraryActionError.value = '일차 미정을 만들지 못했습니다. 다시 시도해 주세요.'
  }
}

async function removeDay(plan: DayPlan) {
  if (plan.items.length > 0) {
    itineraryActionError.value = '일정이 남아 있는 일차는 삭제할 수 없습니다.'
    return
  }
  itineraryActionError.value = ''
  try {
    await itinerary.deleteDay(plan.id)
  } catch {
    itineraryActionError.value = '일차를 삭제하지 못했습니다. 다시 시도해 주세요.'
  }
}

async function removeItineraryItem(item: RouteStop) {
  itineraryActionError.value = ''
  try {
    await itinerary.deleteItem(item.id)
    showToast(`"${item.title}" 일정이 삭제되었습니다.`)
  } catch {
    itineraryActionError.value = '일정을 삭제하지 못했습니다. 다시 시도해 주세요.'
  }
}

/* ── Modals ── */
const isInviteModalOpen = ref(false)
const inviteTab = ref('tab-settings')
const inviteLink = ref('')
const inviteLoading = ref(false)
const inviteError = ref('')

async function openTripManagement() {
	isInviteModalOpen.value = true
	inviteError.value = ''
	if (inviteLink.value || !tripId) return
	inviteLoading.value = true
	try {
		const invites = await tripApi.getInvites(tripId)
		const activeInvite = invites.find(invite => invite.status === 'PENDING' && invite.inviteUrl)
		const invite = activeInvite ?? await tripApi.createInvite(tripId)
		inviteLink.value = invite.inviteUrl ?? `${window.location.origin}/trip-invites/${invite.inviteCode}`
	} catch {
		inviteError.value = '초대 링크를 준비하지 못했습니다.'
	} finally {
		inviteLoading.value = false
	}
}

async function copyInviteLink() {
	if (!inviteLink.value) return
	try {
		await navigator.clipboard.writeText(inviteLink.value)
		showToast('초대 링크를 복사했습니다')
	} catch {
		inviteError.value = '초대 링크를 복사하지 못했습니다.'
	}
}
const sidebarTheme = ref('theme-violet')
const isCustomEventModalOpen = ref(false)

/* ── Trip settings ── */
const editTitle = ref('')
const editDestination = ref('')
const tripSettingsLoading = ref(false)
const tripSettingsError = ref('')
watch(trip, (value) => {
	editTitle.value = value.title
	editDestination.value = value.destinationName
}, { immediate: true })

async function saveTripSettings() {
	if (!editTitle.value.trim() || tripSettingsLoading.value) return
	tripSettingsLoading.value = true
	tripSettingsError.value = ''
	try {
		await tripApi.updateTrip(tripId, {
			title: editTitle.value.trim(),
			displayDestination: editDestination.value.trim(),
		})
		await loadTrip()
		showToast('여행 정보를 저장했습니다')
	} catch {
		tripSettingsError.value = '여행 정보를 저장하지 못했습니다.'
	} finally {
		tripSettingsLoading.value = false
	}
}

/* ── Detailbar ── */
const isDetailbarOpen = ref(false)
const selectedPlace = ref<any>(null)
const detailbarMainImg = ref('')

function parkingTypeLabel(type?: ParkingType) {
  return ({
    FREE: '무료',
    PAID: '유료',
    MIXED: '무료·유료',
    NONE: '주차 불가',
    UNKNOWN: '정보 없음',
  } satisfies Record<ParkingType, string>)[type ?? 'UNKNOWN']
}

function hasAccessibilityFlag(accessibility: PlaceAccessibility | undefined, flag: PlaceAccessibility['flags'][number]) {
  return accessibility?.flags.includes(flag) ?? false
}

function hasAccessibilityInfo(accessibility?: PlaceAccessibility) {
  return Boolean(accessibility && (
    accessibility.openingHours
    || accessibility.closedDays
    || accessibility.parkingType !== 'UNKNOWN'
    || accessibility.flags.length > 0
  ))
}

// Make selectPlace available globally for map marker onclick
;(window as any).selectPlace = selectPlace

async function selectPlace(placeId: string) {
  // Route-pen mode: link stops instead of opening detailbar
  if (activeTool.value === 'route-pen') {
    for (const day of dayPlans.value) {
      const item = day.items.find(i => i.placeExternalId === placeId)
      if (item) { handleRoutePenClick(item); return }
    }
    return
  }
  try {
    const place = await placeApi.getPlace('KTO', placeId)
    const accessibility = place.accessibility
      ?? placeAccessibilityByKey.value[placeAccessibilityKey('KTO', place.externalPlaceId)]
    selectedPlace.value = {
      id: place.externalPlaceId,
      title: place.placeName,
      description: place.description || place.summary,
      image: place.thumbnailUrl || '',
      likes: '',
      location: place.address || '',
      photos: place.photos || (place.thumbnailUrl ? [place.thumbnailUrl] : []),
      accessibility,
      contact: place.contact,
      admission: '',
      featuredMenu: '',
      likedBy: [],
      travelStories: [],
    }
    detailbarMainImg.value = selectedPlace.value.image
  } catch (e) {
    return
  }

  isDetailbarOpen.value = true
}

function selectDiscoveredPlace(place: Place) {
  const image = place.thumbnailUrl ?? place.photos?.[0] ?? ''
  const accessibility = place.accessibility
    ?? placeAccessibilityByKey.value[placeAccessibilityKey(place.provider, place.externalPlaceId)]
  selectedPlace.value = {
    id: place.externalPlaceId,
    title: place.placeName,
    description: place.description ?? place.summary ?? '',
    image,
    likes: place.likedBy?.length ?? 0,
    location: place.address ?? '',
    photos: place.photos ?? (image ? [image] : []),
    accessibility,
    contact: place.contact,
    admission: place.admission,
    likedBy: (place.likedBy ?? []).flatMap((reaction) => 'displayName' in reaction
      ? [{ avatar: reaction.profileImageUrl ?? reaction.displayName.slice(0, 1), name: reaction.displayName }]
      : []),
    travelStories: place.travelStories,
  }
  detailbarMainImg.value = image
  isDetailbarOpen.value = true
}

function closeDetailbar() {
  isDetailbarOpen.value = false
  selectedPlace.value = null
}

/* ── Toast ── */
const toastMessage = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toastMessage.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 3000)
}

async function addPlaceToItinerary(place: Place) {
  if (!hasPlaceReference(place)) {
    itineraryActionError.value = '실제 장소 검색 결과만 일정에 추가할 수 있습니다.'
    return
  }
  const plan = targetPlan(activeDay.value === 0 ? (dayPlans.value[0]?.day ?? 1) : activeDay.value)
  if (!plan) {
    itineraryActionError.value = '일정을 추가할 일차를 먼저 만들어 주세요.'
    return
  }
  itineraryActionError.value = ''
  try {
    await itinerary.createItem({
      itineraryDayId: plan.id,
      sortOrder: plan.items.length,
      itemType: 'PLACE',
      place: { provider: place.provider, externalPlaceId: place.externalPlaceId },
      placeName: place.placeName,
      address: place.address ?? null,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      thumbnailUrl: place.thumbnailUrl ?? null,
    })
    showToast(`"${place.placeName}" 일정이 추가되었습니다.`)
  } catch {
    itineraryActionError.value = '일정을 추가하지 못했습니다. 다시 시도해 주세요.'
  }
}

function hasPlaceReference(place: any): place is {
  provider: 'KTO'
  externalPlaceId: string
  placeName: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  thumbnailUrl?: string | null
} {
  return place?.provider === 'KTO' && typeof place.externalPlaceId === 'string' && place.externalPlaceId.length > 0
}

/* ── Toast component ── */
function setDetailbarMainImg(src: string) {
  detailbarMainImg.value = src
}

function avatarStackZIndex(index: unknown) {
  const parsedIndex = Number(index)
  const safeIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0
  return 3 - safeIndex
}

function textAvatarStyle(index: unknown) {
  const parsedIndex = Number(index)
  const safeIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0
  return {
    zIndex: avatarStackZIndex(safeIndex),
    backgroundColor: safeIndex === 0 ? '#ff5c8d' : safeIndex === 1 ? '#0066ff' : '#00e0d1',
  }
}
</script>

<template>
  <AppShell>
    <section class="section full-screen route-page-section">
      <div :class="['map-shell', { 'has-detailbar-open': isDetailbarOpen }]">

          <!-- ═══ SIDEBAR ═══ -->
          <aside class="sidebar">
            <div class="sidebar-content">
              <!-- Trip header card -->
              <div :class="['trip-header-card', sidebarTheme]" id="trip-header-card-container">
                <div class="trip-info-badge-row">
                  <span class="trip-status-badge">{{ trip.statusLabel }}</span>
                </div>
                <h3 class="trip-card-title">{{ trip.title }}</h3>
                <p v-if="trip.destinationName" class="trip-card-dates">
                  <span class="material-symbols-rounded" style="font-size:13px;vertical-align:middle;">location_on</span>
                  <span style="vertical-align:middle;">{{ trip.destinationName }}</span>
                </p>
                <div class="trip-card-divider"></div>
                <div class="trip-stats-grid">
                  <div class="trip-stat-item">
                    <span class="stat-label">선택된 경로</span>
                    <span class="stat-value">{{ dayPlans.reduce((count, day) => count + day.items.length, 0) }}개 코스</span>
                  </div>
                  <div class="trip-stat-item">
                    <span class="stat-label">멤버</span>
                    <span class="stat-value">{{ (trip.members ?? []).length }}명</span>
                  </div>
                </div>
                <div class="trip-card-footer">
                  <div class="avatars-group">
                    <div class="avatars">
                      <span v-for="m in (trip.members ?? []).slice(0, 5)" :key="m.id" class="avatar" :style="!m.profileImageUrl ? { backgroundColor: 'var(--violet)' } : {}" :title="m.displayName ?? ''">
                        <img v-if="m.profileImageUrl" :src="m.profileImageUrl" :alt="m.displayName ?? ''" class="avatar-img" />
                        <template v-else>{{ (m.displayName ?? '?').charAt(0) }}</template>
                      </span>
                    </div>
                    <span class="members-count">{{ (trip.members ?? []).length }}명</span>
                  </div>
				<button class="btn ghost compact-settings-btn" type="button" @click="openTripManagement">
                    <span class="material-symbols-rounded" style="font-size:14px;">settings</span>
                    <span>관리</span>
                  </button>
                </div>
              </div>

              <!-- Day tabs -->
              <div class="day-tabs-container">
                <button class="day-scroll-btn prev" type="button" aria-label="이전 일차" @click="scrollDayTabs('prev')">
                  <span class="material-symbols-rounded">chevron_left</span>
                </button>
                <div class="day-tabs" id="day-tabs-scrollable" ref="dayTabsRef">
                  <button :class="['day-tab', { active: activeDay === 0 }]" type="button" @click="activeDay = 0">
                    <span class="day-title">전체</span>
                  </button>
                  <button v-for="day in dayPlans" :key="day.id"
                    :class="['day-tab', { active: activeDay === day.day }]"
                    type="button" @click="activeDay = day.day">
                    <span class="day-title">{{ dayPlanLabel(day) }}</span>
                    <span class="day-date">{{ day.date }}</span>
                  </button>
                </div>
                <button class="day-scroll-btn next" type="button" aria-label="다음 일차" @click="scrollDayTabs('next')">
                  <span class="material-symbols-rounded">chevron_right</span>
                </button>
              </div>

              <div class="itinerary-day-actions" aria-label="일차 관리">
                <button class="icon-btn" type="button" title="일차 추가" aria-label="일차 추가" :disabled="itineraryActionsDisabled" @click="createNextDay">
                  <span class="material-symbols-rounded" aria-hidden="true">calendar_add_on</span>
                </button>
                <button class="icon-btn" type="button" title="일차 미정 추가" aria-label="일차 미정 추가" :disabled="itineraryActionsDisabled" @click="createUnscheduledDay">
                  <span class="material-symbols-rounded" aria-hidden="true">pending</span>
                </button>
              </div>
              <p v-if="itineraryActionError" class="itinerary-action-error" role="alert">{{ itineraryActionError }}</p>

              <!-- Itinerary -->
              <div class="itinerary" data-sidebar-itinerary ref="itineraryRef">
                <LoadingState v-if="itinerary.loading.value" />
                <ErrorState
                  v-else-if="itineraryLoadError"
                  message="일정을 불러오지 못했습니다."
                  @retry="loadItinerary"
                />
                <EmptyState
                  v-else-if="dayPlans.length === 0"
                  icon="event_busy"
                  message="아직 일정이 없습니다. 일차를 추가해 계획을 시작하세요."
                />
                <!-- 전체 보기 -->
                <template v-else-if="activeDay === 0">
                  <template v-for="day in dayPlans" :key="day.day">
					<div :class="['day-separator', getDayColorClass(day.day)]" :data-day="day.day"
						@pointerdown="onPointerDown" @dragover.prevent @drop.prevent="dropNativeStop(day.id)">
                      <span class="day-pill">{{ dayPlanLabel(day) }}</span>
                      <span class="line"></span>
                      <button
                        v-if="day.items.length === 0"
                        class="itinerary-delete-btn"
                        type="button"
                        :aria-label="`${dayPlanLabel(day)} 삭제`"
                        :disabled="itinerary.mutating.value"
                        @click.stop="removeDay(day)"
                      >
                        <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                      </button>
                      <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                    </div>
                    <template v-for="(item, idx) in day.items" :key="item.id">
                      <div :class="['stop', getDayColorClass(day.day), { 'route-pen-pending': pendingRouteFrom === item.id, 'route-linked': !!getLinkedPartner(item.id) }]"
						:data-step-id="item.id" :data-place-id="item.placeExternalId" draggable="true"
						@pointerdown="onPointerDown"
						@dragstart="startNativeStopDrag($event, day.id, item.id)"
						@dragend="finishNativeStopDrag"
						@dragover.prevent
						@drop.prevent="dropNativeStop(day.id, item.id)"
                        @click.stop="handleStopClick(item)">
                        <span class="stop-num">{{ idx + 1 }}</span>
                        <div>
                          <strong>{{ item.title }}</strong>
                          <span class="small muted">{{ item.time }}</span>
                        </div>
                        <button class="itinerary-delete-btn" type="button" :aria-label="`${item.title} 삭제`" :disabled="itinerary.mutating.value" @click.stop="removeItineraryItem(item)">
                          <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                        </button>
                        <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                      </div>
                      <!-- Route connector between linked adjacent stops -->
                      <div v-if="idx < day.items.length - 1 && hasRouteLinkBetween(item.id, day.items[idx + 1].id)"
                        class="route-connector"
                        @click.stop="removeRouteLinkBetween(item.id, day.items[idx + 1].id)"
                        :title="'경로 연결 해제: ' + item.title + ' → ' + day.items[idx + 1].title">
                        <div class="route-connector-line"></div>
                        <span class="material-symbols-rounded route-unlink-icon">link_off</span>
                        <div class="route-connector-line"></div>
                      </div>
                    </template>
                  </template>
                </template>
                <!-- 특정 일차 -->
                <template v-else-if="activePlan">
				<div :class="['day-separator', getDayColorClass(activeDay)]" :data-day="activeDay"
					@pointerdown="onPointerDown" @dragover.prevent @drop.prevent="dropNativeStop(activePlan.id)">
                    <span class="day-pill">{{ dayPlanLabel(activePlan) }}</span>
                    <span class="line"></span>
                    <button
                      v-if="activePlan.items.length === 0"
                      class="itinerary-delete-btn"
                      type="button"
                      :aria-label="`${dayPlanLabel(activePlan)} 삭제`"
                      :disabled="itinerary.mutating.value"
                      @click.stop="removeDay(activePlan)"
                    >
                      <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                    </button>
                  </div>
                  <template v-for="(item, idx) in activePlan.items" :key="item.id">
                    <div :class="['stop', getDayColorClass(activeDay), { 'route-pen-pending': pendingRouteFrom === item.id, 'route-linked': !!getLinkedPartner(item.id) }]"
					:data-step-id="item.id" :data-place-id="item.placeExternalId" draggable="true"
					@pointerdown="onPointerDown"
					@dragstart="startNativeStopDrag($event, activePlan.id, item.id)"
					@dragend="finishNativeStopDrag"
					@dragover.prevent
					@drop.prevent="dropNativeStop(activePlan.id, item.id)"
                      @click.stop="handleStopClick(item)">
                      <span class="stop-num">{{ idx + 1 }}</span>
                      <div>
                        <strong>{{ item.title }}</strong>
                        <span class="small muted">{{ item.time }}</span>
                      </div>
                      <button class="itinerary-delete-btn" type="button" :aria-label="`${item.title} 삭제`" :disabled="itinerary.mutating.value" @click.stop="removeItineraryItem(item)">
                        <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                      </button>
                      <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                    </div>
                    <!-- Route connector between linked adjacent stops -->
                    <div v-if="idx < activePlan.items.length - 1 && hasRouteLinkBetween(item.id, activePlan.items[idx + 1].id)"
                      class="route-connector"
                      @click.stop="removeRouteLinkBetween(item.id, activePlan.items[idx + 1].id)"
                      :title="'경로 연결 해제'">
                      <div class="route-connector-line"></div>
                      <span class="material-symbols-rounded route-unlink-icon">link_off</span>
                      <div class="route-connector-line"></div>
                    </div>
                  </template>
                </template>
              </div>

              <!-- Add stop: 원본처럼 버튼 클릭 시 바로 검색 패널 열기 -->
              <div class="add-stop-container">
                <button class="add-stop-dashed" type="button" :disabled="dayPlans.length === 0 || itinerary.mutating.value" @click="openSearchPanel">
                  <span class="material-symbols-rounded">add_circle</span>
                  <span>일정 추가</span>
                </button>
                <div class="add-stop-popover" id="add-stop-popover">
                  <button class="popover-item" type="button" @click="openSearchPanel">
                    <span class="material-symbols-rounded">search</span>
                    <div class="popover-item-text"><strong>장소 검색 추가</strong><span>관광지, 맛집, 숙소 찾기</span></div>
                  </button>
                  <button class="popover-item" type="button" @click="isCustomEventModalOpen = true">
                    <span class="material-symbols-rounded">edit_note</span>
                    <div class="popover-item-text"><strong>커스텀 일정 추가</strong><span>자유시간, 이동 등 직접 입력</span></div>
                  </button>
                  <button class="popover-item" type="button" @click="openSearchPanel">
                    <span class="material-symbols-rounded">explore</span>
                    <div class="popover-item-text"><strong>추천 관광지 보기</strong><span>지역 인기 명소 추천 받기</span></div>
                  </button>
                </div>
              </div>
            </div>

            <!-- 장소 검색 사이드 패널 -->
            <div :class="['sidebar-search-panel', { show: isSearchPanelOpen }]" id="sidebar-search-panel">
              <div class="search-panel-header">
                <button class="icon-btn" id="search-panel-back" type="button" aria-label="뒤로가기" @click="closeSearchPanel">
                  <span class="material-symbols-rounded">arrow_back</span>
                </button>
                <h4>일정 추가</h4>
                <button :class="['category-chip', 'search-panel-custom-trigger']" type="button" @click="showCustomForm = !showCustomForm">
                  <span class="material-symbols-rounded" aria-hidden="true">edit_note</span>
                  커스텀 일정 추가
                </button>
              </div>
              <div class="search-panel-body">
                <!-- 커스텀 일정 폼 -->
                <div class="custom-schedule-form" id="custom-schedule-form" v-if="showCustomForm">
                  <div class="custom-form-field">
                    <label class="form-label">
                      <span class="form-label-text">일정명</span>
                      <input class="field" type="text" id="inline-custom-title" placeholder="예: 점심 식사, 자유 시간" v-model="customTitle">
                    </label>
                  </div>
                  <div class="custom-form-field">
                    <label class="form-label">
                      <span class="form-label-text">방문 일차</span>
                      <select class="field" id="inline-custom-day" v-model="customDay">
                        <option v-for="day in dayPlans" :key="day.id" :value="day.day">{{ dayPlanLabel(day) }}</option>
                      </select>
                    </label>
                  </div>
                  <button type="button" class="btn primary" id="inline-custom-submit" style="width:100%;margin-top:12px;" :disabled="itinerary.mutating.value || !customTitle.trim()" @click="submitCustomSchedule">
                    <span class="material-symbols-rounded" style="font-size:18px;">add_circle</span>
                    일정 추가하기
                  </button>
                </div>

                <PlaceDiscoveryPanel
                  :trip-id="tripId"
                  :bbox="discoveryBbox"
                  @select="selectDiscoveredPlace"
                  @add="addPlaceToItinerary"
                />
              </div>
            </div>

          </aside>

          <!-- ═══ MAP CANVAS ═══ -->
          <div class="map-canvas" :aria-label="`${trip.title} 지도`">
			<MapboxItineraryMap
				:stops="mapStops"
				:routes="itinerary.routes.value"
				:route-display="routeState"
              :drawings="mapDrawings"
              :drawing-tool="activeTool"
              :drawing-color="penColor"
              :drawing-width="penSize"
              :drawings-visible="drawingOn"
              @select-place="(_provider, placeId) => selectPlace(placeId)"
              @viewport-change="mapViewport.updateViewport"
              @drawing-create="createLocalDrawing"
              @drawing-erase="eraseLocalDrawing"
              @drawing-preview="publishDrawingPreview"
            />

            <div v-if="mapViewport.loading.value" class="map-viewport-status" role="status">
              지도 범위를 동기화하는 중
            </div>
            <div v-else-if="mapViewport.error.value" class="map-viewport-status is-error" role="alert">
              <span>{{ mapViewport.error.value }}</span>
              <button
                class="map-viewport-retry"
                type="button"
                aria-label="지도 범위 동기화 다시 시도"
                title="다시 시도"
                @click="mapViewport.retry"
              >
                <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
              </button>
            </div>

            <div v-if="drawingRetryIds.length > 0" class="map-drawing-status" role="alert">
              <span>그림 좌표를 정리하지 못했습니다.</span>
              <button
                type="button"
                aria-label="그림 좌표 정리 다시 시도"
                title="다시 시도"
                @click="retryDrawingSimplification"
              >
                <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
              </button>
            </div>

            <!-- ===== Pen popover ===== -->
            <div :class="['tool-popover', { 'is-open': isPenPopoverOpen }]" id="pen-popover" :aria-hidden="!isPenPopoverOpen">
              <div class="popover-section">
                <div class="popover-title">펜 굵기</div>
                <div class="thickness-options">
                  <button v-for="size in [2, 4, 6, 10, 14]" :key="size"
                    :class="['thickness-opt', { active: penSize === size }]" type="button"
                    :data-size="size" :title="size <= 2 ? '매우 얇게' : size <= 4 ? '얇게' : size <= 6 ? '보통' : size <= 10 ? '두껍게' : '매우 두껍게'"
                    @click="penSize = size">
                    <span :style="{ height: size + 'px' }"></span>
                  </button>
                </div>
              </div>
              <div class="popover-divider" aria-hidden="true"></div>
              <div class="popover-section">
                <div class="popover-title">펜 색상</div>
                <div class="color-grid">
                  <button v-for="c in [
                    { color: '#1f2937', name: '검정' }, { color: '#ef4444', name: '빨강' },
                    { color: '#f97316', name: '주황' }, { color: '#eab308', name: '노랑' },
                    { color: '#22c55e', name: '초록' }, { color: '#06b6d4', name: '하늘' },
                    { color: '#3b82f6', name: '파랑' }, { color: '#8b5cf6', name: '보라' },
                    { color: '#ec4899', name: '분홍' }, { color: '#ffffff', name: '흰색' },
                  ]" :key="c.color" :class="['color-opt', { active: penColor === c.color }]" type="button"
                    :data-color="c.color" :style="{ background: c.color }" :title="c.name" :aria-label="c.name"
                    @click="penColor = c.color"></button>
                </div>
              </div>
            </div>

            <!-- ===== Toolbox ===== -->
            <div class="map-tools">
              <!-- Drawing tools -->
              <button :class="['tool-btn', { active: activeTool === 'cursor' }]" type="button" title="커서" @click="activeTool = 'cursor'">
                <span class="material-symbols-rounded">arrow_selector_tool</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'route-pen' }]" type="button" title="여행 경로 그리기 (경로 펜)" data-tool="route-pen" @click="activeTool = 'route-pen'">
                <span class="material-symbols-rounded">route</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'pen' }]" type="button" id="pen-btn" title="펜 (자유 그리기) — 굵기/색상 보기" data-tool="pen" @click="activeTool = 'pen'; drawingOn = true; isPenPopoverOpen = !isPenPopoverOpen">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'eraser' }]" type="button" title="지우개" data-tool="eraser" @click="activeTool = 'eraser'; drawingOn = true">
                <span class="material-symbols-rounded">ink_eraser</span>
              </button>

              <span class="tool-divider" aria-hidden="true"></span>

              <!-- View toggles -->
              <button class="tool-btn" :class="routeState !== 'hidden' ? 'is-on' : 'is-off'" type="button"
                id="route-state-toggle"
                :data-route-state="routeState"
                :title="routeState === 'route' ? '경로: 실제 경로 (꾬불꾬불) — 다음: 점선' : routeState === 'dashed' ? '경로: 점선만 표시 — 다음: 숨김' : '경로: 숨김 — 다음: 실제 경로'"
                :aria-pressed="routeState !== 'hidden'"
                @click="toggleRouteState">
                <span class="material-symbols-rounded icon-dashed">linear_scale</span>
                <span class="material-symbols-rounded icon-route">route</span>
                <span class="material-symbols-rounded icon-hidden">visibility_off</span>
              </button>
              <button class="tool-btn" :class="cardState !== 'hidden' ? 'is-on' : 'is-off'" type="button"
                id="card-state-toggle"
                :data-card-state="cardState"
                :title="cardState === 'full' ? '여행지 카드: 전체 보기 — 다음: 최소화(핀)' : cardState === 'min' ? '여행지 카드: 최소화 (핀만) — 다음: 숨김' : '여행지 카드: 숨김 — 다음: 전체 보기'"
                :aria-pressed="cardState !== 'hidden'"
                @click="toggleCardState">
                <span class="material-symbols-rounded icon-full">view_sidebar</span>
                <span class="material-symbols-rounded icon-min">push_pin</span>
                <span class="material-symbols-rounded icon-hidden-card">block</span>
              </button>
              <button :class="['tool-btn', nearbyOn ? 'is-on' : 'is-off']" type="button"
                data-toggle="nearby"
                title="주변 여행지 표시 켜기/끄기"
                :aria-pressed="nearbyOn"
                @click="nearbyOn = !nearbyOn">
                <span class="material-symbols-rounded">explore</span>
              </button>
              <button :class="['tool-btn', drawingOn ? 'is-on' : 'is-off']" type="button"
                data-toggle="drawing"
                title="지도 그림 표시 켜기/끄기"
                :aria-pressed="drawingOn"
                @click="drawingOn = !drawingOn">
                <span class="material-symbols-rounded">brush</span>
              </button>

              <span class="tool-divider" aria-hidden="true"></span>

              <!-- Undo / Redo -->
              <button :class="['tool-btn', canUndo ? 'is-on' : 'is-off']" type="button"
                data-action="undo"
                title="실행 취소 (Ctrl+Z)"
                :disabled="!canUndo || itinerary.mutating.value"
                @click="undo">
                <span class="material-symbols-rounded">undo</span>
              </button>
              <button :class="['tool-btn', canRedo ? 'is-on' : 'is-off']" type="button"
                data-action="redo"
                title="다시 실행 (Ctrl+Y)"
                :disabled="!canRedo || itinerary.mutating.value"
                @click="redo">
                <span class="material-symbols-rounded">redo</span>
              </button>
            </div>
          </div>

          <!-- detailbar -->
          <aside :class="['detailbar', { 'is-hidden': !isDetailbarOpen }]" ref="detailbarRef">
            <button class="detailbar-close" type="button" aria-label="닫기" @click="closeDetailbar"><span class="material-symbols-rounded">close</span></button>
            <div class="detailbar-scroll" v-if="selectedPlace">
              <!-- Header -->
              <div class="detailbar-header-info">
                <div class="detailbar-category-row">
                  <span class="detailbar-category-pill">&#128161; 상세 정보</span>
                  <span class="detailbar-likes-badge" v-if="selectedPlace.likes"><span class="material-symbols-rounded">favorite</span> {{ selectedPlace.likes }}</span>
                </div>
                <h2 class="detailbar-main-title">{{ selectedPlace.title }}</h2>
                <div class="detailbar-address-row">
                  <span class="material-symbols-rounded">location_on</span>
                  <span>{{ selectedPlace.location }}</span>
                </div>
              </div>

              <!-- Description -->
              <div class="detailbar-desc-section">
                <p class="detailbar-desc-text">{{ selectedPlace.description }}</p>
              </div>

              <!-- Gallery -->
              <div class="detailbar-gallery" v-if="selectedPlace.image">
                <div class="detailbar-hero-wrapper">
                  <img class="detailbar-hero" :alt="selectedPlace.title" :src="detailbarMainImg || selectedPlace.image">
                </div>
                <div class="detailbar-thumbs" v-if="selectedPlace.photos?.length">
                  <div v-for="(t, idx) in selectedPlace.photos" :key="idx"
                    :class="['detailbar-thumb-item', { active: detailbarMainImg === t }]"
                    @click="setDetailbarMainImg(t)">
                    <img :src="t" :alt="selectedPlace.title">
                  </div>
                </div>
              </div>

              <!-- Social Likes -->
              <div class="detailbar-social-likes" v-if="selectedPlace.likedBy?.length">
                <div class="detailbar-avatar-stack">
                  <template v-for="(u, idx) in selectedPlace.likedBy.slice(0, 3)" :key="idx">
                    <img v-if="u.avatar && u.avatar.startsWith('http')" :src="u.avatar" class="detailbar-like-avatar" :style="{ zIndex: avatarStackZIndex(idx) }" :alt="u.name || ''">
                    <span v-else-if="u.avatar" class="detailbar-like-avatar-text"
                      :style="textAvatarStyle(idx)">{{ u.avatar }}</span>
                  </template>
                </div>
                <span class="detailbar-likes-text"><strong>{{ selectedPlace.likedBy[0].name || '멤버' }}</strong>님{{ selectedPlace.likedBy.length > 3 ? ` 외 ${selectedPlace.likedBy.length - 3}명` : '' }}이 저장한 장소</span>
              </div>

              <!-- Quick Info -->
              <div class="detailbar-info-card" v-if="hasAccessibilityInfo(selectedPlace.accessibility)">
                <h4 class="section-title">이용 안내</h4>
                <div class="detailbar-info-grid">
                  <div v-if="selectedPlace.accessibility?.openingHours" class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">schedule</span></span>
                    <div class="info-content">
                      <span class="label">이용시간</span>
                      <strong class="value">{{ selectedPlace.accessibility.openingHours }}</strong>
                    </div>
                  </div>
                  <div v-if="selectedPlace.accessibility?.closedDays" class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">event_busy</span></span>
                    <div class="info-content">
                      <span class="label">쉬는날</span>
                      <strong class="value">{{ selectedPlace.accessibility.closedDays }}</strong>
                    </div>
                  </div>
                  <div v-if="selectedPlace.accessibility && selectedPlace.accessibility.parkingType !== 'UNKNOWN'" class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">local_parking</span></span>
                    <div class="info-content">
                      <span class="label">주차시설</span>
                      <strong class="value">{{ parkingTypeLabel(selectedPlace.accessibility.parkingType) }}</strong>
                    </div>
                  </div>
                </div>
                <div v-if="selectedPlace.accessibility?.flags.length" class="detailbar-acc-row">
                  <div v-if="hasAccessibilityFlag(selectedPlace.accessibility, 'WHEELCHAIR')" class="acc-pill enabled">
                    <span class="material-symbols-rounded">accessible</span>
                    <span>휠체어 가능</span>
                  </div>
                  <div v-if="hasAccessibilityFlag(selectedPlace.accessibility, 'PET')" class="acc-pill enabled">
                    <span class="material-symbols-rounded">pets</span>
                    <span>반려동물 가능</span>
                  </div>
                  <div v-if="hasAccessibilityFlag(selectedPlace.accessibility, 'STROLLER')" class="acc-pill enabled">
                    <span class="material-symbols-rounded">stroller</span>
                    <span>유모차 가능</span>
                  </div>
                  <div v-if="hasAccessibilityFlag(selectedPlace.accessibility, 'DISABLED_TOILET')" class="acc-pill enabled">
                    <span class="material-symbols-rounded">accessible_forward</span>
                    <span>장애인 화장실</span>
                  </div>
                  <div v-if="hasAccessibilityFlag(selectedPlace.accessibility, 'ELDERLY')" class="acc-pill enabled">
                    <span class="material-symbols-rounded">elderly</span>
                    <span>노약자 편의</span>
                  </div>
                </div>
              </div>

              <!-- Secondary Info -->
              <div class="detailbar-sec-info" v-if="selectedPlace.contact || selectedPlace.admission || selectedPlace.featuredMenu">
                <div class="detailbar-sec-row" v-if="selectedPlace.contact">
                  <span class="label">&#128222; 전화번호</span>
                  <span class="value">{{ selectedPlace.contact }}</span>
                </div>
                <div class="detailbar-sec-row" v-if="selectedPlace.admission">
                  <span class="label">&#128181; 입장료</span>
                  <span class="value">{{ selectedPlace.admission }}</span>
                </div>
                <div class="detailbar-sec-row" v-if="selectedPlace.featuredMenu">
                  <span class="label">&#11088; 대표메뉴</span>
                  <span class="value">{{ selectedPlace.featuredMenu }}</span>
                </div>
              </div>

              <!-- Travel Stories -->
              <div class="detailbar-stories-section" v-if="selectedPlace.travelStories?.length">
                <h4 class="section-title">추천 여행 이야기</h4>
                <div class="detailbar-stories-grid">
                  <div v-for="story in selectedPlace.travelStories" :key="story.id" class="detailbar-story-card">
                    <img :src="story.image" :alt="story.title" class="story-card-img">
                    <div class="story-card-overlay">
                      <span class="story-card-author">{{ story.author }} · {{ story.date }}</span>
                      <h5 class="story-card-title">{{ story.title }}</h5>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <!-- ═══ FLOATING ACTIONS ═══ -->
          <div class="map-floating-actions" id="map-floating-actions">
            <button class="btn primary ai-guide-fab" type="button" aria-label="AI 투어 가이드" title="AI 투어 가이드" @click="togglePanel('ai')">
              <span class="material-symbols-rounded">auto_awesome</span>
            </button>
            <button class="btn memo-fab" id="memo-fab" type="button" aria-label="여행 메모" title="여행 메모" @click="togglePanel('memo')">
              <span class="material-symbols-rounded">sticky_note_2</span>
            </button>
            <button class="btn todo-fab" id="todo-fab" type="button" aria-label="체크리스트" title="체크리스트" @click="togglePanel('todo')">
              <span class="material-symbols-rounded">playlist_add_check</span>
            </button>
          </div>

          <!-- ═══ AI CHAT PANEL ═══ -->
          <div id="ai-chat-panel" :class="['ai-chat-panel', { show: isAiChatOpen }]">
            <div class="ai-chat-header">
              <div class="ai-chat-title-group">
                <span class="material-symbols-rounded ai-spark-icon">auto_awesome</span>
                <div>
                  <h4>숨길 AI 가이드</h4>
                  <span class="ai-status">{{ conversationLoading ? '불러오는 중…' : (aiSessionStatus || '백엔드 연결됨') }}</span>
                </div>
              </div>
              <button id="ai-chat-close-btn" class="icon-btn" aria-label="닫기" @click="isAiChatOpen = false"><span class="material-symbols-rounded">close</span></button>
            </div>

            <div class="panel-tabs">
              <button type="button" :class="['panel-tab-tag', { 'active-memo': activeConversation === 'ai' }]" @click="activeConversation = 'ai'">AI 가이드</button>
              <button type="button" :class="['panel-tab-tag', { 'active-memo': activeConversation === 'chat' }]" @click="activeConversation = 'chat'">여행방 채팅</button>
            </div>

            <div class="ai-chat-messages-container" id="ai-chat-messages">
              <div v-if="conversationError" class="text-sm" style="color:var(--rose);display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span>{{ conversationError }}</span>
                <button type="button" class="btn ghost" style="font-size:11px;padding:4px 8px;min-height:0;height:auto" @click="loadConversations">다시 시도</button>
              </div>
              <template v-if="activeConversation === 'ai'">
                <div v-for="msg in aiMessages" :key="msg.id" :class="['ai-message', msg.role === 'ASSISTANT' || msg.role === 'TOOL' ? 'assistant' : 'user']">
                  <div v-if="msg.role === 'ASSISTANT' || msg.role === 'TOOL'" class="ai-message-avatar">&#10024;</div>
                  <div class="ai-message-bubble" style="white-space:pre-wrap">{{ msg.content }}</div>
                </div>
                <p v-if="!conversationLoading && aiMessages.length === 0" class="text-sm text-muted">AI에게 첫 질문을 보내보세요.</p>
              </template>
              <template v-else>
                <div v-for="msg in chatMessages" :key="msg.id" :class="['ai-message', msg.sender.id === currentUserId ? 'user' : 'assistant']">
                  <div v-if="msg.sender.id !== currentUserId" class="ai-message-avatar">{{ msg.sender.displayName.charAt(0) }}</div>
                  <div class="ai-message-bubble">
                    <strong v-if="msg.sender.id !== currentUserId" style="display:block;font-size:11px;margin-bottom:3px">{{ msg.sender.displayName }}</strong>
                    <span style="white-space:pre-wrap">{{ msg.deletedAt ? '삭제된 메시지입니다.' : msg.content }}</span>
                  </div>
                </div>
                <p v-if="!conversationLoading && chatMessages.length === 0" class="text-sm text-muted">여행 멤버에게 첫 메시지를 보내보세요.</p>
              </template>
            </div>

            <!-- Quick Suggestions -->
            <div class="ai-chat-suggestions">
              <button class="suggestion-chip" type="button" @click="aiMessage = '현재 일정의 이동 경로를 최적화해줘'">&#9889; 경로 최적화 추천</button>
              <button class="suggestion-chip" type="button" @click="aiMessage = '현재 지도 주변의 맛집을 추천해줘'">&#127869; 근처 맛집</button>
              <button class="suggestion-chip" type="button" @click="aiMessage = '일정이 겹치는 부분이 있는지 확인해줘'">&#128197; 일정 겹침 확인</button>
            </div>

            <div class="ai-chat-input-row">
              <!-- Voice wave container (hidden by default) -->
              <div class="voice-wave-container" id="ai-chat-voice-wave" style="display:none;">
                <div class="voice-wave-bar"></div>
                <div class="voice-wave-bar"></div>
                <div class="voice-wave-bar"></div>
                <div class="voice-wave-bar"></div>
                <div class="voice-wave-bar"></div>
                <span class="voice-wave-text">듣고 있습니다...</span>
              </div>
              <input type="text" id="ai-chat-input" :aria-label="activeConversation === 'ai' ? 'AI 가이드에게 질문하기' : '여행방 메시지 입력'" :placeholder="activeConversation === 'ai' ? 'AI에게 일정에 관해 물어보세요...' : '여행 멤버에게 메시지를 보내세요...'" v-model="aiMessage" @keydown.enter="sendAiMessage" />
              <button id="ai-chat-mic-btn" class="compact-mic-btn" type="button" aria-label="음성 인식">
                <span class="material-symbols-rounded">mic</span>
              </button>
              <button id="ai-chat-send-btn" class="btn primary compact-send-btn" type="button" @click="sendAiMessage">
                <span class="material-symbols-rounded">send</span>
              </button>
            </div>
          </div>

          <!-- ═══ MEMO PANEL ═══ -->
          <div id="memo-panel" :class="['floating-panel', 'memo-panel', { show: isMemoOpen }]">
            <div class="panel-header memo-header">
              <div class="panel-title-group">
                <span class="material-symbols-rounded panel-icon">sticky_note_2</span>
                <div>
                  <h4>여행 메모</h4>
                  <span class="panel-status" id="memo-status">{{ memoStatus || (memoLoading ? '불러오는 중…' : '백엔드 연결됨') }}</span>
                </div>
              </div>
              <button id="memo-close-btn" class="icon-btn" aria-label="닫기" @click="isMemoOpen = false"><span class="material-symbols-rounded">close</span></button>
            </div>
            <!-- 일차별 태그(탭) 필터 -->
            <div class="panel-tabs" id="memo-day-tags">
              <button v-for="tag in dayTagLabels" :key="tag" type="button"
                :class="['panel-tab-tag', { 'active-memo': activeMemoDay === tag }]"
                @click="switchMemoDay(tag)">{{ tag }}</button>
            </div>
            <!-- 미니 포맷 툴바 -->
            <div class="memo-toolbar">
              <button type="button" class="toolbar-btn" title="굵게" aria-label="굵게"><span class="material-symbols-rounded">format_bold</span></button>
              <button type="button" class="toolbar-btn" title="기울임" aria-label="기울임"><span class="material-symbols-rounded">format_italic</span></button>
              <button type="button" class="toolbar-btn" title="밑줄" aria-label="밑줄"><span class="material-symbols-rounded">format_underlined</span></button>
              <button type="button" class="toolbar-btn" title="취소선" aria-label="취소선"><span class="material-symbols-rounded">format_strikethrough</span></button>
              <div class="toolbar-divider"></div>
              <button type="button" class="toolbar-btn" title="글머리 기호" aria-label="글머리 기호"><span class="material-symbols-rounded">format_list_bulleted</span></button>
              <button type="button" class="toolbar-btn" title="번호 매기기" aria-label="번호 매기기"><span class="material-symbols-rounded">format_list_numbered</span></button>
            </div>
            <div class="panel-body memo-body">
              <textarea id="memo-textarea" placeholder="여행 계획, 팁, 예약 정보 등을 자유롭게 메모해보세요..." v-model="memoTextDisplay"></textarea>
            </div>
            <div class="panel-footer memo-footer">
              <div class="memo-footer-left">
                <button id="memo-clear-btn" class="btn text-danger-btn" type="button" @click="clearNote">
                  <span class="material-symbols-rounded">delete</span>
                  초기화
                </button>
                <span class="memo-char-count" id="memo-char-count">{{ memoTextDisplay.length }}자</span>
              </div>
              <button id="memo-copy-btn" class="btn primary small" type="button" :disabled="memoLoading || !memoTextDisplay.trim()" @click="saveNote">
                <span class="material-symbols-rounded">save</span>
                저장하기
              </button>
            </div>
          </div>

          <!-- ═══ TODO PANEL ═══ -->
          <div id="todo-panel" :class="['floating-panel', 'todo-panel', { show: isTodoOpen }]">
            <div class="panel-header todo-header">
              <div class="panel-title-group">
                <span class="material-symbols-rounded panel-icon">playlist_add_check</span>
                <div>
                  <h4>체크리스트</h4>
                  <span class="panel-status" id="todo-progress-text">{{ completedCount }}/{{ totalCount }} 완료 ({{ progressPercent }}%)</span>
                </div>
              </div>
              <button id="todo-close-btn" class="icon-btn" aria-label="닫기" @click="isTodoOpen = false"><span class="material-symbols-rounded">close</span></button>
            </div>
            <!-- 일차별 태그(탭) 필터 -->
            <div class="panel-tabs" id="todo-day-tags">
              <button v-for="tag in dayTagLabels" :key="tag" type="button"
                :class="['panel-tab-tag', { 'active-todo': activeTodoDay === tag }]"
                @click="activeTodoDay = tag">{{ tag }}</button>
            </div>
            <div class="panel-progress-container">
              <div class="panel-progress-bar" id="todo-progress-bar" style="width:0%">
                <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
            </div>
            <div class="panel-body todo-body">
              <p v-if="todoError" class="text-sm" style="color:var(--rose)">{{ todoError }}</p>
              <p v-else-if="todoLoading && currentTodos.length === 0" class="text-sm text-muted">불러오는 중…</p>
              <ul class="todo-list" id="todo-list-items">
                <li v-for="todo in currentTodos" :key="todo.id" class="todo-item">
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
                    <input type="checkbox" :checked="todo.done" :disabled="todoLoading" @change="toggleTodo(todo.id)" style="width:18px;height:18px;accent-color:var(--violet);" />
					<span :style="{ textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? 'var(--muted)' : 'var(--ink)', fontSize: '14px' }">{{ todo.text }}</span>
				</label>
				<div v-if="todo.completedMembers.length" class="todo-completed-members" :aria-label="`${todo.completedMembers.map(member => member.displayName).join(', ')} 완료`">
					<span v-for="member in todo.completedMembers.slice(0, 5)" :key="member.id" class="todo-member-avatar" :title="`${member.displayName} 완료`">
						<img v-if="member.profileImageUrl" :src="member.profileImageUrl" :alt="member.displayName" />
						<template v-else>{{ member.displayName.charAt(0) }}</template>
					</span>
					<span v-if="todo.completedMembers.length > 5" class="todo-member-more">+{{ todo.completedMembers.length - 5 }}</span>
				</div>
				<button type="button" aria-label="할 일 삭제" class="icon-btn" :disabled="todoLoading" @click="deleteTodo(todo.id)"><span class="material-symbols-rounded">delete</span></button>
                </li>
              </ul>
            </div>
            <div class="panel-footer todo-footer">
              <div class="todo-input-row">
                <input type="text" id="todo-input" aria-label="할 일 추가" placeholder="할 일을 입력하세요..." v-model="newTodo" @keydown.enter="addTodo" />
                <button id="todo-add-btn" class="btn primary compact-send-btn" type="button" @click="addTodo">
                  <span class="material-symbols-rounded">add</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

    <!-- ═══ INVITE MODAL ═══ -->
    <div id="invite-modal" :class="['modal-overlay', { show: isInviteModalOpen }]" @click.self="isInviteModalOpen = false">
      <div class="modal-card advanced-modal">
        <div class="modal-header">
          <h3>여행 설정 및 멤버 초대</h3>
          <button id="close-modal-btn" class="icon-btn" aria-label="닫기" @click="isInviteModalOpen = false"><span class="material-symbols-rounded">close</span></button>
        </div>

        <!-- Modal Tab Navigation -->
        <div class="modal-tabs">
          <button :class="['modal-tab-btn', { active: inviteTab === 'tab-settings' }]" data-tab="tab-settings" type="button" @click="inviteTab = 'tab-settings'">
            <span class="material-symbols-rounded">settings</span> 여행 정보 설정
          </button>
          <button :class="['modal-tab-btn', { active: inviteTab === 'tab-members' }]" data-tab="tab-members" type="button" @click="inviteTab = 'tab-members'">
            <span class="material-symbols-rounded">group</span> 멤버 관리
          </button>
        </div>

        <div class="modal-body">
          <!-- TAB 1: Settings -->
          <div :class="['modal-tab-content', { active: inviteTab === 'tab-settings' }]" id="tab-settings">
            <form id="trip-settings-form" class="modal-form" @submit.prevent="saveTripSettings">
              <label class="form-label">
                <span class="form-label-text">여행 방 이름</span>
                <input class="field" type="text" id="edit-trip-name" v-model="editTitle" placeholder="여행 방 이름을 입력하세요">
              </label>
              <label class="form-label">
                <span class="form-label-text">대표 여행지</span>
                <input class="field" type="text" id="edit-trip-destination" v-model="editDestination" placeholder="예: 부산">
              </label>
              <p v-if="tripSettingsError" class="text-sm" style="color:var(--rose);">{{ tripSettingsError }}</p>
              <button type="submit" class="btn primary" :disabled="tripSettingsLoading || !editTitle.trim()" style="width:100%;margin-top:16px;">{{ tripSettingsLoading ? '저장 중…' : '설정 저장하기' }}</button>
            </form>
          </div>

          <!-- TAB 2: Members -->
          <div :class="['modal-tab-content', { active: inviteTab === 'tab-members' }]" id="tab-members" v-show="inviteTab === 'tab-members'">
            <!-- Share Link Section -->
            <span class="form-label-text" style="display:block;margin-bottom:8px;">초대 링크 공유</span>
            <div class="invite-link-box" style="margin-bottom:20px;">
              <input type="text" readonly :value="inviteLink" :placeholder="inviteLoading ? '초대 링크 생성 중…' : ''" id="invite-link-input">
              <button id="copy-link-btn" type="button" :disabled="inviteLoading || !inviteLink" @click="copyInviteLink" style="padding:8px 16px;font-size:14px;border-radius:12px;border:none;background:var(--violet);color:white;font-weight:700;cursor:pointer;">복사</button>
            </div>
            <p v-if="inviteError" class="text-sm" style="color:var(--rose);margin-top:-12px;margin-bottom:20px;">{{ inviteError }}</p>

            <!-- Members Section -->
            <div class="modal-members-section">
              <div class="members-header">
                <h4>참여 중인 멤버</h4>
                <span class="member-count">{{ (trip.members ?? []).length }}명</span>
              </div>
              <ul class="member-list" id="invite-member-list">
				<li v-for="member in (trip.members ?? [])" :key="member.id" class="member-item">
					<div class="member-avatar" :style="{ backgroundColor: 'var(--violet)' }">
						<img v-if="member.profileImageUrl" :src="member.profileImageUrl" :alt="member.displayName" />
						<template v-else>{{ (member.displayName ?? '?').charAt(0) }}</template>
					</div>
                  <div class="member-info"><span class="member-name">{{ member.displayName ?? '알 수 없음' }}</span></div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ CUSTOM EVENT MODAL ═══ -->
    <div id="custom-event-modal" :class="['modal-overlay', { show: isCustomEventModalOpen }]" @click.self="isCustomEventModalOpen = false">
      <div class="modal-card advanced-modal" style="max-width:400px;">
        <div class="modal-header">
          <h3>커스텀 일정 추가</h3>
          <button id="close-custom-modal-btn" class="icon-btn" aria-label="닫기" @click="isCustomEventModalOpen = false"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="modal-body">
          <form id="custom-event-form" class="modal-form" @submit.prevent>
            <label class="form-label">
              <span class="form-label-text">일정명</span>
              <input class="field" type="text" id="custom-event-title" placeholder="예: 점심 식사, 이동, 자유 시간" required>
            </label>

            <label class="form-label">
              <span class="form-label-text">카테고리</span>
              <select class="field" id="custom-event-category" style="background-color:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;height:46px;padding:0 16px;font-size:14px;">
                <option value="attraction">관광지</option>
                <option value="food">맛집</option>
                <option value="cafe">카페</option>
                <option value="hotel">숙소</option>
                <option value="custom" selected>기타/자유일정</option>
              </select>
            </label>

            <div class="form-row-dates" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
              <label class="form-label">
                <span class="form-label-text">방문 일차</span>
                <select class="field" id="custom-event-day" style="background-color:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;height:46px;padding:0 16px;font-size:14px;">
                  <option v-for="day in dayPlans" :key="day.day" :value="day.day">{{ day.day }}일차</option>
                </select>
              </label>
              <label class="form-label">
                <span class="form-label-text">방문 시간</span>
                <input class="field" type="time" id="custom-event-time" value="12:00">
              </label>
            </div>

            <button type="submit" class="btn primary" style="width:100%;margin-top:24px;">일정 추가하기</button>
          </form>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toastVisible" class="toast-notification">
        <span class="material-symbols-rounded" style="font-size:18px;color:var(--violet);">check_circle</span>
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>
  </AppShell>
</template>

<style scoped>
/* ── Route page full-screen layout ── */
/* position:fixed ensures exact viewport fill below the 72px header — zero scroll */
.route-page-section {
  position: fixed !important;
  top: 72px !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: auto !important;
  max-width: none !important;
  height: auto !important;
  padding: 0 !important;
  margin: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  z-index: 1 !important;
}

/* ── Day tabs — compact segmented control ── */
.route-page-section .day-tabs-container {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.route-page-section .day-scroll-btn {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--ink);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.route-page-section .day-scroll-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}
.route-page-section .day-scroll-btn .material-symbols-rounded {
  font-size: 18px;
}
.route-page-section .day-tabs {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  gap: 2px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
}
.route-page-section .day-tabs::-webkit-scrollbar {
  display: none;
}
.route-page-section .day-tab {
  flex: 0 0 auto;
  flex-direction: row;
  justify-content: center;
  padding: 6px 12px;
  min-height: 32px;
  border-radius: 8px;
  gap: 0;
  white-space: nowrap;
}
.route-page-section .day-tab .day-date {
  display: none;
}
.route-page-section .day-tab .day-title {
  font-size: 12px;
  font-weight: 700;
}
.route-page-section .day-tab:hover {
  background: rgba(0, 0, 0, 0.04);
}
.route-page-section .day-tab.active {
  background: var(--violet);
  box-shadow: none;
}
.route-page-section .day-tab.active .day-title {
  color: #fff;
}

/* ── Undo/Redo disabled state ── */
.map-tools .tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.map-tools .tool-btn:disabled:hover {
  background: transparent;
  color: #b3bac8;
}
.route-page-section .map-shell {
  flex: 1;
  min-height: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  display: grid;
  grid-template-columns: var(--sidebar-width, 360px) 1fr;
  --detailbar-width: 440px;
  --detailbar-offset: 16px;
  --detailbar-gap: 16px;
}
.route-page-section .sidebar {
  height: 100%;
  width: 100%;
  overflow: visible;
}
.route-page-section .sidebar-content {
  width: 100%;
  box-sizing: border-box;
}
.route-page-section .itinerary {
  width: 100%;
  align-items: stretch;
}
.route-page-section .stop {
  width: calc(100% - 12px);
  grid-template-columns: 24px minmax(0, 1fr) 28px 24px;
}
.route-page-section .day-separator {
  width: 100%;
}
.route-page-section .add-stop-container {
  width: 100%;
}
.route-page-section .trip-header-card {
  width: 100%;
  box-sizing: border-box;
}
.route-page-section .map-canvas {
  height: 100%;
  min-height: 0;
}

.map-viewport-status {
  align-items: center;
  background: rgb(255 255 255 / 94%);
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 12%);
  color: #374151;
  display: flex;
  font-size: 12px;
  gap: 6px;
  left: 50%;
  line-height: 1.4;
  max-width: calc(100% - 32px);
  padding: 7px 10px;
  position: absolute;
  top: 12px;
  transform: translateX(-50%);
  z-index: 8;
}

.map-viewport-status.is-error {
  border-color: #fecdd3;
  color: #be123c;
}

.map-viewport-retry {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  padding: 0;
  width: 24px;
}

.map-viewport-retry .material-symbols-rounded {
  font-size: 18px;
}

.map-drawing-status {
  align-items: center;
  background: rgb(255 255 255 / 96%);
  border: 1px solid #fecdd3;
  border-radius: 6px;
  bottom: 16px;
  color: #be123c;
  display: flex;
  font-size: 12px;
  gap: 6px;
  left: 50%;
  max-width: calc(100% - 32px);
  padding: 7px 10px;
  position: absolute;
  transform: translateX(-50%);
  z-index: 8;
}

.map-drawing-status button {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  padding: 0;
  width: 24px;
}

.map-drawing-status .material-symbols-rounded {
  font-size: 18px;
}

.itinerary-day-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin: -6px 0 8px;
}

.itinerary-day-actions .icon-btn {
  height: 32px;
  width: 32px;
}

.itinerary-action-error {
  color: #be123c;
  font-size: 12px;
  line-height: 1.5;
  margin: 0 0 8px;
}

.itinerary-delete-btn {
  align-items: center;
  background: transparent;
  border: 0;
  color: #9ca3af;
  cursor: pointer;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  width: 28px;
}

.itinerary-delete-btn:hover {
  color: #be123c;
}

.itinerary-delete-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.itinerary-delete-btn .material-symbols-rounded {
  font-size: 18px;
}

/* ── Popover items ── */
.popover-item-text { display:flex;flex-direction:column;gap:2px; }
.popover-item-text strong { font-size:13px;font-weight:700;color:var(--ink); }
.popover-item-text span { font-size:11px;color:var(--muted); }

.add-stop-popover { display:none;flex-direction:column; }
.add-stop-popover.show { display:flex; }

/* Sidebar search panel */
.sidebar-search-panel {
  position:absolute;top:0;left:0;right:0;bottom:0;
  background:rgba(250,251,255,.98);
  z-index:20;
  transform:translateX(-100%);
  transition:transform .3s cubic-bezier(.4,0,.2,1);
  display:flex;flex-direction:column;
  pointer-events:none;
}
.sidebar-search-panel.show { transform:translateX(0);pointer-events:auto; }

.search-panel-header {
  padding:16px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);
  flex-wrap:wrap;
}
.search-panel-header h4 { font-size:16px;font-weight:800;color:var(--ink);margin:0; }
.search-panel-custom-trigger {
  margin-left:auto;
}

.search-panel-body { padding:16px;overflow-y:auto;flex:1; }

.search-input-wrapper { position:relative;margin-bottom:16px; }
.search-input-wrapper input {
  width:100%;height:42px;border-radius:14px;border:1px solid var(--line);padding:0 16px 0 42px;
  font-size:14px;background:#fff;outline:none;
}
.search-input-wrapper input:focus { border-color:var(--violet);box-shadow:0 0 0 3px rgba(0,102,255,.12); }
.search-submit-btn {
  position:absolute;left:8px;top:50%;transform:translateY(-50%);background:none;border:none;
  color:var(--muted);cursor:pointer;padding:4px;
}
.clear-btn {
  position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;
  color:var(--muted);cursor:pointer;padding:4px;
}

.search-categories { display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap; }

.search-results-list { list-style:none;padding:0;margin:0; }

/* Custom schedule form */
.custom-schedule-form {
  padding:16px;background:var(--surface);border-radius:16px;border:1px solid var(--line);margin-bottom:16px;
}
.custom-form-field { margin-bottom:12px; }
.custom-form-row { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px; }

/* Trip header card theme overrides (matching original CSS) */
.trip-header-card.theme-violet {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.04), rgba(59, 130, 246, 0.04));
  border-color: rgba(99, 102, 241, 0.12);
}
.trip-header-card.theme-sunset {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.04), rgba(239, 68, 68, 0.04));
  border-color: rgba(249, 115, 22, 0.12);
}
.trip-header-card.theme-emerald {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.04), rgba(5, 150, 105, 0.04));
  border-color: rgba(16, 185, 129, 0.12);
}
.trip-header-card.theme-dark {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.08), rgba(15, 23, 42, 0.08));
  border-color: rgba(30, 41, 59, 0.12);
}

/* Panel tabs - let global original.css handle base styles, only scoped overrides here */

/* Memo / todo shared */
.memo-footer { display:flex;justify-content:space-between;align-items:center; }
.memo-footer-left { display:flex;align-items:center;gap:12px; }
.memo-char-count { font-size:12px;color:var(--muted); }
.text-danger-btn { color:var(--rose)!important;background:transparent!important;border:none!important;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;padding:0; }
.panel-progress-bar { height:6px;background:var(--line);border-radius:3px;overflow:hidden; }
.panel-progress-bar .progress-fill { height:100%;background:linear-gradient(90deg,var(--violet),var(--blue,#00d1ff));border-radius:3px;transition:width .3s; }
.panel-progress-container { padding:0 20px 16px; }

/* Modals */
.modal-tab-content { display:none; }
.modal-tab-content.active { display:block; }
.modal-overlay { opacity:0;pointer-events:none;transition:opacity .3s; }
.modal-overlay.show { opacity:1;pointer-events:auto; }

.email-invite-box { display:flex;gap:8px;padding:12px;border-radius:16px;background:var(--surface);border:1px solid var(--line);align-items:center; }
.email-invite-box .field { flex:1;border:none;background:transparent;padding:8px 12px;font-size:14px;outline:none;min-height:unset; }
.email-invite-box .field:focus { box-shadow:none; }

.invite-link-box { display:flex;gap:8px;background:var(--bg);padding:8px 8px 8px 16px;border-radius:16px;border:1px solid var(--line);align-items:center; }
.invite-link-box input { flex:1;border:none;background:transparent;font-size:15px;font-weight:600;color:var(--ink);outline:none; }

.member-item { display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line); }
.member-avatar { width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:13px;font-weight:800; }
.member-avatar img { width:100%;height:100%;object-fit:cover;border-radius:inherit; }
.member-name { font-size:14px;font-weight:700;color:var(--ink); }
.todo-completed-members { display:flex;align-items:center;margin-left:auto;padding-left:8px; }
.todo-member-avatar { width:24px;height:24px;margin-left:-6px;border:2px solid #fff;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:var(--violet);color:#fff;font-size:10px;font-weight:800; }
.todo-member-avatar:first-child { margin-left:0; }
.todo-member-avatar img { width:100%;height:100%;object-fit:cover; }
.todo-member-more { margin-left:4px;color:var(--muted);font-size:11px;font-weight:700; }

/* Members header */
.members-header {
  display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;
}
.members-header h4 { margin:0;font-size:16px;font-weight:800; }
.member-count { font-size:13px;color:var(--muted); }

/* Toast */
.toast-notification {
  position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
  display:flex;align-items:center;gap:10px;
  padding:14px 24px;border-radius:16px;
  background:rgba(255,255,255,0.95);backdrop-filter:blur(16px);
  border:1px solid var(--line);box-shadow:0 12px 40px rgba(0,0,0,0.12);
  font-size:14px;font-weight:600;color:var(--ink);z-index:9999;
  white-space:nowrap;
}
.toast-enter-active { transition:all .3s ease-out; }
.toast-leave-active { transition:all .25s ease-in; }
.toast-enter-from, .toast-leave-to {
  opacity:0;transform:translateX(-50%) translateY(20px);
}

/* ── Route pen pending highlight ── */
.stop.route-pen-pending {
  border-color: var(--violet) !important;
  box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.25) !important;
  animation: pulse-pending 1.5s ease-in-out infinite;
}
@keyframes pulse-pending {
  0%, 100% { box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.25); }
  50% { box-shadow: 0 0 0 5px rgba(0, 102, 255, 0.15); }
}

/* ── Route linked stop indicator ── */
.stop.route-linked {
  border-left-width: 4px;
}

/* ── Route connector between linked stops (vertical) ── */
.route-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: -2px 12px 2px 12px;
  padding: 0;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
  user-select: none;
  position: relative;
}
.route-connector:hover {
  background: rgba(239, 68, 68, 0.06);
}
.route-connector:hover .route-unlink-icon {
  opacity: 1;
  color: var(--rose);
}
.route-connector:hover .route-connector-line {
  background: var(--rose);
}
.route-connector-line {
  width: 2px;
  height: 8px;
  background: var(--violet);
  border-radius: 1px;
  transition: background 0.2s;
}
.route-unlink-icon {
  font-size: 13px;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  padding: 1px 0;
}
.route-connector:hover .route-unlink-icon {
  opacity: 1;
}
</style>



