import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { swipeApi } from '@/api/swipe.api'
import type { PlaceProvider } from '@/types/place'
import type {
  SwipeAction,
  SwipeFeed,
  SwipeFeedItem,
  SwipeReactionResult,
  SwipeTagStatus,
} from '@/types/swipe'
import type { SwipeFeedParams } from '@/api/swipe.api'

const DISPLAY_QUEUE_SIZE = 5
const FETCH_LIMIT = 20
const PREFETCH_THRESHOLD = 10
const TAG_POLL_INTERVAL_MS = 750

export interface SwipeFeedGateway {
  getFeed(params?: SwipeFeedParams): Promise<SwipeFeed>
  react(provider: PlaceProvider, externalPlaceId: string, reaction: SwipeAction): Promise<SwipeReactionResult>
  getTagStatuses?(externalPlaceIds: string[]): Promise<SwipeTagStatus[]>
}

export function useSwipeFeed(gateway: SwipeFeedGateway = swipeApi) {
  const items = ref<SwipeFeedItem[]>([])
  const currentIndex = ref(0)
  const nextSeed = ref<string | null>(null)
  const loading = ref(false)
  const prefetching = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const lastParams = ref<SwipeFeedParams>({ limit: FETCH_LIMIT, excludeRecent: true })
  let tagPollTimer: ReturnType<typeof setTimeout> | null = null

  const activeQueue = computed(() => items.value.slice(0, DISPLAY_QUEUE_SIZE))
  const queueDepth = computed(() => activeQueue.value.length)
  const currentItem = computed(() => activeQueue.value[0] ?? null)
  const completedCount = computed(() => currentIndex.value)
  const finished = computed(() => !loading.value && !prefetching.value && items.value.length === 0 && !nextSeed.value)

  async function load(params: SwipeFeedParams = lastParams.value) {
    lastParams.value = { limit: FETCH_LIMIT, excludeRecent: true, ...params }
    loading.value = true
    error.value = null
    currentIndex.value = 0
    items.value = []
    nextSeed.value = null
    try {
      const response = await gateway.getFeed(lastParams.value)
      append(response)
      scheduleTagRefresh()
      await maintainBuffer()
    } catch {
      items.value = []
      error.value = '장소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
    } finally {
      loading.value = false
    }
  }

  function append(response: SwipeFeed) {
    const known = new Set(items.value.map((item) => keyOf(item)))
    const additions = response.items
      .filter((item) => !known.has(keyOf(item)))
      .sort((left, right) => tagPriority(left) - tagPriority(right))
    items.value.push(...additions)
    nextSeed.value = response.nextSeed
  }

  async function maintainBuffer(attempt = 0) {
    if (items.value.length > PREFETCH_THRESHOLD || !nextSeed.value || prefetching.value) return
    prefetching.value = true
    const seed = nextSeed.value
    try {
      const response = await gateway.getFeed({ ...lastParams.value, limit: FETCH_LIMIT, seed })
      append(response)
      scheduleTagRefresh()
    } catch {
      // The visible queue remains usable. A later swipe retries prefetch.
    } finally {
      prefetching.value = false
      if (items.value.length <= PREFETCH_THRESHOLD && nextSeed.value && attempt < 2) {
        await maintainBuffer(attempt + 1)
      }
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
    if (items.value.length === 0) return
    items.value.shift()
    currentIndex.value += 1
    void maintainBuffer()
    scheduleTagRefresh()
  }

  async function react(action: SwipeAction): Promise<boolean> {
    const saved = await persistReaction(action)
    if (saved) advance()
    return saved
  }

  function scheduleTagRefresh() {
    if (!gateway.getTagStatuses || tagPollTimer) return
    const pending = items.value.filter((item) => item.place.tagStatus && item.place.tagStatus !== 'READY')
    if (pending.length === 0) return
    tagPollTimer = setTimeout(() => {
      tagPollTimer = null
      void refreshTags()
    }, TAG_POLL_INTERVAL_MS)
  }

  async function refreshTags() {
    if (!gateway.getTagStatuses) return
    const ids = items.value
      .filter((item) => item.place.tagStatus && item.place.tagStatus !== 'READY')
      .slice(0, 50)
      .map((item) => item.place.externalPlaceId)
    if (ids.length === 0) return
    try {
      const statuses = await gateway.getTagStatuses(ids)
      const byId = new Map(statuses.map((status) => [status.externalPlaceId, status]))
      items.value = items.value.map((item) => {
        const status = byId.get(item.place.externalPlaceId)
        if (!status) return item
        return { ...item, place: { ...item.place, tags: status.tags, tagStatus: status.status } }
      })
    } catch {
      // Tag refresh is best-effort; keep the current queue usable during transient failures.
    } finally {
      scheduleTagRefresh()
    }
  }

  function keyOf(item: SwipeFeedItem) {
    return `${item.place.provider}:${item.place.externalPlaceId}`
  }

  function tagPriority(item: SwipeFeedItem) {
    if (!item.place.tagStatus || item.place.tagStatus === 'READY') return 0
    if (item.place.tagStatus === 'REFRESHING') return 1
    return 2
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (tagPollTimer) clearTimeout(tagPollTimer)
    })
  }

  return {
    items,
    currentIndex,
    nextSeed,
    loading,
    prefetching,
    submitting,
    error,
    activeQueue,
    queueDepth,
    currentItem,
    completedCount,
    finished,
    load,
    persistReaction,
    advance,
    react,
    refreshTags,
  }
}
