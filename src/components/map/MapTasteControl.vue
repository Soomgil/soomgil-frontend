<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { swipeApi, type TripPreferencePlace } from '@/api/swipe.api'
import type { Place, PlaceRecommendation } from '@/types/place'
import type { ItineraryMapNearbyPlace } from './MapboxItineraryMap.vue'

const props = defineProps<{ tripId: string; bbox: string; userId: string | null }>()
const emit = defineEmits<{
  places: [places: ItineraryMapNearbyPlace[]]
  select: [place: Place, recommendation: PlaceRecommendation]
}>()
const open = ref(false)
const enabled = ref(true)
let refreshTimer: ReturnType<typeof setTimeout> | undefined
const mode = ref<'mine' | 'colleagues' | 'together'>('mine')
const memberId = ref('')
const superOnly = ref(false)
const rows = ref<TripPreferencePlace[]>([])
const loading = ref(false)
const error = ref(false)
const loadedBbox = ref('')
let revision = 0
const colleagues = computed(() => [...new Map(rows.value.filter(r => r.userId !== props.userId).map(r => [r.userId, r])).values()])
const places = computed(() => {
  const grouped = new Map<string, TripPreferencePlace[]>()
  for (const row of rows.value) {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng) || (superOnly.value && row.reaction !== 'SUPER_LIKE')) continue
    const key = `${row.provider}:${row.externalPlaceId}`
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }
  return [...grouped.values()].filter(group => {
    if (mode.value === 'mine') return group.some(r => r.userId === props.userId)
    if (mode.value === 'colleagues') return group.some(r => r.userId !== props.userId && (!memberId.value || r.userId === memberId.value))
    return new Set(group.map(r => r.userId)).size >= 2
  }).map(group => ({ first: group[0], members: group }))
})
watch([places, enabled], () => emit('places', enabled.value ? places.value.map(({ first, members }) => ({
  id: `taste:${first.provider}:${first.externalPlaceId}`, provider: first.provider,
  externalPlaceId: first.externalPlaceId, title: first.name, category: first.category,
  lat: first.lat, lng: first.lng, image: first.thumbnailUrl,
  taste: members.some(m => m.reaction === 'SUPER_LIKE') ? 'star' : 'favorite',
})) : []), { immediate: true })
async function load() {
  const request = ++revision
  error.value = false
  if (!props.bbox || !enabled.value) { loading.value = false; return }
  loading.value = true
  const bbox = props.bbox
  try {
    const result = await swipeApi.getTripPreferencePlaces(props.tripId, bbox)
    if (request !== revision) return
    rows.value = result; loadedBbox.value = bbox
  } catch { if (request === revision) error.value = true }
  finally { if (request === revision) loading.value = false }
}
watch(enabled, value => {
  clearTimeout(refreshTimer)
  if (value) void load()
  else { revision++; loading.value = false }
}, { immediate: true })
watch(() => [props.tripId, props.userId], () => {
  revision++; clearTimeout(refreshTimer); rows.value = []; loadedBbox.value = ''; memberId.value = ''; loading.value = false
  if (enabled.value) void load()
})
watch(() => props.bbox, bbox => {
  // 지도가 움직여 범위가 바뀌면(주변 여행지와 동일하게) 3초 뒤 그 범위의 취향 장소를 다시 불러온다.
  // 예전엔 "30% 이상 이동" 조건이 있어 조금만 움직이면 갱신되지 않아, 껐다 켜야 보이는 문제가 있었다.
  clearTimeout(refreshTimer)
  if (!enabled.value || !bbox || bbox === loadedBbox.value) return
  refreshTimer = setTimeout(() => void load(), 3000)
})
onBeforeUnmount(() => { revision++; clearTimeout(refreshTimer) })
function select(provider: string, id: string) {
  const item = places.value.find(p => p.first.provider === provider && p.first.externalPlaceId === id)
  if (!item) return false
  const { first: p, members } = item
  const matched = members.map(m => ({ id: m.userId, displayName: m.displayName, profileImageUrl: m.profileImageUrl }))
  emit('select', { provider: p.provider, externalPlaceId: p.externalPlaceId, placeName: p.name,
    address: p.address, lat: p.lat, lng: p.lng, thumbnailUrl: p.thumbnailUrl, category: p.category },
    { place: { provider: p.provider, externalPlaceId: p.externalPlaceId, placeName: p.name, address: p.address, lat: p.lat, lng: p.lng, thumbnailUrl: p.thumbnailUrl },
      matchedMembers: matched, matchedMemberCount: matched.length, totalMemberCount: matched.length, rank: null, distanceMeters: null, recommendationReason: null, matchPercentage: null })
  return true
}
function close() {
  open.value = false
}
defineExpose({ select, close })
</script>

