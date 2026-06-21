<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { communityApi } from '@/api/community.api'
import type { CommunityComment, CommunityPostSummary } from '@/types/community'
import AppShell from '@/components/layout/AppShell.vue'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const posts = ref<CommunityPostSummary[]>([])
const apiComments = ref<CommunityComment[]>([])
const activePostId = ref('')
const stories = computed(() => posts.value.map((post) => ({
  id: post.id,
  image: post.coverMedia?.publicUrl ?? '/images/랜딩페이지/korea_hero.png',
  title: post.title,
  avatar: (post.publishedBy?.displayName ?? '?').slice(0, 1),
  author: post.publishedBy?.displayName ?? '숨길 여행자',
  location: post.hashtags?.[0] ?? '여행 기록',
  content: post.summary ?? '',
  tip: '',
  tags: post.hashtags ?? [],
})))

const comments = computed(() => apiComments.value.map((comment) => ({
  id: comment.id,
  avatar: (comment.author?.displayName ?? '?').slice(0, 1),
  name: comment.author?.displayName ?? '사용자',
  color: 'var(--violet)',
  time: new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(comment.createdAt)),
  text: comment.content ?? '삭제된 댓글입니다.',
  featured: false,
  likes: 0,
  reply: '',
})))

const hashtags = computed(() => {
  const map = new Map<string, number>()
  stories.value.forEach((s) => s.tags.forEach((t) => map.set(t, (map.get(t) || 0) + 1)))
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag)
})

const feedComment = ref('')

async function loadFeed() {
  try {
    const response = await communityApi.getPosts({ page: 0, size: 100 })
    posts.value = response.items
    activePostId.value = response.items[0]?.id ?? ''
    if (activePostId.value) apiComments.value = (await communityApi.getComments(activePostId.value)).items
  } catch {
    toast.error('커뮤니티 피드를 불러오지 못했습니다.')
  }
}

async function submitComment() {
  const content = feedComment.value.trim()
  if (!activePostId.value || !content) return
  try {
    apiComments.value.push(await communityApi.createComment(activePostId.value, content))
    feedComment.value = ''
  } catch {
    toast.error('댓글을 등록하지 못했습니다.')
  }
}

onMounted(loadFeed)
</script>

