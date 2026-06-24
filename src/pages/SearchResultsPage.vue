<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import StoryDetailOverlay from '@/components/community/StoryDetailOverlay.vue'
import { placeApi } from '@/api/place.api'
import { searchApi } from '@/api/search.api'
import { swipeApi } from '@/api/swipe.api'
import { communityPostToStory } from '@/utils/community'
import type { UnifiedSearchResponse } from '@/types/search'
import type { CommunityPostSummary } from '@/types/community'
import type { AccessibilityFlag, ParkingType, Place } from '@/types/place'
import type { PlaceSearchSummary, UserSearchResult } from '@/types/search'
import type { SwipeAction } from '@/types/swipe'
import type { TripSummary } from '@/types/trip'

const route = useRoute()
const router = useRouter()

const RECENT_KEY = 'soomgil:recent-searches'
const RECENT_LIMIT = 8

const searchInput = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
const activeTab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : '전체')
const result = ref<UnifiedSearchResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const recentSearches = ref<string[]>(loadRecentSearches())
const selectedPlace = ref<Place | null>(null)
const placeDetailLoading = ref(false)
const placeDetailError = ref<string | null>(null)
const placeReactionSubmitting = ref(false)
const selectedPlaceReaction = ref<SwipeAction | null>(null)
const placeReactionMessage = ref<string | null>(null)
const selectedStoryId = ref<string | null>(null)

const tabs = [
  { key: '전체', icon: 'search' },
  { key: '여행', icon: 'luggage' },
  { key: '장소', icon: 'place' },
  { key: '여행기', icon: 'auto_stories' },
  { key: '사용자', icon: 'group' },
] as const

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function persistRecentSearch(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return
  const next = [trimmed, ...recentSearches.value.filter((v) => v !== trimmed)].slice(0, RECENT_LIMIT)
  recentSearches.value = next
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore quota errors
  }
}

function removeRecentSearch(query: string) {
  recentSearches.value = recentSearches.value.filter((v) => v !== query)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentSearches.value))
  } catch {
    // ignore
  }
}

function clearRecentSearches() {
  recentSearches.value = []
  try {
    localStorage.removeItem(RECENT_KEY)
  } catch {
    // ignore
  }
}

const hasQuery = computed(() => searchInput.value.trim().length > 0)

const visibleTrips = computed(() => (activeTab.value === '전체' || activeTab.value === '여행') ? result.value?.trips ?? [] : [])
const visiblePlaces = computed(() => (activeTab.value === '전체' || activeTab.value === '장소') ? result.value?.places ?? [] : [])
const visiblePosts = computed(() => (activeTab.value === '전체' || activeTab.value === '여행기') ? result.value?.posts ?? [] : [])
const visibleUsers = computed(() => (activeTab.value === '전체' || activeTab.value === '사용자') ? result.value?.users ?? [] : [])
const searchStories = computed(() => (result.value?.posts ?? []).map(communityPostToStory))

// Whether the currently selected tab has anything to show. Drives the per-tab
// empty state so selecting a category with no matches shows "결과 없음" instead
// of a blank body (which is what made the search bar/layout feel inconsistent).
const hasVisibleResults = computed(() =>
  visibleTrips.value.length > 0 ||
  visiblePlaces.value.length > 0 ||
  visiblePosts.value.length > 0 ||
  visibleUsers.value.length > 0,
)

const emptyDescription = computed(() => {
  const q = result.value?.query ?? searchInput.value.trim()
  if (!q) return '다른 키워드로 다시 검색해 보세요.'
  if (activeTab.value === '전체') {
    return `"${q}" 와(과) 일치하는 결과가 없습니다. 다른 키워드로 다시 검색해 보세요.`
  }
  return `"${q}" 에 대한 ${activeTab.value} 결과가 없습니다. 다른 카테고리를 선택하거나 다른 키워드로 검색해 보세요.`
})

function queryFromUrl(): string {
  return typeof route.query.q === 'string' ? route.query.q : ''
}

async function runSearch(q: string) {
  const trimmed = q.trim()
  if (!trimmed) {
    result.value = null
    error.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    result.value = await searchApi.unified(trimmed, 4)
  } catch (e) {
    const status = typeof e === 'object' && e !== null && 'response' in e
      ? (e as { response?: { status?: number } }).response?.status
      : undefined
    error.value = status === 401
      ? '검색하려면 먼저 로그인해 주세요.'
      : '검색 결과를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function scrollTopToSearch() {
  window.scrollTo({ top: 0 })
}

function submitSearch() {
  const q = searchInput.value.trim()
  if (!q) return
  persistRecentSearch(q)
  router.replace({ path: '/search', query: { q, tab: activeTab.value } })
  scrollTopToSearch()
}

function selectTab(tab: string) {
  activeTab.value = tab
  if (searchInput.value.trim()) {
    router.replace({ path: '/search', query: { q: searchInput.value.trim(), tab } })
  }
  scrollTopToSearch()
}

function runRecentSearch(query: string) {
  searchInput.value = query
  persistRecentSearch(query)
  router.replace({ path: '/search', query: { q: query, tab: activeTab.value } })
  scrollTopToSearch()
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
  } catch {
    return ''
  }
}

