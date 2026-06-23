<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import { tripApi, type NearestTripDto } from '@/api/trip.api'
import { communityApi } from '@/api/community.api'
import { placeApi } from '@/api/place.api'
import { useAuthStore } from '@/stores/auth.store'
import type { TripSummary, TripDetailMember } from '@/types/trip'
import type { CommunityPostSummary } from '@/types/community'
import type { Place } from '@/types/place'

const router = useRouter()
const authStore = useAuthStore()

/* ── Search ────────────────────────────────────────────── */
const searchCategories: { key: string; icon: string; isNew?: boolean }[] = [
  { key: '전체', icon: 'search' },
  { key: '계획', icon: 'event_note' },
  { key: '여행지', icon: 'place' },
  { key: '커뮤니티', icon: 'forum' },
  { key: '유저', icon: 'group' },
]
const activeSearchTab = ref('전체')
const homeSearchQuery = ref('')

function submitSearch() {
  const q = homeSearchQuery.value.trim()
  if (!q) return
  router.push({ path: '/search', query: { q, tab: activeSearchTab.value } })
}

function openTripCreation(intent: 'route' | 'ai' = 'route') {
  void router.push({ path: '/my-trips', query: { create: '1', intent } })
}

function openTripSelection(intent: 'invite' | 'share') {
  void router.push({ path: '/my-trips', query: { intent } })
}

/* ── Hero Carousel ───────────────────────────────────── */
const slides = computed(() => {
  const storySlides = featuredStories.value.flatMap((story) => {
    const image = story.coverMedia?.servingUrl ?? story.coverMedia?.publicUrl
    return image ? [{ image, title: story.title, subtitle: story.summary ?? '여행자의 새로운 이야기', tag: 'story', tagLabel: '여행기' }] : []
  })
  const placeSlides = topPlaces.value.flatMap((place) => place.thumbnailUrl ? [{
    image: place.thumbnailUrl,
    title: place.placeName,
    subtitle: place.summary ?? place.address ?? '이번 주 인기 여행지',
    tag: 'place',
    tagLabel: '인기 장소',
  }] : [])
  return [...storySlides, ...placeSlides].slice(0, 5)
})

const currentSlide = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

function nextSlide() {
  if (slides.value.length > 1) currentSlide.value = (currentSlide.value + 1) % slides.value.length
}

function goToSlide(index: number) {
  currentSlide.value = index
  resetCarouselTimer()
}

function resetCarouselTimer() {
  if (carouselTimer) clearInterval(carouselTimer)
  if (slides.value.length > 1) carouselTimer = setInterval(nextSlide, 4500)
}

onMounted(() => {
  resetCarouselTimer()
  fetchHomeData()
})

onUnmounted(() => {
  if (carouselTimer) clearInterval(carouselTimer)
})

/* ── Super-like Top 3 ────────────────────────────────── */
const topPlaces = ref<Place[]>([])
const topPlacesLoading = ref(true)

/* ── Nearest Trip ────────────────────────────────────── */
const nearestTrip = ref<NearestTripDto | null>(null)
const nearestTripLoading = ref(true)

/* ── Community Stories (Top 3) ───────────────────────── */
const featuredStories = ref<CommunityPostSummary[]>([])
const featuredStoriesLoading = ref(true)

async function fetchHomeData() {
  try {
    const [placesRes, storiesRes] = await Promise.allSettled([
      placeApi.getPopularPlaces(3),
      communityApi.getPosts({ size: 3, sort: ['likes,desc'] })
    ])

    if (placesRes.status === 'fulfilled') {
      topPlaces.value = placesRes.value
    } else {
      console.error('Failed to load top places', placesRes.reason)
    }

    if (authStore.isAuthenticated) {
      try {
        nearestTrip.value = await tripApi.getNearestTrip()
      } catch (e) {
        console.error('Failed to load nearest trip', e)
      }
    } else {
      nearestTrip.value = null
    }

    if (storiesRes.status === 'fulfilled') {
      featuredStories.value = storiesRes.value.items
    } else {
      console.error('Failed to load stories', storiesRes.reason)
    }
    currentSlide.value = 0
    resetCarouselTimer()
  } catch (error) {
    console.error('Failed to fetch home data', error)
  } finally {
    topPlacesLoading.value = false
    nearestTripLoading.value = false
    featuredStoriesLoading.value = false
  }
}
</script>

