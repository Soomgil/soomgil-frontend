<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { communityApi } from '@/api/community.api'
import { userApi } from '@/api/user.api'
import type {
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  ReportReason,
  ReportReasonCode,
} from '@/types/community'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import StoryWriteModal from '@/components/community/StoryWriteModal.vue'
import { useModal } from '@/composables/useModal'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth.store'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const auth = useAuthStore()

interface StoryView {
  id: string
  author: string
  authorUserId: string | null
  authorProfileImageUrl: string | null
  avatar: string
  location: string
  title: string
  image: string
  photos: string[]
  likes: number
  likedByMe: boolean
  comments: number
  tags: string[]
  summary: string
  content: string
}

const FALLBACK_IMAGE = '/images/랜딩페이지/korea_hero.png'
const posts = ref<CommunityPostSummary[]>([])
const loading = ref(true)
const loadError = ref('')
const profileImageRequests = new Map<string, Promise<string | null>>()

const searchQuery = ref('')
const currentPage = ref(1)
const selectedPost = ref<CommunityPostDetail | null>(null)
const storyWriteModal = useModal()

function getProfileImage(userId: string): Promise<string | null> {
  const cached = profileImageRequests.get(userId)
  if (cached) return cached
  const request = userApi.getUserProfile(userId)
    .then((profile) => profile.profileImageUrl ?? null)
    .catch(() => null)
  profileImageRequests.set(userId, request)
  return request
}

async function enrichPostAuthors(items: Array<CommunityPostSummary | CommunityPostDetail>) {
  await Promise.all(items.map(async (post) => {
    if (!post.publishedBy || post.publishedBy.profileImageUrl) return
    post.publishedBy.profileImageUrl = await getProfileImage(post.publishedBy.id)
  }))
}

async function enrichCommentAuthors(items: CommunityComment[]) {
  await Promise.all(items.map(async (comment) => {
    if (!comment.author || comment.author.profileImageUrl) return
    comment.author.profileImageUrl = await getProfileImage(comment.author.id)
  }))
}

function openUserProfile(userId: string | null) {
  if (userId) router.push(`/mypage/${userId}`)
}

const PER_PAGE = 6

function toStoryView(post: CommunityPostSummary | CommunityPostDetail): StoryView {
  const detail = 'snapshot' in post ? post : null
  const firstPlace = detail?.snapshot?.days?.flatMap((day) => day.items ?? [])[0]
  const image = post.coverMedia?.publicUrl
    ?? detail?.media?.find((media) => media.publicUrl)?.publicUrl
    ?? firstPlace?.thumbnailUrl
    ?? FALLBACK_IMAGE
  const photos = detail?.media?.flatMap((media) => media.publicUrl ? [media.publicUrl] : []) ?? []
  return {
    id: post.id,
    author: post.publishedBy?.displayName ?? '숨길 여행자',
    authorUserId: post.publishedBy?.id ?? null,
    authorProfileImageUrl: post.publishedBy?.profileImageUrl ?? null,
    avatar: (post.publishedBy?.displayName ?? '?').slice(0, 1),
    location: firstPlace?.address ?? firstPlace?.placeName ?? '여행 기록',
    title: post.title,
    image,
    photos: photos.length > 0 ? photos : [image],
    likes: post.likeCount ?? 0,
    likedByMe: post.likedByMe === true,
    comments: post.commentCount ?? 0,
    tags: post.hashtags ?? [],
    summary: post.summary ?? '',
    content: post.summary ?? '',
  }
}

const stories = computed(() => posts.value.map((post) =>
  selectedPost.value?.id === post.id ? toStoryView(selectedPost.value) : toStoryView(post),
))
const selectedStory = computed(() => selectedPost.value ? toStoryView(selectedPost.value) : null)
const storyPhotoIndexes = ref<Record<string, number>>({})

function currentStoryPhoto(story: StoryView): string {
  const index = storyPhotoIndexes.value[story.id] ?? 0
  return story.photos[index] ?? story.image
}

function moveStoryPhoto(story: StoryView, direction: -1 | 1) {
  if (story.photos.length < 2) return
  const current = storyPhotoIndexes.value[story.id] ?? 0
  storyPhotoIndexes.value = {
    ...storyPhotoIndexes.value,
    [story.id]: (current + direction + story.photos.length) % story.photos.length,
  }
}

const filteredStories = computed(() => {
  if (!searchQuery.value) return stories.value
  const q = searchQuery.value.toLowerCase()
  return stories.value.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.author.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  )
})

const popularStories = computed(() =>
  [...stories.value].sort((a, b) => b.likes - a.likes).slice(0, 3),
)

const popularIndex = ref(0)

const totalPages = computed(() => Math.ceil(filteredStories.value.length / PER_PAGE))

const pagedStories = computed(() => {
  const start = (currentPage.value - 1) * PER_PAGE
  return filteredStories.value.slice(start, start + PER_PAGE)
})

