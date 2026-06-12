<script setup lang="ts">
import type { Trip } from '@/types/trip'
import BaseAvatar from '@/components/common/BaseAvatar.vue'
import { formatDDay } from '@/utils/date'

defineProps<{ trip: Trip }>()
defineEmits<{ detail: [] }>()
</script>

<template>
  <div
    class="boarding-pass-card relative flex rounded-[32px] overflow-hidden shadow-[0_20px_60px_rgba(0,102,255,0.08)] border border-line/50"
    :style="{ backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.95), rgba(244,249,255,0.98)), url(${trip.coverImageUrl})` }"
  >
    <!-- Left ticket -->
    <div class="ticket-main flex-1 p-8">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <img src="@/assets/images/soomgil_logo_none_text.png" alt="숨길" class="w-8 h-8 rounded-lg" />
          <span class="text-xs font-black tracking-wider text-muted">SOOMGIL AIR</span>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-black bg-brand-violet/10 text-brand-violet">
          {{ formatDDay(trip.startDate ?? '') }}
        </span>
      </div>

      <div class="flex items-center gap-4 mb-6">
        <div class="text-center">
          <span class="text-2xl font-black text-ink">SEL</span>
          <span class="block text-[10px] text-muted mt-0.5">서울</span>
        </div>
        <div class="flex-1 flex items-center gap-2">
          <span class="flex-1 h-px bg-line" />
          <span class="material-symbols-rounded text-brand-violet">flight</span>
          <span class="flex-1 h-px bg-line" />
        </div>
        <div class="text-center">
          <span class="text-2xl font-black text-ink">{{ trip.destinationCode || 'DJE' }}</span>
          <span class="block text-[10px] text-muted mt-0.5">{{ trip.destinationName?.split('(')[0] || '대전' }}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 text-xs">
        <div><span class="text-muted">PASSENGER</span><br><span class="font-bold text-ink">{{ trip.passengerCount || (trip.members ?? []).length }}명</span></div>
        <div><span class="text-muted">DATE</span><br><span class="font-bold text-ink">{{ (trip.startDate ?? '').replace(/-/g, '.') }}</span></div>
        <div><span class="text-muted">DESTINATIONS</span><br><span class="font-bold text-ink">{{ trip.placeCount || (trip.places ?? []).length }}곳</span></div>
        <div><span class="text-muted">CHECKLIST</span><br><span class="font-bold text-ink">{{ trip.checklistProgress || '0/0' }}</span></div>
      </div>

      <div>
        <span class="text-[10px] text-muted font-bold tracking-wider">COMPANIONS</span>
        <div class="flex -space-x-2 mt-1">
          <BaseAvatar v-for="m in (trip.members ?? []).slice(0, 4)" :key="m.id" :name="m.displayName ?? '?'" color="var(--violet)" size="sm" />
          <div v-if="(trip.members ?? []).length > 4" class="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-xs font-bold text-muted border-2 border-surface">
            +{{ (trip.members ?? []).length - 4 }}
          </div>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="ticket-divider flex flex-col items-center justify-center w-[1px] bg-transparent relative">
      <span class="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-bg" />
      <span class="border-l border-dashed border-line h-full" />
      <span class="absolute -bottom-3 -left-3 w-6 h-6 rounded-full bg-bg" />
    </div>

    <!-- Right stub -->
    <div class="ticket-stub w-[260px] p-6 flex flex-col justify-between">
      <div>
        <span class="text-[10px] text-muted font-bold tracking-wider">BOARDING PASS</span>
        <h2 class="text-lg font-black text-ink mt-1 leading-tight">{{ trip.title }}</h2>
        <p class="text-xs text-muted mt-1">{{ (trip.startDate ?? '').replace(/-/g, '. ') }} · {{ (trip.members ?? []).length }}명</p>
      </div>
      <button
        class="mt-4 flex items-center gap-1 text-sm font-bold text-brand-violet hover:gap-2 transition-all"
        @click="$emit('detail')"
      >
        자세히 보기
        <span class="material-symbols-rounded text-base">arrow_forward</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.boarding-pass-card {
  background-size: cover;
  background-position: center;
}
</style>