function gotoTrip(trip: TripSummary) {
  router.push({ path: `/trips/${trip.id}/route` })
}

async function openPlaceDetail(place: PlaceSearchSummary) {
  placeDetailLoading.value = true
  placeDetailError.value = null
  placeReactionSubmitting.value = false
  selectedPlaceReaction.value = null
  placeReactionMessage.value = null
  selectedPlace.value = {
    provider: place.provider,
    externalPlaceId: place.externalPlaceId,
    placeName: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    thumbnailUrl: place.thumbnailUrl,
    category: place.category,
    sourceStatus: place.sourceStatus,
  }
  try {
    selectedPlace.value = await placeApi.getPlace(place.provider, place.externalPlaceId)
  } catch (err) {
    console.error('Failed to load place detail:', err)
    placeDetailError.value = '장소 상세 정보를 불러오지 못했습니다.'
  } finally {
    placeDetailLoading.value = false
  }
}

function closePlaceDetail() {
  selectedPlace.value = null
  placeDetailError.value = null
  placeDetailLoading.value = false
  placeReactionSubmitting.value = false
  selectedPlaceReaction.value = null
  placeReactionMessage.value = null
}

async function reactToSelectedPlace(reaction: SwipeAction) {
  const place = selectedPlace.value
  if (!place || placeReactionSubmitting.value) return
  placeReactionSubmitting.value = true
  placeReactionMessage.value = null
  try {
    const result = await swipeApi.react(place.provider, place.externalPlaceId, reaction)
    selectedPlaceReaction.value = result.reaction
    const labels: Record<SwipeAction, string> = {
      NOPE: '관심 없음으로 저장했어요.',
      LIKE: '좋아요로 저장했어요.',
      SUPER_LIKE: '슈퍼라이크로 저장했어요.',
    }
    placeReactionMessage.value = labels[result.reaction]
  } catch (err) {
    console.error('Failed to react to place:', err)
    placeReactionMessage.value = '반응을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    placeReactionSubmitting.value = false
  }
}

function gotoPost(post: CommunityPostSummary) {
  selectedStoryId.value = post.id
}

function gotoUser(user: UserSearchResult) {
  router.push({ path: `/mypage/${user.id}` })
}

const selectedPlaceImages = computed(() => {
  if (!selectedPlace.value) return []
  return [selectedPlace.value.thumbnailUrl, ...(selectedPlace.value.photos ?? [])]
    .filter((url): url is string => Boolean(url))
    .filter((url, index, arr) => arr.indexOf(url) === index)
})

const selectedPlaceDescription = computed(() => {
  const place = selectedPlace.value
  return place?.description?.trim() || place?.summary?.trim() || '아직 등록된 상세 소개가 없습니다.'
})

function parkingTypeLabel(type: ParkingType | null | undefined) {
  const labels: Record<ParkingType, string> = {
    FREE: '무료 주차',
    PAID: '유료 주차',
    MIXED: '부분 유료',
    NONE: '주차 없음',
    UNKNOWN: '정보 없음',
  }
  return labels[type ?? 'UNKNOWN']
}

const accessibilityItems: Array<{ flag: AccessibilityFlag; label: string; icon: string }> = [
  { flag: 'WHEELCHAIR', label: '휠체어', icon: 'accessible' },
  { flag: 'PET', label: '반려동물', icon: 'pets' },
  { flag: 'STROLLER', label: '유아차', icon: 'child_friendly' },
  { flag: 'DISABLED_TOILET', label: '장애인 화장실', icon: 'wc' },
  { flag: 'ELDERLY', label: '어르신', icon: 'elderly' },
]

function accessibilityClass(flag: AccessibilityFlag) {
  const accessibility = selectedPlace.value?.accessibility
  if (!accessibility) return 'unknown'
  if (accessibility.flags.includes(flag)) return 'available'
  if (accessibility.unavailableFlags.includes(flag)) return 'unavailable'
  return 'unknown'
}

function exploreSection(section: 'trips' | 'places' | 'posts' | 'users') {
  const q = searchInput.value.trim()
  const target: Record<typeof section, string> = {
    trips: '/my-trips',
    places: '/community',
    posts: '/community/stories',
    users: '/community',
  }
  router.push({ path: target[section], query: q ? { q } : {} })
}