async function loadPosts() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await communityApi.getPosts({ page: 0, size: 100 })
    await enrichPostAuthors(response.items)
    posts.value = response.items
    const requestedStoryId = typeof route.query.story === 'string' ? route.query.story : null
    const requestedStory = requestedStoryId
      ? stories.value.find((story) => story.id === requestedStoryId)
      : null
    if (requestedStory) await openStory(requestedStory)
  } catch {
    loadError.value = '커뮤니티 게시글을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

async function openStory(story: StoryView) {
  try {
    const [post, commentPage] = await Promise.all([
      communityApi.getPost(story.id),
      communityApi.getComments(story.id),
    ])
    await Promise.all([enrichPostAuthors([post]), enrichCommentAuthors(commentPage.items)])
    selectedPost.value = post
    apiComments.value = commentPage.items
    visibleStoryIdx.value = Math.max(0, stories.value.findIndex((item) => item.id === story.id))
    await nextTick()
    const container = document.getElementById('overlay-feed-stories')
    const article = container?.querySelector<HTMLElement>(`[data-story-id="${story.id}"]`)
    if (container && article) container.scrollTo({ top: article.offsetTop, behavior: 'auto' })
  } catch {
    toast.error('여행기 상세를 불러오지 못했습니다.')
  }
}

function closeModal() {
  selectedPost.value = null
  apiComments.value = []
}

function goPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

function prevPopular() {
  popularIndex.value =
    (popularIndex.value - 1 + popularStories.value.length) % popularStories.value.length
}

function nextPopular() {
  popularIndex.value = (popularIndex.value + 1) % popularStories.value.length
}

const apiComments = ref<CommunityComment[]>([])
const comments = computed(() => apiComments.value.map((comment) => ({
  id: comment.id,
  authorUserId: comment.author?.id ?? null,
  profileImageUrl: comment.author?.profileImageUrl ?? null,
  avatar: (comment.author?.displayName ?? '?').slice(0, 1),
  name: comment.author?.displayName ?? '사용자',
  color: 'var(--violet)',
  time: new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(comment.createdAt)),
  text: comment.content ?? '삭제된 댓글입니다.',
  featured: false,
  likes: 0,
})))

const overlayComment = ref('')
const replyTarget = ref<{ id: string; name: string } | null>(null)
const reportModal = ref(false)
const reportReason = ref<ReportReasonCode | ''>('')
const reportDetail = ref('')
const reportReasons = ref<ReportReason[]>([])

async function openReport() {
  reportReason.value = ''
  reportDetail.value = ''
  reportModal.value = true
  try {
    reportReasons.value = await communityApi.getReportReasons()
  } catch {
    reportModal.value = false
    toast.error('신고 사유를 불러오지 못했습니다.')
  }
}

async function submitReport() {
  if (!selectedPost.value || !reportReason.value) return
  try {
    await communityApi.createReport({
      targetType: 'POST',
      targetId: selectedPost.value.id,
      reasonCode: reportReason.value,
      detail: reportDetail.value.trim() || null,
    })
    reportModal.value = false
    toast.success('신고가 접수되었습니다.')
  } catch {
    toast.error('신고를 접수하지 못했습니다.')
  }
}

async function submitComment() {
  const content = overlayComment.value.trim()
  if (!selectedPost.value || !content) return
  try {
    const comment = await communityApi.createComment(selectedPost.value.id, content, replyTarget.value?.id)
    apiComments.value.push(comment)
    selectedPost.value.commentCount += 1
    overlayComment.value = ''
    replyTarget.value = null
  } catch {
    toast.error('댓글을 등록하지 못했습니다.')
  }
}

async function deleteComment(commentId: string) {
  if (!selectedPost.value || !window.confirm('댓글을 삭제할까요?')) return
  try {
    await communityApi.deleteComment(selectedPost.value.id, commentId)
    apiComments.value = apiComments.value.filter((comment) => comment.id !== commentId)
    selectedPost.value.commentCount = Math.max(0, selectedPost.value.commentCount - 1)
  } catch {
    toast.error('댓글을 삭제하지 못했습니다.')
  }
}

async function editStory(story: StoryView) {
  const title = window.prompt('여행기 제목', story.title)?.trim()
  if (!title) return
  const summary = window.prompt('여행기 소개', story.summary)?.trim() ?? story.summary
  try {
    const updated = await communityApi.updatePost(story.id, { title, summary })
    const index = posts.value.findIndex((post) => post.id === story.id)
    if (index >= 0) posts.value[index] = updated
    selectedPost.value = updated
    toast.success('여행기를 수정했습니다.')
  } catch {
    toast.error('여행기를 수정하지 못했습니다.')
  }
}

async function deleteStory(story: StoryView) {
  if (!window.confirm('여행기를 삭제할까요?')) return
  try {
    await communityApi.deletePost(story.id)
    posts.value = posts.value.filter((post) => post.id !== story.id)
    closeModal()
    toast.success('여행기를 삭제했습니다.')
  } catch {
    toast.error('여행기를 삭제하지 못했습니다.')
  }
}

