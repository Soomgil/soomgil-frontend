<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { placeApi } from '@/api/place.api'
import { swipeApi } from '@/api/swipe.api'
import type { Place, PlaceRecommendation } from '@/types/place'
import type { RecommendationTab } from '@/types/swipe'

type DiscoveryMode = 'search' | 'basic' | 'super-like'
type DiscoveryItem = { place: Place; recommendation?: PlaceRecommendation }

const props = defineProps<{ tripId: string; bbox: string; scheduledPlaceKeys?: string[] }>()
const emit = defineEmits<{ select: [place: Place]; add: [place: Place] }>()

const mode = ref<DiscoveryMode>('basic')
const query = ref('')
const items = ref<DiscoveryItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const savedKeys = ref(new Set<string>())
const savingKeys = ref(new Set<string>())
const detailLoadingKey = ref<string | null>(null)

const emptyMessage = computed(() => mode.value === 'search' ? '검색 결과가 없습니다.' : '추천 장소가 아직 없습니다.')
const scheduledKeys = computed(() => new Set(props.scheduledPlaceKeys ?? []))

function placeKey(place: Place) {
  return `${place.provider}:${place.externalPlaceId}`
}

function matchText(item: DiscoveryItem) {
  const count = item.recommendation?.matchedMembers.length ?? 0
  if (count === 0) return item.recommendation?.recommendationReason || ''
  return `${count}명의 멤버가 좋아하는 곳`
}

function displayImageUrl(url?: string | null) {
  const trimmed = url?.trim()
  if (!trimmed) return ''
  if (/^(https?:|data:|blob:|\/)/.test(trimmed)) return trimmed
  return `/${trimmed.replace(/^\.?\//, '')}`
}

function placeImage(place: Place) {
  return displayImageUrl(place.thumbnailUrl) || displayImageUrl(place.photos?.find(Boolean))
}