function refreshCurrentSearch() {
  const q = searchInput.value.trim()
  if (q) void runSearch(q)
}

onMounted(() => {
  const q = queryFromUrl()
  if (q) {
    searchInput.value = q
    void runSearch(q)
  }
})

watch(
  () => route.query.q,
  (next) => {
    if (typeof next === 'string') {
      searchInput.value = next
      void runSearch(next)
    } else {
      searchInput.value = ''
      result.value = null
    }
  },
)
</script>

<template>
  <AppShell>
    <main class="search-page page-with-hero">
      <!-- Search Header -->
      <section class="search-head page-hero">
        <div class="page-hero__copy">
          <p class="page-hero__eyebrow">
            <span class="material-symbols-rounded" aria-hidden="true">search</span>
            Unified Search
          </p>
          <h1 class="page-hero__title">
            <span class="page-hero__gradient">필요한 여행 정보</span>를<br />
            한 번에 찾아보세요
          </h1>
          <p class="page-hero__lead">여행, 장소, 여행기, 사용자를 한 번에 검색하고 다음 여정을 빠르게 이어가세요.</p>
        </div>

        <form class="search-form search-form--capsule" role="search" @submit.prevent="submitSearch">
          <div class="search-input-wrap search-input-wrap--capsule">
            <span class="material-symbols-rounded search-input-icon">search</span>
            <input
              v-model="searchInput"
              class="search-input"
              type="text"
              placeholder="예: 부산, 감성 카페, 서울 여행, 친구 닉네임"
              aria-label="검색어 입력"
              autocomplete="off"
            />
            <button v-if="searchInput" type="button" class="search-clear-btn" aria-label="검색어 지우기" @click="searchInput = ''">
              <span class="material-symbols-rounded">close</span>
            </button>
            <button type="submit" class="search-submit-btn">
              <span class="material-symbols-rounded">search</span>
              <span>검색</span>
            </button>
          </div>
        </form>
      </section>

      <div class="search-tabs" role="tablist" aria-label="검색 카테고리">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          role="tab"
          class="search-tab"
          :class="{ active: activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          @click="selectTab(tab.key)"
        >
          <span class="material-symbols-rounded">{{ tab.icon }}</span>
          {{ tab.key }}
        </button>
      </div>

      <!-- Result Body -->
      <section class="search-body">
        <LoadingState v-if="loading" />
        <ErrorState
          v-else-if="error"
          :message="error"
          @retry="runSearch(searchInput)"
        />
        <div v-else-if="!hasQuery" class="search-empty-panel">
          <div v-if="recentSearches.length > 0" class="search-recent">
            <div class="search-recent-head">
              <h3>최근 검색어</h3>
              <button type="button" class="search-recent-clear" @click="clearRecentSearches">전체 삭제</button>
            </div>
            <ul class="search-recent-list">
              <li v-for="item in recentSearches" :key="item">
                <button type="button" class="search-recent-item" @click="runRecentSearch(item)">
                  <span class="material-symbols-rounded">history</span>
                  <span>{{ item }}</span>
                </button>
                <button type="button" class="search-recent-remove" :aria-label="`${item} 삭제`" @click="removeRecentSearch(item)">
                  <span class="material-symbols-rounded">close</span>
                </button>
              </li>
            </ul>
          </div>
          <EmptyState
            v-else
            icon="search"
            title="검색어를 입력해 주세요"
            description="찾고 싶은 여행, 장소, 여행기, 사용자를 검색해 보세요."
          />
        </div>
        <EmptyState
          v-else-if="result && !hasVisibleResults"
          icon="search_off"
          title="검색 결과가 없어요"
          :description="emptyDescription"
        />
        <template v-else-if="result">
          <!-- Trips -->
          <section v-if="visibleTrips.length > 0" class="search-section" aria-label="여행 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">luggage</span>
                여행
                <span class="search-section-count">{{ visibleTrips.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('trips')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="trip in visibleTrips"
                :key="trip.id"
                type="button"
                class="search-card search-card--trip"
                @click="gotoTrip(trip)"
              >
                <div class="search-card-thumb search-card-thumb--icon">
                  <span class="material-symbols-rounded">luggage</span>
                </div>
                <div class="search-card-body">
                  <span class="search-card-eyebrow">{{ trip.status === 'ARCHIVED' ? '완료된 여행' : '진행 중인 여행' }}</span>
                  <h3 class="search-card-title">{{ trip.title }}</h3>
                  <p class="search-card-meta">
                    <span v-if="trip.displayDestination">{{ trip.displayDestination }}</span>
                    <span v-if="trip.displayDestination && trip.createdAt">·</span>
                    <span v-if="trip.createdAt">{{ formatDate(trip.createdAt) }}</span>
                  </p>
                </div>
              </button>
            </div>
          </section>

          <!-- Places -->
          <section v-if="visiblePlaces.length > 0" class="search-section" aria-label="장소 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">place</span>
                장소
                <span class="search-section-count">{{ visiblePlaces.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('places')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="place in visiblePlaces"
                :key="`${place.provider}-${place.externalPlaceId}`"
                type="button"
                class="search-card search-card--place"
                @click="openPlaceDetail(place)"
              >
                <div class="search-card-thumb">
                  <img v-if="place.thumbnailUrl" :src="place.thumbnailUrl" :alt="place.name" />
                  <span v-else class="material-symbols-rounded">image</span>
                </div>
                <div class="search-card-body">
                  <span class="search-card-eyebrow">{{ place.category || '추천 장소' }}</span>
                  <h3 class="search-card-title">{{ place.name }}</h3>
                  <p v-if="place.address" class="search-card-meta">{{ place.address }}</p>
                </div>
              </button>
            </div>
          </section>

          <!-- Posts -->
          <section v-if="visiblePosts.length > 0" class="search-section" aria-label="여행기 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">auto_stories</span>
                여행기
                <span class="search-section-count">{{ visiblePosts.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('posts')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="post in visiblePosts"
                :key="post.id"
                type="button"
                class="search-card search-card--post"
                @click="gotoPost(post)"
              >
                <div class="search-card-thumb">
                  <img
                    v-if="post.coverMedia?.servingUrl ?? post.coverMedia?.publicUrl"
                    :src="post.coverMedia?.servingUrl ?? post.coverMedia?.publicUrl ?? ''"
                    :alt="post.title"
                  />
                  <span v-else class="material-symbols-rounded">auto_stories</span>
                </div>
                <div class="search-card-body">
                  <span class="search-card-eyebrow">좋아요 {{ post.likeCount }} · 댓글 {{ post.commentCount }}</span>
                  <h3 class="search-card-title">{{ post.title }}</h3>
                  <p v-if="post.summary" class="search-card-meta">{{ post.summary }}</p>
                  <p v-if="post.publishedBy" class="search-card-author">
                    <span class="avatar" :style="{ width: '20px', height: '20px', fontSize: '9px' }">{{ post.publishedBy.displayName.charAt(0) }}</span>
                    {{ post.publishedBy.displayName }}
                  </p>
                </div>
              </button>
            </div>
          </section>

          <!-- Users -->
          <section v-if="visibleUsers.length > 0" class="search-section" aria-label="사용자 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">group</span>
                사용자
                <span class="search-section-count">{{ visibleUsers.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('users')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="user in visibleUsers"
                :key="user.id"
                type="button"
                class="search-card search-card--user"
                @click="gotoUser(user)"
              >
                <div class="search-card-thumb search-card-thumb--avatar">
                  <img v-if="user.profileImageUrl" :src="user.profileImageUrl" :alt="user.displayName" />
                  <span v-else class="search-card-avatar-fallback">{{ user.displayName.charAt(0) }}</span>
                </div>
                <div class="search-card-body">
                  <h3 class="search-card-title">{{ user.displayName }}</h3>
                  <p class="search-card-meta">팔로워 {{ user.followerCount }}명</p>
                </div>
              </button>
            </div>
          </section>
        </template>
      </section>
    </main>

    <Teleport to="body">
      <div
        v-if="selectedPlace"
        class="place-detail-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`${selectedPlace.placeName} 상세 정보`"
        @keydown.esc="closePlaceDetail"
      >
        <div class="place-detail-backdrop" @click="closePlaceDetail"></div>
        <article class="place-detail-dialog">
          <button class="place-detail-close" type="button" aria-label="닫기" @click="closePlaceDetail">
            <span class="material-symbols-rounded">close</span>
          </button>

          <div class="place-detail-media">
            <img
              v-if="selectedPlaceImages[0]"
              :src="selectedPlaceImages[0]"
              :alt="selectedPlace.placeName"
            />
            <div v-else class="place-detail-media-placeholder">
              <span class="material-symbols-rounded">landscape</span>
            </div>
            <div class="place-detail-media-overlay">
              <span class="place-detail-category">{{ selectedPlace.category || '추천 장소' }}</span>
              <h2>{{ selectedPlace.placeName }}</h2>
              <p v-if="selectedPlace.address">
                <span class="material-symbols-rounded">location_on</span>
                {{ selectedPlace.address }}
              </p>
            </div>
            <div class="place-detail-media-reactions" aria-label="장소 취향 반응">
              <button
                type="button"
                class="place-detail-reaction-btn place-detail-reaction-btn--nope"
                :class="{ active: selectedPlaceReaction === 'NOPE' }"
                :disabled="placeReactionSubmitting || placeDetailLoading"
                aria-label="싫어요"
                title="싫어요"
                @click="reactToSelectedPlace('NOPE')"
              >
                <span class="material-symbols-rounded">close</span>
              </button>
              <button
                type="button"
                class="place-detail-reaction-btn place-detail-reaction-btn--like"
                :class="{ active: selectedPlaceReaction === 'LIKE' }"
                :disabled="placeReactionSubmitting || placeDetailLoading"
                aria-label="좋아요"
                title="좋아요"
                @click="reactToSelectedPlace('LIKE')"
              >
                <span class="material-symbols-rounded">favorite</span>
              </button>
              <button
                type="button"
                class="place-detail-reaction-btn place-detail-reaction-btn--super"
                :class="{ active: selectedPlaceReaction === 'SUPER_LIKE' }"
                :disabled="placeReactionSubmitting || placeDetailLoading"
                aria-label="슈퍼라이크"
                title="슈퍼라이크"
                @click="reactToSelectedPlace('SUPER_LIKE')"
              >
                <span class="material-symbols-rounded">auto_awesome</span>
              </button>
            </div>
          </div>

          <div class="place-detail-content">
            <div v-if="placeDetailLoading" class="place-detail-state" role="status">
              <span class="material-symbols-rounded">progress_activity</span>
              상세 정보를 불러오는 중입니다.
            </div>
            <div v-else-if="placeDetailError" class="place-detail-state place-detail-state--error" role="alert">
              <span class="material-symbols-rounded">error</span>
              {{ placeDetailError }}
            </div>

            <section class="place-detail-section">
              <h3>장소 소개</h3>
              <p class="place-detail-description">{{ selectedPlaceDescription }}</p>
              <div v-if="selectedPlace.tags?.length" class="place-detail-tags">
                <span v-for="tag in selectedPlace.tags" :key="tag">#{{ tag }}</span>
              </div>
            </section>

            <section
              v-if="selectedPlaceImages.length > 1"
              class="place-detail-section"
              aria-label="장소 사진"
            >
              <h3>사진</h3>
              <div class="place-detail-gallery">
                <img
                  v-for="(image, idx) in selectedPlaceImages.slice(1, 5)"
                  :key="image"
                  :src="image"
                  :alt="`${selectedPlace.placeName} 사진 ${idx + 2}`"
                />
              </div>
            </section>

            <section class="place-detail-info-grid" aria-label="이용 정보">
              <div class="place-detail-info-card">
                <span class="material-symbols-rounded">schedule</span>
                <small>운영 시간</small>
                <strong>{{ selectedPlace.accessibility?.openingHours || '-' }}</strong>
              </div>
              <div class="place-detail-info-card">
                <span class="material-symbols-rounded">event_busy</span>
                <small>휴무일</small>
                <strong>{{ selectedPlace.accessibility?.closedDays || '-' }}</strong>
              </div>
              <div class="place-detail-info-card">
                <span class="material-symbols-rounded">local_parking</span>
                <small>주차</small>
                <strong>{{ parkingTypeLabel(selectedPlace.accessibility?.parkingType) }}</strong>
              </div>
              <div class="place-detail-info-card">
                <span class="material-symbols-rounded">call</span>
                <small>문의</small>
                <strong>{{ selectedPlace.contact || '-' }}</strong>
              </div>
            </section>

            <section class="place-detail-section">
              <h3>접근성</h3>
              <div class="place-detail-accessibility">
                <span
                  v-for="item in accessibilityItems"
                  :key="item.flag"
                  class="place-detail-accessibility-pill"
                  :class="accessibilityClass(item.flag)"
                >
                  <span class="material-symbols-rounded">{{ item.icon }}</span>
                  {{ item.label }}
                </span>
              </div>
            </section>

          </div>
        </article>
      </div>
    </Teleport>

    <StoryDetailOverlay
      v-if="selectedStoryId"
      :stories="searchStories"
      :initial-story-id="selectedStoryId"
      @close="selectedStoryId = null"
      @changed="refreshCurrentSearch"
    />
  </AppShell>
</template>

<style scoped>
.search-page {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 24px 20px;
  display: flex;
  flex-direction: column;
}

.search-head.search-head.search-head {
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 20px;
  text-align: center;
}

.search-head .page-hero__copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 1 auto;
  width: 100%;
  text-align: center;
}

.search-head .page-hero__eyebrow {
  align-self: center;
  justify-content: center;
}

.search-head .page-hero__title {
  width: 100%;
  margin-bottom: 14px;
  text-align: center;
}

.search-head .page-hero__lead {
  max-width: 620px;
  margin: 0 auto;
}

.search-head .eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--violet);
  margin: 0 0 8px;
}

.search-head-title {
  font-size: 28px;
  font-weight: 900;
  color: var(--ink);
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}

.search-head-title span {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.search-head-lead {
  font-size: 14px;
  color: var(--muted);
  margin: 0 0 20px;
}

.search-form {
  display: flex;
  align-items: stretch;
  max-width: 680px;
  margin: 0 auto;
}

.search-form--capsule {
  width: 100%;
}

.search-input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.search-input-wrap--capsule {
  padding: 0 0 0 18px;
  border: 0;
}

.search-input-wrap.search-input-wrap.search-input-wrap--capsule,
.search-input-wrap.search-input-wrap.search-input-wrap--capsule:focus-within {
  border: 0;
}

.search-input-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: var(--muted);
  pointer-events: none;
}

.search-input.search-input.search-input {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 48px;
  padding: 0 44px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  font-size: 15px;
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-input:focus {
  outline: none;
  box-shadow: 0 0 0 4px rgba(123, 104, 238, 0.12);
}

.search-clear-btn {
  position: absolute;
  right: 102px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.search-clear-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--ink);
}

.search-submit-btn {
  align-self: stretch;
  min-width: 98px;
  height: 48px;
  padding: 0 24px;
  border: 0;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
}

.search-submit-btn .material-symbols-rounded {
  font-size: 20px;
}

.search-tabs {
  display: flex;
  gap: 8px;
  margin: 16px auto 0;
  flex-wrap: wrap;
  max-width: 560px; /* align tabs with the narrow, centered search bar */
}

.search-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.search-tab:hover {
  border-color: rgba(123, 104, 238, 0.4);
  color: var(--violet);
}

.search-tab.active {
  background: var(--violet);
  border-color: var(--violet);
  color: #fff;
}

.search-tab .material-symbols-rounded {
  font-size: 16px;
}

.search-empty-panel {
  display: grid;
  gap: 24px;
  margin-top: 12px;
}

.search-recent {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px 20px;
}

.search-recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.search-recent-head h3 {
  font-size: 13px;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
}

.search-recent-clear {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
}

.search-recent-clear:hover {
  color: var(--ink);
  background: rgba(0, 0, 0, 0.04);
}

.search-recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-recent-list li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg);
  border-radius: 999px;
  padding: 4px 6px 4px 10px;
}

.search-recent-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 2px;
}

.search-recent-item:hover {
  color: var(--violet);
}

.search-recent-item .material-symbols-rounded {
  font-size: 14px;
  color: var(--muted);
}

.search-recent-remove {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
}

.search-recent-remove:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--ink);
}

