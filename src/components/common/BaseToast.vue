<script setup lang="ts">
import { useUiStore } from '@/stores/ui.store'

const ui = useUiStore()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      tag="div"
      name="toast"
      class="toast-stack"
    >
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="toast-item"
        :class="`toast-item--${toast.type}`"
        role="status"
      >
        <span class="material-symbols-rounded" aria-hidden="true">{{ toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info' }}</span>
        <span>{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toast-stack { position: fixed; bottom: max(20px, env(safe-area-inset-bottom)); left: 50%; z-index: 9999; display: flex; flex-direction: column; gap: 8px; width: max-content; max-width: calc(100vw - 32px); transform: translateX(-50%); pointer-events: none; }
.toast-item { display: flex; align-items: center; gap: 10px; max-width: 100%; padding: 12px 18px; border: 1px solid #dfeaf5; border-radius: 14px; background: rgb(255 255 255 / 96%); box-shadow: 0 12px 40px rgb(37 66 91 / 16%); backdrop-filter: blur(16px); color: #35465a; font-size: 14px; font-weight: 700; line-height: 1.4; }
.toast-item .material-symbols-rounded { flex: 0 0 auto; color: #3f8b72; font-size: 19px; }
.toast-item--error { border-color: #f3d5da; }
.toast-item--error .material-symbols-rounded { color: #ba5264; }
.toast-item--info .material-symbols-rounded { color: #487db5; }
.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateY(40px); }
.toast-leave-to { opacity: 0; transform: translateY(40px); }
</style>
