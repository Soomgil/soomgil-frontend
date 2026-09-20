<script setup lang="ts">
import { formatUiText } from '@/i18n/ui-localizer'
import { translateUiText } from '@/i18n/ui-localizer'
import aiProfileImage from '@/assets/images/ai-profile.png'
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { prefetchMapStyles } from '@/utils/mapStyleCache'
import { MAP_THEMES, type MapTheme } from '@/types/map-theme'
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
import MapTasteControl from '@/components/map/MapTasteControl.vue'
import type { RouteMode } from '@/types/itinerary'
import type { ItineraryMapStop, ItineraryMapNearbyPlace as TasteMapPlace } from '@/components/map/MapboxItineraryMap.vue'
import type { MapDrawingDraft, MapDrawingStroke, MapDrawingTool } from '@/components/map/MapDrawingOverlay.vue'
import type { MapCursorView, MapObjectLockView } from '@/components/map/MapObjectOverlay.vue'
import { MAP_STICKERS, stickerHref } from '@/components/map/mapStickerCatalog'
import PlaceDiscoveryPanel from '@/components/place/PlaceDiscoveryPanel.vue'
import MapSectionTour from '@/components/onboarding/MapSectionTour.vue'
import { getAiRefreshTargets } from './routeBackendSync'
import { useItinerary } from '@/composables/useItinerary'
import { useMapViewport } from '@/composables/useMapViewport'
import { placeApi } from '@/api/place.api'
import { useDrawingPreviewChannel } from '@/realtime/drawingPreview'
import { getCollaborationSessionId } from '@/realtime/collaborationSession'
import { resolveWebSocketUrl, StompTransport } from '@/realtime/stompTransport'
import { useTripStore } from '@/stores/trip.store'
import { useVotingStore } from '@/stores/voting.store'
import TripSettingsModal from '@/components/trip/TripSettingsModal.vue'
import TripSettingsButton from '@/components/trip/TripSettingsButton.vue'
import TripVoteFlow from '@/components/voting/TripVoteFlow.vue'
import { buildVoteArrangePrompt } from '@/components/voting/voteArrangePrompt'
import type { AiChatMessage } from '@/types/ai'
import type { TripChatMessage } from '@/types/chat'
import type { Checklist, ChecklistItem, ChecklistMemberStatus, Note, PlanningScope } from '@/types/planning'
import type { CollaborationCommandEvent, DrawingPreviewEvent, TripPresenceEvent, TripRealtimeEvent } from '@/types/collaboration'
import type { LngLat } from '@/types/geo'
import type { AccessibilityFlag, ParkingType, Place, PlaceAccessibility, PlaceProvider, PlaceRecommendation } from '@/types/place'
import type { ItineraryDay, MapDrawing, MapObjectTransform, MapStickerCode, ReorderItineraryInput } from '@/types/itinerary'
import type { SwipeAction } from '@/types/swipe'

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
const router = useRouter()
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
const voteTripDays = computed(() => {
  const scheduledDays = dayPlans.value.filter(day => day.groupType !== 'UNSCHEDULED')
  if (scheduledDays.length > 0) return scheduledDays.length

  const start = trip.value.startDate ? new Date(`${trip.value.startDate}T00:00:00`) : null
  const end = trip.value.endDate ? new Date(`${trip.value.endDate}T00:00:00`) : start
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
})
const mapPresenceMembers = computed(() => [...trip.value.members].sort((left, right) => {
  if (left.online === right.online) return 0
  return left.online ? -1 : 1
}))
const hiddenMapPresenceMembers = computed(() => mapPresenceMembers.value.slice(4))

/* ── 여행 방 투표 진입 ──
 * 투표 세션 상태는 라우터 가드(ensureGate)가 이 여행에 진입할 때 이미 voting store에 채워 둔다.
 * 여기서는 그 상태만 읽어 버튼 문구를 정하고, 화면 이동만 담당한다. 세션이 없으면 방장만 시작할 수 있다.
 */
const votingStore = useVotingStore()
const isTripOwner = computed(() => {
  // 방장도 trip_members에는 MEMBER로 저장되고, API가 accessRole/myRole에서 OWNER를 파생한다.
  // 멤버 목록의 role로는 방장을 알 수 없으므로 TripDetail.myRole을 우선 본다.
  const detail = tripStore.currentTrip?.id === tripId ? tripStore.currentTrip : null
  return (detail?.myRole ?? trip.value.myRole) === 'OWNER'
})
const voteSessionStatus = computed(() => votingStore.session?.status ?? null)
/** 내가 참여자인데 아직 제출하지 않은 진행 중 투표가 있는지. 투표 안내의 기준이다. */
const votePending = computed(
  () => voteSessionStatus.value === 'OPEN' && votingStore.myParticipation != null && !votingStore.isSubmitted,
)
const voteHintDismissed = ref(false)
watch(() => votingStore.session?.id, () => { voteHintDismissed.value = false })
const voteModalOpen = ref(false)
const notificationVoteSessionId = ref<string | null>(null)
watch(() => route.query?.vote, value => {
  if (value === '1') {
    notificationVoteSessionId.value = typeof route.query.voteSession === 'string' ? route.query.voteSession : null
    voteModalOpen.value = true
    const { vote: _vote, voteSession: _session, ...query } = route.query
    void router.replace({ query })
  }
}, { immediate: true })

