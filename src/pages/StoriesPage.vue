<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { communityApi } from '@/api/community.api'
import type { CommunityPostSummary } from '@/types/community'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const toast = useToast()
const posts = ref<CommunityPostSummary[]>([])
const loading = ref(false)
const error = ref('')

function goBack() {
  router.push('/community')
}

async function loadPosts() {
  loading.value = true
  error.value = ''
  try {
    posts.value = (await communityApi.getPosts({ page: 0, size: 100 })).items
  } catch {
    error.value = '여행기 목록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

onMounted(loadPosts)
</script>

<template>
  <AppShell>
    <main>
      <section class="section page-with-hero">
        <div class="detail-topline">
          <a class="btn ghost" href="#" @click.prevent="goBack">커뮤니티로 돌아가기</a>
          <router-link class="btn primary" to="/community/story-write">여행기 작성</router-link>
        </div>
        <div class="page-hero">
          <div class="page-hero__copy">
            <p class="page-hero__eyebrow">
              <span class="material-symbols-rounded" aria-hidden="true">auto_stories</span>
              All Travel Stories
            </p>
            <h1 class="page-hero__title"><span class="page-hero__gradient">우리들의 여행 이야기</span>를 둘러보세요</h1>
            <p class="page-hero__lead">직접 가보고 느낀 생생한 후기와 나만 알기 아까운 꿀팁들을 확인해보세요.</p>
          </div>
        </div>

        <LoadingState v-if="loading" />
        <ErrorState v-else-if="error" :message="error" @retry="loadPosts" />
        <EmptyState
          v-else-if="posts.length === 0"
          icon="auto_stories"
          title="아직 공개된 여행기가 없어요"
          description="직접 다녀온 여행을 기록하고 다른 여행자들과 나눠보세요."
          action-label="첫 여행기 작성하기"
          @action="router.push('/community/story-write')"
        />
        <div v-else class="story-list-grid">
          <a
            v-for="story in posts"
            :key="story.id"
            class="story-list-card"
            href="#"
            @click.prevent="router.push({ path: '/community', query: { story: story.id } })"
          >
            <img :alt="story.title + ' 스토리'" :src="story.coverMedia?.servingUrl ?? story.coverMedia?.publicUrl ?? '/images/랜딩페이지/korea_hero.png'" />
            <div>
              <span class="post-type story">여행기</span>
              <h3>{{ story.title }}</h3>
              <p class="muted">{{ story.publishedBy?.displayName ?? '숨길 여행자' }} · 좋아요 {{ story.likeCount }} · 댓글 {{ story.commentCount }}</p>
            </div>
          </a>
        </div>
      </section>
    </main>
  </AppShell>
</template>
