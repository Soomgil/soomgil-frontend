<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { communityApi } from "@/api/community.api";
import { userApi } from "@/api/user.api";
import type {
  CommunityComment,
  CommunityPostDetail,
  CommunityPostSummary,
  ReportReason,
  ReportReasonCode,
} from "@/types/community";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth.store";

export interface StoryView {
  id: string;
  author: string;
  authorUserId?: string | null;
  authorProfileImageUrl?: string | null;
  avatar: string;
  location: string;
  title: string;
  image: string;
  photos: string[];
  likes: number;
  likedByMe?: boolean;
  comments: number;
  tags: string[];
  summary: string;
  content: string;
}

const props = defineProps<{
  stories: StoryView[];
  initialStoryId: string;
}>();

const emit = defineEmits<{
  close: [];
  changed: [];
}>();

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();

const FALLBACK_IMAGE = "/images/랜딩페이지/korea_hero.png";
const profileImageRequests = new Map<string, Promise<string | null>>();

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

function openUserProfile(userId: string | null | undefined) {
  if (userId) router.push(`/mypage/${userId}`);
}

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

const selectedPost = ref<CommunityPostDetail | null>(null);
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

// 첫 렌더 전에 클릭한 글 인덱스로 맞춰, 마운트 시 0번 글에서 타겟으로
// 슬라이드 전환되는 깜빡임을 방지한다.
const visibleStoryIdx = ref(
  Math.max(0, props.stories.findIndex((s) => s.id === props.initialStoryId)),
);

const visibleStory = computed<StoryView>(() => {
  const idxStory = props.stories[visibleStoryIdx.value];
  const base = idxStory ?? props.stories[0];
  if (!base) {
    return {
      id: props.initialStoryId,
      author: "",
      avatar: "",
      location: "",
      title: "",
      image: FALLBACK_IMAGE,
      photos: [FALLBACK_IMAGE],
      likes: 0,
      likedByMe: false,
      comments: 0,
      tags: [],
      summary: "",
      content: "",
    };
  }
  if (selectedPost.value?.id === base.id) return toStoryView(selectedPost.value);
  return base;
});

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

const overlayComment = ref("");
const replyTarget = ref<{ id: string; name: string } | null>(null);
const reportModal = ref(false);
const reportReason = ref<ReportReasonCode | "">("");
const reportDetail = ref("");
const reportReasons = ref<ReportReason[]>([]);
const scrollGuideVisible = ref(true);
const transitionName = ref<"slide-up" | "slide-down">("slide-up");
const isTransitioning = ref(false);
const likingPostIds = ref(new Set<string>());

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
    selectedPost.value = updated;
    toast.success("여행기를 수정했습니다.");
    emit("changed");
  } catch {
    toast.error("여행기를 수정하지 못했습니다.");
  }
}

async function deleteStory(story: StoryView) {
  if (!window.confirm("여행기를 삭제할까요?")) return;
  try {
    await communityApi.deletePost(story.id);
    toast.success("여행기를 삭제했습니다.");
    emit("changed");
    emit("close");
  } catch {
    toast.error("여행기를 삭제하지 못했습니다.");
  }
}

async function toggleStoryLike(story: StoryView) {
  if (likingPostIds.value.has(story.id)) return;
  likingPostIds.value = new Set(likingPostIds.value).add(story.id);
  try {
    const liked = story.likedByMe === true;
    const result = liked
      ? await communityApi.unlikePost(story.id)
      : await communityApi.likePost(story.id);
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
    emit("close");
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

function closeModal() {
  emit("close");
}

let touchStartY = 0;
let touchStartX = 0;
function onTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
}
function onTouchEnd(e: TouchEvent) {
  const dy = touchStartY - e.changedTouches[0].clientY;
  const dx = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx)) return;
  const article = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(".story-post");
  const atTop = article ? article.scrollTop <= 0 : true;
  const atBottom = article
    ? article.scrollTop + article.clientHeight >= article.scrollHeight - 1
    : true;
  if (dy > 0 && !atBottom) return;
  if (dy < 0 && !atTop) return;
  goToStory(dy > 0 ? 1 : -1);
}
function onWheel(e: WheelEvent) {
  if (Math.abs(e.deltaY) < 15) return;
  const article = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(".story-post");
  if (!article) return;
  const atTop = article.scrollTop <= 0;
  const atBottom = article.scrollTop + article.clientHeight >= article.scrollHeight - 1;
  if (e.deltaY > 0) {
    if (!atBottom) return;
    e.preventDefault();
    goToStory(1);
  } else {
    if (!atTop) return;
    e.preventDefault();
    goToStory(-1);
  }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
    e.preventDefault();
    goToStory(1);
  } else if (e.key === "ArrowUp" || e.key === "PageUp") {
    e.preventDefault();
    goToStory(-1);
  }
}