const likingPostIds = ref(new Set<string>())
async function toggleStoryLike(story: StoryView) {
  if (likingPostIds.value.has(story.id)) return
  likingPostIds.value = new Set(likingPostIds.value).add(story.id)
  try {
    const summary = posts.value.find((post) => post.id === story.id)
    const liked = summary?.likedByMe ?? story.likedByMe
    const result = liked
      ? await communityApi.unlikePost(story.id)
      : await communityApi.likePost(story.id)
    if (summary) {
      summary.likedByMe = result.liked
      summary.likeCount = result.likeCount
    }
    if (selectedPost.value?.id === result.postId) {
      selectedPost.value.likedByMe = result.liked
      selectedPost.value.likeCount = result.likeCount
    }
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } }).response?.status
    toast.error(status === 401 ? '좋아요를 누르려면 로그인이 필요합니다.' : '좋아요를 반영하지 못했습니다.')
  } finally {
    const next = new Set(likingPostIds.value)
    next.delete(story.id)
    likingPostIds.value = next
  }
}

async function retripStory(story: StoryView) {
  try {
    const trip = await communityApi.retrip(story.id)
    toast.success('새 여행방으로 가져왔습니다.')
    closeModal()
    await router.push(`/trips/${trip.id}/route`)
  } catch (error: unknown) {
    const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
    toast.error(detail || '여행기를 가져오지 못했습니다.')
  }
}

async function shareStory(story: StoryView) {
  try {
    const shared = await communityApi.rotateShareToken(story.id)
    await navigator.clipboard.writeText(shared.shareUrl)
    toast.success('공유 링크를 복사했습니다.')
  } catch (error: unknown) {
    const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
    toast.error(detail || 'UNLISTED 여행기만 공유 링크를 만들 수 있습니다.')
  }
}

function handlePostPublished(post: CommunityPostDetail) {
  posts.value.unshift(post)
  currentPage.value = 1
}
const scrollGuideVisible = ref(true)
const visibleStoryIdx = ref(0)

const visibleStory = computed(() => stories.value[visibleStoryIdx.value] || stories.value[0])

let visibleStoryRequest = 0
async function selectVisibleStory(index: number) {
  const story = stories.value[index]
  if (!story || selectedPost.value?.id === story.id) return
  const request = ++visibleStoryRequest
  try {
    const [post, commentPage] = await Promise.all([
      communityApi.getPost(story.id),
      communityApi.getComments(story.id),
    ])
    await Promise.all([enrichPostAuthors([post]), enrichCommentAuthors(commentPage.items)])
    if (request !== visibleStoryRequest) return
    selectedPost.value = post
    apiComments.value = commentPage.items
  } catch {
    toast.error('다음 여행기를 불러오지 못했습니다.')
  }
}

function onFeedScroll(e: Event) {
  const el = e.target as HTMLElement
  if (scrollGuideVisible.value && el.scrollTop > 30) {
    scrollGuideVisible.value = false
  }
  // Determine which story is visible based on scroll position
  const articles = el.querySelectorAll('.story-post')
  const centerY = el.scrollTop + el.clientHeight / 2
  articles.forEach((article, idx) => {
    const top = (article as HTMLElement).offsetTop
    const bottom = top + (article as HTMLElement).offsetHeight
    if (centerY >= top && centerY < bottom) {
      if (visibleStoryIdx.value !== idx) {
        visibleStoryIdx.value = idx
        void selectVisibleStory(idx)
      }
    }
  })
}

watch(searchQuery, () => { currentPage.value = 1 })
onMounted(async () => {
  const q = typeof route.query.q === 'string' ? route.query.q.trim() : ''
  if (q) searchQuery.value = q
  await loadPosts()
})
</script>

