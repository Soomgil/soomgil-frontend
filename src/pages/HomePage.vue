<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import { awardApi } from '@/api/award.api'
import type { AwardPhoto } from '@/types/award'

const router = useRouter()
const categories = ['전체', '계획', '여행지', '커뮤니티', '유저']
const activeSearchTab = ref('전체')
const query = ref('')
const searchFocused = ref(false)
const recentSearches = ref<string[]>([])
const historyKey = 'soomgil.home.recent-searches'
const photos = ref<AwardPhoto[]>([])
const currentIndex = ref(0)
const loading = ref(false)
const failed = ref(false)
const currentPhoto = computed(() => photos.value[currentIndex.value])
const photoTitle = computed(() => currentPhoto.value?.placeName || currentPhoto.value?.title || '대한민국의 풍경')
const photoCredit = computed(() => [currentPhoto.value?.photographer, currentPhoto.value?.awardDivision, '한국관광공사 관광사진 공모전'].filter(Boolean).join(' · '))

function submitSearch(value = query.value) {
  const q = value.trim()
  if (!q) return
  recentSearches.value = [q, ...recentSearches.value.filter((item) => item !== q)].slice(0, 5)
  try { localStorage.setItem(historyKey, JSON.stringify(recentSearches.value)) } catch { /* 저장이 제한되어도 검색은 계속한다. */ }
  void router.push({ path: '/search', query: { q, tab: activeSearchTab.value } })
}
function clearHistory() {
  recentSearches.value = []
  try { localStorage.removeItem(historyKey) } catch { /* 메모리의 검색 기록은 즉시 지운다. */ }
}
function handleFocusOut(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) searchFocused.value = false
}
function changePhoto(direction: number) {
  if (photos.value.length > 1) currentIndex.value = (currentIndex.value + direction + photos.value.length) % photos.value.length
}
function handleImageError(event: Event) {
  const imageUrl = (event.target as HTMLImageElement).getAttribute('src')
  const photo = photos.value.find((item) => item.imageUrl === imageUrl)
  if (!photo) return
  const active = currentPhoto.value
  photos.value = photos.value.filter((item) => item !== photo)
  currentIndex.value = Math.max(0, active && active !== photo ? photos.value.indexOf(active) : currentIndex.value % (photos.value.length || 1))
  if (!photos.value.length) failed.value = true
}
async function loadPhotos() {
  if (loading.value) return
  loading.value = true
  failed.value = false
  try {
    photos.value = (await awardApi.getAwardPhotos({ limit: 5 })).filter((photo) => Boolean(photo.imageUrl))
    currentIndex.value = 0
  } catch { failed.value = true } finally { loading.value = false }
}
onMounted(() => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(historyKey) || '[]')
    if (Array.isArray(stored)) recentSearches.value = stored.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 5)
  } catch { /* 손상되거나 접근할 수 없는 검색 기록은 무시한다. */ }
  void loadPhotos()
})
</script>

