<script setup lang="ts">
withDefaults(defineProps<{
  glass?: boolean
  padding?: string
}>(), {
  glass: false,
  padding: 'p-6',
})
</script>

<template>
  <div
    :class="[
      padding,
      'rounded-3xl transition-all duration-300',
      glass
        ? 'bg-white/85 border border-white/60 backdrop-blur-[20px] shadow-[0_20px_48px_rgba(0,50,150,0.05),inset_0_1px_1px_#fff]'
        : 'bg-surface border border-line shadow-[0_4px_12px_rgba(0,0,0,0.04)]',
    ]"
  >
    <slot />
  </div>
</template>
