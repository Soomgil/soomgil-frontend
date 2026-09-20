<script setup lang="ts">
import { formatUiText } from '@/i18n/ui-localizer'
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import '@/styles/mypage.css'
import AppShell from '@/components/layout/AppShell.vue'
import { userApi } from '@/api/user.api'
import { communityApi } from '@/api/community.api'
import { communityPostToStory } from '@/utils/community'
import type { UserSummary } from '@/types/auth'
import type { Story } from '@/types/community'
import { useModal } from '@/composables/useModal'
import { useAuthStore } from '@/stores/auth.store'
import LikedPlacesModal from '@/components/mypage/LikedPlacesModal.vue'
import MyStoriesModal from '@/components/mypage/MyStoriesModal.vue'
import FollowListModal from '@/components/common/FollowListModal.vue'
import StoryDetailOverlay from '@/components/community/StoryDetailOverlay.vue'
import type { Place } from '@/types/place'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuthStore()

const userId = computed(() => route.params.userId as string)
const user = ref<any>(null)
const userLoading = ref(true)

const userStories = ref<Story[]>([])

const isPrivateProfile = computed(() => user.value?.profileVisibility === 'PRIVATE')
const isOwnProfile = computed(() => auth.user?.id === userId.value)
const canViewProfileDetails = computed(() =>
  !isPrivateProfile.value || isOwnProfile.value || user.value?.followedByMe === true || user.value?.followStatus === 'ACTIVE',
)
const followRequested = computed(() => user.value?.followStatus === 'PENDING')
const followButtonLabel = computed(() => {
  if (isFollowing.value) return '팔로잉'
  if (followRequested.value) return '요청됨'
  return isPrivateProfile.value ? '팔로우 요청' : '팔로우'
})

const likedPlaces = ref<Place[]>([])
const travelPreferences = computed(() => {
  const preferences = user.value?.preferences
  if (!preferences?.topCategories?.length) return null
  return {
    tags: preferences.preferredTags ?? [],
    styles: [...preferences.topCategories]
      .sort((a, b) => b.percentage - a.percentage)
      .map(category => ({ label: category.category, percent: category.percentage })),
    insight: preferences.travelStyle,
  }
})

// Follow state
const isFollowing = ref(false)
async function toggleFollow() {
  if (!user.value) return
  try {
    if (isFollowing.value || followRequested.value) {
      await userApi.unfollow(userId.value)
      isFollowing.value = false
      user.value.followedByMe = false
      user.value.followStatus = null
      if (typeof user.value.followerCount === 'number') user.value.followerCount--
    } else {
      await userApi.follow(userId.value)
      if (isPrivateProfile.value) {
        user.value.followStatus = 'PENDING'
        user.value.followedByMe = false
      } else {
        isFollowing.value = true
        user.value.followStatus = 'ACTIVE'
        user.value.followedByMe = true
        if (typeof user.value.followerCount === 'number') user.value.followerCount++
      }
    }
  } catch (err) {
    console.error('Failed to toggle follow status:', err)
  }
}

async function shareProfile() {
  if (!user.value) return
  const url = `${window.location.origin}/mypage/${userId.value}`
  try {
    await navigator.clipboard.writeText(url)
    toast.success('프로필 링크를 복사했습니다.')
  } catch {
    toast.error('프로필 링크를 복사하지 못했습니다.')
  }
}

// Stats
const profileStats = computed(() => [
  { icon: 'luggage', value: '0', label: '여행' },
  { icon: 'star', value: String(likedPlaces.value.length), label: '슈퍼라이크' },
  { icon: 'auto_stories', value: String(userStories.value.length), label: '스토리' },
  { icon: 'group', value: String(user.value?.followerCount ?? 0), label: '팔로워' },
  { icon: 'person_add', value: String(user.value?.followingCount ?? 0), label: '팔로잉' },
])

// Modals
const likedPlacesModal = useModal()
const myStoriesModal = useModal()
const followersModal = useModal()
const followingModal = useModal()

// Follow lists for this user
const userFollowers = ref<UserSummary[]>([])
const userFollowing = ref<UserSummary[]>([])
const followingIds = ref<Set<string>>(new Set())

