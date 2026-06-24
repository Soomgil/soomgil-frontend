<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  variant?: 'chip' | 'ghost' | 'icon'
}>(), {
  label: '설정',
  variant: 'chip',
})

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="trip-settings-button"
    :class="`trip-settings-button--${variant}`"
    :aria-label="label"
    @click="$emit('click')"
  >
    <span class="material-symbols-rounded" aria-hidden="true">settings</span>
    <span v-if="variant !== 'icon'" class="trip-settings-button__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.trip-settings-button {
  align-items: center;
  border: 1px solid var(--line);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font-weight: 800;
  gap: 5px;
  justify-content: center;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.trip-settings-button .material-symbols-rounded {
  font-size: 16px;
}

.trip-settings-button:hover {
  border-color: rgba(0, 102, 255, 0.28);
  color: var(--violet);
  transform: translateY(-1px);
}

.trip-settings-button--chip {
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 11px;
}

.trip-settings-button--ghost {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  background: #fff;
  font-size: 11px;
}

.trip-settings-button--icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 999px;
  background: rgba(0, 102, 255, 0.06);
  color: var(--violet);
}

.trip-settings-button--icon .material-symbols-rounded {
  font-size: 17px;
}
</style>
