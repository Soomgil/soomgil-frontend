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

const searchInput = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
const activeTab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : '전체')
const result = ref<UnifiedSearchResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const hasQuery = computed(() => searchInput.value.trim().length > 0)
const totalCount = computed(() => {
  if (!result.value) return 0
  return (
    result.value.trips.length +
    result.value.places.length +
    result.value.posts.length +
    result.value.users.length
  )
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

function submitSearch() {
  const q = searchInput.value.trim()
  if (!q) return
  router.replace({ path: '/search', query: { q, tab: activeTab.value } })
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
  router.push({ path: '/swipe', query: { placeId: place.externalPlaceId } })
}

function gotoPost(post: CommunityPostSummary) {
  router.push({ path: '/community', query: { postId: post.id } })
}

function gotoUser(user: UserSearchResult) {
  router.push({ path: `/mypage/${user.id}` })
}

function exploreSection(section: 'trips' | 'places' | 'posts' | 'users') {
  const q = searchInput.value.trim()
  const target: Record<typeof section, string> = {
    trips: '/my-trips',
    places: '/swipe',
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
    <main class="search-page">
      <!-- Search Header -->
      <section class="search-head">
        <p class="eyebrow">
          <span class="material-symbols-rounded" style="font-size:16px; vertical-align:middle">search</span>
          Unified Search
        </p>
        <h1 class="search-head-title">
          <span>통합 검색</span>
        </h1>
        <p class="search-head-lead">여행, 장소, 여행기, 사용자를 한 번에 찾아보세요.</p>

        <form class="search-form" role="search" @submit.prevent="submitSearch">
          <div class="search-input-wrap">
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
          </div>
          <button type="submit" class="btn primary search-submit-btn">
            <span class="material-symbols-rounded">search</span>
            <span>검색</span>
          </button>
        </form>
      </section>

      <!-- Result Body -->
      <section class="search-body">
        <LoadingState v-if="loading" />
        <ErrorState
          v-else-if="error"
          :message="error"
          @retry="runSearch(searchInput)"
        />
        <EmptyState
          v-else-if="!hasQuery"
          icon="search"
          title="검색어를 입력해 주세요"
          description="찾고 싶은 여행, 장소, 여행기, 사용자를 검색해 보세요."
        />
        <EmptyState
          v-else-if="result && totalCount === 0"
          icon="search_off"
          title="검색 결과가 없어요"
          :description="`&quot;${result.query}&quot; 와(과) 일치하는 결과가 없습니다. 다른 키워드로 다시 검색해 보세요.`"
        />
        <template v-else-if="result">
          <!-- Trips -->
          <section v-if="result.trips.length > 0" class="search-section" aria-label="여행 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">luggage</span>
                여행
                <span class="search-section-count">{{ result.trips.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('trips')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="trip in result.trips"
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
          <section v-if="result.places.length > 0" class="search-section" aria-label="장소 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">place</span>
                장소
                <span class="search-section-count">{{ result.places.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('places')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="place in result.places"
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
          <section v-if="result.posts.length > 0" class="search-section" aria-label="여행기 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">auto_stories</span>
                여행기
                <span class="search-section-count">{{ result.posts.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('posts')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="post in result.posts"
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
          <section v-if="result.users.length > 0" class="search-section" aria-label="사용자 결과">
            <header class="search-section-head">
              <h2>
                <span class="material-symbols-rounded search-section-icon">group</span>
                사용자
                <span class="search-section-count">{{ result.users.length }}</span>
              </h2>
              <button type="button" class="btn ghost search-more-btn" @click="exploreSection('users')">
                자세히 보기
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </header>
            <div class="search-grid">
              <button
                v-for="user in result.users"
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
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

.search-head {
  margin-bottom: 28px;
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
  gap: 8px;
  align-items: stretch;
}

.search-input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
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

.search-input {
  width: 100%;
  height: 48px;
  padding: 0 44px 0 44px;
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
  right: 8px;
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
  height: 48px;
  padding: 0 20px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
}

.search-submit-btn .material-symbols-rounded {
  font-size: 20px;
}

.search-body {
  margin-top: 12px;
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
    padding: 20px 16px 60px;
  }

  .search-head-title {
    font-size: 22px;
  }

  .search-form {
    flex-direction: column;
  }

  .search-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
}

@media (max-width: 480px) {
  .search-grid {
    grid-template-columns: 1fr;
  }
}
</style>