async function loadUserProfile() {
  userLoading.value = true
  try {
    const fetched = await userApi.getUserProfile(userId.value)
    user.value = fetched
    isFollowing.value = fetched.followedByMe || fetched.followStatus === 'ACTIVE'

    if (!canViewProfileDetails.value) {
      likedPlaces.value = []
      userStories.value = []
      userFollowers.value = []
      userFollowing.value = []
      followingIds.value = new Set()
      return
    }

    likedPlaces.value = fetched.superLikedPlaces ?? []

    const postPage = await communityApi.getPosts({ page: 0, size: 100 })
    userStories.value = postPage.items
      .filter((post) => post.publishedBy?.id === userId.value)
      .map(communityPostToStory)

    try {
      const [followerList, followingList] = await Promise.all([
        userApi.getFollowers(userId.value),
        userApi.getFollowing(userId.value),
      ])
      userFollowers.value = followerList
      userFollowing.value = followingList
      followingIds.value = new Set(followingList.map(f => f.id))
    } catch (followErr) {
      console.error('Failed to load followers/following lists:', followErr)
      userFollowers.value = []
      userFollowing.value = []
      followingIds.value = new Set()
    }
  } catch (err) {
    console.error('Failed to load user profile:', err)
    user.value = null
    userStories.value = []
    likedPlaces.value = []
  } finally {
    userLoading.value = false
  }
}

onMounted(loadUserProfile)
watch(userId, loadUserProfile)

