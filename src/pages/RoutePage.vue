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
import { mediaApi } from '@/api/media.api'
import { collaborationApi } from '@/api/collaboration.api'
import { ensureStoredAccessToken, getStoredAccessToken } from '@/auth/accessToken'
import { tripApi } from '@/api/trip.api'
import { swipeApi } from '@/api/swipe.api'
import { dayPlanLabel, toDayPlans } from '@/components/itinerary/itineraryViewModel'
import type { DayPlanViewModel, RouteStopViewModel } from '@/components/itinerary/itineraryViewModel'
import MapboxItineraryMap from '@/components/map/MapboxItineraryMap.vue'
import type { ItineraryMapStop } from '@/components/map/MapboxItineraryMap.vue'
import type { MapDrawingDraft, MapDrawingStroke, MapDrawingTool } from '@/components/map/MapDrawingOverlay.vue'
import type { MapCursorView, MapObjectLockView } from '@/components/map/MapObjectOverlay.vue'
import { MAP_STICKERS, stickerHref } from '@/components/map/mapStickerCatalog'
import PlaceDiscoveryPanel from '@/components/place/PlaceDiscoveryPanel.vue'
import { getAiRefreshTargets } from './routeBackendSync'
import { useItinerary } from '@/composables/useItinerary'
import { useMapViewport } from '@/composables/useMapViewport'
import { placeApi } from '@/api/place.api'
import { useDrawingPreviewChannel } from '@/realtime/drawingPreview'
import { getCollaborationSessionId } from '@/realtime/collaborationSession'
import { resolveWebSocketUrl, StompTransport } from '@/realtime/stompTransport'
import { useTripStore } from '@/stores/trip.store'
import TripSettingsModal from '@/components/trip/TripSettingsModal.vue'
import TripSettingsButton from '@/components/trip/TripSettingsButton.vue'
import type { AiChatMessage } from '@/types/ai'
import type { TripChatMessage } from '@/types/chat'
import type { Checklist, ChecklistItem, ChecklistMemberStatus, Note, PlanningScope } from '@/types/planning'
import type { CollaborationCommandEvent, DrawingPreviewEvent, TripPresenceEvent, TripRealtimeEvent } from '@/types/collaboration'
import type { LngLat } from '@/types/geo'
import type { AccessibilityFlag, ParkingType, Place, PlaceAccessibility, PlaceProvider, PlaceRecommendation } from '@/types/place'
import type { ItineraryDay, MapDrawing, MapObjectTransform, MapStickerCode, ReorderItineraryInput } from '@/types/itinerary'

/* ── RoutePage 내부 전용 타입 ── */
type RouteStop = RouteStopViewModel
type DayPlan = DayPlanViewModel
interface RouteLink {
  id: string
  fromItemId: string
  toItemId: string
}
interface ItineraryMapNearbyPlace {
  id: string
  provider: PlaceProvider
  externalPlaceId: string
  title: string
  category: string | null
  lat: number
  lng: number
  dayIndex?: number
  image?: string | null
  accessibility?: PlaceAccessibility
}
interface CustomMapboxDirectionsResponse {
  routes: {
    geometry: {
      coordinates: [number, number][]
    }
  }[]
}

async function fetchMapboxDirections(
  origin: { lng: number; lat: number },
  destination: { lng: number; lat: number }
): Promise<{ lng: number; lat: number }[]> {
  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin
    const response = await fetch(`${baseUrl}/directions/v5/mapbox/walking/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`)
    if (!response.ok) throw new Error('Directions request failed')
    const data: CustomMapboxDirectionsResponse = await response.json()
    const coords = data.routes?.[0]?.geometry?.coordinates
    if (!coords) return [origin, destination]
    return coords.map(([lng, lat]) => ({ lng, lat }))
  } catch (err) {
    console.error('Failed to fetch directions', err)
    return [origin, destination]
  }
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
type RouteAiChatMessage = AiChatMessage & { pending?: boolean; pendingForMessageId?: string | null }

/* ── Data ── */
const route = useRoute()
const tripIdParam = route.params.tripId
const tripId = Array.isArray(tripIdParam) ? tripIdParam[0] ?? '' : tripIdParam ?? ''
const itinerary = useItinerary(tripId)
const mapViewport = useMapViewport()
const tripStore = useTripStore()
const onlineUserIds = ref<Set<string>>(new Set())
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
  const activeMembers = (detail?.members ?? []).filter((member) => member.status === 'ACTIVE')

  // 1. 유니크 멤버 필터링 (user.id 기준)
  const seenUserIds = new Set<string>()
  const uniqueMembers = []
  for (const m of activeMembers) {
    if (!m.user?.id) continue
    if (seenUserIds.has(m.user.id)) continue
    seenUserIds.add(m.user.id)
    uniqueMembers.push({
      id: m.id,
      userId: m.user.id,
      role: m.role,
      displayName: m.user.displayName,
      profileImageUrl: m.user.profileImageUrl,
      online: onlineUserIds.value.has(m.user.id),
    })
  }

  // 여행 설정 날짜를 우선 사용하고, 없으면 기존 일차 날짜에서 추론합니다.
  const dates = dayPlans.value
    .filter(d => d.groupType !== 'UNSCHEDULED' && d.date)
    .map(d => d.date)
    .sort()

  const configuredStartDate = detail?.startDate?.slice(0, 10) ?? ''
  const configuredEndDate = detail?.endDate?.slice(0, 10) ?? ''
  const tripStartDate = configuredStartDate || (dates.length > 0 ? dates[0] : '')
  const tripEndDate = configuredEndDate || configuredStartDate || (dates.length > 0 ? dates[dates.length - 1] : '')

  // 2. 날짜 연산 및 2박 3일 형식 포맷팅
  let dateText = '날짜 미지정'
  let durationText = '일정 미정'
  if (tripStartDate) {
    const start = new Date(tripStartDate)
    const formatDate = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

    if (tripEndDate && tripEndDate !== tripStartDate) {
      const end = new Date(tripEndDate)
      const diffTime = end.getTime() - start.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      dateText = `${formatDate(start)} ~ ${formatDate(end)}`
      durationText = `${diffDays}박 ${diffDays + 1}일`
    } else {
      dateText = formatDate(start)
      durationText = '당일치기'
    }
  }

  return {
    title: detail?.title ?? '여행',
    destinationName: detail?.displayDestination ?? '',
    statusLabel: detail?.status === 'ARCHIVED' ? '보관된 여행' : '진행 중인 여행',
    startDate: tripStartDate,
    endDate: tripEndDate,
    dateRangeText: dateText,
    durationText: durationText,
    members: uniqueMembers,
    myRole: detail?.members.find(m => m.user?.id === currentUserId.value)?.role || 'MEMBER',
  }
})
const dayPlans = ref<DayPlan[]>([])
const routeSettingsTrip = computed(() => {
  const detail = tripStore.currentTrip?.id === tripId ? tripStore.currentTrip : null
  if (!detail) return null

  return {
    ...detail,
    startDate: trip.value.startDate || detail.startDate || null,
    endDate: trip.value.endDate || trip.value.startDate || detail.endDate || null,
    myRole: detail.myRole || trip.value.myRole,
  }
})
const placeAccessibilityByKey = ref<Record<string, PlaceAccessibility>>({})
const routePlaceByKey = ref<Record<string, Place>>({})
const routeNearbyPlaces = ref<Place[]>([])
const routeNearbyLoading = ref(false)
const routeNearbyError = ref('')
const savedPlaceKeys = ref(new Set<string>())
const savingPlaceKeys = ref(new Set<string>())
let accessibilityRequestRevision = 0
let routePlaceRequestRevision = 0
let routeNearbyRequestRevision = 0

function placeAccessibilityKey(provider: string, externalPlaceId: string) {
  return `${provider}:${externalPlaceId}`
}

function placeReferenceKey(place: Pick<Place, 'provider' | 'externalPlaceId'>) {
  return `${place.provider}:${place.externalPlaceId}`
}

async function loadSavedPlaces() {
  try {
    const response = await swipeApi.listSaved(0, 100)
    savedPlaceKeys.value = new Set(response.items.map((item) => placeReferenceKey(item.place)))
  } catch {
    // 저장 목록 실패가 일정 화면 진입을 막지 않도록 상세 액션만 비활성 상태로 둔다.
  }
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

async function loadRoutePlaceDetails(plans: DayPlan[]) {
  const revision = ++routePlaceRequestRevision
  const unique = new Map<string, { provider: PlaceProvider; externalPlaceId: string }>()
  plans.forEach((day) => day.items.forEach((item) => {
    if (!item.placeProvider || !item.placeExternalId || displayImageUrl(item.thumbnailUrl)) return
    const provider = item.placeProvider as PlaceProvider
    unique.set(placeAccessibilityKey(provider, item.placeExternalId), {
      provider,
      externalPlaceId: item.placeExternalId,
    })
  }))
  if (unique.size === 0) return

  const entries = await Promise.all([...unique.entries()].map(async ([key, reference]) => {
    try {
      const place = await placeApi.getPlace(reference.provider, reference.externalPlaceId)
      return place ? [key, place] as const : null
    } catch {
      return null
    }
  }))
  if (revision !== routePlaceRequestRevision) return
  routePlaceByKey.value = {
    ...routePlaceByKey.value,
    ...Object.fromEntries(entries.filter((entry): entry is readonly [string, Place] => entry !== null)),
  }
}

const scheduledPlaceKeys = computed(() => dayPlans.value.flatMap((day) => day.items.flatMap((item) =>
  item.placeProvider && item.placeExternalId ? [`${item.placeProvider}:${item.placeExternalId}`] : [],
)))

function displayImageUrl(url?: string | null) {
  const trimmed = url?.trim()
  if (!trimmed) return ''
  if (trimmed.includes('cdn.soomgil.test')) return ''
  if (/^(https?:|data:|blob:|\/)/.test(trimmed)) return trimmed
  return `/${trimmed.replace(/^\.?\//, '')}`
}

function placeDisplayImage(place: Pick<Place, 'thumbnailUrl' | 'photos'>) {
  return displayImageUrl(place.thumbnailUrl) || displayImageUrl(place.photos?.find(Boolean))
}

function routeStopImage(item: RouteStop) {
  const stored = displayImageUrl(item.thumbnailUrl)
  if (stored) return stored
  if (!item.placeProvider || !item.placeExternalId) return ''
  const detailed = routePlaceByKey.value[placeAccessibilityKey(item.placeProvider, item.placeExternalId)]
  return detailed ? placeDisplayImage(detailed) : ''
}

const activeDay = ref(0)
const activePlan = computed(() => dayPlans.value.find((day) => day.day === activeDay.value) ?? null)
const visibleMapDayPlans = computed(() => {
  if (activeDay.value === 0) return dayPlans.value
  return activePlan.value ? [activePlan.value] : []
})
const mapStops = computed<ItineraryMapStop[]>(() => {
  let index = 1
  return visibleMapDayPlans.value.flatMap((day) => day.items.flatMap((item) => {
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
      image: routeStopImage(item),
      accessibility: item.placeProvider && item.placeExternalId
        ? placeAccessibilityByKey.value[placeAccessibilityKey(item.placeProvider, item.placeExternalId)]
        : undefined,
    }]
  }))
})
const visibleMapStopIds = computed(() => new Set(visibleMapDayPlans.value.flatMap((day) => day.items.map((item) => item.id))))
const visibleMapRoutes = computed(() => {
  if (activeDay.value === 0) return itinerary.routes.value
  const stopIds = visibleMapStopIds.value
  return itinerary.routes.value.filter((route) => (
    stopIds.has(route.originItineraryItemId)
    && stopIds.has(route.destinationItineraryItemId)
  ))
})
function dayIndexForItineraryItem(itemId?: string | null) {
  if (!itemId) return null
  return dayPlans.value.find((day) => day.items.some((item) => item.id === itemId))?.day ?? null
}
const mapAccentDayIndex = computed(() => {
  if (activeDay.value > 0) return activeDay.value
  for (const route of visibleMapRoutes.value) {
    const routeDay = dayIndexForItineraryItem(route.originItineraryItemId)
      ?? dayIndexForItineraryItem(route.destinationItineraryItemId)
    if (routeDay != null && routeDay > 0) return routeDay
  }
  return mapStops.value.find((stop) => stop.dayIndex > 0)?.dayIndex ?? 1
})
const routeNearbyMapPlaces = computed<ItineraryMapNearbyPlace[]>(() => {
  if (!nearbyOn.value) return []
  return routeNearbyPlaces.value.flatMap((place) => {
    if (place.lat == null || place.lng == null) return []
    return [{
      id: `${place.provider}:${place.externalPlaceId}`,
      provider: place.provider,
      externalPlaceId: place.externalPlaceId,
      title: place.placeName,
      category: place.category ?? null,
      lat: place.lat,
      lng: place.lng,
      dayIndex: mapAccentDayIndex.value,
      accessibility: place.accessibility,
    }]
  })
})
const selectedRecommendationMapPlace = ref<ItineraryMapNearbyPlace | null>(null)
const discoveryBbox = computed(() => {
  if (mapStops.value.length > 0) {
    const lngs = mapStops.value.map((stop) => stop.lng)
    const lats = mapStops.value.map((stop) => stop.lat)
    return `${Math.min(...lngs)},${Math.min(...lats)},${Math.max(...lngs)},${Math.max(...lats)}`
  }
  const viewport = mapViewport.viewport.value
  if (viewport) {
    return `${viewport.minLng},${viewport.minLat},${viewport.maxLng},${viewport.maxLat}`
  }
  return ''
})

const viewportBbox = computed(() => {
  const viewport = mapViewport.viewport.value
  if (!viewport) return ''
  return `${viewport.minLng},${viewport.minLat},${viewport.maxLng},${viewport.maxLat}`
})
const isJejuTrip = computed(() => trip.value.destinationName.includes('제주'))
const placeDiscoveryBbox = computed(() => viewportBbox.value || (isJejuTrip.value ? JEJU_DISCOVERY_BBOX : ''))

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

async function loadInitialRouteData() {
  const results = await Promise.allSettled([
    loadTrip(),
    loadItinerary(),
  ])
  if (results.some((result) => result.status === 'rejected')) return

  try {
    await nextTick()
    const didSyncDays = await syncScheduledDaysWithDateRange()
    if (didSyncDays) await refreshTripRoomAfterDateSync()
  } catch {
    itineraryActionError.value = '여행 기간에 맞춰 일차를 동기화하지 못했습니다.'
  }
  connectRealtimeChannels()
}

watch(itinerary.days, (days) => {
  const preservedScrollTop = pendingItineraryScrollTop
  dayPlans.value = toDayPlans(days)
  void loadRouteAccessibility(dayPlans.value)
  void loadRoutePlaceDetails(dayPlans.value)
  if (activeDay.value !== 0 && !dayPlans.value.some((day) => day.day === activeDay.value)) {
    activeDay.value = 0
  }
  if (!dayPlans.value.some((day) => day.day === customDay.value)) {
    customDay.value = dayPlans.value[0]?.day ?? 1
  }
  nextTick(() => {
    initDragDrop()
    if (preservedScrollTop !== null) restoreItineraryScroll(preservedScrollTop)
  })
}, { deep: true })

onMounted(() => {
  void loadInitialRouteData()
  void loadSavedPlaces()
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
const serverUndoAvailable = ref(false)
const serverRedoAvailable = ref(false)
const historyActionPending = ref(false)
const canUndo = computed(() => serverUndoAvailable.value || undoStack.value.length > 0)
const canRedo = computed(() => serverRedoAvailable.value || redoStack.value.length > 0)

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
	if (!canUndo.value || itinerary.mutating.value || historyActionPending.value) return
	if (serverUndoAvailable.value) {
		await executeServerHistoryAction('undo')
		return
	}
  const previous = undoStack.value.pop()!
  pushHistoryState(redoStack.value, currentHistoryState(previous.domain))
  if (previous.domain === 'drawing') {
    restoreDrawingState(previous)
    return
  }
  if (previous.domain === 'route-links') {
    routeLinks.value = previous.links
    clearPendingRouteSelection()
    nextTick(initDragDrop)
    return
  }
  const plansChanged = JSON.stringify(dayPlans.value) !== JSON.stringify(previous.plans)
  dayPlans.value = previous.plans
  clearPendingRouteSelection()
  nextTick(initDragDrop)
  if (plansChanged) await persistItineraryOrder()
}

async function redo() {
	if (!canRedo.value || itinerary.mutating.value || historyActionPending.value) return
	if (serverRedoAvailable.value) {
		await executeServerHistoryAction('redo')
		return
	}
  const next = redoStack.value.pop()!
  pushHistoryState(undoStack.value, currentHistoryState(next.domain))
  if (next.domain === 'drawing') {
    restoreDrawingState(next)
    return
  }
  if (next.domain === 'route-links') {
    routeLinks.value = next.links
    clearPendingRouteSelection()
    nextTick(initDragDrop)
    return
  }
  const plansChanged = JSON.stringify(dayPlans.value) !== JSON.stringify(next.plans)
  dayPlans.value = next.plans
  clearPendingRouteSelection()
  nextTick(initDragDrop)
  if (plansChanged) await persistItineraryOrder()
}

async function executeServerHistoryAction(action: 'undo' | 'redo') {
	historyActionPending.value = true
	itineraryActionError.value = ''
	try {
		const response = await collaborationApi[action](tripId, {
			baseVersion: itinerary.itineraryVersion.value,
			commandEventId: null,
		})
		serverUndoAvailable.value = response.undoAvailable
		serverRedoAvailable.value = response.redoAvailable
		undoStack.value = []
		redoStack.value = []
		mapObjectEpoch.value += 1
		await itinerary.fetchItinerary()
	} catch (cause) {
		console.error(`Collaboration ${action} failed.`, cause)
		itineraryActionError.value = action === 'undo'
			? '작업을 되돌리지 못했습니다. 최신 상태를 다시 불러왔습니다.'
			: '작업을 다시 실행하지 못했습니다. 최신 상태를 다시 불러왔습니다.'
		await loadItinerary()
	} finally {
		historyActionPending.value = false
	}
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
const routeWaypoints = ref<LngLat[]>([])
const ROUTE_MATCHING_MAX_COORDINATES = 25
const ROUTE_MATCHING_MAX_INTERMEDIATE_POINTS = ROUTE_MATCHING_MAX_COORDINATES - 2
const ROUTE_MATCHING_RADIUS_METERS = 50
const ROUTE_NEARBY_CORRIDOR_METERS = 700
const JEJU_DISCOVERY_BBOX = '126.1,33.0,127.1,33.7'

function clearPendingRouteSelection() {
  pendingRouteFrom.value = null
  routeWaypoints.value = []
}

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

function routeGroupClass(itemId: string, previousItemId?: string, nextItemId?: string) {
  const linkedPrevious = hasRouteLinkBetween(previousItemId, itemId)
  const linkedNext = hasRouteLinkBetween(itemId, nextItemId)
  return {
    'route-grouped': linkedPrevious || linkedNext,
    'route-group-start': linkedNext && !linkedPrevious,
    'route-group-middle': linkedPrevious && linkedNext,
    'route-group-end': linkedPrevious && !linkedNext,
  }
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
    itinerary.routes.value = itinerary.routes.value.filter((route) => route.id !== link.id)
    if (!routeBbox(visibleMapRoutes.value as Array<{ geometry?: Record<string, unknown> }>)) {
      nearbyOn.value = false
      clearRouteNearbyPlaces()
    }
		showToast('경로 연결이 해제되었습니다', 'success')
	} catch {
		showToast('경로 연결을 해제하지 못했습니다.', 'error')
	}
}

function routeCoordinatesOf(route: { geometry?: Record<string, unknown> }): Array<{ lng: number; lat: number }> {
  const geometry = route.geometry as { type?: unknown; geometry?: unknown; coordinates?: unknown }
  if (!geometry) return []
  const candidate = (
    geometry.type === 'Feature' && typeof geometry.geometry === 'object' && geometry.geometry !== null
      ? geometry.geometry as { type?: unknown; coordinates?: unknown }
      : geometry
  )
  if (candidate.type !== 'LineString' || !Array.isArray(candidate.coordinates)) return []
  return candidate.coordinates.flatMap((coordinate) => {
    if (Array.isArray(coordinate) && typeof coordinate[0] === 'number' && typeof coordinate[1] === 'number') {
      return [{ lng: coordinate[0], lat: coordinate[1] }]
    }
    if (
      typeof coordinate === 'object' && coordinate !== null
      && typeof (coordinate as { lng?: unknown }).lng === 'number'
      && typeof (coordinate as { lat?: unknown }).lat === 'number'
    ) {
      return [{ lng: (coordinate as { lng: number }).lng, lat: (coordinate as { lat: number }).lat }]
    }
    return []
  })
}

function routeBbox(routes: Array<{ geometry?: Record<string, unknown> }>) {
  const coordinates = routes.flatMap(routeCoordinatesOf)
  if (coordinates.length === 0) return ''
  const lngs = coordinates.map((coordinate) => coordinate.lng)
  const lats = coordinates.map((coordinate) => coordinate.lat)
  return [
    Math.min(...lngs) - 0.015,
    Math.min(...lats) - 0.015,
    Math.max(...lngs) + 0.015,
    Math.max(...lats) + 0.015,
  ].join(',')
}

function distanceToSegmentMeters(
  point: { lng: number; lat: number },
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
) {
  const segmentLength = distanceMeters(start, end)
  if (segmentLength === 0) return distanceMeters(point, start)
  const toRadians = Math.PI / 180
  const earthRadiusMeters = 6371000
  const meanLat = ((point.lat + start.lat + end.lat) / 3) * toRadians
  const sx = start.lng * toRadians * Math.cos(meanLat) * earthRadiusMeters
  const sy = start.lat * toRadians * earthRadiusMeters
  const ex = end.lng * toRadians * Math.cos(meanLat) * earthRadiusMeters
  const ey = end.lat * toRadians * earthRadiusMeters
  const px = point.lng * toRadians * Math.cos(meanLat) * earthRadiusMeters
  const py = point.lat * toRadians * earthRadiusMeters
  const vx = ex - sx
  const vy = ey - sy
  const wx = px - sx
  const wy = py - sy
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
  return Math.hypot(px - (sx + t * vx), py - (sy + t * vy))
}

function distanceToRouteMeters(place: Pick<Place, 'lat' | 'lng'>, routeCoordinates: Array<{ lng: number; lat: number }>) {
  if (place.lat == null || place.lng == null || routeCoordinates.length === 0) return Number.POSITIVE_INFINITY
  const point = { lat: place.lat, lng: place.lng }
  if (routeCoordinates.length === 1) return distanceMeters(point, routeCoordinates[0])
  let closest = Number.POSITIVE_INFINITY
  for (let index = 1; index < routeCoordinates.length; index += 1) {
    closest = Math.min(closest, distanceToSegmentMeters(point, routeCoordinates[index - 1], routeCoordinates[index]))
  }
  return closest
}

function isPlaceNearRoute(place: Place, routeCoordinates: Array<{ lng: number; lat: number }>) {
  return distanceToRouteMeters(place, routeCoordinates) <= ROUTE_NEARBY_CORRIDOR_METERS
}

function clearRouteNearbyPlaces(message = '') {
  routeNearbyRequestRevision += 1
  routeNearbyPlaces.value = []
  routeNearbyError.value = message
  routeNearbyLoading.value = false
}

async function withAccessibilityForPlaces(places: Place[]) {
  const unique = new Map<string, { provider: 'KTO'; externalPlaceId: string }>()
  places.forEach((place) => {
    if (place.provider !== 'KTO') return
    unique.set(placeAccessibilityKey(place.provider, place.externalPlaceId), {
      provider: 'KTO',
      externalPlaceId: place.externalPlaceId,
    })
  })
  if (unique.size === 0) return places

  try {
    const result = await placeApi.getAccessibilityBatch([...unique.values()])
    return places.map((place) => ({
      ...place,
      accessibility: place.accessibility ?? result[placeAccessibilityKey(place.provider, place.externalPlaceId)],
    }))
  } catch {
    return places
  }
}

function upsertLocalRoute(route: { id: string }) {
  itinerary.routes.value = [
    ...itinerary.routes.value.filter((current) => current.id !== route.id),
    route as (typeof itinerary.routes.value)[number],
  ]
}

async function loadRouteNearbyPlaces() {
  const routes = visibleMapRoutes.value as Array<{ geometry?: Record<string, unknown> }>
  const routeCoordinates = routes.flatMap(routeCoordinatesOf)
  const bbox = routeBbox(routes)
  if (!bbox) {
    clearRouteNearbyPlaces('경로를 먼저 생성해 주세요.')
    return
  }
  const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number)
  const revision = ++routeNearbyRequestRevision
  routeNearbyLoading.value = true
  routeNearbyError.value = ''
  try {
    const response = await swipeApi.getRecommendations(tripId, {
      bbox,
      centerLng: (minLng + maxLng) / 2,
      centerLat: (minLat + maxLat) / 2,
      tab: 'BASIC',
      page: 0,
      size: 30,
    })
    if (revision !== routeNearbyRequestRevision) return
    const scheduled = new Set(scheduledPlaceKeys.value)
    const places = response.items
      .map((recommendation: any) => recommendation.place)
      .filter((place: any) => place.lat != null && place.lng != null)
      .filter((place: Place) => isPlaceNearRoute(place, routeCoordinates))
      .filter((place: any) => !scheduled.has(`${place.provider}:${place.externalPlaceId}`))
      .slice(0, 12)
    const placesWithAccessibility = await withAccessibilityForPlaces(places)
    if (revision !== routeNearbyRequestRevision) return
    routeNearbyPlaces.value = placesWithAccessibility
  } catch {
    if (revision === routeNearbyRequestRevision) {
      routeNearbyPlaces.value = []
      routeNearbyError.value = '경로 주변 관광지를 불러오지 못했습니다.'
    }
  } finally {
    if (revision === routeNearbyRequestRevision) routeNearbyLoading.value = false
  }
}

