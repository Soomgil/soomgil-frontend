<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { communityApi } from "@/api/community.api";
import { userApi } from "@/api/user.api";
import type {
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  ReportReason,
  ReportReasonCode,
} from "@/types/community";
import AppShell from "@/components/layout/AppShell.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorState from "@/components/common/ErrorState.vue";
import LoadingState from "@/components/common/LoadingState.vue";
import StoryWriteModal from "@/components/community/StoryWriteModal.vue";
import { useModal } from "@/composables/useModal";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth.store";

const router = useRouter();
const route = useRoute();
const toast = useToast();
const auth = useAuthStore();

interface StoryView {
  id: string;
  author: string;
  authorUserId: string | null;
  authorProfileImageUrl: string | null;
  avatar: string;
  location: string;
  title: string;
  image: string;
  photos: string[];
  likes: number;
  likedByMe: boolean;
  comments: number;
  tags: string[];
  summary: string;
  content: string;
}

const FALLBACK_IMAGE = "/images/랜딩페이지/korea_hero.png";
const posts = ref<CommunityPostSummary[]>([]);
const loading = ref(true);
const loadError = ref("");
const profileImageRequests = new Map<string, Promise<string | null>>();

const searchQuery = ref("");
const currentPage = ref(1);
const selectedPost = ref<CommunityPostDetail | null>(null);
const storyWriteModal = useModal();

function getProfileImage(userId: string): Promise<string | null> {
  const cached = profileImageRequests.get(userId);
  if (cached) return cached;
  const request = userApi
    .getUserProfile(userId)
    .then((profile) => profile.profileImageUrl ?? null)
    .catch(() => null);
  profileImageRequests.set(userId, request);
  return request;
}

async function enrichPostAuthors(items: Array<CommunityPostSummary | CommunityPostDetail>) {
  await Promise.all(
    items.map(async (post) => {
      if (!post.publishedBy || post.publishedBy.profileImageUrl) return;
      post.publishedBy.profileImageUrl = await getProfileImage(post.publishedBy.id);
    }),
  );
}

async function enrichCommentAuthors(items: CommunityComment[]) {
  await Promise.all(
    items.map(async (comment) => {
      if (!comment.author || comment.author.profileImageUrl) return;
      comment.author.profileImageUrl = await getProfileImage(comment.author.id);
    }),
  );
}

function openUserProfile(userId: string | null) {
  if (userId) router.push(`/mypage/${userId}`);
}

const PER_PAGE = 8;

function toStoryView(post: CommunityPostSummary | CommunityPostDetail): StoryView {
  const detail = "snapshot" in post ? post : null;
  const firstPlace = detail?.snapshot?.days?.flatMap((day) => day.items ?? [])[0];
  const image =
    post.coverMedia?.publicUrl ??
    detail?.media?.find((media) => media.publicUrl)?.publicUrl ??
    firstPlace?.thumbnailUrl ??
    FALLBACK_IMAGE;
  const photos =
    detail?.media?.flatMap((media) => (media.publicUrl ? [media.publicUrl] : [])) ?? [];
  return {
    id: post.id,
    author: post.publishedBy?.displayName ?? "숨길 여행자",
    authorUserId: post.publishedBy?.id ?? null,
    authorProfileImageUrl: post.publishedBy?.profileImageUrl ?? null,
    avatar: (post.publishedBy?.displayName ?? "?").slice(0, 1),
    location: firstPlace?.address ?? firstPlace?.placeName ?? "여행 기록",
    title: post.title,
    image,
    photos: photos.length > 0 ? photos : [image],
    likes: post.likeCount ?? 0,
    likedByMe: post.likedByMe === true,
    comments: post.commentCount ?? 0,
    tags: post.hashtags ?? [],
    summary: post.summary ?? "",
    content: post.summary ?? "",
  };
}

const stories = computed(() =>
  posts.value.map((post) =>
    selectedPost.value?.id === post.id ? toStoryView(selectedPost.value) : toStoryView(post),
  ),
);
const selectedStory = computed(() => (selectedPost.value ? toStoryView(selectedPost.value) : null));
const storyPhotoIndexes = ref<Record<string, number>>({});

function currentStoryPhoto(story: StoryView): string {
  const index = storyPhotoIndexes.value[story.id] ?? 0;
  return story.photos[index] ?? story.image;
}

function moveStoryPhoto(story: StoryView, direction: -1 | 1) {
  if (story.photos.length < 2) return;
  const current = storyPhotoIndexes.value[story.id] ?? 0;
  storyPhotoIndexes.value = {
    ...storyPhotoIndexes.value,
    [story.id]: (current + direction + story.photos.length) % story.photos.length,
  };
}

const filteredStories = computed(() => {
  if (!searchQuery.value) return stories.value;
  const q = searchQuery.value.toLowerCase();
  return stories.value.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.author.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );
});

const popularStories = computed(() =>
  [...stories.value].sort((a, b) => b.likes - a.likes).slice(0, 3),
);

const popularIndex = ref(0);
const currentPopular = computed(
  () => popularStories.value[popularIndex.value] ?? popularStories.value[0] ?? null,
);

const totalPages = computed(() => Math.ceil(filteredStories.value.length / PER_PAGE));

const pagedStories = computed(() => {
  const start = (currentPage.value - 1) * PER_PAGE;
  return filteredStories.value.slice(start, start + PER_PAGE);
});

