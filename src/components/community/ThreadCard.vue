<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseAvatar from '@/components/common/BaseAvatar.vue'
import type { CommunityThread } from '@/types/community-thread'

const props = withDefaults(defineProps<{
  thread: CommunityThread
  liking?: boolean
  saving?: boolean
  /** 상세 화면에서는 카드 클릭 이동과 답글 아이콘 이동을 끈다. */
  clickable?: boolean
}>(), {
  liking: false,
  saving: false,
  clickable: true,
})

const emit = defineEmits<{
  open: [threadId: string]
  like: [thread: CommunityThread]
  save: [thread: CommunityThread, content: string]
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
  const created = new Date(props.thread.createdAt)
  if (Number.isNaN(created.getTime())) return ''
  const diffMs = Date.now() - created.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return created.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
})

/* ── 인라인 수정 ── */
const editing = ref(false)
const draft = ref('')

function startEdit() {
  draft.value = props.thread.content ?? ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

function saveEdit() {
  const content = draft.value.trim()
  if (!content || content.length > 500) return
  emit('save', props.thread, content)
}

// 저장이 끝나 thread.content가 갱신되면 수정 모드를 닫는다.
watch(
  () => props.thread.updatedAt,
  () => {
    if (editing.value && !props.saving) editing.value = false
  },
)

function openThread() {
  if (props.clickable && !editing.value) emit('open', props.thread.id)
}
</script>

<template>
  <article
    class="thread-card"
    :class="{ 'thread-card--clickable': clickable && !editing }"
    data-testid="thread-card"
    @click="openThread"
  >
    <header class="thread-card__header">
      <BaseAvatar
        :src="thread.author?.profileImageUrl ?? undefined"
        :name="thread.author?.displayName ?? '사용자'"
        size="md"
      />
      <div class="thread-card__meta">
        <span class="thread-card__author">{{ thread.author?.displayName ?? '사용자' }}</span>
        <span class="thread-card__date">{{ createdLabel }}</span>
      </div>
      <div class="thread-card__actions" @click.stop>
        <template v-if="thread.editableByMe && !isTombstone">
          <button
            v-if="!editing"
            type="button"
            class="thread-card__action"
            data-testid="thread-edit"
            aria-label="쓰레드 수정"
            @click="startEdit"
          >
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button
            type="button"
            class="thread-card__action thread-card__action--danger"
            data-testid="thread-delete"
            aria-label="쓰레드 삭제"
            @click="emit('remove', thread)"
          >
            <span class="material-symbols-rounded">delete</span>
          </button>
        </template>
        <button
          v-else-if="!isTombstone"
          type="button"
          class="thread-card__action"
          data-testid="thread-report"
          aria-label="쓰레드 신고"
          @click="emit('report', thread)"
        >
          <span class="material-symbols-rounded">flag</span>
        </button>
      </div>
    </header>

    <p v-if="isTombstone" class="thread-card__tombstone" data-testid="thread-tombstone">
      <span class="material-symbols-rounded">block</span>
      삭제된 글입니다.
    </p>

    <div v-else-if="editing" class="thread-card__edit" data-testid="thread-edit-form" @click.stop>
      <textarea
        v-model="draft"
        rows="3"
        maxlength="500"
        class="thread-card__edit-input"
        data-testid="thread-edit-input"
      />
      <div class="thread-card__edit-footer">
        <span class="thread-card__edit-counter">{{ draft.trim().length }} / 500</span>
        <button type="button" class="thread-card__edit-cancel" data-testid="thread-edit-cancel" @click="cancelEdit">
          취소
        </button>
        <button
          type="button"
          class="thread-card__edit-save"
          data-testid="thread-edit-save"
          :disabled="!draft.trim() || draft.trim().length > 500 || saving"
          @click="saveEdit"
        >
          저장
        </button>
      </div>
    </div>

    <p v-else class="thread-card__content" data-testid="thread-content">{{ thread.content }}</p>

    <div v-if="images.length && !isTombstone" class="thread-card__images" :data-count="images.length" @click.stop>
      <img
        v-for="(url, index) in images"
        :key="url"
        :src="url"
        :alt="`첨부 이미지 ${index + 1}`"
        loading="lazy"
      />
    </div>

    <footer class="thread-card__footer" @click.stop>
      <button
        type="button"
        class="thread-card__stat"
        :class="{ 'thread-card__stat--liked': thread.likedByMe }"
        :disabled="liking"
        data-testid="thread-like"
        :aria-label="thread.likedByMe ? '좋아요 취소' : '좋아요'"
        @click="emit('like', thread)"
      >
        <span class="material-symbols-rounded" :class="{ filled: thread.likedByMe }">favorite</span>
        <span data-testid="thread-like-count">{{ thread.likeCount }}</span>
      </button>
      <button
        type="button"
        class="thread-card__stat"
        data-testid="thread-open"
        aria-label="답글 보기"
        @click="clickable ? emit('open', thread.id) : undefined"
      >
        <span class="material-symbols-rounded">chat_bubble</span>
        <span data-testid="thread-reply-count">{{ thread.replyCount }}</span>
      </button>
    </footer>
  </article>
</template>

<style scoped>
.thread-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 24px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--soft-shadow);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.thread-card--clickable {
  cursor: pointer;
}