<template>
  <AppShell>
    <main>
      <section class="section community-page">
        <div
          class="section-title community-hero-header"
          style="margin-bottom: 48px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;"
        >
          <div>
            <p class="eyebrow">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle">explore</span>
              Trip Community
            </p>
            <h1 style="max-width: 100%; word-break: keep-all; font-size: clamp(36px, 4vw, 56px); margin-bottom: 18px;">
              <span style="background: linear-gradient(135deg, var(--violet), var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">여행의 기록</span>을 나누고,<br />
              새로운 루트를 발견하세요
            </h1>
            <p class="lead" style="max-width: 100%; word-break: keep-all; margin-top: 16px">
              전 세계 여행자들이 직접 다녀온 생생한 여행기와 검증된 루트를 탐색할 수 있습니다.
            </p>
          </div>
        </div>

        <div class="community-content-container" style="background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(246, 249, 255, 0.85)); backdrop-filter: blur(24px); border: 1px solid rgba(227, 231, 244, 0.8); border-radius: 40px; box-shadow: 0 32px 64px rgba(0, 50, 150, 0.08), 0 8px 24px rgba(0, 102, 255, 0.04), inset 0 2px 4px rgba(255, 255, 255, 0.8);">

          <!-- 인기 여행기 (Popular Travelogues) Carousel Section -->
          <LoadingState v-if="loading" />
          <ErrorState v-else-if="loadError" :message="loadError" @retry="loadPosts" />
          <EmptyState
            v-else-if="stories.length === 0"
            icon="auto_stories"
            title="아직 공개된 여행기가 없어요"
            description="다녀온 여행을 기록하고 다른 여행자들과 나눠보세요."
            action-label="첫 여행기 작성하기"
            @action="storyWriteModal.open()"
          />

          <section v-if="popularStories.length" class="popular-stories-section" style="margin-bottom: 56px; border-bottom: 1px solid var(--line); padding-bottom: 56px;">
            <div class="popular-story-column" style="width: 100%; height: 560px; position: relative;">
              <div class="popular-story-card-wrapper" style="height: 100%;">
                <a
                  v-if="popularStories[popularIndex]"
                  class="popular-feature-story"
                  href="#"
                  style="height: 100%; text-decoration: none; display: block; background: #f0f0f0; border-radius: 24px; overflow: hidden; position: relative;"
                  @click.prevent="openStory(popularStories[popularIndex])"
                >
                  <img :src="popularStories[popularIndex].image" :alt="popularStories[popularIndex].title" style="width: 100%; height: 100%; object-fit: cover;" />
                  <div style="padding:24px; position:absolute; bottom:0; left:0; right:0; background: linear-gradient(transparent, rgba(0,0,0,0.65)); color:#fff;">
                    <div class="popular-story-badges">
                      <span class="popular-story-label"><span class="material-symbols-rounded">local_fire_department</span>인기 게시물</span>
                      <span class="post-type story" style="background:var(--rose)">TOP STORY</span>
                    </div>
                    <h3 style="font-size:24px; margin-bottom:8px; color:#fff;">{{ popularStories[popularIndex].title }}</h3>
                    <p style="opacity:0.9; margin:0;">{{ popularStories[popularIndex].author }} · 좋아요 {{ popularStories[popularIndex].likes }} · 댓글 {{ popularStories[popularIndex].comments }}</p>
                  </div>
                </a>
                <div class="story-carousel-controls" style="position: absolute; top: 50%; left: -22px; right: -22px; transform: translateY(-50%); display: flex; justify-content: space-between; pointer-events: none; z-index: 5;">
                  <button class="carousel-btn prev-btn" type="button" aria-label="이전 여행기" style="pointer-events: auto; cursor: pointer;" @click="prevPopular">
                    <span class="material-symbols-rounded">chevron_left</span>
                  </button>
                  <button class="carousel-btn next-btn" type="button" aria-label="다음 여행기" style="pointer-events: auto; cursor: pointer;" @click="nextPopular">
                    <span class="material-symbols-rounded">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 전체 여행기 (All Travelogue Posts) Grid Section -->
          <section class="all-stories-section">
            <div class="section-title compact-title" style="margin-bottom: 24px;">
              <div>
                <p class="eyebrow" style="color: var(--rose)">All Stories</p>
                <h2 style="font-size: 28px">
                  <span class="material-symbols-rounded" style="vertical-align: middle; color: var(--rose); margin-right: 6px">dynamic_feed</span>전체 여행기
                </h2>
              </div>
              <div class="community-story-actions">
                <button class="btn primary" style="border-radius: 999px; font-size: 14px; padding: 10px 20px; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap;" @click="storyWriteModal.open">
                  <span class="material-symbols-rounded" style="font-size: 20px;">edit_note</span> 여행기 작성
                </button>
                <label class="search-box community-story-search">
                  <input v-model="searchQuery" type="search" placeholder="여행기 검색" aria-label="여행기 검색" />
                  <button class="search-box__button community-story-search-btn" type="button" aria-label="여행기 검색">
                    <span class="material-symbols-rounded" aria-hidden="true">search</span>
                  </button>
                </label>
              </div>
            </div>

            <div class="story-list-grid" data-stories-list>
              <a
                v-for="story in pagedStories"
                :key="story.id"
                class="story-list-card"
                href="#"
                @click.prevent="openStory(story)"
              >
                <img class="story-card-thumb" :alt="story.title" :src="story.image" />
                <div class="story-card-body">
                  <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    <span v-for="tag in story.tags" :key="tag" style="font-size:12px; color:var(--violet); font-weight:700;">{{ tag }}</span>
                  </div>
                  <h3>{{ story.title }}</h3>
                  <p class="story-card-summary">{{ story.summary }}</p>
                  <p class="muted"><a href="#" style="color:var(--violet); font-weight:700; text-decoration:none;" @click.prevent.stop="openUserProfile(story.authorUserId)">{{ story.author }}</a> · 좋아요 {{ story.likes }} · 댓글 {{ story.comments }}</p>
                </div>
              </a>
            </div>

            <div class="pagination-container" id="stories-pagination">
              <button
                class="pagination-btn"
                :disabled="currentPage === 1"
                @click="goPage(currentPage - 1)"
              >
                <span class="material-symbols-rounded">chevron_left</span>
              </button>
              <button
                v-for="page in totalPages"
                :key="page"
                class="pagination-btn"
                :class="{ active: page === currentPage }"
                @click="goPage(page)"
              >
                {{ page }}
              </button>
              <button
                class="pagination-btn"
                :disabled="currentPage === totalPages"
                @click="goPage(currentPage + 1)"
              >
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>

    <!-- Story detail overlay -->
    <div
      v-if="selectedStory"
      class="story-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="여행기 상세"
    >
      <div class="story-overlay-backdrop" @click="closeModal"></div>
      <div class="story-overlay-panel">
        <button class="story-overlay-close" type="button" aria-label="닫기" @click="closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
        <div class="feed-layout" id="overlay-feed-layout">
          <section class="story-feed" aria-label="여행기 피드">
            <div class="section-title compact-title">
              <div>
                <p class="eyebrow" style="color: var(--rose)">Feed</p>
                <h2 style="font-size: 24px">
                  <span class="material-symbols-rounded" style="vertical-align: middle; color: var(--rose); margin-right: 6px">dynamic_feed</span>최신 여행 이야기
                </h2>
              </div>
            </div>

            <div class="story-feed-window" aria-label="스크롤 가능한 여행기 피드" id="overlay-feed-stories" @scroll="onFeedScroll">
              <article
                v-for="story in stories"
                :key="story.id"
                :data-story-id="story.id"
                class="story-post"
                style="margin-bottom: 32px;"
              >
                <div class="story-post-head" style="padding:16px 20px; display:flex; flex-direction:column; align-items:flex-start; gap:12px">
                  <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
                    <div class="story-author" style="display:flex; align-items:center; gap:10px; cursor:pointer;" @click="openUserProfile(story.authorUserId)">
                      <div class="fc-avatar" style="width:40px; height:40px; background:var(--violet)">
                        <img v-if="story.authorProfileImageUrl" :src="story.authorProfileImageUrl" :alt="`${story.author} 프로필 사진`" />
                        <span v-else>{{ story.avatar }}</span>
                      </div>
                      <div>
                        <strong style="font-size:15px; color:var(--violet)">{{ story.author }}</strong>
                        <span class="small muted" style="display:block">{{ story.location }}</span>
                      </div>
                    </div>
                    <button type="button" class="story-report-btn" aria-label="게시글 신고" title="신고" @click.stop="openReport">
                      <span class="material-symbols-rounded">campaign</span>
                    </button>
                  </div>
                </div>
                <div style="overflow:hidden; display:block; position:relative;">
                  <button v-if="story.photos.length > 1" type="button" class="feed-photo-nav carousel-btn prev-btn prev" aria-label="이전 사진" @click="moveStoryPhoto(story, -1)"><span class="material-symbols-rounded">chevron_left</span></button>
                  <img :alt="story.title" :src="currentStoryPhoto(story)" style="width: 100%; transition: transform 0.5s ease; display:block;" />
                  <button v-if="story.photos.length > 1" type="button" class="feed-photo-nav carousel-btn next-btn next" aria-label="다음 사진" @click="moveStoryPhoto(story, 1)"><span class="material-symbols-rounded">chevron_right</span></button>
                  <span v-if="story.photos.length > 1" class="feed-photo-count">{{ (storyPhotoIndexes[story.id] ?? 0) + 1 }} / {{ story.photos.length }}</span>
                </div>
                <div class="story-body" style="padding:22px 24px">
                  <h3 style="font-size:20px; line-height:1.4; margin:0 0 12px">{{ story.title }}</h3>
                  <p class="muted" style="font-size:15px; line-height:1.7; margin:0 0 16px">{{ story.summary }}</p>
                  <div class="tag-row" style="margin-bottom:12px">
                    <span v-for="tag in story.tags" :key="tag" class="tag">{{ tag }}</span>
                  </div>
                  <p style="font-size:14px; line-height:1.7; color:var(--muted)">{{ story.content }}</p>
                  <div style="margin-top:16px; display:flex; align-items:center; gap:20px; color:var(--muted); font-size:14px;">
                    <button
                      type="button"
                      class="story-like-button"
                      :class="{ active: story.likedByMe }"
                      :disabled="likingPostIds.has(story.id)"
                      :aria-pressed="story.likedByMe"
                      @click="toggleStoryLike(story)"
                    >
                      <span class="material-symbols-rounded" style="font-size:20px">favorite</span> {{ story.likes }}
                    </button>
                    <span style="display:flex; align-items:center; gap:4px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--violet)">chat_bubble</span> {{ story.comments }}</span>
                    <button type="button" class="story-like-button" @click="retripStory(story)"><span class="material-symbols-rounded" style="font-size:20px">content_copy</span> 재여행</button>
                    <button type="button" class="story-like-button" @click="shareStory(story)"><span class="material-symbols-rounded" style="font-size:20px">share</span> 공유</button>
                    <template v-if="story.authorUserId === auth.user?.id">
                      <button type="button" class="story-like-button" @click="editStory(story)"><span class="material-symbols-rounded" style="font-size:20px">edit</span> 수정</button>
                      <button type="button" class="story-like-button" @click="deleteStory(story)"><span class="material-symbols-rounded" style="font-size:20px">delete</span> 삭제</button>
                    </template>
                  </div>
                </div>
              </article>
            </div>

            <div v-show="scrollGuideVisible" class="feed-scroll-guide" data-scroll-guide>
              <div class="feed-scroll-guide-pill">
                <div class="swipe-track-container">
                  <div class="swipe-track-line"></div>
                  <div class="swipe-ripple"></div>
                  <span class="material-symbols-rounded animated-finger">swipe_up</span>
                </div>
                <span class="guide-text" style="font-weight: 800; font-size: 16px; letter-spacing: -0.02em;">위로 스와이프하여 탐색</span>
              </div>
            </div>
          </section>

          <aside class="feed-sidebar" aria-label="사이드바 정보 패널">
            <div class="widget-card feed-comment-widget">
              <div class="feed-comment-header">
                <h3>
                  <span class="material-symbols-rounded" style="font-size:20px; color:var(--violet)">forum</span>
                  댓글
                  <span class="comment-count-badge">{{ visibleStory.comments }}</span>
                </h3>
                <p class="muted" style="font-size:12px; margin:4px 0 0; line-height:1.4; display:flex; align-items:center; gap:8px;">
                  <span style="display:flex; align-items:center; gap:3px;"><span class="material-symbols-rounded" style="font-size:14px; color:var(--rose)">favorite</span> {{ visibleStory.likes }}</span>
                  <span>{{ visibleStory.title }}</span>
                </p>
              </div>

              <div class="feed-comment-scroll" id="overlay-comment-scroll">
                <div
                  v-for="comment in comments"
                  :key="comment.id"
                  class="fc-item"
                  :class="{ 'is-featured': comment.featured }"
                >
                  <button class="fc-avatar fc-avatar-button" type="button" :style="{ background: comment.color }" :aria-label="`${comment.name} 프로필 보기`" @click="openUserProfile(comment.authorUserId)">
                    <img v-if="comment.profileImageUrl" :src="comment.profileImageUrl" :alt="`${comment.name} 프로필 사진`" />
                    <span v-else>{{ comment.avatar }}</span>
                  </button>
                  <div class="fc-body">
                    <div class="fc-meta">
                      <div>
                        <button class="fc-name fc-name-button" type="button" @click="openUserProfile(comment.authorUserId)">{{ comment.name }}</button>
                        <span v-if="comment.featured" class="fc-author-badge">인기</span>
                      </div>
                      <span class="fc-time">{{ comment.time }}</span>
                    </div>
                    <p class="fc-text">{{ comment.text }}</p>
                    <div class="fc-actions">
                      <button>
                        <span class="material-symbols-rounded">favorite</span><span>{{ comment.likes }}</span>
                      </button>
                      <button type="button" @click="replyTarget = { id: comment.id, name: comment.name }">
                        <span class="material-symbols-rounded">reply</span>답글
                      </button>
                      <button v-if="comment.authorUserId === auth.user?.id" type="button" @click="deleteComment(comment.id)">
                        <span class="material-symbols-rounded">delete</span>삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="feed-comment-input-area">
                <div v-if="replyTarget" class="small muted" style="display:flex;justify-content:space-between;padding:0 4px 6px">
                  <span>{{ replyTarget.name }}님에게 답글</span><button type="button" @click="replyTarget = null">취소</button>
                </div>
                <div class="feed-comment-composer">
                  <div class="feed-comment-input-wrap">
                    <input v-model="overlayComment" type="text" placeholder="댓글을 남겨보세요..." />
                    <button class="comment-submit-btn" type="button" aria-label="댓글 등록" :disabled="!overlayComment.trim()" @click="submitComment">
                      <span class="material-symbols-rounded" style="font-size:16px">send</span>
                      <span class="submit-label">등록</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <!-- Report Modal -->
    <div v-if="reportModal" class="story-overlay" role="dialog" aria-modal="true" aria-label="게시글 신고">
      <div class="story-overlay-backdrop" @click="reportModal = false"></div>
      <div class="story-overlay-panel" style="width: min(96vw, 520px); max-height: 92vh;">
        <button class="story-overlay-close" type="button" aria-label="닫기" @click="reportModal = false">
          <span class="material-symbols-rounded">close</span>
        </button>
        <div style="padding: 36px 32px; overflow-y: auto; max-height: calc(92vh - 20px);">
          <h2 style="font-size: 20px; font-weight: 850; color: var(--ink); margin: 0 0 8px; display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-rounded" style="font-size: 24px; color: var(--rose);">campaign</span>게시글 신고
          </h2>
          <p style="font-size: 13px; color: var(--muted); margin: 0 0 24px; line-height: 1.5;">신고 사유를 선택해주세요. 검토 후 조치됩니다.</p>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
            <label
              v-for="reason in reportReasons"
              :key="reason.code"
              class="report-reason-option"
              :class="{ active: reportReason === reason.code }"
            >
              <input type="radio" v-model="reportReason" :value="reason.code" style="accent-color: var(--violet); width: 16px; height: 16px;" />
              <span>{{ reason.displayName }}</span>
            </label>
          </div>

          <div style="margin-bottom: 28px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">상세 내용 (선택)</label>
            <textarea
              v-model="reportDetail"
              rows="4"
              placeholder="구체적인 사유를 적어주시면 더 빠르게 처리할 수 있습니다."
              style="width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px; font-size: 14px; outline: none; resize: vertical; font-family: inherit; line-height: 1.6; box-sizing: border-box; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='var(--violet)'"
              onblur="this.style.borderColor='var(--line)'"
            ></textarea>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" style="padding: 12px 24px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 14px; font-weight: 700; cursor: pointer; color: var(--ink); transition: all 0.2s;" @click="reportModal = false">취소</button>
            <button
              type="button"
              :disabled="!reportReason"
              :style="{
                padding: '12px 28px',
                borderRadius: '999px',
                border: 'none',
                background: reportReason ? 'var(--rose)' : 'var(--line)',
                color: reportReason ? '#fff' : 'var(--muted)',
                fontSize: '14px',
                fontWeight: 800,
                cursor: reportReason ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: reportReason ? '0 6px 18px rgba(255, 92, 141, 0.3)' : 'none',
              }"
              @click="submitReport"
            >
              신고하기
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Story write modal -->
    <StoryWriteModal v-if="storyWriteModal.isOpen.value" @close="storyWriteModal.close()" @published="handlePostPublished" />
  </AppShell>
