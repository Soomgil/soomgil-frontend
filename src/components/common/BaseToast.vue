<script setup lang="ts">
import { useUiStore } from '@/stores/ui.store'

const ui = useUiStore()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      tag="div"
      name="toast"
      class="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-2"
    >
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        :class="[
          'px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg backdrop-blur-md',
          toast.type === 'success' && 'bg-emerald-500/90 text-white',
          toast.type === 'error' && 'bg-red-500/90 text-white',
          toast.type === 'info' && 'bg-brand-violet/90 text-white',
        ]"
      >
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateY(40px); }
.toast-leave-to { opacity: 0; transform: translateY(40px); }
</style>