async function loadRecommendations(tab: RecommendationTab) {
  loading.value = true
  error.value = null
  try {
    const response = await swipeApi.getRecommendations(props.tripId, {
      bbox: props.bbox,
      tab,
      page: 0,
      size: 20,
    })
    items.value = response.items.map((recommendation) => ({
      place: recommendation.place,
      recommendation,
    }))
  } catch {
    items.value = []
    error.value = '추천 장소를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

async function loadSavedPlaces() {
  try {
    const response = await swipeApi.listSaved(0, 100)
    savedKeys.value = new Set(response.items.map((item) => placeKey(item.place)))
  } catch {
    // 저장 목록 실패가 추천 장소 자체를 가리지 않도록 조용히 비워 둔다.
  }
}

async function submitSearch() {
  loading.value = true
  error.value = null
  try {
    const response = await placeApi.search({
      q: query.value.trim() || undefined,
      bbox: props.bbox,
      page: 0,
      size: 20,
    })
    items.value = response.items.map((place) => ({ place }))
  } catch {
    items.value = []
    error.value = '장소 검색에 실패했습니다.'
  } finally {
    loading.value = false
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

async function toggleSaved(place: Place) {
  const key = placeKey(place)
  if (savingKeys.value.has(key)) return
  savingKeys.value = new Set(savingKeys.value).add(key)
  try {
    if (savedKeys.value.has(key)) {
      await swipeApi.unsavePlace(place.provider, place.externalPlaceId)
      const next = new Set(savedKeys.value)
      next.delete(key)
      savedKeys.value = next
    } else {
      // 저장 API는 SUPER_LIKE 반응이 있는 장소만 허용한다.
      await swipeApi.react(place.provider, place.externalPlaceId, 'SUPER_LIKE')
      await swipeApi.savePlace(place.provider, place.externalPlaceId)
      savedKeys.value = new Set(savedKeys.value).add(key)
    }
  } catch {
    error.value = '장소 저장 상태를 변경하지 못했습니다.'
  } finally {
    const next = new Set(savingKeys.value)
    next.delete(key)
    savingKeys.value = next
  }
}

async function selectPlace(place: Place) {
  const key = placeKey(place)
  if (detailLoadingKey.value) return
  detailLoadingKey.value = key
  error.value = null
  try {
    const detail = await placeApi.getPlace(place.provider, place.externalPlaceId)
    emit('select', detail)
  } catch {
    error.value = '장소 상세 정보를 불러오지 못했습니다.'
  } finally {
    detailLoadingKey.value = null
  }
}

onMounted(() => {
  void Promise.all([loadRecommendations('BASIC'), loadSavedPlaces()])
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
        @click="selectPlace(item.place)"
      >
        <div class="discovery-thumb">
          <img v-if="placeImage(item.place)" :src="placeImage(item.place)" :alt="item.place.placeName" />
          <span v-else class="material-symbols-rounded" aria-hidden="true">landscape</span>
        </div>
        <div class="discovery-copy">
          <div class="discovery-meta">
            <div class="discovery-meta-left">
              <span>{{ item.place.category || '장소' }}</span>
              <span v-if="item.recommendation?.distanceMeters != null">{{ Math.round(item.recommendation.distanceMeters) }}m</span>
            </div>
            <span v-if="scheduledKeys.has(placeKey(item.place))" class="discovery-scheduled"><span class="material-symbols-rounded">check_circle</span>일정에 추가됨</span>
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
          </div>
        </div>
        <div class="discovery-actions">
          <button
            type="button"
            class="action-btn bookmark-btn btn-with-tooltip"
            :disabled="savingKeys.has(placeKey(item.place))"
            :aria-label="`${item.place.placeName} ${savedKeys.has(placeKey(item.place)) ? '저장 취소' : '저장'}`"
            @click.stop="toggleSaved(item.place)"
          >
            <span class="material-symbols-rounded">{{ savedKeys.has(placeKey(item.place)) ? 'bookmark' : 'bookmark_add' }}</span>
            <div class="btn-tooltip">{{ savedKeys.has(placeKey(item.place)) ? '저장 취소' : '장소 저장' }}</div>
          </button>
          <button
            type="button"
            class="action-btn add-btn btn-with-tooltip"
            :disabled="scheduledKeys.has(placeKey(item.place))"
            :aria-label="`${item.place.placeName} 일정에 추가`"
            :title="scheduledKeys.has(placeKey(item.place)) ? '이미 일정에 있는 장소' : '일정에 추가'"
            @click.stop="emit('add', item.place)"
          >
            <span class="material-symbols-rounded">add</span>
            <div class="btn-tooltip">일정에 추가</div>
          </button>
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
.discovery-scheduled { display: inline-flex; align-items: center; gap: 3px; margin-top: 5px; color: #059669; font-size: 10px; font-weight: 850; }
.discovery-scheduled .material-symbols-rounded { font-size: 14px; }
.discovery-results { width: calc(100% + 80px); margin: 0 -80px 0 0; padding: 0 80px 20px 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; overflow-x: hidden; list-style: none; scrollbar-width: none; -ms-overflow-style: none; min-height: 0; }
.discovery-results::-webkit-scrollbar { display: none; }
.discovery-result { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 14px; min-height: 134px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: #fff; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease; }
.discovery-result:hover { border-color: rgba(124, 58, 237, .4); box-shadow: 0 10px 24px rgb(15 23 42 / 10%); }
.discovery-thumb { position: relative; width: 110px; height: 110px; border-radius: 8px; overflow: hidden; background: #eef2f7; color: var(--muted); align-self: center; flex-shrink: 0; }
.discovery-thumb img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.discovery-copy { min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.discovery-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 15px; font-weight: 700; margin-bottom: 2px; }
.discovery-copy p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
.discovery-match-row { align-items: center; display: flex; gap: 8px; justify-content: space-between; margin-top: 10px; min-width: 0; }
.discovery-copy .discovery-reason { color: var(--violet); flex: 1; font-weight: 800; font-size: 11px; margin: 0; min-width: 0; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.discovery-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; color: var(--muted); font-size: 11px; font-weight: 700; }
.discovery-meta-left { display: flex; align-items: center; gap: 8px; }
.discovery-scheduled { display: inline-flex; align-items: center; gap: 3px; color: #059669; font-size: 10px; font-weight: 850; margin-left: auto; flex-shrink: 0; }
.discovery-scheduled .material-symbols-rounded { font-size: 14px; }
.discovery-actions { display: flex; flex-direction: column; gap: 8px; justify-content: center; }
.discovery-actions .action-btn { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; cursor: pointer; transition: transform .14s ease, box-shadow .14s ease, background .14s ease, border-color .14s ease, color .14s ease; border: 1px solid var(--line); }
.discovery-actions .action-btn.bookmark-btn { background: #fff; color: var(--violet); }
.discovery-actions .action-btn.bookmark-btn:hover { border-color: rgba(99, 102, 241, .45); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.discovery-actions .action-btn.add-btn { background: var(--violet); border-color: var(--violet); color: #fff; box-shadow: 0 4px 10px rgba(124, 58, 237, 0.2); }
.discovery-actions .action-btn.add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(124, 58, 237, 0.3); background: #6d28d9; border-color: #6d28d9; }
.discovery-actions .action-btn:disabled { cursor: default; color: #059669; background: #ecfdf5; border-color: #bbf7d0; box-shadow: none; opacity: .78; transform: none; }
.discovery-actions .material-symbols-rounded { font-size: 20px; }

/* Custom tooltips for action buttons */
.btn-with-tooltip { position: relative; }
.btn-tooltip { position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%) scale(0.95); background: var(--ink); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; pointer-events: none; opacity: 0; visibility: hidden; transition: all 0.15s ease; z-index: 100000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.btn-tooltip::after { content: ''; position: absolute; top: 50%; right: 100%; transform: translateY(-50%); border-width: 4px; border-style: solid; border-color: transparent var(--ink) transparent transparent; }
.btn-with-tooltip:hover .btn-tooltip { opacity: 1; visibility: visible; transform: translateY(-50%) scale(1); }
.discovery-members { display: flex; flex: 0 0 auto; }
.discovery-members > span { width: 26px; height: 26px; margin-left: -6px; border: 2px solid #fff; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--violet); color: #fff; font-size: 11px; font-weight: 800; }
.discovery-members > span img { width: 100%; height: 100%; object-fit: cover; }
.discovery-members > span:first-child { margin-left: 0; }
.discovery-members img { width: 100%; height: 100%; object-fit: cover; }
@keyframes discovery-spin { to { transform: rotate(360deg); } }
@media (max-width: 520px) { .discovery-result { grid-template-columns: 76px minmax(0, 1fr) auto; } .discovery-thumb { width: 76px; height: 86px; } .discovery-tabs button { font-size: 11px; } }
</style>