<template>
  <AppShell immersive>
    <section class="home-canvas" aria-label="여행 검색과 수상작 감상">
      <div class="home-backdrop">
        <Transition name="home-photo">
          <img v-if="currentPhoto" :key="currentPhoto.imageUrl" :src="currentPhoto.imageUrl"
            :alt="currentPhoto.title || photoTitle" fetchpriority="high" decoding="async"
            @error="handleImageError" />
        </Transition>
      </div>
      <div class="home-shade" aria-hidden="true"></div>
      <div class="home-search-position">
        <h1 class="home-sr-only">어디로 떠나고 싶으세요?</h1>
        <form class="home-search" role="search" aria-label="통합 검색" @submit.prevent="submitSearch()"
          @focusin="searchFocused = true" @focusout="handleFocusOut" @keydown.esc="searchFocused = false">
          <div class="home-search-bar">
            <label class="home-search-scope">
              <span class="home-sr-only">검색 범위</span>
              <select v-model="activeSearchTab"><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select>
              <span class="material-symbols-rounded" aria-hidden="true">expand_more</span>
            </label>
            <input v-model="query" type="search" aria-label="검색어" placeholder="어디로 떠나고 싶으세요?"
              autocomplete="off" enterkeyhint="search" maxlength="200" />
            <button class="home-search-submit" type="submit" aria-label="검색">
              <span class="material-symbols-rounded" aria-hidden="true">search</span><span class="home-search-submit-text">검색</span>
            </button>
          </div>
          <div v-if="searchFocused && !query.trim() && recentSearches.length" class="home-search-history">
            <div class="home-search-history-heading"><span>최근 검색</span><button type="button" @click="clearHistory">전체 삭제</button></div>
            <ul aria-label="최근 검색어"><li v-for="recent in recentSearches" :key="recent"><button type="button" @click="submitSearch(recent)"><span class="material-symbols-rounded" aria-hidden="true">history</span>{{ recent }}</button></li></ul>
          </div>
        </form>
      </div>
      <div class="home-artwork-footer">
        <div v-if="currentPhoto" class="home-artwork-info" aria-live="polite" aria-atomic="true">
          <p class="home-artwork-label"><span class="material-symbols-rounded" aria-hidden="true">location_on</span>{{ currentPhoto.regionName || currentPhoto.filmLocation || '대한민국' }}</p>
          <h2 class="home-artwork-title">{{ photoTitle }}</h2>
          <p v-if="currentPhoto.title && currentPhoto.title !== photoTitle" class="home-artwork-caption">{{ currentPhoto.title }}</p>
          <p class="home-artwork-credit">{{ photoCredit }}</p>
        </div>
        <div v-else class="home-photo-status" role="status">
          <p>{{ loading ? '대한민국의 풍경을 불러오는 중…' : failed ? '사진을 불러오지 못했어요. 검색은 바로 이용할 수 있어요.' : '새로운 풍경을 준비하고 있어요. 여행지를 검색해 보세요.' }}</p>
          <button v-if="failed && !loading" type="button" @click="loadPhotos">다시 불러오기</button>
        </div>
        <div v-if="photos.length > 1" class="home-photo-controls" role="group" aria-label="수상작 사진 전환">
          <span class="home-photo-count"><strong>{{ String(currentIndex + 1).padStart(2, '0') }}</strong><span aria-hidden="true"> / </span><span class="home-sr-only">전체</span>{{ String(photos.length).padStart(2, '0') }}</span>
          <button type="button" aria-label="이전 사진" @click="changePhoto(-1)"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></button>
          <button type="button" aria-label="다음 사진" @click="changePhoto(1)"><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>
        </div>
      </div>
    </section>
  </AppShell>
</template>

