<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ThreadCard from '@/components/community/ThreadCard.vue'
import ThreadComposer from '@/components/community/ThreadComposer.vue'
import { communityThreadApi } from '@/api/community-thread.api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'
import type { CommunityThread } from '@/types/community-thread'
import type { PageMeta } from '@/types/community'

const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const threads = ref<CommunityThread[]>([])
const page = ref<PageMeta | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const posting = ref(false)
const loadError = ref(false)
const likingIds = ref(new Set<string>())

const isAuthenticated = computed(() => Boolean(auth.user))
const hasMore = computed(() => Boolean(page.value && page.value.page + 1 < page.value.totalPages))
const isEmpty = computed(() => !loading.value && !loadError.value && threads.value.length === 0)

async function loadFeed() {
  loading.value = true
  loadError.value = false
  try {
    const result = await communityThreadApi.getThreads({ page: 0, size: 20 })
    threads.value = result.items
    page.value = result.page
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || !page.value) return
  loadingMore.value = true
  try {
    const result = await communityThreadApi.getThreads({ page: page.value.page + 1, size: page.value.size })
    const known = new Set(threads.value.map((thread) => thread.id))
    threads.value.push(...result.items.filter((thread) => !known.has(thread.id)))
    page.value = result.page
  } catch {
    toast.error('다음 글을 불러오지 못했습니다.')
  } finally {
    loadingMore.value = false
  }
}

async function createThread(content: string) {
  posting.value = true
  try {
    const created = await communityThreadApi.createThread({ content })
    threads.value.unshift(created)
    toast.success('글을 올렸어요.')
  } catch {
    toast.error('글을 올리지 못했습니다.')
  } finally {
    posting.value = false
  }
}

async function toggleLike(thread: CommunityThread) {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  if (likingIds.value.has(thread.id)) return
  likingIds.value.add(thread.id)
  try {
    const summary = await communityThreadApi.toggleLike(thread)
    const target = threads.value.find((item) => item.id === thread.id)
    if (target) {
      target.likedByMe = summary.liked
      target.likeCount = summary.likeCount
    }
  } catch {
    toast.error('좋아요를 처리하지 못했습니다.')
  } finally {
    likingIds.value.delete(thread.id)
  }
}

async function removeThread(thread: CommunityThread) {
  try {
    await communityThreadApi.deleteThread(thread.id)
    threads.value = threads.value.filter((item) => item.id !== thread.id)
    toast.success('글을 삭제했어요.')
  } catch {
    toast.error('글을 삭제하지 못했습니다.')
  }
}

async function reportThread(thread: CommunityThread) {
  try {
    await communityThreadApi.reportThread(thread.id, 'INAPPROPRIATE')
    toast.success('신고를 접수했어요.')
  } catch {
    toast.error('신고를 접수하지 못했습니다.')
  }
}

function openThread(threadId: string) {
  router.push(`/community/threads/${threadId}`)
}

function editThread(thread: CommunityThread) {
  router.push(`/community/threads/${thread.id}`)
}

onMounted(loadFeed)
</script>

<template>
  <AppShell>
    <section class="community-feed">
      <header class="community-feed-header">
        <h1 class="community-feed-title">커뮤니티</h1>
        <p class="community-feed-subtitle">여행 이야기를 짧게 나눠보세요.</p>
      </header>

      <ThreadComposer
        v-if="isAuthenticated"
        :submitting="posting"
        @submit="createThread"
      />

      <LoadingState v-if="loading" data-testid="feed-loading" />

      <ErrorState
        v-else-if="loadError"
        data-testid="feed-error"
        message="피드를 불러오지 못했습니다."
        @retry="loadFeed"
      />

      <EmptyState
        v-else-if="isEmpty"
        data-testid="feed-empty"
        icon="forum"
        title="아직 올라온 글이 없어요"
        description="첫 번째 여행 이야기를 남겨보세요."
      />

      <div v-else class="community-feed-list" data-testid="feed-list">
        <ThreadCard
          v-for="thread in threads"
          :key="thread.id"
          :thread="thread"
          :liking="likingIds.has(thread.id)"
          @open="openThread"
          @like="toggleLike"
          @edit="editThread"
          @remove="removeThread"
          @report="reportThread"
        />

        <button
          v-if="hasMore"
          type="button"
          class="community-feed-more"
          data-testid="feed-load-more"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? '불러오는 중…' : '더 보기' }}
        </button>
      </div>
    </section>
  </AppShell>
</template>

<style scoped>
.community-feed {
  margin: 0 auto;
  max-width: 640px;
  width: 100%;
}

.community-feed-header {
  padding: 24px 16px 8px;
}

.community-feed-title {
  color: var(--ink);
  font-size: 24px;
  font-weight: 800;
  margin: 0;
}

.community-feed-subtitle {
  color: var(--muted);
  font-size: 14px;
  margin: 6px 0 0;
}

.community-feed-list {
  display: flex;
  flex-direction: column;
}

.community-feed-more {
  background: none;
  border: none;
  color: var(--brand-violet, #6b5bff);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  padding: 18px;
}

.community-feed-more:disabled {
  color: var(--muted);
  cursor: not-allowed;
}
</style>