async function loadPosts() {
  loading.value = true;
  loadError.value = "";
  try {
    const response = await communityApi.getPosts({ page: 0, size: 100 });
    await enrichPostAuthors(response.items);
    posts.value = response.items;
    const requestedStoryId = typeof route.query.story === "string" ? route.query.story : null;
    const requestedStory = requestedStoryId
      ? stories.value.find((story) => story.id === requestedStoryId)
      : null;
    if (requestedStory) await openStory(requestedStory);
  } catch {
    loadError.value = "커뮤니티 게시글을 불러오지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

async function openStory(story: StoryView) {
  try {
    const [post, commentPage] = await Promise.all([
      communityApi.getPost(story.id),
      communityApi.getComments(story.id),
    ]);
    await Promise.all([enrichPostAuthors([post]), enrichCommentAuthors(commentPage.items)]);
    selectedPost.value = post;
    apiComments.value = commentPage.items;
    visibleStoryIdx.value = Math.max(0, stories.value.findIndex((item) => item.id === story.id));
  } catch {
    toast.error("여행기 상세를 불러오지 못했습니다.");
  }
}

function closeModal() {
  selectedPost.value = null;
  apiComments.value = [];
}

function goPage(page: number) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
}

function scrollToLatest() {
  const target = document.getElementById("latest-stories");
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function prevPopular() {
  popularIndex.value =
    (popularIndex.value - 1 + popularStories.value.length) % popularStories.value.length;
}

function nextPopular() {
  popularIndex.value = (popularIndex.value + 1) % popularStories.value.length;
}

const apiComments = ref<CommunityComment[]>([]);
const comments = computed(() => {
  const commentsById = new Map(apiComments.value.map((comment) => [comment.id, comment]));
  return apiComments.value.map((comment) => ({
    id: comment.id,
    authorUserId: comment.author?.id ?? null,
    profileImageUrl: comment.author?.profileImageUrl ?? null,
    avatar: (comment.author?.displayName ?? "?").slice(0, 1),
    name: comment.author?.displayName ?? "사용자",
    color: "var(--violet)",
    time: new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(comment.createdAt),
    ),
    text: comment.content ?? "삭제된 댓글입니다.",
    featured: false,
    depth: comment.depth,
    parentName: comment.parentCommentId
      ? commentsById.get(comment.parentCommentId)?.author?.displayName ?? "댓글 작성자"
      : null,
  }));
});

function openWriter() {
  if (!auth.isAuthenticated) {
    void router.push({ name: "Login", query: { redirect: "/community" } });
    return;
  }
  storyWriteModal.open();
}

const overlayComment = ref("");
const replyTarget = ref<{ id: string; name: string } | null>(null);
const reportModal = ref(false);
const reportReason = ref<ReportReasonCode | "">("");
const reportDetail = ref("");
const reportReasons = ref<ReportReason[]>([]);

async function openReport() {
  reportReason.value = "";
  reportDetail.value = "";
  reportModal.value = true;
  try {
    reportReasons.value = await communityApi.getReportReasons();
  } catch {
    reportModal.value = false;
    toast.error("신고 사유를 불러오지 못했습니다.");
  }
}

async function submitReport() {
  if (!selectedPost.value || !reportReason.value) return;
  try {
    await communityApi.createReport({
      targetType: "POST",
      targetId: selectedPost.value.id,
      reasonCode: reportReason.value,
      detail: reportDetail.value.trim() || null,
    });
    reportModal.value = false;
    toast.success("신고가 접수되었습니다.");
  } catch {
    toast.error("신고를 접수하지 못했습니다.");
  }
}

async function submitComment() {
  const content = overlayComment.value.trim();
  if (!selectedPost.value || !content) return;
  try {
    const comment = await communityApi.createComment(
      selectedPost.value.id,
      content,
      replyTarget.value?.id,
    );
    apiComments.value.push(comment);
    selectedPost.value.commentCount += 1;
    overlayComment.value = "";
    replyTarget.value = null;
  } catch {
    toast.error("댓글을 등록하지 못했습니다.");
  }
}

async function deleteComment(commentId: string) {
  if (!selectedPost.value || !window.confirm("댓글을 삭제할까요?")) return;
  try {
    await communityApi.deleteComment(selectedPost.value.id, commentId);
    apiComments.value = apiComments.value.filter((comment) => comment.id !== commentId);
    selectedPost.value.commentCount = Math.max(0, selectedPost.value.commentCount - 1);
  } catch {
    toast.error("댓글을 삭제하지 못했습니다.");
  }
}

async function editStory(story: StoryView) {
  const title = window.prompt("여행기 제목", story.title)?.trim();
  if (!title) return;
  const summary = window.prompt("여행기 소개", story.summary)?.trim() ?? story.summary;
  try {
    const updated = await communityApi.updatePost(story.id, { title, summary });
    const index = posts.value.findIndex((post) => post.id === story.id);
    if (index >= 0) posts.value[index] = updated;
    selectedPost.value = updated;
    toast.success("여행기를 수정했습니다.");
  } catch {
    toast.error("여행기를 수정하지 못했습니다.");
  }
}

async function deleteStory(story: StoryView) {
  if (!window.confirm("여행기를 삭제할까요?")) return;
  try {
    await communityApi.deletePost(story.id);
    posts.value = posts.value.filter((post) => post.id !== story.id);
    closeModal();
    toast.success("여행기를 삭제했습니다.");
  } catch {
    toast.error("여행기를 삭제하지 못했습니다.");
  }
}

const likingPostIds = ref(new Set<string>());
async function toggleStoryLike(story: StoryView) {
  if (likingPostIds.value.has(story.id)) return;
  likingPostIds.value = new Set(likingPostIds.value).add(story.id);
  try {
    const summary = posts.value.find((post) => post.id === story.id);
    const liked = summary?.likedByMe ?? story.likedByMe;
    const result = liked
      ? await communityApi.unlikePost(story.id)
      : await communityApi.likePost(story.id);
    if (summary) {
      summary.likedByMe = result.liked;
      summary.likeCount = result.likeCount;
    }
    if (selectedPost.value?.id === result.postId) {
      selectedPost.value.likedByMe = result.liked;
      selectedPost.value.likeCount = result.likeCount;
    }
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } }).response?.status;
    toast.error(
      status === 401 ? "좋아요를 누르려면 로그인이 필요합니다." : "좋아요를 반영하지 못했습니다.",
    );
  } finally {
    const next = new Set(likingPostIds.value);
    next.delete(story.id);
    likingPostIds.value = next;
  }
}

async function retripStory(story: StoryView) {
  try {
    const trip = await communityApi.retrip(story.id);
    toast.success("새 여행방으로 가져왔습니다.");
    closeModal();
    await router.push(`/trips/${trip.id}/route`);
  } catch (error: unknown) {
    const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
    toast.error(detail || "여행기를 가져오지 못했습니다.");
  }
}

async function shareStory(story: StoryView) {
  try {
    const shared = await communityApi.rotateShareToken(story.id);
    await navigator.clipboard.writeText(shared.shareUrl);
    toast.success("공유 링크를 복사했습니다.");
  } catch (error: unknown) {
    const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
    toast.error(detail || "UNLISTED 여행기만 공유 링크를 만들 수 있습니다.");
  }
}