<template>
  <div class="map-taste-control" @keydown.esc.stop="open = false">
    <button class="taste-toggle" data-testid="taste-toggle" :class="{ active: enabled }" :aria-pressed="enabled" :aria-expanded="open" aria-controls="map-taste-panel" @click="open = !open">
      <span class="material-symbols-rounded" aria-hidden="true">favorite</span>취향 보기
    </button>
    <section :aria-busy="loading" v-if="open" id="map-taste-panel" class="taste-panel" aria-label="취향 보기 설정">
      <p class="taste-description">여행 멤버가 좋아한 장소를 지도에서 찾아보세요.</p>
      <div class="taste-tabs" aria-label="취향 필터" :style="{ '--taste-tab-index': mode === 'mine' ? 0 : mode === 'colleagues' ? 1 : 2 }">
        <span class="taste-tab-indicator" aria-hidden="true"></span>
        <button data-testid="taste-mine" :aria-pressed="mode === 'mine'" @click="mode = 'mine'">내 취향</button>
        <button data-testid="taste-colleagues" :aria-pressed="mode === 'colleagues'" @click="mode = 'colleagues'">동료 취향</button>
        <button data-testid="taste-together" :aria-pressed="mode === 'together'" @click="mode = 'together'">함께 좋아한 곳</button>
      </div>
      <div v-if="mode === 'colleagues'" class="taste-members">
        <button :aria-pressed="!memberId" @click="memberId = ''">전체</button>
        <button v-for="member in colleagues" :key="member.userId" :aria-label="member.displayName" :title="member.displayName" :aria-pressed="memberId === member.userId" @click="memberId = member.userId">
          <img v-if="member.profileImageUrl" :src="member.profileImageUrl" alt="" /><span v-else data-no-translate>{{ member.displayName?.slice(0, 1) || '?' }}</span>
        </button>
      </div>
      <button type="button" role="switch" class="taste-switch-row" data-testid="taste-enabled" :aria-checked="enabled" @click="enabled = !enabled"><span>지도에 취향 표시</span><span class="taste-switch" aria-hidden="true"></span></button>
      <button type="button" role="switch" class="taste-switch-row" data-testid="taste-super" :aria-checked="superOnly" @click="superOnly = !superOnly"><span>슈퍼라이크만 보기</span><span class="taste-switch" aria-hidden="true"></span></button>
      <div v-if="error && !loading" role="alert"><p>취향 장소를 불러오지 못했습니다.</p><button class="taste-reload" @click="load">다시 시도</button></div>
      <p v-else-if="!bbox">지도를 움직여 탐색할 지역을 선택해 주세요.</p>
      <p v-else-if="enabled && !loading && !places.length">이 지역엔 여행 멤버가 좋아한 장소가 아직 없어요. 지도를 옮기거나 ‘취향 수집’에서 좋아요를 모아 보세요.</p>
    </section>
  </div>
</template>