.search-recent-remove .material-symbols-rounded {
  font-size: 14px;
}

.search-body {
  flex: 0 0 auto;
  margin-top: 0;
  padding: 0 4px 24px 0;
}

.search-section {
  margin-bottom: 40px;
}

.search-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.search-section-head h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
}

.search-section-icon {
  font-size: 22px;
  color: var(--violet);
}

.search-section-count {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  padding: 2px 8px;
}

.search-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--violet);
}

.search-more-btn .material-symbols-rounded {
  font-size: 18px;
}

.search-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.search-card {
  display: flex;
  flex-direction: column;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  cursor: pointer;
  padding: 0;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.search-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(67, 74, 122, 0.08);
  border-color: rgba(123, 104, 238, 0.3);
}

.search-card:focus-visible {
  outline: 3px solid rgba(123, 104, 238, 0.4);
  outline-offset: 2px;
}

.search-card-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: rgba(0, 0, 0, 0.04);
  display: grid;
  place-items: center;
  overflow: hidden;
  color: var(--muted);
}

.search-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.search-card-thumb .material-symbols-rounded {
  font-size: 36px;
}

.search-card-thumb--icon {
  background: linear-gradient(135deg, rgba(123, 104, 238, 0.08), rgba(67, 74, 122, 0.06));
  color: var(--violet);
}