function handlePostPublished(post: CommunityPostDetail) {
  posts.value.unshift(post);
  currentPage.value = 1;
}
const scrollGuideVisible = ref(true);
const visibleStoryIdx = ref(0);

const visibleStory = computed(() => stories.value[visibleStoryIdx.value] || stories.value[0]);

let visibleStoryRequest = 0;
async function selectVisibleStory(index: number) {
  const story = stories.value[index];
  if (!story || selectedPost.value?.id === story.id) return;
  const request = ++visibleStoryRequest;
  try {
    const [post, commentPage] = await Promise.all([
      communityApi.getPost(story.id),
      communityApi.getComments(story.id),
    ]);
    await Promise.all([enrichPostAuthors([post]), enrichCommentAuthors(commentPage.items)]);
    if (request !== visibleStoryRequest) return;
    selectedPost.value = post;
    apiComments.value = commentPage.items;
  } catch {
    toast.error("다음 여행기를 불러오지 못했습니다.");
  }
}

function onFeedScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (scrollGuideVisible.value && el.scrollTop > 30) {
    scrollGuideVisible.value = false;
  }
  // Determine which story is visible based on scroll position
  const articles = el.querySelectorAll(".story-post");
  const centerY = el.scrollTop + el.clientHeight / 2;
  articles.forEach((article, idx) => {
    const top = (article as HTMLElement).offsetTop;
    const bottom = top + (article as HTMLElement).offsetHeight;
    if (centerY >= top && centerY < bottom) {
      if (visibleStoryIdx.value !== idx) {
        visibleStoryIdx.value = idx;
        void selectVisibleStory(idx);
      }
    }
  });
}

watch(searchQuery, () => {
  currentPage.value = 1;
});
onMounted(async () => {
  const q = typeof route.query.q === "string" ? route.query.q.trim() : "";
  if (q) searchQuery.value = q;
  await loadPosts();
});
</script>

