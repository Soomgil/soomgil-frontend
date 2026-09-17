<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { swipeApi, type TripPreferencePlace } from '@/api/swipe.api'
import type { Place, PlaceRecommendation } from '@/types/place'
import type { ItineraryMapNearbyPlace } from './MapboxItineraryMap.vue'
import { formatUiText } from '@/i18n/ui-localizer'

const props = defineProps<{ tripId: string; bbox: string; userId: string | null }>()
const emit = defineEmits<{
  places: [places: ItineraryMapNearbyPlace[]]
  select: [place: Place, recommendation: PlaceRecommendation]
}>()
const open = ref(false)
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
watch([places, open], () => emit('places', open.value ? places.value.map(({ first, members }) => ({
  id: `taste:${first.provider}:${first.externalPlaceId}`, provider: first.provider,
  externalPlaceId: first.externalPlaceId, title: first.name, category: first.category,
  lat: first.lat, lng: first.lng, image: first.thumbnailUrl,
  taste: members.some(m => m.reaction === 'SUPER_LIKE') ? 'star' : 'favorite',
})) : []), { immediate: true })
async function load() {
  const request = ++revision
  rows.value = []; error.value = false
  if (!props.bbox || !open.value) { loading.value = false; return }
  loading.value = true
  const bbox = props.bbox
  try {
    const result = await swipeApi.getTripPreferencePlaces(props.tripId, bbox)
    if (request !== revision) return
    rows.value = result; loadedBbox.value = bbox
  } catch { if (request === revision) error.value = true }
  finally { if (request === revision) loading.value = false }
}
watch(open, value => { if (value) void load(); else { revision++; loading.value = false; rows.value = [] } })
watch(() => [props.tripId, props.userId], () => { rows.value = []; memberId.value = ''; void load() })
watch(() => props.bbox, () => { if (open.value && !loadedBbox.value && !loading.value) void load() })
onBeforeUnmount(() => { revision++ })
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
defineExpose({ select })
</script>

<template>
  <div class="map-taste-control" @keydown.esc.stop="open = false">
    <button class="taste-toggle" data-testid="taste-toggle" :class="{ active: open }" :aria-expanded="open" aria-controls="map-taste-panel" @click="open = !open">
      <span class="material-symbols-rounded" aria-hidden="true">favorite</span>취향 보기
    </button>
    <section v-if="open" id="map-taste-panel" class="taste-panel" aria-label="취향 관광지">
      <header><strong>취향 관광지</strong><button class="taste-close" aria-label="닫기" @click="open = false">×</button></header>
      <p>여행 멤버가 좋아한 장소를 지도에서 찾아보세요.</p>
      <div class="taste-tabs" aria-label="취향 필터">
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
      <label class="taste-super"><input v-model="superOnly" type="checkbox" />슈퍼라이크만 보기</label>
      <button v-if="loadedBbox !== bbox && bbox && !loading" class="taste-reload" @click="load">이 지도에서 다시 찾기</button>
      <p v-if="loading" role="status">불러오는 중…</p>
      <div v-else-if="error" role="alert"><p>취향 장소를 불러오지 못했습니다.</p><button class="taste-reload" @click="load">다시 시도</button></div>
      <p v-else-if="!bbox">지도를 움직여 탐색할 지역을 선택해 주세요.</p>
      <p v-else-if="!places.length">이 지역에 표시할 선호 장소가 없어요.</p>
      <div v-else class="taste-list">
        <button v-for="item in places" :key="`${item.first.provider}:${item.first.externalPlaceId}`" data-testid="taste-place" @click="select(item.first.provider, item.first.externalPlaceId)">
          <img v-if="item.first.thumbnailUrl" :src="item.first.thumbnailUrl" alt="" loading="lazy" />
          <span v-else class="taste-placeholder material-symbols-rounded" aria-hidden="true">landscape</span>
          <span><strong data-no-translate>{{ item.first.name }}</strong><small>{{ formatUiText('{0}명이 좋아해요', '{0} members liked this', [item.members.length]) }}</small></span>
          <span class="material-symbols-rounded taste-heart" aria-hidden="true">{{ item.members.some(m => m.reaction === 'SUPER_LIKE') ? 'star' : 'favorite' }}</span>
        </button>
      </div>
      <footer>공개 범위에 따라 최대 200개 장소를 표시합니다.</footer>
    </section>
  </div>
