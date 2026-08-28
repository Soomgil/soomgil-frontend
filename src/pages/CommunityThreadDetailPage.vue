<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import BaseAvatar from '@/components/common/BaseAvatar.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ThreadCard from '@/components/community/ThreadCard.vue'
import ThreadComposer from '@/components/community/ThreadComposer.vue'
import ThreadReportModal from '@/components/community/ThreadReportModal.vue'
import { communityThreadApi } from '@/api/community-thread.api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'
import type { CommunityThread, CommunityThreadReply } from '@/types/community-thread'
import type { ReportReasonCode } from '@/types/community'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const threadId = computed(() => String(route.params.threadId ?? ''))
const thread = ref<CommunityThread | null>(null)
const replies = ref<CommunityThreadReply[]>([])
const loading = ref(true)
const loadError = ref(false)
const posting = ref(false)
const savingThread = ref(false)
const replyTarget = ref<CommunityThreadReply | null>(null)
const composer = ref<InstanceType<typeof ThreadComposer> | null>(null)

const editingReplyId = ref<string | null>(null)
const replyDraft = ref('')
const savingReply = ref(false)

const reportReply = ref<CommunityThreadReply | null>(null)
const reportThreadTarget = ref<CommunityThread | null>(null)
const reporting = ref(false)

const isAuthenticated = computed(() => auth.isAuthenticated && Boolean(auth.user))

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const [detail, replyPage] = await Promise.all([
      communityThreadApi.getThread(threadId.value),
      communityThreadApi.getReplies(threadId.value, 0, 50),
    ])
    thread.value = detail
    replies.value = replyPage.items
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

/* ── 쓰레드 ── */

async function toggleLike(target: CommunityThread) {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  try {
    const summary = await communityThreadApi.toggleLike(target)
    if (thread.value) {
      thread.value.likedByMe = summary.liked
      thread.value.likeCount = summary.likeCount
    }
  } catch {
    toast.error('좋아요를 처리하지 못했습니다.')
  }
}

async function saveThread(_target: CommunityThread, content: string) {
  savingThread.value = true
  try {
    thread.value = await communityThreadApi.updateThread(threadId.value, { content })
    toast.success('글을 수정했어요.')
  } catch {
    toast.error('글을 수정하지 못했습니다.')
  } finally {
    savingThread.value = false
  }
}

async function removeThread() {
  try {
    await communityThreadApi.deleteThread(threadId.value)
    router.push('/community')
  } catch {
    toast.error('글을 삭제하지 못했습니다.')
  }
}

/* ── 답글 ── */

async function submitReply(content: string) {
  posting.value = true
  try {
    await communityThreadApi.createReply(threadId.value, {
      content,
      parentReplyId: replyTarget.value?.id ?? null,
    })
    replyTarget.value = null
    composer.value?.reset()
    await load()
  } catch {
    toast.error('답글을 남기지 못했습니다.')
  } finally {
    posting.value = false
  }
}

function isTombstone(reply: CommunityThreadReply) {
  return reply.content === null || reply.deletedAt !== null
}

function startEditReply(reply: CommunityThreadReply) {
  editingReplyId.value = reply.id
  replyDraft.value = reply.content ?? ''
}

function cancelEditReply() {
  editingReplyId.value = null
  replyDraft.value = ''
}

async function saveReply(reply: CommunityThreadReply) {
  const content = replyDraft.value.trim()
  if (!content || content.length > 500 || savingReply.value) return
  savingReply.value = true
  try {
    await communityThreadApi.updateReply(threadId.value, reply.id, content)
    cancelEditReply()
    await load()
    toast.success('답글을 수정했어요.')
  } catch {
    toast.error('답글을 수정하지 못했습니다.')
  } finally {
    savingReply.value = false
  }
}

async function removeReply(reply: CommunityThreadReply) {
  try {
    await communityThreadApi.deleteReply(threadId.value, reply.id)
    await load()
  } catch {
    toast.error('답글을 삭제하지 못했습니다.')
  }
}

/* ── 신고 ── */

