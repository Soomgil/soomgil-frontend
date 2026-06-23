<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { communityApi } from '@/api/community.api'
import type { CommunityComment, CommunityPostDetail } from '@/types/community'

const props = defineProps<{ storyId: string }>()
defineEmits<{ close: [] }>()

const post = ref<CommunityPostDetail | null>(null)
const comments = ref<CommunityComment[]>([])
const loading = ref(true)
const error = ref('')

function mediaUrl(item: CommunityPostDetail['media'][number]) {
  return item.servingUrl ?? item.publicUrl ?? ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [detail, commentPage] = await Promise.all([
      communityApi.getPost(props.storyId),
      communityApi.getComments(props.storyId),
    ])
    post.value = detail
    comments.value = commentPage.items
  } catch {
    error.value = '여행기를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="내 여행기 상세">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <article class="story-overlay-panel my-story-detail">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>
      <div v-if="loading" class="my-story-state">여행기를 불러오는 중…</div>
      <div v-else-if="error" class="my-story-state my-story-state--error">
        <p>{{ error }}</p>
        <button type="button" class="btn ghost" @click="load">다시 시도</button>
      </div>
      <template v-else-if="post">
        <header class="my-story-head">
          <p class="eyebrow">My Travel Story</p>
          <h2>{{ post.title }}</h2>
          <p>{{ post.publishedBy?.displayName ?? '여행자' }} · {{ new Date(post.publishedAt).toLocaleDateString('ko-KR') }}</p>
        </header>
        <div v-if="post.media.some(mediaUrl)" class="my-story-gallery">
          <img v-for="media in post.media.filter(mediaUrl)" :key="media.id" :src="mediaUrl(media)" :alt="post.title" />
        </div>
        <div class="my-story-body">
          <p>{{ post.summary || '작성된 소개가 없습니다.' }}</p>
          <div v-if="post.hashtags.length" class="my-story-tags">
            <span v-for="tag in post.hashtags" :key="tag">#{{ tag }}</span>
          </div>
          <section class="my-story-comments" aria-label="댓글">
            <h3>댓글 {{ post.commentCount }}</h3>
            <p v-if="comments.length === 0" class="muted">아직 댓글이 없습니다.</p>
            <div v-for="comment in comments" :key="comment.id" class="my-story-comment">
              <strong>{{ comment.author.displayName }}</strong>
              <span>{{ comment.deletedAt ? '삭제된 댓글입니다.' : comment.content }}</span>
            </div>
          </section>
        </div>
      </template>
    </article>
  </div>
</template>

<style scoped>
.my-story-detail { width: min(94vw, 820px); max-height: 92vh; overflow-y: auto; }
.my-story-state { min-height: 320px; display: grid; place-items: center; padding: 48px; color: var(--muted); }
.my-story-state--error { align-content: center; gap: 12px; color: var(--rose); }
.my-story-head { padding: 42px 42px 24px; }
.my-story-head h2 { margin: 6px 0 8px; font-size: clamp(24px, 4vw, 36px); }
.my-story-head p:last-child { color: var(--muted); font-size: 13px; }
.my-story-gallery { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(78%, 1fr); gap: 8px; overflow-x: auto; padding: 0 42px; scroll-snap-type: x mandatory; }
.my-story-gallery img { width: 100%; height: min(52vw, 460px); object-fit: cover; border-radius: 18px; scroll-snap-align: start; }
.my-story-body { padding: 26px 42px 42px; line-height: 1.7; }
.my-story-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 18px; color: var(--violet); font-size: 13px; font-weight: 800; }
.my-story-comments { margin-top: 30px; padding-top: 22px; border-top: 1px solid var(--line); }
.my-story-comments h3 { margin: 0 0 14px; font-size: 16px; }
.my-story-comment { display: grid; grid-template-columns: minmax(72px, auto) 1fr; gap: 10px; padding: 10px 0; font-size: 13px; border-bottom: 1px solid var(--line); }
@media (max-width: 640px) { .my-story-head, .my-story-body { padding-left: 22px; padding-right: 22px; } .my-story-gallery { padding: 0 22px; } }
</style>