function onStatClick(label: string) {
  if (!canViewProfileDetails.value) return
  if (label === '팔로워') followersModal.open()
  else if (label === '팔로잉') followingModal.open()
  else if (label === '슈퍼라이크') {
    document.getElementById('section-liked-places-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else if (label === '스토리') {
    document.getElementById('section-my-stories-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function handleUserClick(userId: string) {
  followersModal.close()
  followingModal.close()
  router.push(`/mypage/${userId}`)
}

const selectedStoryId = ref<string | null>(null)
function openCommunityStory(storyId: string) { selectedStoryId.value = storyId }
</script>

<template>
  <AppShell paper>
    <main v-if="userLoading" style="display: flex; align-items: center; justify-content: center; min-height: 50vh;">
      <span class="material-symbols-rounded" style="font-size: 40px; color: var(--violet);">progress_activity</span>
    </main>
    <main v-else-if="user">
      <section class="section mypage-shell page-with-hero" aria-labelledby="user-profile-title">
        <div class="mypage-page-heading page-hero primary-page-hero account-page-hero">
          <div class="page-hero__copy">
            <p class="page-hero__eyebrow">Profile</p>
            <h1 id="user-profile-title" class="page-hero__title" data-no-translate>{{ user.displayName }}님의 여행 공간</h1>
            <p class="page-hero__lead">
              {{ canViewProfileDetails ? '공개된 여행기와 관심 장소를 통해 이 여행자의 취향과 여정을 확인할 수 있습니다.' : '비공개 프로필입니다. 팔로우가 승인되면 상세 콘텐츠를 볼 수 있습니다.' }}
            </p>
          </div>
          <div class="page-hero__actions">
            <button type="button" class="account-page-link user-profile-back" @click="router.back()">
              <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>돌아가기
            </button>
          </div>
        </div>

        <!-- 프로필 히어로 영역 -->
        <div class="mypage-hero" data-mypage-hero>
          <div class="mypage-hero__content">
            <div class="mypage-profile-card profile-header-card">
              <div class="profile-avatar-col">
                <div class="profile-avatar-wrap">
                  <span
                    class="mypage-hero__avatar profile-avatar-img"
                    :style="{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--violet)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '40px',
                      overflow: 'hidden'
                    }"
                  >
                    <img v-if="user.profileImageUrl" :src="user.profileImageUrl" alt="프로필 이미지" style="width: 100%; height: 100%; object-fit: cover;">
                    <span v-else>{{ user.displayName.charAt(0) }}</span>
                  </span>
                </div>
              </div>

              <div class="profile-info-col">
                <h2 data-no-translate class="profile-display-name">{{ user.displayName }}</h2>
                <span v-if="user.email" class="profile-handle">{{ user.email }}</span>
                <p data-no-translate v-if="user.bio" class="profile-bio">{{ user.bio }}</p>

                <div class="profile-stats-row">
                  <div
                    v-for="(stat, idx) in profileStats"
                    :key="stat.label"
                    class="profile-stat-item"
                    :class="{ 'has-divider': idx > 0 }"
                    style="cursor: pointer;"
                    @click="onStatClick(stat.label)"
                  >
                    <span class="profile-stat-value">{{ stat.value }}</span>
                    <span class="profile-stat-label">{{ stat.label }}</span>
                  </div>
                </div>

                <div class="profile-actions-row">
                  <button
                    type="button"
                    class="profile-pill-btn primary"
                    @click="toggleFollow"
                  >
                    <span class="material-symbols-rounded">{{ isFollowing ? 'person_remove' : followRequested ? 'hourglass_top' : 'person_add' }}</span>
                    {{ followButtonLabel }}
                  </button>
                  <button type="button" class="profile-pill-btn secondary" @click="shareProfile">
                    <span class="material-symbols-rounded">share</span>공유하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!canViewProfileDetails" class="mypage-glass-container">
          <div class="mypage-body-container">
            <section class="mypage-section private-profile-lock" aria-label="비공개 프로필 안내">
              <span class="material-symbols-rounded private-profile-lock__icon">lock</span>
              <h2>비공개 프로필입니다</h2>
              <p>
                {{ followRequested ? '팔로우 요청이 승인되면 여행기와 관심 장소를 볼 수 있습니다.' : '이 사용자의 상세 여행 기록은 승인된 팔로워에게만 공개됩니다.' }}
              </p>
              <button
                v-if="!followRequested && !isFollowing"
                type="button"
                class="profile-pill-btn primary"
                @click="toggleFollow"
              >
                <span class="material-symbols-rounded">person_add</span>
                팔로우 요청
              </button>
            </section>
          </div>
        </div>

        <div v-else class="mypage-glass-container">
          <div class="mypage-body-container">

              <!-- 1. 슈퍼라이크한 장소 섹션 -->
              <section class="mypage-section" aria-labelledby="section-liked-places-title">
                <div class="mypage-section-header">
                  <h2 id="section-liked-places-title" class="mypage-section-title">
                    <span class="material-symbols-rounded section-icon section-icon--sky" aria-hidden="true">star</span>슈퍼라이크한 장소
                  </h2>
                  <a v-if="likedPlaces.length > 0" href="#" class="mypage-more-link" @click.prevent="likedPlacesModal.open()">모두 보기 ›</a>
                </div>

                <div class="mypage-section-content liked-places-layout">
                  <!-- 빈 상태 -->
                  <div v-if="likedPlaces.length === 0" class="mypage-empty-state">
                    <span class="material-symbols-rounded mypage-empty-icon">star</span>
                    <p class="mypage-empty-title">공개된 슈퍼라이크 장소가 없어요</p>
                    <p class="mypage-empty-desc">이 사용자가 공개한 관심 장소가 준비되면 여기에 표시됩니다.</p>
                  </div>

                  <!-- 데이터 있을 때 보드 -->
                  <div v-else class="mypage-places-slider-wrapper keepsake-board">
                    <div class="mypage-places-slider">
                      <div v-for="place in likedPlaces.slice(0, 10)" :key="place.externalPlaceId" class="mypage-place-card mypage-place-card--slider keepsake-note">
                        <div class="place-img-wrap">
                          <img :src="(place.thumbnailUrl ?? '')" :alt="place.placeName" />
                          <span class="place-super-like-btn" aria-label="슈퍼라이크한 장소">
                            <span class="material-symbols-rounded">star</span>
                          </span>
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
                  </div>
                </div>
              </section>

              <section class="mypage-section profile-bottom-grid">
                <article class="profile-bottom-col">
                <div class="mypage-section-header">
                  <h2 id="section-my-stories-title" class="mypage-section-title">
                    <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">auto_stories</span>{{ formatUiText("{0}님의 여행기", "Stories by {0}", [user.displayName]) }}</h2>
                  <a v-if="userStories.length > 0" href="#" class="mypage-more-link" @click.prevent="myStoriesModal.open()">모두 보기 ›</a>
                </div>

                <!-- 빈 상태 -->
                <div v-if="userStories.length === 0" class="mypage-empty-state profile-empty-card">
                  <span class="material-symbols-rounded mypage-empty-icon">auto_stories</span>
                  <p class="mypage-empty-title">작성한 여행기가 없어요</p>
                  <p class="mypage-empty-desc">여행에서 만난 순간들을 기록으로 남겨보세요.</p>
                </div>

                <!-- 데이터 있을 때 -->
                <div v-else class="mypage-stories-magazine" data-mypage-stories-list>
                  <button v-for="story in userStories.slice(0, 2)" :key="story.id" type="button" class="mypage-story-magazine-item" @click="openCommunityStory(story.id)">
                    <span class="story-magazine-image-wrap">
                      <img class="story-magazine-thumb" :src="story.image" :alt="story.title" loading="lazy" />
                    </span>
                    <span class="story-magazine-body">
                      <span class="story-magazine-title" data-no-translate>{{ story.title }}</span>
                      <span v-if="story.tags.length" class="story-magazine-tags" data-no-translate>
                        <span v-for="tag in story.tags.slice(0, 3)" :key="tag">#{{ tag }}</span>
                      </span>
                      <span class="story-magazine-author">
                        <span class="story-magazine-avatar">
                          <img v-if="story.authorProfileImageUrl" :src="story.authorProfileImageUrl" :alt="`${story.author} 프로필 사진`" />
                          <span v-else>{{ story.avatar }}</span>
                        </span>
                        <span class="story-magazine-author-copy">
                          <strong data-no-translate>{{ story.author }}</strong>
                          <span data-no-translate>{{ story.location }}</span>
                        </span>
                      </span>
                      <span class="story-stats-row">
                        <span><span class="material-symbols-rounded">favorite</span>{{ story.likes }}</span>
                        <span><span class="material-symbols-rounded">chat_bubble</span>{{ story.comments }}</span>
                        <span v-if="story.publishedAt" class="story-published-at">{{ new Date(story.publishedAt).toLocaleDateString('ko-KR') }}</span>
                      </span>
                    </span>
                  </button>
                </div>
                </article>

                <article class="profile-bottom-col preference-panel">
                  <div class="mypage-section-header">
                    <h2 class="mypage-section-title">
                      <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">explore</span>여행 취향
                    </h2>
                  </div>
                  <p v-if="travelPreferences" class="preference-intro" data-no-translate>{{ travelPreferences.insight }}</p>
                  <div v-if="!travelPreferences" class="pref-empty mypage-empty-state profile-empty-card" role="status">
                    <span class="material-symbols-rounded pref-empty-icon">explore</span>
                    <p class="pref-empty-title">아직 분석된 취향이 없어요</p>
                    <p class="pref-empty-desc">공개된 취향 데이터가 준비되면 이곳에 표시됩니다.</p>
                  </div>
                  <template v-else>
                    <div class="pref-tag-list" data-no-translate>
                      <span v-for="tag in travelPreferences.tags" :key="tag" class="pref-tag-chip">#{{ tag }}</span>
                    </div>
                    <div class="pref-style-list">
                      <div v-for="(style, index) in travelPreferences.styles" :key="style.label" class="pref-style-bar" :style="{ '--taste-fill': ['#7eaa97', '#aaa0c8', '#d3ae85', '#8eafbd', '#c59eac'][index % 5], '--taste-ink': ['#426c59', '#70658e', '#896845', '#526f7c', '#855e6c'][index % 5] }" :class="{ 'is-first': index === 0, 'is-second': index === 1 }">
                        <div class="pref-style-header">
                          <span class="taste-rank" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                          <span class="pref-style-label" data-no-translate>{{ style.label }}</span>
                          <span class="pref-style-percent">{{ style.percent }}%</span>
                        </div>
                        <div class="pref-style-track">
                          <div class="pref-style-fill" :style="{ width: Math.max(0, Math.min(100, style.percent)) + '%' }"></div>
                        </div>
                      </div>
                    </div>
                  </template>
                </article>
              </section>

          </div>
        </div>
      </section>
    </main>

    <!-- Not found -->
    <main v-else-if="!userLoading">
      <section class="section" style="text-align: center; padding: 120px 24px;">
        <span class="material-symbols-rounded" style="font-size: 64px; color: var(--muted); opacity: 0.3;">person_off</span>
        <h2 style="margin-top: 16px; font-weight: 850;">사용자를 찾을 수 없습니다</h2>
        <p style="color: var(--muted); margin-top: 8px;">잘못된 사용자 ID이거나 존재하지 않는 프로필입니다.</p>
        <button class="btn primary" style="margin-top: 24px; border-radius: 999px;" @click="router.push('/community')">커뮤니티로 돌아가기</button>
      </section>
    </main>

    <!-- Modals -->
    <LikedPlacesModal v-if="likedPlacesModal.isOpen.value" :places="likedPlaces" @close="likedPlacesModal.close()" />
    <MyStoriesModal v-if="myStoriesModal.isOpen.value" :stories="userStories" @close="myStoriesModal.close()" @story-click="openCommunityStory" />
    <StoryDetailOverlay
      v-if="selectedStoryId"
      :stories="userStories"
      :initial-story-id="selectedStoryId"
      @close="selectedStoryId = null"
      @changed="loadUserProfile"
    />
    <FollowListModal v-if="followersModal.isOpen.value" title="팔로워" :users="userFollowers" :followingIds="followingIds" @close="followersModal.close()" @user-click="handleUserClick" />
    <FollowListModal v-if="followingModal.isOpen.value" title="팔로잉" :users="userFollowing" :followingIds="followingIds" @close="followingModal.close()" @user-click="handleUserClick" />
  </AppShell>
</template>

<style scoped>
.profile-header-card {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 40px !important;
  padding: 36px 40px !important;
}

.profile-avatar-col {
  flex: 0 0 28%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-avatar-wrap {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  padding: 4px;
  background: linear-gradient(135deg, rgba(0, 102, 255, 0.18), rgba(0, 209, 255, 0.18));
  box-sizing: border-box;
}

.profile-avatar-wrap .profile-avatar-img {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 50% !important;
  border: 4px solid #fff;
  box-sizing: border-box;
  box-shadow: 0 8px 24px rgba(0, 102, 255, 0.12);
}

.profile-info-col {
  flex: 1 1 72%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.profile-display-name {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 900;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.profile-handle {
  font-size: 0.875rem;
  color: var(--muted);
  font-weight: 600;
}

.profile-bio {
  margin: 4px 0 8px;
  font-size: 0.95rem;
  color: var(--ink);
  opacity: 0.78;
  line-height: 1.6;
  font-weight: 500;
  max-width: 100%;
}

.profile-stats-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  margin: 8px 0 16px;
}

.profile-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0 22px;
  text-align: center;
  min-width: 78px;
}

.profile-stat-item:first-child {
  padding-left: 0;
}

.profile-stat-item.has-divider {
  border-left: 1px solid var(--line);
}

.profile-stat-value {
  font-size: 1.5rem;
  font-weight: 950;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.profile-stat-label {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 600;
}

.profile-actions-row {
  display: flex;
  gap: 10px;
}

.profile-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  padding: 0 22px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
  border: none;
}

.profile-pill-btn .material-symbols-rounded {
  font-size: 18px;
}

.profile-pill-btn.primary {
  background: var(--ink);
  color: #fff;
  box-shadow: 0 6px 16px rgba(26, 32, 51, 0.18);
}

.profile-pill-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(26, 32, 51, 0.26);
}

.profile-pill-btn.secondary {
  background: #fff;
  color: var(--ink);
  border: 1.5px solid var(--line);
}

.profile-pill-btn.secondary:hover {
  background: var(--surface-2);
  border-color: var(--violet);
  color: var(--violet);
}

.profile-bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: stretch;
}

.profile-bottom-col {
  background: #fff;
  border-radius: 22px;
  padding: 28px;
  box-shadow: var(--soft-shadow);
  display: flex;
  flex-direction: column;
}

.profile-bottom-col .mypage-section-header {
  margin-bottom: 20px;
}

.preference-intro {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 16px;
  font-weight: 600;
}

.pref-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  padding: 32px 16px;
}