.search-card-thumb--avatar {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
}

.search-card-avatar-fallback {
  font-size: 32px;
  font-weight: 900;
  color: #fff;
}

.search-card-body {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.search-card-eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.search-card-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-card-meta {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-card-author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  margin: 4px 0 0;
}

.search-card-author .avatar {
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--violet);
  color: #fff;
  font-weight: 800;
}

.place-detail-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
}

.place-detail-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(8px);
}

.place-detail-dialog {
  position: relative;
  z-index: 1;
  width: min(940px, 96vw);
  max-height: min(860px, 92vh);
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.86),
    0 32px 72px rgba(0, 50, 150, 0.18);
}

.place-detail-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(227, 231, 244, 0.86);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink);
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.place-detail-close:hover {
  transform: translateY(-1px);
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
}

.place-detail-media {
  position: relative;
  min-height: 100%;
  background: linear-gradient(135deg, rgba(123, 104, 238, 0.12), rgba(0, 102, 255, 0.08));
  overflow: hidden;
}

.place-detail-media img,
.place-detail-media-placeholder {
  width: 100%;
  height: 100%;
  min-height: 520px;
  object-fit: cover;
  display: block;
}

.place-detail-media-placeholder {
  display: grid;
  place-items: center;
  color: rgba(67, 74, 122, 0.36);
}