<template>
  <AppShell>
    <main>
      <section class="section community-page">
        <div class="community-hero-header">
          <div class="community-hero-text">
            <p class="eyebrow community-hero-eyebrow">
              <span class="material-symbols-rounded">explore</span>
              Trip Community
            </p>
            <h1 class="community-hero-title">
              <span class="community-hero-gradient">여행의 기록</span>을 나누고,<br />
              새로운 <span class="community-hero-gradient">루트</span>를 발견하세요
            </h1>
            <p class="lead community-hero-lead">
              전 세계 여행자들이 직접 다녀온 생생한 여행기와 검증된 루트를 탐색할 수 있습니다.
            </p>
          </div>
          <div class="community-hero-actions">
            <button
              type="button"
              class="community-pill community-pill-ghost"
              @click="scrollToLatest"
            >
              <span class="material-symbols-rounded">auto_stories</span>
              여행기 둘러보기
            </button>
            <button
              type="button"
              class="community-pill community-pill-ghost"
              @click="openWriter"
            >
              <span class="material-symbols-rounded">add_road</span>
              여행기 작성
            </button>
          </div>
        </div>

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

        <div v-if="!loading && !loadError && stories.length" class="community-content-container">
          <section v-if="currentPopular" class="today-pick-section">
            <div class="today-pick-grid">
              <div class="polaroid-wrap">
                <button
                  type="button"
                  class="polaroid-card"
                  @click="openStory(currentPopular)"
                >
                  <span class="polaroid-tape" aria-hidden="true"></span>
                  <div class="polaroid-image">
                    <img :src="currentPopular.image" :alt="currentPopular.title" />
                  </div>
                  <div class="polaroid-caption">
                    <h3 class="polaroid-title">{{ currentPopular.title }}</h3>
                    <p class="polaroid-author">
                      <span class="material-symbols-rounded">place</span>
                      <span>{{ currentPopular.author }} · {{ currentPopular.location }}</span>
                    </p>
                    <div class="polaroid-stats">
                      <span class="polaroid-stat">
                        <span class="material-symbols-rounded">favorite</span>
                        {{ currentPopular.likes }}
                      </span>
                      <span class="polaroid-stat">
                        <span class="material-symbols-rounded">chat_bubble</span>
                        {{ currentPopular.comments }}
                      </span>
                    </div>
                  </div>
                </button>
              </div>

              <div class="today-pick-info">
                <p class="today-pick-label">
                  <span class="material-symbols-rounded">local_fire_department</span>
                  Today Pick
                </p>
                <h2 class="today-pick-title">{{ currentPopular.title }}</h2>
                <p class="today-pick-summary">
                  {{ currentPopular.summary || currentPopular.content }}
                </p>
                <div v-if="currentPopular.tags.length" class="today-pick-tags">
                  <span
                    v-for="tag in currentPopular.tags.slice(0, 4)"
                    :key="tag"
                    class="tag tag-soft"
                    >#{{ tag }}</span
                  >
                </div>
                <div class="today-pick-actions">
                  <button
                    type="button"
                    class="btn primary today-pick-cta"
                    @click="openStory(currentPopular)"
                  >
                    자세히 보기
                    <span class="material-symbols-rounded">arrow_forward</span>
                  </button>
                  <div class="today-pick-controls">
                    <button
                      class="carousel-btn prev-btn"
                      type="button"
                      aria-label="이전 여행기"
                      @click="prevPopular"
                    >
                      <span class="material-symbols-rounded">chevron_left</span>
                    </button>
                    <button
                      class="carousel-btn next-btn"
                      type="button"
                      aria-label="다음 여행기"
                      @click="nextPopular"
                    >
                      <span class="material-symbols-rounded">chevron_right</span>
                    </button>
                  </div>
                </div>
                <div class="today-pick-dots">
                  <button
                    v-for="(story, idx) in popularStories"
                    :key="story.id"
                    type="button"
                    class="today-pick-dot"
                    :class="{ active: idx === popularIndex }"
                    :aria-label="`${idx + 1}번째 인기 여행기로 이동`"
                    :aria-pressed="idx === popularIndex"
                    @click="popularIndex = idx"
                  ></button>
                </div>
              </div>
            </div>
          </section>

          <section class="latest-stories-section" id="latest-stories">
            <div class="latest-stories-header">
              <div class="latest-stories-title">
                <span class="material-symbols-rounded latest-stories-icon">schedule</span>
                <div>
                  <p class="eyebrow latest-stories-eyebrow">Latest</p>
                  <h2>최신 여행기</h2>
                </div>
              </div>
              <div class="latest-stories-tools">
                <label class="community-story-search search-box">
                  <input
                    v-model="searchQuery"
                    type="search"
                    placeholder="여행기 검색"
                    aria-label="여행기 검색"
                  />
                  <button
                    class="search-box__button"
                    type="button"
                    aria-label="여행기 검색"
                  >
                    <span class="material-symbols-rounded" aria-hidden="true">search</span>
                  </button>
                </label>
                <button
                  type="button"
                  class="filter-pill"
                  aria-label="필터"
                  title="필터"
                >
                  <span class="material-symbols-rounded">tune</span>
                </button>
              </div>
            </div>

            <div class="story-card-grid" data-stories-list>
              <article
                v-for="story in pagedStories"
                :key="story.id"
                class="story-tile"
                @click.prevent="openStory(story)"
              >
                <div class="story-tile-image-wrap">
                  <img class="story-tile-image" :src="story.image" :alt="story.title" />
                  <button
                    type="button"
                    class="story-tile-like"
                    :class="{ active: story.likedByMe }"
                    :disabled="likingPostIds.has(story.id)"
                    :aria-pressed="story.likedByMe"
                    aria-label="좋아요"
                    @click.stop="toggleStoryLike(story)"
                  >
                    <span class="material-symbols-rounded">favorite</span>
                  </button>
                </div>
                <div class="story-tile-body">
                  <button
                    type="button"
                    class="story-tile-author"
                    @click.stop="openUserProfile(story.authorUserId)"
                  >
                    <span class="story-tile-avatar">
                      <img
                        v-if="story.authorProfileImageUrl"
                        :src="story.authorProfileImageUrl"
                        :alt="`${story.author} 프로필 사진`"
                      />
                      <span v-else>{{ story.avatar }}</span>
                    </span>
                    <span class="story-tile-author-name">
                      <strong>{{ story.author }}</strong>
                      <span class="muted small">{{ story.location }}</span>
                    </span>
                  </button>
                  <h3 class="story-tile-title">{{ story.title }}</h3>
                  <p class="story-tile-summary">{{ story.summary }}</p>
                  <div v-if="story.tags.length" class="story-tile-tags">
                    <span
                      v-for="tag in story.tags.slice(0, 3)"
                      :key="tag"
                      class="tag tag-soft"
                      >#{{ tag }}</span
                    >
                  </div>
                  <div class="story-tile-footer">
                    <span class="story-tile-stat">
                      <span class="material-symbols-rounded">favorite</span>
                      {{ story.likes }}
                    </span>
                    <span class="story-tile-stat">
                      <span class="material-symbols-rounded">chat_bubble</span>
                      {{ story.comments }}
                    </span>
                    <span
                      class="story-tile-stat story-tile-stat-end"
                      aria-hidden="true"
                    >
                      <span class="material-symbols-rounded">bookmark</span>
                    </span>
                  </div>
                </div>
              </article>
            </div>

            <div v-if="totalPages > 1" class="community-pagination">
              <button
                type="button"
                class="pg-btn pg-arrow"
                :disabled="currentPage === 1"
                aria-label="이전 페이지"
                @click="goPage(currentPage - 1)"
              >
                <span class="material-symbols-rounded">chevron_left</span>
              </button>
              <button
                v-for="page in totalPages"
                :key="page"
                type="button"
                class="pg-btn pg-num"
                :class="{ active: page === currentPage }"
                :aria-label="`${page} 페이지`"
                :aria-current="page === currentPage ? 'page' : undefined"
                @click="goPage(page)"
              >
                {{ page }}
              </button>
              <button
                type="button"
                class="pg-btn pg-arrow"
                :disabled="currentPage === totalPages"
                aria-label="다음 페이지"
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
                  <span
                    class="material-symbols-rounded"
                    style="vertical-align: middle; color: var(--rose); margin-right: 6px"
                    >dynamic_feed</span
                  >최신 여행 이야기
                </h2>
              </div>
            </div>

            <div
              class="story-feed-window"
              aria-label="스크롤 가능한 여행기 피드"
              id="overlay-feed-stories"
              @scroll="onFeedScroll"
            >
              <article
                v-for="story in selectedStory ? [selectedStory] : []"
                :key="story.id"
                :data-story-id="story.id"
                class="story-post"
                style="margin-bottom: 32px"
              >
                <div
                  class="story-post-head"
                  style="
                    padding: 16px 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 12px;
                  "
                >
                  <div
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      width: 100%;
                    "
                  >
                    <div
                      class="story-author"
                      style="display: flex; align-items: center; gap: 10px; cursor: pointer"
                      @click="openUserProfile(story.authorUserId)"
                    >
                      <div
                        class="fc-avatar"
                        style="width: 40px; height: 40px; background: var(--violet)"
                      >
                        <img
                          v-if="story.authorProfileImageUrl"
                          :src="story.authorProfileImageUrl"
                          :alt="`${story.author} 프로필 사진`"
                        />
                        <span v-else>{{ story.avatar }}</span>
                      </div>
                      <div>
                        <strong style="font-size: 15px; color: var(--violet)">{{
                          story.author
                        }}</strong>
                        <span class="small muted" style="display: block">{{ story.location }}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="story-report-btn"
                      aria-label="게시글 신고"
                      title="신고"
                      @click.stop="openReport"
                    >
                      <span class="material-symbols-rounded">campaign</span>
                    </button>
                  </div>
                </div>
                <div style="overflow: hidden; display: block; position: relative">
                  <button
                    v-if="story.photos.length > 1"
                    type="button"
                    class="feed-photo-nav carousel-btn prev-btn prev"
                    aria-label="이전 사진"
                    @click="moveStoryPhoto(story, -1)"
                  >
                    <span class="material-symbols-rounded">chevron_left</span>
                  </button>
                  <img
                    :alt="story.title"
                    :src="currentStoryPhoto(story)"
                    style="width: 100%; transition: transform 0.5s ease; display: block"
                  />
                  <button
                    v-if="story.photos.length > 1"
                    type="button"
                    class="feed-photo-nav carousel-btn next-btn next"
                    aria-label="다음 사진"
                    @click="moveStoryPhoto(story, 1)"
                  >
                    <span class="material-symbols-rounded">chevron_right</span>
                  </button>
                  <span v-if="story.photos.length > 1" class="feed-photo-count"
                    >{{ (storyPhotoIndexes[story.id] ?? 0) + 1 }} / {{ story.photos.length }}</span
                  >
                </div>
                <div class="story-body" style="padding: 22px 24px">
                  <h3 style="font-size: 20px; line-height: 1.4; margin: 0 0 12px">
                    {{ story.title }}
                  </h3>
                  <p class="muted" style="font-size: 15px; line-height: 1.7; margin: 0 0 16px">
                    {{ story.summary }}
                  </p>
                  <div class="tag-row" style="margin-bottom: 12px">
                    <span v-for="tag in story.tags" :key="tag" class="tag">{{ tag }}</span>
                  </div>
                  <p style="font-size: 14px; line-height: 1.7; color: var(--muted)">
                    {{ story.content }}
                  </p>
                  <div
                    style="
                      margin-top: 16px;
                      display: flex;
                      align-items: center;
                      gap: 20px;
                      color: var(--muted);
                      font-size: 14px;
                    "
                  >
                    <button
                      type="button"
                      class="story-like-button"
                      :class="{ active: story.likedByMe }"
                      :disabled="likingPostIds.has(story.id)"
                      :aria-pressed="story.likedByMe"
                      @click="toggleStoryLike(story)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 20px">favorite</span>
                      {{ story.likes }}
                    </button>
                    <span style="display: flex; align-items: center; gap: 4px"
                      ><span
                        class="material-symbols-rounded"
                        style="font-size: 20px; color: var(--violet)"
                        >chat_bubble</span
                      >
                      {{ story.comments }}</span
                    >
                    <button type="button" class="story-like-button" @click="retripStory(story)">
                      <span class="material-symbols-rounded" style="font-size: 20px"
                        >content_copy</span
                      >
                      리트립
                    </button>
                    <button type="button" class="story-like-button" @click="shareStory(story)">
                      <span class="material-symbols-rounded" style="font-size: 20px">share</span>
                      공유
                    </button>
                    <template v-if="story.authorUserId === auth.user?.id">
                      <button type="button" class="story-like-button" @click="editStory(story)">
                        <span class="material-symbols-rounded" style="font-size: 20px">edit</span>
                        수정
                      </button>
                      <button type="button" class="story-like-button" @click="deleteStory(story)">
                        <span class="material-symbols-rounded" style="font-size: 20px">delete</span>
                        삭제
                      </button>
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
                <span
                  class="guide-text"
                  style="font-weight: 800; font-size: 16px; letter-spacing: -0.02em"
                  >위로 스와이프하여 탐색</span
                >
              </div>
            </div>
          </section>

          <aside class="feed-sidebar" aria-label="사이드바 정보 패널">
            <div class="widget-card feed-comment-widget">
              <div class="feed-comment-header">
                <h3>
                  <span
                    class="material-symbols-rounded"
                    style="font-size: 20px; color: var(--violet)"
                    >forum</span
                  >
                  댓글
                  <span class="comment-count-badge">{{ visibleStory.comments }}</span>
                </h3>
                <p
                  class="muted"
                  style="
                    font-size: 12px;
                    margin: 4px 0 0;
                    line-height: 1.4;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  "
                >
                  <span style="display: flex; align-items: center; gap: 3px"
                    ><span
                      class="material-symbols-rounded"
                      style="font-size: 14px; color: var(--rose)"
                      >favorite</span
                    >
                    {{ visibleStory.likes }}</span
                  >
                  <span>{{ visibleStory.title }}</span>
                </p>
              </div>

              <div class="feed-comment-scroll" id="overlay-comment-scroll">
                <div
                  v-for="comment in comments"
                  :key="comment.id"
                  class="fc-item"
                  :class="{ 'is-featured': comment.featured, 'is-reply': comment.depth === 1 }"
                >
                  <button
                    class="fc-avatar fc-avatar-button"
                    type="button"
                    :style="{ background: comment.color }"
                    :aria-label="`${comment.name} 프로필 보기`"
                    @click="openUserProfile(comment.authorUserId)"
                  >
                    <img
                      v-if="comment.profileImageUrl"
                      :src="comment.profileImageUrl"
                      :alt="`${comment.name} 프로필 사진`"
                    />
                    <span v-else>{{ comment.avatar }}</span>
                  </button>
                  <div class="fc-body">
                    <div class="fc-meta">
                      <div>
                        <button
                          class="fc-name fc-name-button"
                          type="button"
                          @click="openUserProfile(comment.authorUserId)"
                        >
                          {{ comment.name }}
                        </button>
                        <span v-if="comment.featured" class="fc-author-badge">인기</span>
                      </div>
                      <span class="fc-time">{{ comment.time }}</span>
                    </div>
                    <span v-if="comment.depth === 1" class="fc-reply-label"><span class="material-symbols-rounded">subdirectory_arrow_right</span>{{ comment.parentName }}님에게 보낸 답글</span>
                    <p class="fc-text">{{ comment.text }}</p>
                    <div class="fc-actions">
                      <button
                        type="button"
                        @click="replyTarget = { id: comment.id, name: comment.name }"
                      >
                        <span class="material-symbols-rounded">reply</span>답글
                      </button>
                      <button
                        v-if="comment.authorUserId === auth.user?.id"
                        type="button"
                        @click="deleteComment(comment.id)"
                      >
                        <span class="material-symbols-rounded">delete</span>삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="feed-comment-input-area">
                <div
                  v-if="replyTarget"
                  class="small muted"
                  style="display: flex; justify-content: space-between; padding: 0 4px 6px"
                >
                  <span>{{ replyTarget.name }}님에게 답글</span
                  ><button type="button" @click="replyTarget = null">취소</button>
                </div>
                <div class="feed-comment-composer">
                  <div class="feed-comment-input-wrap">
                    <input
                      v-model="overlayComment"
                      type="text"
                      placeholder="댓글을 남겨보세요..."
                    />
                    <button
                      class="comment-submit-btn"
                      type="button"
                      aria-label="댓글 등록"
                      :disabled="!overlayComment.trim()"
                      @click="submitComment"
                    >
                      <span class="material-symbols-rounded" style="font-size: 16px">send</span>
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
    <div
      v-if="reportModal"
      class="story-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="게시글 신고"
    >
      <div class="story-overlay-backdrop" @click="reportModal = false"></div>
      <div class="story-overlay-panel" style="width: min(96vw, 520px); max-height: 92vh">
        <button
          class="story-overlay-close"
          type="button"
          aria-label="닫기"
          @click="reportModal = false"
        >
          <span class="material-symbols-rounded">close</span>
        </button>
        <div style="padding: 36px 32px; overflow-y: auto; max-height: calc(92vh - 20px)">
          <h2
            style="
              font-size: 20px;
              font-weight: 850;
              color: var(--ink);
              margin: 0 0 8px;
              display: flex;
              align-items: center;
              gap: 8px;
            "
          >
            <span class="material-symbols-rounded" style="font-size: 24px; color: var(--rose)"
              >campaign</span
            >게시글 신고
          </h2>
          <p style="font-size: 13px; color: var(--muted); margin: 0 0 24px; line-height: 1.5">
            신고 사유를 선택해주세요. 검토 후 조치됩니다.
          </p>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px">
            <label
              v-for="reason in reportReasons"
              :key="reason.code"
              class="report-reason-option"
              :class="{ active: reportReason === reason.code }"
            >
              <input
                type="radio"
                v-model="reportReason"
                :value="reason.code"
                style="accent-color: var(--violet); width: 16px; height: 16px"
              />
              <span>{{ reason.displayName }}</span>
            </label>
          </div>

          <div style="margin-bottom: 28px">
            <label
              style="
                display: block;
                font-size: 13px;
                font-weight: 800;
                color: var(--ink);
                margin-bottom: 8px;
              "
              >상세 내용 (선택)</label
            >
            <textarea
              v-model="reportDetail"
              rows="4"
              placeholder="구체적인 사유를 적어주시면 더 빠르게 처리할 수 있습니다."
              style="
                width: 100%;
                border: 1px solid var(--line);
                border-radius: 14px;
                padding: 12px 16px;
                font-size: 14px;
                outline: none;
                resize: vertical;
                font-family: inherit;
                line-height: 1.6;
                box-sizing: border-box;
                transition: border-color 0.2s;
              "
              onfocus="this.style.borderColor = 'var(--violet)'"
              onblur="this.style.borderColor = 'var(--line)'"
            ></textarea>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end">
            <button
              type="button"
              style="
                padding: 12px 24px;
                border-radius: 999px;
                border: 1px solid var(--line);
                background: #fff;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                color: var(--ink);
                transition: all 0.2s;
              "
              @click="reportModal = false"
            >
              취소
            </button>
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
    <StoryWriteModal
      v-if="storyWriteModal.isOpen.value"
      @close="storyWriteModal.close()"
      @published="handlePostPublished"
    />
  </AppShell>
