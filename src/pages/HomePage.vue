<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import InkWashBackdrop from '@/components/layout/InkWashBackdrop.vue'
import { awardApi } from '@/api/award.api'
import type { AwardPhoto } from '@/types/award'
import { fitAwardPhoto } from '@/utils/awardPhotoLayout'
import inkMask from '@/assets/textures/ink-reveal-mask.png'

const router = useRouter()
const categories = [
  { key: '전체', icon: 'search', placeholder: '여행지, 계획, 커뮤니티 글, 유저를 검색하세요' },
  { key: '계획', icon: 'event_note', placeholder: '여행 계획 이름, 목적지로 검색' },
  { key: '여행지', icon: 'place', placeholder: '여행지 이름, 지역, 태그로 검색' },
  { key: '커뮤니티', icon: 'forum', placeholder: '여행기 제목, 내용, 태그로 검색' },
  { key: '유저', icon: 'group', placeholder: '사용자 이름으로 검색' },
]
const activeSearchTab = ref('전체')
const searchResultTabs: Record<string, string> = { 전체: '전체', 계획: '여행', 여행지: '장소', 커뮤니티: '여행기', 유저: '사용자' }
const placeholder = computed(() => categories.find((item) => item.key === activeSearchTab.value)?.placeholder)
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
const exploreQuery = computed(() => currentPhoto.value?.placeName?.trim() || currentPhoto.value?.regionName?.trim())
function explorePhoto() {
  if (exploreQuery.value) void router.push({ path: '/search', query: { q: exploreQuery.value, tab: '장소' } })
}
const galleryStage = ref<HTMLElement | null>(null)
const stageSize = ref({ width: 0, height: 0 })
const imageSizes = ref<Record<string, { width: number; height: number }>>({})
let resizeObserver: ResizeObserver | undefined
const photoSize = computed(() => {
  const natural = currentPhoto.value && imageSizes.value[currentPhoto.value.imageUrl]
  return natural ? fitAwardPhoto(natural.width, natural.height, stageSize.value.width, stageSize.value.height) : null
})
const photoStyle = computed(() => photoSize.value?.width ? { width: `${photoSize.value.width}px`, height: `${photoSize.value.height}px` } : undefined)
const captionStyle = computed(() => photoSize.value?.width ? { width: `${photoSize.value.width}px` } : undefined)

function measureStage() {
  if (galleryStage.value) stageSize.value = { width: galleryStage.value.clientWidth, height: galleryStage.value.clientHeight }
}
function handleImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  const url = image.getAttribute('src')
  if (url) imageSizes.value[url] = { width: image.naturalWidth, height: image.naturalHeight }
  measureStage()
}

function submitSearch(value = query.value) {
  const q = value.trim()
  if (!q) return
  recentSearches.value = [q, ...recentSearches.value.filter((item) => item !== q)].slice(0, 5)
  try { localStorage.setItem(historyKey, JSON.stringify(recentSearches.value)) } catch { /* 저장이 제한되어도 검색은 계속한다. */ }
  void router.push({ path: '/search', query: { q, tab: searchResultTabs[activeSearchTab.value] || '전체' } })
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
  measureStage()
  if (typeof ResizeObserver !== 'undefined' && galleryStage.value) {
    resizeObserver = new ResizeObserver(measureStage)
    resizeObserver.observe(galleryStage.value)
  }
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(historyKey) || '[]')
    if (Array.isArray(stored)) recentSearches.value = stored.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 5)
  } catch { /* 손상되거나 접근할 수 없는 검색 기록은 무시한다. */ }
  void loadPhotos()
})
onUnmounted(() => resizeObserver?.disconnect())
</script>