async function handleRoutePenClick(item: RouteStop) {
  if (!pendingRouteFrom.value) {
    pendingRouteFrom.value = item.id
    routeWaypoints.value = []
    showToast('지도 위 중간 지점을 찍고 도착 관광지를 선택하세요')
    return
  }
  if (pendingRouteFrom.value === item.id) {
    clearPendingRouteSelection()
    return
  }
  if (hasRouteLinkBetween(pendingRouteFrom.value, item.id)) {
    showToast('이미 연결된 경로입니다')
    clearPendingRouteSelection()
    return
  }
	const origin = dayPlans.value.flatMap(day => day.items).find(candidate => candidate.id === pendingRouteFrom.value)
	if (!origin || origin.lat == null || origin.lng == null || item.lat == null || item.lng == null) {
		showToast('좌표가 있는 두 장소만 경로로 연결할 수 있습니다')
		clearPendingRouteSelection()
		return
	}
	pushUndoState('route-links')
	try {
    const originCoordinate = { lng: origin.lng, lat: origin.lat }
    const destinationCoordinate = { lng: item.lng, lat: item.lat }
    const waypointCoordinates = limitRouteWaypoints(routeWaypoints.value)
    const routeStops = dedupeRouteCoordinates([originCoordinate, ...waypointCoordinates, destinationCoordinate])
    const destinationChainIds = linkedChainIdsInCurrentOrder(item.id)
    const routeCoordinates = routeStops.length > ROUTE_MATCHING_MAX_COORDINATES
      ? sampleRouteCoordinateCount(routeStops, ROUTE_MATCHING_MAX_COORDINATES)
      : routeStops
    if (routeCoordinates.length < 2) {
      showToast('서로 다른 좌표를 가진 두 장소만 경로로 연결할 수 있습니다')
      return
    }
    const newRoute = await itinerary.mapMatchRoute({
      originItineraryItemId: origin.id,
      destinationItineraryItemId: item.id,
      mode: 'WALKING',
      coordinates: routeCoordinates,
    })
    if (newRoute) {
      upsertLocalRoute(newRoute)
    }
    if (moveItemGroupAfter(origin.id, destinationChainIds)) {
      await persistItineraryOrder()
    }
    nearbyOn.value = true
    await loadRouteNearbyPlaces()
    showToast('경로가 연결되었습니다', 'success')
	} catch {
		showToast('경로를 계산하지 못했습니다.', 'error')
	} finally {
    clearPendingRouteSelection()
  }
}

function limitRouteWaypoints(coordinates: LngLat[]) {
  if (coordinates.length <= ROUTE_MATCHING_MAX_INTERMEDIATE_POINTS) return coordinates
  const lastIndex = coordinates.length - 1
  return Array.from({ length: ROUTE_MATCHING_MAX_INTERMEDIATE_POINTS }, (_, index) => {
    const coordinateIndex = Math.round((index * lastIndex) / (ROUTE_MATCHING_MAX_INTERMEDIATE_POINTS - 1))
    return coordinates[coordinateIndex]
  })
}

function sampleRouteCoordinateCount(coordinates: LngLat[], maxPoints: number) {
  if (coordinates.length <= maxPoints) return coordinates
  const lastIndex = coordinates.length - 1
  return Array.from({ length: maxPoints }, (_, index) => {
    const coordinateIndex = Math.round((index * lastIndex) / (maxPoints - 1))
    return coordinates[coordinateIndex]
  })
}

function addRouteWaypoint(coordinate: LngLat) {
  if (activeTool.value !== 'route-pen') return
  if (!pendingRouteFrom.value) {
    showToast('출발 관광지를 먼저 선택한 뒤 중간 지점을 찍어주세요')
    return
  }
  if (routeWaypoints.value.length >= ROUTE_MATCHING_MAX_INTERMEDIATE_POINTS) {
    showToast(`중간 지점은 최대 ${ROUTE_MATCHING_MAX_INTERMEDIATE_POINTS}개까지 찍을 수 있습니다.`)
    return
  }
  routeWaypoints.value = [...routeWaypoints.value, coordinate]
}

const ROUTE_DRAWING_ENDPOINT_MAX_METERS = 700
const ROUTE_DRAWING_SAMPLE_INTERVAL_METERS = 25
const ROUTE_DRAWING_SAMPLE_MIN_POINTS = 8
const ROUTE_DRAWING_SAMPLE_MAX_POINTS = ROUTE_MATCHING_MAX_COORDINATES

function distanceMeters(left: { lng: number; lat: number }, right: { lng: number; lat: number }) {
  const radius = 6371000
  const toRadians = (degree: number) => degree * Math.PI / 180
  const lat1 = toRadians(left.lat)
  const lat2 = toRadians(right.lat)
  const deltaLat = toRadians(right.lat - left.lat)
  const deltaLng = toRadians(right.lng - left.lng)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestRouteStop(coordinate: { lng: number; lat: number }) {
  const candidates = dayPlans.value.flatMap((day) => day.items.flatMap((item) => (
    item.lat == null || item.lng == null ? [] : [{
      item,
      distance: distanceMeters(coordinate, { lng: item.lng, lat: item.lat }),
    }]
  )))
  return candidates.sort((left, right) => left.distance - right.distance)[0] ?? null
}

function nearestRouteStopInStrokeSection(
  coordinates: Array<{ lng: number; lat: number }>,
  section: 'start' | 'end',
) {
  const minimumSamples = coordinates.length >= 16 ? 12 : 1
  const sampleCount = Math.min(
    Math.ceil(coordinates.length / 2),
    Math.max(1, Math.ceil(coordinates.length * 0.35), minimumSamples),
  )
  const samples = section === 'start'
    ? coordinates.slice(0, sampleCount)
    : coordinates.slice(-sampleCount)
  return samples
    .flatMap((coordinate) => {
      const candidate = nearestRouteStop(coordinate)
      return candidate ? [candidate] : []
    })
    .sort((left, right) => left.distance - right.distance)[0] ?? null
}

function interpolateCoordinate(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  ratio: number,
) {
  return {
    lng: from.lng + (to.lng - from.lng) * ratio,
    lat: from.lat + (to.lat - from.lat) * ratio,
  }
}

function dedupeRouteCoordinates(coordinates: Array<{ lng: number; lat: number }>) {
  const cleaned: typeof coordinates = []
  coordinates.forEach((coordinate) => {
    const previous = cleaned[cleaned.length - 1]
    if (!previous || distanceMeters(previous, coordinate) >= 1) {
      cleaned.push(coordinate)
    }
  })
  return cleaned
}

function sampleRouteCoordinates(
  coordinates: Array<{ lng: number; lat: number }>,
  intervalMeters = ROUTE_DRAWING_SAMPLE_INTERVAL_METERS,
  minPoints = ROUTE_DRAWING_SAMPLE_MIN_POINTS,
  maxPoints = ROUTE_DRAWING_SAMPLE_MAX_POINTS,
) {
  const cleaned = dedupeRouteCoordinates(coordinates)
  if (cleaned.length <= 1) return cleaned

  const cumulativeDistances = [0]
  for (let index = 1; index < cleaned.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + distanceMeters(cleaned[index - 1], cleaned[index]),
    )
  }

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1]
  if (totalDistance <= 0) return [cleaned[0], cleaned[cleaned.length - 1]]

  const targetPointCount = Math.min(
    maxPoints,
    Math.max(minPoints, Math.ceil(totalDistance / intervalMeters) + 1),
  )
  if (targetPointCount <= 2) return [cleaned[0], cleaned[cleaned.length - 1]]

  const sampled: typeof cleaned = [cleaned[0]]
  let segmentIndex = 1
  for (let sampleIndex = 1; sampleIndex < targetPointCount - 1; sampleIndex += 1) {
    const targetDistance = (totalDistance * sampleIndex) / (targetPointCount - 1)
    while (
      segmentIndex < cumulativeDistances.length - 1
      && cumulativeDistances[segmentIndex] < targetDistance
    ) {
      segmentIndex += 1
    }
    const segmentStartDistance = cumulativeDistances[segmentIndex - 1]
    const segmentEndDistance = cumulativeDistances[segmentIndex]
    const segmentDistance = segmentEndDistance - segmentStartDistance
    const ratio = segmentDistance <= 0
      ? 0
      : (targetDistance - segmentStartDistance) / segmentDistance
    sampled.push(interpolateCoordinate(cleaned[segmentIndex - 1], cleaned[segmentIndex], ratio))
  }
  sampled.push(cleaned[cleaned.length - 1])
  return sampled
}

function coordinateForRouteStop(item: RouteStop) {
  return item.lat == null || item.lng == null ? null : { lng: item.lng, lat: item.lat }
}

function nearestPathCoordinateIndex(
  coordinates: Array<{ lng: number; lat: number }>,
  target: { lng: number; lat: number },
) {
  return coordinates.reduce((nearest, coordinate, index) => {
    const distance = distanceMeters(coordinate, target)
    return distance < nearest.distance ? { index, distance } : nearest
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index
}

function buildRouteRequestCoordinates(
  coordinates: Array<{ lng: number; lat: number }>,
  origin: RouteStop,
  destination: RouteStop,
) {
  const originCoordinate = coordinateForRouteStop(origin)
  const destinationCoordinate = coordinateForRouteStop(destination)
  if (!originCoordinate || !destinationCoordinate) return coordinates

  const originIndex = nearestPathCoordinateIndex(coordinates, originCoordinate)
  const destinationIndex = nearestPathCoordinateIndex(coordinates, destinationCoordinate)
  const pathSegment = originIndex <= destinationIndex
    ? coordinates.slice(originIndex, destinationIndex + 1)
    : coordinates.slice(destinationIndex, originIndex + 1).reverse()
  return dedupeRouteCoordinates([originCoordinate, ...pathSegment, destinationCoordinate])
}

async function createRouteFromDrawnCurve(draft: MapDrawingDraft) {
  if (draft.coordinates.length < 2 || itinerary.mutating.value) return
  const routeCoordinates = sampleRouteCoordinates(draft.coordinates)
  if (routeCoordinates.length < 2) return
  const originCandidate = nearestRouteStopInStrokeSection(routeCoordinates, 'start')
  const destinationCandidate = nearestRouteStopInStrokeSection(routeCoordinates, 'end')
  if (!originCandidate || !destinationCandidate) {
    showToast('좌표가 있는 두 일정 장소 근처에서 경로를 그려주세요', 'error')
    return
  }
  if (
    originCandidate.distance > ROUTE_DRAWING_ENDPOINT_MAX_METERS
    || destinationCandidate.distance > ROUTE_DRAWING_ENDPOINT_MAX_METERS
  ) {
    showToast('경로의 시작과 끝을 일정 장소 가까이에서 그려주세요', 'error')
    return
  }
  const origin = originCandidate.item
  const destination = destinationCandidate.item
  if (origin.id === destination.id) {
    showToast('서로 다른 두 장소를 잇도록 경로를 그려주세요')
    return
  }
  if (hasRouteLinkBetween(origin.id, destination.id)) {
    showToast('이미 연결된 경로입니다')
    return
  }
  const requestCoordinates = buildRouteRequestCoordinates(routeCoordinates, origin, destination)
  if (requestCoordinates.length < 2) return

  pushUndoState('route-links')
  try {
    const destinationChainIds = linkedChainIdsInCurrentOrder(destination.id)
    const newRoute = await itinerary.mapMatchRoute({
      originItineraryItemId: origin.id,
      destinationItineraryItemId: destination.id,
      mode: 'WALKING',
      coordinates: requestCoordinates,
    })
    if (newRoute) {
      upsertLocalRoute(newRoute)
    }
    if (moveItemGroupAfter(origin.id, destinationChainIds)) {
      await persistItineraryOrder()
    }
    nearbyOn.value = true
    await loadRouteNearbyPlaces()
    showToast('직접 그린 경로가 연결되었습니다', 'success')
  } catch {
    showToast('직접 그린 경로를 저장하지 못했습니다.', 'error')
  }
}

function restoreItineraryScroll(scrollTop: number) {
  const restore = () => {
    if (itineraryRef.value) itineraryRef.value.scrollTop = scrollTop
  }
  restore()
  nextTick(restore)
  requestAnimationFrame(() => {
    restore()
    requestAnimationFrame(restore)
  })
}

function releasePendingItineraryScroll(scrollTop: number) {
  window.setTimeout(() => {
    if (pendingItineraryScrollTop === scrollTop) pendingItineraryScrollTop = null
  }, 0)
}

async function handleStopClick(item: RouteStop) {
  const scrollTop = pendingItineraryScrollTop ?? itineraryRef.value?.scrollTop ?? 0
  pendingItineraryScrollTop = scrollTop
  if (suppressNextStopClick.value) {
    suppressNextStopClick.value = false
    restoreItineraryScroll(scrollTop)
    releasePendingItineraryScroll(scrollTop)
    return
  }
  if (activeTool.value === 'route-pen') {
		await handleRoutePenClick(item)
    restoreItineraryScroll(scrollTop)
    releasePendingItineraryScroll(scrollTop)
    return
  }
  await selectPlace(item.placeExternalId || undefined, (item.placeProvider || 'KTO') as PlaceProvider, item.id)
  restoreItineraryScroll(scrollTop)
  releasePendingItineraryScroll(scrollTop)
}

/* ── Drag & Drop (data-driven) ── */
const itineraryRef = ref<HTMLElement | null>(null)
const dayTabsRef = ref<HTMLElement | null>(null)
const suppressNextStopClick = ref(false)
let pendingItineraryScrollTop: number | null = null

const isDraggingTabs = ref(false)
const startX = ref(0)
const scrollLeftTabs = ref(0)

function onTabsMouseDown(e: MouseEvent) {
  const el = dayTabsRef.value
  if (!el) return
  isDraggingTabs.value = true
  startX.value = e.pageX - el.offsetLeft
  scrollLeftTabs.value = el.scrollLeft
}

function onTabsMouseMove(e: MouseEvent) {
  if (!isDraggingTabs.value) return
  const el = dayTabsRef.value
  if (!el) return
  e.preventDefault()
  const x = e.pageX - el.offsetLeft
  const walk = (x - startX.value) * 1.5
  el.scrollLeft = scrollLeftTabs.value - walk
}

function onTabsMouseUp() {
  isDraggingTabs.value = false
}

function onTabsMouseLeave() {
  isDraggingTabs.value = false
}

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

interface FlatItineraryNode {
  type: 'separator' | 'stop'
  dayId: string
  itemId?: string
}

function getLinkedChain(itemId: string): string[] {
  const visited = new Set<string>()
  const queue = [itemId]
  visited.add(itemId)

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const link of routeLinks.value) {
      if (link.fromItemId === current && !visited.has(link.toItemId)) {
        visited.add(link.toItemId)
        queue.push(link.toItemId)
      } else if (link.toItemId === current && !visited.has(link.fromItemId)) {
        visited.add(link.fromItemId)
        queue.push(link.fromItemId)
      }
    }
  }

  return Array.from(visited)
}

function linkedChainIdsInCurrentOrder(itemId: string, plans: DayPlan[] = dayPlans.value) {
  const linkedIds = new Set(getLinkedChain(itemId))
  return plans.flatMap((day) => day.items.flatMap((item) => linkedIds.has(item.id) ? [item.id] : []))
}

function movingFlatNodes(source: DragSource, flatNodes: FlatItineraryNode[], plans: DayPlan[]) {
  const sourceDay = plans[source.dayIdx]
  const sourceItem = source.type === 'stop' ? sourceDay?.items[source.itemIdx] : null
  const sourceNodeIndex = source.type === 'separator'
    ? flatNodes.findIndex((node) => node.type === 'separator' && node.dayId === sourceDay?.id)
    : flatNodes.findIndex((node) => node.type === 'stop' && node.itemId === sourceItem?.id)
  if (sourceNodeIndex < 0) return []

  if (source.type === 'separator') {
    return [flatNodes[sourceNodeIndex]]
  }

  if (!sourceItem) return []
  const movingIds = new Set(linkedChainIdsInCurrentOrder(sourceItem.id, plans))
  return flatNodes.filter((node) => node.type === 'stop' && node.itemId && movingIds.has(node.itemId))
}

function normalizeFlatInsertIndex(
  nodes: FlatItineraryNode[],
  targetIdx: number,
  plans: DayPlan[] = dayPlans.value,
) {
  const targetNode = nodes[targetIdx] ?? null
  if (targetNode?.type !== 'stop' || !targetNode.itemId) return targetIdx

  const linkedIds = new Set(linkedChainIdsInCurrentOrder(targetNode.itemId, plans))
  if (linkedIds.size <= 1) return targetIdx

  const firstLinkedIndex = nodes.findIndex((node) => (
    node.type === 'stop' && node.itemId !== undefined && linkedIds.has(node.itemId)
  ))
  return firstLinkedIndex >= 0 ? firstLinkedIndex : targetIdx
}

function normalizeItemInsertIndex(items: RouteStop[], targetItemId: string | undefined) {
  if (!targetItemId) return items.length
  const linkedIds = new Set(linkedChainIdsInCurrentOrder(targetItemId))
  if (linkedIds.size <= 1) return items.findIndex((item) => item.id === targetItemId)

  const firstLinkedIndex = items.findIndex((item) => linkedIds.has(item.id))
  return firstLinkedIndex >= 0 ? firstLinkedIndex : items.findIndex((item) => item.id === targetItemId)
}

function normalizeAllDayTargetIndex(source: DragSource, targetIdx: number, plans: DayPlan[] = dayPlans.value) {
  const flatNodes = flattenDayPlans(plans)
  const movingNodes = movingFlatNodes(source, flatNodes, plans)
  if (movingNodes.length === 0) return targetIdx
  const remainingNodes = flatNodes.filter((node) => (
    !movingNodes.some((movingNode) => isSameFlatNode(movingNode, node))
  ))
  const clampedTargetIdx = Math.max(0, Math.min(targetIdx, remainingNodes.length))
  return normalizeFlatInsertIndex(remainingNodes, clampedTargetIdx, plans)
}

function normalizeSingleDayTargetIndex(source: DragSource, targetIdx: number, plans: DayPlan[] = dayPlans.value) {
  if (source.type !== 'stop') return targetIdx
  const plan = plans[source.dayIdx]
  const moved = plan?.items[source.itemIdx]
  if (!plan || !moved) return targetIdx

  const movingIds = new Set(linkedChainIdsInCurrentOrder(moved.id, [plan]))
  const remainingItems = plan.items.filter((item) => !movingIds.has(item.id))
  const visibleNodes: FlatItineraryNode[] = [
    { type: 'separator', dayId: plan.id },
    ...remainingItems.map((item) => ({ type: 'stop' as const, dayId: plan.id, itemId: item.id })),
  ]
  const clampedTargetIdx = Math.max(0, Math.min(targetIdx, visibleNodes.length))
  const targetNode = visibleNodes[clampedTargetIdx] ?? null
  if (targetNode?.type === 'separator') return 0
  if (targetNode?.type === 'stop' && targetNode.itemId) {
    const targetItemIndex = normalizeItemInsertIndex(remainingItems, targetNode.itemId)
    return targetItemIndex >= 0 ? targetItemIndex + 1 : clampedTargetIdx
  }
  return visibleNodes.length
}

function normalizeDragTargetIndex(source: DragSource, targetIdx: number) {
  return activeDay.value === 0
    ? normalizeAllDayTargetIndex(source, targetIdx)
    : normalizeSingleDayTargetIndex(source, targetIdx)
}

function moveItemGroupAfter(anchorItemId: string, movingItemIds: string[]) {
  const movingIdSet = new Set(movingItemIds)
  if (movingIdSet.size === 0 || movingIdSet.has(anchorItemId)) return false

  const movingItems = dayPlans.value.flatMap((day) => (
    day.items.filter((item) => movingIdSet.has(item.id)).map((item) => ({ ...item }))
  ))
  if (movingItems.length === 0) return false

  const strippedPlans = dayPlans.value.map((day) => ({
    ...day,
    items: day.items.filter((item) => !movingIdSet.has(item.id)),
  }))
  const anchorDayIndex = strippedPlans.findIndex((day) => day.items.some((item) => item.id === anchorItemId))
  if (anchorDayIndex < 0) return false
  const anchorDay = strippedPlans[anchorDayIndex]
  const anchorIndex = anchorDay.items.findIndex((item) => item.id === anchorItemId)
  if (anchorIndex < 0) return false

  const nextItems = [...anchorDay.items]
  nextItems.splice(anchorIndex + 1, 0, ...movingItems.map((item, offset) => ({
    ...item,
    day: anchorDay.day,
    order: anchorIndex + 2 + offset,
  })))
  const nextPlans = strippedPlans.map((day, dayIndex) => (
    dayIndex === anchorDayIndex
      ? { ...day, items: nextItems.map((item, itemIndex) => ({ ...item, day: day.day, order: itemIndex + 1 })) }
      : { ...day, items: day.items.map((item, itemIndex) => ({ ...item, day: day.day, order: itemIndex + 1 })) }
  ))
  if (itineraryOrderSignature(dayPlans.value) === itineraryOrderSignature(nextPlans)) return false
  pushUndoState('itinerary')
  dayPlans.value = nextPlans
  return true
}

const DRAG_LAYER_Z_INDEX = '120'

