<script setup lang="ts">
import type { Story } from '@/types/community'
import { formatLikes } from '@/utils/format'

defineProps<{ story: Story }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="group relative flex flex-col rounded-[24px] overflow-hidden bg-surface border border-line hover:border-brand-violet/20 hover:shadow-[0_12px_32px_rgba(0,102,255,0.08)] transition-all text-left"
    @click="$emit('click')"
  >
    <div class="aspect-[4/3] bg-surface-2 overflow-hidden">
      <img :src="story.image" :alt="story.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
    </div>
    <div class="p-4">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-6 h-6 rounded-full bg-brand-violet flex items-center justify-center text-white text-[10px] font-bold">
          {{ story.avatar }}
        </div>
        <span class="text-xs font-semibold text-muted">{{ story.author }}</span>
        <span class="text-xs text-muted/60 ml-auto">{{ story.location }}</span>
      </div>
      <h3 class="font-bold text-ink text-sm leading-snug line-clamp-2">{{ story.title }}</h3>
      <div class="flex items-center gap-3 mt-3 text-xs text-muted">
        <span class="flex items-center gap-1">
          <span class="material-symbols-rounded text-base">favorite</span>
          {{ formatLikes(story.likes) }}
        </span>
        <span class="flex items-center gap-1">
          <span class="material-symbols-rounded text-base">chat_bubble</span>
          {{ story.comments }}
        </span>
      </div>
    </div>
  </button>
</template>
