<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'ghost' | 'premium' | 'icon'
  icon?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'primary',
  type: 'button',
})

defineEmits<{ click: [e: MouseEvent] }>()
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center gap-2 font-bold transition-all duration-300 cursor-pointer',
      variant === 'primary' && 'bg-brand-violet text-white px-6 py-3 rounded-full shadow-[0_10px_30px_rgba(0,102,255,0.3)] hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(0,102,255,0.35)]',
      variant === 'ghost' && 'bg-transparent text-ink px-6 py-3 rounded-full border border-line hover:bg-surface-2',
      variant === 'premium' && 'bg-gradient-to-br from-brand-violet to-brand-blue text-white px-12 py-4 text-lg rounded-full shadow-[0_10px_30px_rgba(0,102,255,0.3)] hover:-translate-y-1',
      variant === 'icon' && 'w-10 h-10 rounded-xl bg-surface border border-line hover:bg-surface-2',
      disabled && 'opacity-50 pointer-events-none',
    ]"
    @click="$emit('click', $event)"
  >
    <span v-if="icon" class="material-symbols-rounded" :class="variant === 'premium' ? 'text-xl' : 'text-[22px]'">{{ icon }}</span>
    <slot />
  </button>
</template>
