<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'default' | 'd-day' | 'status'
}>(), {
  variant: 'default',
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold',
      variant === 'd-day' && 'bg-brand-violet/10 text-brand-violet',
      variant === 'status' && 'bg-brand-cyan/10 text-brand-cyan',
      variant === 'default' && 'bg-surface-2 text-muted',
    ]"
  >
    <slot />
  </span>
</template>
