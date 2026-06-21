<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { communityApi } from '@/api/community.api'
import type { CommunityPostSummary } from '@/types/community'
import AppShell from '@/components/layout/AppShell.vue'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const toast = useToast()
const posts = ref<CommunityPostSummary[]>([])

function goBack() {
  router.push('/community')
}

onMounted(async () => {
  try {
    posts.value = (await communityApi.getPosts({ page: 0, size: 100 })).items
  } catch {
    toast.error('여행기 목록을 불러오지 못했습니다.')
  }
})
</script>

<template>
  <AppShell>
    <main>
      <section class="section">
        <div class="detail-topline">
          <a class="btn ghost" href="#" @click.prevent="goBack">커뮤니티로 돌아가기</a>
          <router-link class="btn primary" to="/community/story-write">여행기 작성</router-link>
        </div>
        <div class="section-title">
          <div>
            <p class="eyebrow">All Travel Stories</p>
            <h1>우리들의 여행 이야기</h1>
            <p class="lead">직접 가보고 느낀 생생한 후기와 나만 알기 아까운 꿀팁들을 확인해보세요.</p>
          </div>
        </div>

        <div class="story-list-grid">
          <a
            v-for="story in posts"
            :key="story.id"
            class="story-list-card"
            href="#"
            @click.prevent
          >
            <img :alt="story.title + ' 스토리'" :src="story.coverMedia?.publicUrl ?? '/images/랜딩페이지/korea_hero.png'" />
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
