<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Story } from '@/types/community'

const props = defineProps<{ stories: Story[] }>()
defineEmits<{ close: []; storyClick: [storyId: string] }>()

const searchQuery = ref('')
const page = ref(1)
const pageSize = 6

const filteredStories = computed(() => {
  if (!searchQuery.value.trim()) return props.stories
  const q = searchQuery.value.trim().toLowerCase()
  return props.stories.filter((s) =>
    s.title.toLowerCase().includes(q) ||
    (s.location ?? '').toLowerCase().includes(q)
  )
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredStories.value.length / pageSize)))
const visibleStories = computed(() => filteredStories.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch(searchQuery, () => { page.value = 1 })
watch(totalPages, value => { page.value = Math.min(page.value, value) })

function goToPage(value: number) {
  page.value = Math.min(Math.max(value, 1), totalPages.value)
}
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="내 여행기 모두 보기">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <div class="story-overlay-panel" style="width: min(98vw, 1000px); max-height: 94vh;">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>

      <div class="my-stories-modal-content">
        <div class="mypage-section-header" style="margin-bottom: 24px;">
          <h2 class="mypage-section-title">
            <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">auto_stories</span>내 여행기
          </h2>
          <div class="mypage-header-search-row">
            <div class="mypage-search-inline">
              <span class="material-symbols-rounded">search</span>
              <input type="search" v-model="searchQuery" placeholder="제목, 지역으로 검색" />
            </div>
          </div>
        </div>

        <div v-if="filteredStories.length === 0" class="mypage-empty-state mypage-empty-state--inline">
          <span class="material-symbols-rounded mypage-empty-icon">search_off</span>
          <p class="mypage-empty-title">검색 결과가 없어요</p>
          <p class="mypage-empty-desc">다른 키워드로 검색해 보세요.</p>
        </div>

        <div v-else class="modal-scroll-container my-stories-modal-scroll">
          <div class="mypage-stories-magazine my-stories-modal-grid">
            <button v-for="story in visibleStories" :key="story.id" type="button" class="mypage-story-magazine-item" @click="$emit('storyClick', story.id)">
              <span class="story-magazine-image-wrap">
                <img class="story-magazine-thumb" :src="story.image" :alt="story.title" loading="lazy" />
              </span>
              <span class="story-magazine-body">
                <span class="story-magazine-title" data-no-translate>{{ story.title }}</span>
                <span v-if="story.tags.length" class="story-magazine-tags" data-no-translate>
                  <span v-for="tag in story.tags.slice(0, 3)" :key="tag">#{{ tag }}</span>
                </span>
                <span class="story-magazine-author">
                  <span class="story-magazine-avatar">
                    <img v-if="story.authorProfileImageUrl" :src="story.authorProfileImageUrl" :alt="`${story.author} 프로필 사진`" />
                    <span v-else>{{ story.avatar }}</span>
                  </span>
                  <span class="story-magazine-author-copy">
                    <strong data-no-translate>{{ story.author }}</strong>
                    <span data-no-translate>{{ story.location }}</span>
                  </span>
                </span>
                <span class="story-stats-row">
                  <span><span class="material-symbols-rounded">favorite</span>{{ story.likes }}</span>
                  <span><span class="material-symbols-rounded">chat_bubble</span>{{ story.comments }}</span>
                  <span v-if="story.publishedAt" class="story-published-at">{{ new Date(story.publishedAt).toLocaleDateString('ko-KR') }}</span>
                </span>
              </span>
            </button>
          </div>
        </div>

        <nav v-if="filteredStories.length && totalPages > 1" class="my-stories-pagination" aria-label="내 여행기 페이지 이동">
          <button type="button" :disabled="page === 1" aria-label="이전 페이지" @click="goToPage(page - 1)">
            <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
          </button>
          <button
            v-for="pageNumber in totalPages"
            :key="pageNumber"
            type="button"
            :class="{ active: page === pageNumber }"
            :aria-current="page === pageNumber ? 'page' : undefined"
            :aria-label="`${pageNumber}페이지`"
            @click="goToPage(pageNumber)"
          >
            {{ pageNumber }}
          </button>
          <button type="button" :disabled="page === totalPages" aria-label="다음 페이지" @click="goToPage(page + 1)">
            <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
          </button>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-stories-modal-content {
  display: flex;
  max-height: 94vh;
  flex-direction: column;
  padding: 32px;
}
.my-stories-modal-content > .mypage-section-header {
  padding-right: 48px;
}
.my-stories-modal-scroll {
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  margin: -16px;
}
.my-stories-modal-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.my-stories-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 0 0 auto;
  padding-top: 22px;
}
.my-stories-pagination button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid #dfe8ef;
  border-radius: 50%;
  color: #647c92;
  background: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}
.my-stories-pagination button:hover:not(:disabled),
.my-stories-pagination button.active {
  border-color: #8eb8d5;
  color: #326f9b;
  background: #eaf4ff;
}
.my-stories-pagination button:disabled {
  opacity: 0.35;
  cursor: default;
}
.my-stories-pagination .material-symbols-rounded {
  font-size: 19px;
}
.modal-scroll-container {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.modal-scroll-container::-webkit-scrollbar {
  display: none;
}
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
@media (max-width: 760px) {
  .my-stories-modal-content {
    padding: 24px 18px;
  }
  .my-stories-modal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mypage-section-header,
  .mypage-header-search-row {
    align-items: stretch;
    flex-direction: column;
  }
  .mypage-search-inline input {
    width: 100%;
  }
}
@media (max-width: 480px) {
  .my-stories-modal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
