<script setup lang="ts">
defineProps<{
  icon?: string
  title?: string
  message?: string
  description?: string
  actionLabel?: string
}>()

defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="empty-state flex flex-col items-center justify-center py-20 px-6 text-center">
    <span v-if="icon" class="material-symbols-rounded empty-state-icon">{{ icon }}</span>
    <h3 v-if="title" class="empty-state-title">{{ title }}</h3>
    <p v-if="message || description" class="empty-state-description">{{ description ?? message }}</p>
    <div v-if="actionLabel || $slots.default" class="empty-state-action">
      <slot>
        <button v-if="actionLabel" type="button" class="btn primary" @click="$emit('action')">
          {{ actionLabel }}
        </button>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  gap: 14px;
  min-height: 280px;
}

.empty-state-icon {
  font-size: 72px;
  font-variation-settings: 'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48;
  color: var(--line);
  line-height: 1;
}

.empty-state-title {
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0;
}

.empty-state-description {
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
  margin: 0;
  max-width: 420px;
}

.empty-state-action {
  margin-top: 8px;
}

@media (max-width: 640px) {
  .empty-state {
    min-height: 220px;
    padding: 40px 16px;
  }

  .empty-state-icon {
    font-size: 56px;
  }
}
</style>
