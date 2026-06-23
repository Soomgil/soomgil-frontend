<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Story } from '@/types/community'

const props = defineProps<{ stories: Story[] }>()
defineEmits<{ close: []; storyClick: [storyId: string] }>()

const searchQuery = ref('')

const filteredStories = computed(() => {
  if (!searchQuery.value.trim()) return props.stories
  const q = searchQuery.value.trim().toLowerCase()
  return props.stories.filter((s) =>
    s.title.toLowerCase().includes(q) ||
    (s.location ?? '').toLowerCase().includes(q)
  )
})
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="내 여행기 모두 보기">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <div class="story-overlay-panel" style="width: min(98vw, 1000px); max-height: 94vh;">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>

      <div style="padding: 32px;">
        <div class="mypage-section-header" style="margin-bottom: 24px;">
          <h2 class="mypage-section-title">
            <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">auto_stories</span>내 여행기
          </h2>
          <div class="mypage-header-search-row">
            <div class="mypage-search-inline">
              <span class="material-symbols-rounded">search</span>
              <input type="search" v-model="searchQuery" placeholder="제목, 지역으로 검색" />
            </div>
            <span class="mypage-search-count">{{ filteredStories.length }}개</span>
          </div>
        </div>

        <div v-if="filteredStories.length === 0" class="mypage-empty-state mypage-empty-state--inline">
          <span class="material-symbols-rounded mypage-empty-icon">search_off</span>
          <p class="mypage-empty-title">검색 결과가 없어요</p>
          <p class="mypage-empty-desc">다른 키워드로 검색해 보세요.</p>
        </div>

        <div v-else style="overflow-y: auto; max-height: calc(94vh - 140px);">
          <div class="mypage-stories-magazine">
            <div v-for="story in filteredStories" :key="story.id" class="mypage-story-magazine-item" @click="$emit('storyClick', story.id)">
              <img class="story-magazine-thumb" :src="story.image" :alt="story.title" />
              <div class="story-magazine-body">
                <h3 class="story-magazine-title">
                  <span>{{ story.title }}</span>
                </h3>
                <div class="story-magazine-meta">
                  <span class="story-date">{{ story.location }}</span>
                  <div class="story-stats-row">
                    <span>
                      <span class="material-symbols-rounded">favorite</span> {{ story.likes }}
                    </span>
                    <span>
                      <span class="material-symbols-rounded">chat_bubble</span> {{ story.comments }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mypage-search-inline {
  position: relative;
  display: flex;
  align-items: center;
}
.mypage-search-inline .material-symbols-rounded {
  position: absolute;
  left: 12px;
  color: var(--muted);
  font-size: 18px;
  pointer-events: none;
}
.mypage-search-inline input {
  width: 240px;
  height: 38px;
  border: 1.5px solid rgba(227, 234, 244, 0.9);
  border-radius: 12px;
  padding: 0 14px 0 38px;
  font-size: 13px;
  font-weight: 600;
  background: #fff;
  outline: none;
  transition: border-color 0.25s;
}
.mypage-search-inline input:focus {
  border-color: var(--violet);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.08);
}
.mypage-header-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mypage-search-count {
  font-size: 12px;
  color: var(--muted);
  font-weight: 700;
  white-space: nowrap;
}
</style>
