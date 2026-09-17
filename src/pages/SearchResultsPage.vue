<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import InkWashBackdrop from '@/components/layout/InkWashBackdrop.vue'
import inkMask from '@/assets/textures/ink-reveal-mask.png'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import StoryDetailOverlay from '@/components/community/StoryDetailOverlay.vue'
import { placeApi } from '@/api/place.api'
import { searchApi } from '@/api/search.api'
import { useSwipeStore } from '@/stores/swipe.store'
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
const swipeStore = useSwipeStore()
const detailScroller = ref<HTMLElement | null>(null)
const expandedInfo = ref<HTMLElement | null>(null)
let detailRequest = 0
const detailInfoLoaded = ref(false)
async function togglePlaceInfo() {
  detailDescriptionExpanded.value = !detailDescriptionExpanded.value
  const place=selectedPlace.value
  const request=detailRequest
  if(detailDescriptionExpanded.value && place && !detailInfoLoaded.value) {
    placeDetailLoading.value=true
    try {
      const detail=await placeApi.getPlace(place.provider,place.externalPlaceId,true)
      if(request===detailRequest) { selectedPlace.value=detail; detailInfoLoaded.value=true; placeDetailError.value=null }
    } catch { if(request===detailRequest) placeDetailError.value='이용 정보를 불러오지 못했습니다. 다시 펼쳐 시도해주세요.' }
    finally { if(request===detailRequest) placeDetailLoading.value=false }
  }
  await nextTick()
  if (detailDescriptionExpanded.value && detailScroller.value && expandedInfo.value) {
    const offset = expandedInfo.value.getBoundingClientRect().top - detailScroller.value.getBoundingClientRect().top
    detailScroller.value.scrollBy?.({ top: Math.min(180, Math.max(0, offset - 100)), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }
}

const RECENT_KEY = 'soomgil:recent-searches'
const RECENT_LIMIT = 8

const searchInput = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
const activeTab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : '전체')
const result = ref<UnifiedSearchResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const recentSearches = ref<string[]>(loadRecentSearches())
const selectedPlace = ref<Place | null>(null)
const detailPhotoIndex = ref(0)
const detailPhotoRatio = ref(1.5)
function measureDetailPhoto(event: Event) {
  const image=event.target as HTMLImageElement
  if(image.naturalWidth && image.naturalHeight) detailPhotoRatio.value=image.naturalWidth/image.naturalHeight
}
const detailDescriptionExpanded = ref(false)
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

const displayedCount = computed(() => visibleTrips.value.length + visiblePlaces.value.length + visiblePosts.value.length + visibleUsers.value.length)
const searchHeading = computed(() => queryFromUrl().trim() ? '“' + queryFromUrl().trim() + '” 검색 결과' : '다음 여행을 찾아보세요')

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
  const request = ++detailRequest
  detailInfoLoaded.value=false
  detailPhotoIndex.value = 0
  detailDescriptionExpanded.value = false
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
    const [detail, reaction] = await Promise.all([
      placeApi.getPlace(place.provider, place.externalPlaceId, false),
      swipeApi.getReaction(place.provider, place.externalPlaceId),
    ])
    if (request !== detailRequest) return
    selectedPlace.value = detail
    selectedPlaceReaction.value = reaction
  } catch (err) {
    if (request !== detailRequest) return
    console.error('Failed to load place detail:', err)
    placeDetailError.value = '장소 상세 정보를 불러오지 못했습니다.'
  } finally {
    if (request === detailRequest) placeDetailLoading.value = false
  }
}