</template>

<style scoped>
/* ===== Page layout ===== */
.community-page {
  padding-top: 32px;
}
.section-title.compact-title {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

/* ===== Hero (text-only, 다른 페이지 레이아웃과 일관) ===== */
.community-hero-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  margin-bottom: 48px;
  flex-wrap: wrap;
  padding: 0 4px;
}
.community-hero-text {
  flex: 1 1 480px;
  min-width: 0;
}
.community-hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
  font-size: 12px;
  letter-spacing: 0.12em;
}
.community-hero-eyebrow .material-symbols-rounded {
  font-size: 16px;
}
.community-hero-title {
  margin: 0 0 18px;
  font-size: clamp(32px, 4.2vw, 52px);
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: 900;
  color: var(--ink);
  word-break: keep-all;
}
.community-hero-gradient {
  background: linear-gradient(135deg, var(--violet) 0%, var(--blue) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.community-hero-lead {
  margin: 0;
  max-width: 560px;
  font-size: clamp(15px, 1.2vw, 18px);
  line-height: 1.75;
  color: var(--muted);
  word-break: keep-all;
}
.community-hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.community-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  white-space: nowrap;
}
.community-pill .material-symbols-rounded {
  font-size: 18px;
}
.community-pill-primary {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  box-shadow: 0 10px 24px rgba(0, 102, 255, 0.22);
}
.community-pill-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(0, 102, 255, 0.28);
}
.community-pill-ghost {
  background: #fff;
  color: var(--ink);
  border-color: var(--line);
  box-shadow: 0 4px 12px rgba(0, 50, 150, 0.05);
}
.community-pill-ghost:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 102, 255, 0.3);
  color: var(--violet);
  box-shadow: 0 10px 22px rgba(0, 102, 255, 0.1);
}

