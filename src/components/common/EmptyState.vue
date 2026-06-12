<script setup lang="ts">
defineProps<{ message: string; icon?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-20 text-center">
    <span v-if="icon" class="material-symbols-rounded text-5xl text-line mb-4">{{ icon }}</span>
    <p class="text-muted text-sm">{{ message }}</p>
  </div>
</template>
