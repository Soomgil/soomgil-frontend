import { ref } from 'vue'
import type { SwipeAction } from '@/types/swipe'

export function useSwipe(onAction: (action: SwipeAction) => void) {
  const startX = ref(0)
  const currentX = ref(0)
  const isDragging = ref(false)
  const offsetX = ref(0)
  const rotation = ref(0)

  function handleStart(x: number) {
    startX.value = x
    isDragging.value = true
  }

  function handleMove(x: number) {
    if (!isDragging.value) return
    currentX.value = x
    offsetX.value = currentX.value - startX.value
    rotation.value = offsetX.value * 0.1
  }

  function handleEnd() {
    isDragging.value = false
    const threshold = 100
    if (offsetX.value > threshold) {
      onAction('LIKE')
    } else if (offsetX.value < -threshold) {
      onAction('NOPE')
    } else if (offsetX.value === 0) {
      // no action
    }
    offsetX.value = 0
    rotation.value = 0
  }

  function onTouchStart(e: TouchEvent) { handleStart(e.touches[0].clientX) }
  function onTouchMove(e: TouchEvent) { handleMove(e.touches[0].clientX) }
  function onTouchEnd() { handleEnd() }
  function onMouseDown(e: MouseEvent) { handleStart(e.clientX) }
  function onMouseMove(e: MouseEvent) { handleMove(e.clientX) }
  function onMouseUp() { handleEnd() }

  return {
    offsetX, rotation, isDragging,
    onTouchStart, onTouchMove, onTouchEnd,
    onMouseDown, onMouseMove, onMouseUp,
  }
}
