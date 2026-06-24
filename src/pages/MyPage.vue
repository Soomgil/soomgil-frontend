<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import '@/styles/mypage.css'
import AppShell from '@/components/layout/AppShell.vue'
import { useModal } from '@/composables/useModal'
import { useAuthStore } from '@/stores/auth.store'
import { userApi } from '@/api/user.api'
import { mediaApi } from '@/api/media.api'
import { communityApi } from '@/api/community.api'
import { tripApi } from '@/api/trip.api'
import { swipeApi } from '@/api/swipe.api'
import { useToast } from '@/composables/useToast'
import { communityPostToStory } from '@/utils/community'
import type { UpdateMeRequest, UserSummary } from '@/types/auth'
import type { Place } from '@/types/place'
import type { Story } from '@/types/community'
import LikedPlacesModal from '@/components/mypage/LikedPlacesModal.vue'
import MyStoriesModal from '@/components/mypage/MyStoriesModal.vue'
import StoryDetailOverlay from '@/components/community/StoryDetailOverlay.vue'
import FollowListModal from '@/components/common/FollowListModal.vue'

const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

// store.user가 있으면 우선
const displayUser = computed(() => auth.user ?? {} as any)
const displayName = computed(() => displayUser.value.displayName || '사용자')
const displayEmail = computed(() => displayUser.value.email || '')
// bio가 없으면 빈 문자열 (빈 경우 템플릿에서 v-if로 숨김)
const displayBio = computed(() => displayUser.value.bio ?? '')

// 데이터 로딩 상태
const isLoading = ref(true)
const myTripCount = ref(0)

async function loadMyTripCount() {
  try {
    const res = await tripApi.getTrips({ page: 0, size: 1 })
    myTripCount.value = res.page.totalElements ?? res.items.length
  } catch {
    myTripCount.value = 0
  }
}

// onMounted에서 최신 /me로 동기화 (토큰 있을 때만)
onMounted(async () => {
  if (!auth.isAuthenticated) {
    router.replace('/login')
    return
  }
  try {
    await auth.fetchUser()
    await Promise.allSettled([loadFollowData(), loadMyStories(), loadLikedPlaces(), loadMyTripCount(), loadPreferences()])
  } catch {
    // fetch 실패해도 페이지는 노출
  } finally {
    isLoading.value = false
  }
})

// 좋아요한 장소
const likedPlacesSource = ref<Place[]>([])
const failedPlaceImages = ref(new Set<string>())
const removingPlaceKeys = ref(new Set<string>())

function placeKey(place: Place) {
  return `${place.provider}:${place.externalPlaceId}`
}

function markPlaceImageFailed(place: Place) {
  failedPlaceImages.value = new Set(failedPlaceImages.value).add(placeKey(place))
}

async function removeLikedPlace(place: Place) {
  const key = placeKey(place)
  if (removingPlaceKeys.value.has(key)) return
  removingPlaceKeys.value = new Set(removingPlaceKeys.value).add(key)
  try {
    await swipeApi.unsavePlace(place.provider, place.externalPlaceId)
    likedPlacesSource.value = likedPlacesSource.value.filter((item) => placeKey(item) !== key)
    toast.success('좋아요한 장소에서 제거했습니다.')
  } catch {
    toast.error('좋아요를 취소하지 못했습니다.')
  } finally {
    const next = new Set(removingPlaceKeys.value)
    next.delete(key)
    removingPlaceKeys.value = next
  }
}

async function loadLikedPlaces() {
  if (!auth.user?.id) return
  try {
    likedPlacesSource.value = await userApi.getSavedPlaces()
  } catch (err) {
    console.error('Failed to load liked places', err)
  }
}

const likedPlaces = computed(() => likedPlacesSource.value)

const myStories = ref<Story[]>([])

async function loadMyStories() {
  if (!auth.user?.id) return
  try {
    const response = await communityApi.getPosts({ page: 0, size: 100, authorId: auth.user.id })
    myStories.value = response.items.map(communityPostToStory)
  } catch (err) {
    console.error('Failed to load my stories', err)
  }
}