.place-detail-media-placeholder .material-symbols-rounded {
  font-size: 84px;
}

.place-detail-media::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.72));
}

.place-detail-media-overlay {
  position: absolute;
  left: 28px;
  right: 28px;
  bottom: 28px;
  z-index: 1;
  color: #fff;
}

.place-detail-category {
  display: inline-flex;
  width: fit-content;
  margin-bottom: 10px;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  font-size: 12px;
  font-weight: 850;
}

.place-detail-media-overlay h2 {
  margin: 0;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1.08;
  font-weight: 950;
  letter-spacing: 0;
}

.place-detail-media-overlay p {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 14px 0 0;
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.92;
}

.place-detail-media-overlay .material-symbols-rounded {
  flex: 0 0 auto;
  font-size: 18px;
}

.place-detail-media-reactions {
  position: absolute;
  right: 28px;
  bottom: 28px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.place-detail-media-reactions .place-detail-reaction-btn {
  width: 42px;
  height: 42px;
  min-height: 0;
  padding: 0;
  border-radius: 50%;
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
}

.place-detail-media-reactions .place-detail-reaction-btn .material-symbols-rounded {
  width: 100%;
  height: 100%;
  background: transparent;
  font-size: 22px;
}

.place-detail-content {
  min-height: 0;
  max-height: min(860px, 92vh);
  overflow-y: auto;
  padding: 34px 34px 30px;
}

.place-detail-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 18px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(0, 102, 255, 0.06);
  color: var(--violet);
  font-size: 13px;
  font-weight: 800;
}

