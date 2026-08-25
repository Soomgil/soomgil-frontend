<script setup lang="ts">
import { computed } from 'vue'
import BaseAvatar from '@/components/common/BaseAvatar.vue'
import type { CommunityThread } from '@/types/community-thread'

const props = defineProps<{ thread: CommunityThread; liking?: boolean }>()

const emit = defineEmits<{
  open: [threadId: string]
  like: [thread: CommunityThread]
  edit: [thread: CommunityThread]
  remove: [thread: CommunityThread]
  report: [thread: CommunityThread]
}>()

/** 삭제되거나 숨김 처리된 쓰레드는 본문 대신 tombstone을 보여준다. */
const isTombstone = computed(
  () => props.thread.content === null || props.thread.deletedAt !== null,
)

const images = computed(() =>
  props.thread.media
    .map((file) => file.servingUrl ?? file.publicUrl)
    .filter((url): url is string => Boolean(url)),
)

const createdLabel = computed(() => {
  if (!props.thread.createdAt) return ''
  const created = new Date(props.thread.createdAt)
  if (Number.isNaN(created.getTime())) return ''
  return created.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
})
</script>

<template>
  <article class="thread-card" data-testid="thread-card">
    <header class="thread-card-header">
      <BaseAvatar
        :src="thread.author?.profileImageUrl ?? undefined"
        :name="thread.author?.displayName ?? '사용자'"
        size="sm"
      />
      <div class="thread-card-meta">
        <span class="thread-card-author">{{ thread.author?.displayName ?? '사용자' }}</span>
        <span class="thread-card-date">{{ createdLabel }}</span>
      </div>
      <div class="thread-card-actions">
        <button
          v-if="thread.editableByMe"
          type="button"
          class="thread-card-action"
          data-testid="thread-edit"
          @click="emit('edit', thread)"
        >
          수정
        </button>
        <button
          v-if="thread.editableByMe"
          type="button"
          class="thread-card-action"
          data-testid="thread-delete"
          @click="emit('remove', thread)"
        >
          삭제
        </button>
        <button
          v-if="!thread.editableByMe && !isTombstone"
          type="button"
          class="thread-card-action"
          data-testid="thread-report"
          @click="emit('report', thread)"
        >
          신고
        </button>
      </div>
    </header>

    <p v-if="isTombstone" class="thread-card-tombstone" data-testid="thread-tombstone">
      삭제된 글입니다.
    </p>
    <p v-else class="thread-card-content" data-testid="thread-content">{{ thread.content }}</p>

    <div v-if="images.length" class="thread-card-images" :data-count="images.length">
      <img
        v-for="(url, index) in images"
        :key="url"
        :src="url"
        :alt="`첨부 이미지 ${index + 1}`"
        loading="lazy"
      />
    </div>

    <footer class="thread-card-footer">
      <button
        type="button"
        class="thread-card-stat"
        :class="{ liked: thread.likedByMe }"
        :disabled="liking"
        data-testid="thread-like"
        @click="emit('like', thread)"
      >
        <span class="material-symbols-rounded">favorite</span>
        <span data-testid="thread-like-count">{{ thread.likeCount }}</span>
      </button>
      <button
        type="button"
        class="thread-card-stat"
        data-testid="thread-open"
        @click="emit('open', thread.id)"
      >
        <span class="material-symbols-rounded">chat_bubble</span>
        <span data-testid="thread-reply-count">{{ thread.replyCount }}</span>
      </button>
    </footer>
  </article>
</template>

<style scoped>
.thread-card {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px;
}

.thread-card-header {
  align-items: center;
  display: flex;
  gap: 10px;
}

.thread-card-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.thread-card-author {
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}

.thread-card-date {
  color: var(--muted);
  font-size: 12px;
}

.thread-card-actions {
  display: flex;
  gap: 6px;
}

.thread-card-action {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 6px;
}

.thread-card-content {
  color: var(--ink);
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.thread-card-tombstone {
  color: var(--muted);
  font-size: 14px;
  font-style: italic;
  margin: 0;
}

.thread-card-images {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, 1fr);
}

.thread-card-images[data-count='1'] {
  grid-template-columns: 1fr;
}

.thread-card-images img {
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  max-width: 100%;
  object-fit: cover;
  width: 100%;
}

.thread-card-footer {
  display: flex;
  gap: 16px;
}

.thread-card-stat {
  align-items: center;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 13px;
  gap: 4px;
  padding: 0;
}

.thread-card-stat.liked {
  color: var(--brand-rose, #e0567a);
}

.thread-card-stat:disabled {
  opacity: 0.6;
}
</style>
