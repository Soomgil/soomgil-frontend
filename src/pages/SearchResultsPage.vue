<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { searchApi } from '@/api/search.api'
import type { UnifiedSearchResponse } from '@/types/search'
import type { CommunityPostSummary } from '@/types/community'
import type { PlaceSearchSummary, UserSearchResult } from '@/types/search'
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

function gotoPlace(place: PlaceSearchSummary) {
  router.push({ name: 'PlaceDetail', params: { provider: place.provider, id: place.externalPlaceId } })
}

function gotoPost(post: CommunityPostSummary) {
  router.push({ path: `/community/${post.id}` })
}

function gotoUser(user: UserSearchResult) {
  router.push({ path: `/mypage/${user.id}` })
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
                @click="gotoPlace(place)"
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
  </AppShell>
</template>

<style scoped>
.search-page {
  width: 100%; /* defeat flex auto-margin content-sizing: force container width so
                  the search bar stays the same width with or without results */
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 24px 20px;
  /* Lock the whole page to the viewport below the fixed 72px topbar so the
     header (search bar + tabs) keeps a constant size and the result body
     below fills the remaining space and scrolls internally — it no longer
     grows with results or collapses when empty. */
  height: calc(100vh - 72px);
  display: flex;
  flex-direction: column;
}

.search-head {
  flex: 0 0 auto;
  margin-bottom: 20px;
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
  max-width: 680px; /* keep the search bar narrow and centered while the result
                       grid below stays full-width */
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
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  font-size: 15px;
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--violet);
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
  flex: 1 1 auto;
  min-height: 0; /* allow the flex item to shrink so overflow scrolling works */
  margin-top: 0;
  padding: 0 4px 24px 0;
  overflow-y: auto;
  overscroll-behavior: contain; /* don't chain scroll to the window */
  scrollbar-width: none;
}

.search-body::-webkit-scrollbar {
  display: none;
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

@media (max-width: 1024px) {
  .search-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
}

@media (max-width: 480px) {
  /* On narrow screens the global topbar wraps and body padding-top grows to
     132px, so shrink the page height to match and keep it within the viewport. */
  .search-page {
    height: calc(100vh - 132px);
  }

  .search-grid {
    grid-template-columns: 1fr;
  }
}
</style>