/* ===== Content container ===== */
.community-content-container {
  padding: clamp(24px, 2.6vw, 36px);
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(246, 249, 255, 0.85));
  border: 1px solid rgba(227, 234, 244, 0.8);
  box-shadow:
    0 24px 48px rgba(0, 50, 150, 0.06),
    0 6px 16px rgba(0, 102, 255, 0.03);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

/* ===== Today Pick ===== */
.today-pick-section {
  padding-bottom: clamp(32px, 4vw, 56px);
  margin-bottom: clamp(32px, 4vw, 56px);
  border-bottom: 1px dashed rgba(0, 102, 255, 0.18);
}
.today-pick-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(28px, 4vw, 56px);
  align-items: center;
}
.polaroid-wrap {
  display: flex;
  justify-content: center;
  perspective: 1600px;
  padding: 28px 8px 16px;
}
.polaroid-card {
  position: relative;
  display: block;
  width: 100%;
  max-width: 360px;
  padding: 16px 16px 24px;
  background: #fff;
  border-radius: 4px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 22px 40px rgba(0, 30, 90, 0.18),
    0 10px 20px rgba(0, 30, 90, 0.1);
  transform: rotate(-4deg);
  transition: transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 0.45s ease;
  cursor: pointer;
  text-align: left;
  border: 0;
}
.polaroid-card:hover {
  transform: rotate(-1.5deg) translateY(-6px);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 30px 56px rgba(0, 30, 90, 0.22),
    0 14px 26px rgba(0, 30, 90, 0.12);
}
.polaroid-tape {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%) rotate(-4deg);
  width: 92px;
  height: 24px;
  background: linear-gradient(
    180deg,
    rgba(255, 200, 87, 0.72),
    rgba(255, 200, 87, 0.5)
  );
  border-radius: 2px;
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}
.polaroid-image {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 2px;
  overflow: hidden;
  background: #eef3fb;
}
.polaroid-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s ease;
  filter: saturate(0.92) contrast(1.02);
}
.polaroid-card:hover .polaroid-image img {
  transform: scale(1.04);
}
.polaroid-caption {
  padding: 16px 6px 2px;
  text-align: center;
}
.polaroid-title {
  margin: 0 0 8px;
  font-family: "Cafe24Rounded", "Pretendard Variable", Pretendard, sans-serif;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--ink);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.polaroid-author {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--muted);
  font-weight: 700;
}
.polaroid-author .material-symbols-rounded {
  font-size: 14px;
  color: var(--violet);
}
.polaroid-stats {
  display: flex;
  justify-content: center;
  gap: 14px;
  padding-top: 10px;
  border-top: 1px dashed rgba(0, 102, 255, 0.18);
}
.polaroid-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}
.polaroid-stat .material-symbols-rounded {
  font-size: 14px;
  color: var(--rose);
}
.polaroid-stat:last-child .material-symbols-rounded {
  color: var(--violet);
}