function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  const target = e.currentTarget as HTMLElement
  const isDraggableItineraryNode = target.classList.contains('day-separator') || target.classList.contains('stop')
  if (e.button !== 0 || !isDraggableItineraryNode) return
  if (itinerary.mutating.value) return

  const stop = target
  const containerEl = itineraryRef.value
  if (!containerEl) return
  const dragContainer: HTMLElement = containerEl
  const initialScrollTop = dragContainer.scrollTop
  pendingItineraryScrollTop = initialScrollTop

  // Identify drag source from data attributes
  const isDraggingSeparator = stop.classList.contains('day-separator')
  let source: DragSource | null = null

  if (isDraggingSeparator) {
    const dayId = stop.getAttribute('data-day-id')
    const dayIdx = dayPlans.value.findIndex(d => d.id === dayId)
    if (dayIdx < 0) return
    source = { type: 'separator', dayIdx, itemIdx: -1, dayNum: dayPlans.value[dayIdx].day }
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

  const sourceDay = dayPlans.value[source.dayIdx]
  const sourceItem = source.type === 'stop' ? sourceDay?.items[source.itemIdx] : null

  const containerRect = dragContainer.getBoundingClientRect()
  const stopRect = stop.getBoundingClientRect()
  const offsetY = e.clientY - stopRect.top
  void containerRect
  let latestClientY = e.clientY
  let autoScrollFrame: number | null = null
  let movedDuringDrag = false
  let dragStarted = false

  const chainIds = source.type === 'stop' && sourceItem
    ? linkedChainIdsInCurrentOrder(sourceItem.id)
    : []
  const chainSet = new Set(chainIds)

  const dragElements: HTMLElement[] = []
  if ((source.type === 'stop' && sourceItem) || source.type === 'separator') {
    const stopEls = dragContainer.querySelectorAll('.stop')
    stopEls.forEach((el) => {
      const stepId = el.getAttribute('data-step-id')
      if (stepId && chainSet.has(stepId) && stepId !== sourceItem?.id) {
        const htmlEl = el as HTMLElement
        dragElements.push(htmlEl)
      }
    })

    const connectorEls = dragContainer.querySelectorAll('.route-connector')
    connectorEls.forEach((el) => {
      const fromId = el.getAttribute('data-from-id')
      const toId = el.getAttribute('data-to-id')
      if (fromId && toId && chainSet.has(fromId) && chainSet.has(toId)) {
        const htmlEl = el as HTMLElement
        dragElements.push(htmlEl)
      }
    })
  }

  const allItems = Array.from(dragContainer.querySelectorAll('.stop, .day-separator'))
    .filter((itemEl) => {
      if (itemEl === stop) return false
      if (itemEl.classList.contains('is-dragging')) return false
      if (source!.type === 'stop' || source!.type === 'separator') {
        const stepId = itemEl.getAttribute('data-step-id')
        if (stepId && chainSet.has(stepId)) return false
        if (source!.type === 'separator' && itemEl.classList.contains('day-separator')) {
          const dayNum = parseInt(itemEl.getAttribute('data-day') || '0', 10)
          if (dayNum === source!.dayNum) return false
        }
      }
      return true
    })

  function startDragVisualState() {
    if (dragStarted) return
    dragStarted = true
    e.preventDefault()
    if (typeof stop.setPointerCapture === 'function') {
      stop.setPointerCapture(e.pointerId)
    }
    stop.classList.add('is-dragging')
    stop.style.setProperty('z-index', DRAG_LAYER_Z_INDEX, 'important')
    stop.style.width = stopRect.width + 'px'
    stop.style.position = 'relative'
    stop.style.top = '0px'

    if (isDraggingSeparator) {
      dragContainer.classList.add('dragging-separator')
    } else {
      dragContainer.classList.add('dragging-stop')
    }

    dragElements.forEach((el) => {
      el.classList.add('is-chain-dragging')
      el.style.setProperty('z-index', DRAG_LAYER_Z_INDEX, 'important')
      el.style.position = 'relative'
      el.style.top = '0px'
    })
  }

  function cleanupDragState() {
    stop.classList.remove('is-dragging')
    stop.style.removeProperty('z-index')
    stop.style.width = ''
    stop.style.position = ''
    stop.style.top = ''

    dragElements.forEach((el) => {
      el.classList.remove('is-chain-dragging')
      el.style.removeProperty('z-index')
      el.style.position = ''
      el.style.top = ''
    })

    dragContainer.classList.remove('dragging-separator', 'dragging-stop')
    dragContainer.querySelectorAll('.stop, .day-separator').forEach((item) => {
      item.classList.remove('is-drag-over', 'is-drag-over-separator', 'is-drag-over-top', 'is-drag-over-bottom', 'is-chain-dragging')
    })
  }

  function applyDragPosition(clientY: number) {
    let deltaY = clientY - e.clientY + (dragContainer.scrollTop - initialScrollTop)
    const trashZone = document.getElementById('trash-drop-zone')
    const trashHeight = trashZone ? trashZone.offsetHeight : 80
    const minTop = -stopRect.top + dragContainer.getBoundingClientRect().top
    const maxTop = dragContainer.scrollHeight - stopRect.height + trashHeight + 20 - initialScrollTop
    deltaY = Math.max(minTop, Math.min(deltaY, maxTop))
    stop.style.top = deltaY + 'px'

    // Sync all chain elements top position
    dragElements.forEach((el) => {
      el.style.top = deltaY + 'px'
    })
  }

  function updateAutoScroll(clientY: number) {
    const currentContainerRect = dragContainer.getBoundingClientRect()
    const edgeSize = Math.min(96, Math.max(48, currentContainerRect.height * 0.18))
    const distanceToBottom = currentContainerRect.bottom - clientY
    const distanceToTop = clientY - currentContainerRect.top
    const maxScrollTop = dragContainer.scrollHeight - dragContainer.clientHeight
    let scrollDelta = 0

    if (distanceToBottom < edgeSize && dragContainer.scrollTop < maxScrollTop) {
      scrollDelta = Math.ceil(((edgeSize - distanceToBottom) / edgeSize) * 18)
    } else if (distanceToTop < edgeSize && dragContainer.scrollTop > 0) {
      scrollDelta = -Math.ceil(((edgeSize - distanceToTop) / edgeSize) * 18)
    }

    if (scrollDelta === 0) {
      if (autoScrollFrame !== null) {
        cancelAnimationFrame(autoScrollFrame)
        autoScrollFrame = null
      }
      return
    }

    if (autoScrollFrame !== null) return
    const step = () => {
      const before = dragContainer.scrollTop
      dragContainer.scrollTop = Math.max(0, Math.min(maxScrollTop, dragContainer.scrollTop + scrollDelta))
      if (dragContainer.scrollTop !== before) applyDragPosition(latestClientY)
      autoScrollFrame = null
      updateAutoScroll(latestClientY)
    }
    autoScrollFrame = requestAnimationFrame(step)
  }

  function onPointerMove(ev: PointerEvent) {
    latestClientY = ev.clientY

    const dx = ev.clientX - e.clientX
    const dy = ev.clientY - e.clientY
    if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20) {
      return
    }
    startDragVisualState()
    ev.preventDefault()
    movedDuringDrag = true
    applyDragPosition(ev.clientY)
    updateAutoScroll(ev.clientY)

    const trashZone = document.getElementById('trash-drop-zone')
    const dragCenter = ev.clientY - offsetY + stopRect.height / 2
    let rawTargetIdx = allItems.length
    for (let i = 0; i < allItems.length; i++) {
      const itemRect = (allItems[i] as HTMLElement).getBoundingClientRect()
      const itemCenter = itemRect.top + itemRect.height / 2
      if (dragCenter < itemCenter) {
        rawTargetIdx = i
        break
      }
    }
    const targetIdx = normalizeDragTargetIndex(source!, rawTargetIdx)

    if (trashZone) {
      const trashRect = trashZone.getBoundingClientRect()
      const dragRect = stop.getBoundingClientRect()
      if (dragRect.bottom >= trashRect.top && dragRect.top <= trashRect.bottom &&
          dragRect.right >= trashRect.left && dragRect.left <= trashRect.right) {
        trashZone.classList.add('is-drag-over-trash')
      } else {
        trashZone.classList.remove('is-drag-over-trash')
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

  async function onPointerUp(ev: PointerEvent) {
    if (dragStarted) ev.preventDefault()
    if (autoScrollFrame !== null) {
      cancelAnimationFrame(autoScrollFrame)
      autoScrollFrame = null
    }
    stop.removeEventListener('pointermove', onPointerMove)
    stop.removeEventListener('pointerup', onPointerUp)
    if (dragStarted && typeof stop.releasePointerCapture === 'function' && stop.hasPointerCapture?.(e.pointerId)) {
      stop.releasePointerCapture(e.pointerId)
    }
    if (movedDuringDrag) {
      suppressNextStopClick.value = true
      window.setTimeout(() => {
        suppressNextStopClick.value = false
      }, 0)
    } else {
      cleanupDragState()
      restoreItineraryScroll(initialScrollTop)
      releasePendingItineraryScroll(initialScrollTop)
      return
    }

    const dragCenter = ev.clientY - offsetY + stopRect.height / 2
    let rawTargetIdx = allItems.length
    for (let i = 0; i < allItems.length; i++) {
      const itemRect = (allItems[i] as HTMLElement).getBoundingClientRect()
      const itemCenter = itemRect.top + itemRect.height / 2
      if (dragCenter < itemCenter) {
        rawTargetIdx = i
        break
      }
    }
    const targetIdx = normalizeDragTargetIndex(source!, rawTargetIdx)

    const trashZone = document.getElementById('trash-drop-zone')
    if (trashZone && trashZone.classList.contains('is-drag-over-trash')) {
      trashZone.classList.remove('is-drag-over-trash')
      cleanupDragState()

      if (source!.type === 'separator') {
        const day = dayPlans.value[source!.dayIdx]
        if (day) removeDay(day)
      } else {
        const item = dayPlans.value[source!.dayIdx]?.items[source!.itemIdx]
        if (item) removeItineraryItem(item)
      }
      releasePendingItineraryScroll(initialScrollTop)
      return
    }

    // Reset visual state (no DOM reorder — let Vue handle it)
    cleanupDragState()

    // Update data model directly
    const didReorder = activeDay.value === 0
      ? reorderAllDays(source!, targetIdx)
      : reorderSingleDay(source!, targetIdx)
    if (didReorder) await persistItineraryOrder()

    await nextTick()
    restoreItineraryScroll(initialScrollTop)
    nextTick(() => {
      initDragDrop()
      restoreItineraryScroll(initialScrollTop)
      releasePendingItineraryScroll(initialScrollTop)
    })
  }

  stop.addEventListener('pointermove', onPointerMove)
  stop.addEventListener('pointerup', onPointerUp)
}

function isSameFlatNode(left: FlatItineraryNode, right: FlatItineraryNode) {
  return left.type === right.type && left.dayId === right.dayId && left.itemId === right.itemId
}

function flattenDayPlans(plans: DayPlan[]): FlatItineraryNode[] {
  return plans.flatMap((day) => [
    { type: 'separator' as const, dayId: day.id },
    ...day.items.map((item) => ({ type: 'stop' as const, dayId: day.id, itemId: item.id })),
  ])
}

function itineraryOrderSignature(plans: DayPlan[]) {
  return JSON.stringify(plans.map((day) => ({
    dayId: day.id,
    items: day.items.map((item) => item.id),
  })))
}

function normalizePlanOrder(plans: DayPlan[]): DayPlan[] {
  let scheduledCount = 0
  return plans.map((plan) => {
    const dayNumber = plan.groupType === 'UNSCHEDULED' ? -1 : ++scheduledCount
    return {
      ...plan,
      day: dayNumber,
      items: plan.items.map((item, itemIndex) => ({
        ...item,
        day: dayNumber,
        order: itemIndex + 1,
      })),
    }
  })
}

function rebuildDayPlansFromFlatNodes(nodes: FlatItineraryNode[], originalPlans: DayPlan[]): DayPlan[] {
  const plansById = new Map(originalPlans.map((plan) => [plan.id, plan]))
  const itemsById = new Map(originalPlans.flatMap((plan) => plan.items.map((item) => [item.id, item])))
  const rebuiltPlans: DayPlan[] = []
  const pendingLeadingItems: RouteStop[] = []
  let currentPlan: DayPlan | null = null

  const pushCurrentPlan = () => {
    if (!currentPlan) return
    rebuiltPlans.push(currentPlan)
    currentPlan = null
  }

  for (const node of nodes) {
    if (node.type === 'separator') {
      pushCurrentPlan()
      const plan = plansById.get(node.dayId)
      if (!plan) continue
      currentPlan = { ...plan, items: [] }
      if (rebuiltPlans.length === 0 && pendingLeadingItems.length > 0) {
        currentPlan.items.push(...pendingLeadingItems.splice(0))
      }
      continue
    }

    if (!node.itemId) continue
    const item = itemsById.get(node.itemId)
    if (!item) continue
    if (!currentPlan) {
      pendingLeadingItems.push({ ...item })
    } else {
      currentPlan.items.push({ ...item })
    }
  }

  pushCurrentPlan()
  if (pendingLeadingItems.length > 0 && rebuiltPlans[0]) {
    rebuiltPlans[0].items = [...pendingLeadingItems, ...rebuiltPlans[0].items]
  }

  return normalizePlanOrder(rebuiltPlans)
}

/** 전체 보기: flat list 기반 재배치 */
function reorderAllDays(source: DragSource, targetIdx: number) {
  const originalPlans = dayPlans.value
  const flatNodes = flattenDayPlans(originalPlans)
  const movingNodes = movingFlatNodes(source, flatNodes, originalPlans)
  if (movingNodes.length === 0) return false
  const remainingNodes = flatNodes.filter((node) => (
    !movingNodes.some((movingNode) => isSameFlatNode(movingNode, node))
  ))
  const insertTargetIdx = normalizeFlatInsertIndex(remainingNodes, targetIdx, originalPlans)
  const targetNode = remainingNodes[insertTargetIdx] ?? null
  if (targetNode && movingNodes.some((node) => isSameFlatNode(node, targetNode))) return false

  const insertAt = targetNode
    ? remainingNodes.findIndex((node) => isSameFlatNode(node, targetNode))
    : remainingNodes.length
  if (insertAt < 0) return false

  const nextNodes = [...remainingNodes]
  nextNodes.splice(insertAt, 0, ...movingNodes)
  const nextPlans = rebuildDayPlansFromFlatNodes(nextNodes, originalPlans)
  if (itineraryOrderSignature(originalPlans) === itineraryOrderSignature(nextPlans)) return false

  pushUndoState('itinerary')
  dayPlans.value = nextPlans
  return true
}

/** 특정 일차: 같은 날 내에서 순서만 변경 */
function reorderSingleDay(source: DragSource, targetIdx: number) {
  if (source.type !== 'stop') return false
  const plan = dayPlans.value[source.dayIdx]
  const moved = plan?.items[source.itemIdx]
  if (!plan || !moved) return false

  const movingIds = new Set(linkedChainIdsInCurrentOrder(moved.id, [plan]))
  const movingItems = plan.items.filter((item) => movingIds.has(item.id))
  const visibleNodes: FlatItineraryNode[] = [
    { type: 'separator', dayId: plan.id },
    ...plan.items
      .filter((item) => !movingIds.has(item.id))
      .map((item) => ({ type: 'stop' as const, dayId: plan.id, itemId: item.id })),
  ]
  const targetNode = visibleNodes[targetIdx] ?? null
  const remainingItems = plan.items.filter((item) => !movingIds.has(item.id))
  let insertAt = remainingItems.length
  if (targetNode?.type === 'separator') {
    insertAt = 0
  } else if (targetNode?.type === 'stop' && targetNode.itemId) {
    const targetItemIndex = normalizeItemInsertIndex(remainingItems, targetNode.itemId)
    if (targetItemIndex >= 0) insertAt = targetItemIndex
  }

  const nextItems = [...remainingItems]
  nextItems.splice(insertAt, 0, ...movingItems)
  if (plan.items.map((item) => item.id).join(',') === nextItems.map((item) => item.id).join(',')) return false

  pushUndoState('itinerary')
  dayPlans.value = dayPlans.value.map((day, dayIndex) => (
    dayIndex === source.dayIdx
      ? { ...day, items: nextItems.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })) }
      : day
  ))
  return true
}

function buildItineraryOrderSnapshot(
  desiredPlans: DayPlan[],
  sourceDays: ItineraryDay[] = itinerary.days.value,
): ReorderItineraryInput {
  const rawDays = [...sourceDays].sort((left, right) => left.sortOrder - right.sortOrder)
  const rawDaysById = new Map(rawDays.map((day) => [day.id, day]))
  const rawItemsById = new Map(rawDays.flatMap((day) => day.items.map((item) => [item.id, item])))
  const desiredDayIds = desiredPlans.map((day) => day.id).filter((dayId) => rawDaysById.has(dayId))
  const desiredDayIdSet = new Set(desiredDayIds)
  const orderedDays = [
    ...desiredDayIds.flatMap((dayId) => rawDaysById.get(dayId) ?? []),
    ...rawDays.filter((day) => !desiredDayIdSet.has(day.id)),
  ]

  const desiredItemIdsByDayId = new Map<string, string[]>()
  const desiredItemIds = new Set<string>()
  desiredPlans.forEach((day) => {
    if (!rawDaysById.has(day.id)) return
    const itemIds = day.items
      .map((item) => item.id)
      .filter((itemId) => rawItemsById.has(itemId))
    desiredItemIdsByDayId.set(day.id, itemIds)
    itemIds.forEach((itemId) => desiredItemIds.add(itemId))
  })

  const usedItemIds = new Set<string>()
  return {
    days: orderedDays.map((day, dayIndex) => {
      const orderedItemIds: string[] = []
      for (const itemId of desiredItemIdsByDayId.get(day.id) ?? []) {
        if (!usedItemIds.has(itemId)) {
          orderedItemIds.push(itemId)
          usedItemIds.add(itemId)
        }
      }
      for (const item of day.items) {
        if (usedItemIds.has(item.id) || desiredItemIds.has(item.id)) continue
        orderedItemIds.push(item.id)
        usedItemIds.add(item.id)
      }
      return {
        dayId: day.id,
        sortOrder: dayIndex,
        itemOrders: orderedItemIds.map((itemId, itemIndex) => ({
          itemId,
          sortOrder: itemIndex,
        })),
      }
    }),
  }
}

async function submitItineraryOrder(desiredPlans: DayPlan[]) {
  await itinerary.reorder(buildItineraryOrderSnapshot(desiredPlans))
}

let pendingOrderSave: Promise<void> = Promise.resolve()
async function persistItineraryOrder() {
  if (dayPlans.value.length === 0) return
  const desiredPlans = cloneHistoryValue(dayPlans.value)
  itineraryActionError.value = ''
  try {
    await submitItineraryOrder(desiredPlans)
  } catch {
    try {
      await itinerary.fetchItinerary()
      await submitItineraryOrder(desiredPlans)
    } catch {
      itineraryActionError.value = '일정 순서를 저장하지 못해 최신 상태로 되돌렸습니다.'
      undoStack.value = []
      redoStack.value = []
      await loadItinerary()
    }
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
  selectedRecommendationMapPlace.value = null
  if (visibleMapRoutes.value.length > 0) {
    nearbyOn.value = true
  } else if (nearbyOn.value) {
    clearRouteNearbyPlaces('경로를 먼저 생성해 주세요.')
  }
  nextTick(() => {
    initDragDrop()
  })
})

/* ── Panels ── */
type RouteUtilityPanel = 'ai' | 'chat' | 'memo' | 'todo'
type RouteLayoutMode = 'wide' | 'compact' | 'overlay' | 'mobile'

function routeLayoutModeForWidth(width: number): RouteLayoutMode {
  if (width >= 1440) return 'wide'
  if (width >= 1024) return 'compact'
  if (width >= 768) return 'overlay'
  return 'mobile'
}

const initialViewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
const routeViewportWidth = ref(initialViewportWidth)
const routeLayoutMode = computed(() => routeLayoutModeForWidth(routeViewportWidth.value))
const isRouteOverlayLayout = computed(() => routeViewportWidth.value < 1024)
const isLeftSidebarOpen = ref(initialViewportWidth >= 1024)

const activeRoutePanel = ref<RouteUtilityPanel>('ai')
const isRouteUtilityCollapsed = ref(initialViewportWidth < 1440)
const isAiChatOpen = computed(() => activeRoutePanel.value === 'ai')
const isTripChatOpen = computed(() => activeRoutePanel.value === 'chat')
const isMemoOpen = computed(() => activeRoutePanel.value === 'memo')
const isTodoOpen = computed(() => activeRoutePanel.value === 'todo')
const activeConversation = ref<'ai' | 'chat'>('ai')

function togglePanel(panel: RouteUtilityPanel) {
  activeRoutePanel.value = panel
  isRouteUtilityCollapsed.value = false
  if (isRouteOverlayLayout.value) isLeftSidebarOpen.value = false
  if (panel === 'ai' || panel === 'chat') {
    activeConversation.value = panel
    void loadConversations()
  } else if (panel === 'memo') {
    void loadNote()
  } else {
    void loadChecklists()
  }
}

function toggleRouteUtilityCollapsed() {
  const willOpen = isRouteUtilityCollapsed.value
  isRouteUtilityCollapsed.value = !isRouteUtilityCollapsed.value
  if (willOpen && isRouteOverlayLayout.value) isLeftSidebarOpen.value = false
}

function toggleLeftSidebar() {
  const willOpen = !isLeftSidebarOpen.value
  isLeftSidebarOpen.value = willOpen
  if (willOpen && isRouteOverlayLayout.value) isRouteUtilityCollapsed.value = true
}

function closeResponsivePanels() {
  if (!isRouteOverlayLayout.value) return
  isLeftSidebarOpen.value = false
  isRouteUtilityCollapsed.value = true
}

/* ── AI / trip chat ── */
const aiMessage = ref('')
const aiMessages = ref<RouteAiChatMessage[]>([])
const chatMessages = ref<TripChatMessage[]>([])
const aiSessionStatus = ref('')
const conversationLoading = ref(false)
const conversationError = ref('')

function oldestFirst<T extends { createdAt: string }>(messages: T[]) {
  return [...messages].sort((left, right) => (
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  ))
}

function currentUserSummary() {
  const userId = currentUserId.value
  if (!userId) return null
  const member = trip.value.members.find((candidate) => candidate.userId === userId)
  return member ? {
    id: member.userId,
    displayName: member.displayName,
    profileImageUrl: member.profileImageUrl,
  } : {
    id: userId,
    displayName: '나',
    profileImageUrl: null,
  }
}

function pendingAnswerCreatedAtFor(messageCreatedAt: string) {
  const timestamp = Date.parse(messageCreatedAt)
  return Number.isFinite(timestamp)
    ? new Date(timestamp + 1).toISOString()
    : messageCreatedAt
}

function upsertAiMessage(message: RouteAiChatMessage) {
  let next = aiMessages.value.filter((current) => current.id !== message.id)
  if (message.role === 'USER') {
    const requesterId = message.requester?.id ?? null
    const optimisticIndex = next.findIndex((current) => (
      current.pending
      && current.role === 'USER'
      && current.content === message.content
      && (current.requester?.id ?? null) === requesterId
    ))
    if (optimisticIndex >= 0) {
      const optimisticMessageId = next[optimisticIndex].id
      next[optimisticIndex] = message
      if (optimisticMessageId !== message.id) {
        const targetPendingExists = next.some((current) => current.pendingForMessageId === message.id)
        const pendingCreatedAt = pendingAnswerCreatedAtFor(message.createdAt)
        next = next.flatMap((current) => {
          if (current.pendingForMessageId !== optimisticMessageId) return [current]
          if (targetPendingExists) return []
          return [{
            ...current,
            id: `local-ai-pending-${message.id}`,
            pendingForMessageId: message.id,
            createdAt: pendingCreatedAt,
          }]
        })
      }
    } else {
      next.push(message)
    }
  } else {
    next = next.filter((current) => !current.pending || current.role !== 'ASSISTANT')
    next.push(message)
  }
  aiMessages.value = oldestFirst(next)
}

function addPendingAiAnswer(pendingForMessageId: string, createdAt: string) {
  if (aiMessages.value.some((message) => message.pendingForMessageId === pendingForMessageId)) return
  aiMessages.value = oldestFirst([
    ...aiMessages.value,
    {
      id: `local-ai-pending-${pendingForMessageId}`,
      role: 'ASSISTANT',
      requester: null,
      content: '...',
      toolCallId: null,
      createdAt,
      pending: true,
      pendingForMessageId,
    },
  ])
}

function removePendingAiAnswer(pendingForMessageId: string) {
  aiMessages.value = aiMessages.value.filter((message) => message.pendingForMessageId !== pendingForMessageId)
}

function removeOptimisticAiUserMessage(messageId: string) {
  aiMessages.value = aiMessages.value.filter((message) => message.id !== messageId)
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
  const now = new Date()
  const optimisticUserMessageId = `local-ai-user-${now.getTime()}`
  const pendingAnswerCreatedAt = new Date(now.getTime() + 1).toISOString()
  try {
    if (activeConversation.value === 'ai') {
      upsertAiMessage({
        id: optimisticUserMessageId,
        role: 'USER',
        requester: currentUserSummary(),
        content,
        toolCallId: null,
        createdAt: now.toISOString(),
        pending: true,
      })
      addPendingAiAnswer(optimisticUserMessageId, pendingAnswerCreatedAt)
      const response = await aiApi.sendMessage(tripId, {
        content,
        baseVersion: itinerary.itineraryVersion.value,
        viewport: mapViewport.viewport.value,
      })
      await syncAfterAiResponse(response)
      removePendingAiAnswer(optimisticUserMessageId)
      upsertAiMessage(response.message)
    } else {
      chatMessages.value.push(await chatApi.sendMessage(tripId, content))
    }
  } catch (error: any) {
    removePendingAiAnswer(optimisticUserMessageId)
    removeOptimisticAiUserMessage(optimisticUserMessageId)
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
const memoTextarea = ref<HTMLTextAreaElement | null>(null)

function formatMemo(kind: 'bold' | 'italic' | 'underline' | 'strike' | 'bullet' | 'number') {
  const textarea = memoTextarea.value
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = memoTextDisplay.value.slice(start, end) || '내용'
  const wrappers = {
    bold: ['**', '**'], italic: ['*', '*'], underline: ['<u>', '</u>'], strike: ['~~', '~~'],
  } as const
  let replacement = selected
  if (kind === 'bullet') replacement = selected.split('\n').map((line) => `- ${line}`).join('\n')
  else if (kind === 'number') replacement = selected.split('\n').map((line, index) => `${index + 1}. ${line}`).join('\n')
  else replacement = `${wrappers[kind][0]}${selected}${wrappers[kind][1]}`
  memoTextDisplay.value = `${memoTextDisplay.value.slice(0, start)}${replacement}${memoTextDisplay.value.slice(end)}`
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(start, start + replacement.length)
  })
}

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
const routeUtilityPanelMeta = computed(() => {
  if (activeRoutePanel.value === 'chat') {
    return {
      icon: 'forum',
      title: '여행방 채팅',
      status: conversationLoading.value ? '불러오는 중...' : `${trip.value.members.length}명 참여 중`,
    }
  }
  if (activeRoutePanel.value === 'memo') {
    return {
      icon: 'sticky_note_2',
      title: '여행 메모',
      status: memoStatus.value || (memoLoading.value ? '불러오는 중...' : '백엔드 연결됨'),
    }
  }
  if (activeRoutePanel.value === 'todo') {
    return {
      icon: 'playlist_add_check',
      title: '체크리스트',
      status: `${completedCount.value}/${totalCount.value} 완료 (${progressPercent.value}%)`,
    }
  }
  return {
    icon: 'auto_awesome',
    title: '숨길 AI 가이드',
    status: conversationLoading.value ? '불러오는 중...' : (aiSessionStatus.value || '백엔드 연결됨'),
  }
})

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
const routeState = ref<'route' | 'hidden'>('route')
const cardState = ref<'full' | 'min' | 'hidden'>('full')
const nearbyOn = ref(false)
const standardMapView = ref(false)
watch([nearbyOn, visibleMapRoutes], async ([isOn]) => {
  if (isOn) {
    await loadRouteNearbyPlaces()
  } else if (!isOn) {
    clearRouteNearbyPlaces()
  }
}, { immediate: true })
const drawingOn = ref(true)
const isPenPopoverOpen = ref(false)
const penSize = ref(6)
const penColor = ref('#1f2937')
const activeTool = ref<MapDrawingTool>('cursor')
const navigationGuideMode = computed(() => activeTool.value === 'route-pen')
const localDrawings = ref<MapDrawingStroke[]>([])
const selectedStickerCode = ref<MapStickerCode>('HEART')
const selectedMapObjectId = ref<string | null>(null)
const pendingImageMediaId = ref<string | null>(null)
const mapObjectImageUrls = ref<Record<string, string>>({})
const mapObjectLocks = ref<Record<string, MapObjectLockView>>({})
const remoteMapObjectPreviews = ref<Record<string, {
  clientId: string
  sequence: number
  transform: MapObjectTransform
}>>({})
const remoteMapCursors = ref<Record<string, MapCursorView & { receivedAt: number }>>({})
const mapObjectEpoch = ref(0)
const mapImageInput = ref<HTMLInputElement | null>(null)
const mapImageUploading = ref(false)
const mapObjects = computed(() => itinerary.mapDrawings.value.filter(
  (drawing) => drawing.drawingType === 'STICKER' || drawing.drawingType === 'IMAGE',
))
const visibleMapCursors = computed<MapCursorView[]>(() => Object.values(remoteMapCursors.value))
const mapObjectPreviewTransforms = computed<Record<string, MapObjectTransform>>(() => Object.fromEntries(
  Object.entries(remoteMapObjectPreviews.value).map(([drawingId, preview]) => [drawingId, preview.transform]),
))
const mapObjectPlacement = computed(() => (
  activeTool.value === 'sticker' || (activeTool.value === 'image' && pendingImageMediaId.value !== null)
))

