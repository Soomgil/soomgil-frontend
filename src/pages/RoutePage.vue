<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import PlaceDiscoveryPanel from '@/components/place/PlaceDiscoveryPanel.vue'
import { mockTrips } from '@/mocks/mockTrips'
import { mockPlaces } from '@/mocks/mockPlaces'
import type { Place } from '@/types/place'

/* ── RoutePage 내부 전용 타입 ── */
interface RouteStop {
  id: string
  placeExternalId: string
  title: string
  time: string
  order: number
  day: number
  memo: string
  lat: number | null
  lng: number | null
}
interface DayPlan {
  day: number
  date: string
  items: RouteStop[]
}
interface RouteLink {
  id: string
  fromItemId: string
  toItemId: string
}

/* ── Kakao Maps SDK 로더 ── */
declare global {
  interface Window {
    kakao: any
  }
}

function loadKakaoSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao && window.kakao.maps) {
      resolve()
      return
    }
    const existing = document.querySelector('script[data-kakao-maps]')
    if (existing) {
      // Already loading — poll until ready
      const poll = setInterval(() => {
        if (window.kakao && window.kakao.maps) {
          clearInterval(poll)
          resolve()
        }
      }, 100)
      // Timeout after 10s
      setTimeout(() => { clearInterval(poll); reject(new Error('Kakao SDK timeout')) }, 10000)
      return
    }
    const script = document.createElement('script')
    script.setAttribute('data-kakao-maps', 'true')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${import.meta.env.VITE_KAKAO_MAP_KEY}&autoload=false`
    script.onload = () => {
      // After script loads, give kakao.maps a moment to initialize
      setTimeout(() => resolve(), 100)
    }
    script.onerror = () => reject(new Error('Kakao Maps SDK 로드 실패'))
    document.head.appendChild(script)
  })
}

/* ── Data ── */
const trip = mockTrips[0]
const route = useRoute()
const tripId = computed(() => String(route.params.tripId))
// 드래그앤드롭으로 순서/일차 변경을 위해 reactive 배열 사용
const dayPlans = ref<DayPlan[]>([])

function buildInitialDayPlans(): DayPlan[] {
  const placeItems: RouteStop[] = mockPlaces.map((place, idx) => ({
    id: `item_${idx + 1}`,
    placeExternalId: place.externalPlaceId,
    title: place.placeName,
    time: idx === 0 ? '5.20 도착' : idx === 1 ? '5.20 오후' : idx === 2 ? '5.21 오전' : idx === 3 ? '5.21 오후' : '5.22 종일',
    order: idx + 1,
    day: idx < 2 ? 1 : idx < 4 ? 2 : 3,
    memo: '',
    lat: place.lat,
    lng: place.lng,
  }))
  return [
    { day: 1, date: '5.20 월', items: placeItems.filter(i => i.day === 1) },
    { day: 2, date: '5.21 화', items: placeItems.filter(i => i.day === 2) },
    { day: 3, date: '5.22 수', items: placeItems.filter(i => i.day === 3) },
  ]
}
dayPlans.value = buildInitialDayPlans()

const activeDay = ref(0)
const discoveryBbox = computed(() => {
  const coordinates = dayPlans.value.flatMap(day => day.items)
    .filter(item => item.lat != null && item.lng != null)
  if (coordinates.length === 0) return '127.25,36.20,127.55,36.50'
  const lngs = coordinates.map(item => item.lng as number)
  const lats = coordinates.map(item => item.lat as number)
  const padding = 0.05
  return `${Math.min(...lngs) - padding},${Math.min(...lats) - padding},${Math.max(...lngs) + padding},${Math.max(...lats) + padding}`
})
const dayColors = ['day-color-1', 'day-color-2', 'day-color-3', 'day-color-4', 'day-color-5']
const dayColorHex = ['#0066ff', '#3b82f6', '#10b981', '#f97316', '#ec4899']
function getDayColorClass(day: number) { return dayColors[(day - 1) % dayColors.length] }
function getDayColorHex(day: number) { return dayColorHex[(day - 1) % dayColorHex.length] }

/* ── Kakao Map ── */
let kakaoMap: any = null
let mapOverlays: any[] = []
const mapContainer = ref<HTMLElement | null>(null)

function getCoordsFromItinerary() {
  const coords: { lat: number; lng: number; title: string; dayIndex: number; index: number; image?: string | null; placeId?: string }[] = []
  let globalIdx = 1
  dayPlans.value.forEach(day => {
    day.items.forEach(item => {
      if (item.lat != null && item.lng != null) {
        const place = mockPlaces.find(p => p.externalPlaceId === item.placeExternalId)
        coords.push({
          lat: item.lat!,
          lng: item.lng!,
          title: item.title,
          dayIndex: day.day,
          index: globalIdx,
          image: place?.thumbnailUrl,
          placeId: item.placeExternalId,
        })
      }
      globalIdx++
    })
  })
  return coords
}

function drawMapMarkers(coords: ReturnType<typeof getCoordsFromItinerary>) {
  if (!kakaoMap) return
  mapOverlays.forEach(o => o.setMap(null))
  mapOverlays = []

  coords.forEach(c => {
    const position = new window.kakao.maps.LatLng(c.lat, c.lng)
    const dayClass = getDayColorClass(c.dayIndex)
    const dayNum = c.dayIndex || 1

    let markerContent: string
    if (c.image) {
      markerContent = `
        <div class="map-pin-card ${dayClass}" data-place-id="${c.placeId || ''}" onclick="window.selectPlace && window.selectPlace('${c.placeId || ''}')" style="cursor:pointer;">
          <div class="map-pin-img-wrapper">
            <img src="${c.image}" class="map-pin-img" alt="${c.title}">
          </div>
          <div class="map-pin-info">
            <span class="map-pin-title">${c.title}</span>
            <span class="map-pin-day-badge">${dayNum}일차</span>
          </div>
          <div class="map-pin-badge">${c.index}</div>
        </div>`
    } else {
      markerContent = `
        <div class="map-pin-card ${dayClass}" data-place-id="${c.placeId || ''}" onclick="window.selectPlace && window.selectPlace('${c.placeId || ''}')" style="cursor:pointer;">
          <div class="map-pin-img-wrapper">
            <div class="map-pin-icon-placeholder">
              <span class="material-symbols-rounded" style="font-size:24px;color:var(--day-color)">train</span>
            </div>
          </div>
          <div class="map-pin-info">
            <span class="map-pin-title">${c.title}</span>
            <span class="map-pin-day-badge">${dayNum}일차</span>
          </div>
          <div class="map-pin-badge">${c.index}</div>
        </div>`
    }

    const customOverlay = new window.kakao.maps.CustomOverlay({
      position,
      content: markerContent,
      yAnchor: 1.1,
    })
    customOverlay.setMap(kakaoMap)
    mapOverlays.push(customOverlay)
  })
}

function drawMapLine(coords: ReturnType<typeof getCoordsFromItinerary>) {
  if (!kakaoMap) return
  // Remove old polylines only
  mapOverlays = mapOverlays.filter(o => {
    if (o instanceof window.kakao.maps.Polyline) { o.setMap(null); return false }
    return true
  })

  // Group coords by dayIndex and draw a polyline per day
  const dayGroups = new Map<number, typeof coords>()
  coords.forEach(c => {
    if (!dayGroups.has(c.dayIndex)) dayGroups.set(c.dayIndex, [])
    dayGroups.get(c.dayIndex)!.push(c)
  })

  dayGroups.forEach((group, dayIdx) => {
    if (group.length < 2) return
    const linePath = group.map(c => new window.kakao.maps.LatLng(c.lat, c.lng))
    const polyline = new window.kakao.maps.Polyline({
      path: linePath,
      strokeWeight: 4,
      strokeColor: getDayColorHex(dayIdx),
      strokeOpacity: 0.8,
      strokeStyle: 'shortdash',
    })
    polyline.setMap(kakaoMap)
    mapOverlays.push(polyline)
  })
}

function redrawMap() {
  if (!kakaoMap) return
  const coords = getCoordsFromItinerary()
  if (coords.length === 0) return
  drawMapMarkers(coords)
  drawMapLine(coords)

  const bounds = new window.kakao.maps.LatLngBounds()
  coords.forEach(c => bounds.extend(new window.kakao.maps.LatLng(c.lat, c.lng)))
  kakaoMap.relayout()
  kakaoMap.setBounds(bounds)
}

let mapRetries = 0

function loadKakaoMap(): boolean {
  if (typeof window.kakao === 'undefined' || !window.kakao.maps) return false

  if (typeof window.kakao.maps.load === 'function') {
    window.kakao.maps.load(() => {
      initKakaoMap()
      setTimeout(redrawMap, 100)
    })
    return true
  }
  return initKakaoMap()
}

function initKakaoMap(): boolean {
  const el = mapContainer.value
  if (!el || typeof window.kakao === 'undefined' || !window.kakao.maps) return false

  const coords = getCoordsFromItinerary()
  if (coords.length === 0) return true

  const center = new window.kakao.maps.LatLng(coords[0].lat, coords[0].lng)
  kakaoMap = new window.kakao.maps.Map(el, { center, level: 7 })

  drawMapMarkers(coords)
  drawMapLine(coords)

  const bounds = new window.kakao.maps.LatLngBounds()
  coords.forEach(c => bounds.extend(new window.kakao.maps.LatLng(c.lat, c.lng)))
  kakaoMap.relayout()
  kakaoMap.setBounds(bounds)

  return true
}

function tryInitMap() {
  const el = mapContainer.value
  if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) {
    if (mapRetries++ < 30) setTimeout(tryInitMap, 300)
    return
  }

  if (!window.kakao || !window.kakao.maps) {
    if (mapRetries++ < 30) setTimeout(tryInitMap, 300)
    return
  }

  if (loadKakaoMap()) return
  if (mapRetries++ < 30) setTimeout(tryInitMap, 300)
}

onMounted(() => {
  loadKakaoSDK()
    .then(() => {
      nextTick(() => {
        tryInitMap()
      })
    })
    .catch(err => {
      console.error(err)
    })
  nextTick(() => {
    initDragDrop()
  })
  window.addEventListener('resize', redrawMap)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  kakaoMap = null
  mapOverlays = []
  window.removeEventListener('resize', redrawMap)
  window.removeEventListener('keydown', handleKeydown)
})

/* ── Undo / Redo ── */
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function pushUndoState() {
  undoStack.value.push(JSON.stringify({ plans: dayPlans.value, links: routeLinks.value }))
  redoStack.value = []
}

function undo() {
  if (!canUndo.value) return
  redoStack.value.push(JSON.stringify({ plans: dayPlans.value, links: routeLinks.value }))
  const prev = JSON.parse(undoStack.value.pop()!)
  dayPlans.value = prev.plans
  routeLinks.value = prev.links || []
  pendingRouteFrom.value = null
  nextTick(() => { initDragDrop(); redrawMap() })
}

function redo() {
  if (!canRedo.value) return
  undoStack.value.push(JSON.stringify({ plans: dayPlans.value, links: routeLinks.value }))
  const next = JSON.parse(redoStack.value.pop()!)
  dayPlans.value = next.plans
  routeLinks.value = next.links || []
  pendingRouteFrom.value = null
  nextTick(() => { initDragDrop(); redrawMap() })
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); undo()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
    e.preventDefault(); redo()
  }
}

/* ── Route Links ── */
const routeLinks = ref<RouteLink[]>([])
const pendingRouteFrom = ref<string | null>(null)

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

function removeRouteLinkBetween(id1: string, id2: string) {
  pushUndoState()
  routeLinks.value = routeLinks.value.filter(l =>
    !((l.fromItemId === id1 && l.toItemId === id2) ||
      (l.fromItemId === id2 && l.toItemId === id1))
  )
  showToast('경로 연결이 해제되었습니다')
  nextTick(() => { initDragDrop(); redrawMap() })
}

function handleRoutePenClick(item: RouteStop) {
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
  pushUndoState()
  routeLinks.value.push({
    id: `link_${Date.now()}`,
    fromItemId: pendingRouteFrom.value!,
    toItemId: item.id,
  })
  pendingRouteFrom.value = null
  showToast('경로가 연결되었습니다')
  nextTick(() => { initDragDrop(); redrawMap() })
}

function handleStopClick(item: RouteStop) {
  if (activeTool.value === 'route-pen') {
    handleRoutePenClick(item)
    return
  }
  if (item.placeExternalId) selectPlace(item.placeExternalId)
}

/* ── Drag & Drop (data-driven) ── */
const itineraryRef = ref<HTMLElement | null>(null)

interface DragSource {
  type: 'stop' | 'separator'
  dayIdx: number
  itemIdx: number
  dayNum: number
}

function onPointerDown(e: PointerEvent) {
  if (
    !(e.target as HTMLElement).closest('.grip-icon') &&
    !(e.target as HTMLElement).closest('.stop-num') &&
    e.button !== 0
  ) return

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

    nextTick(() => {
      initDragDrop()
      redrawMap()
    })
  }

  stop.addEventListener('pointermove', onPointerMove)
  stop.addEventListener('pointerup', onPointerUp)
}

/** 전체 보기: flat list 기반 재배치 */
function reorderAllDays(source: DragSource, targetIdx: number) {
  pushUndoState()
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
  const originalDates = dayPlans.value.map(d => d.date)
  const newPlans: DayPlan[] = []
  let currentItems: RouteStop[] = []

  for (const item of flatList) {
    if (item.type === 'separator') {
      if (newPlans.length > 0 || currentItems.length > 0) {
        const dayNum = newPlans.length + 1
        newPlans.push({
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
    const dayNum = newPlans.length + 1
    newPlans.push({
      day: dayNum,
      date: originalDates[newPlans.length] || '',
      items: currentItems.map((it, idx) => ({ ...it, order: idx + 1, day: dayNum }))
    })
  }

  dayPlans.value = newPlans
}

/** 특정 일차: 같은 날 내에서 순서만 변경 */
function reorderSingleDay(source: DragSource, targetIdx: number) {
  pushUndoState()
  const plan = dayPlans.value[source.dayIdx]
  if (!plan) return

  const items = [...plan.items]
  const [moved] = items.splice(source.itemIdx, 1)
  const insertAt = Math.min(targetIdx, items.length)
  items.splice(insertAt, 0, moved)
  plan.items = items.map((it, idx) => ({ ...it, order: idx + 1 }))
}

/* 드래그앤드롭 초기화 */
function initDragDrop() {
  nextTick(() => {
    if (!itineraryRef.value) return
    const stops = itineraryRef.value.querySelectorAll('.stop')
    stops.forEach(stop => {
      stop.addEventListener('pointerdown', onPointerDown as EventListener)
    })
    // 전체 보기일 때 구분선도 드래그 가능
    if (activeDay.value === 0) {
      const seps = itineraryRef.value.querySelectorAll('.day-separator')
      seps.forEach(sep => {
        sep.addEventListener('pointerdown', onPointerDown as EventListener)
      })
    }
  })
}

/* activeDay 변경 시 드래그 재초기화 + 지도 다시 그리기 */
watch(activeDay, () => {
  nextTick(() => {
    initDragDrop()
    redrawMap()
  })
})

/* ── Panels ── */
const isAiChatOpen = ref(false)
const isMemoOpen = ref(false)
const isTodoOpen = ref(false)

function togglePanel(panel: 'ai' | 'memo' | 'todo') {
  if (panel === 'ai') { isAiChatOpen.value = !isAiChatOpen.value; isMemoOpen.value = false; isTodoOpen.value = false }
  else if (panel === 'memo') { isMemoOpen.value = !isMemoOpen.value; isAiChatOpen.value = false; isTodoOpen.value = false }
  else { isTodoOpen.value = !isTodoOpen.value; isAiChatOpen.value = false; isMemoOpen.value = false }
}

/* ── AI Chat ── */
const aiMessage = ref('')
const aiMessages = ref<{ role: 'user' | 'ai'; text: string }[]>([
  { role: 'ai', text: '안녕하세요! 김지훈 님. ✈️ <strong>여름 유럽 여행</strong>의 동선을 분석 중인 AI 비서입니다.<br><br>현재 <strong>12개 코스</strong>가 등록되어 있으며, 멤버들의 의견 일치율은 <strong>58%</strong>입니다. 일정을 더 완벽하게 다듬기 위해 무엇을 도와드릴까요?' },
])

function sendAiMessage() {
  if (!aiMessage.value.trim()) return
  aiMessages.value.push({ role: 'user', text: aiMessage.value })
  aiMessage.value = ''
  setTimeout(() => {
    aiMessages.value.push({ role: 'ai', text: '좋은 질문이네요! 해당 장소 근처의 맛집과 포토스팟을 추천해 드릴게요.' })
  }, 600)
}

/* ── Memo (day-filtered) ── */
const dayTagLabels = ['전체', '1일차', '2일차', '3일차']
const activeMemoDay = ref('전체')
const memoData = ref<Record<string, string>>({ '전체': '', '1일차': '', '2일차': '', '3일차': '' })

function switchMemoDay(tag: string) {
  memoData.value[activeMemoDay.value] = memoTextDisplay.value
  activeMemoDay.value = tag
  memoTextDisplay.value = memoData.value[tag] || ''
}

const memoTextDisplay = ref('')

/* ── Todo (day-filtered) ── */
const activeTodoDay = ref('전체')
const allTodos = ref<Record<string, { id: string; text: string; done: boolean }[]>>({
  '전체': [
    { id: 't1', text: '숙소 예약 확인', done: true },
    { id: 't2', text: '교통카드 충전', done: false },
    { id: 't3', text: '카메라 배터리 충전', done: false },
  ],
  '1일차': [],
  '2일차': [],
  '3일차': [],
})
const newTodo = ref('')

const currentTodos = computed(() => allTodos.value[activeTodoDay.value] || [])
const completedCount = computed(() => currentTodos.value.filter(t => t.done).length)
const totalCount = computed(() => currentTodos.value.length)
const progressPercent = computed(() => totalCount.value === 0 ? 0 : Math.round((completedCount.value / totalCount.value) * 100))

function addTodo() {
  if (!newTodo.value.trim()) return
  allTodos.value[activeTodoDay.value].push({ id: `t${Date.now()}`, text: newTodo.value, done: false })
  newTodo.value = ''
}

function toggleTodo(id: string) {
  const todo = currentTodos.value.find(t => t.id === id)
  if (todo) todo.done = !todo.done
}

/* ── Map tools ── */
const routeState = ref<'route' | 'dashed' | 'hidden'>('route')
const cardState = ref<'full' | 'min' | 'hidden'>('full')
const nearbyOn = ref(false)
const drawingOn = ref(true)
const isPenPopoverOpen = ref(false)
const penSize = ref(6)
const penColor = ref('#1f2937')
const activeTool = ref('cursor')

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
const customCategory = ref('custom')
const customDay = ref(1)
const customTime = ref('12:00')
const customDuration = ref('60')

function submitCustomSchedule() {
  if (!customTitle.value.trim()) return
  customTitle.value = ''
  showCustomForm.value = false
}

/* ── Modals ── */
const isInviteModalOpen = ref(false)
const inviteTab = ref('tab-settings')
const sidebarTheme = ref('theme-violet')
const isCustomEventModalOpen = ref(false)

/* ── Trip departure/destination ── */
const editDeparture = ref('서울 (SEL)')
const editDestination = ref(trip.destinationName || '부산 (PUS)')

/* ── Detailbar ── */
const isDetailbarOpen = ref(false)
const selectedPlace = ref<any>(null)
const detailbarMainImg = ref('')

// Make selectPlace available globally for map marker onclick
;(window as any).selectPlace = selectPlace

function selectPlace(placeId: string) {
  // Route-pen mode: link stops instead of opening detailbar
  if (activeTool.value === 'route-pen') {
    for (const day of dayPlans.value) {
      const item = day.items.find(i => i.placeExternalId === placeId)
      if (item) { handleRoutePenClick(item); return }
    }
    return
  }
  // Existing itinerary items keep their rich local detail until itinerary API migration is complete.
  const itineraryPlace = mockPlaces.find(p => p.externalPlaceId === placeId)

  if (itineraryPlace) {
    const p = itineraryPlace as any
    selectedPlace.value = {
      id: p.id,
      title: p.title,
      description: p.description,
      image: p.image,
      likes: p.likes || '1.2k',
      location: p.location,
      hours: p.hours,
      closed: p.closed,
      parking: p.parking,
      photos: p.photos || [p.image],
      accessibility: p.accessibility,
      contact: p.contact,
      admission: p.admission,
      featuredMenu: p.featuredMenu,
      likedBy: p.likedBy,
      travelStories: p.travelStories,
    }
    detailbarMainImg.value = p.image
  } else {
    return
  }

  isDetailbarOpen.value = true
  setTimeout(redrawMap, 420)
}

function selectDiscoveredPlace(place: Place) {
  selectedPlace.value = {
    id: place.externalPlaceId,
    title: place.placeName,
    description: place.description || place.summary || '',
    image: place.thumbnailUrl,
    likes: '',
    location: place.address,
    photos: place.photos ?? (place.thumbnailUrl ? [place.thumbnailUrl] : []),
    contact: place.contact,
    likedBy: [],
  }
  detailbarMainImg.value = place.thumbnailUrl ?? ''
  isDetailbarOpen.value = true
  setTimeout(redrawMap, 420)
}

function closeDetailbar() {
  isDetailbarOpen.value = false
  selectedPlace.value = null
  setTimeout(redrawMap, 420)
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

function addPlaceToItinerary(place: any) {
  pushUndoState()
  const targetDay = activeDay.value === 0 ? 1 : activeDay.value
  const timeKey = targetDay === 1 ? '5.20' : targetDay === 2 ? '5.21' : '5.22'

  const newItem: RouteStop = {
    id: `step_${Date.now()}`,
    placeExternalId: place.externalPlaceId,
    title: place.placeName ?? place.name,
    time: `${timeKey} 오후`,
    order: 0,
    day: targetDay,
    memo: '',
    lat: place.lat ?? null,
    lng: place.lng ?? null,
  }

  // Add to the correct day plan
  const plan = dayPlans.value.find(d => d.day === targetDay)
  if (plan) {
    newItem.order = plan.items.length + 1
    plan.items.push(newItem)
  }

  showToast(`"${place.name}"이(가) ${targetDay}일차 일정에 추가되었습니다.`)
  nextTick(() => { redrawMap(); initDragDrop() })
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
                  <span class="trip-status-badge">&#9992;&#65039; 여행 예정</span>
                  <span class="trip-dday-badge">D-55</span>
                </div>
                <h3 class="trip-card-title">{{ trip.title }}</h3>
                <p class="trip-card-dates">
                  <span class="material-symbols-rounded" style="font-size:13px;vertical-align:middle;">calendar_month</span>
                  <span style="vertical-align:middle;">{{ trip.startDate }} - {{ trip.endDate }} (2박 3일)</span>
                </p>
                <div class="trip-card-divider"></div>
                <div class="trip-stats-grid">
                  <div class="trip-stat-item">
                    <span class="stat-label">선택된 경로</span>
                    <span class="stat-value">{{ mockPlaces.length }}개 코스</span>
                  </div>
                  <div class="trip-stat-item">
                    <span class="stat-label">멤버</span>
                    <span class="stat-value">{{ (trip.members ?? []).length }}명</span>
                  </div>
                </div>
                <div class="trip-card-footer">
                  <div class="avatars-group">
                    <div class="avatars">
                      <span v-for="m in (trip.members ?? [])" :key="m.id" class="avatar" :style="{ backgroundColor: 'var(--violet)' }">{{ (m.displayName ?? '?').charAt(0) }}</span>
                    </div>
                    <span class="members-count">+{{ (trip.members ?? []).length }}명</span>
                  </div>
                  <button class="btn ghost compact-settings-btn" type="button" @click="isInviteModalOpen = true">
                    <span class="material-symbols-rounded" style="font-size:14px;">settings</span>
                    <span>관리</span>
                  </button>
                </div>
              </div>

              <!-- Day tabs -->
              <div class="day-tabs-container">
                <button class="day-scroll-btn prev" type="button" aria-label="이전">
                  <span class="material-symbols-rounded">chevron_left</span>
                </button>
                <div class="day-tabs" id="day-tabs-scrollable">
                  <button :class="['day-tab', { active: activeDay === 0 }]" type="button" @click="activeDay = 0">
                    <span class="day-title">전체</span>
                  </button>
                  <button v-for="day in dayPlans" :key="day.day"
                    :class="['day-tab', { active: activeDay === day.day }]"
                    type="button" @click="activeDay = day.day">
                    <span class="day-title">{{ day.day }}일차</span>
                    <span class="day-date">{{ day.date }}</span>
                  </button>
                </div>
                <button class="day-scroll-btn next" type="button" aria-label="다음">
                  <span class="material-symbols-rounded">chevron_right</span>
                </button>
              </div>

              <!-- Itinerary -->
              <div class="itinerary" data-sidebar-itinerary ref="itineraryRef">
                <!-- 전체 보기 -->
                <template v-if="activeDay === 0">
                  <template v-for="day in dayPlans" :key="day.day">
                    <div :class="['day-separator', getDayColorClass(day.day)]" :data-day="day.day">
                      <span class="day-pill">{{ day.day }}일차</span>
                      <span class="line"></span>
                      <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                    </div>
                    <template v-for="(item, idx) in day.items" :key="item.id">
                      <div :class="['stop', getDayColorClass(day.day), { 'route-pen-pending': pendingRouteFrom === item.id, 'route-linked': !!getLinkedPartner(item.id) }]"
                        :data-step-id="item.id" :data-place-id="item.placeExternalId"
                        @click.stop="handleStopClick(item)">
                        <span class="stop-num">{{ idx + 1 }}</span>
                        <div>
                          <strong>{{ item.title }}</strong>
                          <span class="small muted">{{ item.time }}</span>
                        </div>
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
                <template v-else>
                  <div :class="['day-separator', getDayColorClass(activeDay)]" :data-day="activeDay">
                    <span class="day-pill">{{ activeDay }}일차</span>
                    <span class="line"></span>
                  </div>
                  <template v-for="(item, idx) in dayPlans[activeDay - 1]?.items" :key="item.id">
                    <div :class="['stop', getDayColorClass(activeDay), { 'route-pen-pending': pendingRouteFrom === item.id, 'route-linked': !!getLinkedPartner(item.id) }]"
                      :data-step-id="item.id" :data-place-id="item.placeExternalId"
                      @click.stop="handleStopClick(item)">
                      <span class="stop-num">{{ idx + 1 }}</span>
                      <div>
                        <strong>{{ item.title }}</strong>
                        <span class="small muted">{{ item.time }}</span>
                      </div>
                      <span class="material-symbols-rounded grip-icon">drag_indicator</span>
                    </div>
                    <!-- Route connector between linked adjacent stops -->
                    <div v-if="dayPlans[activeDay - 1] && idx < dayPlans[activeDay - 1].items.length - 1 && hasRouteLinkBetween(item.id, dayPlans[activeDay - 1].items[idx + 1].id)"
                      class="route-connector"
                      @click.stop="removeRouteLinkBetween(item.id, dayPlans[activeDay - 1].items[idx + 1].id)"
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
                <button class="add-stop-dashed" type="button" @click="openSearchPanel">
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
                <PlaceDiscoveryPanel
                  :trip-id="tripId"
                  :bbox="discoveryBbox"
                  @select="selectDiscoveredPlace"
                  @add="addPlaceToItinerary"
                />

                <!-- 커스텀 일정 폼 -->
                <div class="custom-schedule-form" id="custom-schedule-form" v-if="showCustomForm">
                  <div class="custom-form-field">
                    <label class="form-label">
                      <span class="form-label-text">일정명</span>
                      <input class="field" type="text" id="inline-custom-title" placeholder="예: 점심 식사, 자유 시간" v-model="customTitle">
                    </label>
                  </div>
                  <div class="custom-form-row">
                    <label class="form-label">
                      <span class="form-label-text">카테고리</span>
                      <select class="field" id="inline-custom-category" v-model="customCategory">
                        <option value="custom" selected>기타/자유일정</option>
                        <option value="attraction">관광지</option>
                        <option value="food">맛집</option>
                        <option value="cafe">카페</option>
                        <option value="hotel">숙소</option>
                      </select>
                    </label>
                    <label class="form-label">
                      <span class="form-label-text">방문 일차</span>
                      <select class="field" id="inline-custom-day" v-model="customDay">
                        <option v-for="day in dayPlans" :key="day.day" :value="day.day">{{ day.day }}일차</option>
                      </select>
                    </label>
                  </div>
                  <div class="custom-form-row">
                    <label class="form-label">
                      <span class="form-label-text">방문 시간</span>
                      <input class="field" type="time" id="inline-custom-time" v-model="customTime">
                    </label>
                    <label class="form-label">
                      <span class="form-label-text">소요 시간</span>
                      <select class="field" id="inline-custom-duration" v-model="customDuration">
                        <option value="30">30분</option>
                        <option value="60" selected>1시간</option>
                        <option value="90">1시간 30분</option>
                        <option value="120">2시간</option>
                        <option value="180">3시간</option>
                      </select>
                    </label>
                  </div>
                  <button type="button" class="btn primary" id="inline-custom-submit" style="width:100%;margin-top:12px;" @click="submitCustomSchedule">
                    <span class="material-symbols-rounded" style="font-size:18px;">add_circle</span>
                    일정 추가하기
                  </button>
                </div>

              </div>
            </div>

          </aside>

          <!-- ═══ MAP CANVAS ═══ -->
          <div class="map-canvas" aria-label="대전 여행 지도">
            <div ref="mapContainer" id="kakao-map" style="width:100%;height:100%;"></div>

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
              <button :class="['tool-btn', { active: activeTool === 'pen' }]" type="button" id="pen-btn" title="펜 (자유 그리기) — 굵기/색상 보기" data-tool="pen" @click="activeTool = 'pen'; isPenPopoverOpen = !isPenPopoverOpen">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button :class="['tool-btn', { active: activeTool === 'eraser' }]" type="button" title="지우개" data-tool="eraser" @click="activeTool = 'eraser'">
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
                title="실행 취소 (Ctrl+Z)"
                :disabled="!canUndo"
                @click="undo">
                <span class="material-symbols-rounded">undo</span>
              </button>
              <button :class="['tool-btn', canRedo ? 'is-on' : 'is-off']" type="button"
                title="다시 실행 (Ctrl+Y)"
                :disabled="!canRedo"
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
                  <span class="detailbar-likes-badge"><span class="material-symbols-rounded">favorite</span> {{ selectedPlace.likes }}</span>
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
              <div class="detailbar-info-card">
                <h4 class="section-title">이용 안내</h4>
                <div class="detailbar-info-grid">
                  <div class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">schedule</span></span>
                    <div class="info-content">
                      <span class="label">이용시간</span>
                      <strong class="value">{{ selectedPlace.hours }}</strong>
                    </div>
                  </div>
                  <div class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">event_busy</span></span>
                    <div class="info-content">
                      <span class="label">쉬는날</span>
                      <strong class="value">{{ selectedPlace.closed }}</strong>
                    </div>
                  </div>
                  <div class="info-item">
                    <span class="icon-wrap"><span class="material-symbols-rounded">local_parking</span></span>
                    <div class="info-content">
                      <span class="label">주차시설</span>
                      <strong class="value">{{ selectedPlace.parking }}</strong>
                    </div>
                  </div>
                </div>
                <div class="detailbar-acc-row">
                  <div :class="['acc-pill', selectedPlace.accessibility?.wheelchair ? 'enabled' : 'disabled']">
                    <span class="material-symbols-rounded">accessible</span>
                    <span>휠체어 {{ selectedPlace.accessibility?.wheelchair ? '가능' : '불가' }}</span>
                  </div>
                  <div :class="['acc-pill', selectedPlace.accessibility?.pets ? 'enabled' : 'disabled']">
                    <span class="material-symbols-rounded">pets</span>
                    <span>반려동물 {{ selectedPlace.accessibility?.pets ? '가능' : '불가' }}</span>
                  </div>
                  <div :class="['acc-pill', selectedPlace.accessibility?.stroller ? 'enabled' : 'disabled']">
                    <span class="material-symbols-rounded">stroller</span>
                    <span>유모차 {{ selectedPlace.accessibility?.stroller ? '가능' : '불가' }}</span>
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
                  <span class="ai-status">온라인 · 실시간 분석 중</span>
                </div>
              </div>
              <button id="ai-chat-close-btn" class="icon-btn" aria-label="닫기" @click="isAiChatOpen = false"><span class="material-symbols-rounded">close</span></button>
            </div>

            <div class="ai-chat-messages-container" id="ai-chat-messages">
              <div v-for="(msg, idx) in aiMessages" :key="idx" :class="['ai-message', msg.role === 'ai' ? 'assistant' : 'user']">
                <div v-if="msg.role === 'ai'" class="ai-message-avatar">&#10024;</div>
                <div class="ai-message-bubble" v-html="msg.text"></div>
              </div>
            </div>

            <!-- Quick Suggestions -->
            <div class="ai-chat-suggestions">
              <button class="suggestion-chip" data-query="route-opt">&#9889; 경로 최적화 추천</button>
              <button class="suggestion-chip" data-query="food-recommend">&#127869; 대전 근처 맛집</button>
              <button class="suggestion-chip" data-query="schedule-check">&#128197; 일정 겹침 확인</button>
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
              <input type="text" id="ai-chat-input" aria-label="AI 가이드에게 질문하기" placeholder="AI에게 일정에 관해 물어보세요..." v-model="aiMessage" @keydown.enter="sendAiMessage" />
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
                  <span class="panel-status" id="memo-status">자동 저장됨</span>
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
                <button id="memo-clear-btn" class="btn text-danger-btn" type="button" @click="memoTextDisplay = ''">
                  <span class="material-symbols-rounded">delete</span>
                  초기화
                </button>
                <span class="memo-char-count" id="memo-char-count">{{ memoTextDisplay.length }}자</span>
              </div>
              <button id="memo-copy-btn" class="btn primary small" type="button">
                <span class="material-symbols-rounded">content_copy</span>
                복사하기
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
              <ul class="todo-list" id="todo-list-items">
                <li v-for="todo in currentTodos" :key="todo.id" class="todo-item">
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
                    <input type="checkbox" :checked="todo.done" @change="toggleTodo(todo.id)" style="width:18px;height:18px;accent-color:var(--violet);" />
                    <span :style="{ textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? 'var(--muted)' : 'var(--ink)', fontSize: '14px' }">{{ todo.text }}</span>
                  </label>
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
            <form id="trip-settings-form" class="modal-form" @submit.prevent>
              <label class="form-label">
                <span class="form-label-text">여행 방 이름</span>
                <input class="field" type="text" id="edit-trip-name" :value="trip.title" placeholder="여행 방 이름을 입력하세요">
              </label>
              <div class="form-row-dates">
                <label class="form-label">
                  <span class="form-label-text">출발일</span>
                  <input class="field" type="date" id="edit-trip-start" :value="trip.startDate">
                </label>
                <label class="form-label">
                  <span class="form-label-text">귀국일</span>
                  <input class="field" type="date" id="edit-trip-end" :value="trip.endDate">
                </label>
              </div>
              <div class="form-row-dates">
                <label class="form-label">
                  <span class="form-label-text">출발지</span>
                  <input class="field" type="text" id="edit-trip-departure" v-model="editDeparture" placeholder="예: 서울 (SEL)">
                </label>
                <label class="form-label">
                  <span class="form-label-text">도착지</span>
                  <input class="field" type="text" id="edit-trip-destination" v-model="editDestination" placeholder="예: 부산 (PUS)">
                </label>
              </div>
              <label class="form-label">
                <span class="form-label-text">사이드바 테마색</span>
                <div class="theme-picker">
                  <button type="button" :class="['theme-option', { active: sidebarTheme === 'theme-violet' }]" data-theme="theme-violet" style="background:linear-gradient(135deg,#6366f1,#3b82f6);" @click="sidebarTheme = 'theme-violet'"></button>
                  <button type="button" :class="['theme-option', { active: sidebarTheme === 'theme-sunset' }]" data-theme="theme-sunset" style="background:linear-gradient(135deg,#f97316,#ef4444);" @click="sidebarTheme = 'theme-sunset'"></button>
                  <button type="button" :class="['theme-option', { active: sidebarTheme === 'theme-emerald' }]" data-theme="theme-emerald" style="background:linear-gradient(135deg,#10b981,#059669);" @click="sidebarTheme = 'theme-emerald'"></button>
                  <button type="button" :class="['theme-option', { active: sidebarTheme === 'theme-dark' }]" data-theme="theme-dark" style="background:linear-gradient(135deg,#1e293b,#0f172a);" @click="sidebarTheme = 'theme-dark'"></button>
                </div>
              </label>
              <button type="submit" class="btn primary" style="width:100%;margin-top:16px;">설정 저장하기</button>
            </form>
          </div>

          <!-- TAB 2: Members -->
          <div :class="['modal-tab-content', { active: inviteTab === 'tab-members' }]" id="tab-members" v-show="inviteTab === 'tab-members'">
            <!-- Email Invite Form -->
            <div class="email-invite-section" style="margin-bottom:20px;">
              <span class="form-label-text" style="display:block;margin-bottom:8px;">이메일로 친구 초대</span>
              <div class="email-invite-box">
                <input class="field" type="email" id="invite-email-input" placeholder="invite@example.com">
                <button id="btn-email-invite" class="btn primary small" style="min-height:42px;margin-bottom:0;" type="button">초대</button>
              </div>
            </div>

            <!-- Share Link Section -->
            <span class="form-label-text" style="display:block;margin-bottom:8px;">초대 링크 공유</span>
            <div class="invite-link-box" style="margin-bottom:20px;">
              <input type="text" readonly value="https://soomgil.com/invite/eu-summer24" id="invite-link-input">
              <button id="copy-link-btn" style="padding:8px 16px;font-size:14px;border-radius:12px;border:none;background:var(--violet);color:white;font-weight:700;cursor:pointer;">복사</button>
            </div>

            <!-- Members Section -->
            <div class="modal-members-section">
              <div class="members-header">
                <h4>참여 중인 멤버</h4>
                <span class="member-count">{{ (trip.members ?? []).length }}명</span>
              </div>
              <ul class="member-list" id="invite-member-list">
                <li v-for="member in (trip.members ?? [])" :key="member.id" class="member-item">
                  <div class="member-avatar" :style="{ backgroundColor: 'var(--violet)' }">{{ (member.displayName ?? '?').charAt(0) }}</div>
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
}
.route-page-section .day-scroll-btn { display: none; }
.route-page-section .day-tabs {
  width: 100%;
  gap: 2px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
}
.route-page-section .day-tab {
  flex: 1;
  flex-direction: row;
  justify-content: center;
  padding: 6px 6px;
  min-height: 32px;
  border-radius: 8px;
  gap: 0;
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
.member-name { font-size:14px;font-weight:700;color:var(--ink); }

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