</template>

<style scoped>
.map-taste-control { position: relative; }
.taste-toggle { display:flex; align-items:center; gap:6px; min-height:40px; padding:8px 14px; border:1px solid #d7e7f3; border-radius:999px; background:#fff; color:#4d7698; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.taste-toggle.active { background:#e8f4ff; border-color:#98c9ec; }
.taste-toggle .material-symbols-rounded { font-size:18px; }
.taste-panel { position:absolute; top:calc(100% + 10px); right:0; width:330px; padding:18px; border:1px solid #dbe8f2; border-radius:22px; background:#fff; color:#354e65; box-shadow:0 12px 36px #254c721a; max-height:70svh; overflow:auto; }
header { display:flex; align-items:center; justify-content:space-between; } header strong { font-size:16px; }
.taste-panel p, footer { font-size:12px; line-height:1.6; color:#73889b; }
.taste-panel button { cursor:pointer; font-family:inherit; }
.taste-close { border:0; border-radius:50%; width:30px; height:30px; font-size:22px; color:#607c92; background:#f1f7fb; }
.taste-tabs { display:flex; background:#f0f6fb; border-radius:999px; padding:3px; }
.taste-tabs button { flex:1; border:0; background:transparent; color:#627b91; padding:9px 3px; border-radius:999px; font-size:12px; white-space:nowrap; }
.taste-tabs button[aria-pressed=true] { background:#ddecfa; color:#286da3; font-weight:700; }
.taste-super { display:flex; align-items:center; gap:6px; font-size:12px; margin:14px 0; cursor:pointer; }
.taste-super input { accent-color:#4a8bc0; }
.taste-members { display:flex; gap:7px; margin-top:12px; flex-wrap:wrap; }
.taste-members button { width:34px; height:34px; padding:0; border:2px solid transparent; border-radius:50%; color:#62819d; background:#eff6fc; font-size:11px; overflow:hidden; }
.taste-members button[aria-pressed=true] { border-color:#5c9ed0; }
.taste-members img { width:100%; height:100%; object-fit:cover; }
.taste-reload { border:1px solid #cce2f3; border-radius:999px; padding:8px 12px; background:#eff7ff; color:#417ba7; font-size:12px; }
.taste-list { display:grid; gap:8px; max-height:280px; overflow:auto; margin:12px 0; }
.taste-list button { display:flex; align-items:center; gap:10px; padding:8px; border:1px solid #e7eff5; background:#fff; border-radius:14px; text-align:left; color:inherit; }
.taste-list button:hover { background:#f5faff; }
.taste-list img, .taste-placeholder { width:48px; height:48px; border-radius:10px; object-fit:cover; flex-shrink:0; background:#eef6fc; }
.taste-placeholder { display:grid; place-items:center; color:#9ab8ce; }
.taste-list strong { display:block; font-size:13px; overflow-wrap:anywhere; }
.taste-list small { display:block; font-size:11px; margin-top:4px; color:#8194a5; }
.taste-heart { color:#e28f9f; font-size:18px; margin-left:auto; }
footer { margin-top:10px; padding:0; min-height:0; height:auto; background:none; border:0; text-align:left; font-size:11px; }
button:focus-visible { outline:2px solid #488fc4; outline-offset:3px; }
@media(max-width:767px) { .taste-panel { position:fixed; top:auto; bottom:calc(80px + env(safe-area-inset-bottom)); left:12px; right:12px; width:auto; max-height:calc(100svh - 240px); } .taste-toggle { padding:7px 10px; font-size:12px; } }
</style>