<template>
  <AppShell immersive paper>
    <section class="home-canvas" :style="{ '--ink-mask': `url(${inkMask})` }" aria-label="여행 검색과 수상작 감상">
      <InkWashBackdrop />
      <div class="home-search-position">
        <h1 class="home-sr-only">어디로 떠나고 싶으세요?</h1>
        <div class="home-search-categories" role="group" aria-label="검색 범위">
          <button v-for="category in categories" :key="category.key" type="button" class="home-search-cat"
            :class="{ active: activeSearchTab === category.key }" :aria-label="category.key + ' 검색'"
            :aria-pressed="activeSearchTab === category.key" @click="activeSearchTab = category.key">
            <span class="material-symbols-rounded" aria-hidden="true">{{ category.icon }}</span>{{ category.key }}
          </button>
        </div>
        <form class="home-search" role="search" aria-label="통합 검색" @submit.prevent="submitSearch()"
          @focusin="searchFocused = true" @focusout="handleFocusOut" @keydown.esc="searchFocused = false">
          <div class="home-search-capsule">
            <span class="material-symbols-rounded home-search-capsule-icon" aria-hidden="true">search</span>
            <input v-model="query" class="home-search-capsule-input" type="search" aria-label="검색어" :placeholder="placeholder"
              autocomplete="off" enterkeyhint="search" maxlength="200" />
            <button class="home-search-capsule-btn" type="submit" aria-label="검색">
              <span class="material-symbols-rounded" aria-hidden="true">search</span> 검색
            </button>
          </div>
          <div v-if="searchFocused && !query.trim() && recentSearches.length" class="home-search-history">
            <div class="home-search-history-heading"><span>최근 검색</span><button type="button" @click="clearHistory">전체 삭제</button></div>
            <ul aria-label="최근 검색어"><li v-for="recent in recentSearches" :key="recent"><button type="button" @click="submitSearch(recent)"><span class="material-symbols-rounded" aria-hidden="true">history</span>{{ recent }}</button></li></ul>
          </div>
        </form>
      </div>
      <div class="home-gallery">
        <div ref="galleryStage" class="home-backdrop">
          <div v-if="currentPhoto" class="home-ink-underlay" :style="photoStyle" aria-hidden="true"></div>
          <Transition name="home-photo">
            <img v-if="currentPhoto" :key="currentPhoto.imageUrl" :src="currentPhoto.imageUrl"
              :alt="currentPhoto.title || photoTitle" :style="photoStyle" fetchpriority="high" decoding="async"
              @load="handleImageLoad" @error="handleImageError" />
          </Transition>
          <div v-if="!currentPhoto" class="home-photo-status" role="status">
            <span class="material-symbols-rounded" aria-hidden="true">landscape</span>
            <p>{{ loading ? '대한민국의 풍경을 불러오는 중…' : failed ? '사진을 불러오지 못했어요. 검색은 바로 이용할 수 있어요.' : '새로운 풍경을 준비하고 있어요. 여행지를 검색해 보세요.' }}</p>
            <button v-if="failed && !loading" type="button" @click="loadPhotos">다시 불러오기</button>
          </div>
        </div>
        <div v-if="currentPhoto" class="home-artwork-footer" :style="captionStyle">
          <div class="home-artwork-info" aria-live="polite" aria-atomic="true">
            <p class="home-artwork-label">{{ currentPhoto.regionName || currentPhoto.filmLocation || '대한민국' }}</p>
            <h2 class="home-artwork-title">{{ photoTitle }}</h2>
            <p v-if="currentPhoto.title && currentPhoto.title !== photoTitle" class="home-artwork-caption">{{ currentPhoto.title }}</p>
            <button v-if="exploreQuery" class="home-explore-link" type="button" @click="explorePhoto">
              {{ currentPhoto.placeName?.trim() ? '이 여행지 둘러보기' : '이 지역 둘러보기' }}
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </button>
            <p class="home-artwork-credit">{{ photoCredit }}
              <a :href="currentPhoto.imageUrl" target="_blank" rel="noopener noreferrer" aria-label="수상작 원본 보기 (새 창)">원본 보기</a>
            </p>
          </div>
          <div v-if="photos.length > 1" class="home-photo-controls" role="group" aria-label="수상작 사진 전환">
            <span class="home-photo-count"><strong>{{ String(currentIndex + 1).padStart(2, '0') }}</strong><span aria-hidden="true"> / </span><span class="home-sr-only">전체</span>{{ String(photos.length).padStart(2, '0') }}</span>
            <button type="button" aria-label="이전 사진" @click="changePhoto(-1)"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></button>
            <button type="button" aria-label="다음 사진" @click="changePhoto(1)"><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>
          </div>
        </div>
      </div>
    </section>
  </AppShell>
</template>