type ToolPopoverStyle = Record<string, string>

const mapCanvasRef = ref<HTMLElement | null>(null)
const penToolButtonRef = ref<HTMLButtonElement | null>(null)
const stickerToolButtonRef = ref<HTMLButtonElement | null>(null)
const penPopoverRef = ref<HTMLElement | null>(null)
const stickerPopoverRef = ref<HTMLElement | null>(null)
const penPopoverStyle = ref<ToolPopoverStyle>({})
const stickerPopoverStyle = ref<ToolPopoverStyle>({})

function anchoredToolPopoverStyle(
  button: HTMLElement | null,
  popover: HTMLElement | null,
): ToolPopoverStyle {
  const canvas = mapCanvasRef.value
  if (!button || !popover || !canvas) return {}

  const buttonRect = button.getBoundingClientRect()
  const canvasRect = canvas.getBoundingClientRect()
  const popoverRect = popover.getBoundingClientRect()
  const popoverWidth = popoverRect.width || 240
  const halfWidth = popoverWidth / 2
  const edgeGap = 12
  const buttonCenter = buttonRect.left - canvasRect.left + (buttonRect.width / 2)
  const clampedCenter = Math.min(
    Math.max(buttonCenter, halfWidth + edgeGap),
    Math.max(halfWidth + edgeGap, canvasRect.width - halfWidth - edgeGap),
  )
  const anchorX = buttonCenter - (clampedCenter - halfWidth)

  return {
    left: `${clampedCenter}px`,
    bottom: `${Math.max(edgeGap, canvasRect.bottom - buttonRect.top + 10)}px`,
    '--popover-anchor-x': `${Math.min(Math.max(anchorX, 16), popoverWidth - 16)}px`,
  }
}

function updateToolPopoverPositions() {
  if (isPenPopoverOpen.value) {
    penPopoverStyle.value = anchoredToolPopoverStyle(penToolButtonRef.value, penPopoverRef.value)
  }
  if (activeTool.value === 'sticker') {
    stickerPopoverStyle.value = anchoredToolPopoverStyle(stickerToolButtonRef.value, stickerPopoverRef.value)
  }
}

watch(isPenPopoverOpen, (isOpen) => {
  if (isOpen) {
    nextTick(updateToolPopoverPositions)
  }
})

watch(activeTool, (newTool) => {
  if (newTool !== 'pen') {
    isPenPopoverOpen.value = false
  }
  if (newTool !== 'route-pen') {
    clearPendingRouteSelection()
  }
  if (newTool !== 'image') pendingImageMediaId.value = null
  if (newTool === 'sticker') nextTick(updateToolPopoverPositions)
})

function selectMapTool(tool: MapDrawingTool) {
  if (activeTool.value === tool) {
    if (tool === 'pen') {
      isPenPopoverOpen.value = !isPenPopoverOpen.value
      if (isPenPopoverOpen.value) nextTick(updateToolPopoverPositions)
    }
    return
  }

  activeTool.value = tool
  if (tool === 'route-pen') {
    standardMapView.value = false
  }
  if (tool === 'pen' || tool === 'eraser') {
    drawingOn.value = true
  }
  if (tool === 'sticker' || tool === 'image') {
    standardMapView.value = false
    selectedMapObjectId.value = null
  }
  if (tool === 'pen') {
    isPenPopoverOpen.value = true
    nextTick(updateToolPopoverPositions)
  }
}

let previousRouteLayoutMode = routeLayoutMode.value

function updateRouteResponsiveLayout() {
  if (typeof window === 'undefined') return
  routeViewportWidth.value = window.innerWidth
  const nextMode = routeLayoutMode.value

  if (nextMode !== previousRouteLayoutMode) {
    if (nextMode === 'wide') {
      isLeftSidebarOpen.value = true
      isRouteUtilityCollapsed.value = false
    } else if (nextMode === 'compact') {
      isLeftSidebarOpen.value = true
      isRouteUtilityCollapsed.value = true
    } else {
      isLeftSidebarOpen.value = false
      isRouteUtilityCollapsed.value = true
    }
    previousRouteLayoutMode = nextMode
  }

  nextTick(updateToolPopoverPositions)
}

function toggleStandardMapView() {
  standardMapView.value = !standardMapView.value
  if (standardMapView.value && activeTool.value === 'route-pen') {
    activeTool.value = 'cursor'
    clearPendingRouteSelection()
  }
}
const pendingDrawingIds = ref<string[]>([])
const drawingRetryIds = ref<string[]>([])
const simplifiedDrawingCoordinates = new Map<string, MapDrawingStroke['coordinates']>()
interface MapObjectLockEvent {
  eventType: 'map.object.lock'
  tripId: string
  drawingId: string
  locked: boolean
  userId: string | null
  clientId: string | null
  expiresAt: string | null
}
interface MapObjectTransformPreviewEvent {
  eventType: 'map.object.transform.preview'
  tripId: string
  drawingId: string
  userId: string
  clientId: string
  sequence: number
  phase: 'UPDATE' | 'END' | 'CANCEL'
  transform: MapObjectTransform
}
interface MapCursorEvent {
  eventType: 'cursor.moved'
  tripId: string
  userId: string
  clientId: string
  longitude: number
  latitude: number
  sequence: number
  sentAt: string
}
const pendingMapObjectLeases = new Map<string, Promise<boolean>>()
const mapObjectLeaseResolvers = new Map<string, (acquired: boolean) => void>()
const mapObjectLeaseTimers = new Map<string, number>()
const pendingMapObjectPreviewTransforms = new Map<string, MapObjectTransform>()
const mapObjectPreviewSequences = new Map<string, number>()
const mapObjectPreviewSentAt = new Map<string, number>()
const collaborationConnected = ref(false)
let cursorSequence = 0
let lastCursorSentAt = 0
const collaborationTransport = new StompTransport({
  brokerUrl: resolveWebSocketUrl(import.meta.env.VITE_WS_URL),
  accessToken: ensureStoredAccessToken,
  onConnected: (reconnected) => {
		collaborationConnected.value = true
		if (reconnected) {
			serverUndoAvailable.value = false
			serverRedoAvailable.value = false
		}
    if (reconnected) void itinerary.fetchItinerary()
  },
  onDisconnected: () => {
		collaborationConnected.value = false
		serverUndoAvailable.value = false
		serverRedoAvailable.value = false
    mapObjectEpoch.value += 1
    selectedMapObjectId.value = null
    mapObjectLocks.value = {}
    remoteMapObjectPreviews.value = {}
    pendingMapObjectPreviewTransforms.clear()
    mapObjectLeaseResolvers.forEach((resolve) => resolve(false))
    mapObjectLeaseResolvers.clear()
    pendingMapObjectLeases.clear()
    mapObjectLeaseTimers.forEach(clearInterval)
    mapObjectLeaseTimers.clear()
  },
})
const drawingPreviewChannel = useDrawingPreviewChannel({
  tripId,
  clientId: globalThis.crypto?.randomUUID?.() ?? `drawing-client-${Date.now()}`,
  transport: collaborationTransport,
})
const mapDrawings = computed(() => [
  ...localDrawings.value,
  ...drawingPreviewChannel.remoteDrawings.value,
])
let localDrawingSequence = 0
let tripRealtimeUnsubscribers: Array<() => void> = []
let itineraryRefreshTimer: ReturnType<typeof setTimeout> | null = null
let itineraryRefreshInFlight: Promise<unknown> | null = null
let conversationRefreshTimer: ReturnType<typeof setTimeout> | null = null
let planningRefreshTimer: ReturnType<typeof setTimeout> | null = null
let cursorPruneTimer: number | null = null

function tripRealtimeTopic(topic: 'collaboration' | 'presence' | 'itinerary' | 'map-drawings' | 'route-matching' | 'chat' | 'planning' | 'ai') {
  return `/topic/trips/${encodeURIComponent(tripId)}/${topic}`
}

function isTripRealtimeEvent(message: unknown): message is TripRealtimeEvent {
  return typeof message === 'object'
    && message !== null
    && (typeof (message as TripRealtimeEvent).tripId === 'undefined'
      || (message as TripRealtimeEvent).tripId === tripId)
}

function isTripPresenceEvent(message: unknown): message is TripPresenceEvent {
  if (!isTripRealtimeEvent(message)) return false
  const candidate = message as Partial<TripPresenceEvent>
  return candidate.eventType === 'presence.snapshot'
    && Array.isArray(candidate.activeUserIds)
    && candidate.activeUserIds.every((userId) => typeof userId === 'string')
}

function isMapObjectLockEvent(message: unknown): message is MapObjectLockEvent {
  if (!isTripRealtimeEvent(message)) return false
  const candidate = message as Partial<MapObjectLockEvent>
  return candidate.eventType === 'map.object.lock'
    && typeof candidate.drawingId === 'string'
    && typeof candidate.locked === 'boolean'
}

function isMapObjectTransformPreviewEvent(message: unknown): message is MapObjectTransformPreviewEvent {
  if (!isTripRealtimeEvent(message)) return false
  const candidate = message as Partial<MapObjectTransformPreviewEvent>
  const transform = candidate.transform as Partial<MapObjectTransform> | undefined
  return candidate.eventType === 'map.object.transform.preview'
    && typeof candidate.drawingId === 'string'
    && typeof candidate.userId === 'string'
    && typeof candidate.clientId === 'string'
    && typeof candidate.sequence === 'number'
    && (candidate.phase === 'UPDATE' || candidate.phase === 'END' || candidate.phase === 'CANCEL')
    && Boolean(transform)
    && [transform?.centerLng, transform?.centerLat, transform?.widthMeters, transform?.heightMeters, transform?.rotationDeg]
      .every((value) => typeof value === 'number' && Number.isFinite(value))
}

function isMapCursorEvent(message: unknown): message is MapCursorEvent {
  if (!isTripRealtimeEvent(message)) return false
  const candidate = message as Partial<MapCursorEvent>
  return candidate.eventType === 'cursor.moved'
    && typeof candidate.userId === 'string'
    && typeof candidate.clientId === 'string'
    && typeof candidate.longitude === 'number'
    && typeof candidate.latitude === 'number'
    && Number.isFinite(candidate.longitude)
    && Number.isFinite(candidate.latitude)
}

function isCollaborationCommandEvent(message: unknown): message is CollaborationCommandEvent {
  if (!isTripRealtimeEvent(message)) return false
  const candidate = message as Partial<CollaborationCommandEvent>
  return typeof candidate.commandEventId === 'number'
    && typeof candidate.actorUserId === 'string'
    && typeof candidate.commandType === 'string'
    && typeof candidate.versionAfter === 'number'
}

function cursorColor(userId: string) {
  const colors = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2']
  const hash = [...userId].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0)
  return colors[hash % colors.length]
}

function memberDisplayName(userId: string) {
  return trip.value.members.find((member) => member.userId === userId)?.displayName ?? '여행 친구'
}

function receiveMapObjectLock(event: MapObjectLockEvent) {
  const next = { ...mapObjectLocks.value }
  if (!event.locked || !event.userId || !event.clientId || !event.expiresAt) {
    delete next[event.drawingId]
    const previews = { ...remoteMapObjectPreviews.value }
    delete previews[event.drawingId]
    remoteMapObjectPreviews.value = previews
  } else {
    next[event.drawingId] = {
      drawingId: event.drawingId,
      userId: event.userId,
      clientId: event.clientId,
      expiresAt: event.expiresAt,
    }
  }
  mapObjectLocks.value = next
  if (event.locked && event.clientId === getCollaborationSessionId()) {
    mapObjectLeaseResolvers.get(event.drawingId)?.(true)
    mapObjectLeaseResolvers.delete(event.drawingId)
  }
}

function receiveMapObjectTransformPreview(event: MapObjectTransformPreviewEvent) {
  if (event.clientId === getCollaborationSessionId()) return
  const next = { ...remoteMapObjectPreviews.value }
  const current = next[event.drawingId]
  if (event.phase !== 'UPDATE') {
    delete next[event.drawingId]
  } else if (!current || current.clientId !== event.clientId || event.sequence > current.sequence) {
    next[event.drawingId] = {
      clientId: event.clientId,
      sequence: event.sequence,
      transform: event.transform,
    }
  }
  remoteMapObjectPreviews.value = next
}

function publishMapObjectLock(drawingId: string, action: 'ACQUIRE' | 'RENEW' | 'RELEASE') {
  return collaborationTransport.publish(`/app/trips/${encodeURIComponent(tripId)}/map-object-lock`, { drawingId, action })
}

function acquireMapObjectLease(drawingId: string) {
  const sessionId = getCollaborationSessionId()
  if (!collaborationConnected.value || !sessionId) {
    itineraryActionError.value = '실시간 협업 연결 후 다시 시도해 주세요.'
    return Promise.resolve(false)
  }
  const lock = mapObjectLocks.value[drawingId]
  if (lock?.clientId === sessionId) return Promise.resolve(true)
  if (lock && Date.parse(lock.expiresAt) > Date.now()) {
    itineraryActionError.value = lock.userId === currentUserId.value
      ? '이 오브젝트는 같은 계정의 다른 창에서 편집 중입니다. 잠시 후 다시 시도해 주세요.'
      : `${memberDisplayName(lock.userId)}님이 이 오브젝트를 편집 중입니다.`
    return Promise.resolve(false)
  }
  const existing = pendingMapObjectLeases.get(drawingId)
  if (existing) return existing
  const promise = new Promise<boolean>((resolve) => {
    const timeout = window.setTimeout(() => {
      mapObjectLeaseResolvers.delete(drawingId)
		itineraryActionError.value = '오브젝트 편집 잠금을 얻지 못했습니다. 잠시 후 다시 시도해 주세요.'
      resolve(false)
    }, 1500)
    mapObjectLeaseResolvers.set(drawingId, (acquired) => {
      window.clearTimeout(timeout)
      if (acquired && !mapObjectLeaseTimers.has(drawingId)) {
        mapObjectLeaseTimers.set(drawingId, window.setInterval(
          () => publishMapObjectLock(drawingId, 'RENEW'),
          5000,
        ))
      }
      resolve(acquired)
    })
    if (!publishMapObjectLock(drawingId, 'ACQUIRE')) {
      window.clearTimeout(timeout)
      mapObjectLeaseResolvers.delete(drawingId)
      resolve(false)
    }
  }).finally(() => pendingMapObjectLeases.delete(drawingId))
  pendingMapObjectLeases.set(drawingId, promise)
  return promise
}

function releaseMapObjectLease(drawingId: string) {
  const timer = mapObjectLeaseTimers.get(drawingId)
  if (timer) clearInterval(timer)
  mapObjectLeaseTimers.delete(drawingId)
  pendingMapObjectPreviewTransforms.delete(drawingId)
  mapObjectPreviewSentAt.delete(drawingId)
  publishMapObjectLock(drawingId, 'RELEASE')
}

function publishMapObjectTransformPreview(
  drawingId: string,
  transform: MapObjectTransform,
  phase: 'UPDATE' | 'END' | 'CANCEL' = 'UPDATE',
  force = false,
) {
  pendingMapObjectPreviewTransforms.set(drawingId, transform)
  const sessionId = getCollaborationSessionId()
  if (!sessionId || mapObjectLocks.value[drawingId]?.clientId !== sessionId) return false
  const now = Date.now()
  if (!force && phase === 'UPDATE' && now - (mapObjectPreviewSentAt.get(drawingId) ?? 0) < 50) return false
  const sequence = (mapObjectPreviewSequences.get(drawingId) ?? 0) + 1
  mapObjectPreviewSequences.set(drawingId, sequence)
  mapObjectPreviewSentAt.set(drawingId, now)
  return collaborationTransport.publish(
    `/app/trips/${encodeURIComponent(tripId)}/map-object-transform-preview`,
    { drawingId, sequence, phase, transform },
  )
}

function isTripChatMessage(message: unknown): message is TripChatMessage {
  if (!message || typeof message !== 'object') return false
  const candidate = message as Partial<TripChatMessage>
  return typeof candidate.id === 'string'
    && typeof candidate.tripId === 'string'
    && candidate.tripId === tripId
    && (typeof candidate.content === 'string' || candidate.content === null)
    && typeof candidate.createdAt === 'string'
    && typeof candidate.sender === 'object'
    && candidate.sender !== null
}

function extractChatMessage(message: unknown): TripChatMessage | null {
  if (isTripChatMessage(message)) return message
  if (message && typeof message === 'object' && 'message' in message) {
    const nested = (message as { message?: unknown }).message
    if (isTripChatMessage(nested)) return nested
  }
  return null
}

function isAiChatMessage(message: unknown): message is AiChatMessage {
  if (!message || typeof message !== 'object') return false
  const candidate = message as Partial<AiChatMessage>
  return typeof candidate.id === 'string'
    && (candidate.role === 'USER' || candidate.role === 'ASSISTANT' || candidate.role === 'TOOL' || candidate.role === 'SYSTEM')
    && typeof candidate.content === 'string'
    && typeof candidate.createdAt === 'string'
}

function extractAiMessage(message: unknown): AiChatMessage | null {
  if (isAiChatMessage(message)) return message
  if (message && typeof message === 'object' && 'message' in message) {
    const nested = (message as { message?: unknown }).message
    if (isAiChatMessage(nested)) return nested
  }
  return null
}

function isDrawingPreviewRealtimeMessage(message: unknown) {
  if (!message || typeof message !== 'object') return false
  const candidate = message as Partial<DrawingPreviewEvent> & { clientId?: unknown }
  return typeof candidate.clientId === 'string'
    && typeof candidate.previewId === 'string'
    && typeof candidate.sequence === 'number'
    && (candidate.phase === 'UPDATE' || candidate.phase === 'END' || candidate.phase === 'CANCEL')
}

function tagForScope(scopeType: Note['scopeType'] | Checklist['scopeType'], itineraryDayId: string | null) {
  if (scopeType === 'TRIP') return '전체'
  const day = dayPlans.value.find((candidate) => candidate.id === itineraryDayId)
  return day?.groupType === 'DAY' ? `${day.day}일차` : null
}

function upsertChecklist(checklist: Checklist) {
  const index = checklists.value.findIndex((current) => current.id === checklist.id)
  if (index < 0) {
    checklists.value = [...checklists.value, checklist]
  } else {
    const next = [...checklists.value]
    next[index] = checklist
    checklists.value = next
  }
}

function upsertChecklistItem(checklistId: string, item: ChecklistItem) {
  const checklist = checklists.value.find((current) => current.id === checklistId)
  if (!checklist) {
    void loadChecklists()
    return
  }
  const items = [...checklist.items.filter((current) => current.id !== item.id), item]
    .sort((left, right) => left.sortOrder - right.sortOrder)
  upsertChecklist({ ...checklist, items })
}

function upsertChecklistMemberStatus(checklistId: string, itemId: string, memberStatus: ChecklistMemberStatus) {
  const checklist = checklists.value.find((current) => current.id === checklistId)
  const item = checklist?.items.find((current) => current.id === itemId)
  if (!checklist || !item) {
    void loadChecklists()
    return
  }
  const memberStatuses = [
    ...item.memberStatuses.filter((current) => current.user.id !== memberStatus.user.id),
    memberStatus,
  ]
  upsertChecklistItem(checklistId, { ...item, memberStatuses })
}

function applyPlanningRealtimeEvent(message: unknown) {
  if (!message || typeof message !== 'object') return false
  const event = message as {
    eventType?: string
    note?: Note
    noteId?: string
    checklist?: Checklist
    checklistId?: string
    item?: ChecklistItem
    itemId?: string
    memberStatus?: ChecklistMemberStatus
  }
  switch (event.eventType) {
    case 'planning.note.upserted': {
      if (!event.note) return false
      const tag = tagForScope(event.note.scopeType, event.note.itineraryDayId)
      if (!tag) return false
      notes.value = { ...notes.value, [tag]: event.note }
      if (activeMemoDay.value === tag) memoTextDisplay.value = event.note.content
      return true
    }
    case 'planning.note.deleted': {
      const entries = Object.entries(notes.value)
      const tag = entries.find(([, note]) => note?.id === event.noteId)?.[0]
      if (!tag) return false
      notes.value = { ...notes.value, [tag]: null }
      if (activeMemoDay.value === tag) memoTextDisplay.value = ''
      return true
    }
    case 'planning.checklist.upserted':
    case 'planning.checklist.items.reordered': {
      if (!event.checklist) return false
      upsertChecklist(event.checklist)
      return true
    }
    case 'planning.checklist.deleted': {
      if (!event.checklistId) return false
      checklists.value = checklists.value.filter((checklist) => checklist.id !== event.checklistId)
      return true
    }
    case 'planning.checklist.item.created':
    case 'planning.checklist.item.updated': {
      if (!event.checklistId || !event.item) return false
      upsertChecklistItem(event.checklistId, event.item)
      return true
    }
    case 'planning.checklist.item.deleted': {
      if (!event.checklistId || !event.itemId) return false
      const checklist = checklists.value.find((current) => current.id === event.checklistId)
      if (!checklist) return false
      upsertChecklist({
        ...checklist,
        items: checklist.items.filter((item) => item.id !== event.itemId),
      })
      return true
    }
    case 'planning.checklist.member_status.updated': {
      if (!event.checklistId || !event.itemId || !event.memberStatus) return false
      upsertChecklistMemberStatus(event.checklistId, event.itemId, event.memberStatus)
      return true
    }
    default:
      return false
  }
}

function scheduleItineraryRefresh(event?: unknown) {
  if (event && !isTripRealtimeEvent(event)) return
  const eventVersion: number | null = event && typeof (event as TripRealtimeEvent).itineraryVersion === 'number'
    ? (event as TripRealtimeEvent).itineraryVersion as number
    : null
  if (eventVersion !== null && eventVersion <= itinerary.itineraryVersion.value) return
  if (itineraryRefreshTimer) return
  itineraryRefreshTimer = setTimeout(() => {
    itineraryRefreshTimer = null
    itineraryRefreshInFlight = (itineraryRefreshInFlight ?? itinerary.fetchItinerary())
      .catch((cause) => {
        console.error('Realtime itinerary refresh failed', cause)
      })
      .finally(() => {
        itineraryRefreshInFlight = null
      })
  }, 50)
}

function scheduleConversationRefresh() {
  if (conversationRefreshTimer) return
  conversationRefreshTimer = setTimeout(() => {
    conversationRefreshTimer = null
    void loadConversations()
  }, 50)
}

function schedulePlanningRefresh() {
  if (planningRefreshTimer) return
  planningRefreshTimer = setTimeout(() => {
    planningRefreshTimer = null
    if (activeRoutePanel.value === 'memo') void loadNote()
    if (activeRoutePanel.value === 'todo') void loadChecklists()
  }, 50)
}

function receiveItineraryEvent(message: unknown) {
  if (isDrawingPreviewRealtimeMessage(message)) return
  if (isMapObjectTransformPreviewEvent(message)) {
    receiveMapObjectTransformPreview(message)
    return
  }
  if (isMapObjectLockEvent(message)) {
    receiveMapObjectLock(message)
    return
  }
  if (message && typeof message === 'object' && typeof (message as { drawingId?: unknown }).drawingId === 'string') {
    const previews = { ...remoteMapObjectPreviews.value }
    delete previews[(message as { drawingId: string }).drawingId]
    remoteMapObjectPreviews.value = previews
  }
  scheduleItineraryRefresh(message)
}

function receiveCollaborationEvent(message: unknown) {
  if (isCollaborationCommandEvent(message)) {
    if (message.websocketSessionId === getCollaborationSessionId() && message.source === 'USER') {
      serverUndoAvailable.value = true
      serverRedoAvailable.value = false
    }
    return
  }
  if (isMapCursorEvent(message)) {
    if (message.userId === currentUserId.value) return
    remoteMapCursors.value = {
      ...remoteMapCursors.value,
      [message.clientId]: {
        clientId: message.clientId,
        userId: message.userId,
        displayName: memberDisplayName(message.userId),
        color: cursorColor(message.userId),
        coordinate: { lng: message.longitude, lat: message.latitude },
        receivedAt: Date.now(),
      },
    }
    return
  }
  if (!isTripPresenceEvent(message)) return
  onlineUserIds.value = new Set(message.activeUserIds)
  const knownUserIds = new Set(trip.value.members.map((member) => member.userId))
  if (message.activeUserIds.some((userId) => !knownUserIds.has(userId))) {
    void loadTrip()
  }
}