<template>
  <AppShell>
    <main>
      <!-- Search Hero Section (outside content-container) -->
      <section class="home-search-hero">
        <div class="home-search-hero-inner">
          <h2 class="home-search-hero-title">어떤 여행을 찾고 계신가요?</h2>
          <p class="home-search-hero-sub">지금 바로 검색해서 시작해보세요</p>

          <div class="home-search-categories" role="tablist">
            <button
              v-for="cat in searchCategories"
              :key="cat.key"
              type="button"
              role="tab"
              class="home-search-cat"
              :class="{ active: activeSearchTab === cat.key }"
              @click="activeSearchTab = cat.key"
            >
              <span class="material-symbols-rounded">{{ cat.icon }}</span>
              <span>{{ cat.key }}</span>
              <span v-if="cat.isNew" class="home-search-cat-new">NEW</span>
            </button>
          </div>

          <div class="home-search-capsule">
            <span class="material-symbols-rounded home-search-capsule-icon">search</span>
            <input
              v-model="homeSearchQuery"
              type="search"
              class="home-search-capsule-input"
              :placeholder="{
                '전체': '여행지, 계획, 커뮤니티 글, 유저를 검색하세요',
                '계획': '여행 계획 이름, 목적지로 검색',
                '여행지': '여행지 이름, 지역, 태그로 검색',
                '커뮤니티': '여행기 제목, 내용, 태그로 검색',
                '유저': '사용자 이름으로 검색',
              }[activeSearchTab]"
              aria-label="검색"
              @keydown.enter.prevent="submitSearch"
            />
            <button type="button" class="home-search-capsule-btn" @click="submitSearch">
              <span class="material-symbols-rounded">search</span> 검색
            </button>
          </div>
        </div>
      </section>

      <div class="content-container">
      <section class="section service-home-page">

        <!-- 2. Hero Section -->
        <div class="home-hero">
          <div class="home-hero-copy">
            <p class="eyebrow">
              <span class="material-symbols-rounded" style="font-size:16px; vertical-align:middle">flight_takeoff</span>
              Welcome Back
            </p>
            <h1><span>여행의 시작은</span><br>설렘에서부터</h1>
            <p class="lead">새로운 루트를 만들고, 우리만의 여행을 기록해보세요.</p>
            <div style="display:flex; gap:12px;">
              <button class="btn primary" type="button" @click="openTripCreation('route')">
                <span class="material-symbols-rounded">add</span>새 여행 만들기
              </button>
              <a class="btn ghost" href="#" @click.prevent="router.push('/community')">둘러보기</a>
            </div>
          </div>
          <div class="home-hero-content">
            <div v-if="slides.length === 0" class="home-section-state home-section-state--wide">
              <span class="material-symbols-rounded home-section-state-icon">landscape</span>
              <p>추천 콘텐츠를 준비하고 있어요.</p>
            </div>
            <div
              v-for="(slide, i) in slides"
              :key="i"
              class="home-hero-slide"
              :class="{ 'is-active': currentSlide === i }"
            >
              <img :src="slide.image" :alt="slide.title" />
              <div class="home-hero-card-overlay">
                <span class="card-tag" :class="'tag-' + slide.tag">{{ slide.tagLabel }}</span>
                <h3>{{ slide.title }}</h3>
                <p>{{ slide.subtitle }}</p>
              </div>
            </div>

            <!-- Carousel dots -->
            <div v-if="slides.length > 1" class="home-hero-dots" style="position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 2;">
              <button
                v-for="(_, i) in slides"
                :key="i"
                type="button"
                style="width: 8px; height: 8px; border-radius: 50%; border: none; cursor: pointer; transition: all 0.3s;"
                :style="{
                  background: currentSlide === i ? '#fff' : 'rgba(255,255,255,0.4)',
                  width: currentSlide === i ? '24px' : '8px',
                }"
                @click="goToSlide(i)"
                :aria-label="`슬라이드 ${i + 1}`"
              />
            </div>
          </div>
        </div>

        <hr class="home-section-divider">

        <!-- 3. Quick Actions -->
        <div class="home-action-row">
          <a class="home-action-card" href="#" @click.prevent="router.push({ name: 'Swipe' })">
            <div class="home-action-icon icon-violet">
              <span class="material-symbols-rounded">swipe</span>
            </div>
            <div class="home-action-text">
              <h3>내 취향 수집</h3>
              <p>취향 카드 넘기기</p>
            </div>
          </a>
          <a class="home-action-card" href="#" @click.prevent="openTripCreation('route')">
            <div class="home-action-icon icon-blue">
              <span class="material-symbols-rounded">map</span>
            </div>
            <div class="home-action-text">
              <h3>지도에서 루트 만들기</h3>
              <p>일정 설계하기</p>
            </div>
          </a>
          <a class="home-action-card" href="#" @click.prevent="openTripSelection('invite')">
            <div class="home-action-icon icon-rose">
              <span class="material-symbols-rounded">group_add</span>
            </div>
            <div class="home-action-text">
              <h3>친구 초대하기</h3>
              <p>함께하면 더 즐거워요</p>
            </div>
          </a>
          <a class="home-action-card" href="#" @click.prevent="openTripCreation('ai')">
            <div class="home-action-icon icon-cyan">
              <span class="material-symbols-rounded">auto_awesome</span>
            </div>
            <div class="home-action-text">
              <h3>AI 추천 받기</h3>
              <p>맞춤 장소 추천</p>
            </div>
          </a>
        </div>

        <!-- 4. Two-Column Spotlight -->
        <div class="home-spotlight-row">
          <!-- Left: Super-like TOP 3 -->
          <div class="home-toplikes-card">
            <div class="home-toplikes-header">
              <h3>Super-like TOP 3</h3>
              <a href="#">더보기 <span class="material-symbols-rounded" style="font-size:16px;">arrow_forward</span></a>
            </div>
            <div class="home-toplikes-list">
              <div v-if="topPlacesLoading" class="home-section-state home-section-state--loading">
                <div class="home-section-spinner"></div>
                <p>인기 장소를 불러오는 중…</p>
              </div>
              <div v-else-if="topPlaces.length === 0" class="home-section-state">
                <span class="material-symbols-rounded home-section-state-icon">place</span>
                <p>아직 인기 장소가 없어요.</p>
              </div>
              <div v-else v-for="(place, idx) in topPlaces" :key="place.externalPlaceId" class="home-toplikes-item" role="link" tabindex="0" @click="router.push({ path: '/search', query: { q: place.placeName, tab: '여행지' } })" @keydown.enter="router.push({ path: '/search', query: { q: place.placeName, tab: '여행지' } })">
                <span class="home-toplikes-rank">{{ idx + 1 }}</span>
                <img v-if="place.thumbnailUrl" class="home-toplikes-img" :src="place.thumbnailUrl" :alt="place.placeName" />
                <div v-else class="home-toplikes-img" style="background: var(--bg); display: flex; align-items: center; justify-content: center;"><span class="material-symbols-rounded">image</span></div>
                <div class="home-toplikes-info">
                  <h4>{{ place.placeName }}</h4>
                  <p>{{ place.summary ?? place.address }}</p>
                </div>
                <span class="home-toplikes-badge">
                  <span class="material-symbols-rounded" style="font-size:14px;">favorite</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Right: Nearest Trip -->
          <div v-if="nearestTripLoading" class="home-nearest-card" style="display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--muted);">
            로딩 중...
          </div>
          <div v-else-if="!nearestTrip" class="home-nearest-card" style="display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--muted); cursor: pointer;" @click="openTripCreation('route')">
            <div style="text-align: center;">
              <span class="material-symbols-rounded" style="font-size: 32px; margin-bottom: 8px;">add_circle</span>
              <p style="margin: 0;">새로운 여행을 계획해보세요</p>
            </div>
          </div>
          <a v-else class="home-nearest-card" href="#" @click.prevent="router.push({ name: 'Route', params: { tripId: nearestTrip.id } })" style="text-decoration:none;">
            <div class="home-nearest-bg">
              <img :src="nearestTrip.coverImageUrl || (nearestTrip.displayDestination ? '/images/랜딩페이지/jeju.png' : '/images/랜딩페이지/busan.png')" :alt="nearestTrip.title" />
            </div>
            <div class="home-nearest-content">
              <span class="home-nearest-dday">{{ nearestTrip.startDate ? nearestTrip.startDate : '곧 출발' }}</span>
              <h3>{{ nearestTrip.title }}</h3>
              <div class="home-nearest-members">
                <div class="avatars">
                  <span
                    v-for="(thumb, idx) in nearestTrip.memberThumbnails"
                    :key="idx"
                    class="avatar"
                    :style="{ background: 'var(--violet)' }"
                  >
                    <img v-if="thumb" :src="thumb" alt="member avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"/>
                    <span v-else>{{ '?' }}</span>
                  </span>
                </div>
                <span class="member-count">{{ nearestTrip.memberCount }}명</span>
              </div>
              <span class="home-nearest-link">
                여행 계획 보기 <span class="material-symbols-rounded" style="font-size:18px;">arrow_forward</span>
              </span>
            </div>
          </a>
        </div>

        <!-- 5. Community Popular Reviews -->
        <div class="home-section-title">
          <div>
            <p class="eyebrow" style="color:var(--violet)">Community</p>
            <h2>커뮤니티 인기 여행 후기</h2>
          </div>
          <a class="section-link" href="#" @click.prevent="router.push('/community')">더보기 <span class="material-symbols-rounded" style="font-size:18px">arrow_forward</span></a>
        </div>
        <div v-if="featuredStoriesLoading" class="home-section-state home-section-state--loading home-section-state--wide">
          <div class="home-section-spinner"></div>
          <p>인기 여행기를 불러오는 중…</p>
        </div>
        <div v-else-if="featuredStories.length === 0" class="home-section-state home-section-state--wide">
          <span class="material-symbols-rounded home-section-state-icon">auto_stories</span>
          <p>아직 공개된 여행기가 없어요.</p>
          <a class="btn primary home-section-state-cta" href="#" @click.prevent="router.push('/community/story-write')">첫 여행기 작성하기</a>
        </div>
        <div v-else class="home-community-grid">
          <div v-for="story in featuredStories" :key="story.id" class="home-community-card" @click="router.push({ path: '/community', query: { story: story.id } })">
            <div class="home-community-card-img">
              <img v-if="story.coverMedia?.servingUrl ?? story.coverMedia?.publicUrl" :src="story.coverMedia?.servingUrl ?? story.coverMedia?.publicUrl ?? ''" :alt="story.title" />
              <div v-else class="home-community-placeholder">
                <span class="material-symbols-rounded">auto_stories</span>
                <span>여행 사진 준비 중</span>
              </div>
            </div>
            <div class="home-community-card-body">
              <span class="cmn-tag">{{ (story.hashtags && story.hashtags.length > 0) ? story.hashtags[0] : '커뮤니티' }}</span>
              <h3>{{ story.title }}</h3>
              <div class="home-community-card-meta">
                <div class="home-community-author">
                  <span class="avatar" :style="{ background: story.publishedBy?.profileImageUrl ? 'transparent' : 'var(--violet)', width: '26px', height: '26px', fontSize: '10px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, overflow: 'hidden' }">
                    <img v-if="story.publishedBy?.profileImageUrl" :src="story.publishedBy.profileImageUrl" :alt="story.publishedBy.displayName ?? ''" style="width: 100%; height: 100%; object-fit: cover;" />
                    <template v-else>{{ (story.publishedBy?.displayName ?? '?').charAt(0) }}</template>
                  </span>
                  <span>{{ story.publishedBy?.displayName ?? '알 수 없음' }}</span>
                </div>
                <div class="home-community-stats">
                  <span class="material-symbols-rounded" style="font-size:14px;">favorite</span> {{ story.likeCount ?? 0 }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. Invite Friends CTA Banner -->
        <aside class="home-invite-cta" aria-labelledby="home-invite-title">
          <div class="home-invite-cta-left">
            <div class="home-invite-cta-illust">
              <span class="material-symbols-rounded" aria-hidden="true">diversity_3</span>
            </div>
            <div class="home-invite-cta-copy">
              <p class="eyebrow">Plan Together</p>
              <h3 id="home-invite-title">함께 고르면 여행 계획이 더 빨라져요</h3>
              <p>초대 링크를 보내고 친구들과 장소, 일정, 취향을 한곳에서 맞춰보세요.</p>
              <ul class="home-invite-benefits" aria-label="친구 초대 장점">
                <li><span class="material-symbols-rounded" aria-hidden="true">favorite</span>취향 모으기</li>
                <li><span class="material-symbols-rounded" aria-hidden="true">route</span>동선 함께 짜기</li>
                <li><span class="material-symbols-rounded" aria-hidden="true">event</span>일정 공유하기</li>
              </ul>
            </div>
          </div>
          <div class="home-invite-cta-actions">
            <button class="btn primary home-invite-primary-action" type="button" @click="openTripSelection('invite')">
              <span class="material-symbols-rounded" aria-hidden="true">person_add</span>
              초대 링크 만들기
            </button>
            <div class="home-invite-share-row">
              <div class="home-invite-cta-social" role="group" aria-label="초대 링크 공유 채널">
                <button type="button" class="home-invite-social-btn btn-kakao" aria-label="카카오톡으로 초대" @click="openTripSelection('share')">
                  <svg viewBox="0 0 24 24" fill="#3c1e1e" aria-hidden="true"><path d="M12 3C6.48 3 2 6.69 2 11.24c0 2.93 1.9 5.51 4.73 6.99-.15.55-.97 3.36-.99 3.58 0 0-.02.15.08.21.1.06.22.01.22.01.29-.04 3.37-2.2 3.9-2.59.64.09 1.31.14 2.06.14 5.52 0 10-3.69 10-8.24S17.52 3 12 3z"/></svg>
                </button>
                <button type="button" class="home-invite-social-btn btn-google" aria-label="구글로 초대" @click="openTripSelection('share')">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                </button>
              </div>
            </div>
          </div>
        </aside>

      </section>
      </div>
    </main>
  </AppShell>
</template>

<style scoped>
/* === Home Section Empty/Loading States === */
.home-section-state {
  align-items: center;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 28px 16px;
  text-align: center;
}
.home-section-state--wide {
  padding: 48px 16px;
}
.home-section-state--loading {
  gap: 14px;
}
.home-section-state p {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}
.home-section-state-icon {
  color: var(--line);
  font-size: 40px;
  font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48;
  line-height: 1;
}
.home-section-spinner {
  animation: home-spin 0.9s linear infinite;
  border: 3px solid var(--line);
  border-radius: 50%;
  border-top-color: var(--violet);
  height: 28px;
  width: 28px;
}
.home-section-state-cta {
  margin-top: 6px;
  min-height: 38px;
  padding: 8px 18px;
}
@keyframes home-spin {
  to { transform: rotate(360deg); }
}

/* === Search Hero Section === */
.home-search-hero {
  padding: 104px 24px 40px;
  background: linear-gradient(180deg, rgba(0, 102, 255, 0.03) 0%, transparent 100%);
  text-align: center;
}
.home-search-hero-inner {
  max-width: 760px;
  margin: 0 auto;
}
.home-search-hero-title {
  font-size: clamp(28px, 3.5vw, 42px);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.3;
  color: var(--ink);
  margin: 0 0 12px;
}
.home-search-hero-sub {
  font-size: 16px;
  color: var(--muted);
  margin: 0 0 40px;
  line-height: 1.6;
}

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

/* === Hero Section === */
.home-hero {
  display: flex;
  align-items: center;
  gap: 48px;
  margin-bottom: 24px;
  min-height: 400px;
}
.home-hero-copy { flex: 0 0 340px; }
.home-hero-copy h1 {
  font-size: clamp(32px, 3.5vw, 48px);
  margin: 0 0 16px;
  line-height: 1.3;
}
.home-hero-copy h1 span {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.home-hero-copy .lead { margin-bottom: 32px; }

/* Hero content carousel */
.home-hero-content {
  flex: 1;
  min-width: 0;
  position: relative;
  height: 360px;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 24px 48px rgba(0, 50, 150, 0.12);
}
.home-hero-slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.8s ease;
}
.home-hero-slide.is-active {
  opacity: 1;
  z-index: 1;
}
.home-hero-slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.home-hero-card-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24px 28px;
  background: linear-gradient(transparent, rgba(0,0,0,0.6));
  color: #fff;
}
.home-hero-card-overlay .card-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 8px;
  margin-bottom: 10px;
}
.home-hero-card-overlay .card-tag.tag-story { background: var(--rose); }
.home-hero-card-overlay .card-tag.tag-column { background: var(--violet); }
.home-hero-card-overlay .card-tag.tag-place { background: var(--blue); }
.home-hero-card-overlay h3 {
  font-size: 20px;
  font-weight: 800;
  margin: 0 0 6px;
  line-height: 1.35;
}
.home-hero-card-overlay p {
  font-size: 13px;
  margin: 0;
  opacity: 0.85;
}