</template>

<style scoped>
.community-content-container {
  padding: 48px;
}
@media (max-width: 1024px) {
  .section-title.compact-title {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 16px;
  }
  .community-story-actions {
    width: 100%;
  }
  .community-story-search {
    flex: 1;
    width: unset;
    max-width: 320px;
  }
  .story-overlay-panel .feed-layout {
    grid-template-columns: 1fr;
    padding: 24px;
  }
  .story-list-grid {
    grid-template-columns: 1fr !important;
  }
  .story-list-card .story-card-thumb {
    width: 220px;
    min-width: 220px;
  }
}
@media (max-width: 768px) {
  .community-content-container {
    padding: 24px 16px;
    border-radius: 28px !important;
  }
  .story-list-card {
    flex-direction: column !important;
  }
  .story-list-card .story-card-thumb {
    width: 100%;
    min-width: unset;
    height: 180px !important;
    min-height: unset;
    border-radius: 22px 22px 0 0;
  }
}
@media (max-width: 480px) {
  .community-story-actions {
    gap: 8px;
  }
  .community-story-search {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    max-width: none;
  }
  .community-story-actions .btn {
    justify-content: center;
    flex: 0 0 auto;
    padding-inline: 14px !important;
  }
}
.story-list-card {
  display: flex !important;
  flex-direction: row !important;
  min-height: 200px;
  text-decoration: none;
  color: inherit;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #fff;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.story-list-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
}
.story-list-card .story-card-thumb {
  width: 260px;
  min-width: 260px;
  height: auto !important;
  min-height: 200px;
  object-fit: cover;
  display: block;
  border-radius: 22px 0 0 22px;
}
.story-list-card .story-card-body {
  flex: 1;
  display: flex !important;
  flex-direction: column;
  justify-content: center;
  padding: 24px !important;
  gap: 10px !important;
}
.story-list-card .story-card-body h3 {
  font-size: 17px !important;
  min-height: unset !important;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  font-weight: 800;
  color: var(--ink);
}
.story-list-card .story-card-body .story-card-summary {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}
.pagination-container {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 40px;
  align-items: center;
}
.pagination-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--text);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.pagination-btn:hover {
  border-color: var(--violet);
  background: var(--surface-2);
  color: var(--violet);
}
.pagination-btn.active {
  background: var(--violet);
  border-color: var(--violet);
  color: #fff;
}
.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.community-story-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  width: auto;
  min-width: 0;
  max-width: 100%;
  flex: 0 0 auto;
}
.community-story-search {
  flex: 1 1 0;
  min-width: 0;
  max-width: 320px;
}