const selectedStoryId = ref<string | null>(null)
function openCommunityStory(storyId: string) {
  myStoriesModal.close()
  selectedStoryId.value = storyId
}

// Places slider
const placesSliderRef = ref<HTMLElement | null>(null)
function scrollPlaces(direction: 'prev' | 'next') {
  if (!placesSliderRef.value) return
  const slider = placesSliderRef.value
  const card = slider.querySelector('.mypage-place-card--slider') as HTMLElement | null
  if (!card) return
  const cardWidth = card.offsetWidth + 18 // card width + gap
  slider.scrollBy({
    left: direction === 'next' ? cardWidth : -cardWidth,
    behavior: 'smooth',
  })
}

// Modals
const likedPlacesModal = useModal()
const myStoriesModal = useModal()
const followersModal = useModal()
const followingModal = useModal()

const followers = ref<UserSummary[]>([])
const following = ref<UserSummary[]>([])
const followingIds = ref<Set<string>>(new Set())

async function loadFollowData() {
  if (!auth.user?.id) return
  try {
    const [followerList, followingList] = await Promise.all([
      userApi.getFollowers(auth.user.id),
      userApi.getFollowing(auth.user.id),
    ])
    followers.value = followerList
    following.value = followingList
    followingIds.value = new Set(followingList.map(f => f.id))
  } catch (err) {
    console.error('Failed to load follow lists:', err)
  }
}

async function toggleFollow(userId: string) {
  try {
    if (followingIds.value.has(userId)) {
      await userApi.unfollow(userId)
      followingIds.value.delete(userId)
    } else {
      await userApi.follow(userId)
      followingIds.value.add(userId)
    }
    await loadFollowData()
  } catch (err) {
    console.error('Failed to toggle follow status:', err)
  }
}
const profileEditModal = useModal()
// 알림 토글은 제거 — DB user_settings에는 marketing_email_opt_in / trip_invite_email_opt_in 만 있고
// 푸시 알림 컬럼은 아예 없음. 실제 알림 설정은 SettingsPage에서 /me/settings 로 관리.
const profileForm = ref({
  displayName: '',
  intro: '',
  visibility: 'public' as 'public' | 'followers',
})

// 사진 변경 — signed URL로 storage에 직접 업로드한 뒤 media metadata를 등록한다.
const photoInput = ref<HTMLInputElement | null>(null)
const photoNotice = ref<string | null>(null)
const pendingProfilePhoto = ref<File | null>(null)
const pendingProfilePhotoUrl = ref<string | null>(null)
function triggerPhotoPicker() {
  photoNotice.value = null
  photoInput.value?.click()
}
async function onPhotoSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    photoNotice.value = '이미지 파일만 선택할 수 있습니다.'
    input.value = ''
    return
  }
  if (pendingProfilePhotoUrl.value) URL.revokeObjectURL(pendingProfilePhotoUrl.value)
  pendingProfilePhoto.value = file
  pendingProfilePhotoUrl.value = URL.createObjectURL(file)
  photoNotice.value = '저장 버튼을 누르면 사진이 변경됩니다.'
  input.value = ''
}

function syncProfileForm() {
  profileForm.value.displayName = displayUser.value.displayName
  profileForm.value.intro = displayBio.value
  profileForm.value.visibility = displayUser.value.profileVisibility === 'PRIVATE' ? 'followers' : 'public'
}

// 모달이 열릴 때만 폼 초기값 동기화.
// watchEffect를 쓰면 fetchUser() 지연 해결 시 사용자가 입력한 값을 덮어쓴다.
function openProfileEdit() {
  if (pendingProfilePhotoUrl.value) URL.revokeObjectURL(pendingProfilePhotoUrl.value)
  pendingProfilePhoto.value = null
  pendingProfilePhotoUrl.value = null
  syncProfileForm()
  profileError.value = null
  profileEditModal.open()
}