/* === Section shared === */
.home-section-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.home-section-title h2 { font-size: 24px; font-weight: 800; margin: 0; }
.home-section-title .section-link {
  font-size: 14px; font-weight: 700; color: var(--violet);
  text-decoration: none; display: flex; align-items: center; gap: 4px;
}
.home-section-title .section-link:hover { text-decoration: underline; }

.home-section-divider {
  border: 0;
  height: 1px;
  margin: 0 0 40px;
  background: linear-gradient(90deg, transparent, var(--line) 12%, var(--line) 88%, transparent);
}

/* === Quick Action Cards === */
.home-action-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 56px;
}
.home-action-card {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 22px 20px; border-radius: 20px;
  background: #fff; box-shadow: var(--soft-shadow);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  text-decoration: none; color: inherit;
}
.home-action-card:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
.home-action-icon {
  width: 44px; height: 44px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.home-action-icon .material-symbols-rounded { font-size: 24px; color: #fff; }
.home-action-icon.icon-violet { background: linear-gradient(135deg, var(--violet), #4d8eff); }
.home-action-icon.icon-blue   { background: linear-gradient(135deg, var(--blue), var(--cyan)); }
.home-action-icon.icon-rose   { background: linear-gradient(135deg, var(--rose), #ff8fab); }
.home-action-icon.icon-cyan   { background: linear-gradient(135deg, var(--cyan), #34d8d0); }
.home-action-text h3 { font-size: 14px; font-weight: 800; margin: 0 0 4px; }
.home-action-text p  { font-size: 12px; color: var(--muted); margin: 0; line-height: 1.4; }

/* === Two-Column Spotlight === */
.home-spotlight-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 64px;
}

/* Left: Super-like TOP 3 */
.home-toplikes-card {
  border-radius: 24px;
  background: #fff;
  box-shadow: var(--soft-shadow);
  padding: 28px;
}
.home-toplikes-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px;
}
.home-toplikes-header h3 { font-size: 18px; font-weight: 800; margin: 0; }
.home-toplikes-header a {
  font-size: 13px; font-weight: 700; color: var(--violet);
  text-decoration: none; display: flex; align-items: center; gap: 3px;
}
.home-toplikes-header a:hover { text-decoration: underline; }
.home-toplikes-list { display: flex; flex-direction: column; gap: 16px; }
.home-toplikes-item {
  display: flex; align-items: center; gap: 14px;
  padding: 12px; border-radius: 16px;
  background: var(--bg);
  cursor: pointer;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.home-toplikes-item:hover { transform: translateX(4px); box-shadow: var(--soft-shadow); }
.home-toplikes-rank {
  width: 28px; height: 28px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800; color: #fff; flex-shrink: 0;
}
.home-toplikes-item:nth-child(1) .home-toplikes-rank { background: linear-gradient(135deg, #ffd700, #ffb800); }
.home-toplikes-item:nth-child(2) .home-toplikes-rank { background: linear-gradient(135deg, #c0c0c0, #a8a8a8); }
.home-toplikes-item:nth-child(3) .home-toplikes-rank { background: linear-gradient(135deg, #cd7f32, #b87333); }
.home-toplikes-img {
  width: 56px; height: 56px; border-radius: 14px;
  object-fit: cover; flex-shrink: 0;
}
.home-toplikes-info { flex: 1; min-width: 0; }
.home-toplikes-info h4 { font-size: 14px; font-weight: 700; margin: 0 0 3px; }
.home-toplikes-info p  { font-size: 12px; color: var(--muted); margin: 0; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.home-toplikes-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; color: var(--rose);
  background: rgba(255,92,141,0.08);
  padding: 3px 8px; border-radius: 8px;
}

/* Right: Nearest Trip */
.home-nearest-card {
  border-radius: 24px;
  overflow: hidden;
  position: relative;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  box-shadow: var(--soft-shadow);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.home-nearest-card:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
.home-nearest-bg {
  position: absolute; inset: 0;
}
.home-nearest-bg img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.home-nearest-bg::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%);
}
.home-nearest-content {
  position: relative; z-index: 1;
  padding: 28px;
  color: #fff;
}
.home-nearest-dday {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 10px;
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(8px);
  font-size: 13px; font-weight: 800;
  margin-bottom: 12px;
}
.home-nearest-content h3 {
  font-size: 22px; font-weight: 800;
  margin: 0 0 8px;
}
.home-nearest-members {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 16px;
}
.home-nearest-members .avatars { display: flex; }
.home-nearest-members .avatar {
  width: 30px; height: 30px; font-size: 11px;
  margin-left: -8px; border: 2px solid rgba(255,255,255,0.6);
  border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 800;
}
.home-nearest-members .avatar:first-child { margin-left: 0; }
.home-nearest-members .member-count {
  font-size: 12px; opacity: 0.8;
}
.home-nearest-link {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 14px; font-weight: 700;
  color: #fff; text-decoration: none;
  padding: 8px 0;
}
.home-nearest-link:hover { text-decoration: underline; }

/* === Community Reviews === */
.home-community-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 64px;
}
.home-community-card {
  border-radius: 22px; overflow: hidden;
  background: #fff;
  box-shadow: var(--soft-shadow);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
}
.home-community-card:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
.home-community-card-img {
  position: relative;
  overflow: hidden;
}
.home-community-placeholder { width: 100%; height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; background: linear-gradient(135deg, #eef2ff, #f8fafc); color: var(--muted); font-size: 12px; font-weight: 750; }
.home-community-placeholder .material-symbols-rounded { font-size: 34px; color: var(--violet); }
.home-community-card-img img {
  width: 100%; height: 180px; object-fit: cover; display: block;
  transition: transform 0.4s ease;
}
.home-community-card:hover .home-community-card-img img { transform: scale(1.05); }
.home-community-card-body { padding: 20px; }
.home-community-card-body .cmn-tag {
  display: inline-block; font-size: 11px; font-weight: 800;
  color: var(--violet); background: rgba(0,102,255,0.08);
  padding: 4px 10px; border-radius: 8px; margin-bottom: 10px;
}
.home-community-card-body h3 {
  font-size: 15px; font-weight: 800; margin: 0 0 8px;
  line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.home-community-card-meta {
  display: flex; align-items: center; justify-content: space-between;
}
.home-community-author {
  display: flex; align-items: center; gap: 8px;
}
.home-community-author span {
  font-size: 13px; font-weight: 600;
}
.home-community-stats {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: var(--muted); font-weight: 600;
}

/* === Invite CTA Banner === */
.home-invite-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 32px 36px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 10% 20%, rgba(0, 209, 255, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(0, 102, 255, 0.08), rgba(140, 100, 255, 0.12));
  border: 1px solid rgba(0, 102, 255, 0.1);
  margin-bottom: 24px;
}
.home-invite-cta-left {
  display: flex; align-items: center; gap: 20px;
  min-width: 0;
}
.home-invite-cta-illust {
  width: 72px; height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(0,102,255,0.12), rgba(140,100,255,0.15));
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.home-invite-cta-illust .material-symbols-rounded {
  font-size: 36px;
  background: linear-gradient(135deg, var(--violet), #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.home-invite-cta-copy h3 {
  font-size: 19px; font-weight: 800; margin: 0 0 6px;
  line-height: 1.35;
}
.home-invite-cta-copy .eyebrow {
  margin-bottom: 6px;
}
.home-invite-cta-copy p {
  font-size: 13px; color: var(--muted); margin: 0;
  line-height: 1.5;
}
.home-invite-benefits {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.home-invite-benefits li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--violet);
  font-size: 11px;
  font-weight: 800;
}
.home-invite-benefits .material-symbols-rounded {
  font-size: 15px;
}
.home-invite-cta-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.home-invite-cta-actions .btn {
  justify-content: center;
}
.home-invite-primary-action {
  min-height: 44px;
  padding-inline: 16px;
  border-radius: 999px;
  white-space: nowrap;
}
.home-invite-share-row {
  display: flex;
  align-items: center;
}
.home-invite-cta-social {
  display: flex;
  align-items: center;
  gap: 8px;
}
.home-invite-social-btn {
  display: flex;
  width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  padding: 0;
  white-space: nowrap;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.home-invite-social-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.home-invite-social-btn.btn-kakao {
  background: #fee500;
}
.home-invite-social-btn.btn-kakao svg { width: 18px; height: 18px; }
.home-invite-social-btn.btn-google {
  background: #fff;
  border: 1px solid var(--line);
}
.home-invite-social-btn.btn-google svg { width: 16px; height: 16px; }

/* === Responsive === */
@media (max-width: 1024px) {
  .home-hero { flex-direction: column; min-height: auto; }
  .home-hero-copy { flex: unset; width: 100%; }
  .home-hero-content { width: 100%; height: 300px; }
  .home-action-row { grid-template-columns: repeat(2, 1fr); }
  .home-spotlight-row { grid-template-columns: 1fr; }
  .home-community-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .home-hero-content { grid-template-columns: 1fr 1fr; height: auto; }
  .home-community-grid { grid-template-columns: 1fr; }
  .home-invite-cta { flex-direction: column; text-align: center; padding: 28px 24px; }
  .home-invite-cta-left { flex-direction: column; }
  .home-invite-benefits { justify-content: center; }
  .home-invite-cta-actions {
    width: 100%;
    flex-basis: auto;
    flex-wrap: wrap;
    justify-content: center;
  }
}
@media (max-width: 480px) {
  .home-hero-content { grid-template-columns: 1fr; }
  .home-action-row { grid-template-columns: 1fr 1fr; }
}
</style>
