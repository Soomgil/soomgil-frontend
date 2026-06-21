<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { placeApi } from '@/api/place.api'
import { swipeApi } from '@/api/swipe.api'
import type { Place, PlaceRecommendation } from '@/types/place'
import type { RecommendationTab } from '@/types/swipe'

type DiscoveryMode = 'search' | 'basic' | 'super-like'
type DiscoveryItem = { place: Place; recommendation?: PlaceRecommendation }

const props = defineProps<{ tripId: string; bbox: string }>()
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

function placeKey(place: Place) {
  return `${place.provider}:${place.externalPlaceId}`
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
  void loadRecommendations('BASIC')
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
          <img v-if="item.place.thumbnailUrl" :src="item.place.thumbnailUrl" :alt="item.place.placeName" />
          <span v-else class="material-symbols-rounded" aria-hidden="true">landscape</span>
        </div>
        <div class="discovery-copy">
          <div class="discovery-meta">
            <span>{{ item.place.category || '장소' }}</span>
            <span v-if="item.recommendation?.distanceMeters != null">{{ Math.round(item.recommendation.distanceMeters) }}m</span>
          </div>
          <strong>{{ item.place.placeName }}</strong>
          <p>{{ item.place.address || '주소 정보 없음' }}</p>
          <p v-if="item.recommendation?.recommendationReason" class="discovery-reason">
            {{ item.recommendation.recommendationReason }}
          </p>
          <div v-if="item.recommendation?.matchedMembers.length" class="discovery-members">
            <span v-for="member in item.recommendation.matchedMembers.slice(0, 3)" :key="member.id" :title="member.displayName">
              <img v-if="member.profileImageUrl" :src="member.profileImageUrl" :alt="member.displayName" />
              <span v-else>{{ member.displayName.slice(0, 1) }}</span>
            </span>
          </div>
        </div>
        <div class="discovery-actions">
          <button
            type="button"
            :disabled="savingKeys.has(placeKey(item.place))"
            :aria-label="`${item.place.placeName} ${savedKeys.has(placeKey(item.place)) ? '저장 취소' : '저장'}`"
            :title="savedKeys.has(placeKey(item.place)) ? '저장 취소' : '장소 저장'"
            @click.stop="toggleSaved(item.place)"
          >
            <span class="material-symbols-rounded">{{ savedKeys.has(placeKey(item.place)) ? 'bookmark' : 'bookmark_add' }}</span>
          </button>
          <button
            type="button"
            :aria-label="`${item.place.placeName} 일정에 추가`"
            title="일정에 추가"
            @click.stop="emit('add', item.place)"
          >
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.discovery-panel { display: grid; gap: 12px; min-width: 0; }
.discovery-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--line); }
.discovery-tabs button { min-width: 0; height: 42px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; }
.discovery-tabs button[aria-selected="true"] { color: var(--violet); border-bottom-color: var(--violet); }
.discovery-tabs .material-symbols-rounded { font-size: 17px; }
.discovery-search { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; height: 44px; padding: 0 8px 0 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.discovery-search input { min-width: 0; border: 0; outline: 0; font-size: 13px; }
.discovery-search button, .discovery-state button { border: 0; border-radius: 6px; padding: 7px 10px; background: var(--violet); color: #fff; font-size: 12px; font-weight: 800; cursor: pointer; }
.discovery-state { min-height: 150px; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--muted); font-size: 13px; text-align: center; }
.discovery-state--error { flex-direction: column; color: var(--rose); }
.discovery-spinner { width: 20px; height: 20px; border: 2px solid var(--line); border-top-color: var(--violet); border-radius: 50%; animation: discovery-spin .8s linear infinite; }
.discovery-results { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.discovery-result { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 10px; min-height: 92px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; cursor: pointer; }
.discovery-result:hover { border-color: rgba(124, 58, 237, .35); }
.discovery-thumb { width: 72px; height: 72px; border-radius: 6px; overflow: hidden; display: grid; place-items: center; background: #eef2f7; color: var(--muted); }
.discovery-thumb img { width: 100%; height: 100%; object-fit: cover; }
.discovery-copy { min-width: 0; }
.discovery-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 14px; }
.discovery-copy p { margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.discovery-copy .discovery-reason { color: var(--violet); font-weight: 700; }
.discovery-meta { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 3px; color: var(--muted); font-size: 10px; font-weight: 700; }
.discovery-actions { display: flex; flex-direction: column; gap: 6px; }
.discovery-actions button { width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 6px; display: grid; place-items: center; background: #fff; color: var(--violet); cursor: pointer; }
.discovery-actions .material-symbols-rounded { font-size: 18px; }
.discovery-members { display: flex; margin-top: 6px; }
.discovery-members > span { width: 22px; height: 22px; margin-left: -5px; border: 2px solid #fff; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--violet); color: #fff; font-size: 9px; font-weight: 800; }
.discovery-members > span:first-child { margin-left: 0; }
.discovery-members img { width: 100%; height: 100%; object-fit: cover; }
@keyframes discovery-spin { to { transform: rotate(360deg); } }
@media (max-width: 520px) { .discovery-result { grid-template-columns: 60px minmax(0, 1fr) auto; } .discovery-thumb { width: 60px; height: 68px; } .discovery-tabs button { font-size: 11px; } }
</style>
