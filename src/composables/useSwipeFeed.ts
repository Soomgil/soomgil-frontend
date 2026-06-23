import { storeToRefs } from 'pinia'
import { createSwipeFeedQueue, useSwipeStore } from '@/stores/swipe.store'
import type { SwipeFeedGateway } from '@/stores/swipe.store'

export type { SwipeFeedGateway } from '@/stores/swipe.store'

export function useSwipeFeed(gateway?: SwipeFeedGateway) {
  if (gateway) return createSwipeFeedQueue(gateway)

  const store = useSwipeStore()
  return {
    ...storeToRefs(store),
    load: store.load,
    warm: store.warm,
    ensureLoaded: store.ensureLoaded,
    persistReaction: store.persistReaction,
    advance: store.advance,
    react: store.react,
    refreshTags: store.refreshTags,
    reset: store.reset,
  }
}