function closeProfileEdit() {
  if (pendingProfilePhotoUrl.value) URL.revokeObjectURL(pendingProfilePhotoUrl.value)
  pendingProfilePhoto.value = null
  pendingProfilePhotoUrl.value = null
  photoNotice.value = null
  profileEditModal.close()
}

const profileSaving = ref(false)
const profileError = ref<string | null>(null)

async function saveProfile() {
  profileSaving.value = true
  profileError.value = null
  try {
    const payload: UpdateMeRequest = {
      displayName: profileForm.value.displayName,
      bio: profileForm.value.intro,
      profileVisibility: profileForm.value.visibility === 'followers' ? 'PRIVATE' : 'PUBLIC',
    }
    if (pendingProfilePhoto.value) {
      const mediaFile = await mediaApi.uploadFile(pendingProfilePhoto.value, 'PROFILE_IMAGE')
      payload.profileMediaFileId = mediaFile.id
    }
    await userApi.updateMe(payload)
    await auth.fetchUser()
    if (pendingProfilePhotoUrl.value) URL.revokeObjectURL(pendingProfilePhotoUrl.value)
    pendingProfilePhoto.value = null
    pendingProfilePhotoUrl.value = null
    profileEditModal.close()
  } catch (e: unknown) {
    // 인터셉터가 콘솔엔 찍어주지만 사용자에게도 피드백 필요
    const status = (e as { response?: { status?: number } })?.response?.status
    profileError.value =
      status === 401
        ? '로그인이 만료되었습니다. 다시 로그인해주세요.'
        : status === 400
          ? '입력값이 올바르지 않습니다.'
          : '저장에 실패했습니다. 잠시 후 다시 시도해주세요.'
    console.error('[saveProfile] failed:', e)
  } finally {
    profileSaving.value = false
  }
}

const shareNotice = ref('')
async function shareProfile() {
  const url = `${window.location.origin}/mypage/${auth.user?.id ?? ''}`
  try {
    if (navigator.share) await navigator.share({ title: `${displayName.value}님의 숨길 프로필`, url })
    else {
      await navigator.clipboard.writeText(url)
      shareNotice.value = '프로필 링크를 복사했습니다.'
      window.setTimeout(() => { shareNotice.value = '' }, 2500)
    }
  } catch (error) {
    if ((error as DOMException)?.name !== 'AbortError') shareNotice.value = '공유 링크를 만들지 못했습니다.'
  }
}

// Stats for profile card
const profileStats = computed(() => [
  { icon: 'luggage', value: String(myTripCount.value), label: '내 여행' },
  { icon: 'favorite', value: String(likedPlacesSource.value.length), label: '좋아요' },
  { icon: 'auto_stories', value: String(myStories.value.length), label: '여행기' },
  { icon: 'group', value: String(followers.value.length), label: '팔로워' },
  { icon: 'person_add', value: String(following.value.length), label: '팔로잉' },
])

