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
  /** 상세 화면의 본문 글씨를 키운다. */
  emphasized?: boolean
  /** 다른 면(surface) 안에 넣을 때 카드 테두리/그림자를 끈다. */
  flat?: boolean
}>(), {
  liking: false,
  saving: false,
  clickable: true,
  emphasized: false,
  flat: false,
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

/** 짧은 상대 시간. 하루가 지나면 날짜로. */
const createdLabel = computed(() => {
  const created = new Date(props.thread.createdAt)
  if (Number.isNaN(created.getTime())) return ''
  const diffMs = Date.now() - created.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return created.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
})

/* ── 더보기 메뉴 ── */
const menuOpen = ref(false)
const showMenuButton = computed(() => props.thread.editableByMe || !isTombstone.value)

function onMenu(action: 'edit' | 'remove' | 'report') {
  menuOpen.value = false
  if (action === 'edit') startEdit()
  if (action === 'remove') emit('remove', props.thread)
  if (action === 'report') emit('report', props.thread)
}

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
  if (props.clickable && !editing.value && !menuOpen.value) emit('open', props.thread.id)
}
</script>

<template>
  <article
    class="thread-card"
    :class="{
      'thread-card--clickable': clickable && !editing,
      'thread-card--emphasized': emphasized,
      'thread-card--flat': flat,
    }"
    data-testid="thread-card"
    @click="openThread"
  >
    <div class="thread-card__main">
      <BaseAvatar
        :src="thread.author?.profileImageUrl ?? undefined"
        :name="thread.author?.displayName ?? '사용자'"
        :size="emphasized ? 'md' : 'sm'"
        class="thread-card__avatar"
      />

      <div class="thread-card__body">
        <div class="thread-card__head">
          <span class="thread-card__author">{{ thread.author?.displayName ?? '사용자' }}</span>
          <span class="thread-card__time">{{ createdLabel }}</span>
          <span class="thread-card__spacer"></span>

          <div v-if="showMenuButton && !editing" class="thread-card__menu-wrap" @click.stop>
            <button
              type="button"
              class="thread-card__menu-btn"
              data-testid="thread-menu"
              aria-label="더보기"
              @click="menuOpen = !menuOpen"
            >
              <span class="material-symbols-rounded" aria-hidden="true">more_horiz</span>
            </button>

            <div v-if="menuOpen" class="thread-card__menu-backdrop" @click="menuOpen = false"></div>
            <div v-if="menuOpen" class="thread-card__menu" role="menu">
              <button
                v-if="thread.editableByMe && !isTombstone"
                type="button"
                role="menuitem"
                data-testid="thread-edit"
                @click="onMenu('edit')"
              >
                <span class="material-symbols-rounded" aria-hidden="true">edit</span>
                수정하기
              </button>
              <button
                v-if="thread.editableByMe"
                type="button"
                role="menuitem"
                class="danger"
                data-testid="thread-delete"
                @click="onMenu('remove')"
              >
                <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                삭제하기
              </button>
              <button
                v-if="!thread.editableByMe && !isTombstone"
                type="button"
                role="menuitem"
                class="danger"
                data-testid="thread-report"
                @click="onMenu('report')"
              >
                <span class="material-symbols-rounded" aria-hidden="true">flag</span>
                신고하기
              </button>
            </div>
          </div>
        </div>

        <p v-if="isTombstone" class="thread-card__tombstone" data-testid="thread-tombstone">
          삭제된 글이에요.
        </p>

        <div v-else-if="editing" class="thread-card__edit" data-testid="thread-edit-form" @click.stop>
          <textarea
            v-model="draft"
            rows="3"
            :maxlength="500"
            class="thread-card__edit-input"
            data-testid="thread-edit-input"
          />
          <div class="thread-card__edit-actions">
            <span class="thread-card__edit-counter">{{ draft.trim().length }} / 500</span>
            <button type="button" class="thread-card__edit-cancel" data-testid="thread-edit-cancel" @click="cancelEdit">
              취소
            </button>
            <button
              type="button"
              class="thread-card__edit-save"
              data-testid="thread-edit-save"
              :disabled="!draft.trim() || saving"
              @click="saveEdit"
            >
              저장
            </button>
          </div>
        </div>

        <template v-else>
          <p class="thread-card__content" data-testid="thread-content">{{ thread.content }}</p>

          <div
            v-if="images.length"
            class="thread-card__media"
            :class="`thread-card__media--${Math.min(images.length, 4)}`"
            data-testid="thread-media"
          >
            <img
              v-for="(url, imageIndex) in images.slice(0, 4)"
              :key="imageIndex"
              :src="url"
              :alt="`첨부 이미지 ${imageIndex + 1}`"
              loading="lazy"
              class="thread-card__image"
              @click.stop
            />
          </div>
        </template>
      </div>
    </div>

    <div v-if="!editing" class="thread-card__footer" @click.stop>
      <button
        type="button"
        class="thread-card__action"
        :class="{ 'thread-card__action--liked': thread.likedByMe }"
        data-testid="thread-like"
        :disabled="liking || isTombstone"
        aria-label="좋아요"
        @click="emit('like', thread)"
      >
        <span class="material-symbols-rounded" aria-hidden="true">favorite</span>
        <span data-testid="thread-like-count">{{ thread.likeCount }}</span>
      </button>

      <button
        type="button"
        class="thread-card__action"
        data-testid="thread-open"
        aria-label="답글"
        @click="clickable ? emit('open', thread.id) : undefined"
      >
        <span class="material-symbols-rounded" aria-hidden="true">chat_bubble</span>
        <span data-testid="thread-reply-count">{{ thread.replyCount }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
.thread-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--soft-shadow);
  padding: 18px 20px 10px;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.thread-card--clickable {
  cursor: pointer;
}

