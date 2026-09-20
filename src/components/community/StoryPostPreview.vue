<script setup lang="ts">
import { useAuthStore } from '@/stores/auth.store'

const auth = useAuthStore()

defineProps<{
  title: string
  location: string
  summary: string
  tags: string[]
  photos: string[]
  photoIndex: number
}>()

defineEmits<{
  prev: []
  next: []
}>()
</script>

<template>
  <article class="story-post-preview" aria-label="작성 미리보기 피드 게시물">
    <div class="story-post-head">
      <div class="story-post-head-row">
        <div class="story-author">
          <div class="fc-avatar">
            <img v-if="auth.user?.profileImageUrl" :src="auth.user.profileImageUrl" alt="내 프로필 사진" />
            <span v-else>{{ auth.user?.displayName?.charAt(0) || '나' }}</span>
          </div>
          <div>
            <strong>{{ auth.user?.displayName || '나' }}</strong>
            <span class="story-preview-location">{{ location }}</span>
          </div>
        </div>
        <button type="button" class="story-report-btn" aria-label="게시글 신고 미리보기" disabled>
          <span class="material-symbols-rounded">campaign</span>
        </button>
      </div>
    </div>

    <div class="story-post-photo-frame">
      <button
        v-if="photos.length > 1"
        type="button"
        class="feed-photo-nav carousel-btn prev-btn prev"
        aria-label="이전 사진"
        @click="$emit('prev')"
      >
        <span class="material-symbols-rounded">chevron_left</span>
      </button>
      <img
        v-if="photos.length"
        :alt="title"
        :src="photos[photoIndex]"
        class="story-post-photo-img"
      />
      <div v-else class="story-post-photo-placeholder">
        <span class="material-symbols-rounded">add_photo_alternate</span>
        <span>사진을 선택하세요</span>
      </div>
      <button
        v-if="photos.length > 1"
        type="button"
        class="feed-photo-nav carousel-btn next-btn next"
        aria-label="다음 사진"
        @click="$emit('next')"
      >
        <span class="material-symbols-rounded">chevron_right</span>
      </button>
      <span v-if="photos.length > 1" class="feed-photo-count">{{ photoIndex + 1 }} / {{ photos.length }}</span>
    </div>

    <div class="story-body">
      <h3>{{ title }}</h3>
      <div class="tag-row">
        <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <p class="story-preview-summary">{{ summary }}</p>
      <div class="story-action-bar">
        <button type="button" class="story-like-button" aria-pressed="false" disabled>
          <span class="material-symbols-rounded">favorite</span>
          0
        </button>
        <span class="story-comment-count">
          <span class="material-symbols-rounded">chat_bubble</span>
          0
        </span>
        <button type="button" class="story-like-button" disabled>
          <span class="material-symbols-rounded">content_copy</span>
          일정 가져오기
        </button>
        <button type="button" class="story-like-button" disabled>
          <span class="material-symbols-rounded">share</span>
          공유
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.story-post-preview {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: auto;
  max-height: none;
  margin-bottom: 0;
  border: 1px solid var(--line);
  border-radius: 24px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 18px 42px rgb(53 70 90 / 14%);
  box-sizing: border-box;
}

.story-post-head {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.story-post-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.story-author {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: default;
}

.fc-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  background: #487db5;
  color: #fff;
  font-weight: 800;
  font-size: 15px;
}
.fc-avatar img { width:100%; height:100%; object-fit:cover; }

.story-author strong {
  display: block;
  color: #35465a;
  font-size: 15px;
  font-weight: 750;
}

.story-preview-location {
  display: block;
  max-width: 240px;
  margin-top: 2px;
  overflow: hidden;
  color: #74899b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-report-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: #fff0f2;
  color: #c95f62;
  cursor: default;
  opacity: 1;
}

.story-report-btn .material-symbols-rounded {
  font-size: 20px;
}

.story-post-photo-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #eef3fb;
  flex-shrink: 0;
}

.story-post-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}

.story-post-photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
  background:
    radial-gradient(circle at 24% 24%, rgb(132 178 210 / 16%) 0 2px, transparent 3px),
    linear-gradient(145deg, #edf5fa, #f9fcfe);
  background-size: 26px 26px, auto;
}

.story-post-photo-placeholder .material-symbols-rounded {
  font-size: 36px;
  color: #6f97b5;
}

.feed-photo-count {
  position: absolute;
  right: 14px;
  bottom: 14px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.story-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 22px 20px 20px;
}

.story-body h3 {
  margin: 0 0 10px;
  font-family:inherit;
  font-size:20px;
  font-weight:800;
  line-height:1.4;
  letter-spacing:normal;
  color: var(--ink);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height:24px;
  padding:0 11px;
  border-radius: 999px;
  border: 1px solid #d7e6f0;
  background: #edf5fa;
  color: #4f718a;
  font-size:12px;
  font-weight:800;
}

.tag:hover {
  background: #e3eff6;
  color: #365f7d;
}

.story-preview-summary {
  display: -webkit-box;
  margin:0 0 14px;
  overflow: hidden;
  color: #647c92;
  font-size:15px;
  line-height:1.7;
  -webkit-box-orient: vertical;
  -webkit-line-clamp:4;
}

.story-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:14px;
  margin-top: 2px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: #111827;
  font-size:12px;
}

.story-like-button,
.story-comment-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: #111827;
  font: inherit;
  font-weight: 800;
  padding: 0;
  cursor: default;
  opacity: 1;
}

.story-like-button .material-symbols-rounded,
.story-comment-count .material-symbols-rounded {
  font-size:20px;
}

.story-like-button .material-symbols-rounded,
.story-comment-count .material-symbols-rounded { color:#111827; }

</style>
