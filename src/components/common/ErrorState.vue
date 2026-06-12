<script setup lang="ts">
defineProps<{ message?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-20 text-center">
    <span class="material-symbols-rounded text-5xl text-brand-rose mb-4">error</span>
    <p class="text-muted text-sm mb-4">{{ message || '오류가 발생했습니다.' }}</p>
    <button
      class="px-6 py-2 rounded-full bg-brand-violet text-white text-sm font-bold hover:bg-brand-violet/90 transition-colors"
      @click="$emit('retry')"
    >
      다시 시도
    </button>
  </div>
</template>