.pref-empty-icon {
  font-size: 44px;
  color: var(--violet);
  opacity: 0.6;
  margin-bottom: 4px;
}

.pref-empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--ink);
}

.pref-empty-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.private-profile-lock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  text-align: center;
  padding: 56px 28px;
}

.private-profile-lock__icon {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin-bottom: 18px;
  border-radius: 50%;
  background: rgba(123, 104, 238, 0.1);
  color: var(--violet);
  font-size: 34px;
}

.private-profile-lock h2 {
  margin: 0 0 10px;
  color: var(--ink);
  font-size: 22px;
  font-weight: 900;
}

.private-profile-lock p {
  max-width: 420px;
  margin: 0 0 22px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.7;
}

@media (max-width: 1024px) {
  .profile-header-card {
    gap: 28px !important;
    padding: 28px !important;
  }

  .profile-avatar-col {
    flex-basis: 32%;
  }
}

@media (max-width: 768px) {
  .profile-bottom-grid {
    grid-template-columns: 1fr;
  }

  .profile-header-card {
    flex-direction: column !important;
    align-items: center !important;
    text-align: center;
    gap: 20px !important;
    padding: 28px 20px !important;
  }

  .profile-avatar-col {
    flex-basis: auto;
  }

  .profile-info-col {
    align-items: center;
  }

  .profile-stats-row {
    justify-content: center;
  }
}