.today-pick-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}
.today-pick-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #fff;
  background: linear-gradient(135deg, var(--rose), #ff8a5c);
  box-shadow: 0 8px 18px rgba(255, 92, 141, 0.28);
}
.today-pick-label .material-symbols-rounded {
  font-size: 14px;
}
.today-pick-title {
  margin: 0;
  font-size: clamp(24px, 2.6vw, 34px);
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--ink);
  word-break: keep-all;
}
.today-pick-summary {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.today-pick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-soft {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 800;
  color: var(--violet);
  background: rgba(0, 102, 255, 0.08);
  border: 1px solid rgba(0, 102, 255, 0.12);
}
.today-pick-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.today-pick-cta {
  padding: 12px 22px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 12px 28px rgba(0, 102, 255, 0.22);
}
.today-pick-cta .material-symbols-rounded {
  font-size: 18px;
}
.today-pick-controls {
  display: flex;
  gap: 8px;
}
.today-pick-controls .carousel-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0, 50, 150, 0.06);
  transition: all 0.2s ease;
}
.today-pick-controls .carousel-btn:hover {
  border-color: rgba(0, 102, 255, 0.4);
  color: var(--violet);
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(0, 102, 255, 0.12);
}
.today-pick-controls .carousel-btn .material-symbols-rounded {
  font-size: 20px;
}
.today-pick-dots {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}
.today-pick-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 102, 255, 0.2);
  cursor: pointer;
  transition: all 0.25s ease;
}
.today-pick-dot.active {
  width: 26px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
}
.today-pick-dot:hover:not(.active) {
  background: rgba(0, 102, 255, 0.4);
}

/* ===== Latest stories section ===== */
.latest-stories-section {
  scroll-margin-top: 96px;
}
.latest-stories-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.latest-stories-title {
  display: flex;
  align-items: center;
  gap: 14px;
}
.latest-stories-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 24px;
  color: #fff;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  box-shadow: 0 10px 22px rgba(0, 102, 255, 0.22);
}
.latest-stories-eyebrow {
  margin: 0 0 4px;
  color: var(--violet);
  font-size: 11px;
  letter-spacing: 0.14em;
}
.latest-stories-title h2 {
  margin: 0;
  font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.latest-stories-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.community-story-search {
  width: min(240px, 100%);
  flex: 0 1 240px;
  min-width: 0;
}
.community-story-search input {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 50px 0 16px;
  font-size: 13px;
  font-weight: 700;
}
.community-story-search .search-box__button {
  top: 4px;
  width: 32px;
  height: 32px;
  min-height: 32px;
  border-radius: 50%;
}
.filter-pill {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0, 50, 150, 0.06);
  transition: all 0.2s ease;
}
.filter-pill:hover {
  border-color: rgba(0, 102, 255, 0.4);
  color: var(--violet);
  transform: translateY(-2px);
}
.filter-pill .material-symbols-rounded {
  font-size: 20px;
}

/* ===== Story card grid (폴라로이드 컨셉 - 각진 직사각형 + 미세 흩뜨림) ===== */
.story-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
}
.story-tile {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow 0.25s ease,
    border-color 0.25s ease;
  box-shadow: 0 4px 10px rgba(0, 50, 150, 0.04);
}
.story-tile:nth-child(4n + 1) {
  transform: rotate(-0.6deg) translateY(3px);
}
.story-tile:nth-child(4n + 2) {
  transform: rotate(0.5deg) translateY(-2px);
}
.story-tile:nth-child(4n + 3) {
  transform: rotate(-0.4deg) translateY(2px);
}
.story-tile:nth-child(4n + 4) {
  transform: rotate(0.7deg) translateY(-3px);
}
.story-tile:hover {
  transform: rotate(0deg) translateY(-8px);
  border-color: rgba(0, 102, 255, 0.22);
  z-index: 2;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 22px 44px rgba(0, 30, 90, 0.14),
    0 8px 18px rgba(0, 102, 255, 0.07);
}
.story-tile-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #eef3fb;
  overflow: hidden;
}
.story-tile-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}
.story-tile:hover .story-tile-image {
  transform: scale(1.05);
}
.story-tile-like {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  transition: all 0.2s ease;
}
.story-tile-like .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: "FILL" 0;
}
.story-tile-like:hover {
  transform: scale(1.08);
  color: var(--rose);
}
.story-tile-like.active {
  color: var(--rose);
}
.story-tile-like.active .material-symbols-rounded {
  font-variation-settings: "FILL" 1;
}
.story-tile-like:disabled {
  opacity: 0.6;
  cursor: progress;
}
.story-tile-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px 18px;
}
.story-tile-author {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  max-width: 100%;
}
.story-tile-avatar {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  overflow: hidden;
  box-shadow: 0 4px 8px rgba(0, 102, 255, 0.18);
}
.story-tile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.story-tile-author-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.story-tile-author-name strong {
  font-size: 12px;
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.story-tile-author-name .muted {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.story-tile-author:hover .story-tile-author-name strong {
  color: var(--violet);
}
.story-tile-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--ink);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.story-tile-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.story-tile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.story-tile-tags .tag-soft {
  padding: 3px 8px;
  font-size: 11px;
}
.story-tile-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid rgba(227, 234, 244, 0.9);
  color: var(--muted);
}
.story-tile-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
}
.story-tile-stat .material-symbols-rounded {
  font-size: 16px;
  color: var(--violet);
}
.story-tile-stat:first-child .material-symbols-rounded {
  color: var(--rose);
}
.story-tile-stat-end {
  margin-left: auto;
}
.story-tile-stat-end .material-symbols-rounded {
  color: var(--muted);
}