<template>
  <AppShell>
    <main>
      <section class="section feed-page">
        <div
          class="section-title community-hero-header"
          style="margin-bottom: 48px; align-items: end"
        >
          <div>
            <p class="eyebrow">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle">explore</span>
              Trip Feed
            </p>
            <h1 style="max-width: 100%; word-break: keep-all; font-size: clamp(36px, 4vw, 56px); margin-bottom: 18px;">
              <span style="background: linear-gradient(135deg, var(--rose), var(--violet)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">여행자들의 피드</span>에서<br />
              실시간 영감을 얻어보세요
            </h1>
            <p class="lead" style="max-width: 100%; word-break: keep-all; margin-top: 16px">
              전 세계 여행자들이 직접 다녀온 생생한 최신 피드를 둘러보고 공감할 수 있습니다.
            </p>
          </div>
        </div>

        <div class="feed-layout">
          <section class="story-feed" aria-label="여행기 피드">
            <div class="section-title compact-title">
              <div>
                <p class="eyebrow" style="color: var(--rose)">Feed</p>
                <h2 style="font-size: 24px">
                  <span class="material-symbols-rounded" style="vertical-align: middle; color: var(--rose); margin-right: 6px">dynamic_feed</span>최신 여행 이야기
                </h2>
              </div>
            </div>

            <div class="story-feed-window" aria-label="스크롤 가능한 여행기 피드" data-community-stories>
              <div
                v-for="story in stories"
                :key="story.id"
                class="story-post"
              >
                <img :src="story.image" :alt="story.title" style="width: 100%; border-radius: 18px;" />
                <div style="padding: 24px;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <div class="fc-avatar" :style="{ background: 'var(--violet)' }">{{ story.avatar }}</div>
                    <div>
                      <span class="fc-name">{{ story.author }}</span>
                      <span class="fc-time">{{ story.location }}</span>
                    </div>
                  </div>
                  <h3 style="font-size: 20px; font-weight: 800; margin: 0 0 8px;">{{ story.title }}</h3>
                  <p style="font-size: 14px; line-height: 1.7; color: var(--muted);">{{ story.content }}</p>
                  <div v-if="story.tip" style="margin-top: 12px; padding: 12px 16px; background: rgba(255, 200, 87, 0.1); border-radius: 14px;">
                    <p style="font-size: 12px; font-weight: 800; color: #ffc857; margin: 0 0 4px;">꿀팁</p>
                    <p style="font-size: 13px; margin: 0; line-height: 1.6;">{{ story.tip }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="feed-scroll-guide" data-scroll-guide>
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
            <!-- Widget 1: Popular Hashtags -->
            <div class="widget-card">
              <h3 class="widget-title">
                <span class="material-symbols-rounded">tag</span>인기 해시태그
              </h3>
              <div class="tag-cloud">
                <a
                  v-for="tag in hashtags"
                  :key="tag"
                  href="#"
                  class="tag-item"
                  @click.prevent
                >{{ tag }}</a>
              </div>
            </div>

            <!-- Widget 2: Comment Section -->
            <div class="widget-card feed-comment-widget">
              <div class="feed-comment-header">
                <h3>
                  <span class="material-symbols-rounded" style="font-size:20px; color:var(--violet)">forum</span>
                  댓글
                  <span class="comment-count-badge">{{ comments.length }}</span>
                </h3>
              </div>

              <div class="feed-comment-scroll" id="feed-comment-scroll">
                <div
                  v-for="comment in comments"
                  :key="comment.id"
                  class="fc-item"
                  :class="{ 'is-featured': comment.featured }"
                >
                  <div class="fc-avatar" :style="{ background: comment.color }">{{ comment.avatar }}</div>
                  <div class="fc-body">
                    <div class="fc-meta">
                      <div>
                        <span class="fc-name">{{ comment.name }}</span>
                        <span v-if="comment.featured" class="fc-author-badge">인기</span>
                      </div>
                      <span class="fc-time">{{ comment.time }}</span>
                    </div>
                    <p class="fc-text">{{ comment.text }}</p>
                    <div v-if="comment.reply" class="fc-reply">
                      <strong>{{ comment.reply.split(' ')[0] }}</strong> {{ comment.reply.split(' ').slice(1).join(' ') }}
                    </div>
                    <div class="fc-actions">
                      <button>
                        <span class="material-symbols-rounded">favorite</span><span>{{ comment.likes }}</span>
                      </button>
                      <button>
                        <span class="material-symbols-rounded">reply</span>답글
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="feed-comment-input-area">
                <div class="feed-comment-composer">
                  <div class="feed-comment-my-avatar">나</div>
                  <div class="feed-comment-input-wrap">
                    <input v-model="feedComment" id="feed-comment-input" type="text" placeholder="댓글을 남겨보세요..." />
                    <div class="comment-submit-row">
                      <div class="comment-composer-tools">
                        <button class="comment-tool-btn" type="button" aria-label="사진 추가"><span class="material-symbols-rounded">add_photo_alternate</span></button>
                        <button class="comment-tool-btn" type="button" aria-label="장소 태그"><span class="material-symbols-rounded">location_on</span></button>
                      </div>
                      <button id="feed-comment-submit" class="comment-submit-btn" type="button" aria-label="댓글 등록" :disabled="!feedComment.trim()" @click="submitComment">
                        <span class="material-symbols-rounded" style="font-size:16px">send</span>
                        <span class="submit-label">등록</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  </AppShell>
</template>

<style scoped>
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
.feed-comment-my-avatar {
  display: none;
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
.feed-comment-input-wrap {
  position: relative;
}
.feed-comment-input-area input:focus {
  border-color: var(--violet);
  box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.08);
}
.feed-comment-input-area .comment-submit-row {
  display: contents;
}
.comment-composer-tools {
  display: none;
}
.comment-tool-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s ease;
}
.comment-tool-btn:hover {
  color: var(--violet);
  border-color: rgba(0, 102, 255, 0.18);
  background: var(--surface-2);
}
.comment-tool-btn .material-symbols-rounded {
  font-size: 17px;
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
}
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
</style>
