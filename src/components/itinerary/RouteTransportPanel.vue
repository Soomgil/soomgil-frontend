<script setup lang="ts">
import type { RouteMode, TripRoute } from '@/types/itinerary'

defineProps<{
  mode: RouteMode
  routes: TripRoute[]
  names: Record<string, string>
  busy: boolean
}>()
const emit = defineEmits<{
  'update:mode': [mode: RouteMode]
  changeRoute: [routeId: string, mode: RouteMode]
}>()
const options: { value: RouteMode; label: string; icon: string }[] = [
  { value: 'WALKING', label: '도보', icon: 'directions_walk' },
  { value: 'CYCLING', label: '자전거', icon: 'directions_bike' },
  { value: 'DRIVING', label: '자동차', icon: 'directions_car' },
]
function distance(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '거리 정보 없음'
  return value < 1000 ? `${Math.round(value)}m` : `${(value / 1000).toFixed(1)}km`
}
function duration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '시간 정보 없음'
  const minutes = Math.max(1, Math.ceil(value / 60))
  return minutes < 60 ? `약 ${minutes}분` : `약 ${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}`
}
function changeRoute(event: Event, route: TripRoute) {
  const mode = (event.target as HTMLSelectElement).value as RouteMode
  // 서버가 재계산을 확인할 때까지 저장된 이동수단을 표시한다.
  ;(event.target as HTMLSelectElement).value = route.mode
  if (mode !== route.mode) emit('changeRoute', route.id, mode)
}
</script>

<template>
  <section class="transport-panel" aria-label="경로 이동수단" :aria-busy="busy">
    <div class="transport-heading">이동수단 <span>{{ busy ? '경로 계산 중…' : '새 경로에 적용' }}</span></div>
    <div class="transport-options" role="group" aria-label="새 경로 이동수단">
      <button v-for="option in options" :key="option.value" type="button" :disabled="busy"
        :aria-pressed="mode === option.value" @click="emit('update:mode', option.value)">
        <span class="material-symbols-rounded" aria-hidden="true">{{ option.icon }}</span>{{ option.label }}
      </button>
    </div>
    <p>경로 연결 펜으로 장소를 이어 주세요.</p>
    <details v-if="routes.length" class="saved-routes">
      <summary>연결된 구간 {{ routes.length }}개</summary>
      <p>이동수단을 바꾸면 두 장소 사이를 다시 계산합니다. 직접 지정한 경유점은 초기화됩니다.</p>
      <div v-for="route in routes" :key="route.id" class="saved-route">
        <div class="route-name">{{ names[route.originItineraryItemId] || '출발지' }} → {{ names[route.destinationItineraryItemId] || '도착지' }}</div>
        <div class="route-meta">
          <select :value="route.mode" :disabled="busy" :aria-label="`${names[route.originItineraryItemId] || '출발지'}에서 ${names[route.destinationItineraryItemId] || '도착지'}까지 이동수단`" @change="changeRoute($event, route)">
            <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <span v-if="route.provider === 'USER_TRACE'" class="unverified">직접 그린 선 · 경로 미확인</span>
          <span v-else>{{ distance(route.distanceMeters) }} · {{ duration(route.durationSeconds) }}</span>
        </div>
      </div>
    </details>
  </section>
</template>

<style scoped>
.transport-panel { padding: 14px 16px; border-bottom: 1px solid #e8e5ee; background: #faf9fd; color: #302b3c; }
.transport-heading { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; }
.transport-heading span, p { font-size: 11px; font-weight: 400; color: #716b7c; }
p { margin: 8px 0 0; line-height: 1.5; }
.transport-options { display: flex; gap: 6px; margin-top: 9px; }
.transport-options button { display: flex; align-items: center; justify-content: center; gap: 4px; flex: 1; padding: 8px 3px; border: 1px solid #ddd7e9; border-radius: 9px; background: white; color: #62596f; cursor: pointer; font: inherit; font-size: 12px; }
.transport-options button[aria-pressed="true"] { border-color: #7c3aed; background: #f0e9ff; color: #6d28d9; font-weight: 700; }
.material-symbols-rounded { font-size: 19px; }
button:disabled, select:disabled { cursor: wait; opacity: .65; }
button:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid #7c3aed; outline-offset: 2px; }
.saved-routes { margin-top: 10px; font-size: 12px; }
summary { cursor: pointer; }
.saved-route { padding: 10px 0; border-bottom: 1px solid #e8e5ee; }
.saved-route:last-child { border: 0; padding-bottom: 0; }
.route-name { line-height: 1.5; overflow-wrap: anywhere; }
.route-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 6px; font-size: 11px; color: #716b7c; }
select { border: 1px solid #ddd7e9; border-radius: 6px; background: white; color: #302b3c; padding: 5px; font: inherit; }
.unverified { color: #9a6100; }
</style>
