<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import '@/styles/mypage.css'
import AppShell from '@/components/layout/AppShell.vue'
import { mockOtherUsers, mockFollowers, mockFollowing } from '@/mocks/mockUser'
import type { FollowUser } from '@/mocks/mockUser'
import type { UserProfile } from '@/types/user'
import { mockPlaces } from '@/mocks/mockPlaces'
import { mockCommunityStories } from '@/mocks/mockCommunity'
import { useModal } from '@/composables/useModal'
import LikedPlacesModal from '@/components/mypage/LikedPlacesModal.vue'
import MyStoriesModal from '@/components/mypage/MyStoriesModal.vue'
import FollowListModal from '@/components/common/FollowListModal.vue'

const route = useRoute()
const router = useRouter()

const userId = computed(() => route.params.userId as string)
const user = computed<UserProfile | undefined>(() =>
  mockOtherUsers.find(u => u.id === userId.value)
)

// 이 사용자의 스토리
const userStories = computed(() => {
  if (!user.value) return []
  return mockCommunityStories.filter(s => s.author === user.value!.displayName)
})

// 이 사용자가 좋아요한 장소 (mock: 랜덤 4개)
const likedPlaces = computed(() => mockPlaces.slice(0, 4))

// Search
const placeSearchQuery = ref('')
const filteredPlaces = computed(() => {
  if (!placeSearchQuery.value.trim()) return likedPlaces.value
  const q = placeSearchQuery.value.trim().toLowerCase()
  return likedPlaces.value.filter((p) =>
    p.placeName.toLowerCase().includes(q) ||
    (p.address ?? '').toLowerCase().includes(q) ||
    (p.tags ?? []).some(t => t.toLowerCase().includes(q))
  )
})

// Follow state
const isFollowing = ref(false)
function toggleFollow() { isFollowing.value = !isFollowing.value }

// Tags mock from bio
const profileTags = computed(() => {
  const tags: string[] = []
  const bio = user.value?.bio ?? ''
  if (bio.includes('빵')) tags.push('#빵지순례')
  if (bio.includes('자전거')) tags.push('#자전거')
  if (bio.includes('카페')) tags.push('#카페')
  if (bio.includes('야경')) tags.push('#야경')
  if (bio.includes('산책')) tags.push('#산책')
  if (bio.includes('자연')) tags.push('#자연')
  if (bio.includes('온천')) tags.push('#온천')
  if (bio.includes('시장') || bio.includes('미식')) tags.push('#미식')
  if (bio.includes('숲') || bio.includes('피톤치드')) tags.push('#숲길')
  if (bio.includes('드라이브') || bio.includes('호수')) tags.push('#드라이브')
  if (bio.includes('사진') || bio.includes('출사')) tags.push('#출사')
  if (bio.includes('가족')) tags.push('#가족여행')
  if (bio.includes('빈티지') || bio.includes('소품')) tags.push('#빈티지')
  if (tags.length === 0) tags.push('#여행', '#탐험')
  return tags
})

// Stats
const profileStats = computed(() => [
  { icon: 'luggage', value: String(user.value?.tripCount ?? 0), label: '여행' },
  { icon: 'favorite', value: String(likedPlaces.value.length), label: '좋아요' },
  { icon: 'auto_stories', value: String(userStories.value.length), label: '스토리' },
  { icon: 'group', value: String(user.value?.followerCount ?? 0), label: '팔로워' },
  { icon: 'person_add', value: String(user.value?.followingCount ?? 0), label: '팔로잉' },
])

// Modals
const likedPlacesModal = useModal()
const myStoriesModal = useModal()
const followersModal = useModal()
const followingModal = useModal()

// Mock follow lists for this user
const userFollowers: FollowUser[] = mockOtherUsers.slice(0, Math.min(6, user.value?.followerCount ?? 0)).map(u => ({
  userId: u.id, displayName: u.displayName, profileImageUrl: u.profileImageUrl, bio: u.bio ?? '',
}))
const userFollowing: FollowUser[] = mockOtherUsers.slice(3, Math.min(8, 3 + (user.value?.followingCount ?? 0))).map(u => ({
  userId: u.id, displayName: u.displayName, profileImageUrl: u.profileImageUrl, bio: u.bio ?? '',
}))
const followingIds = ref(new Set(mockFollowing.map(f => f.userId)))

function onStatClick(label: string) {
  if (label === '팔로워') followersModal.open()
  else if (label === '팔로잉') followingModal.open()
}
</script>

