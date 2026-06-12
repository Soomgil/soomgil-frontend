<script setup lang="ts">
import { useRouter } from 'vue-router'
import { mockCommunityStories } from '@/mocks/mockCommunity'
import AppShell from '@/components/layout/AppShell.vue'

const router = useRouter()

function goBack() {
  router.push('/community')
}
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
            v-for="story in mockCommunityStories"
            :key="story.id"
            class="story-list-card"
            href="#"
            @click.prevent
          >
            <img :alt="story.title + ' 스토리'" :src="story.image" />
            <div>
              <span class="post-type story">여행기</span>
              <h3>{{ story.title }}</h3>
              <p class="muted">{{ story.author }} · 좋아요 {{ story.likes }} · 댓글 {{ story.comments }}</p>
            </div>
          </a>
        </div>
      </section>
    </main>
  </AppShell>
</template>