function receiveChatEvent(message: unknown) {
  const chatMessage = extractChatMessage(message)
  if (!chatMessage) {
    scheduleConversationRefresh()
    return
  }
  if (chatMessages.value.some((current) => current.id === chatMessage.id)) return
  chatMessages.value = oldestFirst([...chatMessages.value, chatMessage])
}

function receivePlanningEvent(message: unknown) {
  if (!isTripRealtimeEvent(message)) return
  if (!applyPlanningRealtimeEvent(message)) schedulePlanningRefresh()
  scheduleItineraryRefresh(message)
}

function receiveAiEvent(message: unknown) {
  if (!isTripRealtimeEvent(message)) return
  const aiChatMessage = extractAiMessage(message)
  if (aiChatMessage) {
    upsertAiMessage(aiChatMessage)
    if (aiChatMessage.role === 'USER') {
      addPendingAiAnswer(aiChatMessage.id, pendingAnswerCreatedAtFor(aiChatMessage.createdAt))
      return
    }
  } else {
    scheduleConversationRefresh()
  }
  scheduleItineraryRefresh(message)
}

function connectTripRealtime() {
  if (!tripId || tripRealtimeUnsubscribers.length > 0) return
  tripRealtimeUnsubscribers = [
    collaborationTransport.subscribe(tripRealtimeTopic('collaboration'), receiveCollaborationEvent),
    collaborationTransport.subscribe(tripRealtimeTopic('presence'), receiveCollaborationEvent),
    collaborationTransport.subscribe(tripRealtimeTopic('itinerary'), receiveItineraryEvent),
    collaborationTransport.subscribe(tripRealtimeTopic('map-drawings'), receiveItineraryEvent),
    collaborationTransport.subscribe(tripRealtimeTopic('route-matching'), receiveItineraryEvent),
    collaborationTransport.subscribe(tripRealtimeTopic('chat'), receiveChatEvent),
    collaborationTransport.subscribe(tripRealtimeTopic('planning'), receivePlanningEvent),
    collaborationTransport.subscribe(tripRealtimeTopic('ai'), receiveAiEvent),
  ]
  collaborationTransport.connect()
}

async function connectRealtimeChannels() {
  try {
    if (!tripId || !await ensureStoredAccessToken()) return
  } catch (cause) {
    console.error('Realtime authentication refresh failed.', cause)
    return
  }
  drawingPreviewChannel.connect()
  connectTripRealtime()
}

function disconnectTripRealtime() {
  tripRealtimeUnsubscribers.forEach((unsubscribe) => unsubscribe())
  tripRealtimeUnsubscribers = []
  onlineUserIds.value = new Set()
  remoteMapCursors.value = {}
  if (itineraryRefreshTimer) clearTimeout(itineraryRefreshTimer)
  if (conversationRefreshTimer) clearTimeout(conversationRefreshTimer)
  if (planningRefreshTimer) clearTimeout(planningRefreshTimer)
  itineraryRefreshTimer = null
  conversationRefreshTimer = null
  planningRefreshTimer = null
  void collaborationTransport.disconnect()
}

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

async function syncMapObjectImages(drawings: MapDrawing[]) {
  const desiredMediaIds = new Set(drawings.flatMap((drawing) => (
    drawing.drawingType === 'IMAGE' && drawing.mediaFileId ? [drawing.mediaFileId] : []
  )))
  const next = { ...mapObjectImageUrls.value }
  for (const [mediaId, url] of Object.entries(next)) {
    if (!desiredMediaIds.has(mediaId) && mediaId !== pendingImageMediaId.value) {
      URL.revokeObjectURL(url)
      delete next[mediaId]
    }
  }
  mapObjectImageUrls.value = next
  await Promise.all([...desiredMediaIds].map(async (mediaId) => {
    if (mapObjectImageUrls.value[mediaId]) return
    try {
      const url = await mediaApi.getContentObjectUrl(mediaId)
      if (!desiredMediaIds.has(mediaId)) {
        URL.revokeObjectURL(url)
        return
      }
      mapObjectImageUrls.value = { ...mapObjectImageUrls.value, [mediaId]: url }
    } catch (cause) {
      console.error('Map overlay image could not be loaded.', cause)
    }
  }))
}

watch(itinerary.mapDrawings, (drawings) => {
  void syncMapObjectImages(drawings)
}, { deep: true, immediate: true })

async function handleMapObjectPlace(transform: MapObjectTransform) {
  if (itinerary.mutating.value) return
  if (!collaborationConnected.value || !getCollaborationSessionId()) {
    itineraryActionError.value = '실시간 협업 연결 후 지도 오브젝트를 추가해 주세요.'
    return
  }
  try {
    const mediaFileId = activeTool.value === 'image' ? pendingImageMediaId.value : null
    const stickerCode = activeTool.value === 'sticker' ? selectedStickerCode.value : null
    if (!mediaFileId && !stickerCode) return
    const created = await itinerary.createDrawing({
      itineraryDayId: activePlan.value?.id ?? null,
      drawingType: stickerCode ? 'STICKER' : 'IMAGE',
      geometry: { type: 'Point', coordinates: [transform.centerLng, transform.centerLat] },
      style: null,
      label: stickerCode ? MAP_STICKERS.find((sticker) => sticker.code === stickerCode)?.label ?? null : null,
      mediaFileId,
      stickerCode,
      transform,
      sortOrder: itinerary.mapDrawings.value.length,
    })
    selectedMapObjectId.value = created.id
    if (mediaFileId) {
      pendingImageMediaId.value = null
      activeTool.value = 'cursor'
    }
  } catch (cause) {
    console.error('Map object could not be created.', cause)
  }
}

function openMapImagePicker() {
  if (!collaborationConnected.value || !getCollaborationSessionId()) {
    itineraryActionError.value = '실시간 협업 연결 후 이미지를 업로드해 주세요.'
    return
  }
  if (!mapImageUploading.value) mapImageInput.value?.click()
}

async function handleMapImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!collaborationConnected.value || !getCollaborationSessionId()) {
    itineraryActionError.value = '실시간 협업 연결 후 이미지를 업로드해 주세요.'
    return
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    window.alert('JPG, PNG, WebP 이미지를 10MB 이하로 선택해 주세요.')
    return
  }
  mapImageUploading.value = true
  const previewUrl = URL.createObjectURL(file)
  try {
    const media = await mediaApi.uploadFile(file, 'MAP_OVERLAY', {
      linkedResourceType: 'TRIP',
      linkedResourceId: tripId,
    })
    const previousPendingMediaId = pendingImageMediaId.value
    if (previousPendingMediaId && previousPendingMediaId !== media.id) {
      const previousPendingUrl = mapObjectImageUrls.value[previousPendingMediaId]
      if (previousPendingUrl) URL.revokeObjectURL(previousPendingUrl)
    }
    const previous = mapObjectImageUrls.value[media.id]
    if (previous) URL.revokeObjectURL(previous)
    mapObjectImageUrls.value = { ...mapObjectImageUrls.value, [media.id]: previewUrl }
    pendingImageMediaId.value = media.id
    activeTool.value = 'image'
    selectedMapObjectId.value = null
  } catch (cause) {
    URL.revokeObjectURL(previewUrl)
    console.error('Map overlay image upload failed.', cause)
    window.alert('지도 이미지를 업로드하지 못했습니다.')
  } finally {
    mapImageUploading.value = false
  }
}

function beginMapObjectEdit(drawingId: string) {
  void acquireMapObjectLease(drawingId).then((acquired) => {
    const latestTransform = pendingMapObjectPreviewTransforms.get(drawingId)
    if (acquired && latestTransform) {
      publishMapObjectTransformPreview(drawingId, latestTransform, 'UPDATE', true)
    }
  })
}

function cancelMapObjectEdit(drawingId: string) {
  const transform = pendingMapObjectPreviewTransforms.get(drawingId)
    ?? mapObjects.value.find((drawing) => drawing.id === drawingId)?.transform
  if (transform) publishMapObjectTransformPreview(drawingId, transform, 'CANCEL', true)
  releaseMapObjectLease(drawingId)
}

function previewMapObjectChange(drawingId: string, transform: MapObjectTransform) {
  publishMapObjectTransformPreview(drawingId, transform)
}

async function changeMapObject(drawingId: string, transform: MapObjectTransform) {
  const lease = pendingMapObjectLeases.get(drawingId) ?? acquireMapObjectLease(drawingId)
  if (!await lease) {
    mapObjectEpoch.value += 1
    await itinerary.fetchItinerary()
    return
  }
  publishMapObjectTransformPreview(drawingId, transform, 'UPDATE', true)
  try {
    await itinerary.updateDrawing(drawingId, {
      geometry: { type: 'Point', coordinates: [transform.centerLng, transform.centerLat] },
      transform,
    })
  } catch (cause) {
    mapObjectEpoch.value += 1
    await itinerary.fetchItinerary()
    console.error('Map object could not be updated.', cause)
  } finally {
    publishMapObjectTransformPreview(drawingId, transform, 'END', true)
    releaseMapObjectLease(drawingId)
  }
}

async function deleteSelectedMapObject() {
  const drawingId = selectedMapObjectId.value
  if (!drawingId) return
  if (!await acquireMapObjectLease(drawingId)) return
  try {
    await itinerary.deleteDrawing(drawingId)
    selectedMapObjectId.value = null
  } catch (cause) {
    console.error('Map object could not be deleted.', cause)
    itineraryActionError.value = '지도 오브젝트를 삭제하지 못했습니다. 최신 상태를 다시 불러왔습니다.'
    await loadItinerary()
  } finally {
    releaseMapObjectLease(drawingId)
  }
}

function publishMapCursor(coordinate: LngLat) {
  const now = Date.now()
  if (now - lastCursorSentAt < 50) return
  lastCursorSentAt = now
  collaborationTransport.publish(`/app/trips/${encodeURIComponent(tripId)}/cursor`, {
    longitude: coordinate.lng,
    latitude: coordinate.lat,
    sequence: ++cursorSequence,
  })
}

onMounted(() => {
  void connectRealtimeChannels()
  updateRouteResponsiveLayout()
  window.addEventListener('resize', updateRouteResponsiveLayout)
  cursorPruneTimer = window.setInterval(() => {
    const now = Date.now()
    const cutoff = now - 10_000
    remoteMapCursors.value = Object.fromEntries(
      Object.entries(remoteMapCursors.value).filter(([, cursor]) => cursor.receivedAt >= cutoff),
    )
    mapObjectLocks.value = Object.fromEntries(
      Object.entries(mapObjectLocks.value).filter(([, lock]) => Date.parse(lock.expiresAt) > now),
    )
  }, 1000)
})

