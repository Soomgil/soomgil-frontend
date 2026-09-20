<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Place } from '@/types/place'

const props = defineProps<{ places: Place[], unsavedKeys?: Set<string> }>()
defineEmits<{ close: []; toggle: [place: Place] }>()

const searchQuery = ref('')
const appliedQuery = ref('')
const page = ref(1)
const pageSize = 10
const scrollContainer = ref<HTMLElement | null>(null)
function search() { appliedQuery.value = searchQuery.value; page.value = 1; scrollContainer.value?.scrollTo?.({ top: 0 }) }
function goToPage(value: number) { page.value = value; scrollContainer.value?.scrollTo?.({ top: 0 }) }

const failedImages = ref(new Set<string>())
const placeKey = (place: Place) => `${place.provider}:${place.externalPlaceId}`
function markImageFailed(place: Place) {
  failedImages.value = new Set(failedImages.value).add(placeKey(place))
}
const filteredPlaces = computed(() => {
  if (!appliedQuery.value.trim()) return props.places
  const q = appliedQuery.value.trim().toLowerCase()
  return props.places.filter((p) =>
    p.placeName.toLowerCase().includes(q) ||
    (p.address ?? '').toLowerCase().includes(q) ||
    (p.tags ?? []).some(t => t.toLowerCase().includes(q))
  )
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredPlaces.value.length / pageSize)))
const visiblePlaces = computed(() => filteredPlaces.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(totalPages, count => { page.value = Math.min(page.value, count) })
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="슈퍼라이크한 장소 모두 보기">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <div class="story-overlay-panel saved-board-panel">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>

      <div class="saved-board-content">
        <div class="saved-board-heading">
          <h2 class="mypage-section-title">
            <span class="material-symbols-rounded section-icon section-icon--sky" aria-hidden="true">star</span>슈퍼라이크한 장소
          </h2>
        </div>
        <form class="saved-board-search" role="search" @submit.prevent="search">
          <input type="search" v-model="searchQuery" placeholder="장소명, 지역, 태그로 검색" aria-label="장소명, 지역, 태그로 검색" />
          <button type="submit" aria-label="검색"><span class="material-symbols-rounded" aria-hidden="true">search</span>검색</button>
        </form>

        <div class="modal-scroll-container saved-note-board" ref="scrollContainer">
          <div class="mypage-places-grid">
            <div v-for="place in visiblePlaces" :key="placeKey(place)" class="mypage-place-card">
              <div class="place-img-wrap">
                <img v-if="place.thumbnailUrl && !failedImages.has(placeKey(place))" :src="place.thumbnailUrl" :alt="place.placeName" @error="markImageFailed(place)" />
                <span v-else class="place-image-placeholder" aria-hidden="true"><span class="material-symbols-rounded">landscape</span></span>
                <button type="button" class="place-super-like-btn" :aria-label="unsavedKeys?.has(placeKey(place)) ? '슈퍼라이크 다시 추가' : '슈퍼라이크 취소'" @click="$emit('toggle', place)" :class="{ 'is-unsaved': unsavedKeys?.has(placeKey(place)) }">
                  <span class="material-symbols-rounded">star</span>
                </button>
              </div>
              <div class="place-info-wrap">
                <h3 data-no-translate class="place-title-h3">{{ place.placeName }}</h3>
                <span data-no-translate class="place-region-category">{{ place.address }}</span>
                <p data-no-translate class="place-desc-text">{{ place.summary }}</p>
                <div class="place-tag-row">
                  <span v-for="tag in (place.tags ?? []).slice(0, 3)" :key="tag" class="place-tag-pill">#{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
          <p v-if="!filteredPlaces.length" class="saved-board-empty" role="status">검색 조건에 맞는 장소가 없습니다.</p>
        </div>
        <nav v-if="totalPages > 1" class="saved-board-pagination" aria-label="페이지 이동">
          <button type="button" :disabled="page === 1" aria-label="이전 페이지" @click="goToPage(page - 1)">‹</button>
          <span aria-live="polite">{{ page }} / {{ totalPages }}</span>
          <button type="button" :disabled="page === totalPages" aria-label="다음 페이지" @click="goToPage(page + 1)">›</button>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.saved-board-panel { width:min(960px,calc(100vw - 24px)); height:min(760px,92dvh); max-height:92dvh; background:#fff; border-radius:24px; overflow:hidden; }
.saved-board-content { display:flex; flex-direction:column; height:100%; max-height:92dvh; box-sizing:border-box; padding:28px; gap:18px; }
.saved-board-heading { padding-right:48px; flex-shrink:0; }
.saved-board-heading h2 { margin:0; font-size:20px; }
.saved-board-search { display:flex; gap:8px; padding:5px; background:#f4f9fd; border:1px solid #dceaf4; border-radius:999px; flex-shrink:0; }
.saved-board-search input { min-width:0; flex:1; width:100%; border:0; outline:none; background:transparent; padding:8px 12px; font:inherit; font-size:13px; }
.saved-board-search:focus-within { outline:2px solid #9cc9e8; outline-offset:2px; }
.saved-board-search button { display:flex; align-items:center; gap:5px; padding:9px 16px; border:0; border-radius:999px; background:#deeffb; color:#397dab; font-weight:600; cursor:pointer; white-space:nowrap; }
.saved-board-search .material-symbols-rounded { font-size:19px; }
.saved-note-board { flex:1; overflow-y:auto; min-height:0; padding:22px 18px; border:3px solid #d9c2a8; border-radius:18px; background-color:#ead8bd; background-image:radial-gradient(circle at 18% 24%,#fff7e985 0 1px,transparent 1.7px),radial-gradient(circle at 72% 64%,#b8916c24 0 1px,transparent 1.9px),radial-gradient(circle at 42% 78%,#fffaf08f 0 1.3px,transparent 2px),linear-gradient(115deg,#f1e2ca 0%,#e8d2b3 48%,#eedcc2 100%); background-size:15px 17px,19px 21px,25px 23px,100% 100%; box-shadow:inset 0 0 0 1px #fff9ed8c,inset 0 0 20px #9b795117; scrollbar-width:thin; }
.saved-note-board .mypage-places-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:22px 15px; }
.saved-note-board .mypage-place-card { --note-paper:#fff3a8; min-width:0; padding:9px 7px 10px; position:relative; overflow:visible; border:0; border-radius:2px 2px 11px 2px; background:linear-gradient(145deg,#ffffff66,transparent 38%),var(--note-paper); box-shadow:2px 5px 9px #314a6217; transform:rotate(-1.5deg); }
.saved-note-board .mypage-place-card:nth-child(6n+2) { --note-paper:#cfeeff; transform:rotate(1.5deg); }
.saved-note-board .mypage-place-card:nth-child(6n+3) { --note-paper:#ded8ff; transform:rotate(-.8deg); }
.saved-note-board .mypage-place-card:nth-child(6n+4) { --note-paper:#d5f3dc; transform:rotate(1deg); }
.saved-note-board .mypage-place-card:nth-child(6n+5) { --note-paper:#ffd8e7; transform:rotate(-1.2deg); }
.saved-note-board .mypage-place-card:nth-child(6n) { --note-paper:#ffd9c2; transform:rotate(.7deg); }
.saved-note-board .mypage-place-card::before { content:''; position:absolute; z-index:2; width:40px; height:14px; top:-7px; left:calc(50% - 20px); background:#ffffffa8; border:1px solid #ffffff66; transform:rotate(-5deg); pointer-events:none; }
.saved-note-board .place-img-wrap { height:auto; aspect-ratio:4/3; overflow:hidden; border-radius:2px; }
.saved-note-board .place-img-wrap img { width:100%; height:100%; object-fit:cover; }
.saved-note-board .place-info-wrap { padding:8px 2px 0; background:transparent; }
.saved-note-board .place-title-h3 { margin:0 0 4px; font-family:'Noto Serif KR',serif; font-size:13px; line-height:1.5; }
.saved-note-board .place-region-category { display:block; font-size:10px; color:#647c92; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.saved-note-board .place-desc-text,.saved-note-board .place-tag-row { display:none; }
.saved-note-board .place-super-like-btn { width:28px; height:28px; top:5px; right:5px; }
.place-image-placeholder { display:grid; place-items:center; width:100%; height:100%; background:#edf4f9; color:#7995ad; }
.saved-board-empty { text-align:center; padding:32px 0; color:#647c92; font-size:13px; }
.saved-board-pagination { display:flex; justify-content:center; align-items:center; gap:18px; flex-shrink:0; font-size:13px; color:#527f9f; }
.saved-board-pagination button { width:36px; height:36px; border:1px solid #dceaf4; border-radius:50%; background:#fff; color:#397dab; font-size:22px; cursor:pointer; }
.saved-board-pagination button:disabled { opacity:.35; cursor:default; }
@media(max-width:900px) { .saved-note-board .mypage-places-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
@media(max-width:760px) { .saved-board-content { padding:24px 16px 16px; gap:16px; }.saved-note-board .mypage-places-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px 12px; }.saved-note-board { padding:20px 13px; }.saved-board-heading h2 { font-size:17px; } }
@media(max-width:520px) { .saved-note-board .mypage-places-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