.place-detail-state .material-symbols-rounded {
  font-size: 20px;
}

.place-detail-state--error {
  background: rgba(244, 63, 94, 0.08);
  color: var(--rose);
}

.place-detail-reaction-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  margin: 30px 0 0;
  padding-top: 22px;
  border-top: 1px solid rgba(226, 232, 240, 0.92);
}

.place-detail-reaction-copy {
  min-width: 0;
}

.place-detail-reaction-kicker {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  margin-bottom: 8px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
  font-size: 11px;
  font-weight: 900;
}

.place-detail-reaction-copy strong {
  display: block;
  color: var(--ink);
  font-size: 16px;
  font-weight: 900;
  line-height: 1.35;
}

.place-detail-reaction-copy p {
  margin: 5px 0 0;
  color: #667085;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.place-detail-reaction-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(68px, 1fr));
  gap: 8px;
  min-width: 252px;
}

.place-detail-reaction-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 76px;
  padding: 9px 8px;
  border: 1px solid rgba(224, 231, 244, 0.96);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.place-detail-reaction-btn .material-symbols-rounded {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #f8fafc;
  font-size: 22px;
  transition: background 0.2s ease, color 0.2s ease;
}

.place-detail-reaction-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
}

.place-detail-reaction-btn:disabled {
  cursor: progress;
  opacity: 0.68;
}

.place-detail-reaction-btn--nope:hover:not(:disabled),
.place-detail-reaction-btn--nope.active {
  border-color: rgba(15, 23, 42, 0.18);
  background: #f8fafc;
  color: #0f172a;
}

.place-detail-reaction-btn--nope {
  border-color: rgba(71, 85, 105, 0.18);
  background: rgba(248, 250, 252, 0.96);
  color: #334155;
}

.place-detail-reaction-btn--nope .material-symbols-rounded {
  background: rgba(51, 65, 85, 0.1);
  color: #334155;
}

.place-detail-reaction-btn--nope:hover:not(:disabled) .material-symbols-rounded,
.place-detail-reaction-btn--nope.active .material-symbols-rounded {
  background: #0f172a;
  color: #fff;
}

.place-detail-reaction-btn--like {
  border-color: rgba(244, 63, 94, 0.18);
  background: rgba(255, 92, 141, 0.07);
  color: var(--rose);
}

.place-detail-reaction-btn--like .material-symbols-rounded {
  background: rgba(255, 92, 141, 0.14);
  color: var(--rose);
}

.place-detail-reaction-btn--like:hover:not(:disabled),
.place-detail-reaction-btn--like.active {
  border-color: rgba(244, 63, 94, 0.24);
  background: rgba(255, 92, 141, 0.08);
  color: var(--rose);
}