onUnmounted(() => {
  void drawingPreviewChannel.disconnect()
  disconnectTripRealtime()
  window.removeEventListener('resize', updateRouteResponsiveLayout)
  if (cursorPruneTimer) clearInterval(cursorPruneTimer)
  cursorPruneTimer = null
  Object.values(mapObjectImageUrls.value).forEach((url) => URL.revokeObjectURL(url))
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
			if (!localDrawings.value.some(candidate => candidate.id === drawingId)) return
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
  if (!collaborationConnected.value || !getCollaborationSessionId()) {
    itineraryActionError.value = '실시간 협업 연결 후 지도에 그려 주세요.'
    return
  }
  pushUndoState('drawing')
  const drawing: MapDrawingStroke = {
    id: `local-drawing-${++localDrawingSequence}`,
    ...draft,
  }
  localDrawings.value = [...localDrawings.value, drawing]
  void simplifyLocalDrawing(drawing.id)
}

function handleDrawingCreate(draft: MapDrawingDraft) {
  if (activeTool.value === 'route-pen') {
    return
  }
  createLocalDrawing(draft)
}

async function eraseLocalDrawing(drawingId: string) {
	if (!localDrawings.value.some((drawing) => drawing.id === drawingId)) return
	if (drawingId.startsWith('local-drawing-')) {
		pushUndoState('drawing')
		localDrawings.value = localDrawings.value.filter((drawing) => drawing.id !== drawingId)
		drawingRetryIds.value = drawingRetryIds.value.filter((id) => id !== drawingId)
		return
	}
	const leaseAcquired = await acquireMapObjectLease(drawingId)
	if (!leaseAcquired) return
	try {
		await itinerary.deleteDrawing(drawingId)
		localDrawings.value = localDrawings.value.filter((drawing) => drawing.id !== drawingId)
		drawingRetryIds.value = drawingRetryIds.value.filter((id) => id !== drawingId)
	} catch (cause) {
		console.error('Map drawing could not be deleted.', cause)
		itineraryActionError.value = '지도 그림을 삭제하지 못했습니다. 최신 상태를 다시 불러왔습니다.'
		await loadItinerary()
	} finally {
		releaseMapObjectLease(drawingId)
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
  const states: Array<'route' | 'hidden'> = ['route', 'hidden']
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
function openCustomScheduleForm() {
  isSearchPanelOpen.value = true
  showCustomForm.value = true
}

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
const isSettingsModalOpen = ref(false)
const settingsDefaultTab = ref<'tab-settings' | 'tab-members'>('tab-settings')
const daySyncNoticeVisible = ref(false)

function openTripManagement(tab: 'tab-settings' | 'tab-members' = 'tab-settings') {
  settingsDefaultTab.value = tab
  isSettingsModalOpen.value = true
}

interface TripDateSettings {
  startDate: string | null
  endDate: string | null
}

async function handleSettingsSaved(_tripId: string, settings?: TripDateSettings) {
  itineraryActionError.value = ''
  try {
    const didSyncDays = await syncScheduledDaysWithDateRange(true, settings)
    await refreshTripRoomAfterDateSync(true)
    if (didSyncDays) daySyncNoticeVisible.value = true
  } catch {
    itineraryActionError.value = '여행 기간과 여행방 설정을 동기화하지 못했습니다.'
    showToast('여행 기간과 여행방 설정을 동기화하지 못했습니다.', 'error')
  }
}

const sidebarTheme = computed(() => getDayColorClass(activeDay.value > 0 ? activeDay.value : 1))

function parseDateInput(value: string) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatDateForInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

async function syncScheduledDaysWithDateRange(forceExistingDayUpdate = false, settings?: TripDateSettings) {
  const detail = tripStore.currentTrip?.id === tripId ? tripStore.currentTrip : null
  const startStr = settings
    ? settings.startDate?.slice(0, 10)
    : detail?.startDate?.slice(0, 10)
  const endStr = settings
    ? (settings.endDate?.slice(0, 10) || startStr)
    : (detail?.endDate?.slice(0, 10) || startStr)
  if (!startStr || !endStr) return false
  const start = parseDateInput(startStr)
  const end = parseDateInput(endStr)
  if (!start && !end) return false
  if (!start || !end || end < start) {
    throw new Error('INVALID_DATE_RANGE')
  }

  let didMutateDays = false
  const targetCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
  const scheduledDays = dayPlans.value
    .filter((day) => day.groupType === 'DAY')
    .sort((left, right) => left.day - right.day)

  let unscheduledDay = itinerary.unscheduledDay.value
  const extraDays = scheduledDays.slice(targetCount)
  const shouldUpdateExistingDays = forceExistingDayUpdate || scheduledDays.length !== targetCount || extraDays.length > 0
  const extraItems = extraDays.flatMap((day) => day.items)
  if (extraItems.length > 0 && !unscheduledDay) {
    unscheduledDay = await itinerary.ensureUnscheduledDay()
    didMutateDays = true
  }

  if (unscheduledDay && extraItems.length > 0) {
    let sortOrder = unscheduledDay.items.length
    for (const item of extraItems) {
      await itinerary.updateItem(item.id, {
        itineraryDayId: unscheduledDay.id,
        sortOrder,
      })
      sortOrder += 1
      didMutateDays = true
    }
  }

  for (let index = 0; index < Math.min(targetCount, scheduledDays.length); index += 1) {
    const day = scheduledDays[index]
    const nextDate = formatDateForInput(addDays(start, index))
    const nextDayNumber = index + 1
    const nextSortOrder = index + 1
    if (shouldUpdateExistingDays || day.day !== nextDayNumber || day.date !== nextDate) {
      await itinerary.updateDay(day.id, {
        dayNumber: nextDayNumber,
        date: nextDate,
        sortOrder: nextSortOrder,
      })
      didMutateDays = true
    }
  }

  for (let index = scheduledDays.length; index < targetCount; index += 1) {
    await itinerary.createDay({
      groupType: 'DAY',
      dayNumber: index + 1,
      date: formatDateForInput(addDays(start, index)),
      sortOrder: index + 1,
    })
    didMutateDays = true
  }

  for (const day of extraDays.reverse()) {
    await itinerary.deleteDay(day.id)
    didMutateDays = true
  }

  if (!itinerary.unscheduledDay.value) {
    await itinerary.ensureUnscheduledDay()
    didMutateDays = true
  }
  if (didMutateDays) {
    await loadItinerary()
    await nextTick()
  }
  return didMutateDays
}

function resetInvalidTripRoomDayFilters() {
  const labels = dayTagLabels.value
  if (!labels.includes(activeMemoDay.value)) activeMemoDay.value = '전체'
  if (!labels.includes(activeTodoDay.value)) activeTodoDay.value = '전체'
}

async function refreshTripRoomAfterDateSync(reloadTripDetail = false) {
  resetInvalidTripRoomDayFilters()
  const refreshes: Promise<unknown>[] = [
    loadNote(activeMemoDay.value),
    loadChecklists(),
  ]
  if (reloadTripDetail) refreshes.unshift(loadTrip())
  await Promise.allSettled(refreshes)
}
/* ── Detailbar ── */
const isDetailbarOpen = ref(false)
interface DetailPlace {
  place: Place | null
  id: string
  title: string
  description: string
  image: string
  location: string
  category: string | null
  tags: string[]
  photos: string[]
  accessibility?: PlaceAccessibility | null
  contact?: string
  likes: number
  likedBy: Array<{ avatar: string; name: string }>
}

const selectedPlace = ref<DetailPlace | null>(null)
const selectedPlaceIsScheduled = computed(() => {
  const place = selectedPlace.value?.place
  return place ? scheduledPlaceKeys.value.includes(placeReferenceKey(place)) : false
})
const selectedScheduledItem = computed(() => {
  const place = selectedPlace.value?.place
  if (!place) return null
  const key = placeReferenceKey(place)
  return dayPlans.value.flatMap((day) => day.items).find((item) => (
    item.placeProvider && item.placeExternalId
      ? `${item.placeProvider}:${item.placeExternalId}` === key
      : false
  )) ?? null
})
const selectedPlaceIsSaved = computed(() => {
  const place = selectedPlace.value?.place
  return place ? savedPlaceKeys.value.has(placeReferenceKey(place)) : false
})
const selectedPlaceIsSaving = computed(() => {
  const place = selectedPlace.value?.place
  return place ? savingPlaceKeys.value.has(placeReferenceKey(place)) : false
})
const detailbarMainImg = ref('')
const descriptionExpanded = ref(false)
const DESCRIPTION_PREVIEW_LENGTH = 180
const displayedDescription = computed(() => {
  const text = selectedPlace.value?.description ?? ''
  if (!text) return ''
  return descriptionExpanded.value ? text : text.slice(0, DESCRIPTION_PREVIEW_LENGTH)
})
const canExpandDescription = computed(
  () => (selectedPlace.value?.description?.length ?? 0) > DESCRIPTION_PREVIEW_LENGTH,
)
const accessibilityItems: Array<{ flag: AccessibilityFlag; icon: string; label: string }> = [
  { flag: 'WHEELCHAIR', icon: 'accessible', label: '휠체어' },
  { flag: 'DISABLED_TOILET', icon: 'accessible_forward', label: '장애인 화장실' },
  { flag: 'STROLLER', icon: 'stroller', label: '유모차' },
  { flag: 'PET', icon: 'pets', label: '반려동물' },
  { flag: 'ELDERLY', icon: 'elderly', label: '노약자 편의' },
]

function parkingTypeLabel(type?: ParkingType) {
  return ({
    FREE: '무료',
    PAID: '유료',
    MIXED: '무료·유료',
    NONE: '주차 불가',
    UNKNOWN: '정보 없음',
  } satisfies Record<ParkingType, string>)[type ?? 'UNKNOWN']
}

function accessibilityState(accessibility: PlaceAccessibility | null | undefined, flag: AccessibilityFlag) {
  if (accessibility?.flags.includes(flag)) return { className: 'enabled', suffix: '가능' }
  if (accessibility?.unavailableFlags.includes(flag)) return { className: 'disabled', suffix: '불가' }
  return { className: 'unknown', suffix: '정보 없음' }
}

function placeGallery(place: Pick<Place, 'thumbnailUrl' | 'photos'>) {
  return [...new Set([place.thumbnailUrl, ...(place.photos ?? [])].map(displayImageUrl).filter(Boolean))]
}

// Make selectPlace available globally for map marker onclick
;(window as any).selectPlace = selectPlace

function handleSelectPlace(provider: any, placeId: any, stopId?: string) {
  selectPlace(placeId, provider || 'KTO', stopId)
}

function openStopDetail(item: RouteStop) {
  const image = routeStopImage(item)
  selectedPlace.value = {
    place: null,
    id: item.placeExternalId || item.id,
    title: item.title,
    description: item.memo || '직접 추가한 일정입니다. 장소 상세 정보가 연결되지 않았습니다.',
    image,
    category: '직접 추가한 일정',
    tags: [],
    accessibility: item.placeProvider && item.placeExternalId
      ? placeAccessibilityByKey.value[placeAccessibilityKey(item.placeProvider, item.placeExternalId)]
      : null,
    location: item.time === '시간 미정' ? '' : item.time,
    photos: image ? [image] : [],
    likes: 0,
    likedBy: [],
  }
  detailbarMainImg.value = image
  isDetailbarOpen.value = true
}

async function selectPlace(placeId: string | undefined, provider: PlaceProvider = 'KTO', stopId?: string) {
  // Route-pen mode: link stops instead of opening detailbar
  if (activeTool.value === 'route-pen') {
    if (stopId) {
      for (const day of dayPlans.value) {
        const item = day.items.find(i => i.id === stopId)
        if (item) { handleRoutePenClick(item); return }
      }
    }
    if (placeId) {
      for (const day of dayPlans.value) {
        const item = day.items.find(i => i.placeExternalId === placeId)
        if (item) { handleRoutePenClick(item); return }
      }
    }
    return
  }
  if (!placeId) {
    if (stopId) {
      for (const day of dayPlans.value) {
        const item = day.items.find(i => i.id === stopId)
        if (item) {
          openStopDetail(item)
          return
        }
      }
    }
    return
  }
  try {
    const place = await placeApi.getPlace(provider, placeId)
    let accessibility = place.accessibility
      ?? placeAccessibilityByKey.value[placeAccessibilityKey(provider, place.externalPlaceId)]

    if (!accessibility) {
      try {
        const batchRes = await placeApi.getAccessibilityBatch([{ provider, externalPlaceId: placeId }])
        const key = `${provider}:${placeId}`
        if (batchRes[key]) {
          accessibility = batchRes[key]
        }
      } catch (err) {
        console.error('Failed to load accessibility batch', err)
      }
    }
    const photos = placeGallery(place)
    routePlaceByKey.value = {
      ...routePlaceByKey.value,
      [placeAccessibilityKey(provider, place.externalPlaceId)]: place,
    }
    selectedPlace.value = {
      place: { ...place, accessibility },
      id: place.externalPlaceId,
      title: place.placeName,
      description: place.description || place.summary || '',
      image: photos[0] ?? '',
      likes: 0,
      location: place.address || '',
      category: place.category ?? null,
      tags: place.tags ?? [],
      photos,
      accessibility,
      contact: place.contact,
      likedBy: [],
    }
    detailbarMainImg.value = photos[0] ?? ''
  } catch (e) {
    if (stopId) {
      for (const day of dayPlans.value) {
        const item = day.items.find(i => i.id === stopId)
        if (item) {
          openStopDetail(item)
          return
        }
      }
    }
    showToast('장소 상세 정보를 불러오지 못했습니다.', 'error')
    return
  }

  isDetailbarOpen.value = true
}

async function selectDiscoveredPlace(place: Place, recommendation?: PlaceRecommendation) {
  let detailed: Place = place
  try {
    detailed = await placeApi.getPlace(place.provider, place.externalPlaceId)
  } catch (err) {
    console.error('Failed to load place detail, falling back to summary', err)
  }
  routePlaceByKey.value = {
    ...routePlaceByKey.value,
    [placeAccessibilityKey(detailed.provider, detailed.externalPlaceId)]: detailed,
  }

  const photos = placeGallery(detailed)
  const image = photos[0] ?? ''
  let accessibility = detailed.accessibility
    ?? placeAccessibilityByKey.value[placeAccessibilityKey(detailed.provider, detailed.externalPlaceId)]

  if (!accessibility) {
    try {
      const batchRes = await placeApi.getAccessibilityBatch([{ provider: detailed.provider, externalPlaceId: detailed.externalPlaceId }])
      const key = `${detailed.provider}:${detailed.externalPlaceId}`
      if (batchRes[key]) {
        accessibility = batchRes[key]
      }
    } catch (err) {
      console.error('Failed to load accessibility batch', err)
    }
  }

  selectedPlace.value = {
    place: { ...detailed, accessibility },
    id: detailed.externalPlaceId,
    title: detailed.placeName,
    description: detailed.description ?? detailed.summary ?? '',
    image,
    likes: recommendation?.matchedMembers.length ?? detailed.likedBy?.length ?? 0,
    location: detailed.address ?? '',
    category: detailed.category ?? null,
    tags: detailed.tags ?? [],
    photos,
    accessibility,
    contact: detailed.contact,
    likedBy: recommendation
      ? recommendation.matchedMembers.map((member) => ({
        avatar: member.profileImageUrl ?? member.displayName.slice(0, 1),
        name: member.displayName,
      }))
      : (detailed.likedBy ?? []).flatMap((reaction) => 'displayName' in reaction
      ? [{ avatar: reaction.profileImageUrl ?? reaction.displayName.slice(0, 1), name: reaction.displayName }]
      : []),
  }
  detailbarMainImg.value = image
  const previewLat = detailed.lat ?? place.lat
  const previewLng = detailed.lng ?? place.lng
  selectedRecommendationMapPlace.value = previewLat != null && previewLng != null
    ? {
        id: `recommendation:${detailed.provider}:${detailed.externalPlaceId}`,
        provider: detailed.provider,
        externalPlaceId: detailed.externalPlaceId,
        title: detailed.placeName,
        category: detailed.category ?? null,
        lat: previewLat,
        lng: previewLng,
        dayIndex: mapAccentDayIndex.value,
        image,
      }
    : null
  isDetailbarOpen.value = true
}

function closeDetailbar() {
  isDetailbarOpen.value = false
  selectedPlace.value = null
  selectedRecommendationMapPlace.value = null
  descriptionExpanded.value = false
}

async function addSelectedPlaceToItinerary() {
  const place = selectedPlace.value?.place
  if (!place) return
  await addPlaceToItinerary(place)
  selectedRecommendationMapPlace.value = null
}

async function removeSelectedPlaceFromItinerary() {
  const item = selectedScheduledItem.value
  if (!item || itinerary.mutating.value) return
  itineraryActionError.value = ''
  try {
    await itinerary.deleteItem(item.id)
    selectedRecommendationMapPlace.value = null
    showToast(`"${item.title}" 일정이 삭제되었습니다.`, 'success')
  } catch {
    itineraryActionError.value = '일정을 삭제하지 못했습니다. 다시 시도해 주세요.'
  }
}

async function toggleSelectedPlaceItinerary() {
  if (selectedPlaceIsScheduled.value) {
    await removeSelectedPlaceFromItinerary()
    return
  }
  await addSelectedPlaceToItinerary()
}

async function toggleSelectedPlaceSaved() {
  const place = selectedPlace.value?.place
  if (!place) return
  const key = placeReferenceKey(place)
  if (savingPlaceKeys.value.has(key)) return
  savingPlaceKeys.value = new Set(savingPlaceKeys.value).add(key)
  try {
    if (savedPlaceKeys.value.has(key)) {
      await swipeApi.unsavePlace(place.provider, place.externalPlaceId)
      const next = new Set(savedPlaceKeys.value)
      next.delete(key)
      savedPlaceKeys.value = next
      showToast('저장한 장소에서 제거했습니다.')
    } else {
      await swipeApi.react(place.provider, place.externalPlaceId, 'SUPER_LIKE')
      await swipeApi.savePlace(place.provider, place.externalPlaceId)
      savedPlaceKeys.value = new Set(savedPlaceKeys.value).add(key)
      showToast('장소를 저장했습니다.', 'success')
    }
  } catch {
    showToast('장소 저장 상태를 변경하지 못했습니다.', 'error')
  } finally {
    const next = new Set(savingPlaceKeys.value)
    next.delete(key)
    savingPlaceKeys.value = next
  }
}

/* ── Toast ── */
const toastMessage = ref('')
const toastVisible = ref(false)
const toastType = ref<'success' | 'error' | 'info'>('info')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 3000)
}

watch(itineraryActionError, (message) => {
  if (message) showToast(message, 'error')
})

watch(routeNearbyError, (message) => {
  if (message) showToast(message, 'error')
})

watch(() => mapViewport.error.value, (message) => {
  if (message) showToast(message, 'error')
})

watch(() => drawingRetryIds.value.length, (count, previousCount) => {
  if (count > 0 && previousCount === 0) showToast('그림 좌표를 정리하지 못했습니다.', 'error')
})

async function addPlaceToItinerary(place: Place) {
  if (!hasPlaceReference(place)) {
    itineraryActionError.value = '실제 장소 검색 결과만 일정에 추가할 수 있습니다.'
    return
  }
  if (scheduledPlaceKeys.value.includes(`${place.provider}:${place.externalPlaceId}`)) {
    showToast('이미 일정에 추가된 장소입니다.')
    return
  }
  itineraryActionError.value = ''
  try {
    const plan = await itinerary.ensureUnscheduledDay()
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
      <div :class="['map-shell', `route-layout--${routeLayoutMode}`, {
        'has-detailbar-open': isDetailbarOpen,
        'is-route-utility-collapsed': isRouteUtilityCollapsed,
        'is-sidebar-open': isLeftSidebarOpen,
        'is-sidebar-hidden': !isLeftSidebarOpen,
      }]">

          <!-- ═══ SIDEBAR ═══ -->
          <aside :class="['sidebar', { 'is-hidden': !isLeftSidebarOpen }]" aria-label="여행 일정">
            <button
              class="sidebar-toggle"
              type="button"
              aria-label="일정 패널 닫기"
              title="일정 패널 닫기"
              @click="toggleLeftSidebar"
            >
              <span class="material-symbols-rounded" aria-hidden="true">left_panel_close</span>
            </button>
            <div class="sidebar-content">
              <!-- Trip header card -->
              <div :class="['trip-header-card', sidebarTheme]" id="trip-header-card-container">
                <div class="trip-info-badge-row">
                  <p v-if="trip.destinationName" class="trip-card-dates" style="margin: 0;">
                    <span class="material-symbols-rounded" style="font-size:13px;vertical-align:middle;margin-right:2px;">location_on</span>
                    <span style="vertical-align:middle;font-weight:600;">{{ trip.destinationName }}</span>
                  </p>
                  <span class="trip-status-badge">{{ trip.statusLabel }}</span>
                </div>
                <h3 class="trip-card-title">{{ trip.title }}</h3>
                <div class="trip-card-period-row">
                  <span class="material-symbols-rounded icon-calendar">calendar_today</span>
                  <span class="period-text">{{ trip.dateRangeText }} ({{ trip.durationText }})</span>
                </div>
                <div class="trip-card-divider"></div>
                <div class="trip-stats-grid">
                  <div class="trip-stat-item">
                    <span class="stat-label">여행 기간</span>
                    <span class="stat-value">{{ trip.durationText }}</span>
                  </div>
                  <div class="trip-stat-item">
                    <span class="stat-label">총 방문지</span>
                    <span class="stat-value">{{ dayPlans.reduce((count, day) => count + day.items.length, 0) }}곳 코스</span>
                  </div>
                </div>
                <div class="trip-card-footer">
                  <div class="avatars-group">
                    <div class="avatars">
                      <span
                        v-for="m in trip.members.slice(0, 5)"
                        :key="m.userId"
                        :class="['avatar', 'avatar-with-tooltip', { 'is-online': m.online }]"
                        :style="!m.profileImageUrl ? { backgroundColor: 'var(--violet)' } : {}"
                      >
                        <img v-if="m.profileImageUrl" :src="m.profileImageUrl" :alt="m.displayName || '멤버'" class="avatar-img" />
                        <template v-else>{{ (m.displayName ?? '?').charAt(0) }}</template>
                        <span v-if="m.online" class="avatar-presence-badge" aria-label="접속 중"></span>
                        <div class="avatar-tooltip">
                          <span>{{ m.displayName }} ({{ m.role === 'OWNER' ? '방장' : '멤버' }})</span>
                          <span class="avatar-tooltip-status">{{ m.online ? '접속 중' : '오프라인' }}</span>
                        </div>
                      </span>
                    </div>
                    <span class="members-count">{{ trip.members.length }}명</span>
                  </div>
                  <TripSettingsButton label="관리" variant="ghost" @click="() => openTripManagement()" />
                </div>
              </div>

              <!-- Day tabs -->
              <div class="day-tabs-container">
                <button class="day-scroll-btn prev" type="button" aria-label="이전 일차" @click="scrollDayTabs('prev')">
                  <span class="material-symbols-rounded">chevron_left</span>
                </button>
                <div class="day-tabs" id="day-tabs-scrollable" ref="dayTabsRef"
                  @mousedown="onTabsMouseDown"
                  @mousemove="onTabsMouseMove"
                  @mouseup="onTabsMouseUp"
                  @mouseleave="onTabsMouseLeave">
                  <button :class="['day-tab', { active: activeDay === 0 }]" type="button" @click="activeDay = 0">
                    <span class="day-title">전체</span>
                  </button>
                  <button v-for="day in dayPlans" :key="day.id"
                    :class="['day-tab', { active: activeDay === day.day }]"
                    type="button" @click="activeDay = day.day">
                    <span class="day-title">{{ day.groupType === 'UNSCHEDULED' ? '일차 미정' : `${day.day}일차` }}</span>
                  </button>
                </div>
                <button class="day-scroll-btn next" type="button" aria-label="다음 일차" @click="scrollDayTabs('next')">
                  <span class="material-symbols-rounded">chevron_right</span>
                </button>
                <button
                  v-if="daySyncNoticeVisible"
                  class="day-sync-notice"
                  type="button"
                  aria-label="일정 변경 안내 닫기"
                  title="클릭해서 닫기"
                  @click="daySyncNoticeVisible = false"
                >
                  여행 기간에 맞춰 일차가 업데이트됐어요
                </button>
              </div>


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
					<div :class="['day-separator', getDayColorClass(day.day)]" :data-day="day.day" :data-day-id="day.id"
						@pointerdown="onPointerDown">
                      <span class="day-pill">{{ dayPlanLabel(day) }}</span>
                      <span class="line"></span>
                      <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                    </div>
                    <template v-for="(item, idx) in day.items" :key="item.id">
                      <div :class="['stop', getDayColorClass(day.day), routeGroupClass(item.id, day.items[idx - 1]?.id, day.items[idx + 1]?.id), { 'route-pen-pending': pendingRouteFrom === item.id, 'route-linked': !!getLinkedPartner(item.id), 'has-thumb': !!routeStopImage(item) }]"
						:data-step-id="item.id" :data-place-id="item.placeExternalId"
						@pointerdown="onPointerDown"
                        @click.stop="handleStopClick(item)">
                        <span class="stop-num">{{ idx + 1 }}</span>
                        <img
                          v-if="routeStopImage(item)"
                          class="stop-thumb"
                          :src="routeStopImage(item)"
                          :alt="item.title"
                          loading="lazy"
                        />
                        <div class="stop-content">
                          <strong>{{ item.title }}</strong>
                          <span class="small muted">{{ item.time }}</span>
                        </div>
                        <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                      </div>
                      <!-- Route connector between linked adjacent stops -->
                      <div v-if="idx < day.items.length - 1 && hasRouteLinkBetween(item.id, day.items[idx + 1].id)"
                        :class="['route-connector', getDayColorClass(day.day)]"
                        :data-from-id="item.id"
                        :data-to-id="day.items[idx + 1].id"
                        @click.stop="removeRouteLinkBetween(item.id, day.items[idx + 1].id)"
                        :title="'경로 연결 해제: ' + item.title + ' → ' + day.items[idx + 1].title">
                        <span class="material-symbols-rounded route-unlink-icon">link_off</span>
                        <div class="route-connector-line"></div>
                      </div>
                    </template>
                  </template>
                </template>
                <!-- 특정 일차 -->
                <template v-else-if="activePlan">
				<div :class="['day-separator', getDayColorClass(activeDay)]" :data-day="activeDay" :data-day-id="activePlan.id"
					@pointerdown="onPointerDown">
                    <span class="day-pill">{{ dayPlanLabel(activePlan) }}</span>
                    <span class="line"></span>
                  </div>
                  <template v-for="(item, idx) in activePlan.items" :key="item.id">
                    <div :class="['stop', getDayColorClass(activeDay), routeGroupClass(item.id, activePlan.items[idx - 1]?.id, activePlan.items[idx + 1]?.id), { 'route-pen-pending': pendingRouteFrom === item.id, 'route-linked': !!getLinkedPartner(item.id), 'has-thumb': !!routeStopImage(item) }]"
					:data-step-id="item.id" :data-place-id="item.placeExternalId"
					@pointerdown="onPointerDown"
                      @click.stop="handleStopClick(item)">
                      <span class="stop-num">{{ idx + 1 }}</span>
                      <img
                        v-if="routeStopImage(item)"
                        class="stop-thumb"
                        :src="routeStopImage(item)"
                        :alt="item.title"
                        loading="lazy"
                      />
                      <div class="stop-content">
                        <strong>{{ item.title }}</strong>
                        <span class="small muted">{{ item.time }}</span>
                      </div>
                      <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                    </div>
                    <!-- Route connector between linked adjacent stops -->
                    <div v-if="idx < activePlan.items.length - 1 && hasRouteLinkBetween(item.id, activePlan.items[idx + 1].id)"
                      :class="['route-connector', getDayColorClass(activeDay)]"
                      :data-from-id="item.id"
                      :data-to-id="activePlan.items[idx + 1].id"
                      @click.stop="removeRouteLinkBetween(item.id, activePlan.items[idx + 1].id)"
                      :title="'경로 연결 해제'">
                      <span class="material-symbols-rounded route-unlink-icon">link_off</span>
                      <div class="route-connector-line"></div>
                    </div>
                  </template>
                </template>
              </div>

              <!-- Add stop: 원본처럼 버튼 클릭 시 바로 검색 패널 열기 -->
              <div class="add-stop-container">
                <div class="trash-drop-zone" id="trash-drop-zone">
                  <span class="material-symbols-rounded">delete</span>
                  <span>여기로 끌어서 삭제</span>
                </div>

                <button class="add-stop-dashed" type="button" :disabled="dayPlans.length === 0 || itinerary.mutating.value" @click="openSearchPanel">
                  <span class="material-symbols-rounded">add_circle</span>
                  <span>일정 추가</span>
                </button>
                <div class="add-stop-popover" id="add-stop-popover">
                  <button class="popover-item" type="button" @click="openSearchPanel">
                    <span class="material-symbols-rounded">search</span>
                    <div class="popover-item-text"><strong>장소 검색 추가</strong><span>관광지, 맛집, 숙소 찾기</span></div>
                  </button>
                  <button class="popover-item" type="button" @click="openCustomScheduleForm">
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
                  :bbox="placeDiscoveryBbox"
                  :scheduled-place-keys="scheduledPlaceKeys"
                  @select="selectDiscoveredPlace"
                />
              </div>
            </div>

          </aside>

          <button
            v-if="isRouteOverlayLayout && (isLeftSidebarOpen || !isRouteUtilityCollapsed)"
            class="route-panel-backdrop"
            type="button"
            aria-label="열린 패널 닫기"
            @click="closeResponsivePanels"
          ></button>

          <!-- ═══ MAP CANVAS ═══ -->
          <div ref="mapCanvasRef" :class="['map-canvas', { 'navigation-guide-mode': navigationGuideMode }]" :aria-label="`${trip.title} 지도`">
			<button
				v-if="!isLeftSidebarOpen"
				class="route-sidebar-restore"
				type="button"
				aria-label="일정 패널 열기"
				@click="toggleLeftSidebar"
			>
				<span class="material-symbols-rounded" aria-hidden="true">view_sidebar</span>
				<span>일정</span>
			</button>
			<MapboxItineraryMap
				:stops="mapStops"
				:routes="visibleMapRoutes"
				:route-display="routeState"
              :card-display="cardState"
              :nearby-places="routeNearbyMapPlaces"
              :preview-place="selectedRecommendationMapPlace"
              :drawings="mapDrawings"
              :drawing-tool="activeTool"
              :drawing-color="penColor"
              :drawing-width="penSize"
              :route-waypoints="routeWaypoints"
              :map-objects="mapObjects"
              :map-object-image-urls="mapObjectImageUrls"
              :map-object-locks="mapObjectLocks"
              :map-object-preview-transforms="mapObjectPreviewTransforms"
              :map-cursors="visibleMapCursors"
              :current-client-id="getCollaborationSessionId()"
              :selected-map-object-id="selectedMapObjectId"
              :map-object-placement="mapObjectPlacement"
              :map-object-epoch="mapObjectEpoch"
              :drawings-visible="drawingOn"
              :navigation-mode="navigationGuideMode"
              :standard-view="standardMapView"
              @select-place="handleSelectPlace"
              @select-nearby-place="(provider, placeId) => selectPlace(placeId, provider as PlaceProvider)"
              @viewport-change="mapViewport.updateViewport"
              @drawing-create="handleDrawingCreate"
              @drawing-erase="eraseLocalDrawing"
              @drawing-preview="publishDrawingPreview"
              @route-point="addRouteWaypoint"
              @map-object-place="handleMapObjectPlace"
              @map-object-select="selectedMapObjectId = $event"
              @map-object-edit-start="beginMapObjectEdit"
              @map-object-edit-end="cancelMapObjectEdit"
              @map-object-preview="previewMapObjectChange"
              @map-object-change="changeMapObject"
              @cursor-move="publishMapCursor"
            />

            <input
              ref="mapImageInput"
              class="map-object-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              @change="handleMapImageSelected"
            >

            <div
              v-if="activeTool === 'sticker'"
              id="sticker-popover"
              ref="stickerPopoverRef"
              class="map-sticker-palette"
              role="dialog"
              aria-label="지도 스티커 선택"
              :style="stickerPopoverStyle"
            >
              <button
                v-for="sticker in MAP_STICKERS"
                :key="sticker.code"
                type="button"
                :class="['map-sticker-option', { active: selectedStickerCode === sticker.code }]"
                :aria-label="sticker.label"
                :aria-pressed="selectedStickerCode === sticker.code"
                @click="selectedStickerCode = sticker.code"
              >
                <svg viewBox="0 0 64 64" aria-hidden="true"><use :href="stickerHref(sticker.code) ?? undefined" /></svg>
              </button>
              <span class="map-sticker-help">지도에서 놓을 위치를 선택하세요</span>
            </div>

            <div v-if="selectedMapObjectId && activeTool === 'cursor'" class="map-object-actions">
              <span>모서리로 크기 조절 · 위 핸들로 회전</span>
              <button type="button" :disabled="itinerary.mutating.value" @click="deleteSelectedMapObject">
                <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                삭제
              </button>
            </div>

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
            <div ref="penPopoverRef" :class="['tool-popover', { 'is-open': isPenPopoverOpen }]" id="pen-popover" role="dialog" aria-label="자유 그리기 설정" :style="penPopoverStyle" :aria-hidden="!isPenPopoverOpen">
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
            <div class="map-tools" @scroll.passive="updateToolPopoverPositions">
              <!-- Drawing tools -->
              <button :class="['tool-btn', { active: activeTool === 'cursor' }]" type="button" data-tool="cursor" :aria-pressed="activeTool === 'cursor'" :disabled="itinerary.mutating.value" @click="selectMapTool('cursor')">
                <span class="material-symbols-rounded">arrow_selector_tool</span>
                <span class="tool-tip">기본 선택</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'route-pen' }]" type="button" data-tool="route-pen" :aria-pressed="activeTool === 'route-pen'" :disabled="itinerary.mutating.value" @click="selectMapTool('route-pen')">
                <span class="material-symbols-rounded">polyline</span>
                <span class="tool-tip">경로 연결 펜</span>
              </button>
              <button ref="penToolButtonRef" :class="['tool-btn', { active: activeTool === 'pen' }]" type="button" id="pen-btn" data-tool="pen" aria-controls="pen-popover" :aria-expanded="isPenPopoverOpen" :aria-pressed="activeTool === 'pen'" :disabled="itinerary.mutating.value" @click="selectMapTool('pen')">
                <span class="material-symbols-rounded">edit</span>
                <span class="tool-tip">자유 그리기</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'eraser' }]" type="button" data-tool="eraser" :aria-pressed="activeTool === 'eraser'" :disabled="itinerary.mutating.value" @click="selectMapTool('eraser')">
                <span class="material-symbols-rounded">ink_eraser</span>
                <span class="tool-tip">그림 지우개</span>
              </button>
              <button ref="stickerToolButtonRef" :class="['tool-btn', { active: activeTool === 'sticker' }]" type="button" data-tool="sticker" aria-controls="sticker-popover" :aria-expanded="activeTool === 'sticker'" :aria-pressed="activeTool === 'sticker'" :disabled="itinerary.mutating.value" @click="selectMapTool('sticker')">
                <span class="material-symbols-rounded">emoji_emotions</span>
                <span class="tool-tip">스티커 삽입</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'image' }]" type="button" data-tool="image" :aria-pressed="activeTool === 'image'" :disabled="itinerary.mutating.value || mapImageUploading" @click="openMapImagePicker">
                <span class="material-symbols-rounded">add_photo_alternate</span>
                <span class="tool-tip">이미지 삽입</span>
              </button>

              <span class="tool-divider" aria-hidden="true"></span>

              <!-- View toggles -->
              <button class="tool-btn" :class="routeState !== 'hidden' ? 'is-on' : 'is-off'" type="button"
                id="route-state-toggle" :disabled="itinerary.mutating.value"
                :data-route-state="routeState"
                :aria-pressed="routeState !== 'hidden'"
                @click="toggleRouteState">
                <span class="material-symbols-rounded icon-route">polyline</span>
                <span class="material-symbols-rounded icon-hidden">visibility_off</span>
                <span class="tool-tip">{{ routeState === 'route' ? '경로 표시: 실선' : '경로 표시: 숨김' }}</span>
              </button>
              <button class="tool-btn" :class="cardState !== 'hidden' ? 'is-on' : 'is-off'" type="button"
                id="card-state-toggle" :disabled="itinerary.mutating.value"
                :data-card-state="cardState"
                :aria-pressed="cardState !== 'hidden'"
                @click="toggleCardState">
                <span class="material-symbols-rounded icon-full">view_sidebar</span>
                <span class="material-symbols-rounded icon-min">push_pin</span>
                <span class="material-symbols-rounded icon-hidden-card">block</span>
                <span class="tool-tip">{{ cardState === 'full' ? '여행지 카드: 전체 보기' : cardState === 'min' ? '여행지 카드: 최소화 (핀)' : '여행지 카드: 숨김' }}</span>
              </button>
              <button :class="['tool-btn', nearbyOn ? 'is-on' : 'is-off']" type="button"
                data-toggle="nearby" :disabled="itinerary.mutating.value"
                :aria-pressed="nearbyOn"
                @click="nearbyOn = !nearbyOn">
                <span class="material-symbols-rounded">explore</span>
                <span class="tool-tip">주변 여행지 표시</span>
              </button>
              <button :class="['tool-btn', drawingOn ? 'is-on' : 'is-off']" type="button"
                data-toggle="drawing" :disabled="itinerary.mutating.value"
                :aria-pressed="drawingOn"
                @click="drawingOn = !drawingOn">
                <span class="material-symbols-rounded">brush</span>
                <span class="tool-tip">지도 그림 표시</span>
              </button>
              <button :class="['tool-btn', standardMapView ? 'is-on' : 'is-off']" type="button"
                data-toggle="standard-view" :disabled="itinerary.mutating.value"
                :aria-pressed="standardMapView"
                @click="toggleStandardMapView">
                <span class="material-symbols-rounded">3d_rotation</span>
                <span class="tool-tip">3D 보기</span>
              </button>

              <span class="tool-divider" aria-hidden="true"></span>

              <!-- Undo / Redo -->
              <button :class="['tool-btn', canUndo ? 'is-on' : 'is-off']" type="button"
                data-action="undo"
                :disabled="!canUndo || itinerary.mutating.value || historyActionPending"
                @click="undo">
                <span class="material-symbols-rounded">undo</span>
                <span class="tool-tip">실행 취소 (Ctrl+Z)</span>
              </button>
              <button :class="['tool-btn', canRedo ? 'is-on' : 'is-off']" type="button"
                data-action="redo"
                :disabled="!canRedo || itinerary.mutating.value || historyActionPending"
                @click="redo">
                <span class="material-symbols-rounded">redo</span>
                <span class="tool-tip">다시 실행 (Ctrl+Y)</span>
              </button>
            </div>
          </div>

          <!-- detailbar -->
          <aside :class="['detailbar', { 'is-hidden': !isDetailbarOpen }]" ref="detailbarRef">
            <button class="detailbar-close" type="button" aria-label="닫기" @click="closeDetailbar"><span class="material-symbols-rounded">close</span></button>
            <div class="detailbar-scroll" v-if="selectedPlace">
              <!-- Header -->
              <div class="detailbar-header-info" style="padding-bottom: 0px; padding-top: 0px;">
                <div class="detailbar-category-row">
                  <span class="detailbar-category-pill">{{ selectedPlace.category || '상세 정보' }}</span>
                </div>
                <h2 class="detailbar-main-title">{{ selectedPlace.title }}</h2>
                <div v-if="selectedPlace.location" class="detailbar-address-row">
                  <span class="material-symbols-rounded">location_on</span>
                  <span>{{ selectedPlace.location }}</span>
                </div>
              </div>

              <!-- Description -->
              <div class="detailbar-desc-section">
                <p class="detailbar-desc-text" :class="{ 'is-expanded': descriptionExpanded }">
                  <template v-if="selectedPlace.description">{{ displayedDescription }}{{ canExpandDescription && !descriptionExpanded ? '…' : '' }}</template>
                  <template v-else>상세 설명이 제공되지 않았습니다.</template>
                </p>
                <button
                  v-if="canExpandDescription"
                  type="button"
                  class="detailbar-desc-toggle"
                  :aria-expanded="descriptionExpanded"
                  @click="descriptionExpanded = !descriptionExpanded"
                >
                  {{ descriptionExpanded ? '접기' : '더보기' }}
                  <span class="material-symbols-rounded">{{ descriptionExpanded ? 'expand_less' : 'expand_more' }}</span>
                </button>
                <div v-if="selectedPlace.tags.length" class="detailbar-tag-row">
                  <span v-for="tag in selectedPlace.tags" :key="tag" class="detailbar-tag">#{{ tag }}</span>
                </div>
              </div>

              <!-- Gallery -->
              <div class="detailbar-gallery" v-if="selectedPlace.image" style="margin-bottom: 0px;">
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

              <div v-if="selectedPlace.place" class="detailbar-action-row">
                <button
                  type="button"
                  class="detailbar-save-place-btn"
                  :class="{ 'is-saved': selectedPlaceIsSaved }"
                  :disabled="selectedPlaceIsSaving"
                  :aria-label="selectedPlaceIsSaved ? '슈퍼라이크에서 제거' : '슈퍼라이크에 추가'"
                  @click="toggleSelectedPlaceSaved"
                >
                  <span class="material-symbols-rounded">{{ selectedPlaceIsSaved ? 'stars' : 'star_border' }}</span>
                  {{ selectedPlaceIsSaved ? '슈퍼라이크됨' : '슈퍼라이크에 추가' }}
                </button>
                <button
                  type="button"
                  class="detailbar-add-plan-btn"
                  :class="{ 'is-scheduled': selectedPlaceIsScheduled }"
                  :disabled="itinerary.mutating.value"
                  :aria-label="selectedPlaceIsScheduled ? '일정에서 삭제' : '일정에 추가'"
                  @click="toggleSelectedPlaceItinerary"
                >
                  <span class="material-symbols-rounded">{{ selectedPlaceIsScheduled ? 'task_alt' : 'add_circle' }}</span>
                  {{ selectedPlaceIsScheduled ? '일정에 있음' : '일정에 추가' }}
                </button>
              </div>

              <!-- Social Likes -->
              <div class="detailbar-social-likes" v-if="selectedPlace.likedBy?.length">
                <div class="detailbar-avatar-stack">
                  <template v-for="(u, idx) in selectedPlace.likedBy.slice(0, 5)" :key="idx">
                    <img v-if="u.avatar && u.avatar.startsWith('http')" :src="u.avatar" class="detailbar-like-avatar" :style="{ zIndex: avatarStackZIndex(idx) }" :alt="u.name || ''">
                    <span v-else-if="u.avatar" class="detailbar-like-avatar-text"
                      :style="textAvatarStyle(idx)">{{ u.avatar }}</span>
                  </template>
                </div>
                <span class="detailbar-likes-text">
                  <template v-if="selectedPlace.likedBy.length > 1"><strong>{{ selectedPlace.likedBy.length }}명</strong>이 저장한 장소</template>
                  <template v-else><strong>{{ selectedPlace.likedBy[0].name || '멤버' }}</strong>님이 저장한 장소</template>
                </span>
              </div>

              <!-- Quick Info -->
              <div class="detailbar-info-card">
                <h4 class="section-title">이용 안내</h4>
                <div class="detailbar-info-grid">
                  <div class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">schedule</span></span>
                    <div class="info-content">
                      <span class="label">이용시간</span>
                      <strong class="value">{{ selectedPlace.accessibility?.openingHours || '-' }}</strong>
                    </div>
                  </div>
                  <div class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">event_busy</span></span>
                    <div class="info-content">
                      <span class="label">쉬는날</span>
                      <strong class="value">{{ selectedPlace.accessibility?.closedDays || '-' }}</strong>
                    </div>
                  </div>
                  <div class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">local_parking</span></span>
                    <div class="info-content">
                      <span class="label">주차시설</span>
                      <strong class="value">{{ selectedPlace.accessibility ? parkingTypeLabel(selectedPlace.accessibility.parkingType) : '-' }}</strong>
                    </div>
                  </div>
                </div>
                <div class="detailbar-acc-row">
                  <div
                    v-for="item in accessibilityItems"
                    :key="item.flag"
                    :class="['acc-pill', accessibilityState(selectedPlace.accessibility, item.flag).className]"
                  >
                    <span class="material-symbols-rounded">{{ item.icon }}</span>
                    <span>{{ item.label }} {{ accessibilityState(selectedPlace.accessibility, item.flag).suffix }}</span>
                  </div>
                </div>
              </div>

              <!-- Secondary Info -->
              <div class="detailbar-sec-info" v-if="selectedPlace.contact">
                <div class="detailbar-sec-row" v-if="selectedPlace.contact">
                  <span class="label">
                    <span class="material-symbols-rounded" style="font-size: 16px; margin-right: 4px; vertical-align: middle;">phone</span>
                    전화번호
                  </span>
                  <span class="value">{{ selectedPlace.contact }}</span>
                </div>
              </div>
            </div>
          </aside>

          <!-- ═══ ROUTE UTILITY SIDEBAR ═══ -->
          <aside :class="['route-utility-sidebar', `route-utility-sidebar--${activeRoutePanel}`, { 'is-collapsed': isRouteUtilityCollapsed }]" aria-label="여행 협업 도구">
            <div class="route-utility-header">
              <div class="route-utility-heading">
                <span class="material-symbols-rounded" aria-hidden="true">{{ routeUtilityPanelMeta.icon }}</span>
                <div>
                  <h3>{{ routeUtilityPanelMeta.title }}</h3>
                  <p class="route-utility-status">{{ routeUtilityPanelMeta.status }}</p>
                </div>
              </div>
              <button
                class="route-utility-collapse"
                type="button"
                :aria-label="isRouteUtilityCollapsed ? '우측 사이드바 펼치기' : '우측 사이드바 접기'"
                :title="isRouteUtilityCollapsed ? '펼치기' : '접기'"
                @click="toggleRouteUtilityCollapsed"
              >
                <span class="material-symbols-rounded" aria-hidden="true">{{ isRouteUtilityCollapsed ? 'left_panel_open' : 'right_panel_close' }}</span>
              </button>
            </div>
            <div class="route-utility-tabs" role="tablist" aria-label="여행 도구">
              <button
                class="route-utility-tab route-utility-tab--ai"
                :class="{ active: activeRoutePanel === 'ai' }"
                type="button"
                role="tab"
                :aria-selected="activeRoutePanel === 'ai'"
                aria-controls="ai-chat-panel"
                @click="togglePanel('ai')"
              >
                <span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span>
                <span>AI</span>
              </button>
              <button
                class="route-utility-tab route-utility-tab--chat"
                :class="{ active: activeRoutePanel === 'chat' }"
                type="button"
                role="tab"
                :aria-selected="activeRoutePanel === 'chat'"
                aria-controls="trip-chat-panel"
                @click="togglePanel('chat')"
              >
                <span class="material-symbols-rounded" aria-hidden="true">forum</span>
                <span>채팅</span>
              </button>
              <button
                class="route-utility-tab route-utility-tab--memo"
                :class="{ active: activeRoutePanel === 'memo' }"
                id="memo-fab"
                type="button"
                role="tab"
                :aria-selected="activeRoutePanel === 'memo'"
                aria-controls="memo-panel"
                @click="togglePanel('memo')"
              >
                <span class="material-symbols-rounded" aria-hidden="true">sticky_note_2</span>
                <span>메모</span>
              </button>
              <button
                class="route-utility-tab route-utility-tab--todo"
                :class="{ active: activeRoutePanel === 'todo' }"
                id="todo-fab"
                type="button"
                role="tab"
                :aria-selected="activeRoutePanel === 'todo'"
                aria-controls="todo-panel"
                @click="togglePanel('todo')"
              >
                <span class="material-symbols-rounded" aria-hidden="true">playlist_add_check</span>
                <span>할 일</span>
              </button>
            </div>

          <!-- ═══ AI CHAT PANEL ═══ -->
          <div id="ai-chat-panel" :class="['ai-chat-panel', { show: isAiChatOpen }]">
            <div class="ai-chat-messages-container" id="ai-chat-messages">
              <div v-if="conversationError" class="text-sm" style="color:var(--rose);display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span>{{ conversationError }}</span>
                <button type="button" class="btn ghost" style="font-size:11px;padding:4px 8px;min-height:0;height:auto" @click="loadConversations">다시 시도</button>
              </div>
              <div v-for="msg in aiMessages" :key="msg.id" :class="['ai-message', msg.role === 'ASSISTANT' || msg.role === 'TOOL' ? 'assistant' : 'user']">
                <div v-if="msg.role === 'ASSISTANT' || msg.role === 'TOOL'" class="ai-message-avatar">&#10024;</div>
                <div class="ai-message-bubble" style="white-space:pre-wrap">{{ msg.content }}</div>
              </div>
              <p v-if="!conversationLoading && aiMessages.length === 0" class="text-sm text-muted">AI에게 첫 질문을 보내보세요.</p>
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
              <div class="route-send-box">
                <input type="text" id="ai-chat-input" aria-label="AI 가이드에게 질문하기" placeholder="AI에게 일정에 관해 물어보세요." v-model="aiMessage" @keydown.enter="sendAiMessage" />
                <button id="ai-chat-send-btn" class="btn primary compact-send-btn" type="button" @click="sendAiMessage">
                  <span class="material-symbols-rounded">send</span>
                </button>
              </div>
            </div>
          </div>

          <!-- ═══ TRIP CHAT PANEL ═══ -->
          <div id="trip-chat-panel" :class="['ai-chat-panel', 'trip-chat-panel', { show: isTripChatOpen }]">
            <div class="ai-chat-messages-container" id="trip-chat-messages">
              <div v-if="conversationError" class="text-sm" style="color:var(--rose);display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span>{{ conversationError }}</span>
                <button type="button" class="btn ghost" style="font-size:11px;padding:4px 8px;min-height:0;height:auto" @click="loadConversations">다시 시도</button>
              </div>
              <div v-for="msg in chatMessages" :key="msg.id" :class="['ai-message', msg.sender.id === currentUserId ? 'user' : 'assistant']">
                <div class="ai-message-avatar trip-chat-avatar">
                  <img v-if="msg.sender.profileImageUrl" :src="msg.sender.profileImageUrl" :alt="msg.sender.displayName" />
                  <template v-else>{{ msg.sender.displayName.charAt(0) }}</template>
                </div>
                <div class="ai-message-bubble">
                  <strong v-if="msg.sender.id !== currentUserId" style="display:block;font-size:11px;margin-bottom:3px">{{ msg.sender.displayName }}</strong>
                  <span style="white-space:pre-wrap">{{ msg.deletedAt ? '삭제된 메시지입니다.' : msg.content }}</span>
                </div>
              </div>
              <p v-if="!conversationLoading && chatMessages.length === 0" class="text-sm text-muted">여행 멤버에게 첫 메시지를 보내보세요.</p>
            </div>

            <div class="ai-chat-input-row">
              <div class="route-send-box">
                <input type="text" id="trip-chat-input" aria-label="여행방 메시지 입력" placeholder="여행 멤버에게 메시지를 보내세요." v-model="aiMessage" @keydown.enter="sendAiMessage" />
                <button id="trip-chat-send-btn" class="btn primary compact-send-btn" type="button" @click="sendAiMessage">
                  <span class="material-symbols-rounded">send</span>
                </button>
              </div>
            </div>
          </div>

          <!-- ═══ MEMO PANEL ═══ -->
          <div id="memo-panel" :class="['floating-panel', 'memo-panel', { show: isMemoOpen }]">
            <!-- 일차별 태그(탭) 필터 -->
            <div class="panel-tabs" id="memo-day-tags">
              <button v-for="tag in dayTagLabels" :key="tag" type="button"
                :class="['panel-tab-tag', { 'active-memo': activeMemoDay === tag }]"
                @click="switchMemoDay(tag)">{{ tag }}</button>
            </div>
            <!-- 미니 포맷 툴바 -->
            <div class="memo-toolbar">
              <button type="button" class="toolbar-btn" title="굵게" aria-label="굵게" @click="formatMemo('bold')"><span class="material-symbols-rounded">format_bold</span></button>
              <button type="button" class="toolbar-btn" title="기울임" aria-label="기울임" @click="formatMemo('italic')"><span class="material-symbols-rounded">format_italic</span></button>
              <button type="button" class="toolbar-btn" title="밑줄" aria-label="밑줄" @click="formatMemo('underline')"><span class="material-symbols-rounded">format_underlined</span></button>
              <button type="button" class="toolbar-btn" title="취소선" aria-label="취소선" @click="formatMemo('strike')"><span class="material-symbols-rounded">format_strikethrough</span></button>
              <div class="toolbar-divider"></div>
              <button type="button" class="toolbar-btn" title="글머리 기호" aria-label="글머리 기호" @click="formatMemo('bullet')"><span class="material-symbols-rounded">format_list_bulleted</span></button>
              <button type="button" class="toolbar-btn" title="번호 매기기" aria-label="번호 매기기" @click="formatMemo('number')"><span class="material-symbols-rounded">format_list_numbered</span></button>
            </div>
            <div class="panel-body memo-body">
              <textarea id="memo-textarea" ref="memoTextarea" placeholder="여행 계획, 팁, 예약 정보 등을 자유롭게 메모해보세요." v-model="memoTextDisplay"></textarea>
            </div>
            <div class="panel-footer memo-footer">
              <div class="memo-footer-left">
                <span class="memo-char-count" id="memo-char-count">{{ memoTextDisplay.length }}자</span>
              </div>
              <div class="memo-footer-actions">
                <button id="memo-clear-btn" class="btn text-danger-btn memo-action-btn" type="button" @click="clearNote">
                  <span class="material-symbols-rounded">delete</span>
                  초기화
                </button>
                <button id="memo-copy-btn" class="btn primary small memo-action-btn" type="button" :disabled="memoLoading || !memoTextDisplay.trim()" @click="saveNote">
                  <span class="material-symbols-rounded">save</span>
                  저장하기
                </button>
              </div>
            </div>
          </div>

          <!-- ═══ TODO PANEL ═══ -->
          <div id="todo-panel" :class="['floating-panel', 'todo-panel', { show: isTodoOpen }]">
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
              <div class="todo-input-row route-send-box">
                <input type="text" id="todo-input" aria-label="할 일 추가" placeholder="할 일을 입력하세요." v-model="newTodo" @keydown.enter="addTodo" />
                <button id="todo-add-btn" class="btn primary compact-send-btn" type="button" @click="addTodo">
                  <span class="material-symbols-rounded">add</span>
                </button>
              </div>
            </div>
          </div>
          </aside>
        </div>
      </section>
    <!-- ═══ TRIP SETTINGS MODAL ═══ -->
    <TripSettingsModal
      :open="isSettingsModalOpen"
      :trip="routeSettingsTrip"
      :default-tab="settingsDefaultTab"
      @close="isSettingsModalOpen = false"
      @saved="handleSettingsSaved"
      @deleted="$router.push('/my-trips')"
    />

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toastVisible" :class="['toast-notification', `toast-notification--${toastType}`]" role="status" aria-live="polite">
        <span class="material-symbols-rounded" aria-hidden="true">
          {{ toastType === 'success' ? 'check_circle' : toastType === 'error' ? 'error' : 'info' }}
        </span>
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