<template>
  <AppShell>
    <main v-if="user">
      <section class="section mypage-shell" aria-labelledby="user-profile-title">
        <div class="mypage-page-heading">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <button type="button" style="width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;" @click="router.back()">
              <span class="material-symbols-rounded" style="font-size: 20px; color: var(--ink);">arrow_back</span>
            </button>
            <p class="eyebrow"><span class="material-symbols-rounded" aria-hidden="true">person</span> Profile</p>
          </div>
          <h1 id="user-profile-title"><span class="gradient-text">{{ user.displayName }}님의 여행 프로필</span></h1>
        </div>

        <!-- 프로필 히어로 영역 -->
        <div class="mypage-hero" data-mypage-hero>
          <div class="mypage-hero__content">
            <div class="mypage-profile-card">
              <!-- Avatar + Info -->
              <div class="profile-card-left-group">
                <div class="mypage-hero__avatar-container">
                  <span class="mypage-hero__avatar-ring">
                    <span
                      class="mypage-hero__avatar"
                      :style="{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--violet)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '28px',
                      }"
                    >{{ user.displayName.charAt(0) }}</span>
                  </span>
                </div>
                <div class="profile-card-details">
                  <div class="mypage-hero__name-col">
                    <div class="mypage-hero__name-row">
                      <h2 class="mypage-hero__name">{{ user.displayName }}</h2>
                    </div>
                    <span class="mypage-hero__email">{{ user.bio }}</span>
                  </div>
                  <ul class="mypage-hero__tags">
                    <li v-for="tag in profileTags" :key="tag" class="mypage-hero__tag">{{ tag }}</li>
                  </ul>
                </div>
              </div>

              <!-- Stats -->
              <div class="mypage-profile-minimal-stats">
                <div v-for="stat in profileStats" :key="stat.label" class="minimal-stat-item"
                  :style="{ cursor: (stat.label === '팔로워' || stat.label === '팔로잉') ? 'pointer' : 'default' }"
                  @click="onStatClick(stat.label)">
                  <span class="material-symbols-rounded minimal-stat-icon">{{ stat.icon }}</span>
                  <span class="minimal-stat-value">{{ stat.value }}</span>
                  <span class="minimal-stat-label">{{ stat.label }}</span>
                </div>
              </div>

              <!-- Actions: Follow button only -->
              <div class="mypage-profile-actions">
                <button type="button" class="mypage-profile-btn"
                  :style="{
                    background: isFollowing ? '#fff' : 'var(--violet)',
                    color: isFollowing ? 'var(--muted)' : '#fff',
                    border: isFollowing ? '1px solid var(--line)' : 'none',
                  }"
                  @click="toggleFollow">
                  <span class="material-symbols-rounded">{{ isFollowing ? 'person_remove' : 'person_add' }}</span>
                  {{ isFollowing ? '팔로잉' : '팔로우' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mypage-glass-container">
          <div class="mypage-body-container">

            <!-- 1. 좋아요한 장소 섹션 -->
            <section class="mypage-section" aria-labelledby="section-liked-places-title">
              <div class="mypage-section-header">
                <h2 id="section-liked-places-title" class="mypage-section-title">
                  <span class="material-symbols-rounded section-icon section-icon--rose" aria-hidden="true">favorite</span>좋아요한 장소
                </h2>
                <div class="mypage-header-search-row">
                  <div class="mypage-search-inline">
                    <span class="material-symbols-rounded">search</span>
                    <input type="search" v-model="placeSearchQuery" placeholder="장소명, 지역, 태그로 검색" />
                  </div>
                  <span class="mypage-search-count">{{ filteredPlaces.length }}곳</span>
                  <a href="#" class="mypage-more-link" @click.prevent="likedPlacesModal.open()">모두 보기 ›</a>
                </div>
              </div>

              <div class="mypage-section-content liked-places-layout">
                <div class="mypage-places-grid" data-mypage-places-list>
                  <div v-for="place in filteredPlaces" :key="place.externalPlaceId" class="mypage-place-card">
                    <div class="place-img-wrap">
                      <img :src="(place.thumbnailUrl ?? '')" :alt="place.placeName" />
                    </div>
                    <div class="place-info-wrap">
                      <span class="place-region-category">{{ place.address }}</span>
                      <h3 class="place-title-h3">{{ place.placeName }}</h3>
                      <p class="place-desc-text">{{ place.summary }}</p>
                      <div class="place-tag-row">
                        <span v-for="tag in (place.tags ?? []).slice(0, 3)" :key="tag" class="place-tag-pill">#{{ tag }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. 여행기 섹션 -->
            <section class="mypage-section" aria-labelledby="section-my-stories-title">
              <div class="mypage-section-header">
                <h2 id="section-my-stories-title" class="mypage-section-title">
                  <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">auto_stories</span>{{ user.displayName }}님의 여행기
                </h2>
                <a href="#" class="mypage-more-link" @click.prevent="myStoriesModal.open()">모두 보기 ›</a>
              </div>

              <div class="mypage-stories-magazine" data-mypage-stories-list>
                <div v-for="story in userStories" :key="story.id" class="mypage-story-magazine-item">
                  <img class="story-magazine-thumb" :src="story.image" :alt="story.title" />
                  <div class="story-magazine-body">
                    <h3 class="story-magazine-title">
                      <a href="#">{{ story.title }}</a>
                    </h3>
                    <div class="story-magazine-meta">
                      <span class="story-date">{{ story.location }}</span>
                      <div class="story-stats-row">
                        <span>
                          <span class="material-symbols-rounded">favorite</span> {{ story.likes }}
                        </span>
                        <span>
                          <span class="material-symbols-rounded">chat_bubble</span> {{ story.comments }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="userStories.length === 0" style="text-align: center; padding: 40px 0; color: var(--muted);">
                <span class="material-symbols-rounded" style="font-size: 48px; opacity: 0.3;">auto_stories</span>
                <p style="margin-top: 12px; font-weight: 700;">아직 작성한 여행기가 없습니다.</p>
              </div>
            </section>

            <!-- 3. 하단 분석 통계 위젯 -->
            <section class="mypage-insights-section" aria-labelledby="section-insights-title">
              <div class="mypage-insights-grid">
                <!-- 좌측: 여행 지도 -->
                <article class="insight-card map-insight-card">
                  <div class="insight-card-header">
                    <h3 id="section-insights-title">여행 지도</h3>
                    <p class="insight-subtitle">방문한 지역 <strong>{{ user.tripCount }}곳</strong></p>
                  </div>
                  <div class="map-insight-content">
                    <div class="korea-map-container" data-map-visual>
                      <span class="material-symbols-rounded" style="font-size:80px; color:var(--muted); opacity:0.3;">public</span>
                    </div>
                    <div class="map-stats-panel">
                      <ol class="map-stats-list">
                        <li><span class="rank-num">1</span> <span class="rank-city">대전</span> <span class="rank-count">{{ Math.ceil(user.tripCount / 3) }}회</span></li>
                        <li><span class="rank-num">2</span> <span class="rank-city">부산</span> <span class="rank-count">{{ Math.ceil(user.tripCount / 5) }}회</span></li>
                        <li><span class="rank-num">3</span> <span class="rank-city">제주</span> <span class="rank-count">{{ Math.ceil(user.tripCount / 8) }}회</span></li>
                      </ol>
                      <button type="button" class="btn-more-map">지도로 더 보기</button>
                    </div>
                  </div>
                </article>

                <!-- 우측: 여행 취향 -->
                <article class="insight-card preference-insight-card">
                  <div class="insight-card-header">
                    <h3>여행 취향</h3>
                    <p class="insight-subtitle">{{ user.displayName }}님의 여행 스타일</p>
                  </div>
                  <div class="preference-insight-content">
                    <div class="preference-charts-row">
                      <div class="preference-chart-item">
                        <div class="circular-progress-bar" style="--percent: 42%; --color: var(--violet)">
                          <div class="progress-inner">42%</div>
                        </div>
                        <span class="preference-label-badge nature">자연</span>
                      </div>
                      <div class="preference-chart-item">
                        <div class="circular-progress-bar" style="--percent: 28%; --color: var(--yellow)">
                          <div class="progress-inner">28%</div>
                        </div>
                        <span class="preference-label-badge cafe">카페</span>
                      </div>
                      <div class="preference-chart-item">
                        <div class="circular-progress-bar" style="--percent: 18%; --color: var(--blue)">
                          <div class="progress-inner">18%</div>
                        </div>
                        <span class="preference-label-badge city">도시</span>
                      </div>
                      <div class="preference-chart-item">
                        <div class="circular-progress-bar" style="--percent: 12%; --color: var(--rose)">
                          <div class="progress-inner">12%</div>
                        </div>
                        <span class="preference-label-badge culture">문화</span>
                      </div>
                    </div>

                    <div class="preference-keywords-row">
                      <span v-for="tag in profileTags" :key="tag" class="preference-keyword-pill">{{ tag }}</span>
                    </div>
                  </div>
                </article>
              </div>
            </section>

          </div>
        </div>
      </section>
    </main>

    <!-- Not found -->
    <main v-else>
      <section class="section" style="text-align: center; padding: 120px 24px;">
        <span class="material-symbols-rounded" style="font-size: 64px; color: var(--muted); opacity: 0.3;">person_off</span>
        <h2 style="margin-top: 16px; font-weight: 850;">사용자를 찾을 수 없습니다</h2>
        <p style="color: var(--muted); margin-top: 8px;">잘못된 사용자 ID이거나 존재하지 않는 프로필입니다.</p>
        <button class="btn primary" style="margin-top: 24px; border-radius: 999px;" @click="router.push('/community')">커뮤니티로 돌아가기</button>
      </section>
    </main>

    <!-- Modals -->
    <LikedPlacesModal v-if="likedPlacesModal.isOpen.value" :places="mockPlaces" @close="likedPlacesModal.close()" />
    <MyStoriesModal v-if="myStoriesModal.isOpen.value" :stories="mockCommunityStories" @close="myStoriesModal.close()" />
    <FollowListModal v-if="followersModal.isOpen.value" title="팔로워" :users="userFollowers" :followingIds="followingIds" @close="followersModal.close()" />
    <FollowListModal v-if="followingModal.isOpen.value" title="팔로잉" :users="userFollowing" :followingIds="followingIds" @close="followingModal.close()" />
  </AppShell>
</template>