@media (max-width: 640px) {
  .profile-avatar-wrap {
    width: 128px;
    height: 128px;
  }

  .profile-stats-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    row-gap: 16px;
  }

  .profile-stat-item {
    padding: 0 12px;
  }

  .profile-stat-item.has-divider {
    border-left: none;
  }

  .profile-actions-row {
    width: 100%;
    flex-direction: column;
  }

  .profile-pill-btn {
    width: 100%;
    justify-content: center;
  }
}

/* 빈 상태 박스 — 데이터 없는 섹션 공통 사용 */
.mypage-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 24px;
  border-radius: 18px;
  background: rgba(0, 102, 255, 0.02);
  border: 1px dashed var(--line);
}
.mypage-empty-state--inline {
  padding: 36px 20px;
  height: 100%;
  box-sizing: border-box;
}
.mypage-empty-icon {
  font-size: 48px;
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 14px;
}
.mypage-empty-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--ink);
  margin: 0 0 6px;
}
.mypage-empty-desc {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 18px;
  line-height: 1.5;
}
.mypage-empty-cta {
  padding: 10px 22px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 6px 18px rgba(0, 102, 255, 0.2);
}
.mypage-empty-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(0, 102, 255, 0.28);
}

/* Places slider */
.mypage-places-slider-wrapper {
  position: relative;
}
.mypage-places-slider {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding: 16px;
  margin: -16px;
  scrollbar-width: none;
}
.mypage-places-slider::-webkit-scrollbar {
  display: none;
}
.mypage-place-card--slider {
  flex: 0 0 calc((100% - 36px) / 3);
  min-width: calc((100% - 36px) / 3);
  max-width: calc((100% - 36px) / 3);
  scroll-snap-align: start;
}
.places-slider-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  box-shadow: var(--soft-shadow);
  transition: transform 0.2s, box-shadow 0.2s;
}
.places-slider-btn:hover {
  transform: translateY(-50%) scale(1.05);
  box-shadow: var(--shadow);
}
.places-slider-btn.prev { left: 0; }
.places-slider-btn.next { right: 0; }
.places-slider-btn .material-symbols-rounded { font-size: 20px; }
@media (max-width: 1024px) {
  .places-slider-btn.prev { left: 4px; }
  .places-slider-btn.next { right: 4px; }
  .mypage-place-card--slider {
    flex: 0 0 calc((100% - 18px) / 2);
    min-width: calc((100% - 18px) / 2);
    max-width: calc((100% - 18px) / 2);
  }
}
@media (max-width: 768px) {
  .mypage-place-card--slider {
    flex: 0 0 85%;
    min-width: 85%;
    max-width: 85%;
  }
}
@media (max-width: 480px) {
  .mypage-place-card--slider {
    flex: 0 0 92%;
    min-width: 92%;
    max-width: 92%;
  }
}
</style>

