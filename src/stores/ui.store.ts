import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export const useUiStore = defineStore('ui', () => {
  const isLoading = ref(false)
  const sidebarOpen = ref(false)
  const toasts = ref<Toast[]>([])

  function showToast(message: string, type: Toast['type'] = 'info') {
    const id = Date.now().toString()
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 3000)
  }

  function openSidebar() { sidebarOpen.value = true }
  function closeSidebar() { sidebarOpen.value = false }
  function setLoading(v: boolean) { isLoading.value = v }

  return { isLoading, sidebarOpen, toasts, showToast, openSidebar, closeSidebar, setLoading }
})