/* Story overlay */
.story-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.story-overlay-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
}
.story-overlay-panel {
  position: relative;
  width: min(98vw, 1200px);
  max-height: 94vh;
  background: #fff;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 32px 64px rgba(0, 50, 150, 0.15);
  z-index: 1;
}
.story-overlay-panel .feed-layout {
  border-radius: 0;
  border: none;
  box-shadow: none;
  padding: 40px;
}
.story-overlay-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.story-overlay-close:hover {
  background: var(--surface-2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}
.story-overlay .story-post {
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
}
.story-overlay .story-feed-window {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  max-height: calc(94vh - 160px);
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 102, 255, 0.18) transparent;
}
.story-overlay .story-feed-window::-webkit-scrollbar { width: 6px; }
.story-overlay .story-feed-window::-webkit-scrollbar-track { background: transparent; }
.story-overlay .story-feed-window::-webkit-scrollbar-thumb { background: rgba(0, 102, 255, 0.16); border-radius: 10px; }
.story-overlay .feed-sidebar {
  --feed-panel-offset: 82px;
  --feed-list-height: min(760px, calc(100vh - 190px));
  height: var(--feed-list-height);
  min-height: 650px;
  padding-top: var(--feed-panel-offset);
}

/* Comment styles */
.feed-comment-header {
  padding: 18px 20px 14px;
  background: #f8fbff;
  border-bottom: 1px solid var(--line);
}
.feed-comment-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 800;
  margin: 0;
  color: var(--ink);
}
.feed-comment-header .comment-count-badge {
  display: inline-grid;
  place-items: center;
  min-width: 26px;
  height: 22px;
  background: linear-gradient(135deg, var(--violet), var(--rose));
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 0 8px;
  border-radius: 999px;
  box-shadow: 0 8px 18px rgba(255, 92, 141, 0.2);
}
.feed-comment-input-area {
  padding: 14px 16px;
  border-top: 1px solid var(--line);
  background: #ffffff;
}
.feed-comment-composer {
  display: block;
}
.feed-comment-input-wrap {
  position: relative;
}
.feed-comment-input-area input {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(227, 234, 244, 0.95);
  border-radius: 999px;
  padding: 11px 52px 11px 14px;
  font-size: 13px;
  outline: none;
  transition: all 0.25s ease;
  background: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.feed-comment-input-area input:focus {
  border-color: var(--violet);
  box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.08);
}
.feed-comment-input-area .comment-submit-btn {
  position: absolute;
  top: 50%;
  right: 5px;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  min-height: 34px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  border: none;
  border-radius: 50%;
  padding: 0;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.feed-comment-input-area .comment-submit-btn .submit-label {
  display: none;
}
.feed-comment-input-area .comment-submit-btn:hover {
  transform: translateY(-50%) scale(1.04);
  box-shadow: 0 8px 18px rgba(0, 102, 255, 0.2);
}
.feed-comment-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  background: #fbfdff;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 102, 255, 0.18) transparent;
}
.feed-comment-scroll::-webkit-scrollbar { width: 5px; }
.feed-comment-scroll::-webkit-scrollbar-track { background: transparent; }
.feed-comment-scroll::-webkit-scrollbar-thumb { background: rgba(0, 102, 255, 0.16); border-radius: 10px; }
.feed-comment-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0, 102, 255, 0.3); }
.fc-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(227, 234, 244, 0.8);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 102, 255, 0.03);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.fc-item + .fc-item { margin-top: 10px; }
.fc-item:hover {
  border-color: rgba(0, 102, 255, 0.18);
  box-shadow: 0 6px 16px rgba(0, 102, 255, 0.06);
}
.fc-item.is-featured {
  border-color: rgba(255, 92, 141, 0.18);
  background: #fff8fb;
}
.fc-avatar {
  width: 34px; height: 34px; min-width: 34px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 900; color: #fff;
  border: 2px solid #fff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  padding: 0;
}
.fc-avatar img { width: 100%; height: 100%; object-fit: cover; }
.fc-avatar-button { cursor: pointer; }
.fc-name-button {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.fc-name-button:hover { color: var(--violet); }
.fc-body { flex: 1; min-width: 0; }
.fc-meta {
  display: flex; justify-content: space-between; align-items: center;
  gap: 8px; margin-bottom: 6px;
}
.fc-name { font-size: 13px; font-weight: 850; color: var(--ink); }
.fc-author-badge {
  display: inline-flex; align-items: center; min-height: 16px;
  margin-left: 5px; padding: 0 6px; border-radius: 999px;
  color: var(--rose); background: rgba(255, 92, 141, 0.1);
  font-size: 10px; font-weight: 900;
}
.fc-time { font-size: 11px; color: var(--muted); white-space: nowrap; }
.fc-text { margin: 0; font-size: 13px; line-height: 1.6; color: #3f4658; word-break: break-word; }
.fc-actions { display: flex; gap: 8px; margin-top: 8px; }
.fc-actions button {
  min-height: 24px; background: #fff; border: 1px solid var(--line);
  border-radius: 999px; padding: 0 8px; font-size: 11px;
  color: var(--muted); cursor: pointer; display: flex;
  align-items: center; gap: 3px; font-weight: 800; transition: all 0.2s;
}
.fc-actions button:hover {
  color: var(--violet); border-color: rgba(0, 102, 255, 0.18);
  background: var(--surface-2);
}
.fc-actions button .material-symbols-rounded { font-size: 14px; }
.fc-reply {
  margin-top: 10px;
  padding: 10px 12px;
  border-left: 3px solid rgba(0, 102, 255, 0.18);
  border-radius: 0 12px 12px 0;
  background: rgba(235, 244, 255, 0.62);
  color: #4b5570;
  font-size: 12px;
  line-height: 1.55;
}
.fc-reply strong {
  color: var(--violet);
  font-weight: 900;
}

/* Popular story badges */
.popular-story-badges {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.popular-story-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  padding: 4px 10px;
  border-radius: 999px;
}
.popular-story-label .material-symbols-rounded {
  font-size: 16px;
  color: var(--yellow, #ffc857);
}

/* Story report button */
.story-report-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
  flex-shrink: 0;
}
.story-report-btn:hover {
  background: rgba(255, 92, 141, 0.08);
  color: var(--rose);
}
.story-report-btn .material-symbols-rounded {
  font-size: 20px;
}
.story-like-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.story-like-button.active,
.story-like-button:hover {
  color: var(--rose);
}

/* Report reason options */
.report-reason-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  transition: all 0.2s ease;
}
.report-reason-option:hover {
  border-color: rgba(0, 102, 255, 0.25);
  background: rgba(0, 102, 255, 0.02);
}
.report-reason-option.active {
  border-color: var(--violet);
  background: rgba(0, 102, 255, 0.04);
  color: var(--violet);
}
</style>