<style scoped src="@/styles/account-theme.css"></style>

<style scoped>
.user-profile-back { cursor: pointer; font-family: inherit; }
.keepsake-board { padding:22px; border:3px solid #d9c2a8; border-radius:22px; background-color:#ead8bd; background-image:radial-gradient(circle at 18% 24%,#fff7e985 0 1px,transparent 1.7px),radial-gradient(circle at 72% 64%,#b8916c24 0 1px,transparent 1.9px),radial-gradient(circle at 42% 78%,#fffaf08f 0 1.3px,transparent 2px),linear-gradient(115deg,#f1e2ca 0%,#e8d2b3 48%,#eedcc2 100%); background-size:15px 17px,19px 21px,25px 23px,100% 100%; box-shadow:inset 0 0 0 1px #fff9ed8c,inset 0 0 20px #9b795117,0 7px 20px #52667a12; }
.keepsake-board .mypage-places-slider { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:24px 16px; overflow:visible; padding:12px 2px 8px; margin:0; }
.keepsake-board .keepsake-note { --note-paper:#fff1b8; position:relative; overflow:visible; min-width:0; max-width:none; width:100%; padding:9px 8px 11px; border:0; border-radius:2px 2px 12px 2px; background:linear-gradient(145deg,#ffffff66,transparent 38%),var(--note-paper); box-shadow:2px 5px 11px #35465a1f; transform:rotate(-1.5deg); }
.keepsake-note::before { content:''; position:absolute; z-index:3; width:14px; height:14px; top:-7px; left:calc(50% - 7px); border:1px solid #b46f68; border-radius:50%; background:radial-gradient(circle at 32% 25%,#fff0e9 0 12%,#dc8d82 28%,#bd6b66 72%,#a45a58 100%); box-shadow:0 2px 4px #77544b4a,inset -1px -1px 2px #8e4c4c52; pointer-events:none; }
.keepsake-note::after { content:''; position:absolute; z-index:-1; width:18px; height:8px; top:1px; left:calc(50% - 2px); border-radius:50%; background:#77544b26; filter:blur(2px); transform:rotate(24deg); pointer-events:none; }
.keepsake-board .keepsake-note:nth-child(6n+2) { --note-paper:#cfe8f6; transform:rotate(1.5deg); }
.keepsake-board .keepsake-note:nth-child(6n+3) { --note-paper:#d5e9d7; transform:rotate(-.8deg); }
.keepsake-board .keepsake-note:nth-child(6n+4) { --note-paper:#f6d8c6; transform:rotate(1deg); }
.keepsake-board .keepsake-note:nth-child(6n+5) { --note-paper:#ded9f0; transform:rotate(-1.2deg); }
.keepsake-board .keepsake-note:nth-child(6n) { --note-paper:#eecfd4; transform:rotate(.7deg); }
.keepsake-board .keepsake-note .place-img-wrap { height:auto; aspect-ratio:4/3; border-radius:2px; overflow:hidden; }
.keepsake-board .keepsake-note .place-info-wrap { padding:9px 2px 0; background:transparent; }
.keepsake-board .keepsake-note .place-title-h3 { font-family:'Noto Serif KR',serif; font-size:13px; line-height:1.45; margin:0 0 3px; }
.keepsake-board .keepsake-note .place-region-category { display:block; font-size:10px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; color:#647c92; }
.keepsake-board .keepsake-note .place-desc-text,.keepsake-board .keepsake-note .place-tag-row { display:none; }
.keepsake-board .keepsake-note .place-super-like-btn { width:27px; height:27px; top:5px; right:5px; pointer-events:none; }
@media(max-width:1100px) { .keepsake-board .mypage-places-slider { grid-template-columns:repeat(4,minmax(0,1fr)); } }
@media(max-width:820px) { .keepsake-board .mypage-places-slider { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media(max-width:600px) { .keepsake-board { padding:18px 14px; }.keepsake-board .mypage-places-slider { grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px 12px; } }
</style>