const mapTheme = ref<MapTheme>(readMapTheme())
const mapThemeOpen = ref(false)
watch(mapThemeOpen, open => {
  if (open) void prefetchMapStyles(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '')
})
const mapThemeButton = ref<HTMLButtonElement | null>(null)
function readMapTheme(): MapTheme {
  try {
    const saved = localStorage.getItem('soomgil-map-theme')
    return MAP_THEMES.find(theme => theme.value === saved)?.value ?? 'standard'
  } catch { return 'standard' }
}
function selectMapTheme(value: MapTheme) {
  mapTheme.value = value
  try { localStorage.setItem('soomgil-map-theme', value) } catch { /* 저장 불가 시 현재 화면에만 적용한다. */ }
  closeMapTheme()
}
function onMapThemeFocusOut(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) mapThemeOpen.value = false
}
function closeMapTheme() {
  mapThemeOpen.value = false
  mapThemeButton.value?.focus()
}
const showVoteAction = computed(() => isTripOwner.value || voteSessionStatus.value !== null)
const voteActionLabel = computed(() => {
  if (votePending.value) return '투표 중 · 미제출'
  if (voteSessionStatus.value === 'OPEN') return '투표 현황'
  if (voteSessionStatus.value === 'COMPLETED') return '투표 결과'
  return '투표 시작'
})
function openVoteModal() {
  notificationVoteSessionId.value = null
	voteModalOpen.value = true
}
function closeVoteModal() {
	voteModalOpen.value = false
}
/** 카드의 투표 버튼. 세션 유무와 상관없이 같은 모달을 열고, 흐름 컴포넌트가 상태별 화면을 그린다. */
function goTripVote() {
	openVoteModal()
}
/** 결과 화면에서 넘어온 선정 장소를 AI에게 즉시 보내고 변경된 일정을 동기화한다. */
async function arrangeSelectedPlacesWithAi(names: string[]) {
	closeVoteModal()
	aiMessage.value = buildVoteArrangePrompt(names)
	activeRoutePanel.value = 'ai'
	isRouteUtilityCollapsed.value = false
	if (isRouteOverlayLayout.value) isLeftSidebarOpen.value = false
	activeConversation.value = 'ai'
	await loadConversations()
	await nextTick()
	await sendAiMessage()
}
// 진입 시 제출하지 않은 투표가 있으면 모달을 한 번 자동으로 띄운다. 닫으면 강제로 다시 열지 않고 경고만 남긴다.
let autoOpenedVote = false
watch(
	votePending,
	(pending) => {
		if (pending && !autoOpenedVote) {
			autoOpenedVote = true
			voteModalOpen.value = true
		}
	},
	{ immediate: true },
)
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
const activeTool = ref<MapDrawingTool>('cursor')
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
const visibleMapStopIds = computed(() => new Set(mapStops.value.map((stop) => stop.id)))
const visibleMapRoutes = computed(() => {
  const stopIds = visibleMapStopIds.value
  if (activeDay.value === 0 && activeTool.value !== 'route-pen') return itinerary.routes.value
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
const tastePlaces = ref<TasteMapPlace[]>([])
const tasteControl = ref<InstanceType<typeof MapTasteControl> | null>(null)
function selectNearbyMapPlace(provider: string, placeId: string) {
  if (!tasteControl.value?.select(provider, placeId)) void selectPlace(placeId, provider as PlaceProvider)
}
function closeTasteControl() {
  tasteControl.value?.close()
}
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
const dayColors = ['day-color-1', 'day-color-2', 'day-color-3', 'day-color-4', 'day-color-5', 'day-color-6', 'day-color-7', 'day-color-8', 'day-color-9', 'day-color-10']
function getDayColorClass(day: number) { return day <= 0 ? dayColors[dayColors.length - 1] : dayColors[(day - 1) % dayColors.length] }

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
const selectedRouteMode = ref<RouteMode>('WALKING')
const defaultRouteModeOption = { value: 'WALKING', label: '도보', icon: 'directions_walk', shortLabel: '도보' } as const
const routeModeOptions: { value: RouteMode; label: string; icon: string; shortLabel: string }[] = [
  defaultRouteModeOption,
  { value: 'CYCLING', label: '자전거', icon: 'directions_bike', shortLabel: '자전거' },
  { value: 'DRIVING', label: '자동차', icon: 'directions_car', shortLabel: '자동차' },
]

function routeModeMeta(mode: RouteMode | undefined) {
  return routeModeOptions.find((option) => option.value === mode) ?? defaultRouteModeOption
}

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
  const linkedPrevious = hasVisibleRouteConnectorBetween(previousItemId, itemId)
  const linkedNext = hasVisibleRouteConnectorBetween(itemId, nextItemId)
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

function hasVisibleRouteConnectorBetween(id1: string | undefined, id2: string | undefined): boolean {
  if (hasRouteLinkBetween(id1, id2)) return true
  if (!id1 || !id2) return false
  return getLinkedChain(id1).includes(id2)
}

function routeBetween(id1: string | undefined, id2: string | undefined) {
  if (!id1 || !id2) return null
  return itinerary.routes.value.find(route =>
    (route.originItineraryItemId === id1 && route.destinationItineraryItemId === id2) ||
    (route.originItineraryItemId === id2 && route.destinationItineraryItemId === id1)
  ) ?? null
}

function routeForDisplayBetween(id1: string | undefined, id2: string | undefined) {
  const direct = routeBetween(id1, id2)
  if (direct || !id1 || !id2) return direct
  if (!getLinkedChain(id1).includes(id2)) return null
  return itinerary.routes.value.find((route) => (
    route.originItineraryItemId === id1
    || route.destinationItineraryItemId === id1
    || route.originItineraryItemId === id2
    || route.destinationItineraryItemId === id2
  )) ?? null
}

function routeLinkStats(itemId: string) {
  const incoming = routeLinks.value.filter((link) => link.toItemId === itemId).length
  const outgoing = routeLinks.value.filter((link) => link.fromItemId === itemId).length
  return {
    incoming,
    outgoing,
    isWaypoint: incoming > 0 && outgoing > 0,
  }
}

function canUseAsRouteOrigin(itemId: string) {
  const stats = routeLinkStats(itemId)
  return !stats.isWaypoint && stats.outgoing === 0
}

function canUseAsRouteDestination(itemId: string) {
  const stats = routeLinkStats(itemId)
  return !stats.isWaypoint && stats.incoming === 0
}

function itemDayIndex(itemId: string | undefined) {
  if (!itemId) return null
  return dayPlans.value.find((day) => day.items.some((item) => item.id === itemId))?.day ?? null
}

function isRouteDestinationDayAllowed(originItemId: string, destinationItemId: string) {
  const originDay = itemDayIndex(originItemId)
  const destinationDay = itemDayIndex(destinationItemId)
  if (destinationDay == null) return false
  if (originDay == null || originDay <= 0) return destinationDay <= 0
  return destinationDay <= 0 || destinationDay === originDay
}

function canUseAsRouteDestinationFrom(originItemId: string, destinationItemId: string) {
  if (originItemId === destinationItemId) return false
  if (!canUseAsRouteDestination(destinationItemId)) return false
  if (!isRouteDestinationDayAllowed(originItemId, destinationItemId)) return false
  if (hasRouteLinkBetween(originItemId, destinationItemId)) return false
  return !getLinkedChain(originItemId).includes(destinationItemId)
}

function canSelectRouteStopForCurrentStep(item: RouteStop) {
  if (item.lat == null || item.lng == null) return false
  if (!pendingRouteFrom.value) return canUseAsRouteOrigin(item.id)
  if (item.id === pendingRouteFrom.value) return true
  return canUseAsRouteDestinationFrom(pendingRouteFrom.value, item.id)
}

async function removeRouteLinkBetween(id1: string, id2: string) {
	const directLink = routeLinks.value.find(l =>
		(l.fromItemId === id1 && l.toItemId === id2) || (l.fromItemId === id2 && l.toItemId === id1)
	)
  const displayRoute = directLink ? null : routeForDisplayBetween(id1, id2)
  const link = directLink ?? (
    displayRoute
      ? { id: displayRoute.id, fromItemId: displayRoute.originItineraryItemId, toItemId: displayRoute.destinationItineraryItemId }
      : null
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
    if (!canUseAsRouteOrigin(item.id)) {
      showToast('이미 출발지나 경유지로 쓰인 장소는 새 출발지로 선택할 수 없습니다')
      return
    }
    pendingRouteFrom.value = item.id
    routeWaypoints.value = []
    showToast('지도 위 중간 지점을 찍고 도착 관광지를 선택하세요')
    return
  }
  if (pendingRouteFrom.value === item.id) {
    clearPendingRouteSelection()
    return
  }
  if (!canUseAsRouteDestinationFrom(pendingRouteFrom.value, item.id)) {
    showToast('같은 일차의 연결 가능한 도착지만 선택할 수 있습니다')
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
    const destinationChainIds = orderedLinkedChainIdsFrom(item.id)
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
      mode: selectedRouteMode.value,
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

function nearestRouteStop(
  coordinate: { lng: number; lat: number },
  predicate: (item: RouteStop) => boolean = () => true,
) {
  const candidates = dayPlans.value.flatMap((day) => day.items.flatMap((item) => (
    item.lat == null || item.lng == null || !predicate(item) ? [] : [{
      item,
      distance: distanceMeters(coordinate, { lng: item.lng, lat: item.lat }),
    }]
  )))
  return candidates.sort((left, right) => left.distance - right.distance)[0] ?? null
}

function nearestRouteStopInStrokeSection(
  coordinates: Array<{ lng: number; lat: number }>,
  section: 'start' | 'end',
  predicate: (item: RouteStop) => boolean = () => true,
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
      const candidate = nearestRouteStop(coordinate, predicate)
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
  const originCandidate = nearestRouteStopInStrokeSection(
    routeCoordinates,
    'start',
    (item) => canUseAsRouteOrigin(item.id),
  )
  const destinationCandidate = originCandidate
    ? nearestRouteStopInStrokeSection(
      routeCoordinates,
      'end',
      (item) => canUseAsRouteDestinationFrom(originCandidate.item.id, item.id),
    )
    : null
  if (!originCandidate || !destinationCandidate) {
    showToast('연결 가능한 같은 일차의 두 일정 장소 근처에서 경로를 그려주세요', 'error')
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
  if (!canUseAsRouteDestinationFrom(origin.id, destination.id)) {
    showToast('같은 일차의 연결 가능한 도착지만 선택할 수 있습니다')
    return
  }
  const requestCoordinates = buildRouteRequestCoordinates(routeCoordinates, origin, destination)
  if (requestCoordinates.length < 2) return

  pushUndoState('route-links')
  try {
    const destinationChainIds = orderedLinkedChainIdsFrom(destination.id)
    const newRoute = await itinerary.mapMatchRoute({
      originItineraryItemId: origin.id,
      destinationItineraryItemId: destination.id,
      mode: selectedRouteMode.value,
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

function orderedLinkedChainIdsFrom(itemId: string, plans: DayPlan[] = dayPlans.value) {
  const linkedIds = new Set(getLinkedChain(itemId))
  const order = new Map<string, number>()
  plans.flatMap((day) => day.items).forEach((item, index) => {
    order.set(item.id, index)
  })
  const neighbors = new Map<string, string[]>()
  for (const link of routeLinks.value) {
    if (!linkedIds.has(link.fromItemId) || !linkedIds.has(link.toItemId)) continue
    neighbors.set(link.fromItemId, [...(neighbors.get(link.fromItemId) ?? []), link.toItemId])
    neighbors.set(link.toItemId, [...(neighbors.get(link.toItemId) ?? []), link.fromItemId])
  }

  const result: string[] = []
  const visited = new Set<string>()
  let current: string | undefined = itemId
  let previous: string | null = null

  while (current && linkedIds.has(current) && !visited.has(current)) {
    result.push(current)
    visited.add(current)
    const nextId: string | undefined = (neighbors.get(current) ?? [])
      .filter((candidate) => candidate !== previous && !visited.has(candidate))
      .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0))[0]
    previous = current
    current = nextId
  }

  const leftovers = Array.from(linkedIds)
    .filter((id) => !visited.has(id))
    .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0))
  return [...result, ...leftovers]
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

  const itemById = new Map(dayPlans.value.flatMap((day) => (
    day.items.map((item) => [item.id, item] as const)
  )))
  const movingItems = movingItemIds.flatMap((id) => {
    const item = itemById.get(id)
    return item ? [{ ...item }] : []
  })
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

const DRAG_LAYER_Z_INDEX = '100001'

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
      el.style.setProperty('z-index', '100000', 'important')
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
    if (!dragStarted && Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return
    if (!dragStarted && Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20) {
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
    removeDragListeners()
    if (typeof stop.releasePointerCapture === 'function' && stop.hasPointerCapture?.(e.pointerId)) {
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

  function removeDragListeners() {
    stop.removeEventListener('pointermove', onPointerMove)
    stop.removeEventListener('pointerup', onPointerUp)
    stop.removeEventListener('pointercancel', cancelDrag)
    window.removeEventListener('blur', cancelDrag)
    window.removeEventListener('keydown', onDragKeyDown)
  }

  function cancelDrag() {
    removeDragListeners()
    if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame)
    autoScrollFrame = null
    if (stop.hasPointerCapture?.(e.pointerId)) stop.releasePointerCapture(e.pointerId)
    document.getElementById('trash-drop-zone')?.classList.remove('is-drag-over-trash')
    cleanupDragState()
    restoreItineraryScroll(initialScrollTop)
    releasePendingItineraryScroll(initialScrollTop)
  }

  function onDragKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelDrag()
    }
  }

  // Capture before the threshold so fast movements cannot escape the card.
  stop.setPointerCapture?.(e.pointerId)
  stop.addEventListener('pointermove', onPointerMove, { passive: false })
  stop.addEventListener('pointerup', onPointerUp)
  stop.addEventListener('pointercancel', cancelDrag)
  window.addEventListener('blur', cancelDrag)
  window.addEventListener('keydown', onDragKeyDown)
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
const mapSectionTour = ref<InstanceType<typeof MapSectionTour> | null>(null)
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

function prepareMapTourSection(section: string) {
  if (section === 'itinerary') {
    isLeftSidebarOpen.value = true
    if (isRouteOverlayLayout.value) isRouteUtilityCollapsed.value = true
    return
  }
  if (section === 'collaboration') {
    isRouteUtilityCollapsed.value = false
    if (isRouteOverlayLayout.value) isLeftSidebarOpen.value = false
    return
  }
  if (isRouteOverlayLayout.value) {
    isLeftSidebarOpen.value = false
    isRouteUtilityCollapsed.value = true
  }
}

function closeResponsivePanels() {
  if (!isRouteOverlayLayout.value) return
  if (isDetailbarOpen.value) {
    closeDetailbar()
    return
  }
  isLeftSidebarOpen.value = false
  isRouteUtilityCollapsed.value = true
}

/* ── AI / trip chat ── */
const aiMessage = ref('')
// 다른 화면에서 ?panel=ai(&aiPrompt=...)로 들어오면 AI 패널을 열고 프롬프트를 채워 둔다.
if (route.query?.panel === 'ai') {
  const prompt = typeof route.query.aiPrompt === 'string' ? route.query.aiPrompt : ''
  if (prompt) aiMessage.value = prompt
  void nextTick(() => togglePanel('ai'))
}
const aiMessages = ref<RouteAiChatMessage[]>([])
const chatMessages = ref<TripChatMessage[]>([])
const conversationLoading = ref(false)
const conversationError = ref('')
const aiMessagesContainerRef = ref<HTMLElement | null>(null)
const tripChatMessagesContainerRef = ref<HTMLElement | null>(null)
const aiChatPinnedToBottom = ref(true)
const tripChatPinnedToBottom = ref(true)

function isConversationAtBottom(container: HTMLElement) {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= 40
}

function updateConversationScrollState(kind: 'ai' | 'chat') {
  const container = kind === 'ai' ? aiMessagesContainerRef.value : tripChatMessagesContainerRef.value
  if (!container) return
  if (kind === 'ai') aiChatPinnedToBottom.value = isConversationAtBottom(container)
  else tripChatPinnedToBottom.value = isConversationAtBottom(container)
}

function keepConversationAtBottom(kind: 'ai' | 'chat') {
  const shouldFollow = kind === 'ai' ? aiChatPinnedToBottom.value : tripChatPinnedToBottom.value
  if (!shouldFollow) return
  void nextTick(() => {
    requestAnimationFrame(() => {
      const container = kind === 'ai' ? aiMessagesContainerRef.value : tripChatMessagesContainerRef.value
      if (!container) return
      container.scrollTop = container.scrollHeight
    })
  })
}

watch(
  () => aiMessages.value.map((message) => `${message.id}:${message.content?.length ?? 0}`).join('|'),
  () => keepConversationAtBottom('ai'),
)
watch(
  () => chatMessages.value.map((message) => `${message.id}:${message.content?.length ?? 0}:${message.deletedAt ?? ''}`).join('|'),
  () => keepConversationAtBottom('chat'),
)
watch(isAiChatOpen, (isOpen) => { if (isOpen) keepConversationAtBottom('ai') })
watch(isTripChatOpen, (isOpen) => { if (isOpen) keepConversationAtBottom('chat') })

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
    const [, aiResult, chatResult] = await Promise.allSettled([
      aiApi.getSession(tripId),
      aiApi.getMessages(tripId),
      chatApi.getMessages(tripId),
    ])
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
const loadedMemoVersions = ref<Record<string, number>>({})
const memoLoadTokens: Record<string, number> = {}
const memoRemoteRevisions: Record<string, number> = {}
const deletedMemoIds = new Set<string>()
const memoLoading = ref(false)
const memoStatus = ref('')
const memoDirty = ref(false)
const memoConflict = ref(false)

function scopeForTag(tag: string): PlanningScope {
  if (tag === '전체') return { scopeType: 'TRIP', itineraryDayId: null }
  const dayNumber = Number.parseInt(tag, 10)
  const day = dayPlans.value.find((candidate) => candidate.groupType === 'DAY' && candidate.day === dayNumber)
  return { scopeType: 'DAY', itineraryDayId: day?.id ?? null }
}

async function switchMemoDay(tag: string) {
  if (tag === activeMemoDay.value || memoLoading.value) return
  if (memoDirty.value && !window.confirm(translateUiText('작성 중인 내용을 버리고 다른 메모로 이동할까요?'))) return
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
  markMemoDirty()
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(start, start + replacement.length)
  })
}

function markMemoDirty() {
  memoDirty.value = true
  if (!memoConflict.value) memoStatus.value = ''
}

function showMemoConflict() {
  memoConflict.value = true
  memoStatus.value = '다른 멤버가 먼저 수정했습니다.'
}

function isMemoVersionConflict(error: any) {
  const code = error?.response?.data?.code ?? error?.response?.data?.errorCode
  return error?.response?.status === 409 && code === 'PLANNING_VERSION_CONFLICT'
}

async function loadNote(tag = activeMemoDay.value) {
  if (!tripId) return
  const scope = scopeForTag(tag)
  if (scope.scopeType === 'DAY' && !scope.itineraryDayId) return
  const loadToken = (memoLoadTokens[tag] ?? 0) + 1
  memoLoadTokens[tag] = loadToken
  memoLoading.value = true
  memoStatus.value = ''
  try {
    const note = await planningApi.getNote(tripId, scope)
    if (memoLoadTokens[tag] !== loadToken) return
    notes.value[tag] = note
    loadedMemoVersions.value[tag] = note?.version ?? 0
    if (activeMemoDay.value === tag) {
      memoTextDisplay.value = note?.content ?? ''
      memoDirty.value = false
      memoConflict.value = false
    }
  } catch (error: any) {
    if (memoLoadTokens[tag] !== loadToken) return
    if (error?.response?.status === 404) {
      notes.value[tag] = null
      loadedMemoVersions.value[tag] = 0
      if (activeMemoDay.value === tag) {
        memoTextDisplay.value = ''
        memoDirty.value = false
        memoConflict.value = false
      }
    } else {
      memoStatus.value = '불러오기 실패'
    }
  } finally {
    memoLoading.value = false
  }
}

async function saveNote() {
  const tag = activeMemoDay.value
  const content = memoTextDisplay.value.trim()
  const scope = scopeForTag(tag)
  if (!content || (scope.scopeType === 'DAY' && !scope.itineraryDayId)) return
  const remoteRevisionAtStart = memoRemoteRevisions[tag] ?? 0
  memoLoading.value = true
  memoStatus.value = '저장 중…'
  try {
    const result = await planningApi.saveNote(
      tripId,
      scope,
      content,
      loadedMemoVersions.value[tag] ?? 0,
    )
    if ((memoRemoteRevisions[tag] ?? 0) !== remoteRevisionAtStart) {
      if (!memoConflict.value) memoStatus.value = '다른 멤버의 최신 메모를 반영했습니다.'
      return
    }
    if (!result.note) throw new Error('Saved note is missing from the response.')
    notes.value[tag] = result.note
    loadedMemoVersions.value[tag] = result.note.version
    memoDirty.value = false
    memoConflict.value = false
    memoStatus.value = '저장됨'
  } catch (error: any) {
    if (isMemoVersionConflict(error)) showMemoConflict()
    else memoStatus.value = '저장 실패'
  } finally {
    memoLoading.value = false
  }
}

async function clearNote() {
  const tag = activeMemoDay.value
  const note = notes.value[tag]
  if (!note) {
    memoTextDisplay.value = ''
    memoDirty.value = false
    memoConflict.value = false
    return
  }
  if (!window.confirm(translateUiText('이 메모를 삭제할까요?'))) return
  const remoteRevisionAtStart = memoRemoteRevisions[tag] ?? 0
  memoLoading.value = true
  try {
    await planningApi.deleteNote(
      tripId,
      note.id,
      loadedMemoVersions.value[tag] ?? note.version,
    )
    deletedMemoIds.add(note.id)
    if ((memoRemoteRevisions[tag] ?? 0) !== remoteRevisionAtStart) {
      if (!memoConflict.value) memoStatus.value = '다른 멤버의 최신 메모를 반영했습니다.'
      return
    }
    notes.value[tag] = null
    loadedMemoVersions.value[tag] = 0
    memoTextDisplay.value = ''
    memoDirty.value = false
    memoConflict.value = false
    memoStatus.value = '삭제됨'
  } catch (error: any) {
    if (isMemoVersionConflict(error)) showMemoConflict()
    else memoStatus.value = '삭제 실패'
  } finally {
    memoLoading.value = false
  }
}

async function reloadLatestMemo() {
  if (memoDirty.value && !window.confirm(translateUiText('작성 중인 내용을 버리고 최신 메모를 불러올까요?'))) return
  await loadNote()
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
const routeState = ref<'route' | 'hidden'>('route')
const cardState = ref<'full' | 'min' | 'hidden'>('full')
const nearbyOn = ref(false)
const standardMapView = ref(false)
const mapIsTilted = ref(false)
const itineraryMapRef = ref<{
  resetOrientation: () => void
  preserveCameraOnNextStopsChange: () => void
} | null>(null)
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
const routeToolButtonRef = ref<HTMLButtonElement | null>(null)
const stickerToolButtonRef = ref<HTMLButtonElement | null>(null)
const penPopoverRef = ref<HTMLElement | null>(null)
const routeModePopoverRef = ref<HTMLElement | null>(null)
const stickerPopoverRef = ref<HTMLElement | null>(null)
const penPopoverStyle = ref<ToolPopoverStyle>({})
const routeModePopoverStyle = ref<ToolPopoverStyle>({})
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
  if (activeTool.value === 'route-pen') {
    routeModePopoverStyle.value = anchoredToolPopoverStyle(routeToolButtonRef.value, routeModePopoverRef.value)
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
  if (newTool === 'route-pen') nextTick(updateToolPopoverPositions)
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
    nextTick(updateToolPopoverPositions)
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
  if (mapIsTilted.value || standardMapView.value) {
    standardMapView.value = false
    mapIsTilted.value = false
    itineraryMapRef.value?.resetOrientation()
    return
  }

  standardMapView.value = !standardMapView.value
  mapIsTilted.value = standardMapView.value
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
let lastLocalMapCursorCoordinate: LngLat | null = null
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
    if (drawingRetryIds.value.length > 0) retryDrawingSimplification()
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
  currentSessionId: getCollaborationSessionId,
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
    actorUserId?: string
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
      if (deletedMemoIds.has(event.note.id)) return true
      const current = notes.value[tag]
      if (current?.id === event.note.id && current.version >= event.note.version) return true
      memoLoadTokens[tag] = (memoLoadTokens[tag] ?? 0) + 1
      const isRemote = event.actorUserId !== currentUserId.value
      if (isRemote) memoRemoteRevisions[tag] = (memoRemoteRevisions[tag] ?? 0) + 1
      notes.value = { ...notes.value, [tag]: event.note }
      if (activeMemoDay.value === tag) {
        if (memoDirty.value && isRemote) {
          showMemoConflict()
        } else {
          memoTextDisplay.value = event.note.content
          loadedMemoVersions.value[tag] = event.note.version
          memoDirty.value = false
          memoConflict.value = false
        }
      }
      return true
    }
    case 'planning.note.deleted': {
      const entries = Object.entries(notes.value)
      const tag = entries.find(([, note]) => note?.id === event.noteId)?.[0]
      if (!tag) return false
      if (event.noteId) deletedMemoIds.add(event.noteId)
      memoLoadTokens[tag] = (memoLoadTokens[tag] ?? 0) + 1
      const isRemote = event.actorUserId !== currentUserId.value
      if (isRemote) memoRemoteRevisions[tag] = (memoRemoteRevisions[tag] ?? 0) + 1
      notes.value = { ...notes.value, [tag]: null }
      if (activeMemoDay.value === tag) {
        if (memoDirty.value && isRemote) {
          showMemoConflict()
        } else {
          memoTextDisplay.value = ''
          loadedMemoVersions.value[tag] = 0
          memoDirty.value = false
          memoConflict.value = false
        }
      }
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
	const optimisticDrawings = localDrawings.value.filter((drawing) => drawing.id.startsWith('local-drawing-'))
	const serverDrawings = drawings.flatMap((drawing) => {
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
	localDrawings.value = [...serverDrawings, ...optimisticDrawings]
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
    }
    activeTool.value = 'cursor'
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
    window.alert(translateUiText('JPG, PNG, WebP 이미지를 10MB 이하로 선택해 주세요.'))
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
    window.alert(translateUiText('지도 이미지를 업로드하지 못했습니다.'))
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
  lastLocalMapCursorCoordinate = coordinate
  const now = Date.now()
  if (now - lastCursorSentAt < 50) return
  lastCursorSentAt = now
  collaborationTransport.publish(`/app/trips/${encodeURIComponent(tripId)}/cursor`, {
    longitude: coordinate.lng,
    latitude: coordinate.lat,
    sequence: ++cursorSequence,
  })
}

function clearLocalMapCursor() {
  lastLocalMapCursorCoordinate = null
}

onMounted(() => {
  void connectRealtimeChannels()
  updateRouteResponsiveLayout()
  window.addEventListener('resize', updateRouteResponsiveLayout)
  cursorPruneTimer = window.setInterval(() => {
    const now = Date.now()
    if (lastLocalMapCursorCoordinate && now - lastCursorSentAt >= 3_000) {
      publishMapCursor(lastLocalMapCursorCoordinate)
    }
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
  if (drawingId.startsWith('local-drawing-') && (!collaborationConnected.value || !getCollaborationSessionId())) {
    queueDrawingRetry(drawingId)
    return
  }
  pendingDrawingIds.value = [...pendingDrawingIds.value, drawingId]
  drawingRetryIds.value = drawingRetryIds.value.filter((id) => id !== drawingId)
  try {
    // Long freehand strokes already use a screen-space error tolerance. Sending
    // them through the 100-point API would discard their preserved bends again.
    const simplified = drawing.coordinates.length > 100
      ? { coordinates: drawing.coordinates }
      : await geoApi.simplifyCoordinates({
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
			localDrawings.value = [
				...localDrawings.value.filter(candidate => candidate.id !== drawingId && candidate.id !== created.id),
				{ id: created.id, coordinates: simplified.coordinates, color: drawing.color, width: drawing.width },
			]
			simplifiedDrawingCoordinates.delete(drawingId)
			simplifiedDrawingCoordinates.set(created.id, simplified.coordinates)
		}
  } catch {
    if (localDrawings.value.some((candidate) => candidate.id === drawingId)) {
      queueDrawingRetry(drawingId)
    }
  } finally {
    pendingDrawingIds.value = pendingDrawingIds.value.filter((id) => id !== drawingId)
  }
}

function queueDrawingRetry(drawingId: string) {
  if (!drawingRetryIds.value.includes(drawingId)) {
    drawingRetryIds.value = [...drawingRetryIds.value, drawingId]
  }
}

function createLocalDrawing(draft: MapDrawingDraft) {
  pushUndoState('drawing')
  const drawing: MapDrawingStroke = {
    id: `local-drawing-${++localDrawingSequence}`,
    ...draft,
  }
  localDrawings.value = [...localDrawings.value, drawing]
  if (!collaborationConnected.value || !getCollaborationSessionId()) {
    itineraryActionError.value = '실시간 연결이 복구되면 그린 선을 자동으로 저장합니다.'
  }
  void simplifyLocalDrawing(drawing.id)
}

function handleDrawingCreate(draft: MapDrawingDraft) {
  if (activeTool.value === 'route-pen') {
    return
  }
  createLocalDrawing(draft)
}

async function eraseLocalDrawings(drawingIds: string[]) {
	const uniqueIds = [...new Set(drawingIds)]
	const localIds = uniqueIds.filter((drawingId) => drawingId.startsWith('local-drawing-'))
	const persistedIds = uniqueIds.filter((drawingId) => !drawingId.startsWith('local-drawing-'))
	if (localIds.length > 0) {
		pushUndoState('drawing')
		const erasedIds = new Set(localIds)
		localDrawings.value = localDrawings.value.filter((drawing) => !erasedIds.has(drawing.id))
		drawingRetryIds.value = drawingRetryIds.value.filter((id) => !erasedIds.has(id))
	}
	if (persistedIds.length === 0) return

	const acquiredIds: string[] = []
	try {
		const leaseResults = await Promise.all(persistedIds.map(async (drawingId) => ({
			drawingId,
			acquired: await acquireMapObjectLease(drawingId),
		})))
		leaseResults.filter((result) => result.acquired).forEach((result) => acquiredIds.push(result.drawingId))
		if (acquiredIds.length !== persistedIds.length) {
			throw new Error('Map drawing lease could not be acquired.')
		}
		await itinerary.deleteDrawings(persistedIds)
		const erasedIds = new Set(persistedIds)
		localDrawings.value = localDrawings.value.filter((drawing) => !erasedIds.has(drawing.id))
		drawingRetryIds.value = drawingRetryIds.value.filter((id) => !erasedIds.has(id))
		if (selectedMapObjectId.value && erasedIds.has(selectedMapObjectId.value)) {
			selectedMapObjectId.value = null
		}
	} catch (cause) {
		console.error('Map drawings could not be deleted.', cause)
		itineraryActionError.value = '지우개 경로의 오브젝트를 모두 삭제하지 못했습니다. 최신 상태를 다시 불러왔습니다.'
		await loadItinerary()
	} finally {
		acquiredIds.forEach(releaseMapObjectLease)
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
let routeUtilityCollapsedBeforeDetail: boolean | null = null

function openDetailbar() {
  if (!isDetailbarOpen.value) {
    routeUtilityCollapsedBeforeDetail = isRouteUtilityCollapsed.value
  }
  isDetailbarOpen.value = true
  isRouteUtilityCollapsed.value = false
  if (isRouteOverlayLayout.value) isLeftSidebarOpen.value = false
}

function updateMapOrientation({ pitch, bearing }: { pitch: number; bearing: number }) {
  mapIsTilted.value = Math.abs(pitch) > 0.5 || Math.abs(bearing) > 0.5
  if (!mapIsTilted.value) standardMapView.value = false
}

function selectItineraryDay(day: number) {
  if (day === 0 && activeDay.value !== 0) {
    itineraryMapRef.value?.preserveCameraOnNextStopsChange()
  }
  activeDay.value = day
}

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
const selectedPlaceReaction = ref<SwipeAction | null>(null)
const placeReactionSubmitting = ref(false)
const placeReactionAnimating = ref<SwipeAction | null>(null)
let placeReactionRequest = 0
let placeReactionAnimationTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => selectedPlace.value?.place,
  async (place) => {
    const request = ++placeReactionRequest
    selectedPlaceReaction.value = null
    descriptionExpanded.value = false
    if (!place) return
    try {
      const reaction = await swipeApi.getReaction(place.provider, place.externalPlaceId)
      if (request === placeReactionRequest) selectedPlaceReaction.value = reaction
    } catch {
      // 반응 조회 실패는 상세 정보 표시를 막지 않는다.
    }
  },
)
const detailbarMainImg = ref('')
const descriptionExpanded = ref(false)
const DESCRIPTION_PREVIEW_LENGTH = 140
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
  openDetailbar()
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

  openDetailbar()
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
  openDetailbar()
}

function closeDetailbar() {
  isDetailbarOpen.value = false
  selectedPlace.value = null
  selectedRecommendationMapPlace.value = null
  descriptionExpanded.value = false
  if (routeUtilityCollapsedBeforeDetail != null) {
    isRouteUtilityCollapsed.value = routeUtilityCollapsedBeforeDetail
    routeUtilityCollapsedBeforeDetail = null
  }
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

function reactionLabel(reaction: SwipeAction) {
  if (reaction === 'SUPER_LIKE') return '슈퍼라이크'
  if (reaction === 'LIKE') return '좋아요'
  return '싫어요'
}

async function reactToSelectedPlace(reaction: SwipeAction) {
  const place = selectedPlace.value?.place
  if (!place || placeReactionSubmitting.value) return
  const key = placeReferenceKey(place)
  const previousReaction = selectedPlaceReaction.value
  const wasSaved = savedPlaceKeys.value.has(key)
  const isRemoving = previousReaction === reaction
  placeReactionSubmitting.value = true
  placeReactionAnimating.value = reaction
  if (placeReactionAnimationTimer) clearTimeout(placeReactionAnimationTimer)
  placeReactionAnimationTimer = setTimeout(() => {
    placeReactionAnimating.value = null
    placeReactionAnimationTimer = null
  }, 420)

  if (!isRemoving) selectedPlaceReaction.value = reaction
  try {
    if (isRemoving) {
      await swipeApi.removeReaction(place.provider, place.externalPlaceId)
      if (reaction === 'SUPER_LIKE') {
        const next = new Set(savedPlaceKeys.value)
        next.delete(key)
        savedPlaceKeys.value = next
      }
      selectedPlaceReaction.value = null
      showToast(`${reactionLabel(reaction)}를 제거했습니다.`, 'success')
      return
    }

    await swipeApi.react(place.provider, place.externalPlaceId, reaction)
    if (reaction === 'SUPER_LIKE') {
      if (!wasSaved) await swipeApi.savePlace(place.provider, place.externalPlaceId)
      savedPlaceKeys.value = new Set(savedPlaceKeys.value).add(key)
      showToast('슈퍼라이크로 저장했습니다.', 'success')
    } else {
      if (wasSaved) await swipeApi.unsavePlace(place.provider, place.externalPlaceId)
      const next = new Set(savedPlaceKeys.value)
      next.delete(key)
      savedPlaceKeys.value = next
      showToast(`${reactionLabel(reaction)}로 저장했습니다.`, 'success')
    }
  } catch {
    selectedPlaceReaction.value = previousReaction
    showToast('장소 반응을 변경하지 못했습니다.', 'error')
  } finally {
    placeReactionSubmitting.value = false
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

          <div class="trip-map-actions" data-tour-section="trip-management" aria-label="여행방 관리">
                  <div class="avatars-group">
                    <div class="avatars">
                      <span
                        v-for="m in mapPresenceMembers.slice(0, 4)"
                        :key="m.userId"
                        tabindex="0"
                        :aria-label="`${m.displayName || '멤버'} · ${m.online ? '접속 중' : '오프라인'}`"
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
                    <span
                      v-if="hiddenMapPresenceMembers.length"
                      class="members-count members-count-with-tooltip"
                      tabindex="0"
                      :aria-label="`추가 멤버 ${hiddenMapPresenceMembers.length}명. 접속 상태 확인`"
                    >
                      +{{ hiddenMapPresenceMembers.length }}
                      <span class="members-count-tooltip" role="tooltip">
                        <strong>추가 멤버</strong>
                        <span
                          v-for="member in hiddenMapPresenceMembers"
                          :key="member.userId"
                          class="members-count-tooltip__member"
                        >
                          <span :class="['members-count-tooltip__dot', { 'is-online': member.online }]" aria-hidden="true"></span>
                          <span data-no-translate>{{ member.displayName || '멤버' }}</span>
                          <span class="members-count-tooltip__status">{{ member.online ? '접속 중' : '오프라인' }}</span>
                        </span>
                      </span>
                    </span>
                  </div>
            <div class="trip-map-buttons">
            <button class="map-tour-help-button" type="button" aria-label="지도 화면 안내 다시 보기" title="화면 안내" @click="mapSectionTour?.start()">
              <span class="material-symbols-rounded" aria-hidden="true">help</span>
            </button>
            <MapTasteControl ref="tasteControl" :trip-id="tripId" :bbox="placeDiscoveryBbox" :user-id="currentUserId" @places="tastePlaces = $event" @select="selectDiscoveredPlace" />
            <button
              type="button"
              :class="['nearby-toggle', { active: nearbyOn }]"
              :aria-pressed="nearbyOn"
              :disabled="itinerary.mutating.value"
              @click="nearbyOn = !nearbyOn"
            >
              <span class="material-symbols-rounded" aria-hidden="true">travel_explore</span>
              주변 여행지
            </button>
            <div v-if="showVoteAction" class="trip-vote-control">
              <button
                type="button"
                :class="['trip-vote-button', { 'trip-vote-button--alert': votePending }]"
                :aria-describedby="votePending && !voteModalOpen && !voteHintDismissed ? 'vote-pending-card' : undefined"
                @click="goTripVote"
              >
                <span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span>
                <span>{{ voteActionLabel }}</span>
              </button>
              <button v-if="votePending && !voteModalOpen && !voteHintDismissed" id="vote-pending-card" class="vote-pending-card" data-testid="vote-pending-card" type="button" aria-label="투표가 진행 중이에요, 안내 닫기" @click="voteHintDismissed = true">
                <strong>투표가 진행 중이에요</strong>
              </button>
            </div>
            <div class="map-theme-control" @keydown.esc.stop.prevent="closeMapTheme" @focusout="onMapThemeFocusOut">
              <button ref="mapThemeButton" type="button" class="map-theme-button" :aria-expanded="mapThemeOpen" aria-controls="map-theme-options" @click="mapThemeOpen = !mapThemeOpen">
                <span class="material-symbols-rounded" aria-hidden="true">palette</span><span>테마</span>
              </button>
              <div v-if="mapThemeOpen" id="map-theme-options" class="map-theme-popover">
                <fieldset>
                  <legend>테마</legend>
                  <label v-for="theme in MAP_THEMES" :key="theme.value" :class="{ selected: mapTheme === theme.value }" @pointerdown.prevent @click.prevent="selectMapTheme(theme.value)">
                    <span class="map-theme-swatch" :style="{ background: theme.color }" aria-hidden="true"></span>
                    <span>{{ theme.label }}</span>
                    <input type="radio" name="map-theme" :value="theme.value" :checked="mapTheme === theme.value" @change="selectMapTheme(theme.value)" />
                  </label>
                </fieldset>
              </div>
            </div>
            <TripSettingsButton label="관리" variant="chip" @click="() => openTripManagement()" />
            </div>
          </div>
          <a v-if="!isLeftSidebarOpen" href="/my-trips" class="route-back-link" aria-label="내 여행으로 돌아가기" @click.prevent="router.push('/my-trips')"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>내 여행</a>
          <!-- ═══ SIDEBAR ═══ -->
          <aside id="route-itinerary-sidebar" data-tour-section="itinerary" :class="['sidebar', { 'is-hidden': !isLeftSidebarOpen }]" aria-label="여행 일정">
            <span class="sidebar-sheet-handle" aria-hidden="true"></span>
            <button
              class="sidebar-toggle"
              type="button"
              aria-label="일정 패널 닫기"
              aria-controls="route-itinerary-sidebar"
              aria-expanded="true"
              title="일정 패널 닫기"
              @click="toggleLeftSidebar"
            >
              <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
            </button>
            <div class="sidebar-content">
              <div class="trip-sidebar-summary">
                <a v-show="!isSearchPanelOpen" href="/my-trips" class="trip-sidebar-back" @click.prevent="router.push('/my-trips')"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>내 여행</a>
                <h1 data-no-translate class="trip-sidebar-title" :title="trip.title">{{ trip.title }}</h1>
                <div class="trip-sidebar-meta">
                  <div v-if="trip.destinationName" class="trip-sidebar-meta__row">
                    <span class="material-symbols-rounded" aria-hidden="true">location_on</span>
                    <span>{{ trip.destinationName }}</span>
                  </div>
                  <div v-if="trip.dateRangeText || trip.durationText" class="trip-sidebar-meta__row">
                    <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
                    <span>{{ trip.dateRangeText }}<template v-if="trip.dateRangeText && trip.durationText"> · </template>{{ trip.durationText }}</span>
                  </div>
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
                  <button :class="['day-tab', { active: activeDay === 0 }]" type="button" @click="selectItineraryDay(0)">
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
                      <span class="day-stop-count">{{ formatUiText("{0}곳", "{0} places", [day.items.length]) }}</span>
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
                          draggable="false"
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
                      <div v-if="idx < day.items.length - 1 && hasVisibleRouteConnectorBetween(item.id, day.items[idx + 1].id)"
                        :class="['route-connector', getDayColorClass(day.day)]"
                        role="button" tabindex="0"
                        @keydown.enter.prevent="removeRouteLinkBetween(item.id, day.items[idx + 1].id)"
                        @keydown.space.prevent="removeRouteLinkBetween(item.id, day.items[idx + 1].id)"
                        :data-from-id="item.id"
                        :data-to-id="day.items[idx + 1].id"
                        @click.stop="removeRouteLinkBetween(item.id, day.items[idx + 1].id)"
                        :title="'경로 연결 해제: ' + item.title + ' → ' + day.items[idx + 1].title">
                        <span class="route-mode-badge" :data-mode="routeForDisplayBetween(item.id, day.items[idx + 1].id)?.mode ?? 'WALKING'">
                          <span class="material-symbols-rounded" aria-hidden="true">{{ routeModeMeta(routeForDisplayBetween(item.id, day.items[idx + 1].id)?.mode).icon }}</span>
                          {{ routeModeMeta(routeForDisplayBetween(item.id, day.items[idx + 1].id)?.mode).shortLabel }}
                        </span>
                        <span class="route-unlink-label">연결 해제</span>
                        <span class="material-symbols-rounded route-unlink-icon" aria-hidden="true">link_off</span>
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
                    <span class="day-stop-count">{{ formatUiText("{0}곳", "{0} places", [activePlan.items.length]) }}</span>
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
                          draggable="false"
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
                    <div v-if="idx < activePlan.items.length - 1 && hasVisibleRouteConnectorBetween(item.id, activePlan.items[idx + 1].id)"
                      :class="['route-connector', getDayColorClass(activeDay)]"
                      role="button" tabindex="0"
                      @keydown.enter.prevent="removeRouteLinkBetween(item.id, activePlan.items[idx + 1].id)"
                      @keydown.space.prevent="removeRouteLinkBetween(item.id, activePlan.items[idx + 1].id)"
                      :data-from-id="item.id"
                      :data-to-id="activePlan.items[idx + 1].id"
                      @click.stop="removeRouteLinkBetween(item.id, activePlan.items[idx + 1].id)"
                      :title="'경로 연결 해제'">
                      <span class="route-mode-badge" :data-mode="routeForDisplayBetween(item.id, activePlan.items[idx + 1].id)?.mode ?? 'WALKING'">
                        <span class="material-symbols-rounded" aria-hidden="true">{{ routeModeMeta(routeForDisplayBetween(item.id, activePlan.items[idx + 1].id)?.mode).icon }}</span>
                        {{ routeModeMeta(routeForDisplayBetween(item.id, activePlan.items[idx + 1].id)?.mode).shortLabel }}
                      </span>
                      <span class="route-unlink-label">연결 해제</span>
                        <span class="material-symbols-rounded route-unlink-icon" aria-hidden="true">link_off</span>
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

                <Transition name="custom-form-slide">
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
                </Transition>

                <button v-if="!isSearchPanelOpen" class="add-stop-dashed" type="button" :disabled="dayPlans.length === 0 || itinerary.mutating.value" @click="openSearchPanel">
                  <span class="material-symbols-rounded">add_circle</span>
                  <span>일정 추가</span>
                </button>
                <button v-else :class="['add-stop-dashed', 'search-panel-custom-trigger', { 'is-close': showCustomForm }]" :aria-expanded="showCustomForm" type="button" @click="showCustomForm = !showCustomForm">
                  <span class="material-symbols-rounded" aria-hidden="true">edit_note</span>
                  <span>{{ showCustomForm ? '커스텀 일정 입력 닫기' : '커스텀 일정 추가' }}</span>
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
                <button class="icon-btn" id="search-panel-back" type="button" aria-label="일정으로 돌아가기" @click="closeSearchPanel">
                  <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span><span>일정으로</span>
                </button>

              </div>
              <div class="search-panel-body">
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
          <div ref="mapCanvasRef" data-tour-section="map" :class="['map-canvas', { 'navigation-guide-mode': navigationGuideMode }]" :aria-label="`${trip.title} 지도`">
			<button
				v-if="!isLeftSidebarOpen"
				class="route-sidebar-restore"
				type="button"
				aria-label="일정 패널 열기"
				aria-controls="route-itinerary-sidebar"
				aria-expanded="false"
				title="일정 패널 열기"
				@click="toggleLeftSidebar"
			>
				<span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
			</button>
			<button
				v-if="isRouteUtilityCollapsed"
				class="route-utility-restore"
				type="button"
				aria-label="우측 패널 열기"
				aria-controls="route-utility-sidebar"
				aria-expanded="false"
				title="우측 패널 열기"
				@click="toggleRouteUtilityCollapsed"
			>
				<span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
			</button>
			<MapboxItineraryMap
				ref="itineraryMapRef"
				:stops="mapStops"
				:routes="visibleMapRoutes"
				:route-display="routeState"
              :card-display="cardState"
              :nearby-places="routeNearbyMapPlaces"
              :taste-places="tastePlaces"
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
              :map-theme="mapTheme"
              @select-place="handleSelectPlace"
              @select-nearby-place="selectNearbyMapPlace"
              @viewport-change="mapViewport.updateViewport"
              @orientation-change="updateMapOrientation"
              @map-drag-start="closeTasteControl"
              @drawing-create="handleDrawingCreate"
              @drawing-erase="eraseLocalDrawings"
              @drawing-preview="publishDrawingPreview"
              @route-point="addRouteWaypoint"
              @map-object-place="handleMapObjectPlace"
              @map-object-select="selectedMapObjectId = $event"
              @map-object-edit-start="beginMapObjectEdit"
              @map-object-edit-end="cancelMapObjectEdit"
              @map-object-preview="previewMapObjectChange"
              @map-object-change="changeMapObject"
              @cursor-move="publishMapCursor"
              @cursor-leave="clearLocalMapCursor"
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
                <img :src="stickerHref(sticker.code) ?? undefined" alt="" aria-hidden="true">
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
              <span>그림 저장을 완료하지 못했습니다.</span>
              <button
                type="button"
                aria-label="그림 저장 다시 시도"
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

            <!-- ===== Route mode popover ===== -->
            <div
              v-if="activeTool === 'route-pen'"
              ref="routeModePopoverRef"
              id="route-mode-popover"
              class="tool-popover route-mode-popover is-open"
              role="dialog"
              aria-label="경로 이동수단 선택"
              :style="routeModePopoverStyle"
            >
              <div class="popover-section">
                <div class="route-mode-options" role="group" aria-label="새 경로 이동수단">
                  <button
                    v-for="option in routeModeOptions"
                    :key="option.value"
                    type="button"
                    :class="{ active: selectedRouteMode === option.value }"
                    :aria-pressed="selectedRouteMode === option.value"
                    :aria-label="option.label"
                    :title="option.label"
                    :disabled="itinerary.mutating.value"
                    @click="selectedRouteMode = option.value"
                  >
                    <span class="material-symbols-rounded" aria-hidden="true">{{ option.icon }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- ===== Toolbox ===== -->
            <div class="map-tools-viewport" data-tour-section="map-tools" @scroll.passive="updateToolPopoverPositions">
              <div class="map-tools">
              <!-- Drawing tools -->
              <button :class="['tool-btn', { active: activeTool === 'cursor' }]" type="button" data-tool="cursor" :aria-pressed="activeTool === 'cursor'" :disabled="itinerary.mutating.value" @click="selectMapTool('cursor')">
                <span class="material-symbols-rounded">near_me</span>
                <span class="tool-tip">기본 선택</span>
              </button>
              <button ref="routeToolButtonRef" :class="['tool-btn', { active: activeTool === 'route-pen' }]" type="button" data-tool="route-pen" :aria-controls="activeTool === 'route-pen' ? 'route-mode-popover' : undefined" :aria-expanded="activeTool === 'route-pen'" :aria-pressed="activeTool === 'route-pen'" :disabled="itinerary.mutating.value" @click="selectMapTool('route-pen')">
                <span class="material-symbols-rounded">route</span>
                <span class="tool-tip">경로 연결 펜</span>
              </button>
              <button ref="penToolButtonRef" :class="['tool-btn', { active: activeTool === 'pen' }]" type="button" id="pen-btn" data-tool="pen" aria-controls="pen-popover" :aria-expanded="isPenPopoverOpen" :aria-pressed="activeTool === 'pen'" :disabled="itinerary.mutating.value" @click="selectMapTool('pen')">
                <span class="material-symbols-rounded">draw</span>
                <span class="tool-tip">자유 그리기</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'eraser' }]" type="button" data-tool="eraser" :aria-pressed="activeTool === 'eraser'" :disabled="itinerary.mutating.value" @click="selectMapTool('eraser')">
                <span class="material-symbols-rounded">ink_eraser</span>
                <span class="tool-tip">그림 지우개</span>
              </button>
              <button ref="stickerToolButtonRef" :class="['tool-btn', { active: activeTool === 'sticker' }]" type="button" data-tool="sticker" aria-controls="sticker-popover" :aria-expanded="activeTool === 'sticker'" :aria-pressed="activeTool === 'sticker'" :disabled="itinerary.mutating.value" @click="selectMapTool('sticker')">
                <span class="material-symbols-rounded">add_reaction</span>
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
                <span class="material-symbols-rounded icon-route">timeline</span>
                <span class="material-symbols-rounded icon-hidden">visibility_off</span>
                <span class="tool-tip">{{ routeState === 'route' ? '경로 표시: 실선' : '경로 표시: 숨김' }}</span>
              </button>
              <button class="tool-btn" :class="cardState !== 'hidden' ? 'is-on' : 'is-off'" type="button"
                id="card-state-toggle" :disabled="itinerary.mutating.value"
                :data-card-state="cardState"
                :aria-pressed="cardState !== 'hidden'"
                @click="toggleCardState">
                <span class="material-symbols-rounded icon-full">tooltip</span>
                <span class="material-symbols-rounded icon-min">location_on</span>
                <span class="material-symbols-rounded icon-hidden-card">visibility_off</span>
                <span class="tool-tip">{{ cardState === 'full' ? '여행지 카드: 전체 보기' : cardState === 'min' ? '여행지 카드: 최소화 (핀)' : '여행지 카드: 숨김' }}</span>
              </button>
              <button :class="['tool-btn', drawingOn ? 'is-on' : 'is-off']" type="button"
                data-toggle="drawing" :disabled="itinerary.mutating.value"
                :aria-pressed="drawingOn"
                @click="drawingOn = !drawingOn">
                <span class="material-symbols-rounded">visibility</span>
                <span class="tool-tip">지도 그림 표시</span>
              </button>
              <button :class="['tool-btn', mapIsTilted ? 'is-on' : 'is-off']" type="button"
                data-toggle="standard-view" :disabled="itinerary.mutating.value"
                :aria-pressed="mapIsTilted"
                :aria-label="mapIsTilted ? '지도 틸트 초기화' : '3D 보기'"
                @click="toggleStandardMapView">
                <span class="material-symbols-rounded">{{ mapIsTilted ? 'restart_alt' : 'terrain' }}</span>
                <span class="tool-tip">{{ mapIsTilted ? '지도 틸트 초기화' : '3D 보기' }}</span>
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
          </div>

          <!-- detailbar -->
          <aside :class="['detailbar', { 'is-hidden': !isDetailbarOpen }]" ref="detailbarRef">
            <button class="icon-btn detailbar-close" type="button" aria-label="관광지 상세 닫기" @click="closeDetailbar">
              <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
              <span class="detailbar-close-label">뒤로가기</span>
            </button>
            <div class="detailbar-scroll" v-if="selectedPlace">
              <!-- Header -->
              <div class="detailbar-header-info" style="padding-bottom: 0px; padding-top: 0px;">
                <h2 data-no-translate class="detailbar-main-title">{{ selectedPlace.title }}</h2>
                <div v-if="selectedPlace.location" class="detailbar-address-row">
                  <span class="material-symbols-rounded">location_on</span>
                  <span data-no-translate>{{ selectedPlace.location }}</span>
                </div>
              </div>

              <!-- Description -->
              <div class="detailbar-desc-section">
                <h3 class="detailbar-section-title">장소 소개</h3>
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
              </div>

              <!-- Gallery -->
              <div class="detailbar-gallery" v-if="selectedPlace.image" style="margin-bottom: 0px;">
                <h3 class="detailbar-section-title">사진</h3>
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
                  <template v-for="(u, idx) in selectedPlace.likedBy.slice(0, 5)" :key="idx">
                    <img v-if="u.avatar && u.avatar.startsWith('http')" :src="u.avatar" class="detailbar-like-avatar" :style="{ zIndex: avatarStackZIndex(idx) }" :alt="u.name || ''">
                    <span v-else-if="u.avatar" class="detailbar-like-avatar-text"
                      :style="textAvatarStyle(idx)">{{ u.avatar }}</span>
                  </template>
                </div>
                <span class="detailbar-likes-text">
                  <template v-if="selectedPlace.likedBy.length > 1"><strong>{{ formatUiText("{0}명", "{0} people", [selectedPlace.likedBy.length]) }}</strong>이 저장한 장소</template>
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
            <div v-if="selectedPlace?.place" class="detailbar-action-row">
              <div class="detailbar-reaction-row" :class="{ 'has-active-reaction': selectedPlaceReaction }">
                <button
                  v-if="!selectedPlaceReaction || selectedPlaceReaction === 'SUPER_LIKE'"
                  type="button"
                  class="detailbar-save-place-btn"
                  :class="{
                    'is-saved': selectedPlaceReaction === 'SUPER_LIKE',
                    'is-animating': placeReactionAnimating === 'SUPER_LIKE',
                  }"
                  :disabled="placeReactionSubmitting"
                  :aria-pressed="selectedPlaceReaction === 'SUPER_LIKE'"
                  :aria-label="selectedPlaceReaction === 'SUPER_LIKE' ? '슈퍼라이크 제거하기' : '슈퍼라이크'"
                  @click="reactToSelectedPlace('SUPER_LIKE')"
                >
                  <span class="detailbar-reaction-label detailbar-reaction-label--default">
                    <span class="material-symbols-rounded">{{ selectedPlaceReaction === 'SUPER_LIKE' ? 'stars' : 'star_border' }}</span>
                    슈퍼라이크
                  </span>
                  <span v-if="selectedPlaceReaction === 'SUPER_LIKE'" class="detailbar-reaction-label detailbar-reaction-label--remove">
                    <span class="material-symbols-rounded">delete</span>
                    슈퍼라이크 제거하기
                  </span>
                </button>
                <button
                  v-if="!selectedPlaceReaction || selectedPlaceReaction === 'LIKE'"
                  type="button"
                  class="detailbar-like-place-btn"
                  :class="{
                    'is-liked': selectedPlaceReaction === 'LIKE',
                    'is-animating': placeReactionAnimating === 'LIKE',
                  }"
                  :disabled="placeReactionSubmitting"
                  :aria-pressed="selectedPlaceReaction === 'LIKE'"
                  :aria-label="selectedPlaceReaction === 'LIKE' ? '좋아요 제거하기' : '좋아요'"
                  @click="reactToSelectedPlace('LIKE')"
                >
                  <span class="detailbar-reaction-label detailbar-reaction-label--default">
                    <span class="material-symbols-rounded">{{ selectedPlaceReaction === 'LIKE' ? 'favorite' : 'favorite_border' }}</span>
                    좋아요
                  </span>
                  <span v-if="selectedPlaceReaction === 'LIKE'" class="detailbar-reaction-label detailbar-reaction-label--remove">
                    <span class="material-symbols-rounded">heart_minus</span>
                    좋아요 제거하기
                  </span>
                </button>
                <button
                  v-if="!selectedPlaceReaction || selectedPlaceReaction === 'NOPE'"
                  type="button"
                  class="detailbar-dislike-place-btn"
                  :class="{
                    'is-disliked': selectedPlaceReaction === 'NOPE',
                    'is-animating': placeReactionAnimating === 'NOPE',
                  }"
                  :disabled="placeReactionSubmitting"
                  :aria-pressed="selectedPlaceReaction === 'NOPE'"
                  :aria-label="selectedPlaceReaction === 'NOPE' ? '싫어요 제거하기' : '싫어요'"
                  @click="reactToSelectedPlace('NOPE')"
                >
                  <span class="detailbar-reaction-label detailbar-reaction-label--default">
                    <span class="material-symbols-rounded">{{ selectedPlaceReaction === 'NOPE' ? 'thumb_down' : 'thumb_down_off_alt' }}</span>
                    싫어요
                  </span>
                  <span v-if="selectedPlaceReaction === 'NOPE'" class="detailbar-reaction-label detailbar-reaction-label--remove">
                    <span class="material-symbols-rounded">delete</span>
                    싫어요 제거하기
                  </span>
                </button>
              </div>
              <button
                type="button"
                class="detailbar-add-plan-btn"
                :class="{ 'is-scheduled': selectedPlaceIsScheduled }"
                :disabled="itinerary.mutating.value"
                :aria-label="selectedPlaceIsScheduled ? '일정에서 삭제' : '일정에 추가'"
                @click="toggleSelectedPlaceItinerary"
              >
                <template v-if="selectedPlaceIsScheduled">
                  <span class="detailbar-schedule-label detailbar-schedule-label--default">
                    <span class="material-symbols-rounded">task_alt</span>
                    일정에 있음
                  </span>
                  <span class="detailbar-schedule-label detailbar-schedule-label--remove">
                    <span class="material-symbols-rounded">delete</span>
                    일정에서 제거하기
                  </span>
                </template>
                <span v-else class="detailbar-schedule-label">
                  <span class="material-symbols-rounded">add_circle</span>
                  일정에 추가
                </span>
              </button>
            </div>
          </aside>

          <!-- ═══ ROUTE UTILITY SIDEBAR ═══ -->
          <aside id="route-utility-sidebar" data-tour-section="collaboration" :class="['route-utility-sidebar', `route-utility-sidebar--${activeRoutePanel}`, { 'is-collapsed': isRouteUtilityCollapsed }]" aria-label="여행 협업 도구" :aria-hidden="isRouteUtilityCollapsed || isDetailbarOpen" :inert="isDetailbarOpen">
            <button
              class="route-utility-toggle"
              type="button"
              aria-controls="route-utility-sidebar"
              :aria-expanded="!isRouteUtilityCollapsed"
              :aria-label="isRouteUtilityCollapsed ? '우측 패널 열기' : '우측 패널 닫기'"
              :title="isRouteUtilityCollapsed ? '우측 패널 열기' : '우측 패널 닫기'"
              @click="toggleRouteUtilityCollapsed"
            >
              <span class="material-symbols-rounded" aria-hidden="true">{{ isRouteUtilityCollapsed ? 'chevron_left' : 'chevron_right' }}</span>
            </button>
            <div class="route-utility-content">
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
            <div
              id="ai-chat-messages"
              ref="aiMessagesContainerRef"
              class="ai-chat-messages-container"
              @scroll.passive="updateConversationScrollState('ai')"
            >
              <div v-if="conversationError" class="text-sm" style="color:var(--rose);display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span>{{ conversationError }}</span>
                <button type="button" class="btn ghost" style="font-size:11px;padding:4px 8px;min-height:0;height:auto" @click="loadConversations">다시 시도</button>
              </div>
              <div v-for="msg in aiMessages" :key="msg.id" :class="['ai-message', msg.role === 'ASSISTANT' || msg.role === 'TOOL' ? 'assistant' : 'user']">
                <div v-if="msg.role === 'ASSISTANT' || msg.role === 'TOOL'" class="ai-message-avatar ai-assistant-avatar">
                  <img :src="aiProfileImage" alt="" />
                </div>
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
            <div
              id="trip-chat-messages"
              ref="tripChatMessagesContainerRef"
              class="ai-chat-messages-container"
              @scroll.passive="updateConversationScrollState('chat')"
            >
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
                :disabled="memoLoading"
                @click="switchMemoDay(tag)">{{ tag }}</button>
            </div>
            <!-- 미니 포맷 툴바 -->
            <div class="memo-toolbar">
              <button type="button" class="toolbar-btn" title="굵게" aria-label="굵게" :disabled="memoLoading" @click="formatMemo('bold')"><span class="material-symbols-rounded">format_bold</span></button>
              <button type="button" class="toolbar-btn" title="기울임" aria-label="기울임" :disabled="memoLoading" @click="formatMemo('italic')"><span class="material-symbols-rounded">format_italic</span></button>
              <button type="button" class="toolbar-btn" title="밑줄" aria-label="밑줄" :disabled="memoLoading" @click="formatMemo('underline')"><span class="material-symbols-rounded">format_underlined</span></button>
              <button type="button" class="toolbar-btn" title="취소선" aria-label="취소선" :disabled="memoLoading" @click="formatMemo('strike')"><span class="material-symbols-rounded">format_strikethrough</span></button>
              <div class="toolbar-divider"></div>
              <button type="button" class="toolbar-btn" title="글머리 기호" aria-label="글머리 기호" :disabled="memoLoading" @click="formatMemo('bullet')"><span class="material-symbols-rounded">format_list_bulleted</span></button>
              <button type="button" class="toolbar-btn" title="번호 매기기" aria-label="번호 매기기" :disabled="memoLoading" @click="formatMemo('number')"><span class="material-symbols-rounded">format_list_numbered</span></button>
            </div>
            <div class="panel-body memo-body">
              <textarea id="memo-textarea" ref="memoTextarea" placeholder="여행 계획, 팁, 예약 정보 등을 자유롭게 메모해보세요." v-model="memoTextDisplay" :disabled="memoLoading" @input="markMemoDirty"></textarea>
            </div>
            <div class="panel-footer memo-footer">
              <div class="memo-footer-left">
                <span class="memo-char-count" id="memo-char-count">{{ formatUiText("{0}자", "{0} characters", [memoTextDisplay.length]) }}</span>
                <span v-if="memoStatus" class="memo-status" role="status">{{ memoStatus }}</span>
                <button v-if="memoConflict" type="button" class="memo-reload-btn" @click="reloadLatestMemo">
                  최신 메모 불러오기
                </button>
              </div>
              <div class="memo-footer-actions">
                <button id="memo-clear-btn" class="btn text-danger-btn memo-action-btn" type="button" :disabled="memoLoading" @click="clearNote">
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
            </div>
          </aside>

          <MapSectionTour ref="mapSectionTour" :user-id="currentUserId" @prepare="prepareMapTourSection" />
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
    <!-- 여행 방 투표 모달. 흐름 전체(시작 설정·스티커·대기·결과)를 지도 위에서 처리한다. -->
    <div
      v-if="voteModalOpen"
      class="modal-overlay vote-modal-overlay show is-open"
      data-testid="vote-modal"
      @click.self="closeVoteModal"
    >
      <div class="modal-card vote-modal-card" role="dialog" aria-modal="true" aria-label="여행 방 투표">
        <button type="button" class="icon-btn vote-modal-close" aria-label="투표 창 닫기" @click="closeVoteModal">
          <span class="material-symbols-rounded">close</span>
        </button>
        <TripVoteFlow :key="notificationVoteSessionId ?? 'current'" :trip-id="tripId" :trip-days="voteTripDays" :target-session-id="notificationVoteSessionId" embedded @close="closeVoteModal" @ai-arrange="arrangeSelectedPlacesWithAi" />
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
/* 투표 안내는 해당 액션에 붙여 지도 중앙을 가리지 않는다. */
.trip-vote-control { position:relative; }
.trip-map-actions .trip-vote-button--alert { color:#296c9a; background:#e5f3ff; border-color:#9cc9e8; animation:vote-alert-pulse 2.4s ease-in-out infinite; }
.trip-map-actions .trip-vote-button--alert:hover { background:#d7edff; border-color:#78b5df; }
@keyframes vote-alert-pulse { 0%,100% { box-shadow:0 0 0 0 rgb(72 145 199 / 22%); } 65% { box-shadow:0 0 0 7px rgb(72 145 199 / 0%); } }
.vote-pending-card { position:absolute; top:calc(100% + 10px); right:0; width:max-content; padding:5px 9px; display:block; white-space:nowrap; border:1px solid #cde3f3; border-radius:9px; background:#fff; color:#607b90; text-align:left; box-shadow:0 8px 26px rgb(51 100 138 / 12%); cursor:pointer; font:inherit; font-size:12px; }
.vote-pending-card::before { content:''; position:absolute; right:26px; top:-6px; width:10px; height:10px; background:#fff; border-top:1px solid #cde3f3; border-left:1px solid #cde3f3; transform:rotate(45deg); }
.vote-pending-card strong { color:#344e65; font-size:11px; font-weight:600; line-height:1.4; }
.vote-pending-card:focus-visible { outline:2px solid #487db5; outline-offset:3px; }
@media(max-width:767px) { .vote-pending-card { right:auto; left:0; width:max-content; } .vote-pending-card::before { right:auto; left:26px; } }
@media(prefers-reduced-motion:reduce) { .trip-map-actions .trip-vote-button--alert { animation:none; } }

.vote-modal-overlay {
  align-items: center;
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  /* 지도 화면의 고정 패널·툴바(우측 탭바 포함) 위에 떠야 한다. */
  z-index: 10000;
}

.vote-modal-card {
  height: min(88vh, 860px);
  max-height: min(88vh, 860px);
  max-width: 920px;
  overflow: auto;
  padding: 12px 24px 24px;
  position: relative;
  scrollbar-width: none;
  -ms-overflow-style: none;
  width: 100%;
}

.vote-modal-card::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.vote-modal-close {
  position: absolute;
  right: 14px;
  top: 14px;
  z-index: 2;
}

/* ── 여행 카드의 투표 버튼. TripSettingsButton ghost 변형과 같은 크기·톤으로 맞춘다. ── */
.trip-vote-button {
  align-items: center;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 800;
  gap: 5px;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  transition: border-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.trip-vote-button .material-symbols-rounded {
  font-size: 16px;
}

.trip-vote-button:hover {
  border-color: rgba(0, 102, 255, 0.28);
  color: var(--violet);
  transform: translateY(-1px);
}

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
  grid-template-columns: minmax(0, 1fr);
  --detailbar-width: 440px;
  --detailbar-offset: 16px;
  --detailbar-gap: 16px;
  --route-panel-motion-duration: 260ms;
  --route-panel-motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
}
.route-utility-sidebar {
  --route-accent: #7c3aed;
  --route-accent-rgb: 124, 58, 237;
  display: flex;
  width: 380px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  border-left: 1px solid var(--line);
  background: #fff;
  box-shadow: -14px 0 32px rgba(15, 23, 42, 0.06);
  overflow: visible;
  z-index: 100;
  transform: translateX(0);
  will-change: transform;
  transition:
    transform var(--route-panel-motion-duration) var(--route-panel-motion-ease),
    opacity 180ms ease-in,
    border-radius 0.22s ease;
}

.route-page-section .detailbar {
  top: 0;
  right: 0;
  bottom: 0;
  left: auto;
  z-index: 110;
  width: 380px;
  border: 0;
  border-left: 1px solid #dfeaf5;
  border-radius: 0;
  background: #fff;
  box-shadow: -14px 0 32px rgba(15, 23, 42, 0.08);
  transform: translateX(0);
}
.route-page-section .detailbar.is-hidden {
  transform: translateX(calc(100% + 36px));
}
.route-page-section .detailbar-scroll {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 64px 16px 20px;
  background: #fff;
  border-radius: 0;
}
.route-page-section .detailbar-close {
  top: 14px;
  right: auto;
  left: 16px;
  z-index: 5;
  display: inline-flex !important;
  width: auto !important;
  min-width: 104px;
  max-width: none !important;
  height: auto !important;
  min-height: 40px;
  flex-shrink: 0;
  flex-direction: row !important;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #dfeaf5;
  border-radius: 999px;
  background: #fff;
  color: #396a9e;
  box-shadow: none;
  white-space: nowrap !important;
}
.route-page-section .detailbar-close > .material-symbols-rounded { flex: 0 0 auto; }
.route-page-section .detailbar-close:hover {
  border-color: #b7cde2;
  background: #f1f6fb;
  color: #285d91;
  box-shadow: none;
  transform: none;
}
.detailbar-close-label {
  display: inline-block;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
.route-page-section .detailbar-header-info { order: 1; padding: 0 0 12px; }
.route-page-section .detailbar-gallery { order: 2; margin: 0 0 14px !important; }
.route-page-section .detailbar-desc-section { order: 3; margin: 0 0 14px; padding: 14px; border: 1px solid #dfeaf5; border-radius: 14px; background: #f8fbfd; }
.route-page-section .detailbar-social-likes { order: 4; margin-bottom: 14px; }
.route-page-section .detailbar-info-card { order: 5; margin-bottom: 14px; padding: 14px; border: 1px solid #dfeaf5; border-radius: 14px; background: #f8fbfd; }
.route-page-section .detailbar-sec-info { order: 6; margin-bottom: 0; padding: 13px 14px; border-color: #dfeaf5; border-radius: 14px; }
.route-page-section .detailbar-main-title { margin-bottom: 6px; font-size: 20px; }
.route-page-section .detailbar-category-pill { background: #eaf4ff; color: #3579b0; }
.route-page-section .detailbar-hero-wrapper { margin-bottom: 8px; border-radius: 12px; box-shadow: none; }
.route-page-section .detailbar-hero { height: 136px !important; }
.route-page-section .detailbar-thumbs { margin: 6px 0 0; gap: 6px; }
.route-page-section .detailbar-thumb-item { width: 52px; height: 40px; margin: 0; border-radius: 7px; }
.route-page-section .detailbar-thumb-item.active { margin: 0; transform: none; }
.route-page-section .detailbar-section-title {
  margin: 0 0 10px;
  color: #38566f;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: -.01em;
}
.route-page-section .detailbar-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
.route-page-section .detailbar-info-grid .info-item { min-width: 0; padding: 9px; border: 1px solid #e2ebf3; border-radius: 10px; background: #fff; }
.route-page-section .detailbar-acc-row { flex-wrap: wrap; gap: 6px; padding-top: 10px; }
.route-page-section .detailbar-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  flex: 0 0 auto;
  margin: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #dfeaf5;
  background: #fff;
  box-shadow: 0 -10px 24px rgba(46, 92, 128, 0.08);
}
.route-page-section .detailbar-reaction-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.route-page-section .detailbar-reaction-row.has-active-reaction { grid-template-columns: minmax(0, 1fr); }
.route-page-section .detailbar-add-plan-btn,
.route-page-section .detailbar-save-place-btn,
.route-page-section .detailbar-like-place-btn,
.route-page-section .detailbar-dislike-place-btn {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  border-radius: 12px;
  box-shadow: none;
  font-size: 12px;
  white-space: nowrap;
}
.route-page-section .detailbar-like-place-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #f1c4ca;
  background: #fff7f8;
  color: #cf3f51;
  cursor: pointer;
  font-weight: 800;
}
.route-page-section .detailbar-dislike-place-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #526276;
  cursor: pointer;
  font-weight: 800;
}
.route-page-section .detailbar-save-place-btn:hover:not(:disabled),
.route-page-section .detailbar-save-place-btn.is-saved {
  border-color: rgba(255, 255, 255, .32);
  background: linear-gradient(135deg, #f59e0b 0%, #ec4899 48%, #7c3aed 100%);
  color: #fff;
  box-shadow: 0 8px 20px rgba(236, 72, 153, .24);
  transform: translateY(-1px);
}
.route-page-section .detailbar-like-place-btn:hover:not(:disabled),
.route-page-section .detailbar-like-place-btn.is-liked {
  border-color: #e94758;
  background: #e94758;
  color: #fff;
  box-shadow: 0 8px 20px rgba(233, 71, 88, .22);
  transform: translateY(-1px);
}
.route-page-section .detailbar-dislike-place-btn:hover:not(:disabled),
.route-page-section .detailbar-dislike-place-btn.is-disliked {
  border-color: #64748b;
  background: #64748b;
  color: #fff;
  box-shadow: 0 8px 20px rgba(71, 85, 105, .22);
  transform: translateY(-1px);
}
.route-page-section .detailbar-save-place-btn.is-saved:hover:not(:disabled),
.route-page-section .detailbar-like-place-btn.is-liked:hover:not(:disabled),
.route-page-section .detailbar-dislike-place-btn.is-disliked:hover:not(:disabled) {
  border-color: #c93636;
  background: #d94b4b;
  color: #fff;
  box-shadow: 0 8px 20px rgba(201, 54, 54, .24);
}
.route-page-section .detailbar-reaction-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}
.route-page-section .detailbar-reaction-label--remove { display: none; }
.route-page-section .is-saved:hover:not(:disabled) .detailbar-reaction-label--default,
.route-page-section .is-liked:hover:not(:disabled) .detailbar-reaction-label--default,
.route-page-section .is-disliked:hover:not(:disabled) .detailbar-reaction-label--default { display: none; }
.route-page-section .is-saved:hover:not(:disabled) .detailbar-reaction-label--remove,
.route-page-section .is-liked:hover:not(:disabled) .detailbar-reaction-label--remove,
.route-page-section .is-disliked:hover:not(:disabled) .detailbar-reaction-label--remove { display: inline-flex; }
.route-page-section .detailbar-save-place-btn.is-animating,
.route-page-section .detailbar-like-place-btn.is-animating,
.route-page-section .detailbar-dislike-place-btn.is-animating {
  animation: detailbar-reaction-pop .4s cubic-bezier(.2, .8, .2, 1);
}
.route-page-section .detailbar-save-place-btn:disabled,
.route-page-section .detailbar-like-place-btn:disabled,
.route-page-section .detailbar-dislike-place-btn:disabled { cursor: default; opacity: .72; }
.route-page-section .detailbar-save-place-btn.is-saved:disabled {
  border-color: rgba(255, 255, 255, .32);
  background: linear-gradient(135deg, #f59e0b 0%, #ec4899 48%, #7c3aed 100%);
  color: #fff;
}
.route-page-section .detailbar-like-place-btn.is-liked:disabled {
  border-color: #e94758;
  background: #e94758;
  color: #fff;
}
.route-page-section .detailbar-dislike-place-btn.is-disliked:disabled {
  border-color: #64748b;
  background: #64748b;
  color: #fff;
}
@keyframes detailbar-reaction-pop {
  0% { transform: scale(1); }
  40% { transform: scale(.95); }
  72% { transform: scale(1.035); }
  100% { transform: scale(1); }
}
.route-page-section .detailbar-add-plan-btn { background: #4286bd; }
.route-page-section .detailbar-add-plan-btn:hover:not(:disabled) { background: #3376ad; box-shadow: none; }
.route-page-section .detailbar-add-plan-btn.is-scheduled {
  border-color: #059669;
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  color: #fff;
  box-shadow: 0 8px 20px rgba(5, 150, 105, .22);
}
.route-page-section .detailbar-schedule-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}
.route-page-section .detailbar-schedule-label--remove { display: none; }
.route-page-section .detailbar-add-plan-btn.is-scheduled:hover:not(:disabled) {
  border-color: #c93636;
  background: #d94b4b;
  color: #fff;
  box-shadow: none;
}
.route-page-section .detailbar-add-plan-btn.is-scheduled:hover:not(:disabled) .detailbar-schedule-label--default { display: none; }
.route-page-section .detailbar-add-plan-btn.is-scheduled:hover:not(:disabled) .detailbar-schedule-label--remove { display: inline-flex; }
@media (prefers-reduced-motion: reduce) {
  .route-page-section .detailbar-save-place-btn.is-animating,
  .route-page-section .detailbar-like-place-btn.is-animating,
  .route-page-section .detailbar-dislike-place-btn.is-animating { animation: none; }
}
.route-utility-content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
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
  transform: translateX(calc(100% + 32px));
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
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
.route-utility-sidebar .memo-status {
  overflow: hidden;
  color: var(--route-accent);
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-utility-sidebar .memo-reload-btn {
  border: 0;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  text-decoration: underline;
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
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  height: 100%;
  width: 360px;
  overflow: visible;
  z-index: 100;
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
  overflow-x: clip;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.route-page-section .sidebar-content::-webkit-scrollbar { display: none; }
.route-page-section .sidebar-search-panel,
.route-page-section .search-panel-body { max-width: 100%; overflow-x: hidden; }
.route-page-section .sidebar-toggle,
.route-page-section .route-sidebar-restore,
.route-page-section .route-utility-toggle,
.route-page-section .route-utility-restore {
  position: absolute;
  top: 50%;
  z-index: 82;
  display: grid;
  width: 32px;
  height: 68px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.96);
  color: var(--ink);
  box-shadow: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  transform: translateY(-50%);
  transition: none;
}
.route-page-section .sidebar-toggle {
  right: -32px;
  border-left: 0;
  border-radius: 0 14px 14px 0;
}
.route-page-section .route-utility-toggle {
  left: -32px;
  border-right: 0;
  border-radius: 14px 0 0 14px;
}
.sidebar-sheet-handle {
  display: none;
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
  left: 0;
  border-left: 0;
  border-radius: 0 14px 14px 0;
  z-index: 32;
}
.route-utility-restore {
  right: 0;
  border-right: 0;
  border-radius: 14px 0 0 14px;
  z-index: 32;
}
.route-page-section .sidebar-toggle .material-symbols-rounded,
.route-page-section .route-sidebar-restore .material-symbols-rounded,
.route-page-section .route-utility-toggle .material-symbols-rounded,
.route-page-section .route-utility-restore .material-symbols-rounded {
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
  background: transparent;
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
  --route-map-control-right-safe: 12px;
  --route-map-tools-right-safe: 12px;
  height: 100%;
  min-height: 0;
}

.route-page-section .map-canvas :deep(.mapboxgl-ctrl-top-right) {
  top: 12px;
  right: var(--route-map-control-right-safe);
  transition: right 0.22s ease;
}

.map-tools-viewport {
  position: absolute;
  right: var(--route-map-tools-right-safe);
  bottom: 20px;
  left: 12px;
  z-index: 90;
  height: 102px;
  box-sizing: border-box;
  padding-top: 48px;
  overflow-x: auto;
  overflow-y: hidden;
  pointer-events: none;
  scrollbar-width: none;
  overscroll-behavior-inline: contain;
  transition: right 0.22s ease, opacity 0.18s ease;
}

.map-tools-viewport::-webkit-scrollbar {
  display: none;
}

.route-page-section .map-tools-viewport .map-tools {
  position: relative;
  right: auto;
  bottom: auto;
  left: auto;
  width: max-content;
  min-width: max-content;
  margin: 0 auto;
  pointer-events: auto;
  transform: none;
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
  bottom: 134px;
  transform: translateX(-50%);
  z-index: 92;
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
  bottom: 134px;
  color: #be123c;
  display: flex;
  font-size: 12px;
  gap: 6px;
  left: 50%;
  max-width: calc(100% - 32px);
  padding: 7px 10px;
  position: absolute;
  transform: translateX(-50%);
  z-index: 92;
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
  margin-left:0;
  min-height:40px;
  padding:6px 12px;
  border:1px solid #cfe2f3;
  border-radius:12px;
  background:#eaf4ff;
  color:#3579b0;
  font-weight:700;
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
  position:relative;
  overflow:hidden;
  padding:18px 16px 16px;
  background:linear-gradient(180deg, #f8fbff 0%, #fff 100%);
  border:1px solid #a9c9e3;
  border-radius:16px;
  margin-bottom:12px;
  box-shadow:0 12px 30px rgba(48, 108, 158, 0.18);
}
.custom-schedule-form::before {
  content:"";
  position:absolute;
  inset:0 0 auto;
  height:4px;
  background:linear-gradient(90deg, #4286bd, #70b5e8);
}
.custom-form-field { margin-bottom:12px; }
.custom-form-row { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px; }
.custom-form-slide-enter-active,
.custom-form-slide-leave-active {
  transition:opacity .24s ease, transform .28s cubic-bezier(.2,.8,.2,1);
  transform-origin:bottom center;
  will-change:opacity,transform;
}
.custom-form-slide-enter-from,
.custom-form-slide-leave-to {
  opacity:0;
  transform:translateY(18px) scale(.98);
}

@media (prefers-reduced-motion: reduce) {
  .custom-form-slide-enter-active,
  .custom-form-slide-leave-active { transition:none; }
}

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
  position:fixed;bottom:134px;left:50vw;transform:translateX(-50%);
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
.day-color-6 {
  --day-color: #8b5cf6;
  --day-color-bg: rgba(139, 92, 246, 0.08);
  --day-color-border: rgba(139, 92, 246, 0.22);
}
.day-color-7 {
  --day-color: #06b6d4;
  --day-color-bg: rgba(6, 182, 212, 0.08);
  --day-color-border: rgba(6, 182, 212, 0.22);
}
.day-color-8 {
  --day-color: #84cc16;
  --day-color-bg: rgba(132, 204, 22, 0.08);
  --day-color-border: rgba(132, 204, 22, 0.22);
}
.day-color-9 {
  --day-color: #f59e0b;
  --day-color-bg: rgba(245, 158, 11, 0.08);
  --day-color-border: rgba(245, 158, 11, 0.22);
}
.day-color-10 {
  --day-color: #64748b;
  --day-color-bg: rgba(100, 116, 139, 0.08);
  --day-color-border: rgba(100, 116, 139, 0.22);
}

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
.route-mode-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 52px;
  justify-content: center;
  padding: 3px 6px;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: opacity 0.2s;
  white-space: nowrap;
}
.route-mode-badge[data-mode="CYCLING"] {
  border-color: rgba(5, 150, 105, 0.28);
  background: #ecfdf5;
  color: #059669;
}
.route-mode-badge[data-mode="DRIVING"] {
  border-color: rgba(234, 88, 12, 0.3);
  background: #fff7ed;
  color: #ea580c;
}
.route-mode-badge .material-symbols-rounded {
  font-size: 13px;
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
  z-index: 3;
}
.route-connector:hover .route-unlink-icon {
  opacity: 1;
}
.route-connector:hover .route-mode-badge {
  opacity: 0;
}

.route-mode-popover {
  width: auto;
  min-width: 154px;
}
.route-mode-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.route-mode-options button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 38px;
  padding: 0;
  border: 1px solid #dbe4ef;
  border-radius: 10px;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.route-mode-options button.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}
.route-mode-options button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.route-mode-options .material-symbols-rounded {
  font-size: 20px;
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

.map-sticker-option img {
  width: 31px;
  height: 31px;
  object-fit: contain;
}

@media (max-width: 760px) {
  .vote-modal-overlay { padding: 12px; }
  .vote-modal-card { height: calc(100dvh - 24px); max-height: calc(100dvh - 24px); padding: 10px 14px 18px; }
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
  .route-page-section .route-utility-sidebar {
    width: min(380px, calc(100% - 24px));
  }

  .route-page-section .map-shell:not(.is-route-utility-collapsed) .map-canvas {
    --route-map-control-right-safe: 340px;
  }

  .route-page-section .map-tools .tool-btn {
    flex: 0 0 40px;
  }

  .route-page-section .detailbar {
    width: min(380px, calc(100% - 64px));
  }
}

@media (max-width: 1023px) {
  .route-page-section .map-shell,
  .route-page-section .map-shell.is-route-utility-collapsed,
  .route-page-section .map-shell.is-sidebar-hidden {
    grid-template-columns: minmax(0, 1fr);
  }

  .route-page-section .sidebar {
    width: min(360px, calc(100% - 64px));
    border-right: 1px solid var(--line);
    box-shadow: 18px 0 48px rgba(15, 23, 42, 0.18);
  }

  .route-page-section .sidebar.is-hidden {
    transform: translateX(calc(-100% - 24px));
  }

  .route-page-section .route-utility-sidebar,
  .route-page-section .route-utility-sidebar:not(.is-collapsed) {
    width: min(380px, calc(100% - 64px));
  }

  .route-page-section .route-utility-sidebar.is-collapsed {
    transform: translateX(calc(100% + 32px));
  }

  .route-page-section .map-canvas {
    --route-map-control-right-safe: 64px;
    --route-map-tools-right-safe: 64px;
  }

  .route-page-section .map-shell:not(.is-route-utility-collapsed) .map-canvas {
    --route-map-control-right-safe: 392px;
  }

  .route-page-section .detailbar {
    top: 0;
    right: 0;
    bottom: 0;
    left: auto;
    width: min(380px, calc(100% - 64px));
    z-index: 110;
  }

  .route-page-section .detailbar.is-hidden {
    transform: translateX(calc(100% + 36px));
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
    top: -32px;
    right: 50%;
    width: 68px;
    height: 32px;
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-bottom: 0;
    border-radius: 14px 14px 0 0;
    transform: translateX(50%);
  }

  .route-page-section .sidebar-toggle .material-symbols-rounded {
    transform: rotate(-90deg);
  }

  .sidebar-sheet-handle {
    position: absolute;
    top: 12px;
    left: 50%;
    z-index: 2;
    display: block;
    width: 44px;
    height: 4px;
    border-radius: 999px;
    background: rgba(100, 116, 139, 0.34);
    transform: translateX(-50%);
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
    transform: translateY(0);
    animation: route-utility-sheet-in var(--route-panel-motion-duration) var(--route-panel-motion-ease) both;
  }

  .route-page-section .route-utility-sidebar.is-collapsed {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: min(72dvh, calc(100% - 12px));
    transform: translateY(calc(100% + 24px));
    animation: none;
  }

  .route-page-section .route-utility-sidebar:not(.is-collapsed) .route-utility-toggle {
    top: -32px;
    left: 50%;
    width: 68px;
    height: 32px;
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-bottom: 0;
    border-radius: 14px 14px 0 0;
    transform: translateX(-50%);
  }

  .route-page-section .route-utility-sidebar:not(.is-collapsed) .route-utility-toggle .material-symbols-rounded {
    transform: rotate(90deg);
  }

  .route-page-section .route-utility-sidebar:not(.is-collapsed) .route-utility-content {
    border-radius: 24px 24px 0 0;
  }

  .route-page-section .map-canvas {
    --route-map-control-right-safe: 48px;
    --route-map-tools-right-safe: 12px;
  }

  .route-page-section .map-shell:not(.is-route-utility-collapsed) .map-canvas {
    --route-map-control-right-safe: 12px;
    --route-map-tools-right-safe: 12px;
  }

  .route-sidebar-restore {
    top: 50%;
    width: 32px;
    padding: 0;
  }

  .route-utility-restore {
    top: 50%;
    width: 32px;
    padding: 0;
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
    padding: 64px 18px 20px;
  }

  .route-page-section .map-tools-viewport {
    bottom: max(12px, env(safe-area-inset-bottom));
  }

  .route-page-section .map-tools {
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

@keyframes route-utility-sheet-in {
  from {
    transform: translateY(calc(100% + 24px));
  }
  to {
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-page-section .map-shell,
  .route-page-section .sidebar,
  .route-page-section .route-utility-sidebar {
    transition-duration: 0.01ms !important;
  }

  .route-page-section .route-utility-sidebar {
    animation-duration: 0.01ms !important;
  }
}

.trip-workspace-bar { display: flex; align-items: center; gap: 20px; padding: 12px 24px; flex: 0 0 auto; min-width: 0; border-bottom: 1px solid var(--line); background: var(--surface, #fff); color: var(--ink); z-index: 110; }
.trip-workspace-identity { min-width: 0; max-width: 32%; }
.trip-workspace-identity h1 { margin: 0; font-size: 17px; line-height: 1.5; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.trip-workspace-details { display: flex; gap: 14px; color: var(--muted); font-size: 12px; min-width: 0; flex-wrap: wrap; }
.trip-workspace-actions { margin-left: auto; display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.trip-workspace-actions .avatars-group { margin: 0; }
.trip-workspace-settings { flex-shrink: 0; }
.trip-info-toggle { display: none; }
.itinerary-panel-heading { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding-bottom: 14px; color: var(--ink); }
.itinerary-panel-heading h2 { font-size: 17px; margin: 0; }
.itinerary-panel-heading > span { color: var(--muted); font-size: 12px; }
.route-page-section .map-shell { height: 0; flex: 1 1 0; }
.route-page-section .day-tabs-container { flex-shrink: 0; }
.route-page-section .itinerary { min-height: 0; }
@media(max-width: 767px) {
 .trip-workspace-bar { padding: 10px 16px; gap: 10px; flex-wrap: wrap; }
 .trip-workspace-identity { max-width: none; flex: 1; }
 .trip-workspace-settings { margin-left: auto; }
 .trip-workspace-details, .trip-workspace-actions { display: none; }
 .trip-workspace-bar.is-expanded .trip-workspace-details { display: flex; order: 3; flex-basis: 100%; }
 .trip-workspace-bar.is-expanded .trip-workspace-actions { display: flex; order: 4; margin-left: 0; }
 .trip-info-toggle { display: inline-flex; align-items: center; gap: 4px; padding: 4px 0; border: 0; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; }
 .trip-info-toggle .material-symbols-rounded { font-size: 16px; }
}

.trip-sidebar-summary { position: relative; flex-shrink: 0; margin-bottom: 16px; }
.trip-title-toggle { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 0; min-height: 40px; border: 0; background: transparent; color: var(--ink); text-align: left; font-size: 16px; font-weight: 700; cursor: pointer; }
.trip-title-toggle > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trip-title-toggle .material-symbols-rounded { color: var(--muted); font-size: 20px; }
.trip-sidebar-details { position: absolute; top: 100%; left: 0; right: 0; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface, #fff); box-shadow: 0 12px 32px rgb(35 53 75 / 14%); z-index: 150; color: var(--muted); font-size: 12px; }
.trip-sidebar-details p { margin: 0 0 10px; }
.trip-map-actions { position: absolute; top: 12px; right: 400px; display: flex; align-items: center; gap: 8px; z-index: 60; }
.map-shell.is-route-utility-collapsed .trip-map-actions { right: 76px; }
@media(max-width:1023px) { .trip-map-actions { right: 76px; } }
@media(max-width:767px) { .trip-map-actions { top: 10px; right: 16px; } .map-shell.is-route-utility-collapsed .trip-map-actions { right: 16px; } }

/* 지도는 공통 헤더 없이 전체 화면을 사용하는 편집 작업공간이다. */
.route-page-section { top: 0 !important; }
:global(body:has(.route-page-section)) { padding-top: 0; overflow: hidden; }
.route-back-link { position: absolute; top: 12px; left: 18px; z-index: 160; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface, #fff); color: var(--ink); font-size: 12px; text-decoration: none; box-shadow: 0 3px 12px rgb(35 53 75 / 6%); }
.route-back-link .material-symbols-rounded { font-size: 18px; }
.route-page-section .sidebar-content { padding-top: 68px; }
@media(max-width:767px) { .route-page-section .sidebar-content { padding-top: 40px; } .route-back-link { left: 12px; top: 10px; } }

.trip-sidebar-title { margin: 0 0 6px; font-size: 16px; line-height: 1.5; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trip-sidebar-meta { display:grid; gap:5px; margin:0; padding-bottom:14px; border-bottom:1px solid var(--line); color:var(--muted); font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
.trip-sidebar-meta__row { display:flex; align-items:flex-start; gap:6px; min-width:0; }
.trip-sidebar-meta__row .material-symbols-rounded { flex:0 0 auto; margin-top:1px; color:#7890a3; font-size:16px; }
.trip-sidebar-meta__row > span:last-child { min-width:0; }
.trip-map-actions .avatars-group { display: flex; align-items: center; gap: 5px; margin: 0; padding: 5px 8px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface, #fff); }
.trip-map-actions .avatar { width: 28px; height: 28px; }
.trip-map-actions .avatar:focus .avatar-tooltip { opacity: 1; visibility: visible; }
.trip-map-actions .avatar-tooltip { top: calc(100% + 8px); bottom: auto; }
.trip-map-actions .avatar-tooltip::after {
  top: auto;
  bottom: 100%;
  border-color: transparent transparent var(--ink) transparent;
}
.trip-map-actions .members-count { font-size: 11px; color: var(--muted); }
.trip-map-actions .members-count-with-tooltip { position:relative; display:inline-flex; align-items:center; align-self:stretch; cursor:default; outline:none; }
.members-count-tooltip { position:absolute; top:calc(100% + 10px); right:-8px; z-index:120; display:grid; gap:7px; min-width:190px; padding:11px 12px; border:1px solid #dce7ef; border-radius:12px; background:#fff; color:#354e65; box-shadow:0 10px 28px rgb(37 76 114 / 18%); font-size:11px; line-height:1.3; pointer-events:none; opacity:0; visibility:hidden; transform:translateY(-4px); transition:opacity .15s ease,transform .15s ease,visibility .15s ease; }
.members-count-tooltip::before { content:''; position:absolute; right:14px; bottom:100%; width:9px; height:9px; border-top:1px solid #dce7ef; border-left:1px solid #dce7ef; background:#fff; transform:translateY(5px) rotate(45deg); }
.members-count-tooltip strong { font-size:11px; color:#526b80; }
.members-count-tooltip__member { display:grid; grid-template-columns:8px minmax(0,1fr) auto; align-items:center; gap:7px; white-space:nowrap; }
.members-count-tooltip__dot { width:8px; height:8px; border-radius:50%; background:#cbd5df; box-shadow:0 0 0 2px #eef2f6; }
.members-count-tooltip__dot.is-online { background:#22c55e; box-shadow:0 0 0 2px #dcfce7; }
.members-count-tooltip__status { color:#8a9bab; font-size:10px; }
.members-count-tooltip__dot.is-online ~ .members-count-tooltip__status { color:#238749; font-weight:700; }
.members-count-with-tooltip:hover .members-count-tooltip,
.members-count-with-tooltip:focus-visible .members-count-tooltip { opacity:1; visibility:visible; transform:translateY(0); }
.members-count-with-tooltip:focus-visible { border-radius:6px; box-shadow:0 0 0 2px rgb(72 143 196 / 30%); }
@media(max-width:767px) { .trip-map-actions { top: 58px; right: 12px; } .map-shell.is-route-utility-collapsed .trip-map-actions { right: 12px; } }

.trip-sidebar-back { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; margin-bottom: 8px; color: var(--muted); font-size: 12px; text-decoration: none; }
.trip-sidebar-back .material-symbols-rounded { font-size: 18px; }
.route-page-section .sidebar-content { padding-top: 16px; }
#search-panel-back { display: inline-flex; align-items: center; gap: 6px; width: auto; min-height: 40px; padding: 6px 12px; border: 1px solid #dfeaf5; border-radius: 12px; background: #fff; color: #506880; font-size: 12px; font-weight: 700; white-space: nowrap; box-shadow: 0 3px 10px rgb(52 102 145 / 7%); }
#search-panel-back:hover { border-color: #abcbe5; background: #f5faff; color: #3579b0; }
.trip-map-actions .trip-vote-button, .trip-map-actions :deep(.trip-settings-button) { min-height: 40px; padding: 0 14px; font-size: 13px; }
.trip-map-actions :deep(.trip-settings-button) { background:#fff; }
.trip-map-actions .avatar { width: 34px; height: 34px; }
.trip-map-actions .members-count { font-size: 12px; }
.trip-map-actions .avatars-group { padding: 4px 10px; }
@media(max-width:767px) { .route-page-section .sidebar-content { padding-top: 24px; } }
</style>

<style scoped src="../styles/route-sky-theme.css"></style>

<style scoped>
.trip-map-buttons { display: flex; align-items: center; gap: 8px; }
.map-tour-help-button { display:grid; place-items:center; width:40px; height:40px; padding:0; border:1px solid var(--line); border-radius:50%; background:var(--surface,#fff); color:#537089; cursor:pointer; }
.map-tour-help-button:hover { border-color:#8bbbe0; background:#f1f7fc; color:#328be0; }
.map-tour-help-button .material-symbols-rounded { font-size:20px; }
.nearby-toggle { display:flex; align-items:center; gap:6px; min-height:40px; padding:8px 14px; border:1px solid #d7e7f3; border-radius:999px; background:#fff; color:#171717; font:inherit; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; transition:background-color .16s ease,border-color .16s ease,color .16s ease,box-shadow .16s ease,transform .16s ease; }
.nearby-toggle:hover:not(:disabled) { background:#f3faf5; border-color:#add6b8; color:#287847; transform:translateY(-1px); }
.nearby-toggle.active { background:#edf8f0; border-color:#9dcfad; color:#257a43; box-shadow:0 5px 14px rgb(55 143 83 / 14%); }
.nearby-toggle.active:hover:not(:disabled) { background:#e1f3e6; border-color:#78bd8d; color:#1f693a; }
.nearby-toggle:disabled { opacity:.45; cursor:not-allowed; }
.nearby-toggle .material-symbols-rounded { font-size:18px; color:#3d965b; font-variation-settings:'FILL' 1; }
.nearby-toggle:focus-visible { outline:2px solid #488fc4; outline-offset:3px; }
.map-theme-control { position: relative; }
.map-theme-button { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface, #fff); color: var(--ink); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.map-theme-button .material-symbols-rounded { font-size: 19px; }
.map-theme-button:hover, .map-theme-button[aria-expanded="true"] { background: var(--surface-2); border-color: var(--violet); }
.map-theme-popover { position: absolute; top: calc(100% + 8px); right: 0; width: 206px; padding: 12px; background: var(--surface, #fff); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 12px 32px #20344f26; }
.map-theme-popover fieldset { padding: 0; margin: 0; border: 0; }
.map-theme-popover legend { padding: 0 6px 10px; font-size: 12px; font-weight: 700; color: var(--muted); }
.map-theme-popover label { display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-radius: 9px; cursor: pointer; font-size: 13px; }
.map-theme-popover label:hover, .map-theme-popover label.selected { background: var(--surface-2); }
.map-theme-popover input { margin-left: auto; accent-color: var(--violet); }
.map-theme-swatch { width: 24px; height: 24px; border: 1px solid #a3b6c455; border-radius: 7px; }
@media(max-width:767px) {
  .trip-map-actions { max-width: calc(100% - 24px); gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
  .trip-map-buttons { gap: 5px; }
  .nearby-toggle, .map-theme-button, .trip-map-actions .trip-vote-button, .trip-map-actions :deep(.trip-settings-button) { padding: 0 9px; }
}

/* Keep the planning surface independent of the map tiles underneath it. */
.route-page-section .sidebar,
.route-page-section .route-utility-sidebar { background: #fff; backdrop-filter: none; }
.route-page-section .sidebar-content { background: #fff; }
.route-page-section .day-separator { min-height: 42px; border-radius: 10px; gap: 8px; }
.day-stop-count { color: #647c92; font-size: 11px; white-space: nowrap; }
.route-page-section .stop { min-height: 66px; border-radius: 12px; background: #fff; border-color: #dfeaf5; box-shadow: 0 2px 6px rgb(52 102 145 / 4%); }
.route-page-section .stop:hover { transform: none; box-shadow: 0 3px 10px rgb(52 102 145 / 10%); }
.route-page-section .stop .grip-icon { color: #92a8bb; padding: 8px 3px; }
.route-page-section .stop.is-dragging, .route-page-section .day-separator.is-dragging { transform: none; transition: none; box-shadow: 0 8px 24px rgb(50 139 224 / 20%) !important; }
.route-page-section .is-chain-dragging { transition: none; }
/* Indicators must not move the target geometry while hit testing. */
.route-page-section .itinerary :is(.is-drag-over-top, .is-drag-over-bottom) { margin-top: 0 !important; margin-bottom: 0 !important; }
.route-page-section .itinerary .is-drag-over-top::before { top: -4px; height: 3px; background: #328be0; }
.route-page-section .itinerary .is-drag-over-bottom::after { bottom: -4px; height: 3px; background: #328be0; }
.route-page-section .route-connector { min-height: 30px; border-radius: 8px; }
.route-page-section .route-connector:hover, .route-page-section .route-connector:focus-visible { background: #eaf4ff; outline: 2px solid #c6dff4; }
.route-page-section .route-connector:hover .route-mode-badge { opacity: 1; }
.route-page-section .route-unlink-icon { left: auto; right: 8px; transform: translateY(-50%); opacity: 1; color: #647c92; }
.route-unlink-label { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); color: #647c92; font-size: 10px; }
.map-theme-popover label:focus-within { outline: 2px solid #328be0; outline-offset: 1px; }
.route-page-section .day-separator { background: #fff !important; }
</style>

<style scoped>
.route-page-section .add-stop-container .search-panel-custom-trigger { width:100%; margin:0; border:1px solid #4286bd; border-radius:999px; background:#4286bd; color:#fff; box-shadow:0 4px 12px #4286bd26; }
.route-page-section .add-stop-container .search-panel-custom-trigger:hover { background:#3376ad; border-color:#3376ad; }
.route-page-section .add-stop-container .search-panel-custom-trigger.is-close { background:#d94b4b; border-color:#d94b4b; box-shadow:0 4px 12px rgb(217 75 75 / 20%); }
.route-page-section .add-stop-container .search-panel-custom-trigger.is-close:hover { background:#bd3838; border-color:#bd3838; }
.route-page-section .add-stop-container > .add-stop-dashed:not(.search-panel-custom-trigger) { border-color:#9fc4e3; background:#eef6fd; color:#3579b0; box-shadow:0 3px 10px rgb(52 102 145 / 8%); }
.route-page-section .add-stop-container > .add-stop-dashed:not(.search-panel-custom-trigger):hover:not(:disabled) { border-style:solid; border-color:#6fa8d4; background:#dfeffc; color:#286b9f; box-shadow:0 5px 14px rgb(52 102 145 / 13%); }
.route-page-section .add-stop-container > .add-stop-dashed:not(.search-panel-custom-trigger):disabled { border-color:#d4e0e9; background:#f2f5f7; color:#9aa9b5; box-shadow:none; cursor:not-allowed; }
.route-page-section .search-panel-body { overflow-y:auto; padding-bottom:88px; }
#search-panel-back { border-radius:999px; border:1px solid #dfe7ee; background:#fff; color:#396a9e; box-shadow:none; min-height:40px; padding:8px 16px; }
#search-panel-back:hover { background:#f1f6fb; border-color:#b7cde2; }
</style>

<style scoped>
.trip-sidebar-back { padding:8px 16px; border:1px solid #dfe7ee; border-radius:999px; background:#fff; color:#396a9e; font-weight:600; transition:background .2s,border-color .2s; }
.trip-sidebar-back:hover { background:#f1f6fb; border-color:#b7cde2; }
.trip-sidebar-back:focus-visible { outline:2px solid #487db5; outline-offset:3px; }
</style>
