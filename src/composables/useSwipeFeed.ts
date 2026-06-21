import { computed, ref } from 'vue'
import { swipeApi } from '@/api/swipe.api'
import type { PlaceProvider } from '@/types/place'
import type { SwipeAction, SwipeFeed, SwipeFeedItem, SwipeReactionResult } from '@/types/swipe'
import type { SwipeFeedParams } from '@/api/swipe.api'

export interface SwipeFeedGateway {
  getFeed(params?: SwipeFeedParams): Promise<SwipeFeed>
  react(provider: PlaceProvider, externalPlaceId: string, reaction: SwipeAction): Promise<SwipeReactionResult>
}

export function useSwipeFeed(gateway: SwipeFeedGateway = swipeApi) {
  const items = ref<SwipeFeedItem[]>([])
  const currentIndex = ref(0)
  const nextSeed = ref<string | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const lastParams = ref<SwipeFeedParams>({ limit: 20, excludeRecent: true })

  const currentItem = computed(() => items.value[currentIndex.value] ?? null)
  const completedCount = computed(() => Math.min(currentIndex.value, items.value.length))
  const finished = computed(() => !loading.value && currentIndex.value >= items.value.length)

  async function load(params: SwipeFeedParams = lastParams.value) {
    lastParams.value = { limit: 20, excludeRecent: true, ...params }
    loading.value = true
    error.value = null
    try {
      const response = await gateway.getFeed(lastParams.value)
      items.value = response.items
      nextSeed.value = response.nextSeed
      currentIndex.value = 0
    } catch {
      items.value = []
      error.value = '장소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
    } finally {
      loading.value = false
    }
  }

  async function persistReaction(action: SwipeAction): Promise<boolean> {
    const item = currentItem.value
    if (!item || submitting.value) return false
    submitting.value = true
    error.value = null
    try {
      await gateway.react(item.place.provider, item.place.externalPlaceId, action)
      return true
    } catch {
      error.value = '반응을 저장하지 못했습니다. 다시 시도해 주세요.'
      return false
    } finally {
      submitting.value = false
    }
  }

  function advance() {
    if (currentIndex.value < items.value.length) currentIndex.value += 1
  }

  async function react(action: SwipeAction): Promise<boolean> {
    const saved = await persistReaction(action)
    if (saved) advance()
    return saved
  }

  return {
    items,
    currentIndex,
    nextSeed,
    loading,
    submitting,
    error,
    currentItem,
    completedCount,
    finished,
    load,
    persistReaction,
    advance,
    react,
  }
}