.thread-card--clickable:hover {
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.thread-card--flat {
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.thread-card--flat:hover {
  box-shadow: none;
  transform: none;
}

.thread-card__main {
  display: flex;
  gap: 12px;
}

.thread-card__avatar {
  flex: 0 0 auto;
}

.thread-card__body {
  flex: 1;
  min-width: 0;
}

.thread-card__head {
  align-items: center;
  display: flex;
  gap: 8px;
  min-height: 30px;
  position: relative;
}

.thread-card__author {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.thread-card__time {
  color: var(--muted);
  font-size: 13px;
}

.thread-card__spacer {
  flex: 1;
}

.thread-card__menu-wrap {
  position: relative;
}

.thread-card__menu-btn {
  align-items: center;
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  height: 30px;
  justify-content: center;
  width: 30px;
  transition: background 0.15s ease, color 0.15s ease;
}

.thread-card__menu-btn:hover {
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
}

.thread-card__menu-btn .material-symbols-rounded {
  font-size: 20px;
}

.thread-card__menu-backdrop {
  inset: 0;
  position: fixed;
  z-index: 40;
}

.thread-card__menu {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  min-width: 148px;
  overflow: hidden;
  padding: 6px;
  position: absolute;
  right: 0;
  top: 34px;
  z-index: 50;
}

.thread-card__menu button {
  align-items: center;
  background: none;
  border: none;
  border-radius: 10px;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  padding: 9px 10px;
  text-align: left;
  transition: background 0.15s ease;
}

.thread-card__menu button:hover {
  background: var(--surface-2);
}

.thread-card__menu button.danger {
  color: var(--rose, #ff5a8a);
}

.thread-card__menu .material-symbols-rounded {
  font-size: 18px;
}

.thread-card__content {
  color: var(--ink);
  font-size: 15px;
  line-height: 1.65;
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.thread-card--emphasized .thread-card__content {
  font-size: 17px;
  line-height: 1.7;
}

.thread-card__tombstone {
  color: var(--muted);
  font-size: 14px;
  font-style: italic;
  margin: 4px 0 0;
}

/* 이미지 그리드: 개수별 레이아웃 */
.thread-card__media {
  border-radius: 14px;
  display: grid;
  gap: 3px;
  margin-top: 12px;
  overflow: hidden;
}

.thread-card__media--1 {
  grid-template-columns: 1fr;
}

.thread-card__media--2,
.thread-card__media--3,
.thread-card__media--4 {
  grid-template-columns: 1fr 1fr;
}

.thread-card__media--3 .thread-card__image:first-child {
  grid-row: span 2;
  height: 100%;
}

.thread-card__image {
  aspect-ratio: 1 / 1;
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.thread-card__media--1 .thread-card__image {
  aspect-ratio: 16 / 10;
}

/* 수정 폼 */
.thread-card__edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 10px;
}

.thread-card__edit-input {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--ink);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.6;
  padding: 12px 14px;
  resize: vertical;
}

.thread-card__edit-input:focus {
  border-color: var(--violet);
  outline: none;
}

.thread-card__edit-actions {
  align-items: center;
  display: flex;
  gap: 10px;
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
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 12px;
}

.thread-card__edit-save {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  padding: 8px 20px;
}

.thread-card__edit-save:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 액션바: 카드 전폭, 헤어라인 위에 칩 */
.thread-card__footer {
  border-top: 1px solid var(--line);
  display: flex;
  gap: 6px;
  margin-top: 14px;
  padding: 8px 0 2px;
}

.thread-card__action {
  align-items: center;
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 800;
  gap: 6px;
  padding: 7px 14px;
  transition: background 0.15s ease, color 0.15s ease;
}

.thread-card__action .material-symbols-rounded {
  font-size: 19px;
}

.thread-card__action:hover:not(:disabled) {
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
}

.thread-card__action:first-child:hover:not(:disabled) {
  background: rgba(255, 90, 138, 0.1);
  color: var(--rose, #ff5a8a);
}

.thread-card__action--liked {
  color: var(--rose, #ff5a8a);
}

.thread-card__action--liked .material-symbols-rounded {
  font-variation-settings: 'FILL' 1;
}

.thread-card__action:disabled {
  cursor: default;
  opacity: 0.5;
}
</style>
