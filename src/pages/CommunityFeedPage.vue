<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ThreadCard from '@/components/community/ThreadCard.vue'
import ThreadComposer from '@/components/community/ThreadComposer.vue'
import ThreadReportModal from '@/components/community/ThreadReportModal.vue'
import { communityThreadApi } from '@/api/community-thread.api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'
import type { CommunityThread } from '@/types/community-thread'
import type { PageMeta, ReportReasonCode } from '@/types/community'

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
const savingIds = ref(new Set<string>())
const composer = ref<InstanceType<typeof ThreadComposer> | null>(null)

const reportTarget = ref<CommunityThread | null>(null)
const reporting = ref(false)

const isAuthenticated = computed(() => auth.isAuthenticated && Boolean(auth.user))
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

async function createThread(content: string, mediaFileIds: string[]) {
  posting.value = true
  try {
    const created = await communityThreadApi.createThread({
      content,
      ...(mediaFileIds.length ? { mediaFileIds } : {}),
    })
    threads.value.unshift(created)
    composer.value?.reset()
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

async function saveThread(thread: CommunityThread, content: string) {
  if (savingIds.value.has(thread.id)) return
  savingIds.value.add(thread.id)
  try {
    const updated = await communityThreadApi.updateThread(thread.id, { content })
    const index = threads.value.findIndex((item) => item.id === thread.id)
    if (index >= 0) threads.value[index] = updated
    toast.success('글을 수정했어요.')
  } catch {
    toast.error('글을 수정하지 못했습니다.')
  } finally {
    savingIds.value.delete(thread.id)
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

function openReport(thread: CommunityThread) {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  reportTarget.value = thread
}

async function submitReport(reasonCode: ReportReasonCode, detail: string | undefined) {
  if (!reportTarget.value || reporting.value) return
  reporting.value = true
  try {
    await communityThreadApi.reportThread(reportTarget.value.id, reasonCode, detail)
    reportTarget.value = null
    toast.success('신고를 접수했어요.')
  } catch {
    toast.error('신고를 접수하지 못했습니다.')
  } finally {
    reporting.value = false
  }
}

function openThread(threadId: string) {
  router.push(`/community/threads/${threadId}`)
}

onMounted(async () => {
  // 새로고침 직후에는 토큰만 있고 user가 비어 있을 수 있다. 작성 폼 노출에 필요하므로 복원한다.
  if (auth.isAuthenticated && !auth.user) {
    try { await auth.fetchUser() } catch { /* 조회 실패해도 피드는 노출 */ }
  }
  await loadFeed()
})
</script>

<template>
  <AppShell>
    <section class="section page-with-hero community-feed">
      <div class="page-hero">
        <div class="page-hero__copy">
          <p class="page-hero__eyebrow">
            <span class="material-symbols-rounded" aria-hidden="true">forum</span>
            Community
          </p>
          <h1 class="page-hero__title">
            <span class="page-hero__gradient">여행자들의 이야기</span>를<br />나눠보세요
          </h1>
          <p class="page-hero__lead">
            다녀온 곳, 가고 싶은 곳, 지금 떠오른 여행 생각까지. 짧게 남기고 가볍게 답해보세요.
          </p>
        </div>
      </div>

      <div class="community-feed__column">
        <div v-if="isAuthenticated" class="community-feed__composer-card">
          <ThreadComposer
            ref="composer"
            :submitting="posting"
            allow-images
            :author-name="auth.user?.displayName ?? '나'"
            :author-image-url="auth.user?.profileImageUrl ?? null"
            @submit="createThread"
            @error="toast.error"
          />
        </div>

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

        <div v-else class="community-feed__list" data-testid="feed-list">
          <ThreadCard
            v-for="thread in threads"
            :key="thread.id"
            :thread="thread"
            :liking="likingIds.has(thread.id)"
            :saving="savingIds.has(thread.id)"
            @open="openThread"
            @like="toggleLike"
            @save="saveThread"
            @remove="removeThread"
            @report="openReport"
          />
        </div>

        <button
          v-if="hasMore && !loading && !loadError"
          type="button"
          class="community-feed__more"
          data-testid="feed-load-more"
          :disabled="loadingMore"
          @click="loadMore"
        >
          <span class="material-symbols-rounded" aria-hidden="true">expand_more</span>
          {{ loadingMore ? '불러오는 중…' : '더 보기' }}
        </button>
      </div>
    </section>

    <ThreadReportModal
      :open="Boolean(reportTarget)"
      target-label="쓰레드"
      :submitting="reporting"
      @close="reportTarget = null"
      @submit="submitReport"
    />
  </AppShell>
</template>

<style scoped>
.community-feed__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 auto;
  max-width: 640px;
  width: 100%;
}

/* 작성 폼도 앱 공통 카드 문법을 따른다 */
.community-feed__composer-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--soft-shadow);
}

.community-feed__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.community-feed__more {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--violet);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 800;
  gap: 4px;
  justify-content: center;
  margin: 4px auto 0;
  padding: 12px 28px;
  transition: background 0.2s ease, transform 0.2s ease;
}

.community-feed__more:hover:not(:disabled) {
  background: var(--surface-2);
  transform: translateY(-1px);
}

.community-feed__more:disabled {
  color: var(--muted);
  cursor: not-allowed;
}
</style>