function onStatClick(label: string) {
  if (label === '팔로워') followersModal.open()
  else if (label === '팔로잉') followingModal.open()
  else if (label === '좋아요') {
    document.getElementById('section-liked-places-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else if (label === '여행기') {
    document.getElementById('section-my-stories-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else if (label === '내 여행') {
    router.push('/my-trips')
  }
}

// 여행 취향 — 실제 preference 도메인 데이터만 표시한다.
const GROUP_COLORS: Record<string, string> = {
  nature_scene: '#10b981',
  history_culture: '#7c3aed',
  activity: '#0066ff',
  mood: '#ec4899',
  space_context: '#f59e0b',
}
const DEFAULT_COLOR = '#6b7280'

type PreferenceStatus = 'loading' | 'ready' | 'pending'

const preferenceStatus = ref<PreferenceStatus>('pending')
const travelPreferences = ref<{
  tags: string[]
  styles: { label: string; percent: number; color: string }[]
  insight: string
}>({
  tags: [],
  styles: [],
  insight: '',
})

async function loadPreferences() {
  preferenceStatus.value = 'loading'
  try {
    const data = await userApi.getPreferences()
    if (data.topCategories.length === 0) {
      travelPreferences.value = { tags: [], styles: [], insight: '' }
      preferenceStatus.value = 'pending'
      return
    }
    travelPreferences.value = {
      tags: data.preferredTags,
      styles: data.topCategories.map((c) => ({
        label: c.category,
        percent: c.percentage,
        color: GROUP_COLORS[c.groupCode] ?? DEFAULT_COLOR,
      })),
      insight: data.travelStyle,
    }
    preferenceStatus.value = 'ready'
  } catch (err) {
    console.error('Failed to load preferences', err)
    travelPreferences.value = { tags: [], styles: [], insight: '' }
    preferenceStatus.value = 'pending'
  }
}

function handleUserClick(userId: string) {
  followersModal.close()
  followingModal.close()
  router.push(`/mypage/${userId}`)
}
</script>

<template>
  <AppShell>
    <main>
      <section class="section mypage-shell" aria-labelledby="mypage-title">
        <div class="mypage-page-heading">
          <p class="eyebrow"><span class="material-symbols-rounded" aria-hidden="true">person</span> My Page</p>
          <h1 id="mypage-title"><span class="gradient-text">나의 여행 프로필</span></h1>
        </div>

        <!-- 프로필 히어로 영역 -->
        <div class="mypage-hero" data-mypage-hero>
          <div class="mypage-hero__content">
            <div class="mypage-profile-card profile-header-card">
              <!-- 좌측: 큰 원형 프로필 이미지 -->
              <div class="profile-avatar-col">
                <div class="profile-avatar-wrap" style="cursor: pointer;" @click="openProfileEdit">
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
                    <img v-if="displayUser.profileImageUrl" :src="displayUser.profileImageUrl" alt="프로필 이미지" style="width: 100%; height: 100%; object-fit: cover;">
                    <span v-else>{{ displayName.charAt(0) }}</span>
                  </span>
                </div>
              </div>

              <!-- 우측: 이름/핸들/소개/통계/버튼 세로 스택 -->
              <div class="profile-info-col">
                <h2 class="profile-display-name">{{ displayName }}</h2>
                <span class="profile-handle">{{ displayEmail }}</span>
                <p v-if="displayBio" class="profile-bio">{{ displayBio }}</p>

                <!-- 통계 행: 5개 가로 (박스 없음) -->
                <div class="profile-stats-row">
                  <div v-if="isLoading" class="profile-stat-item" style="color: var(--muted); opacity: 0.5;">
                    <span class="profile-stat-value"><span class="material-symbols-rounded" style="animation: spin 1s linear infinite; font-size: 22px;">sync</span></span>
                    <span class="profile-stat-label">불러오는 중...</span>
                  </div>
                  <template v-else>
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
                  </template>
                </div>

                <!-- 버튼 행: 2개 pill -->
                <div class="profile-actions-row">
                  <button type="button" class="profile-pill-btn primary" @click="openProfileEdit">
                    <span class="material-symbols-rounded">edit</span>프로필 수정
                  </button>
                  <button type="button" class="profile-pill-btn secondary" @click="shareProfile">
                    <span class="material-symbols-rounded">share</span>공유하기
                  </button>
                </div>
                <p v-if="shareNotice" class="mypage-share-notice" role="status">{{ shareNotice }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mypage-glass-container">
          <!-- 개인 아카이브 콘텐츠 영역 -->
          <div class="mypage-body-container">

        <!-- 1. 좋아요한 장소 섹션 -->
        <section class="mypage-section" aria-labelledby="section-liked-places-title">
          <div class="mypage-section-header">
            <h2 id="section-liked-places-title" class="mypage-section-title">
              <span class="material-symbols-rounded section-icon section-icon--rose" aria-hidden="true">favorite</span>좋아요한 장소
            </h2>
            <a v-if="likedPlaces.length > 0" href="#" class="mypage-more-link" @click.prevent="likedPlacesModal.open()">모두 보기 ›</a>
          </div>

          <div class="mypage-section-content liked-places-layout">
            <!-- 빈 상태 -->
            <div v-if="likedPlaces.length === 0" class="mypage-empty-state">
              <span class="material-symbols-rounded mypage-empty-icon">favorite_border</span>
              <p class="mypage-empty-title">아직 좋아요한 장소가 없어요</p>
              <p class="mypage-empty-desc">마음에 드는 장소에 좋아요를 눌러 모아보세요.</p>
              <button type="button" class="mypage-empty-cta" @click="router.push('/search')">장소 둘러보기</button>
            </div>

            <!-- 데이터 있을 때 슬라이더 -->
            <div v-else class="mypage-places-slider-wrapper">
              <button v-if="likedPlaces.length > 3" type="button" class="places-slider-btn prev" aria-label="이전 장소" @click="scrollPlaces('prev')">
                <span class="material-symbols-rounded">chevron_left</span>
              </button>
              <div class="mypage-places-slider" ref="placesSliderRef">
                <div v-for="place in likedPlaces" :key="place.externalPlaceId" class="mypage-place-card mypage-place-card--slider">
                  <div class="place-img-wrap">
                    <img v-if="place.thumbnailUrl && !failedPlaceImages.has(placeKey(place))" :src="place.thumbnailUrl" :alt="place.placeName" @error="markPlaceImageFailed(place)" />
                    <span v-else class="place-image-placeholder" aria-hidden="true"><span class="material-symbols-rounded">landscape</span></span>
                    <button type="button" class="place-heart-btn" aria-label="좋아요 취소" :disabled="removingPlaceKeys.has(placeKey(place))" @click="removeLikedPlace(place)">
                      <span class="material-symbols-rounded">favorite</span>
                    </button>
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
              <button v-if="likedPlaces.length > 3" type="button" class="places-slider-btn next" aria-label="다음 장소" @click="scrollPlaces('next')">
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </div>
          </div>
        </section>

        <!-- 2. 통합 하단 섹션: 내 여행기 + 여행 취향 (2컬럼) -->
        <section class="mypage-section profile-bottom-grid">
          <!-- 좌측: 내 여행기 -->
          <article class="profile-bottom-col">
            <div class="mypage-section-header">
              <h2 id="section-my-stories-title" class="mypage-section-title">
                <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">auto_stories</span>내 여행기
              </h2>
              <a v-if="myStories.length > 0" href="#" class="mypage-more-link" @click.prevent="myStoriesModal.open()">모두 보기 ›</a>
            </div>

            <!-- 빈 상태 -->
            <div v-if="myStories.length === 0" class="mypage-empty-state">
              <span class="material-symbols-rounded mypage-empty-icon">auto_stories</span>
              <p class="mypage-empty-title">작성한 여행기가 없어요</p>
              <p class="mypage-empty-desc">여행에서 만난 순간들을 기록으로 남겨보세요.</p>
              <button type="button" class="mypage-empty-cta" @click="router.push('/community/story-write')">여행기 쓰기</button>
            </div>

            <!-- 데이터 있을 때 -->
            <div v-else class="mypage-stories-magazine" data-mypage-stories-list>
              <div v-for="story in myStories" :key="story.id" class="mypage-story-magazine-item" @click="openCommunityStory(story.id)">
                <img class="story-magazine-thumb" :src="story.image" :alt="story.title" />
                <div class="story-magazine-body">
                  <h3 class="story-magazine-title">
                    <span>{{ story.title }}</span>
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
          </article>

          <!-- 우측: 여행 취향 -->
          <article class="profile-bottom-col preference-panel">
            <div class="mypage-section-header">
              <h2 class="mypage-section-title">
                <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">explore</span>여행 취향
              </h2>
            </div>
            <p class="preference-intro">데이터 기반 나의 여행 스타일</p>

            <div v-if="preferenceStatus !== 'ready'" class="pref-empty" role="status">
              <span class="material-symbols-rounded pref-empty-icon">hourglass_top</span>
              <p class="pref-empty-title">분석 결과를 기다리고 있어요</p>
              <p class="pref-empty-desc">
                {{ preferenceStatus === 'loading' ? '여행 취향을 불러오는 중입니다.' : '분석이 완료되면 나만의 여행 스타일이 표시됩니다.' }}
              </p>
            </div>

            <template v-else>
            <!-- 태그 칩 -->
            <div class="pref-tag-list">
              <span v-for="tag in travelPreferences.tags" :key="tag" class="pref-tag-chip">#{{ tag }}</span>
            </div>

            <!-- 선호 스타일 progress bar -->
            <div class="pref-style-list">
              <div v-for="style in travelPreferences.styles" :key="style.label" class="pref-style-bar">
                <div class="pref-style-header">
                  <span class="pref-style-label">{{ style.label }}</span>
                  <span class="pref-style-percent">{{ style.percent }}%</span>
                </div>
                <div class="pref-style-track">
                  <div class="pref-style-fill" :style="{ width: style.percent + '%', background: style.color }"></div>
                </div>
              </div>
            </div>

            <!-- 인사이트 박스 -->
            <div class="pref-insight-box">
              <span class="material-symbols-rounded pref-insight-icon">lightbulb</span>
              <p class="pref-insight-text">{{ travelPreferences.insight }}</p>
            </div>
            </template>
          </article>
        </section>

          </div>
        </div>
      </section>
    </main>

    <!-- Modals -->
    <LikedPlacesModal v-if="likedPlacesModal.isOpen.value" :places="likedPlacesSource" @remove="removeLikedPlace" @close="likedPlacesModal.close()" />
    <MyStoriesModal v-if="myStoriesModal.isOpen.value" :stories="myStories" @close="myStoriesModal.close()" @story-click="openCommunityStory" />
    <StoryDetailOverlay
      v-if="selectedStoryId"
      :stories="myStories"
      :initial-story-id="selectedStoryId"
      @close="selectedStoryId = null"
      @changed="loadMyStories"
    />
    <FollowListModal v-if="followersModal.isOpen.value" title="팔로워" :users="followers" :followingIds="followingIds" @close="followersModal.close()" @toggle-follow="toggleFollow" @user-click="handleUserClick" />
    <FollowListModal v-if="followingModal.isOpen.value" title="팔로잉" :users="following" :followingIds="followingIds" @close="followingModal.close()" @toggle-follow="toggleFollow" @user-click="handleUserClick" />

    <!-- 프로필 수정 모달 -->
    <div v-if="profileEditModal.isOpen.value" class="story-overlay" role="dialog" aria-modal="true" aria-label="프로필 수정">
      <div class="story-overlay-backdrop" @click="closeProfileEdit"></div>
      <div class="story-overlay-panel" style="width: min(96vw, 580px); max-height: 92vh;">
        <button class="story-overlay-close" type="button" aria-label="닫기" @click="closeProfileEdit">
          <span class="material-symbols-rounded">close</span>
        </button>
        <div style="padding: 40px 32px; overflow-y: auto; max-height: calc(92vh - 20px);">
          <h2 style="font-size: 22px; font-weight: 850; color: var(--ink); margin: 0 0 28px; display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-rounded" style="font-size: 26px; color: var(--violet);">person_edit</span>프로필 수정
          </h2>

          <!-- 아바타 변경 -->
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 28px;">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: var(--violet); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; font-weight: 800; flex-shrink: 0; overflow: hidden;">
              <img v-if="pendingProfilePhotoUrl || displayUser.profileImageUrl" :src="pendingProfilePhotoUrl || displayUser.profileImageUrl" alt="프로필 이미지 미리보기" style="width: 100%; height: 100%; object-fit: cover;">
              <span v-else>{{ displayName.charAt(0) }}</span>
            </div>
            <div>
              <button type="button" style="padding: 8px 16px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 13px; font-weight: 700; cursor: pointer; color: var(--ink); transition: all 0.2s;" @click="triggerPhotoPicker">
                <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">photo_camera</span>사진 변경
              </button>
              <input ref="photoInput" type="file" accept="image/*" style="display: none;" @change="onPhotoSelected" />
              <p v-if="photoNotice" style="margin: 8px 0 0; font-size: 12px; color: var(--muted); font-weight: 600;">{{ photoNotice }}</p>
            </div>
          </div>

          <!-- 이름 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">이름</label>
            <input v-model="profileForm.displayName" type="text" style="width: 100%; height: 44px; border: 1px solid var(--line); border-radius: 14px; padding: 0 16px; font-size: 14px; outline: none; transition: border-color 0.2s; box-sizing: border-box;" onfocus="this.style.borderColor='var(--violet)'" onblur="this.style.borderColor='var(--line)'" />
          </div>

          <!-- 소개 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">소개</label>
            <textarea v-model="profileForm.intro" rows="3" style="width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px; font-size: 14px; outline: none; resize: vertical; transition: border-color 0.2s; font-family: inherit; line-height: 1.6; box-sizing: border-box;" onfocus="this.style.borderColor='var(--violet)'" onblur="this.style.borderColor='var(--line)'"></textarea>
          </div>

          <!-- 게시글 공개 범위 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 10px;">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">visibility</span>게시글 공개 범위
            </label>
            <div style="display: flex; gap: 10px;">
              <label style="flex: 1; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 2px solid; cursor: pointer; transition: all 0.2s;"
                :style="{
                  borderColor: profileForm.visibility === 'public' ? 'var(--violet)' : 'var(--line)',
                  background: profileForm.visibility === 'public' ? 'rgba(0, 102, 255, 0.04)' : '#fff',
                }">
                <input type="radio" v-model="profileForm.visibility" value="public" style="accent-color: var(--violet);" />
                <div>
                  <strong style="font-size: 14px; display: block;">전체 공개</strong>
                  <span style="font-size: 12px; color: var(--muted);">모든 사용자가 볼 수 있습니다</span>
                </div>
              </label>
              <label style="flex: 1; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 2px solid; cursor: pointer; transition: all 0.2s;"
                :style="{
                  borderColor: profileForm.visibility === 'followers' ? 'var(--violet)' : 'var(--line)',
                  background: profileForm.visibility === 'followers' ? 'rgba(0, 102, 255, 0.04)' : '#fff',
                }">
                <input type="radio" v-model="profileForm.visibility" value="followers" style="accent-color: var(--violet);" />
                <div>
                  <strong style="font-size: 14px; display: block;">팔로워만</strong>
                  <span style="font-size: 12px; color: var(--muted);">팔로워만 볼 수 있습니다</span>
                </div>
              </label>
            </div>
          </div>

          <!-- 알림 설정 안내 (실제 설정은 SettingsPage의 /me/settings 사용) -->
          <div style="margin-bottom: 28px; padding: 14px 16px; border-radius: 12px; background: rgba(0, 102, 255, 0.04); border: 1px solid rgba(0, 102, 255, 0.15); display: flex; align-items: flex-start; gap: 10px;">
            <span class="material-symbols-rounded" style="font-size: 18px; color: var(--violet); flex-shrink: 0;">info</span>
            <div style="font-size: 13px; color: var(--ink); line-height: 1.5;">
              <strong style="font-weight: 800;">알림 / 마케팅 수신 설정</strong>은
              <a href="#" style="color: var(--violet); font-weight: 700; text-decoration: underline;" @click.prevent="() => { profileEditModal.close(); router.push('/settings') }">설정 페이지</a>에서 관리합니다.
            </div>
          </div>

          <!-- 에러 메시지 -->
          <div v-if="profileError" style="margin-top: 12px; padding: 10px 14px; border-radius: 10px; background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.2); color: #dc2626; font-size: 13px; font-weight: 600;">
            {{ profileError }}
          </div>

          <!-- 저장 버튼 -->
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" style="padding: 12px 24px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 14px; font-weight: 700; cursor: pointer; color: var(--ink); transition: all 0.2s;" @click="closeProfileEdit">취소</button>
            <button type="button" :disabled="profileSaving" style="padding: 12px 28px; border-radius: 999px; border: none; background: linear-gradient(135deg, var(--violet), var(--blue)); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; transition: all 0.2s; box-shadow: 0 6px 18px rgba(0, 102, 255, 0.25); opacity: 1;" @click="saveProfile">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">save</span>{{ profileSaving ? '저장 중...' : '저장' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
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
.place-image-placeholder { width: 100%; height: 100%; display: grid; place-items: center; background: linear-gradient(135deg, #eef2ff, #f8fafc); color: var(--muted); }
.place-image-placeholder .material-symbols-rounded { font-size: 36px; }
.mypage-share-notice { margin: 8px 0 0; color: var(--violet); font-size: 12px; font-weight: 800; text-align: right; }
.mypage-visibility-badge { display: inline-flex; align-items: center; gap: 4px; width: fit-content; margin-top: 7px; padding: 4px 9px; border-radius: 999px; background: rgba(124, 58, 237, .08); color: var(--violet); font-size: 11px; font-weight: 850; }
.mypage-visibility-badge .material-symbols-rounded { font-size: 14px; }
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
  overflow: hidden;
}
.mypage-places-slider {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding-bottom: 8px;
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

/* ========================================
 * 프로필 카드: 인스타그램 웹 프로필 헤더
 * 좌(아바타 28%) / 우(정보 72%) 가로 배치
 * ======================================== */

.profile-header-card {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 40px !important;
  padding: 36px 40px !important;
}

/* 좌측 아바타 컬럼 */
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
  background: linear-gradient(135deg, rgba(0,102,255,0.18), rgba(0,209,255,0.18));
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

/* 우측 정보 컬럼 */
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

/* 통계 행 (박스 없음, 얇은 구분선) */
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

/* 버튼 행 (2개 pill) */
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

/* ========================================
 * 통합 하단 섹션: 2컬럼 그리드
 * ======================================== */
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

/* 여행 취향 패널 */
.preference-intro {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 16px;
  font-weight: 600;
}
.pref-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}
.pref-tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.pref-style-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}
.pref-style-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pref-style-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pref-style-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.pref-style-percent {
  font-size: 13px;
  font-weight: 800;
  color: var(--muted);
}
.pref-style-track {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.pref-style-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}
.pref-insight-box {
  margin-top: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(0, 102, 255, 0.04);
  border: 1px solid rgba(0, 102, 255, 0.12);
}
.pref-insight-icon {
  font-size: 20px;
  color: var(--violet);
  flex-shrink: 0;
  margin-top: 1px;
}
.pref-insight-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink);
  font-weight: 600;
}

/* 취향 데이터 없음 (온보딩) */
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
.pref-empty-cta {
  margin-top: 10px;
  padding: 10px 22px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 102, 255, 0.2);
  transition: transform 0.2s, box-shadow 0.2s;
}
.pref-empty-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(0, 102, 255, 0.28);
}

/* === 반응형 === */
@media (max-width: 1024px) {
  .profile-header-card {
    gap: 28px !important;
    padding: 28px 28px !important;
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
  .profile-actions-row {
    justify-content: center;
  }
}
@media (max-width: 480px) {
  .profile-stats-row {
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .profile-stat-item {
    min-width: 64px;
    padding: 0 12px;
  }
  .profile-stat-item.has-divider {
    border-left: none;
  }
}
</style>