/* ===== Pagination (평범한 숫자 방식) ===== */
.community-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-top: 40px;
  flex-wrap: wrap;
}
.pg-btn {
  min-width: 38px;
  height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.pg-btn:hover:not(:disabled):not(.active) {
  border-color: rgba(0, 102, 255, 0.4);
  color: var(--violet);
  background: rgba(0, 102, 255, 0.04);
  transform: translateY(-1px);
}
.pg-num.active {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 8px 18px rgba(0, 102, 255, 0.22);
  cursor: default;
}
.pg-arrow .material-symbols-rounded {
  font-size: 20px;
}
.pg-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ===== Story overlay (preserved) ===== */
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
  transition:
    background 0.2s,
    box-shadow 0.2s;
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
  scrollbar-width: none;
}
.story-overlay .story-feed-window::-webkit-scrollbar {
  display: none;
}
.story-overlay .story-feed-window::-webkit-scrollbar-track {
  background: transparent;
}
.story-overlay .story-feed-window::-webkit-scrollbar-thumb {
  background: rgba(0, 102, 255, 0.16);
  border-radius: 10px;
}
.story-overlay .feed-sidebar {
  --feed-panel-offset: 82px;
  --feed-list-height: min(760px, calc(100vh - 190px));
  height: var(--feed-list-height);
  min-height: 650px;
  padding-top: var(--feed-panel-offset);
}

/* ===== Comment widget (preserved) ===== */
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
  scrollbar-width: none;
}
.feed-comment-scroll::-webkit-scrollbar {
  display: none;
}
.feed-comment-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.feed-comment-scroll::-webkit-scrollbar-thumb {
  background: rgba(0, 102, 255, 0.16);
  border-radius: 10px;
}
.feed-comment-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 102, 255, 0.3);
}
.fc-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(227, 234, 244, 0.8);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 102, 255, 0.03);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}
.fc-item + .fc-item {
  margin-top: 10px;
}
.fc-item:hover {
  border-color: rgba(0, 102, 255, 0.18);
  box-shadow: 0 6px 16px rgba(0, 102, 255, 0.06);
}
.fc-item.is-featured {
  border-color: rgba(255, 92, 141, 0.18);
  background: #fff8fb;
}
.fc-item.is-reply { margin-left: 26px; border-left: 3px solid rgba(0, 102, 255, .3); background: #f8fbff; }
.fc-reply-label { display: inline-flex; align-items: center; gap: 3px; margin-bottom: 5px; color: var(--violet); font-size: 10px; font-weight: 850; }
.fc-reply-label .material-symbols-rounded { font-size: 14px; }
.fc-avatar {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 900;
  color: #fff;
  border: 2px solid #fff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  padding: 0;
}
.fc-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fc-avatar-button {
  cursor: pointer;
}
.fc-name-button {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.fc-name-button:hover {
  color: var(--violet);
}
.fc-body {
  flex: 1;
  min-width: 0;
}
.fc-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.fc-name {
  font-size: 13px;
  font-weight: 850;
  color: var(--ink);
}
.fc-author-badge {
  display: inline-flex;
  align-items: center;
  min-height: 16px;
  margin-left: 5px;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--rose);
  background: rgba(255, 92, 141, 0.1);
  font-size: 10px;
  font-weight: 900;
}
.fc-time {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.fc-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #3f4658;
  word-break: break-word;
}
.fc-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.fc-actions button {
  min-height: 24px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  font-weight: 800;
  transition: all 0.2s;
}
.fc-actions button:hover {
  color: var(--violet);
  border-color: rgba(0, 102, 255, 0.18);
  background: var(--surface-2);
}
.fc-actions button .material-symbols-rounded {
  font-size: 14px;
}
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

/* Story report button (overlay) */
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
  transition:
    background 0.2s,
    color 0.2s;
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

/* ===== Responsive ===== */
@media (max-width: 1200px) {
  .story-card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 1024px) {
  .community-hero-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
  }
  .community-hero-actions {
    width: 100%;
  }
  .community-hero-actions .community-pill {
    flex: 1;
  }
  .today-pick-grid {
    grid-template-columns: 1fr;
    gap: 36px;
  }
  .polaroid-wrap {
    padding: 24px 0 8px;
  }
  .polaroid-card {
    max-width: 380px;
  }
  .story-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .latest-stories-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .latest-stories-tools {
    width: 100%;
  }
  .community-story-search {
    flex: 1 1 0;
    width: auto;
    max-width: none;
  }
  .story-overlay-panel .feed-layout {
    grid-template-columns: 1fr;
    padding: 24px;
  }
}
@media (max-width: 768px) {
  .community-page {
    padding: 24px 16px;
  }
  .community-content-container {
    padding: 20px 16px;
    border-radius: 18px;
  }
  .today-pick-grid {
    gap: 28px;
  }
  .polaroid-card {
    transform: rotate(-3deg);
    padding: 14px 14px 20px;
  }
  .story-card-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .story-tile:nth-child(4n + 1),
  .story-tile:nth-child(4n + 2),
  .story-tile:nth-child(4n + 3),
  .story-tile:nth-child(4n + 4) {
    transform: none;
  }
  .latest-stories-tools {
    flex-wrap: wrap;
  }
}
@media (max-width: 480px) {
  .community-hero-title {
    font-size: clamp(26px, 7vw, 34px);
  }
  .community-hero-actions {
    gap: 8px;
  }
  .community-pill {
    padding: 10px 14px;
    font-size: 13px;
    flex: 1 1 calc(50% - 8px);
  }
  .today-pick-actions {
    gap: 10px;
  }
  .today-pick-cta {
    flex: 1;
  }
  .filter-pill {
    display: none;
  }
}
</style>