<style scoped>
.home-canvas { position: relative; isolation: isolate; min-height: 100svh; min-height: 100dvh; display: flex; flex-direction: column; color: #fff; background: #203e44; }
.home-backdrop, .home-shade { position: absolute; inset: 0; pointer-events: none; z-index: -1; }
.home-backdrop { overflow: hidden; background: radial-gradient(ellipse at 65% 25%, #6e9290, transparent 65%), linear-gradient(145deg, #24434d, #172f35); }
.home-backdrop img { position: absolute; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.home-shade { background: linear-gradient(180deg, rgb(5 18 22 / 65%), transparent 25%, transparent 55%, rgb(5 18 22 / 78%)); }
.home-search-position { width: min(720px, calc(100% - 80px)); margin: max(180px, calc(40svh - 36px)) auto 72px; position: relative; z-index: 2; }
.home-search { width: 100%; position: relative; }
.home-search-bar { display: flex; align-items: center; gap: 12px; min-height: 72px; padding: 8px; border: 1px solid rgb(255 255 255 / 75%); border-radius: 22px; background: #fff; box-shadow: 0 12px 48px rgb(0 0 0 / 18%); color: #24333c; }
.home-search-bar:focus-within { outline: 3px solid #b9d8ff; outline-offset: 4px; }
.home-search-scope { display: flex; position: relative; align-items: center; padding-right: 16px; margin-left: 12px; border-right: 1px solid #e3e7eb; }
.home-search-scope select { appearance: none; border: 0; background: transparent; color: #384652; font: inherit; font-size: 14px; font-weight: 650; padding: 12px 24px 12px 0; max-width: 120px; cursor: pointer; }
.home-search-scope > .material-symbols-rounded { position: absolute; right: 14px; pointer-events: none; font-size: 20px; }
.home-search-bar input { min-width: 0; flex: 1; width: 100%; border: 0; outline: none; box-shadow: none; background: transparent; padding: 12px 0; font: inherit; font-size: 17px; color: #1e2a35; }
.home-search-bar input::placeholder { color: #717b85; }
.home-search-submit { display: flex; justify-content: center; align-items: center; gap: 7px; flex-shrink: 0; border: 0; border-radius: 16px; background: var(--violet, #06f); color: #fff; min-height: 54px; padding: 0 22px; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
.home-search-submit:hover { filter: brightness(.92); }
.home-search-history { position: absolute; top: calc(100% + 12px); left: 0; right: 0; padding: 18px; border-radius: 20px; background: #fff; box-shadow: 0 16px 40px rgb(0 0 0 / 18%); color: #24333c; }
.home-search-history-heading { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 8px; font-size: 13px; color: #62707b; }
.home-search-history button { border: 0; background: transparent; font: inherit; color: inherit; cursor: pointer; }
.home-search-history-heading button { min-height: 32px; }
.home-search-history ul { list-style: none; margin: 0; padding: 0; }
.home-search-history li button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 8px; text-align: left; border-radius: 10px; overflow-wrap: anywhere; }
.home-search-history li button:hover { background: #f1f5f8; }
.home-search-history .material-symbols-rounded { color: #7a8791; font-size: 20px; }
.home-artwork-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; margin-top: auto; padding: 32px 56px max(40px, env(safe-area-inset-bottom)); }
.home-artwork-info { max-width: 700px; min-width: 0; text-shadow: 0 2px 16px rgb(0 0 0 / 30%); }
.home-artwork-label { display: flex; align-items: center; gap: 5px; margin: 0 0 10px; font-size: 13px; font-weight: 500; letter-spacing: .04em; }
.home-artwork-label .material-symbols-rounded { font-size: 17px; }
.home-artwork-title { margin: 0 0 12px; font-size: clamp(28px, 3vw, 44px); font-weight: 550; line-height: 1.2; letter-spacing: -.035em; color: #fff; overflow-wrap: anywhere; }
.home-artwork-caption { font-size: 13px; margin: 0 0 6px; }
.home-artwork-credit { margin: 0; font-size: 12px; line-height: 1.7; color: #e2e8e9; overflow-wrap: anywhere; }
.home-photo-controls { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.home-photo-count { font-size: 12px; font-variant-numeric: tabular-nums; letter-spacing: .12em; margin-right: 16px; color: #d6e0e2; }
.home-photo-count strong { color: #fff; font-weight: 650; }
.home-photo-controls button { display: grid; place-items: center; width: 48px; height: 48px; padding: 0; border: 1px solid rgb(255 255 255 / 45%); border-radius: 50%; background: rgb(10 25 30 / 20%); color: #fff; cursor: pointer; transition: background .2s; }
.home-photo-controls button:hover { background: rgb(255 255 255 / 20%); }
.home-photo-controls .material-symbols-rounded { font-size: 21px; }
.home-photo-status { font-size: 13px; line-height: 1.7; }
.home-photo-status p { margin: 0; }
.home-photo-status button { margin-top: 8px; padding: 8px 0; border: 0; background: transparent; color: #fff; font: inherit; text-decoration: underline; cursor: pointer; }
button:focus-visible, select:focus-visible { outline: 3px solid #a9d2ff; outline-offset: 3px; }
.home-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.home-photo-enter-active, .home-photo-leave-active { transition: opacity .65s ease; }
.home-photo-enter-from, .home-photo-leave-to { opacity: 0; }
@media (max-width: 767px) {
  .home-search-position { width: calc(100% - 40px); margin-top: max(190px, calc(38svh - 32px)); margin-bottom: 60px; }
  .home-search-bar { min-height: 64px; border-radius: 19px; gap: 8px; }
  .home-search-bar input { font-size: 16px; padding-left: 12px; }
  .home-search-scope { display: none; margin-left: 6px; padding-right: 8px; }
  .home-search:focus-within .home-search-scope { display: flex; }
  .home-search-scope select { font-size: 12px; max-width: 90px; }
  .home-search-scope > .material-symbols-rounded { right: 6px; }
  .home-search-submit { width: 46px; min-height: 46px; padding: 0; border-radius: 13px; }
  .home-search-submit-text { display: none; }
  .home-artwork-footer { padding: 24px 24px max(28px, env(safe-area-inset-bottom)); flex-wrap: wrap; gap: 24px; }
  .home-artwork-info { flex-basis: 100%; }
  .home-artwork-title { font-size: 30px; }
  .home-artwork-credit { font-size: 11px; }
  .home-photo-controls { margin-left: auto; }
  .home-photo-controls button { width: 44px; height: 44px; }
  .home-search-history { max-height: 240px; overflow-y: auto; }
  .home-canvas:has(.home-search:focus-within) .home-search-position { margin-top: 160px; }
}
@media (prefers-reduced-motion: reduce) {
  .home-photo-enter-active, .home-photo-leave-active, .home-photo-controls button { transition: none; }
}
</style>