function closePlaceDetail() {
  detailRequest++
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
  const request = detailRequest
  const previous = selectedPlaceReaction.value
  selectedPlaceReaction.value = reaction
  placeReactionSubmitting.value = true
  placeReactionMessage.value = null
  try {
    const result = await swipeApi.react(place.provider, place.externalPlaceId, reaction)
    swipeStore.applyExternalReaction(place.provider, place.externalPlaceId, result.reaction)
    if (request !== detailRequest) return
    selectedPlaceReaction.value = result.reaction
    const labels: Record<SwipeAction, string> = {
      NOPE: '관심 없음으로 저장했어요.',
      LIKE: '좋아요로 저장했어요.',
      SUPER_LIKE: '슈퍼라이크로 저장했어요.',
    }
    placeReactionMessage.value = labels[result.reaction]
  } catch (err) {
    if (request !== detailRequest) return
    selectedPlaceReaction.value = previous
    console.error('Failed to react to place:', err)
    placeReactionMessage.value = '반응을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    if (request === detailRequest) placeReactionSubmitting.value = false
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
    posts: '/community',
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
  <AppShell immersive paper>
    <div class="search-page" :style="{ '--ink-mask': `url(${inkMask})` }">
      <InkWashBackdrop />
      <div class="search-content">
      <section class="search-head" aria-label="다시 검색">
        <a href="/home" class="search-back-link" @click.prevent="router.push('/home')"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>풍경으로 돌아가기</a>
        <form class="paper-search" role="search" aria-label="통합 검색" @submit.prevent="submitSearch">
          <div class="paper-search-field">
            <span class="material-symbols-rounded paper-search-icon" aria-hidden="true">search</span>
            <input v-model="searchInput" class="paper-search-input" type="search" placeholder="여행지, 계획, 커뮤니티 글, 유저를 검색하세요"
              aria-label="검색어 입력" autocomplete="off" enterkeyhint="search" maxlength="200" />
            <button v-if="searchInput" type="button" class="paper-search-clear" aria-label="검색어 지우기" @click="searchInput = ''">
              <span class="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
            <button type="submit" class="paper-search-submit" aria-label="검색"><span class="material-symbols-rounded" aria-hidden="true">search</span>검색</button>
          </div>
        </form>
      </section>
      <header class="search-summary">
        <p class="search-kicker">새로운 여행의 발견</p>
        <h1>{{ searchHeading }}</h1>
        <p v-if="result && !loading && !error && hasQuery" class="search-result-caption" role="status">표시 중인 결과 {{ displayedCount }}개 · 마음에 드는 풍경에서 다음 여행을 시작해 보세요.</p>
        <p v-else class="search-result-caption">가보고 싶은 곳, 함께 떠날 사람, 새로운 여행 이야기를 만나보세요.</p>
      </header>
      <div class="search-tabs" role="group" aria-label="검색 결과 필터">
        <button v-for="tab in tabs" :key="tab.key" type="button" class="search-tab"
          :class="{ active: activeTab === tab.key }" :aria-pressed="activeTab === tab.key"
          :aria-label="tab.key + ' 결과 보기'" @click="selectTab(tab.key)">{{ tab.key }}</button>
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
              <button type="button" class="search-more-btn" @click="exploreSection('trips')">
                자세히 보기
                <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
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
                <div class="search-card-thumb" :class="{ 'search-card-thumb--icon': !trip.coverImageUrl }">
                  <img loading="lazy" v-if="trip.coverImageUrl" :src="trip.coverImageUrl" :alt="trip.title" />
                  <span v-else class="material-symbols-rounded">luggage</span>
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
              <button type="button" class="search-more-btn" @click="exploreSection('places')">
                자세히 보기
                <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
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
                  <img loading="lazy" v-if="place.thumbnailUrl" :src="place.thumbnailUrl" :alt="place.name" />
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
              <button type="button" class="search-more-btn" @click="exploreSection('posts')">
                자세히 보기
                <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
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
              <button type="button" class="search-more-btn" @click="exploreSection('users')">
                자세히 보기
                <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
              </button>
            </header>
            <div class="search-grid search-grid--users">
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
      </div>
    </div>

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
        <article ref="detailScroller" class="place-detail-dialog" :style="{ '--photo-ratio': detailPhotoRatio }">
          <button class="place-detail-close" type="button" aria-label="닫기" @click="closePlaceDetail">
            <span class="material-symbols-rounded">close</span>
          </button>

          <div class="place-detail-media">
            <img
              v-if="selectedPlaceImages[detailPhotoIndex]"
              :src="selectedPlaceImages[detailPhotoIndex]"
              @load="measureDetailPhoto"
              :alt="selectedPlace.placeName"
            />
            <div v-else class="place-detail-media-placeholder">
              <span class="material-symbols-rounded">landscape</span>
            </div>
            <section
              v-if="selectedPlaceImages.length > 1"
              class="place-detail-section"
              aria-label="장소 사진"
            >

              <div class="place-detail-gallery">
                <button v-for="(image, idx) in selectedPlaceImages" :key="image" type="button" class="place-detail-thumbnail" :aria-label="`${idx + 1}번째 사진 보기`" :aria-pressed="detailPhotoIndex === idx" @click="detailPhotoIndex = idx">
                  <img :src="image" :alt="`${selectedPlace.placeName} 사진 ${idx + 1}`" loading="lazy" />
                </button>
              </div>
            </section>

          </div>

          <div class="place-detail-content">
            <div class="place-detail-heading">
              <button class="place-detail-summary-toggle" type="button" :aria-expanded="detailDescriptionExpanded" aria-controls="place-detail-expanded" @click="togglePlaceInfo">
                <span class="place-detail-summary-copy"><span class="place-detail-name">{{ selectedPlace.placeName }}</span><span v-if="selectedPlace.address" class="place-detail-address">{{ selectedPlace.address }}</span></span>
                <span class="material-symbols-rounded" aria-hidden="true">{{ detailDescriptionExpanded ? 'expand_less' : 'info' }}</span>
                <span class="place-detail-toggle-label">{{ detailDescriptionExpanded ? '정보 접기' : '장소 정보' }}</span>
              </button>
              <div class="place-detail-media-reactions" aria-label="장소 취향 반응">
                <button
                  type="button"
                  class="place-detail-reaction-btn place-detail-reaction-btn--super"
                  :class="{ active: selectedPlaceReaction === 'SUPER_LIKE' }"
                  :aria-pressed="selectedPlaceReaction === 'SUPER_LIKE'"
                  :disabled="placeReactionSubmitting || placeDetailLoading"
                  aria-label="슈퍼라이크"
                  title="슈퍼라이크"
                  @click="reactToSelectedPlace('SUPER_LIKE')"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">star</span><span>슈퍼라이크</span>
                </button>                <button
                  type="button"
                  class="place-detail-reaction-btn place-detail-reaction-btn--like"
                  :class="{ active: selectedPlaceReaction === 'LIKE' }"
                  :aria-pressed="selectedPlaceReaction === 'LIKE'"
                  :disabled="placeReactionSubmitting || placeDetailLoading"
                  aria-label="좋아요"
                  title="좋아요"
                  @click="reactToSelectedPlace('LIKE')"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">favorite</span><span>좋아요</span>
                </button>
                <button
                  type="button"
                  class="place-detail-reaction-btn place-detail-reaction-btn--nope"
                  :class="{ active: selectedPlaceReaction === 'NOPE' }"
                  :aria-pressed="selectedPlaceReaction === 'NOPE'"
                  :disabled="placeReactionSubmitting || placeDetailLoading"
                  aria-label="싫어요"
                  title="싫어요"
                  @click="reactToSelectedPlace('NOPE')"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">close</span><span>싫어요</span>
                </button>

              </div>
            </div>
            <p v-if="placeReactionMessage" class="place-reaction-feedback" role="status">{{ placeReactionMessage }}</p>
            <div v-if="detailDescriptionExpanded" ref="expandedInfo" id="place-detail-expanded" class="place-detail-expanded">
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
              <p id="place-detail-description" class="place-detail-description">{{ selectedPlaceDescription }}</p>
              <div v-if="selectedPlace.tags?.length" class="place-detail-tags">
                <span v-for="tag in selectedPlace.tags" :key="tag">#{{ tag }}</span>
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
.search-page { --ink: #35465A; --muted: #647C92; --line: #EAF4FF; position: relative; isolation: isolate; min-height: 100svh; width: 100%; color: var(--ink); background: #F8FBFF; }
.search-content { width: min(1160px, calc(100% - 80px)); margin: 0 auto; padding: 104px 0 56px; }
.search-head { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 52px; }
.search-back-link { display: inline-flex; align-items: center; align-self: flex-start; gap: 8px; color: #647C92; font-size: 12px; min-height: 36px; text-decoration: none; }
.search-back-link:hover { color: #427EAD; text-decoration: underline; text-underline-offset: 4px; }
.search-back-link .material-symbols-rounded { font-size: 17px; }
.search-summary { margin-bottom: 24px; }
.search-kicker { margin: 0 0 12px; font-size: 11px; letter-spacing: .14em; color: #647C92; font-weight: 500; }
.search-summary h1 { font-family: 'Noto Serif KR', 'Batang', '바탕', serif; font-size: clamp(27px, 3vw, 38px); color: #35465A; font-weight: 500; line-height: 1.4; margin: 0 0 12px; overflow-wrap: anywhere; }
.search-result-caption { margin: 0; color: #647C92; font-size: 13px; font-weight: 400; line-height: 1.7; }
.search-tabs { display: flex; gap: 32px; border-bottom: 1px solid #EAF4FF; margin-bottom: 32px; overflow-x: auto; scrollbar-width: none; }
.search-tab { position: relative; padding: 12px 2px 15px; min-height: 48px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #647C92; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.search-tab.active { color: #427EAD; border-bottom-color: #427EAD; font-weight: 750; }
.search-tab:hover { color: #427EAD; }
.search-tab:focus-visible, .search-back-link:focus-visible { outline: 2px solid #647C92; outline-offset: -2px; }

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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 32px;
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
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
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
  border-color: rgba(15, 23, 42, 0.24);
  background: rgba(51, 65, 85, 0.12);
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
  color: #35465A;
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
    padding: 0;
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

/* 홈에서 이어지는 종이와 먹빛 결과 카드 */
.search-section { margin-bottom: 48px; }
.search-section-head { border: 0; margin-bottom: 18px; }
.search-section-head h2 { font-family: 'Noto Serif KR', 'Batang', '바탕', serif; font-size: 22px; font-weight: 500; color: #427EAD; }
.search-section-icon { color: #8A9DAF; font-size: 19px; }
.search-section-count { color: #647C92; background: transparent; font: 12px sans-serif; padding: 0; }
.search-more-btn { color: #427EAD; border: 1px solid #DFEAF5; border-radius: 999px; padding: 10px 16px; min-height: 44px; gap: 8px; background: transparent; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .18s, border-color .18s; }
.search-more-btn:hover { background: #EAF4FF; border-color: #8A9DAF; }
.search-more-btn:focus-visible { outline: 2px solid #647C92; outline-offset: 3px; }
.search-card { border: 1px solid transparent; border-radius: 10px; background: transparent; box-shadow: none; overflow: visible; }
.search-card:hover { transform: translateY(-3px); background: rgb(234 244 255 / 32%); box-shadow: none; border-color: #EAF4FF; }
.search-card:focus-visible { outline-color: #647C92; }
.search-card-thumb { background: transparent; aspect-ratio: 3 / 2; }
.search-card-thumb img { mask-image: var(--ink-mask); mask-mode: luminance; mask-size: 100% 100%; mask-repeat: no-repeat; }
.search-card-thumb--icon { background: #EAF4FF; color: #8A9DAF; }
.search-card--user .search-card-thumb { width: 56px; height: 56px; margin: 0; flex-shrink: 0; aspect-ratio: 1; border-radius: 50%; background: #EAF4FF; color: #647C92; }
.search-card--user .search-card-thumb img { mask-image: none; }
.search-card-avatar-fallback { color: #647C92; font-size: 25px; }
.search-card-body { padding: 18px 16px 20px; gap: 8px; }
.search-card-title { font-family: 'Noto Serif KR', 'Batang', '바탕', serif; font-weight: 500; font-size: 21px; color: #35465A; line-height: 1.5; }
.search-card-eyebrow { font-weight: 400; font-size: 11px; color: #647C92; }
.search-card-meta, .search-card-author { font-weight: 400; color: #647C92; line-height: 1.7; }
.search-recent { background: rgb(255 255 255 / 55%); border-color: #EAF4FF; }
.place-detail-modal { --ink: #35465A; --muted: #647C92; --bg: #F8FBFF; --line: #EAF4FF; }
.place-detail-dialog { background: #F8FBFF; border-color: #EAF4FF; box-shadow: 0 24px 72px rgb(34 53 39 / 20%); }
.place-detail-media-overlay h2 { font-family: 'Noto Serif KR', 'Batang', '바탕', serif; font-weight: 500; }
.place-detail-section h3 { font-family: 'Noto Serif KR', 'Batang', '바탕', serif; font-weight: 500; color: #427EAD; }
.place-detail-tags span { color: #647C92; background: #EAF4FF; }
.place-detail-info-card { background: #EAF4FF; }
@media (max-width: 767px) {
  .search-content { width: calc(100% - 40px); padding-top: 132px; }
  .search-head { margin-bottom: 36px; }
  .search-tabs { gap: 24px; }
  .search-summary h1 { font-size: 28px; }
  .search-grid { gap: 20px; }
}
@media (max-width: 480px) {
  .search-content { width: calc(100% - 32px); }
  .search-tabs { justify-content: space-between; gap: 8px; }
  .search-card-thumb { aspect-ratio: 3 / 2; }
}
@media (prefers-reduced-motion: reduce) {
  .search-card { transition: none; }
}


.search-grid--users { gap: 16px; }
.search-card--user { flex-direction: row; align-items: center; gap: 16px; min-height: 104px; padding: 18px; border: 1px solid #EAF4FF; border-radius: 16px; background: rgb(255 255 255 / 60%); }
.search-card--user .search-card-body { min-width: 0; flex: 1; padding: 0; gap: 4px; }
.search-card--user .search-card-title { font-family: inherit; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.search-card--user .search-card-meta { margin: 0; font-size: 12px; }
@media (max-width: 1024px) { .search-grid--users { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .search-grid--users { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .search-more-btn, .search-card { transition: none; } }
</style>
<style scoped src="../styles/paper-search.css"></style>
<style scoped>
.search-grid--users { gap: 16px; }
.search-card--user { flex-direction: row; align-items: center; gap: 16px; min-height: 104px; padding: 18px; border: 1px solid #EAF4FF; border-radius: 16px; background: rgb(255 255 255 / 60%); }
.search-card--user .search-card-body { min-width: 0; flex: 1; padding: 0; gap: 4px; }
.search-card--user .search-card-title { font-family: inherit; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.search-card--user .search-card-meta { margin: 0; font-size: 12px; }
@media (max-width: 1024px) { .search-grid--users { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .search-grid--users { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .search-more-btn, .search-card { transition: none; } }

/* 사진과 정보를 분리한 여행지 안내 카드 */
.place-detail-dialog { width:min(1040px, calc(100vw - 48px)); grid-template-columns:minmax(0, 1fr) minmax(0, 1.05fr); background:#fff; color:#35465a; border:1px solid #e4eef6; border-radius:24px; box-shadow:0 28px 90px #28496933; }
.place-detail-media { min-height:0; background:#edf5fb; }
.place-detail-media::after { display:none; }
.place-detail-media > img,.place-detail-media-placeholder { min-height:0; height:100%; max-height:none; object-fit:contain; }
.place-detail-content { max-height:min(860px,92vh); padding:40px 32px 32px; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#ccdeed transparent; }
.place-detail-close { top:12px; right:12px; width:40px; height:40px; color:#506b82; box-shadow:0 3px 12px #33597d14; }
.place-detail-heading { padding:0 18px 24px 0; margin-bottom:24px; border-bottom:1px solid #e6eff6; }
.place-detail-category { padding:5px 10px; background:#edf6ff; color:#4f87b2; border-radius:7px; font-size:11px; font-weight:700; }
.place-detail-heading h2 { font-family:'Noto Serif KR',Batang,serif; font-size:30px; line-height:1.45; font-weight:500; margin:4px 0 10px; overflow-wrap:anywhere; }
.place-detail-heading > p { display:flex; align-items:flex-start; gap:6px; color:#71869a; font-size:13px; line-height:1.7; margin:0; }
.place-detail-heading > p .material-symbols-rounded { font-size:18px; margin-top:2px; flex-shrink:0; }
.place-detail-media-reactions { width:100%; gap:8px; margin-top:22px; flex-wrap:wrap; }
.place-detail-media-reactions .place-detail-reaction-btn { display:flex; flex-direction:row; align-items:center; justify-content:center; gap:6px; width:auto; height:42px; padding:0 12px; border-radius:12px; background:#f6f9fc; border:1px solid #e3ecf4; color:#6f899b; box-shadow:none; font-size:12px; font-weight:600; }
.place-detail-media-reactions .place-detail-reaction-btn .material-symbols-rounded { width:auto; height:auto; font-size:20px; color:inherit; }
.place-detail-media-reactions .place-detail-reaction-btn--like { color:#bd617f; background:#fff6f9; border-color:#f4dce5; }
.place-detail-media-reactions .place-detail-reaction-btn--super { color:#a97d2e; background:#fffbef; border-color:#f1e3bd; }
.place-detail-media-reactions .place-detail-reaction-btn.active { outline:2px solid currentColor; outline-offset:2px; }
.place-detail-dialog button:focus-visible { outline:3px solid #7ebcea; outline-offset:3px; }
.place-detail-section h3 { font-size:14px; font-weight:700; color:#486c89; }
.place-detail-description { color:#62788c; font-size:14px; line-height:1.9; }
.place-detail-info-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.place-detail-info-card { background:#f6faff; border:1px solid #e5eef7; border-radius:14px; box-shadow:none; padding:16px; min-width:0; }
.place-detail-info-card strong { font-size:13px; color:#466179; line-height:1.65; overflow-wrap:anywhere; }
.place-detail-info-card > .material-symbols-rounded { color:#78a6cb; }
.place-detail-gallery { gap:8px; }.place-detail-gallery img { border-radius:10px; }
@media(max-width:760px) {
 .place-detail-modal { padding:12px; }
 .place-detail-dialog { display:block; width:min(600px,calc(100vw - 24px)); max-height:calc(100dvh - 24px); overflow-y:auto; overscroll-behavior:contain; border-radius:20px; }
 .place-detail-media { height:clamp(200px,32dvh,300px); }
 .place-detail-media > img,.place-detail-media-placeholder { width:100%; height:100%; min-height:0; max-height:none; }
 .place-detail-content { max-height:none; overflow:visible; padding:24px 20px; }
 .place-detail-heading { padding-right:0; }.place-detail-heading h2 { font-size:25px; }
 .place-detail-media-reactions .place-detail-reaction-btn { height:44px; padding:0 10px; }
}

.place-detail-description.is-collapsed { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; }
.place-description-more { display:inline-flex; align-items:center; gap:4px; padding:8px 0; border:0; background:transparent; color:#427ead; font-size:12px; font-weight:700; cursor:pointer; }
.place-description-more .material-symbols-rounded { font-size:18px; }
.place-detail-gallery { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); }
.place-detail-thumbnail { padding:0; border:2px solid transparent; border-radius:10px; background:#edf5fb; cursor:pointer; overflow:hidden; aspect-ratio:4/3; }
.place-detail-thumbnail[aria-pressed="true"] { border-color:#68aee0; box-shadow:0 0 0 2px #dcefff; }
.place-detail-thumbnail img { display:block; width:100%; height:100%; object-fit:cover; border-radius:0; }

/* 사진 중심 감상: 세부 정보는 명시적으로 열었을 때만 표시한다. */
.place-detail-dialog { display:block; width:min(1040px,calc(100vw - 48px)); max-height:calc(100dvh - 48px); overflow-y:auto; }
.place-detail-media { display:flex; flex-direction:column; align-items:center; justify-content:center; height:auto; padding:18px 20px 12px; background:#f1f7fc; }
.place-detail-media > img,.place-detail-media-placeholder { width:100%; height:clamp(240px,62dvh,650px); min-height:0; max-height:none; object-fit:contain; }
.place-detail-media > .place-detail-section { margin:12px 0 0; padding:0; width:100%; }
.place-detail-gallery { display:flex; justify-content:center; gap:8px; overflow-x:auto; padding:4px; }
.place-detail-thumbnail { flex:0 0 56px; width:56px; height:40px; }
.place-detail-content { max-height:none; overflow:visible; padding:20px 28px; }
.place-detail-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:0; margin:0; border:0; }
.place-detail-summary-toggle { display:flex; align-items:center; gap:12px; min-width:0; padding:4px 0; text-align:left; color:#427ead; background:transparent; border:0; cursor:pointer; }
.place-detail-summary-copy { display:grid; gap:6px; min-width:0; }.place-detail-name { font-family:'Noto Serif KR',Batang,serif; color:#35465a; font-size:25px; line-height:1.4; overflow-wrap:anywhere; }.place-detail-address { color:#71869a; font-size:12px; line-height:1.5; }
.place-detail-toggle-label { font-size:11px; white-space:nowrap; }
.place-detail-media-reactions { width:auto; margin:0; flex-wrap:nowrap; flex-shrink:0; }
.place-detail-expanded { border-top:1px solid #e6eff6; margin-top:22px; padding-top:24px; }
@media(max-width:760px) {
 .place-detail-dialog { width:calc(100vw - 24px); max-height:calc(100dvh - 24px); }
 .place-detail-media { height:auto; padding:12px 8px 8px; }
 .place-detail-media > img,.place-detail-media-placeholder { height:clamp(220px,52dvh,520px); }
 .place-detail-content { padding:16px; }.place-detail-heading { flex-direction:column; align-items:stretch; gap:16px; }.place-detail-name { font-size:22px; }
 .place-detail-summary-toggle { width:100%; }.place-detail-summary-copy { flex:1; }.place-detail-toggle-label { display:none; }
 .place-detail-media-reactions { justify-content:center; }.place-detail-media-reactions .place-detail-reaction-btn { flex:1; padding:0 8px; }
}

.place-detail-dialog { height:min(850px,calc(100dvh - 48px)); max-height:calc(100dvh - 48px); scroll-behavior:smooth; }
.place-detail-media { position:relative; padding:0; height:calc(min(850px,100dvh - 48px) - 114px); min-height:260px; display:block; }
.place-detail-media > img,.place-detail-media-placeholder { width:100%; height:100%; object-fit:cover; }
.place-detail-media > .place-detail-section { position:absolute; left:0; right:0; bottom:14px; margin:0; }
.place-detail-gallery { justify-content:flex-start; width:max-content; max-width:calc(100% - 40px); margin:auto; padding:7px; background:#ffffffdd; border-radius:13px; overflow-x:auto; }
.place-detail-thumbnail { flex:0 0 64px; height:46px; border-radius:7px; }
.place-detail-media .place-detail-thumbnail img { width:100%; height:100%; min-height:0; max-height:none; object-fit:cover; }
.place-detail-content { padding:18px 24px; }
.place-detail-summary-toggle { flex-wrap:wrap; gap:6px 10px; }
.place-detail-summary-copy { flex-basis:100%; }
.place-detail-summary-toggle > .material-symbols-rounded { font-size:16px; }
.place-detail-toggle-label { display:inline; color:#427ead; }
.place-detail-name { font-size:22px; }.place-detail-address { font-size:11px; }
.place-reaction-feedback { margin:8px 0 0; color:#617d94; font-size:12px; }
@media(max-width:760px) {
 .place-detail-dialog { height:calc(100dvh - 24px); }
 .place-detail-media { height:calc(100dvh - 210px); min-height:220px; }
 .place-detail-content { padding:14px 16px; }.place-detail-heading { gap:12px; }
 .place-detail-summary-toggle { display:grid; grid-template-columns:minmax(0,1fr) auto auto; }.place-detail-summary-copy { grid-column:1; }.place-detail-toggle-label { display:inline; }
}
@media(prefers-reduced-motion:reduce) { .place-detail-dialog { scroll-behavior:auto; } }

.place-detail-dialog,.place-detail-gallery,.place-detail-content { scrollbar-width:none; -ms-overflow-style:none; }
.place-detail-dialog::-webkit-scrollbar,.place-detail-gallery::-webkit-scrollbar,.place-detail-content::-webkit-scrollbar { display:none; width:0; height:0; }

.place-detail-close { position:sticky; top:12px; float:right; margin:12px 12px -52px 0; right:auto; z-index:5; }

@media(max-width:760px) {
 .place-detail-media > img { object-fit:contain; }
 .place-detail-media { padding-bottom:72px; box-sizing:border-box; }
 .place-detail-media > .place-detail-section { bottom:10px; }
}

.place-detail-media > img { object-fit:contain; }
.place-detail-media { padding:0 0 72px; box-sizing:border-box; }

/* 원본 비율을 기준으로 모달 크기를 맞추고 세부 정보만 내부에서 펼친다. */
.place-detail-dialog {
 --photo-height:min(620px,calc(100dvh - 230px),calc((100vw - 48px) / var(--photo-ratio)),calc(1040px / var(--photo-ratio)));
 width:max(min(380px,calc(100vw - 48px)),calc(var(--photo-height) * var(--photo-ratio)));
 height:calc(var(--photo-height) + 196px);
}
.place-detail-media { height:calc(var(--photo-height) + 64px); min-height:0; padding-bottom:64px; }
.place-detail-media > img { height:var(--photo-height); width:100%; object-fit:contain; }
.place-detail-heading { flex-wrap:wrap; gap:10px; }.place-detail-media-reactions { margin-left:auto; }
@media(max-width:760px) {
 .place-detail-dialog { --photo-height:min(620px,calc(100dvh - 245px),calc((100vw - 24px) / var(--photo-ratio))); width:calc(100vw - 24px); height:calc(var(--photo-height) + 220px); }
 .place-detail-media { height:calc(var(--photo-height) + 64px); min-height:0; padding-bottom:64px; }
 .place-detail-media-reactions { margin-left:0; }
}

/* 사진 바로 아래에 필요한 행만 배치한다. 비어 있는 썸네일 공간은 만들지 않는다. */
.place-detail-dialog { height:calc(var(--photo-height) + 132px); }
.place-detail-dialog:has(.place-detail-thumbnail) { height:calc(var(--photo-height) + 190px); }
.place-detail-media { display:block; height:auto; padding:0; min-height:0; }
.place-detail-media > img,.place-detail-media-placeholder { display:block; height:var(--photo-height); min-height:0; }
.place-detail-media > .place-detail-section { position:static; margin:0; padding:6px 10px; background:#fff; width:100%; box-sizing:border-box; }
.place-detail-gallery { padding:0; border-radius:0; background:transparent; max-width:100%; }
.place-detail-thumbnail { height:44px; }
@media(max-width:760px) {
 .place-detail-dialog { height:calc(var(--photo-height) + 152px); }
 .place-detail-dialog:has(.place-detail-thumbnail) { height:calc(var(--photo-height) + 210px); }
 .place-detail-media { height:auto; padding:0; }
}
</style>
<style scoped src="../styles/travel-page-actions.css"></style>