.thread-card--clickable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.thread-card__header {
  align-items: center;
  display: flex;
  gap: 12px;
}

.thread-card__meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.thread-card__author {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.thread-card__date {
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}

.thread-card__actions {
  display: flex;
  gap: 4px;
}

.thread-card__action {
  align-items: center;
  background: none;
  border: none;
  border-radius: 12px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  height: 34px;
  justify-content: center;
  transition: background 0.2s ease, color 0.2s ease;
  width: 34px;
}

.thread-card__action .material-symbols-rounded {
  font-size: 19px;
}

.thread-card__action:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.thread-card__action--danger:hover {
  background: rgba(255, 92, 141, 0.1);
  color: var(--rose);
}

.thread-card__content {
  color: var(--ink);
  font-size: 15px;
  line-height: 1.7;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.thread-card__tombstone {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 14px;
  gap: 6px;
  margin: 0;
}

.thread-card__tombstone .material-symbols-rounded {
  font-size: 17px;
}

.thread-card__edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.thread-card__edit-input {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.6;
  padding: 12px 14px;
  resize: vertical;
  width: 100%;
}

.thread-card__edit-input:focus {
  border-color: var(--violet);
  outline: none;
}

.thread-card__edit-footer {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.thread-card__edit-counter {
  color: var(--muted);
  font-size: 12px;
  margin-right: auto;
}

.thread-card__edit-cancel {
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 14px;
}

.thread-card__edit-save {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  padding: 8px 18px;
}

.thread-card__edit-save:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.thread-card__images {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, 1fr);
}

.thread-card__images[data-count='1'] {
  grid-template-columns: 1fr;
}

.thread-card__images img {
  aspect-ratio: 4 / 3;
  border: 1px solid var(--line);
  border-radius: 16px;
  max-width: 100%;
  object-fit: cover;
  width: 100%;
}

.thread-card__footer {
  display: flex;
  gap: 18px;
}

.thread-card__stat {
  align-items: center;
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 700;
  gap: 5px;
  padding: 4px 8px;
  transition: color 0.2s ease;
}

.thread-card__stat .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: 'FILL' 0;
}

.thread-card__stat .material-symbols-rounded.filled {
  font-variation-settings: 'FILL' 1;
}

.thread-card__stat:hover {
  color: var(--ink);
}

.thread-card__stat--liked {
  color: var(--rose);
}

.thread-card__stat--liked:hover {
  color: var(--rose);
}

.thread-card__stat:disabled {
  opacity: 0.6;
}

@media (max-width: 640px) {
  .thread-card {
    border-radius: 18px;
    padding: 18px 16px;
  }
}
</style>