<style scoped>
.map-taste-control { position: relative; }
.taste-toggle { display:flex; align-items:center; gap:6px; min-height:40px; padding:8px 14px; border:1px solid #d7e7f3; border-radius:999px; background:#fff; color:#171717; font:inherit; font-size:13px; font-weight:700; cursor:pointer; transition:background-color .16s ease,border-color .16s ease,color .16s ease,box-shadow .16s ease,transform .16s ease; }
.taste-toggle.active { background:#fff0f2; border-color:#ef9aa4; color:#b72f3e; box-shadow:0 5px 14px rgb(229 57 69 / 14%); }
.taste-toggle.active:hover { background:#ffe4e8; border-color:#e76f7c; color:#a82534; transform:translateY(-1px); }
.taste-toggle .material-symbols-rounded { font-size:18px; color:#e53945; font-variation-settings:'FILL' 1; }
.taste-panel { position:absolute; top:calc(100% + 10px); right:0; width:330px; padding:18px; border:1px solid #dbe8f2; border-radius:22px; background:#fff; color:#354e65; box-shadow:0 12px 36px #254c721a; max-height:70svh; overflow:auto; }
.taste-panel .taste-description { margin:0 0 12px; padding:0 2px; line-height:1.65; }
.taste-tabs { margin-bottom:8px; }
.taste-panel p, footer { font-size:12px; line-height:1.6; color:#73889b; }
.taste-panel button { cursor:pointer; font-family:inherit; }
.taste-close { border:0; border-radius:50%; width:30px; height:30px; font-size:22px; color:#607c92; background:#f1f7fb; }
.taste-tabs { position:relative; isolation:isolate; display:flex; background:#f0f6fb; border-radius:999px; padding:3px; }
.taste-tabs button { position:relative; z-index:1; flex:1; border:0; background:transparent; color:#627b91; padding:9px 3px; border-radius:999px; font-size:12px; white-space:nowrap; }
.taste-tabs button[aria-pressed=true] { background:transparent; color:#286da3; font-weight:700; }
.taste-super { display:flex; align-items:center; gap:6px; font-size:12px; margin:14px 0; cursor:pointer; }
.taste-super input { accent-color:#4a8bc0; }
.taste-members { display:flex; gap:7px; margin-top:12px; flex-wrap:wrap; }
.taste-members button { width:34px; height:34px; padding:0; border:2px solid transparent; border-radius:50%; color:#62819d; background:#eff6fc; font-size:11px; overflow:hidden; }
.taste-members button[aria-pressed=true] { border-color:#5c9ed0; }
.taste-members img { width:100%; height:100%; object-fit:cover; }
.taste-reload { border:1px solid #cce2f3; border-radius:999px; padding:8px 12px; background:#eff7ff; color:#417ba7; font-size:12px; }
.taste-count { margin:12px 0 0; }
footer { margin-top:10px; padding:0; min-height:0; height:auto; background:none; border:0; text-align:left; font-size:11px; }
button:focus-visible { outline:2px solid #488fc4; outline-offset:3px; }
@media(max-width:767px) { .taste-panel { position:fixed; top:auto; bottom:calc(80px + env(safe-area-inset-bottom)); left:12px; right:12px; width:auto; max-height:calc(100svh - 240px); } .taste-toggle { padding:7px 10px; font-size:12px; } }
.taste-switch-row { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; border:0; background:transparent; min-height:38px; padding:7px 0; color:#354e65; font-size:12px; text-align:left; }
.taste-apply { flex:1; width:auto; padding:0; margin-right:12px; font-weight:700; }
.taste-switch { position:relative; width:36px; height:22px; flex-shrink:0; border-radius:99px; background:#ccd9e3; transition:background .2s; }
.taste-switch::after { content:''; position:absolute; width:16px; height:16px; left:3px; top:3px; border-radius:50%; background:white; box-shadow:0 1px 3px #254c7226; transition:transform .28s cubic-bezier(.22,1,.36,1); }
.taste-switch-row[aria-checked=true] .taste-switch { background:#528ec0; }
.taste-switch-row[aria-checked=true] .taste-switch::after { transform:translateX(14px); }
.taste-tab-indicator { position:absolute; top:3px; bottom:3px; left:3px; width:calc((100% - 6px) / 3); border-radius:999px; background:#ddecfa; transform:translateX(calc(var(--taste-tab-index) * 100%)); transition:transform .3s cubic-bezier(.22,1,.36,1); pointer-events:none; }
@media(prefers-reduced-motion:reduce) { .taste-switch,.taste-switch::after,.taste-tab-indicator { transition:none; } }
</style>