async function submitReport(reasonCode: ReportReasonCode, detail: string | undefined) {
  if (reporting.value) return
  reporting.value = true
  try {
    if (reportReply.value) {
      await communityThreadApi.reportReply(reportReply.value.id, reasonCode, detail)
    } else if (reportThreadTarget.value) {
      await communityThreadApi.reportThread(reportThreadTarget.value.id, reasonCode, detail)
    }
    reportReply.value = null
    reportThreadTarget.value = null
    toast.success('신고를 접수했어요.')
  } catch {
    toast.error('신고를 접수하지 못했습니다.')
  } finally {
    reporting.value = false
  }
}

/** X처럼 짧은 상대 시간. 하루가 지나면 날짜로. */
function replyDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간`
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

onMounted(async () => {
  if (auth.isAuthenticated && !auth.user) {
    try { await auth.fetchUser() } catch { /* 조회 실패해도 글은 노출 */ }
  }
  await load()
})
</script>

<template>
  <AppShell>
    <section class="section page-with-hero thread-detail">
      <div class="thread-detail__column">
        <button type="button" class="thread-detail__back" data-testid="detail-back" @click="router.push('/community')">
          <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
          커뮤니티로
        </button>

        <LoadingState v-if="loading" data-testid="detail-loading" />

        <ErrorState
          v-else-if="loadError || !thread"
          data-testid="detail-error"
          message="글을 불러오지 못했습니다."
          @retry="load"
        />

        <div v-else class="thread-detail__surface">
          <ThreadCard
            :thread="thread"
            :saving="savingThread"
            :clickable="false"
            emphasized
            @like="toggleLike"
            @save="saveThread"
            @remove="removeThread"
            @report="reportThreadTarget = thread"
            @open="() => {}"
          />

          <div class="thread-detail__divider" aria-hidden="true"></div>

          <ThreadComposer
            v-if="isAuthenticated"
            ref="composer"
            :submitting="posting"
            submit-label="답글"
            placeholder="답글을 남겨보세요"
            :author-name="auth.user?.displayName ?? '나'"
            :author-image-url="auth.user?.profileImageUrl ?? null"
            :reply-target-name="replyTarget?.author?.displayName ?? null"
            @submit="submitReply"
            @cancel-reply="replyTarget = null"
            @error="toast.error"
          />

          <div v-if="isAuthenticated && replies.length" class="thread-detail__divider" aria-hidden="true"></div>

          <ul class="thread-detail__replies" data-testid="reply-list">
            <li v-for="reply in replies" :key="reply.id" class="thread-detail__group">
              <template v-for="item in [reply, ...reply.replies]" :key="item.id">
                <div
                  class="thread-detail__reply"
                  :class="{ 'thread-detail__reply--nested': item.depth === 1 }"
                  data-testid="reply-item"
                  :data-depth="item.depth"
                >
                  <BaseAvatar
                    :src="item.author?.profileImageUrl ?? undefined"
                    :name="item.author?.displayName ?? '사용자'"
                    size="sm"
                    class="thread-detail__reply-avatar"
                  />
                  <div class="thread-detail__reply-body">
                    <div class="thread-detail__reply-head">
                      <span class="thread-detail__reply-author">
                        {{ item.author?.displayName ?? '사용자' }}
                      </span>
                      <span class="thread-detail__reply-date">{{ replyDateLabel(item.createdAt) }}</span>
                    </div>

                    <p v-if="isTombstone(item)" class="thread-detail__reply-tombstone" data-testid="reply-tombstone">
                      삭제된 답글입니다.
                    </p>

                    <div v-else-if="editingReplyId === item.id" class="thread-detail__reply-edit" data-testid="reply-edit-form">
                      <textarea
                        v-model="replyDraft"
                        rows="2"
                        maxlength="500"
                        class="thread-detail__reply-edit-input"
                        data-testid="reply-edit-input"
                      />
                      <div class="thread-detail__reply-edit-actions">
                        <button type="button" data-testid="reply-edit-cancel" @click="cancelEditReply">취소</button>
                        <button
                          type="button"
                          class="save"
                          data-testid="reply-edit-save"
                          :disabled="!replyDraft.trim() || savingReply"
                          @click="saveReply(item)"
                        >
                          저장
                        </button>
                      </div>
                    </div>

                    <p v-else class="thread-detail__reply-content" data-testid="reply-content">
                      {{ item.content }}
                    </p>

                    <div v-if="!isTombstone(item) && editingReplyId !== item.id" class="thread-detail__reply-actions">
                      <button
                        v-if="isAuthenticated && item.depth === 0"
                        type="button"
                        data-testid="reply-reply"
                        @click="replyTarget = item"
                      >
                        <span class="material-symbols-rounded" aria-hidden="true">chat_bubble</span>
                        답글
                      </button>
                      <button
                        v-if="item.editableByMe"
                        type="button"
                        data-testid="reply-edit"
                        @click="startEditReply(item)"
                      >
                        <span class="material-symbols-rounded" aria-hidden="true">edit</span>
                        수정
                      </button>
                      <button
                        v-if="item.editableByMe || thread.editableByMe"
                        type="button"
                        data-testid="reply-delete"
                        @click="removeReply(item)"
                      >
                        <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                        삭제
                      </button>
                      <button
                        v-if="isAuthenticated && !item.editableByMe"
                        type="button"
                        data-testid="reply-report"
                        @click="reportReply = item"
                      >
                        <span class="material-symbols-rounded" aria-hidden="true">flag</span>
                        신고
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <ThreadReportModal
      :open="Boolean(reportReply || reportThreadTarget)"
      :target-label="reportReply ? '답글' : '쓰레드'"
      :submitting="reporting"
      @close="reportReply = null; reportThreadTarget = null"
      @submit="submitReport"
    />
  </AppShell>
</template>

<style scoped>
.thread-detail__column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0 auto;
  max-width: 640px;
  width: 100%;
}

.thread-detail__back {
  align-items: center;
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 4px;
  padding: 4px 0;
  transition: color 0.15s ease;
}

.thread-detail__back:hover {
  color: var(--ink);
}

.thread-detail__back .material-symbols-rounded {
  font-size: 18px;
}

.thread-detail__surface {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: var(--soft-shadow);
  overflow: hidden;
  padding: 4px 0;
}

.thread-detail__divider {
  background: var(--line);
  height: 1px;
  margin: 0 20px;
}

.thread-detail__replies {
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;
}

.thread-detail__group {
  border-top: 1px solid var(--line);
}

.thread-detail__group:first-child {
  border-top: none;
}

.thread-detail__reply {
  display: flex;
  gap: 12px;
  padding: 14px 20px;
}

/* Threads처럼 하위 답글은 연결선과 함께 들여쓴다 */
.thread-detail__reply--nested {
  margin-left: 38px;
  position: relative;
}

.thread-detail__reply--nested::before {
  background: var(--line);
  border-radius: 999px;
  bottom: 14px;
  content: '';
  left: -20px;
  position: absolute;
  top: 0;
  width: 2px;
}

.thread-detail__reply-avatar {
  flex: 0 0 auto;
}

.thread-detail__reply-body {
  flex: 1;
  min-width: 0;
}

.thread-detail__reply-head {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 2px;
}

.thread-detail__reply-author {
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
}

.thread-detail__reply-date {
  color: var(--muted);
  font-size: 12px;
}

.thread-detail__reply-content {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.65;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.thread-detail__reply-tombstone {
  color: var(--muted);
  font-size: 13px;
  font-style: italic;
  margin: 0;
}

.thread-detail__reply-actions {
  display: flex;
  gap: 2px;
  margin-left: -8px;
  margin-top: 6px;
}

.thread-detail__reply-actions button {
  align-items: center;
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 700;
  gap: 4px;
  padding: 5px 9px;
  transition: background 0.15s ease, color 0.15s ease;
}

.thread-detail__reply-actions button:hover {
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
}

.thread-detail__reply-actions .material-symbols-rounded {
  font-size: 15px;
}

.thread-detail__reply-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.thread-detail__reply-edit-input {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  padding: 10px 12px;
  resize: vertical;
}

.thread-detail__reply-edit-input:focus {
  border-color: var(--violet);
  outline: none;
}

.thread-detail__reply-edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.thread-detail__reply-edit-actions button {
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 7px 14px;
}

.thread-detail__reply-edit-actions button.save {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-weight: 800;
}

.thread-detail__reply-edit-actions button.save:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