/* Day tabs modern pill design */
.route-page-section .day-tabs-container {
  margin-bottom: 10px !important;
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}
.route-page-section .day-tabs-container::before,
.route-page-section .day-tabs-container::after {
  display: none !important;
  content: none !important;
}
.route-page-section .day-scroll-btn {
  position: static !important;
  transform: none !important;
  flex: 0 0 auto;
  width: 24px !important;
  height: 24px !important;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(124, 58, 237, 0.25) !important;
  border-radius: 50%;
  background: #fff;
  color: var(--violet);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(124, 58, 237, 0.1);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 5;
}
.route-page-section .day-scroll-btn:hover {
  background: var(--violet);
  border-color: var(--violet) !important;
  color: #fff;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
  transform: scale(1.05) !important;
}
.route-page-section .day-scroll-btn.prev {
  left: auto;
}
.route-page-section .day-scroll-btn.next {
  right: auto;
}
.route-page-section .day-scroll-btn[disabled] {
  opacity: 0.3;
  pointer-events: none;
  transform: none !important;
  visibility: visible !important;
}
.route-page-section .day-scroll-btn .material-symbols-rounded {
  font-size: 15px;
}
.route-page-section .day-sync-notice {
  position: absolute;
  top: 50%;
  left: calc(100% + 8px);
  z-index: 80;
  display: inline-block;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: var(--ink);
  color: #fff;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  transform: translateY(-50%);
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.route-page-section .day-sync-notice::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  border-width: 4px;
  border-style: solid;
  border-color: transparent var(--ink) transparent transparent;
}
.route-page-section .day-sync-notice:hover {
  opacity: 0.9;
  transform: translateY(-50%) translateX(1px);
}
.route-page-section .day-tabs {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  display: flex;
  gap: 4px;
  padding: 3px !important;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 999px;
}
.route-page-section .day-tabs::-webkit-scrollbar {
  display: none;
}
.route-page-section .day-tab {
  flex: 0 0 auto;
  display: flex;
  flex-direction: row !important;
  justify-content: center;
  align-items: center;
  padding: 4px 11px !important;
  min-height: 28px !important;
  max-height: 28px !important;
  border-radius: 999px;
  gap: 2px;
  white-space: nowrap;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.route-page-section .day-tab .day-date {
  display: none;
}
.route-page-section .day-tab .day-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
}
.route-page-section .day-tab:hover:not(.active) {
  background: rgba(0, 0, 0, 0.05);
}
.route-page-section .day-tab.active {
  background: var(--violet);
  box-shadow: 0 3px 10px rgba(124, 58, 237, 0.25);
}
.route-page-section .day-tab.active .day-title,
.route-page-section .day-tab.active .day-date {
  color: #fff;
}

/* ── Undo/Redo disabled state ── */
.map-tools .tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.map-tools .tool-btn:disabled:hover {
  background: transparent;
  color: var(--tool-inactive-color);
}
.map-tools .tool-btn.active:not(:disabled) {
  background: var(--violet);
  color: #fff;
}
.route-page-section .map-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  display: grid;
  grid-template-columns: var(--sidebar-width, 360px) minmax(0, 1fr) var(--route-panel-width, 380px);
  --detailbar-width: 440px;
  --detailbar-offset: 16px;
  --detailbar-gap: 16px;
  --route-panel-width: 380px;
  transition: grid-template-columns 0.22s ease;
}
.route-page-section .map-shell.is-sidebar-hidden {
  --sidebar-width: 0px;
}
.route-page-section .map-shell.is-route-utility-collapsed {
  --route-panel-width: 52px;
}
.route-utility-sidebar {
  --route-accent: #7c3aed;
  --route-accent-rgb: 124, 58, 237;
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  border-left: 1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98)),
    #fff;
  box-shadow: -14px 0 32px rgba(15, 23, 42, 0.06);
  overflow: hidden;
  position: relative;
  z-index: 55;
  transition: width 0.22s ease, transform 0.26s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.22s ease;
}
.route-utility-sidebar--chat {
  --route-accent: #0891b2;
  --route-accent-rgb: 8, 145, 178;
}
.route-utility-sidebar--memo {
  --route-accent: #d97706;
  --route-accent-rgb: 217, 119, 6;
}
.route-utility-sidebar--todo {
  --route-accent: #059669;
  --route-accent-rgb: 5, 150, 105;
}
.route-utility-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 12px 10px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
}
.route-utility-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.route-utility-heading > .material-symbols-rounded {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  background: rgba(var(--route-accent-rgb), 0.12);
  color: var(--route-accent);
  font-size: 20px;
}
.route-utility-heading h3 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 850;
  line-height: 1.25;
}
.route-utility-heading p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
.route-utility-collapse {
  display: grid;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(15, 23, 42, 0.10);
  border-radius: 999px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}
