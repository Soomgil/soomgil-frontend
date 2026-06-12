<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  src?: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
}>(), {
  color: '#0066ff',
  size: 'md',
})
</script>

<template>
  <div
    v-if="src"
    :class="[
      'rounded-full bg-surface-2 bg-cover bg-center',
      size === 'sm' && 'w-8 h-8 text-xs',
      size === 'md' && 'w-10 h-10 text-sm',
      size === 'lg' && 'w-16 h-16 text-lg',
    ]"
    :style="{ backgroundImage: `url(${src})` }"
    role="img"
    :aria-label="name"
  />
  <div
    v-else
    :class="[
      'rounded-full flex items-center justify-center font-bold text-white shrink-0',
      size === 'sm' && 'w-8 h-8 text-xs',
      size === 'md' && 'w-10 h-10 text-sm',
      size === 'lg' && 'w-16 h-16 text-lg',
    ]"
    :style="{ backgroundColor: color }"
    role="img"
    :aria-label="name"
  >
    {{ name }}
  </div>
</template>
