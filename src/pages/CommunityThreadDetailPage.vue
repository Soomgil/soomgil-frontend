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

function isTombstone(reply: CommunityThreadReply) {
  return reply.content === null || reply.deletedAt !== null
}

function replyDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
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

        <template v-else>
          <ThreadCard
            :thread="thread"
            :saving="savingThread"
            :clickable="false"
            @like="toggleLike"
            @save="saveThread"
            @remove="removeThread"
            @report="reportThreadTarget = thread"
            @open="() => {}"
          />

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

          <ul class="thread-detail__replies" data-testid="reply-list">
            <li v-for="reply in replies" :key="reply.id" class="thread-detail__reply-group">
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
                        답글
                      </button>
                      <button
                        v-if="item.editableByMe"
                        type="button"
                        data-testid="reply-edit"
                        @click="startEditReply(item)"
                      >
                        수정
                      </button>
                      <button
                        v-if="item.editableByMe || thread.editableByMe"
                        type="button"
                        data-testid="reply-delete"
                        @click="removeReply(item)"
                      >
                        삭제
                      </button>
                      <button
                        v-if="isAuthenticated && !item.editableByMe"
                        type="button"
                        data-testid="reply-report"
                        @click="reportReply = item"
                      >
                        신고
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </li>
          </ul>
        </template>
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
  gap: 16px;
  margin: 0 auto;
  max-width: 680px;
  width: 100%;
}

.thread-detail__back {
  align-items: center;
  align-self: flex-start;
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 4px;
  padding: 6px 10px 6px 4px;
  transition: color 0.2s ease;
}

.thread-detail__back:hover {
  color: var(--ink);
}

.thread-detail__back .material-symbols-rounded {
  font-size: 20px;
}

.thread-detail__replies {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--soft-shadow);
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 8px 0;
}

.thread-detail__replies:empty {
  display: none;
}

.thread-detail__reply-group {
  border-bottom: 1px solid var(--line);
}

.thread-detail__reply-group:last-child {
  border-bottom: none;
}

.thread-detail__reply {
  display: flex;
  gap: 10px;
  padding: 16px 22px;
}

.thread-detail__reply--nested {
  background: var(--bg);
  margin: 0 22px 12px 52px;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 12px 14px;
}

.thread-detail__reply-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.thread-detail__reply-head {
  align-items: baseline;
  display: flex;
  gap: 8px;
}

.thread-detail__reply-author {
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}

.thread-detail__reply-date {
  color: var(--muted);
  font-size: 11px;
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
  gap: 12px;
  margin-top: 2px;
}

.thread-detail__reply-actions button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 0;
  transition: color 0.2s ease;
}

.thread-detail__reply-actions button:hover {
  color: var(--violet);
}

.thread-detail__reply-edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thread-detail__reply-edit-input {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.6;
  padding: 10px 12px;
  resize: vertical;
  width: 100%;
}

.thread-detail__reply-edit-input:focus {
  border-color: var(--violet);
  outline: none;
}

.thread-detail__reply-edit-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.thread-detail__reply-edit-actions button {
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 12px;
}

.thread-detail__reply-edit-actions button.save {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
}

.thread-detail__reply-edit-actions button.save:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