<style scoped>
.home-canvas { position: relative; isolation: isolate; min-height: 100svh; display: flex; flex-direction: column; overflow: hidden; color: #26332e; background: #fafaf7; }
.home-canvas::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 48% 44%, rgb(219 224 207 / 20%), transparent 68%); }
.home-search-position { width: min(760px, calc(100% - 48px)); margin: 108px auto 32px; position: relative; z-index: 2; }
.home-search { width: min(680px, 100%); position: relative; margin: 0 auto; }
/* Category pills */
.home-search-categories {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 36px;
}
.home-search-cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #fff;
  font-size: 14px;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.25s ease;
  position: relative;
  white-space: nowrap;
}
.home-search-cat .material-symbols-rounded {
  font-size: 20px;
}
.home-search-cat:hover {
  border-color: rgba(0, 102, 255, 0.3);
  color: var(--violet);
  background: rgba(0, 102, 255, 0.02);
}
.home-search-cat.active {
  border-color: var(--violet);
  background: var(--violet);
  color: #fff;
  box-shadow: 0 6px 20px rgba(0, 102, 255, 0.2);
}
.home-search-cat.active .material-symbols-rounded {
  color: #fff;
}
.home-search-cat-new {
  position: absolute;
  top: -6px;
  right: -4px;
  background: var(--rose);
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: 999px;
  letter-spacing: 0.5px;
  line-height: 1;
}

/* Capsule search bar */
.home-search-capsule {
  display: flex;
  align-items: center;
  background: #fff;
  border: 2px solid var(--line);
  border-radius: 999px;
  padding: 6px 6px 6px 24px;
  box-shadow: 0 12px 40px rgba(0, 50, 150, 0.08);
  transition: border-color 0.25s, box-shadow 0.25s;
  max-width: 680px;
  margin: 0 auto;
}
.home-search-capsule:focus-within {
  border-color: var(--violet);
  box-shadow: 0 12px 40px rgba(0, 102, 255, 0.12), 0 0 0 4px rgba(0, 102, 255, 0.06);
}
.home-search-capsule-icon {
  color: var(--muted);
  font-size: 24px;
  flex-shrink: 0;
  transition: color 0.2s;
}
.home-search-capsule:focus-within .home-search-capsule-icon {
  color: var(--violet);
}
.home-search-capsule-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  padding: 12px 12px;
  background: transparent;
  color: var(--ink);
  min-width: 0;
}
.home-search-capsule-input::placeholder {
  color: var(--muted);
}
.home-search-capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 14px 32px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: box-shadow 0.25s, transform 0.25s;
  flex-shrink: 0;
}
.home-search-capsule-btn .material-symbols-rounded {
  font-size: 20px;
}
.home-search-capsule-btn:hover {
  box-shadow: 0 8px 24px rgba(0, 102, 255, 0.35);
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .home-search-hero { padding: 56px 16px 48px; }
  .home-search-categories { gap: 6px; flex-wrap: wrap; }
  .home-search-cat { padding: 8px 16px; font-size: 13px; }
  .home-search-cat .material-symbols-rounded { font-size: 18px; }
  .home-search-capsule { padding: 4px 4px 4px 16px; }
  .home-search-capsule-btn { padding: 12px 20px; font-size: 14px; }
  .home-search-capsule-btn span:last-child { display: none; }
}
@media (max-width: 480px) {
  .home-search-categories { gap: 4px; }
  .home-search-cat { padding: 7px 12px; font-size: 12px; }
}


