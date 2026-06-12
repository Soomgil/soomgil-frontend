<script setup lang="ts">
import type { Trip } from '@/types/trip'
import BaseAvatar from '@/components/common/BaseAvatar.vue'

defineProps<{ trip: Trip }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="flex items-center gap-4 p-4 rounded-2xl bg-surface border border-line hover:border-brand-violet/30 hover:shadow-[0_8px_24px_rgba(0,102,255,0.06)] transition-all text-left w-full"
    @click="$emit('click')"
  >
    <div class="w-16 h-16 rounded-xl bg-cover bg-center shrink-0" :style="{ backgroundImage: `url(${trip.coverImageUrl ?? ''})` }" />
    <div class="flex-1 min-w-0">
      <h3 class="font-bold text-ink truncate">{{ trip.title }}</h3>
      <p class="text-xs text-muted mt-0.5">{{ trip.startDate }}</p>
      <div class="flex -space-x-1.5 mt-2">
        <BaseAvatar v-for="m in (trip.members ?? []).slice(0, 3)" :key="m.id" :name="m.displayName ?? '?'" color="var(--violet)" size="sm" />
      </div>
    </div>
    <span class="material-symbols-rounded text-muted">chevron_right</span>
  </button>
</template>
