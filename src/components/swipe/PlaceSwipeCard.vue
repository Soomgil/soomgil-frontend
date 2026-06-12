<script setup lang="ts">
import type { Place } from '@/types/place'

defineProps<{ place: Place }>()
defineEmits<{ swipe: [action: 'LIKE' | 'NOPE' | 'SUPER_LIKE'] }>()
</script>

<template>
  <div class="relative w-full max-w-[380px] aspect-[3/4] rounded-[32px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] cursor-grab select-none">
    <img :src="place.thumbnailUrl ?? ''" :alt="place.placeName" class="absolute inset-0 w-full h-full object-cover" />
    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
    <div class="absolute bottom-0 left-0 right-0 p-6">
      <div class="flex gap-2 mb-3">
        <span v-for="tag in (place.tags ?? []).slice(0, 3)" :key="tag" class="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
          {{ tag }}
        </span>
      </div>
      <h3 class="text-2xl font-black text-white leading-tight">{{ place.placeName }}</h3>
      <p class="text-sm text-white/70 mt-1">{{ place.address }}</p>
    </div>
  </div>
</template>