.home-search-categories { margin-bottom: 16px; }
.home-search-cat:hover:not(.active) { background: #f3f7ff; }
.home-search-capsule { --ink: #17263b; --muted: #687586; --line: #e2e7ee; }
.home-gallery { width: min(1120px, calc(100% - 96px)); margin: 0 auto; padding-bottom: max(40px, env(safe-area-inset-bottom)); }
/* 전시 공간이 최소 목표 크기를 수용하고, 좁은 화면에서는 화면 경계를 우선한다. */
.home-backdrop { position: relative; display: grid; place-items: center; height: clamp(540px, calc(100svh - 340px), 680px); }
.home-backdrop img { grid-area: 1 / 1; display: block; width: auto; height: auto; max-width: 100%; max-height: 100%; object-fit: contain; mask-image: var(--ink-mask); mask-mode: luminance; mask-size: 100% 100%; mask-repeat: no-repeat; }
.home-ink-underlay { grid-area: 1 / 1; width: 80%; height: 90%; max-width: 100%; max-height: 100%; background: #777d6f; opacity: .12; transform: scale(1.06) rotate(-2deg); mask-image: var(--ink-mask); mask-mode: luminance; mask-size: 100% 100%; mask-repeat: no-repeat; pointer-events: none; }
.home-artwork-footer { display: flex; align-items: center; justify-content: space-between; gap: 32px; width: 940px; max-width: 100%; margin: 24px auto 0; }
.home-artwork-info { min-width: 0; }
.home-artwork-label { margin: 0 0 8px; font-size: 11px; font-weight: 400; letter-spacing: .08em; color: #6c786e; }
.home-artwork-title { margin: 0 0 8px; font-family: 'Noto Serif KR', 'Batang', '바탕', serif; font-size: clamp(23px, 2vw, 30px); font-weight: 500; line-height: 1.35; letter-spacing: -.02em; color: #263c31; overflow-wrap: anywhere; }
.home-artwork-caption { font-size: 12px; font-weight: 400; margin: 0 0 5px; color: #66756c; }
.home-explore-link { display: inline-flex; align-items: center; gap: 10px; margin: 2px 0 10px; min-height: 44px; padding: 0; border: 0; background: transparent; color: #345c42; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.home-explore-link:hover { color: #173e25; text-decoration: underline; text-underline-offset: 5px; }
.home-explore-link .material-symbols-rounded { font-size: 19px; }
.home-artwork-credit a { display: inline-block; color: inherit; text-decoration: underline; text-underline-offset: 3px; margin-left: 10px; padding-block: 6px; }
.home-artwork-credit { margin: 0; font-size: 11px; font-weight: 400; line-height: 1.7; color: #757e75; overflow-wrap: anywhere; }
.home-photo-controls { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.home-photo-count { font-size: 11px; font-variant-numeric: tabular-nums; letter-spacing: .12em; margin-right: 12px; color: #78837a; white-space: nowrap; }
.home-photo-count strong { color: #314a3b; font-weight: 600; }
.home-photo-controls button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid #d7ded4; border-radius: 50%; background: transparent; color: #314a3b; cursor: pointer; transition: background .2s; }
.home-photo-controls button:hover { background: #edf1e8; }
.home-photo-controls .material-symbols-rounded { font-size: 20px; }
.home-photo-status { text-align: center; font-size: 13px; font-weight: 400; line-height: 1.7; padding: 24px; color: #6c786e; }
.home-photo-status > .material-symbols-rounded { display: block; font-size: 36px; margin-bottom: 20px; color: #73786c; }
.home-photo-status p { margin: 0; }
.home-photo-status button { min-height: 44px; margin-top: 8px; padding: 8px 0; border: 0; background: transparent; color: #314a3b; font: inherit; text-decoration: underline; cursor: pointer; }
.home-search-history { position: absolute; top: calc(100% + 12px); left: 0; right: 0; padding: 18px; border-radius: 20px; background: #fff; box-shadow: 0 16px 40px rgb(0 0 0 / 18%); color: #24333c; }
.home-search-history-heading { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 8px; font-size: 13px; color: #62707b; }
.home-search-history button { border: 0; background: transparent; font: inherit; color: inherit; cursor: pointer; }
.home-search-history-heading button { min-height: 32px; }
.home-search-history ul { list-style: none; margin: 0; padding: 0; }
.home-search-history li button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 8px; text-align: left; border-radius: 10px; overflow-wrap: anywhere; }
.home-search-history li button:hover { background: #f1f5f8; }
.home-search-history .material-symbols-rounded { color: #7a8791; font-size: 20px; }
button:focus-visible { outline: 3px solid #a9d2ff; outline-offset: 3px; }
.home-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.home-photo-enter-active, .home-photo-leave-active { transition: opacity .5s ease; }
.home-photo-enter-from, .home-photo-leave-to { opacity: 0; }
@media (max-width: 767px) {
  .home-search-position { width: calc(100% - 32px); margin-top: 140px; margin-bottom: 24px; }
  .home-search-cat { min-height: 44px; }
  .home-gallery { width: calc(100% - 40px); padding-bottom: max(28px, env(safe-area-inset-bottom)); }
  .home-backdrop { height: clamp(300px, calc(100svh - 480px), 520px); }
  .home-artwork-footer { flex-wrap: wrap; gap: 20px; margin-top: 20px; }
  .home-artwork-info { flex-basis: 100%; }
  .home-photo-controls { margin-left: auto; }
  .home-search-history { max-height: 240px; overflow-y: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .home-photo-enter-active, .home-photo-leave-active, .home-photo-controls button,
  .home-search-cat, .home-search-capsule, .home-search-capsule-btn { transition: none; }
}
</style>