.route-utility-collapse:hover {
  border-color: rgba(var(--route-accent-rgb), 0.26);
  color: var(--route-accent);
  background: rgba(var(--route-accent-rgb), 0.07);
}
.route-utility-collapse .material-symbols-rounded {
  font-size: 20px;
}
.route-utility-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.86);
}
.route-utility-tab {
  display: flex;
  min-width: 0;
  height: 36px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: #fff;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
.route-utility-tab:hover {
  border-color: rgba(var(--tab-accent-rgb, var(--route-accent-rgb)), 0.18);
  background: rgba(var(--tab-accent-rgb, var(--route-accent-rgb)), 0.06);
  color: var(--tab-accent, var(--route-accent));
}
.route-utility-tab.active {
  border-color: rgba(var(--tab-accent-rgb, var(--route-accent-rgb)), 0.28);
  background: rgba(var(--tab-accent-rgb, var(--route-accent-rgb)), 0.12);
  color: var(--tab-accent, var(--route-accent));
  box-shadow: inset 0 0 0 1px rgba(var(--tab-accent-rgb, var(--route-accent-rgb)), 0.09);
}
.route-utility-tab--ai {
  --tab-accent: #7c3aed;
  --tab-accent-rgb: 124, 58, 237;
}
.route-utility-tab--chat {
  --tab-accent: #0891b2;
  --tab-accent-rgb: 8, 145, 178;
}
.route-utility-tab--memo {
  --tab-accent: #d97706;
  --tab-accent-rgb: 217, 119, 6;
}
.route-utility-tab--todo {
  --tab-accent: #059669;
  --tab-accent-rgb: 5, 150, 105;
}
.route-utility-tab .material-symbols-rounded {
  flex: 0 0 auto;
  font-size: 17px;
}
.route-utility-tab span:not(.material-symbols-rounded) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-utility-sidebar.is-collapsed {
  align-items: stretch;
}
.route-utility-sidebar.is-collapsed .route-utility-header {
  justify-content: center;
  padding: 10px 6px;
}
.route-utility-sidebar.is-collapsed .route-utility-heading {
  display: none;
}
.route-utility-sidebar.is-collapsed .route-utility-tabs {
  grid-template-columns: 1fr;
  gap: 6px;
  padding: 6px;
}
.route-utility-sidebar.is-collapsed .route-utility-tab {
  width: 40px;
  height: 40px;
  padding: 0;
}
.route-utility-sidebar.is-collapsed .route-utility-tab span:not(.material-symbols-rounded) {
  display: none;
}
.route-utility-sidebar .ai-chat-panel,
.route-utility-sidebar .floating-panel {
  position: relative !important;
  right: auto !important;
  bottom: auto !important;
  display: none !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0;
  flex: 1;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  opacity: 1;
  overflow: hidden;
  pointer-events: auto;
  transform: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transition: none;
}
.route-utility-sidebar .ai-chat-panel.show,
.route-utility-sidebar .floating-panel.show {
  display: flex !important;
  transform: none;
}
.route-utility-sidebar.is-collapsed .ai-chat-panel,
.route-utility-sidebar.is-collapsed .floating-panel {
  display: none !important;
}
.route-utility-sidebar .ai-chat-header,
.route-utility-sidebar .panel-header {
  flex: 0 0 auto;
  border-radius: 0;
}
.route-utility-sidebar .trip-chat-header {
  background: linear-gradient(135deg, #0f766e 0%, #0891b2 100%);
}
.route-utility-sidebar .panel-tabs {
  flex: 0 0 auto;
}
.route-utility-sidebar .panel-body,
.route-utility-sidebar .ai-chat-messages-container {
  flex: 1;
  min-height: 0;
  background: rgba(248, 250, 252, 0.72);
}
.route-utility-sidebar .ai-chat-input-row,
.route-utility-sidebar .panel-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
}
.route-utility-sidebar .ai-chat-suggestions,
.route-utility-sidebar .memo-toolbar,
.route-utility-sidebar .panel-progress-container {
  flex: 0 0 auto;
  background: #fff;
}
.route-utility-sidebar .memo-body textarea {
  height: 100%;
  min-height: 0;
  resize: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.route-utility-sidebar .ai-chat-header,
.route-utility-sidebar .panel-header {
  display: none;
}
.route-utility-sidebar .ai-chat-messages-container,
.route-utility-sidebar .panel-body {
  padding: 16px;
  background: rgba(248, 250, 252, 0.72);
}
.route-utility-sidebar .panel-tabs {
  display: flex;
  gap: 6px;
  padding: 12px 16px 8px;
  overflow-x: auto;
  background: rgba(248, 250, 252, 0.72);
}
.route-utility-sidebar .panel-tab-tag {
  height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}
.route-utility-sidebar .panel-tab-tag.active-memo,
.route-utility-sidebar .panel-tab-tag.active-todo {
  border-color: rgba(var(--route-accent-rgb), 0.26);
  background: rgba(var(--route-accent-rgb), 0.10);
  color: var(--route-accent);
}
.route-utility-sidebar .ai-chat-suggestions,
.route-utility-sidebar .memo-toolbar,
.route-utility-sidebar .panel-progress-container {
  padding: 12px 16px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  background: rgba(255, 255, 255, 0.62);
}
.route-utility-sidebar .ai-chat-suggestions {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.route-utility-sidebar .suggestion-chip,
.route-utility-sidebar .toolbar-btn {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  color: #475569;
  box-shadow: none;
}
.route-utility-sidebar .suggestion-chip {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 36px;
  align-items: center;
  justify-content: flex-start;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
.route-utility-sidebar .toolbar-btn {
  width: 34px;
  height: 34px;
}
.route-utility-sidebar .suggestion-chip:hover,
.route-utility-sidebar .toolbar-btn:hover {
  border-color: rgba(var(--route-accent-rgb), 0.26);
  background: rgba(var(--route-accent-rgb), 0.08);
  color: var(--route-accent);
  transform: none;
}
.route-utility-sidebar .ai-chat-input-row,
.route-utility-sidebar .panel-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 68px;
  box-sizing: border-box;
  padding: 12px 16px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.route-utility-sidebar .memo-footer,
.route-utility-sidebar .todo-footer {
  min-height: 68px;
}
.route-utility-sidebar .todo-input-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}
.route-utility-sidebar .route-send-box {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  height: 44px;
  min-width: 0;
  align-items: center;
  box-sizing: border-box;
  gap: 0;
  padding: 4px 0 4px 14px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}
.route-utility-sidebar .route-send-box:focus-within {
  border-color: rgba(var(--route-accent-rgb), 0.42);
  box-shadow: 0 0 0 3px rgba(var(--route-accent-rgb), 0.11);
}
.route-utility-sidebar .todo-input-row.route-send-box {
  background: #fff;
}
.route-utility-sidebar input[type="text"] {
  flex: 1 1 auto;
  width: 100%;
  height: 34px !important;
  min-width: 0;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
  line-height: 34px !important;
  padding: 0 !important;
  box-shadow: none;
  vertical-align: middle;
}
.route-utility-sidebar input[type="text"]::placeholder {
  color: #94a3b8;
  font-size: 13px;
  font-weight: 650;
  opacity: 1;
}
.route-utility-sidebar input[type="text"]:focus {
  outline: none;
}
.route-utility-sidebar #ai-chat-input,
.route-utility-sidebar #trip-chat-input,
.route-utility-sidebar #todo-input,
.route-utility-sidebar #ai-chat-input:focus {
  border: 0 !important;
  background: transparent !important;
  outline: 0;
  box-shadow: none !important;
}
.route-utility-sidebar #trip-chat-input:focus,
.route-utility-sidebar #todo-input:focus {
  border: 0 !important;
  background: transparent !important;
  outline: 0;
  box-shadow: none !important;
}
.route-utility-sidebar .compact-send-btn,
.route-utility-sidebar .btn.primary.small {
  display: inline-flex;
  flex: 0 0 auto;
  height: 40px !important;
  min-width: 40px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0 !important;
  border-radius: 999px !important;
  background: linear-gradient(135deg, var(--route-accent), color-mix(in srgb, var(--route-accent) 72%, #ffffff)) !important;
  color: #fff !important;
  cursor: pointer;
  font-size: 13px !important;
  font-weight: 850 !important;
  padding: 0 14px !important;
  box-shadow: 0 8px 18px rgba(var(--route-accent-rgb), 0.22);
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}
.route-utility-sidebar .compact-send-btn {
  flex: 0 0 41px;
  width: 41px !important;
  height: 41px !important;
  min-width: 41px;
  border-radius: 999px !important;
  padding: 0 !important;
  box-shadow: none;
}
.route-utility-sidebar #ai-chat-send-btn,
.route-utility-sidebar #trip-chat-send-btn,
.route-utility-sidebar #todo-add-btn {
  flex: 0 0 41px !important;
  width: 41px !important;
  height: 41px !important;
  min-width: 41px !important;
  min-height: 41px !important;
  border-radius: 999px !important;
  padding: 0 !important;
}
.route-utility-sidebar .compact-send-btn .material-symbols-rounded,
.route-utility-sidebar .btn.primary.small .material-symbols-rounded,
.route-utility-sidebar .text-danger-btn .material-symbols-rounded {
  font-size: 18px;
  line-height: 1;
}
.route-utility-sidebar .compact-send-btn:hover:not(:disabled),
.route-utility-sidebar .btn.primary.small:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(var(--route-accent-rgb), 0.28);
}
.route-utility-sidebar .route-send-box .compact-send-btn:hover:not(:disabled) {
  transform: none;
  box-shadow: 0 4px 10px rgba(var(--route-accent-rgb), 0.22);
}
.route-utility-sidebar .compact-send-btn:disabled,
.route-utility-sidebar .btn.primary.small:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
  box-shadow: none;
}
.route-utility-sidebar .text-danger-btn {
  height: 44px;
  min-width: 44px;
  padding: 0 14px !important;
  border: 1px solid rgba(244, 63, 94, 0.18) !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.82) !important;
  color: #e11d48 !important;
  font-size: 13px !important;
  font-weight: 850 !important;
}
.route-utility-sidebar .text-danger-btn:hover {
  border-color: rgba(244, 63, 94, 0.28) !important;
  background: rgba(244, 63, 94, 0.08) !important;
}
.route-utility-sidebar .memo-footer-left {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.route-utility-sidebar .memo-footer-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.route-utility-sidebar .memo-action-btn {
  width: 96px !important;
  min-width: 96px !important;
}
.route-utility-sidebar .memo-char-count {
  display: inline-flex;
  height: 32px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.9);
  color: #64748b;
  font-size: 12px;
  font-weight: 750;
  white-space: nowrap;
}
.route-utility-sidebar .todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
}
.route-utility-sidebar .todo-item {
  min-height: 48px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  padding: 8px 10px;
}
.route-utility-sidebar .trip-chat-avatar {
  overflow: hidden;
  background: linear-gradient(135deg, var(--route-accent), color-mix(in srgb, var(--route-accent) 68%, #ffffff));
}
.route-utility-sidebar .trip-chat-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.route-page-section .sidebar {
  height: 100%;
  width: 100%;
  overflow: visible;
  z-index: 70;
  transition: opacity 0.2s ease, transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.route-page-section .sidebar.is-hidden {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}
.route-page-section .sidebar-content {
  width: 100%;
  box-sizing: border-box;
}
.route-panel-backdrop {
  position: absolute;
  inset: 0;
  z-index: 60;
  padding: 0;
  border: 0;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(2px);
  cursor: pointer;
}
.route-sidebar-restore {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 32;
  display: inline-flex;
  height: 42px;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(12px);
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
}
.route-sidebar-restore:hover {
  border-color: rgba(124, 58, 237, 0.28);
  color: var(--violet);
}
.route-sidebar-restore .material-symbols-rounded {
  font-size: 20px;
}
.route-page-section .trip-info-badge-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.avatar-with-tooltip {
  position: relative;
  overflow: visible;
}
.avatar-with-tooltip.is-online {
  box-shadow: 0 4px 10px rgba(67, 74, 122, .12), 0 0 0 2px rgba(34, 197, 94, 0.25);
}
.avatar-presence-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 11px;
  height: 11px;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
}
.avatar-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  background: var(--ink);
  color: #fff;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: all 0.15s ease;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.avatar-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 4px;
  border-style: solid;
  border-color: var(--ink) transparent transparent transparent;
}
.avatar-tooltip-status {
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  font-weight: 700;
}
.avatar-with-tooltip:hover .avatar-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) scale(1);
}

/* Day tabs modern pill design */
.route-page-section .day-tabs {
  background: rgba(0, 0, 0, 0.04);
  border-radius: 999px;
  padding: 4px;
  gap: 4px;
}
.route-page-section .day-tab {
  border-radius: 999px;
  min-height: 48px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.route-page-section .day-tab:hover:not(.active) {
  background: rgba(0, 0, 0, 0.04);
}
.route-page-section .day-tab.active {
  background: var(--violet);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.25);
}
.route-page-section .day-tab.active .day-title,
.route-page-section .day-tab.active .day-date {
  color: #fff;
}

.route-page-section .itinerary {
  width: 100%;
  align-items: stretch;
  gap: 6px !important;
}
.route-page-section .stop {
  width: calc(100% - 12px);
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  padding: 8px 12px !important;
  position: relative;
  z-index: 20;
  isolation: isolate;
}
.route-page-section .stop.has-thumb {
  grid-template-columns: 24px 40px minmax(0, 1fr) 24px;
  gap: 8px;
}
.route-page-section .stop-thumb {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  background: rgba(99, 102, 241, 0.08);
}
.route-page-section .stop-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
}
.route-page-section .stop-content strong {
  display: block;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.route-page-section .stop-content .small.muted {
  display: block;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
}
.route-page-section .day-separator {
  width: 100%;
  position: relative;
  z-index: 140 !important;
}
.route-page-section .add-stop-container {
  width: 100%;
  box-sizing: border-box;
  position: absolute !important;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 320;
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}
.route-page-section .trip-header-card {
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--day-color-border, rgba(0, 102, 255, 0.16));
  background: linear-gradient(135deg, #ffffff, var(--day-color-bg, rgba(0, 102, 255, 0.06)));
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
}
.trip-info-badge-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.trip-card-dates {
  font-size: 13px;
  color: var(--day-color, var(--violet));
  font-weight: 700;
  display: flex;
  align-items: center;
}
.trip-status-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 4px 8px;
  background: var(--day-color-bg, rgba(0, 102, 255, 0.1));
  color: var(--day-color, var(--violet));
  border-radius: 8px;
}
.trip-card-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
  line-height: 1.3;
}
.trip-card-period-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.trip-card-period-row .icon-calendar {
  font-size: 15px;
  color: var(--day-color, var(--violet));
}
.trip-card-divider {
  height: 1px;
  background: var(--line);
  margin: 2px 0;
}
.trip-stats-grid {
  display: flex;
  gap: 20px;
}
.trip-stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.trip-stat-item .stat-label {
  font-size: 11px;
  color: var(--muted);
  font-weight: 700;
}
.trip-stat-item .stat-value {
  font-size: 14px;
  color: var(--ink);
  font-weight: 800;
}
.trip-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}
.route-page-section .map-canvas {
  height: 100%;
  min-height: 0;
}

.route-page-section .map-canvas.navigation-guide-mode {
  background: #eef4ff;
}

.route-page-section .map-canvas.navigation-guide-mode::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  background:
    linear-gradient(180deg, rgba(3, 19, 53, 0.16), rgba(3, 19, 53, 0) 26%),
    linear-gradient(0deg, rgba(37, 99, 235, 0.10), rgba(37, 99, 235, 0) 34%);
}

.route-page-section .map-canvas.navigation-guide-mode .itinerary-map {
  filter: saturate(1.08) contrast(1.03);
}

.route-page-section .map-canvas.navigation-guide-mode .map-tools {
  background: #ffffff;
  border-color: rgba(15, 23, 42, 0.10);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
}

.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn {
  color: var(--tool-inactive-color);
}

.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn.active:not(:disabled) {
  background: #2563eb;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35);
  color: #fff;
}

.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn:is(.active, .is-on):not(:disabled),
.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn:is(.active, .is-on):not(:disabled) .material-symbols-rounded {
  color: #fff;
}

.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn[data-action="undo"].is-on:not(:disabled),
.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn[data-action="redo"].is-on:not(:disabled),
.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn[data-action="undo"].is-on:not(:disabled) .material-symbols-rounded,
.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn[data-action="redo"].is-on:not(:disabled) .material-symbols-rounded {
  color: #000000;
}

.route-page-section .map-canvas.navigation-guide-mode .map-tools .tool-btn:not(.active):not(.is-on):not(:disabled) {
  color: var(--tool-inactive-color);
}

.route-page-section .map-canvas.navigation-guide-mode .route-connector-line {
  border-color: #2563eb !important;
  background: #2563eb;
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
  bottom: 82px;
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
  z-index:150;
  transform:translateX(-100%);
  transition:transform .3s cubic-bezier(.4,0,.2,1);
  display:flex;flex-direction:column;
  pointer-events:none;
  overflow:visible;
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

.search-panel-body { padding:16px;overflow:visible;flex:1;min-height:0; }

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
  position:fixed;bottom:calc(20px + 56px + 12px);left:50vw;transform:translateX(-50%);
  display:flex;align-items:center;gap:10px;
  max-width:min(420px, calc(100vw - 32px));
  padding:12px 18px;border-radius:14px;
  background:rgba(255,255,255,0.95);backdrop-filter:blur(16px);
  border:1px solid var(--line);box-shadow:0 12px 40px rgba(0,0,0,0.12);
  font-size:14px;font-weight:700;color:var(--ink);z-index:9999;
  white-space:normal;
  text-align:center;
}
.toast-notification .material-symbols-rounded {
  flex:0 0 auto;
  font-size:18px;
}
.toast-notification--success .material-symbols-rounded {
  color:#059669;
}
.toast-notification--error {
  border-color:#fecdd3;
}
.toast-notification--error .material-symbols-rounded {
  color:#be123c;
}
.toast-notification--info .material-symbols-rounded {
  color:var(--violet);
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

.stop.route-grouped {
  border-left-color: var(--day-color, var(--violet)) !important;
  box-shadow: 0 1px 0 var(--day-color-bg, rgba(124, 58, 237, 0.08)), inset 4px 0 0 var(--day-color-border, rgba(124, 58, 237, 0.22));
}

.stop.route-group-start {
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.stop.route-group-middle,
.stop.route-group-end {
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.stop.route-grouped.is-chain-dragging {
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12), inset 4px 0 0 var(--day-color, var(--violet));
  z-index: 120 !important;
}

/* ── Route connector between linked stops (vertical) ── */
.route-connector {
  display: flex;
  flex: 0 0 28px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  height: 28px;
  min-height: 28px;
  margin: -4px 12px;
  padding: 0;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
  user-select: none;
  position: relative;
  z-index: 0;
  isolation: isolate;
}
.route-connector:hover {
  background: rgba(239, 68, 68, 0.06);
}
.route-connector:hover .route-unlink-icon {
  opacity: 1;
  color: var(--rose);
}
.route-connector-line {
  width: 3px;
  height: 100%;
  background: var(--day-color, var(--violet));
  border-radius: 999px;
  transition: background 0.2s;
}
.route-connector:hover .route-connector-line {
  background: var(--rose);
}
.route-unlink-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  padding: 2px;
  margin: 0;
  z-index: 1;
}
.route-connector:hover .route-unlink-icon {
  opacity: 1;
}

/* Prevent native drag and selection during custom pointer drag */
.route-page-section .stop,
.route-page-section .day-separator {
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  touch-action: none;
}
.route-page-section .itinerary.dragging-stop,
.route-page-section .itinerary.dragging-separator {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  scrollbar-width: none;
}

/* Tooltip CSS */
.route-page-section .map-tools {
  --tool-inactive-color: #64748b;
  --tool-divider-color: rgba(100, 116, 139, 0.42);
}
.map-tools .tool-btn {
  position: relative;
}
.route-page-section .map-tools .tool-btn:not(.active):not(.is-on):not(:disabled),
.route-page-section .map-tools .tool-btn.is-off:not(:disabled),
.route-page-section .map-tools .tool-btn[data-route-state="hidden"]:not(:disabled),
.route-page-section .map-tools .tool-btn[data-card-state="hidden"]:not(:disabled) {
  color: var(--tool-inactive-color);
}
.route-page-section .map-tools .tool-btn.is-off:hover:not(:disabled),
.route-page-section .map-tools .tool-btn[data-route-state="hidden"]:hover:not(:disabled),
.route-page-section .map-tools .tool-btn[data-card-state="hidden"]:hover:not(:disabled) {
  color: var(--violet);
}
.route-page-section .map-tools .tool-divider {
  width: 2px;
  height: 24px;
  margin: 0 6px;
  background: linear-gradient(
    180deg,
    transparent,
    var(--tool-divider-color) 18%,
    var(--tool-divider-color) 82%,
    transparent
  );
  border-radius: 999px;
  opacity: 1;
}
.route-page-section .map-tools .tool-btn[data-action="undo"].is-on:not(:disabled),
.route-page-section .map-tools .tool-btn[data-action="redo"].is-on:not(:disabled) {
  background: transparent;
  color: #000000;
}
.route-page-section .map-tools .tool-btn[data-action="undo"].is-on:hover:not(:disabled),
.route-page-section .map-tools .tool-btn[data-action="redo"].is-on:hover:not(:disabled) {
  background: var(--surface-2);
  color: #000000;
}
.map-tools .tool-tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%) translateY(4px);
  background: var(--ink);
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 200;
}
.map-tools .tool-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 4px;
  border-style: solid;
  border-color: var(--ink) transparent transparent transparent;
}
.map-tools .tool-btn:hover .tool-tip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* Trash Drop Zone CSS */
.trash-drop-zone {
  display: none;
  border: 2px dashed var(--rose);
  background: rgba(244, 63, 94, 0.05);
  color: var(--rose);
  padding: 0;
  height: 48px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  transition: all 0.2s;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.route-page-section .add-stop-dashed,
.route-page-section .trash-drop-zone {
  margin-top: 0 !important;
}
.trash-drop-zone.is-drag-over-trash {
  background: rgba(244, 63, 94, 0.15);
  border-style: solid;
}
.route-page-section .itinerary.dragging-stop ~ .add-stop-container > .add-stop-dashed,
.route-page-section .itinerary.dragging-separator ~ .add-stop-container > .add-stop-dashed {
  display: none;
}
.route-page-section .itinerary.dragging-stop ~ .add-stop-container > .trash-drop-zone,
.route-page-section .itinerary.dragging-separator ~ .add-stop-container > .trash-drop-zone {
  display: flex;
}

.route-connector {
  flex: 0 0 20px !important;
  height: 20px !important;
  min-height: 20px !important;
  margin: -1px 12px !important;
  z-index: 0 !important;
}

.route-connector-line {
  display: block !important;
  flex: 0 0 auto !important;
  width: 3px !important;
  min-width: 3px !important;
  height: 100% !important;
  min-height: 100% !important;
  border-left: 0 !important;
  background: var(--day-color, var(--violet)) !important;
  border-radius: 999px !important;
}
.route-connector:hover .route-connector-line {
  background: var(--rose) !important;
}

.trip-stats-grid {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  padding: 4px 0 !important;
}
.trip-stat-item {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  text-align: center !important;
  flex: 1 !important;
}

.detailbar-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.detailbar-tag {
  color: var(--violet);
  font-size: 11px;
  font-weight: 700;
}
.acc-pill.unknown {
  color: var(--muted);
  background: var(--surface);
  border-color: var(--line);
}

.map-object-file-input {
  display: none;
}

.map-sticker-palette {
  position: absolute;
  left: 50%;
  bottom: 82px;
  z-index: 35;
  display: grid;
  grid-template-columns: repeat(4, 42px);
  gap: 7px;
  padding: 10px;
  border: 1px solid rgba(15, 23, 42, .1);
  border-radius: 16px;
  background: rgba(255, 252, 246, .96);
  box-shadow: 0 18px 48px rgba(15, 23, 42, .18), 0 2px 8px rgba(15, 23, 42, .08);
  backdrop-filter: blur(14px);
  transform: translateX(-50%);
}

.map-sticker-palette::after {
  content: '';
  position: absolute;
  bottom: -7px;
  left: var(--popover-anchor-x, 50%);
  width: 12px;
  height: 12px;
  border-right: 1px solid rgba(15, 23, 42, .1);
  border-bottom: 1px solid rgba(15, 23, 42, .1);
  background: rgba(255, 252, 246, .96);
  transform: translateX(-50%) rotate(45deg);
}

.map-sticker-option {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  padding: 5px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: #fff;
  cursor: pointer;
}

.map-sticker-option:hover,
.map-sticker-option.active {
  border-color: #7c3aed;
  background: #f4efff;
  transform: translateY(-1px);
}

.map-sticker-option svg {
  width: 31px;
  height: 31px;
}

.map-sticker-help {
  grid-column: 1 / -1;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.map-object-actions {
  position: absolute;
  left: 50%;
  bottom: 82px;
  z-index: 24;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 12px;
  border: 1px solid rgba(15, 23, 42, .1);
  border-radius: 999px;
  background: rgba(255, 255, 255, .95);
  color: #475569;
  box-shadow: 0 12px 32px rgba(15, 23, 42, .16);
  font-size: 11px;
  font-weight: 700;
  transform: translateX(-50%);
}

.map-object-actions button {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.map-object-actions .material-symbols-rounded {
  font-size: 16px;
}

.route-page-section .tool-popover::after {
  left: var(--popover-anchor-x, 50%);
}

@media (max-width: 1439px) {
  .route-page-section .map-shell {
    --route-panel-width: 52px;
  }

  .route-page-section .route-utility-sidebar:not(.is-collapsed) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(380px, calc(100% - 24px));
    z-index: 75;
  }

  .route-page-section .map-tools {
    right: 12px;
    left: 12px;
    width: auto;
    max-width: none;
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: visible;
    transform: none;
    scrollbar-width: none;
    overscroll-behavior-inline: contain;
  }

  .route-page-section .map-tools::-webkit-scrollbar {
    display: none;
  }

  .route-page-section .map-tools .tool-btn {
    flex: 0 0 40px;
  }

  .route-page-section .detailbar {
    width: min(420px, calc(100% - var(--sidebar-width, 360px) - 76px));
  }
}

@media (max-width: 1023px) {
  .route-page-section .map-shell,
  .route-page-section .map-shell.is-route-utility-collapsed,
  .route-page-section .map-shell.is-sidebar-hidden {
    --sidebar-width: 0px;
    --route-panel-width: 0px;
    grid-template-columns: minmax(0, 1fr);
  }

  .route-page-section .sidebar {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(360px, calc(100% - 64px));
    border-right: 1px solid var(--line);
    box-shadow: 18px 0 48px rgba(15, 23, 42, 0.18);
  }

  .route-page-section .sidebar.is-hidden {
    transform: translateX(calc(-100% - 24px));
  }

  .route-page-section .route-utility-sidebar,
  .route-page-section .route-utility-sidebar:not(.is-collapsed) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(380px, calc(100% - 64px));
    z-index: 75;
  }

  .route-page-section .route-utility-sidebar.is-collapsed {
    width: 52px;
  }

  .route-page-section .detailbar {
    top: 12px;
    bottom: 12px;
    left: 12px;
    width: min(440px, calc(100% - 76px));
    z-index: 50;
  }

  .route-page-section .detailbar.is-hidden {
    transform: translateX(calc(-100% - 24px));
  }
}

@media (max-width: 767px) {
  .route-page-section {
    top: 64px !important;
  }

  .route-page-section .sidebar {
    top: auto;
    right: 0;
    bottom: 0;
    width: 100%;
    height: min(72dvh, calc(100% - 12px));
    border: 1px solid rgba(15, 23, 42, 0.10);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -18px 52px rgba(15, 23, 42, 0.20);
    transform: translateY(0);
  }

  .route-page-section .sidebar.is-hidden {
    transform: translateY(calc(100% + 24px));
  }

  .route-page-section .sidebar-content {
    padding: 54px 18px calc(18px + env(safe-area-inset-bottom));
  }

  .route-page-section .sidebar-toggle {
    top: 10px;
    right: 12px;
  }

  .route-page-section .route-utility-sidebar:not(.is-collapsed) {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: min(72dvh, calc(100% - 12px));
    border: 1px solid rgba(15, 23, 42, 0.10);
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -18px 52px rgba(15, 23, 42, 0.20);
  }

  .route-page-section .route-utility-sidebar.is-collapsed {
    top: 12px;
    right: 12px;
    bottom: auto;
    width: auto;
    height: 52px;
    flex-direction: row;
    border: 1px solid rgba(15, 23, 42, 0.10);
    border-radius: 999px;
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.16);
  }

  .route-page-section .route-utility-sidebar.is-collapsed .route-utility-header {
    padding: 6px 2px 6px 6px;
    border-right: 1px solid rgba(15, 23, 42, 0.08);
    border-bottom: 0;
  }

  .route-page-section .route-utility-sidebar.is-collapsed .route-utility-tabs {
    grid-template-columns: repeat(4, 40px);
    align-content: center;
    gap: 2px;
    padding: 6px;
    border-bottom: 0;
  }

  .route-page-section .route-utility-sidebar.is-collapsed .route-utility-tab {
    width: 40px;
    height: 40px;
  }

  .route-sidebar-restore {
    top: 12px;
    min-width: 48px;
    padding: 0 12px;
  }

  .route-page-section .detailbar {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: min(76dvh, calc(100% - 12px));
    border-bottom: 0;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -18px 52px rgba(15, 23, 42, 0.22);
    transform: translateY(0);
  }

  .route-page-section .detailbar.is-hidden {
    transform: translateY(calc(100% + 24px));
  }

  .route-page-section .detailbar-scroll {
    padding: 22px 18px calc(24px + env(safe-area-inset-bottom));
  }

  .route-page-section .map-tools {
    bottom: max(12px, env(safe-area-inset-bottom));
    border-radius: 14px;
  }

  .map-object-actions,
  .map-drawing-status {
    bottom: calc(74px + env(safe-area-inset-bottom));
  }

  .map-object-actions > span {
    display: none;
  }

  .map-sticker-palette {
    max-width: calc(100% - 24px);
  }

  .route-page-section .tool-popover {
    max-width: calc(100% - 24px);
    min-width: min(240px, calc(100% - 24px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-page-section .map-shell,
  .route-page-section .sidebar,
  .route-page-section .route-utility-sidebar {
    transition-duration: 0.01ms !important;
  }
}
</style>