.place-detail-reaction-btn--like:hover:not(:disabled) .material-symbols-rounded,
.place-detail-reaction-btn--like.active .material-symbols-rounded {
  background: var(--rose);
  color: #fff;
  font-variation-settings: 'FILL' 1;
}

.place-detail-reaction-btn--super {
  border-color: rgba(123, 104, 238, 0.2);
  background: linear-gradient(135deg, rgba(123, 104, 238, 0.1), rgba(0, 102, 255, 0.06));
  color: var(--violet);
}

.place-detail-reaction-btn--super .material-symbols-rounded {
  background: linear-gradient(135deg, rgba(123, 104, 238, 0.18), rgba(0, 102, 255, 0.14));
  color: var(--violet);
}

.place-detail-reaction-btn--super:hover:not(:disabled),
.place-detail-reaction-btn--super.active {
  border-color: rgba(123, 104, 238, 0.26);
  background: rgba(123, 104, 238, 0.1);
  color: var(--violet);
}

.place-detail-reaction-btn--super:hover:not(:disabled) .material-symbols-rounded,
.place-detail-reaction-btn--super.active .material-symbols-rounded {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-variation-settings: 'FILL' 1;
}

.place-detail-section {
  margin-bottom: 26px;
}

.place-detail-section h3 {
  margin: 0 0 12px;
  color: var(--ink);
  font-size: 17px;
  font-weight: 900;
}

.place-detail-description {
  margin: 0;
  color: #4b5563;
  font-size: 15px;
  line-height: 1.72;
  word-break: keep-all;
}

.place-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.place-detail-tags span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(123, 104, 238, 0.08);
  color: var(--violet);
  font-size: 12px;
  font-weight: 800;
}

.place-detail-gallery {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.place-detail-gallery img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 14px;
  background: var(--bg);
}

.place-detail-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 24px;
}

.place-detail-info-card {
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: linear-gradient(180deg, #fff, rgba(246, 249, 255, 0.72));
}

.place-detail-info-card .material-symbols-rounded {
  display: block;
  margin-bottom: 6px;
  color: var(--violet);
  font-size: 19px;
}

.place-detail-info-card small {
  display: block;
  margin-bottom: 3px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.place-detail-info-card strong {
  display: block;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 850;
  word-break: keep-all;
}

.place-detail-accessibility {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.place-detail-accessibility-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--muted);
  font-size: 12px;
  font-weight: 850;
}

.place-detail-accessibility-pill .material-symbols-rounded {
  font-size: 17px;
}

.place-detail-accessibility-pill.available {
  border-color: rgba(16, 185, 129, 0.24);
  background: rgba(16, 185, 129, 0.08);
  color: #047857;
}

.place-detail-accessibility-pill.unavailable {
  border-color: rgba(244, 63, 94, 0.22);
  background: rgba(244, 63, 94, 0.06);
  color: #be123c;
}

@media (max-width: 1024px) {
  .search-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .place-detail-dialog {
    grid-template-columns: 1fr;
    width: min(720px, 96vw);
  }

  .place-detail-media img,
  .place-detail-media-placeholder {
    min-height: 320px;
    max-height: 360px;
  }

  .place-detail-content {
    max-height: calc(92vh - 320px);
  }

  .place-detail-reaction-panel {
    grid-template-columns: 1fr;
  }

  .place-detail-reaction-actions {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 720px) {
  .search-page {
    padding: 20px 16px 16px;
  }

  .search-head-title {
    font-size: 22px;
  }

  .search-form {
    max-width: 100%;
  }

  .search-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .place-detail-modal {
    padding: 12px;
  }

  .place-detail-dialog {
    border-radius: 22px;
  }

  .place-detail-content {
    padding: 24px 20px 22px;
  }

  .place-detail-media-reactions {
    right: 20px;
    bottom: 20px;
    gap: 7px;
  }

  .place-detail-media-reactions .place-detail-reaction-btn {
    width: 38px;
    height: 38px;
  }

  .place-detail-info-grid {
    grid-template-columns: 1fr;
  }

  .place-detail-reaction-panel {
    padding-top: 18px;
  }

  .place-detail-reaction-actions {
    gap: 8px;
  }

  .place-detail-reaction-btn {
    min-height: 74px;
    border-radius: 16px;
    font-size: 11px;
  }

  .place-detail-reaction-btn .material-symbols-rounded {
    width: 34px;
    height: 34px;
    font-size: 20px;
  }
}

@media (max-width: 520px) {
  .search-input.search-input.search-input {
    padding-right: 40px;
  }

  .search-clear-btn {
    right: 58px;
  }

  .search-submit-btn {
    min-width: 52px;
    padding: 0 16px;
  }

  .search-submit-btn span:last-child {
    display: none;
  }

  .place-detail-gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .search-grid {
    grid-template-columns: 1fr;
  }
}
</style>
