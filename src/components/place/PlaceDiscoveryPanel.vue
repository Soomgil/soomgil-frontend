<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { placeApi } from '@/api/place.api'
import { swipeApi } from '@/api/swipe.api'
import type { Place, PlaceRecommendation } from '@/types/place'
import type { RecommendationTab } from '@/types/swipe'

type DiscoveryMode = 'search' | 'basic' | 'super-like'
type DiscoveryItem = { place: Place; recommendation?: PlaceRecommendation }

const props = defineProps<{ tripId: string; bbox: string }>()
const emit = defineEmits<{
  select: [place: Place, recommendation?: PlaceRecommendation]
}>()

const mode = ref<DiscoveryMode>('basic')
const query = ref('')
const items = ref<DiscoveryItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const detailLoadingKey = ref<string | null>(null)
let requestRevision = 0

const emptyMessage = computed(() => mode.value === 'search' ? '검색 결과가 없습니다.' : '추천 장소가 아직 없습니다.')
function placeKey(place: Place) {
  return `${place.provider}:${place.externalPlaceId}`
}

function matchText(item: DiscoveryItem) {
  const count = item.recommendation?.matchedMemberCount ?? item.recommendation?.matchedMembers.length ?? 0
  const total = item.recommendation?.totalMemberCount ?? 0
  if (count === 0) return item.recommendation?.recommendationReason || ''
  if (total > 0 && count === total) return '모든 멤버의 취향과 잘 맞아요'
  if (total > 0) return `${count}/${total}명의 취향과 잘 맞아요`
  return `${count}명의 멤버가 좋아하는 곳`
}

function matchTierClass(pct: number | null | undefined) {
  if (pct == null) return 'tier-base'
  if (pct >= 80) return 'tier-high'
  if (pct >= 60) return 'tier-mid'
  if (pct >= 40) return 'tier-low'
  return 'tier-base'
}

function displayImageUrl(url?: string | null) {
  const trimmed = url?.trim()
  if (!trimmed) return ''
  if (trimmed.includes('cdn.soomgil.test')) return ''
  if (/^(https?:|data:|blob:|\/)/.test(trimmed)) return trimmed
  return `/${trimmed.replace(/^\.?\//, '')}`
}

function placeImage(place: Place) {
  return displayImageUrl(place.thumbnailUrl) || displayImageUrl(place.photos?.find(Boolean))
}

function bboxCenter(bbox: string) {
  const values = bbox.split(',').map(Number)
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return {}
  return {
    centerLng: (values[0] + values[2]) / 2,
    centerLat: (values[1] + values[3]) / 2,
  }
}

async function loadRecommendations(tab: RecommendationTab) {
  const bbox = props.bbox.trim()
  if (!bbox) {
    items.value = []
    error.value = null
    return
  }
  const revision = ++requestRevision
  loading.value = true
  error.value = null
  try {
    const response = await swipeApi.getRecommendations(props.tripId, {
      bbox,
      ...bboxCenter(bbox),
      tab,
      page: 0,
      size: 20,
    })
    if (revision !== requestRevision) return
    items.value = response.items.map((recommendation) => ({
      place: recommendation.place,
      recommendation,
    }))
  } catch {
    if (revision !== requestRevision) return
    items.value = []
    error.value = '추천 장소를 불러오지 못했습니다.'
  } finally {
    if (revision === requestRevision) loading.value = false
  }
}

async function submitSearch() {
  const revision = ++requestRevision
  loading.value = true
  error.value = null
  try {
    const response = await placeApi.search({
      q: query.value.trim() || undefined,
      bbox: props.bbox.trim() || undefined,
      page: 0,
      size: 20,
    })
    if (revision !== requestRevision) return
    items.value = response.items.map((place) => ({ place }))
  } catch {
    if (revision !== requestRevision) return
    items.value = []
    error.value = '장소 검색에 실패했습니다.'
  } finally {
    if (revision === requestRevision) loading.value = false
  }
}

async function changeMode(nextMode: DiscoveryMode) {
  if (mode.value === nextMode) return
  mode.value = nextMode
  items.value = []
  error.value = null
  if (nextMode === 'basic') await loadRecommendations('BASIC')
  if (nextMode === 'super-like') await loadRecommendations('SUPER_LIKE')
}

async function retry() {
  if (mode.value === 'search') await submitSearch()
  else await loadRecommendations(mode.value === 'basic' ? 'BASIC' : 'SUPER_LIKE')
}

