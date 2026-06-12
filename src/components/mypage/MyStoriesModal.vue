<script setup lang="ts">
import type { Story } from '@/types/community'

defineProps<{ stories: Story[] }>()
defineEmits<{ close: [] }>()
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
        </div>

        <div style="overflow-y: auto; max-height: calc(94vh - 120px);">
          <div class="mypage-stories-magazine">
            <div v-for="story in stories" :key="story.id" class="mypage-story-magazine-item">
              <img class="story-magazine-thumb" :src="story.image" :alt="story.title" />
              <div class="story-magazine-body">
                <h3 class="story-magazine-title">
                  <a href="#">{{ story.title }}</a>
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
