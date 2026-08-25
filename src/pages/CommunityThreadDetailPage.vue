<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ThreadCard from '@/components/community/ThreadCard.vue'
import ThreadComposer from '@/components/community/ThreadComposer.vue'
import { communityThreadApi } from '@/api/community-thread.api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'
import type { CommunityThread, CommunityThreadReply } from '@/types/community-thread'

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
const replyTarget = ref<CommunityThreadReply | null>(null)

const isAuthenticated = computed(() => Boolean(auth.user))

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

async function submitReply(content: string) {
  posting.value = true
  try {
    await communityThreadApi.createReply(threadId.value, {
      content,
      parentReplyId: replyTarget.value?.id ?? null,
    })
    replyTarget.value = null
    await load()
  } catch {
    toast.error('답글을 남기지 못했습니다.')
  } finally {
    posting.value = false
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

async function reportReply(reply: CommunityThreadReply) {
  try {
    await communityThreadApi.reportReply(reply.id, 'INAPPROPRIATE')
    toast.success('신고를 접수했어요.')
  } catch {
    toast.error('신고를 접수하지 못했습니다.')
  }
}

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

async function removeThread() {
  try {
    await communityThreadApi.deleteThread(threadId.value)
    router.push('/community')
  } catch {
    toast.error('글을 삭제하지 못했습니다.')
  }
}

function startReplyTo(reply: CommunityThreadReply) {
  replyTarget.value = reply
}

function cancelReplyTarget() {
  replyTarget.value = null
}

function isTombstone(reply: CommunityThreadReply) {
  return reply.content === null || reply.deletedAt !== null
}

onMounted(load)
</script>

<template>
  <AppShell>
    <section class="thread-detail">
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
          @like="toggleLike"
          @remove="removeThread"
          @report="() => {}"
          @open="() => {}"
          @edit="() => {}"
        />

        <div v-if="replyTarget" class="thread-detail-reply-target" data-testid="reply-target">
          <span>{{ replyTarget.author?.displayName ?? '사용자' }}님에게 답글</span>
          <button type="button" @click="cancelReplyTarget">취소</button>
        </div>

        <ThreadComposer
          v-if="isAuthenticated"
          :submitting="posting"
          submit-label="답글"
          placeholder="답글을 남겨보세요"
          @submit="submitReply"
        />

        <ul class="thread-detail-replies" data-testid="reply-list">
          <li v-for="reply in replies" :key="reply.id" class="thread-detail-reply">
            <div class="thread-detail-reply-body" data-testid="reply-item" :data-depth="reply.depth">
              <span class="thread-detail-reply-author">
                {{ reply.author?.displayName ?? '사용자' }}
              </span>
              <p v-if="isTombstone(reply)" class="thread-detail-reply-tombstone" data-testid="reply-tombstone">
                삭제된 답글입니다.
              </p>
              <p v-else class="thread-detail-reply-content" data-testid="reply-content">
                {{ reply.content }}
              </p>
              <div class="thread-detail-reply-actions">
                <button
                  v-if="isAuthenticated && !isTombstone(reply)"
                  type="button"
                  data-testid="reply-reply"
                  @click="startReplyTo(reply)"
                >
                  답글
                </button>
                <button
                  v-if="reply.editableByMe"
                  type="button"
                  data-testid="reply-delete"
                  @click="removeReply(reply)"
                >
                  삭제
                </button>
                <button
                  v-if="!reply.editableByMe && !isTombstone(reply)"
                  type="button"
                  data-testid="reply-report"
                  @click="reportReply(reply)"
                >
                  신고
                </button>
              </div>
            </div>

            <ul v-if="reply.replies.length" class="thread-detail-children" data-testid="reply-children">
              <li v-for="child in reply.replies" :key="child.id">
                <div class="thread-detail-reply-body" data-testid="reply-item" :data-depth="child.depth">
                  <span class="thread-detail-reply-author">
                    {{ child.author?.displayName ?? '사용자' }}
                  </span>
                  <p
                    v-if="isTombstone(child)"
                    class="thread-detail-reply-tombstone"
                    data-testid="reply-tombstone"
                  >
                    삭제된 답글입니다.
                  </p>
                  <p v-else class="thread-detail-reply-content" data-testid="reply-content">
                    {{ child.content }}
                  </p>
                </div>
              </li>
            </ul>
          </li>
        </ul>
      </template>
    </section>
  </AppShell>
</template>

<style scoped>
.thread-detail {
  margin: 0 auto;
  max-width: 640px;
  width: 100%;
}

.thread-detail-reply-target {
  align-items: center;
  background: var(--surface-2, transparent);
  color: var(--muted);
  display: flex;
  font-size: 13px;
  gap: 8px;
  justify-content: space-between;
  padding: 8px 16px;
}

.thread-detail-reply-target button {
  background: none;
  border: none;
  color: var(--brand-violet, #6b5bff);
  cursor: pointer;
  font-size: 13px;
}

.thread-detail-replies {
  list-style: none;
  margin: 0;
  padding: 0;
}

.thread-detail-reply {
  border-bottom: 1px solid var(--line);
  padding: 14px 16px;
}

.thread-detail-reply-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thread-detail-reply-author {
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}

.thread-detail-reply-content {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.thread-detail-reply-tombstone {
  color: var(--muted);
  font-size: 13px;
  font-style: italic;
  margin: 0;
}

.thread-detail-reply-actions {
  display: flex;
  gap: 10px;
}

.thread-detail-reply-actions button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.thread-detail-children {
  border-left: 2px solid var(--line);
  list-style: none;
  margin: 10px 0 0 12px;
  padding: 0 0 0 12px;
}
</style>
