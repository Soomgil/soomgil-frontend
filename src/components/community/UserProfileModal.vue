<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { userApi } from '@/api/user.api'
import { communityApi } from '@/api/community.api'
import type { UserProfile } from '@/types/user'
import type { CommunityPostSummary } from '@/types/community'
import type { UserSummary } from '@/types/auth'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import FollowListModal from '@/components/common/FollowListModal.vue'

const props = defineProps<{ user: UserProfile | null }>()
defineEmits<{ close: [] }>()

const auth = useAuthStore()

const loading = ref(false)
const error = ref('')
const followingInFlight = ref(false)
const isFollowing = ref(false)

const userStories = ref<CommunityPostSummary[]>([])
const followersList = ref<UserSummary[]>([])
const followingList = ref<UserSummary[]>([])
const myFollowingIds = ref<Set<string>>(new Set())

const showFollowersModal = ref(false)
const showFollowingModal = ref(false)

async function loadProfile() {
  if (!props.user) return
  loading.value = true
  error.value = ''
  try {
    const myId = auth.user?.id
    const [followers, following, postsRes, myFollowing] = await Promise.all([
      userApi.getFollowers(props.user.id).catch(() => [] as UserSummary[]),
      userApi.getFollowing(props.user.id).catch(() => [] as UserSummary[]),
      communityApi.getPosts({ authorId: props.user.id }).catch(() => ({ items: [] as CommunityPostSummary[] })),
      myId ? userApi.getFollowing(myId).catch(() => [] as UserSummary[]) : Promise.resolve([] as UserSummary[]),
    ])
    followersList.value = followers
    followingList.value = following
    userStories.value = postsRes.items
    myFollowingIds.value = new Set(myFollowing.map((u) => u.id))
    isFollowing.value = Boolean(props.user.id && myFollowingIds.value.has(props.user.id))
  } catch {
    error.value = '프로필을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

async function toggleFollow() {
  if (!props.user || followingInFlight.value) return
  followingInFlight.value = true
  try {
    if (isFollowing.value) {
      await userApi.unfollow(props.user.id)
      myFollowingIds.value.delete(props.user.id)
      isFollowing.value = false
    } else {
      await userApi.follow(props.user.id)
      myFollowingIds.value.add(props.user.id)
      isFollowing.value = true
    }
  } catch {
    // 에러는 http 인터셉터가 처리
  } finally {
    followingInFlight.value = false
  }
}

watch(
  () => props.user?.id,
  (newId) => {
    if (newId) void loadProfile()
  },
  { immediate: true },
)

const userFollowerCount = computed(() => followersList.value.length)
const userFollowingCount = computed(() => followingList.value.length)

const profileStats = computed(() => [
  { icon: 'luggage', value: String(props.user?.tripCount ?? 0), label: '여행' },
  { icon: 'group', value: String(userFollowerCount.value), label: '팔로워' },
  { icon: 'person_add', value: String(userFollowingCount.value), label: '팔로잉' },
  { icon: 'auto_stories', value: String(userStories.value.length), label: '스토리' },
])

const profileTags = computed(() => {
  const tags: string[] = []
  if (props.user?.bio?.includes('빵')) tags.push('#빵지순례')
  if (props.user?.bio?.includes('자전거')) tags.push('#자전거')
  if (props.user?.bio?.includes('카페')) tags.push('#카페')
  if (props.user?.bio?.includes('야경')) tags.push('#야경')
  if (props.user?.bio?.includes('산책')) tags.push('#산책')
  if (tags.length === 0) tags.push('#여행', '#탐험')
  return tags
})
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="사용자 프로필">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <div class="story-overlay-panel" style="width: min(98vw, 720px); max-height: 94vh; overflow-y: auto;">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>

      <div v-if="user" style="padding: 32px;">
        <LoadingState v-if="loading" />
        <ErrorState v-else-if="error" :message="error" @retry="loadProfile" />
        <template v-else>
          <!-- Profile card -->
          <div class="user-profile-card" style="display: flex; flex-direction: column; gap: 20px; padding: 28px; border: 1px solid var(--line); border-radius: 24px; background: rgba(255,255,255,0.88); box-shadow: var(--soft-shadow); margin-bottom: 32px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <span style="width: 64px; height: 64px; min-width: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--violet); color: #fff; font-size: 26px; font-weight: 800; overflow: hidden;">
                <img v-if="user.profileImageUrl" :src="user.profileImageUrl" :alt="user.displayName" style="width: 100%; height: 100%; object-fit: cover;" />
                <template v-else>{{ user.displayName.charAt(0) }}</template>
              </span>
              <div style="flex: 1; min-width: 0;">
                <h2 style="font-size: 22px; font-weight: 850; color: var(--ink); margin: 0;">{{ user.displayName }}</h2>
                <span style="font-size: 13px; color: var(--muted); display: block; margin-top: 2px;">{{ user.bio }}</span>
              </div>
              <button type="button"
                :disabled="followingInFlight"
                :style="{
                  padding: '0 24px',
                  height: '42px',
                  borderRadius: '999px',
                  border: isFollowing ? '1px solid var(--line)' : 'none',
                  background: isFollowing ? '#fff' : 'var(--violet)',
                  color: isFollowing ? 'var(--muted)' : '#fff',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: followingInFlight ? 'wait' : 'pointer',
                  opacity: followingInFlight ? 0.7 : 1,
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }"
                @click="toggleFollow">
                <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">{{ isFollowing ? 'person_remove' : 'person_add' }}</span>
                {{ isFollowing ? '팔로잉' : '팔로우' }}
              </button>
            </div>

            <!-- Tags -->
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <span v-for="tag in profileTags" :key="tag" class="mypage-hero__tag" style="display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px; background: var(--surface-2); font-size: 12px; font-weight: 700; color: var(--ink);">{{ tag }}</span>
            </div>

            <!-- Stats -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
              <div v-for="stat in profileStats" :key="stat.label" style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 0;">
                <span class="material-symbols-rounded" style="font-size: 20px; color: var(--violet);">{{ stat.icon }}</span>
                <span style="font-size: 18px; font-weight: 850; color: var(--ink);"
                  :style="{ cursor: (stat.label === '팔로워' || stat.label === '팔로잉') ? 'pointer' : 'default' }"
                  @click="stat.label === '팔로워' ? showFollowersModal = true : stat.label === '팔로잉' ? showFollowingModal = true : null">
                  {{ stat.value }}
                </span>
                <span style="font-size: 11px; color: var(--muted); font-weight: 700;">{{ stat.label }}</span>
              </div>
            </div>
          </div>

          <!-- User stories -->
          <div v-if="userStories.length > 0">
            <div class="mypage-section-header" style="margin-bottom: 20px;">
              <h3 class="mypage-section-title" style="font-size: 18px;">
                <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">auto_stories</span>{{ user.displayName }}님의 여행기
              </h3>
            </div>
            <div class="mypage-stories-magazine">
              <div v-for="story in userStories" :key="story.id" class="mypage-story-magazine-item">
                <img class="story-magazine-thumb" :src="story.coverMedia?.servingUrl ?? story.coverMedia?.publicUrl ?? '/images/랜딩페이지/korea_hero.png'" :alt="story.title" />
                <div class="story-magazine-body">
                  <h3 class="story-magazine-title">
                    <a href="#">{{ story.title }}</a>
                  </h3>
                  <div class="story-magazine-meta">
                    <span class="story-date">{{ story.hashtags?.[0] ?? '여행 기록' }}</span>
                    <div class="story-stats-row">
                      <span><span class="material-symbols-rounded">favorite</span> {{ story.likeCount ?? 0 }}</span>
                      <span><span class="material-symbols-rounded">chat_bubble</span> {{ story.commentCount ?? 0 }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <EmptyState
            v-else
            icon="auto_stories"
            title="아직 작성한 여행기가 없어요"
            :description="`${user.displayName}님의 첫 여행기를 기다리고 있어요.`"
          />
        </template>
      </div>

      <!-- Follower/Following modals -->
      <FollowListModal v-if="showFollowersModal" title="팔로워" :users="followersList" :followingIds="myFollowingIds" @close="showFollowersModal = false" />
      <FollowListModal v-if="showFollowingModal" title="팔로잉" :users="followingList" :followingIds="myFollowingIds" @close="showFollowingModal = false" />
    </div>
  </div>
</template>