function goToStory(direction: -1 | 1) {
  if (isTransitioning.value) return;
  const next = visibleStoryIdx.value + direction;
  if (next < 0 || next >= props.stories.length) return;
  isTransitioning.value = true;
  transitionName.value = direction > 0 ? "slide-up" : "slide-down";
  visibleStoryIdx.value = next;
  scrollGuideVisible.value = false;
  void selectVisibleStory(next);
  window.setTimeout(() => {
    isTransitioning.value = false;
  }, 350);
}

let visibleStoryRequest = 0;
async function selectVisibleStory(index: number) {
  const story = props.stories[index];
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

async function loadInitial() {
  const initialIdx = Math.max(
    0,
    props.stories.findIndex((story) => story.id === props.initialStoryId),
  );
  visibleStoryIdx.value = initialIdx;
  const story = props.stories[initialIdx];
  if (!story) return;
  try {
    const [post, commentPage] = await Promise.all([
      communityApi.getPost(story.id),
      communityApi.getComments(story.id),
    ]);
    await Promise.all([enrichPostAuthors([post]), enrichCommentAuthors(commentPage.items)]);
    selectedPost.value = post;
    apiComments.value = commentPage.items;
    transitionName.value = "slide-up";
  } catch {
    toast.error("여행기 상세를 불러오지 못했습니다.");
  }
}

function lockBody() {
  if (typeof document !== "undefined") document.body.style.overflow = "hidden";
}
function unlockBody() {
  if (typeof document !== "undefined") document.body.style.overflow = "";
}

onMounted(() => {
  lockBody();
  void loadInitial();
});
onUnmounted(() => {
  unlockBody();
});

// stories prop이 바뀌어도 현재 보고 있는 스토리가 유지되도록 인덱스 보정
watch(
  () => props.stories,
  (list) => {
    const currentId = visibleStory.value?.id;
    if (!currentId) return;
    const idx = list.findIndex((story) => story.id === currentId);
    if (idx >= 0 && idx !== visibleStoryIdx.value) visibleStoryIdx.value = idx;
  },
);
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="여행기 상세">
    <div class="story-overlay-backdrop" @click="closeModal"></div>
    <div class="story-overlay-panel" @click="scrollGuideVisible = false">
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
            aria-label="여행기 피드"
            id="overlay-feed-stories"
            tabindex="0"
            @touchstart.passive="onTouchStart"
            @touchend.passive="onTouchEnd"
            @wheel="onWheel"
            @keydown="onKeydown"
          >
            <Transition :name="transitionName" mode="out-in">
              <article
                :key="visibleStory.id"
                :data-story-id="visibleStory.id"
                class="story-post"
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
                      @click="openUserProfile(visibleStory.authorUserId)"
                    >
                      <div
                        class="fc-avatar"
                        style="width: 40px; height: 40px; background: var(--violet)"
                      >
                        <img
                          v-if="visibleStory.authorProfileImageUrl"
                          :src="visibleStory.authorProfileImageUrl"
                          :alt="`${visibleStory.author} 프로필 사진`"
                        />
                        <span v-else>{{ visibleStory.avatar }}</span>
                      </div>
                      <div>
                        <strong style="font-size: 15px; color: var(--violet)">{{
                          visibleStory.author
                        }}</strong>
                        <span class="small muted" style="display: block">{{ visibleStory.location }}</span>
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
                <div class="story-post-photo-frame">
                  <button
                    v-if="visibleStory.photos.length > 1"
                    type="button"
                    class="feed-photo-nav carousel-btn prev-btn prev"
                    aria-label="이전 사진"
                    @click="moveStoryPhoto(visibleStory, -1)"
                  >
                    <span class="material-symbols-rounded">chevron_left</span>
                  </button>
                  <img
                    :alt="visibleStory.title"
                    :src="currentStoryPhoto(visibleStory)"
                    class="story-post-photo-img"
                  />
                  <button
                    v-if="visibleStory.photos.length > 1"
                    type="button"
                    class="feed-photo-nav carousel-btn next-btn next"
                    aria-label="다음 사진"
                    @click="moveStoryPhoto(visibleStory, 1)"
                  >
                    <span class="material-symbols-rounded">chevron_right</span>
                  </button>
                  <span v-if="visibleStory.photos.length > 1" class="feed-photo-count"
                    >{{ (storyPhotoIndexes[visibleStory.id] ?? 0) + 1 }} / {{ visibleStory.photos.length }}</span
                  >
                </div>
                <div class="story-body" style="padding: 18px 24px 10px">
                  <h3 style="font-size: 20px; line-height: 1.4; margin: 0 0 10px">
                    {{ visibleStory.title }}
                  </h3>
                  <div class="tag-row" style="margin-bottom: 10px">
                    <span v-for="tag in visibleStory.tags" :key="tag" class="tag">{{ tag }}</span>
                  </div>
                  <p class="muted" style="font-size: 15px; line-height: 1.7; margin: 0">
                    {{ visibleStory.summary }}
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
                      :class="{ active: visibleStory.likedByMe }"
                      :disabled="likingPostIds.has(visibleStory.id)"
                      :aria-pressed="visibleStory.likedByMe"
                      @click="toggleStoryLike(visibleStory)"
                    >
                      <span class="material-symbols-rounded" style="font-size: 20px">favorite</span>
                      {{ visibleStory.likes }}
                    </button>
                    <span style="display: flex; align-items: center; gap: 4px"
                      ><span
                        class="material-symbols-rounded"
                        style="font-size: 20px; color: var(--violet)"
                        >chat_bubble</span
                      >
                      {{ visibleStory.comments }}</span
                    >
                    <button type="button" class="story-like-button" @click="retripStory(visibleStory)">
                      <span class="material-symbols-rounded" style="font-size: 20px"
                        >content_copy</span
                      >
                      리트립
                    </button>
                    <button type="button" class="story-like-button" @click="shareStory(visibleStory)">
                      <span class="material-symbols-rounded" style="font-size: 20px">share</span>
                      공유
                    </button>
                    <template v-if="visibleStory.authorUserId === auth.user?.id">
                      <button type="button" class="story-like-button" @click="editStory(visibleStory)">
                        <span class="material-symbols-rounded" style="font-size: 20px">edit</span>
                        수정
                      </button>
                      <button type="button" class="story-like-button" @click="deleteStory(visibleStory)">
                        <span class="material-symbols-rounded" style="font-size: 20px">delete</span>
                        삭제
                      </button>
                    </template>
                  </div>
                </div>
              </article>
            </Transition>
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
  </div>
</template>

<style scoped>
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
  position: relative;
  display: block;
  height: auto;
  max-height: calc(82vh - 120px);
  margin-bottom: 0;
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow-y: auto;
  overflow-x: hidden;
  background: #fff;
  box-sizing: border-box;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.story-overlay .story-post::-webkit-scrollbar {
  display: none;
}
.story-post-photo-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #eef3fb;
  flex-shrink: 0;
}
.story-post-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}
.story-overlay .story-feed-window {
  position: relative;
  overflow: visible;
  outline: none;
}
.slide-up-enter-active,
.slide-up-leave-active,
.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.slide-up-enter-from {
  transform: translateY(100%);
}
.slide-up-leave-to {
  transform: translateY(-100%);
}
.slide-down-enter-from {
  transform: translateY(-100%);
}
.slide-down-leave-to {
  transform: translateY(100%);
}
.story-overlay .story-feed-window::-webkit-scrollbar {
  display: none;
}
.story-overlay .feed-sidebar {
  --feed-panel-offset: 82px;
  --feed-list-height: min(760px, calc(100vh - 190px));
  height: var(--feed-list-height);
  min-height: 650px;
  padding-top: var(--feed-panel-offset);
}

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

@media (max-width: 1024px) {
  .story-overlay-panel .feed-layout {
    grid-template-columns: 1fr;
    padding: 24px;
  }
}
</style>
