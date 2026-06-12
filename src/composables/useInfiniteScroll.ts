import { ref, onUnmounted } from 'vue'

export function useInfiniteScroll(loadMore: () => Promise<void>, threshold = 200) {
  const loading = ref(false)
  let observer: IntersectionObserver | null = null

  async function handleIntersect() {
    if (loading.value) return
    loading.value = true
    try {
      await loadMore()
    } finally {
      loading.value = false
    }
  }

  function setupSentinel(el: HTMLElement) {
    observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) handleIntersect() },
      { rootMargin: `${threshold}px` },
    )
    observer.observe(el)
  }

  onUnmounted(() => { observer?.disconnect() })

  return { loading, setupSentinel }
}