async function selectPlace(item: DiscoveryItem) {
  const key = placeKey(item.place)
  if (detailLoadingKey.value) return
  detailLoadingKey.value = key
  error.value = null
  try {
    const detail = await placeApi.getPlace(item.place.provider, item.place.externalPlaceId)
    emit('select', detail, item.recommendation)
  } catch {
    error.value = '장소 상세 정보를 불러오지 못했습니다.'
  } finally {
    detailLoadingKey.value = null
  }
}

onMounted(() => {
  void loadRecommendations('BASIC')
})

watch(() => props.bbox, (bbox, previous) => {
  if (!bbox || bbox === previous || mode.value === 'search') return
  void loadRecommendations(mode.value === 'basic' ? 'BASIC' : 'SUPER_LIKE')
})
</script>

<template>
  <section class="discovery-panel" aria-label="장소 검색 및 추천">
    <div class="discovery-tabs" role="tablist" aria-label="장소 보기 방식">
      <button type="button" role="tab" data-mode="basic" :aria-selected="mode === 'basic'" @click="changeMode('basic')">
        <span class="material-symbols-rounded">recommend</span>기본 추천
      </button>
      <button type="button" role="tab" data-mode="super-like" :aria-selected="mode === 'super-like'" @click="changeMode('super-like')">
        <span class="material-symbols-rounded">star</span>슈퍼라이크
      </button>
      <button type="button" role="tab" data-mode="search" :aria-selected="mode === 'search'" @click="changeMode('search')">
        <span class="material-symbols-rounded">search</span>검색
      </button>
    </div>

    <form v-if="mode === 'search'" class="discovery-search" @submit.prevent="submitSearch">
      <span class="material-symbols-rounded" aria-hidden="true">search</span>
      <input v-model="query" type="search" placeholder="장소명 또는 지역 검색" aria-label="장소 검색어" />
      <button type="submit" :disabled="loading">검색</button>
    </form>

    <div v-if="loading" class="discovery-state" aria-live="polite">
      <span class="discovery-spinner" aria-hidden="true"></span>
      <span>불러오는 중</span>
    </div>

    <div v-else-if="error" class="discovery-state discovery-state--error" role="alert">
      <span>{{ error }}</span>
      <button type="button" data-action="retry" @click="retry">다시 시도</button>
    </div>

    <p v-else-if="items.length === 0" class="discovery-state">{{ emptyMessage }}</p>

    <ul v-else class="discovery-results">
      <li
        v-for="item in items"
        :key="placeKey(item.place)"
        class="discovery-result"
        :aria-busy="detailLoadingKey === placeKey(item.place)"
        @click="selectPlace(item)"
      >
        <div class="discovery-thumb">
          <img v-if="placeImage(item.place)" :src="placeImage(item.place)" :alt="item.place.placeName" />
          <span v-else class="material-symbols-rounded" aria-hidden="true">landscape</span>
        </div>
        <div class="discovery-copy">
          <div class="discovery-meta">
            <div
              v-if="item.recommendation?.matchPercentage != null"
              :class="['discovery-match-pill', matchTierClass(item.recommendation.matchPercentage)]"
              :title="`${item.recommendation.matchPercentage}% 일치`"
            >
              <span class="material-symbols-rounded discovery-match-icon full-heart">favorite</span>
              <strong class="discovery-match-value">{{ item.recommendation.matchPercentage }}%</strong>
              <span class="discovery-match-label">일치</span>
            </div>
          </div>
          <strong>{{ item.place.placeName }}</strong>
          <p>{{ item.place.address || '주소 정보 없음' }}</p>
          <div v-if="item.recommendation?.matchedMembers?.length" class="discovery-match-row">
            <div class="discovery-members">
              <span v-for="member in item.recommendation.matchedMembers.slice(0, 3)" :key="member.id">
                <img v-if="member.profileImageUrl" draggable="false" :src="member.profileImageUrl" alt="멤버 프로필" />
                <span v-else class="material-symbols-rounded" style="font-size: 16px;">person</span>
              </span>
            </div>
            <p class="discovery-reason">{{ matchText(item) }}</p>
          </div>
          <p v-else-if="item.recommendation?.recommendationReason" class="discovery-reason discovery-reason--standalone">
            {{ item.recommendation.recommendationReason }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.discovery-panel { display: flex; flex-direction: column; gap: 12px; min-width: 0; height: 100%; min-height: 0; }
.discovery-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--line); flex-shrink: 0; }
.discovery-tabs button { min-width: 0; height: 42px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; }
.discovery-tabs button[aria-selected="true"] { color: var(--violet); border-bottom-color: var(--violet); }
.discovery-tabs .material-symbols-rounded { font-size: 17px; }
.discovery-search { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; height: 44px; padding: 0 8px 0 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; flex-shrink: 0; }
.discovery-search input { min-width: 0; border: 0; outline: 0; font-size: 13px; }
.discovery-search button, .discovery-state button { border: 0; border-radius: 6px; padding: 7px 10px; background: var(--violet); color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; }
.discovery-state { flex: 1; min-height: 150px; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--muted); font-size: 13px; text-align: center; }
.discovery-state--error { flex-direction: column; color: var(--rose); }
.discovery-spinner { width: 20px; height: 20px; border: 2px solid var(--line); border-top-color: var(--violet); border-radius: 50%; animation: discovery-spin .8s linear infinite; }
.discovery-scheduled { display: inline-flex; align-items: center; gap: 3px; color: #059669; font-size: 10px; font-weight: 850; }
.discovery-scheduled .material-symbols-rounded { font-size: 14px; }
.discovery-results { width: calc(100% + 80px); margin: 0 -80px 0 0; padding: 0 80px 20px 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; overflow-x: hidden; list-style: none; scrollbar-width: none; -ms-overflow-style: none; min-height: 0; }
.discovery-results::-webkit-scrollbar { display: none; }
.discovery-result { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; min-height: 148px; padding: 14px 12px; border: 1px solid var(--line); border-radius: 12px; background: #fff; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease; }
.discovery-result:hover { border-color: rgba(124, 58, 237, .4); box-shadow: 0 10px 24px rgb(15 23 42 / 10%); }
.discovery-thumb { position: relative; width: 110px; height: 120px; border-radius: 8px; overflow: hidden; background: #eef2f7; color: var(--muted); align-self: center; flex-shrink: 0; }
.discovery-thumb img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.discovery-copy { min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.discovery-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 15px; font-weight: 700; margin-bottom: 2px; }
.discovery-copy p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
.discovery-match-row { align-items: center; display: flex; gap: 8px; justify-content: space-between; margin-top: 10px; min-width: 0; }
.discovery-copy .discovery-reason { color: var(--violet); flex: 1; font-weight: 800; font-size: 11px; margin: 0; min-width: 0; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.discovery-meta { display: flex; justify-content: flex-start; align-items: center; gap: 8px; margin-bottom: 5px; color: var(--muted); font-size: 11px; font-weight: 700; }
.discovery-match-pill { display: inline-flex; align-items: center; justify-content: center; gap: 3px; padding: 3px 8px 3px 6px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; flex-shrink: 0; line-height: 1; color: #fff; box-shadow: 0 3px 10px rgba(15, 23, 42, 0.14); }
.discovery-match-pill .discovery-match-icon { font-size: 13px; color: #ef4444; font-variation-settings: 'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 20; }
.discovery-match-pill .discovery-match-value { font-size: inherit; font-weight: inherit; letter-spacing: 0; color: inherit; }
.discovery-match-pill .discovery-match-label { font-size: inherit; font-weight: inherit; opacity: 0.92; color: inherit; }
.discovery-match-pill.tier-high { background: linear-gradient(135deg, #ff3d7f 0%, #8b5cf6 52%, #00b8d9 100%); }
.discovery-match-pill.tier-mid { background: linear-gradient(135deg, #2563eb 0%, #14b8a6 100%); }
.discovery-match-pill.tier-low { background: linear-gradient(135deg, #3b82f6 0%, #64748b 100%); }
.discovery-match-pill.tier-base { background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); }
.discovery-meta-left { display: flex; align-items: center; gap: 8px; }
.discovery-scheduled { display: inline-flex; align-items: center; gap: 3px; color: #059669; font-size: 10px; font-weight: 850; margin-left: auto; flex-shrink: 0; }
.discovery-scheduled .material-symbols-rounded { font-size: 14px; }
.discovery-members { display: flex; flex: 0 0 auto; }
.discovery-members > span { width: 26px; height: 26px; margin-left: -6px; border: 2px solid #fff; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--violet); color: #fff; font-size: 11px; font-weight: 800; }
.discovery-members > span img { width: 100%; height: 100%; object-fit: cover; }
.discovery-members > span:first-child { margin-left: 0; }
.discovery-members img { width: 100%; height: 100%; object-fit: cover; }
@keyframes discovery-spin { to { transform: rotate(360deg); } }
@media (max-width: 520px) { .discovery-result { grid-template-columns: 76px minmax(0, 1fr); min-height: 118px; } .discovery-thumb { width: 76px; height: 96px; } .discovery-tabs button { font-size: 11px; } .discovery-match-pill { font-size: 10px; padding: 3px 6px 3px 5px; } .discovery-match-pill .discovery-match-icon { font-size: 12px; } }
</style>
