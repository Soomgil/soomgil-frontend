<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Place } from '@/types/place'

const props = defineProps<{ places: Place[] }>()
defineEmits<{ close: [] }>()

const searchQuery = ref('')
const filteredPlaces = computed(() => {
  if (!searchQuery.value.trim()) return props.places
  const q = searchQuery.value.trim().toLowerCase()
  return props.places.filter((p) =>
    p.placeName.toLowerCase().includes(q) ||
    (p.address ?? '').toLowerCase().includes(q) ||
    (p.tags ?? []).some(t => t.toLowerCase().includes(q))
  )
})
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="좋아요한 장소 모두 보기">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <div class="story-overlay-panel" style="width: min(98vw, 1100px); max-height: 94vh;">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>

      <div style="padding: 32px;">
        <div class="mypage-section-header" style="margin-bottom: 24px;">
          <h2 class="mypage-section-title">
            <span class="material-symbols-rounded section-icon section-icon--rose" aria-hidden="true">favorite</span>좋아요한 장소
          </h2>
          <div class="mypage-header-search-row">
            <div class="mypage-search-inline">
              <span class="material-symbols-rounded">search</span>
              <input type="search" v-model="searchQuery" placeholder="장소명, 지역, 태그로 검색" />
            </div>
            <span class="mypage-search-count">{{ filteredPlaces.length }}곳</span>
          </div>
        </div>

        <div style="overflow-y: auto; max-height: calc(94vh - 140px);">
          <div class="mypage-places-grid">
            <div v-for="place in filteredPlaces" :key="place.externalPlaceId" class="mypage-place-card">
              <div class="place-img-wrap">
                <img :src="(place.thumbnailUrl ?? '')" :alt="place.placeName" />
                <button type="button" class="place-heart-btn" aria-label="좋아요 취소">
                  <span class="material-symbols-rounded">favorite</span>
                </button>
              </div>
              <div class="place-info-wrap">
                <span class="place-region-category">{{ place.address }}</span>
                <h3 class="place-title-h3">{{ place.placeName }}</h3>
                <p class="place-desc-text">{{ place.summary }}</p>
                <div class="place-tag-row">
                  <span v-for="tag in (place.tags ?? []).slice(0, 3)" :key="tag" class="place-tag-pill">#{{ tag }}</span>
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
