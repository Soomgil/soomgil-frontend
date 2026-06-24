<script setup lang="ts">
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
            <span>나</span>
          </div>
          <div>
            <strong>나</strong>
            <span class="small muted">{{ location }}</span>
          </div>
        </div>
        <button type="button" class="story-report-btn" aria-label="게시글 신고" title="신고" disabled>
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
        v-if="photos.length > 0"
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
      <p class="muted">{{ summary }}</p>
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
          리트립
        </button>
        <button type="button" class="story-like-button" disabled>
          <span class="material-symbols-rounded">share</span>
          공유
        </button>
        <button type="button" class="story-like-button" disabled>
          <span class="material-symbols-rounded">edit</span>
          수정
        </button>
        <button type="button" class="story-like-button" disabled>
          <span class="material-symbols-rounded">delete</span>
          삭제
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
  height: 100%;
  max-height: none;
  margin-bottom: 0;
  border: 1px solid var(--line);
  border-radius: 28px;
  overflow-y: auto;
  overflow-x: hidden;
  background: #fff;
  box-shadow: var(--soft-shadow);
  box-sizing: border-box;
  scrollbar-width: none;
  -ms-overflow-style: none;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.story-post-preview::-webkit-scrollbar {
  display: none;
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
  background: var(--violet);
  color: #fff;
  font-weight: 800;
  font-size: 15px;
}

.story-author strong {
  display: block;
  font-size: 15px;
  color: var(--violet);
}

.story-author .small {
  display: block;
}

.story-report-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 92, 141, 0.1);
  color: var(--rose);
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
  background: linear-gradient(135deg, #eef3fb, #f8fbff);
}

.story-post-photo-placeholder .material-symbols-rounded {
  font-size: 40px;
  color: var(--violet);
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
  padding: 24px;
}

.story-body h3 {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.4;
  color: var(--ink);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(109, 74, 255, 0.1);
  color: var(--violet);
  font-size: 12px;
  font-weight: 800;
}

.story-body p {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
}

.story-action-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 14px;
}

.story-like-button,
.story-comment-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-weight: 800;
  padding: 0;
  cursor: default;
  opacity: 1;
}

.story-like-button .material-symbols-rounded,
.story-comment-count .material-symbols-rounded {
  font-size: 20px;
}

.story-like-button:first-child .material-symbols-rounded {
  color: var(--rose);
}

.story-comment-count .material-symbols-rounded {
  color: var(--violet);
}
</style>
