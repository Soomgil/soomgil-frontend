import { computed, ref } from 'vue'
import type { MapDrawingStroke } from '@/components/map/MapDrawingOverlay.vue'
import type { LngLat } from '@/types/geo'
import type { DrawingPreviewEvent, DrawingPreviewMessage } from '@/types/collaboration'
import { simplifyPathToLimit } from '@/utils/pathSimplification'
import type { RealtimeTransport } from './stompTransport'

export type { DrawingPreviewEvent, DrawingPreviewMessage } from '@/types/collaboration'

interface DrawingPreviewChannelOptions {
  tripId: string
  clientId: string
  transport: RealtimeTransport
  throttleMs?: number
  maxCoordinates?: number
  remoteTtlMs?: number
  currentSessionId?: () => string | null
}

export function drawingPreviewSendDestination(tripId: string) {
  return `/app/trips/${encodeURIComponent(tripId)}/map-drawing-preview`
}

export function drawingPreviewTopic(tripId: string) {
  return `/topic/trips/${encodeURIComponent(tripId)}/map-drawings`
}

export function downsampleCoordinates(coordinates: LngLat[], maxCoordinates: number) {
  return simplifyPathToLimit(coordinates, maxCoordinates, ({ lng, lat }) => ({ x: lng, y: lat }))
}

export function useDrawingPreviewChannel(options: DrawingPreviewChannelOptions) {
  const throttleMs = options.throttleMs ?? 50
  const maxCoordinates = options.maxCoordinates ?? 100
  const remoteTtlMs = options.remoteTtlMs ?? 10000
  const remoteByKey = ref(new Map<string, MapDrawingStroke>())
  const remoteExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const remoteSequences = new Map<string, number>()
  let unsubscribe: (() => void) | null = null
  let pendingEvent: DrawingPreviewEvent | null = null
  let throttleTimer: ReturnType<typeof setTimeout> | null = null
  let lastPublishedAt = 0
  const sentSegments = new Map<string, { coordinates: LngLat[]; sentAt: number; phase: DrawingPreviewMessage['phase'] }>()
  const receivedSegments = new Map<string, Map<number, { sequence: number; coordinates: LngLat[] }>>()

  const remoteDrawings = computed(() => [...remoteByKey.value.values()])

  function publishNow(event: DrawingPreviewEvent) {
    const now = Date.now()
    const size = Math.max(2, Math.min(100, maxCoordinates))
    const coordinates = event.phase === 'CANCEL' ? [] : event.coordinates
    for (let offset = 0; offset < Math.max(1, coordinates.length); offset += size) {
      const segment = coordinates.slice(offset, offset + size)
      const key = `${event.previewId}:${offset}`
      const previous = sentSegments.get(key)
      const phase = event.phase === 'UPDATE' && offset + size < coordinates.length ? 'END' : event.phase
      // 확정 구간은 유지한다. 중도 입장·재연결을 위해 2초마다 다시 전송한다.
      if (event.phase === 'UPDATE' && previous && previous.phase === phase && now - previous.sentAt < 2000
        && previous.coordinates.length === segment.length
        && previous.coordinates.every((point, index) => point.lng === segment[index]!.lng && point.lat === segment[index]!.lat)) continue
      const payload: DrawingPreviewMessage = {
        ...event,
        // 완료한 구간은 END로 보내 서버의 UPDATE throttle에 유실되지 않게 한다.
        phase,
        coordinateOffset: offset,
        tripId: options.tripId,
        clientId: options.clientId,
        coordinates: segment,
        sentAt: new Date(now).toISOString(),
      }
      if (options.transport.publish(drawingPreviewSendDestination(options.tripId), payload)) {
        sentSegments.set(key, { coordinates: segment, sentAt: now, phase })
        lastPublishedAt = now
      }
    }
    if (event.phase !== 'UPDATE') {
      for (const key of sentSegments.keys()) {
        if (key.startsWith(`${event.previewId}:`)) sentSegments.delete(key)
      }
    }
  }

  function publish(event: DrawingPreviewEvent) {
    if (event.phase !== 'UPDATE') {
      if (throttleTimer) clearTimeout(throttleTimer)
      throttleTimer = null
      pendingEvent = null
      publishNow(event)
      return
    }
    const remaining = throttleMs - (Date.now() - lastPublishedAt)
    if (remaining <= 0) {
      publishNow(event)
      return
    }
    pendingEvent = event
    if (throttleTimer) return
    throttleTimer = setTimeout(() => {
      throttleTimer = null
      const next = pendingEvent
      pendingEvent = null
      if (next) publishNow(next)
    }, remaining)
  }

  function isDrawingPreviewMessage(message: unknown): message is DrawingPreviewMessage {
    if (!message || typeof message !== 'object') return false
    const candidate = message as Partial<DrawingPreviewMessage>
    const coordinates = candidate.coordinates
    return typeof candidate.tripId === 'string'
      && typeof candidate.clientId === 'string'
      && typeof candidate.previewId === 'string'
      && typeof candidate.sequence === 'number'
      && Number.isSafeInteger(candidate.sequence)
      && candidate.sequence >= 0
      && (candidate.coordinateOffset === undefined
        || (Number.isSafeInteger(candidate.coordinateOffset) && candidate.coordinateOffset >= 0))
      && (candidate.phase === 'UPDATE' || candidate.phase === 'END' || candidate.phase === 'CANCEL')
      && Array.isArray(coordinates)
      && coordinates.every((coordinate) => (
        typeof coordinate === 'object'
        && coordinate !== null
        && typeof (coordinate as Partial<LngLat>).lng === 'number'
        && Number.isFinite((coordinate as Partial<LngLat>).lng)
        && typeof (coordinate as Partial<LngLat>).lat === 'number'
        && Number.isFinite((coordinate as Partial<LngLat>).lat)
      ))
      && typeof candidate.color === 'string'
      && typeof candidate.width === 'number'
      && Number.isFinite(candidate.width)
      && candidate.width > 0
  }

  function receive(message: unknown) {
    if (!isDrawingPreviewMessage(message)) return
    if (message.tripId !== options.tripId
      || message.clientId === options.clientId
      || message.clientId === options.currentSessionId?.()) return
    const key = `${message.clientId}:${message.previewId}`
    if ((remoteSequences.get(key) ?? -1) >= message.sequence) return
    if (message.coordinateOffset !== undefined && message.phase !== 'CANCEL') {
      const segments = receivedSegments.get(key) ?? new Map()
      if ((segments.get(message.coordinateOffset)?.sequence ?? -1) >= message.sequence) return
      segments.set(message.coordinateOffset, { sequence: message.sequence, coordinates: message.coordinates })
      receivedSegments.set(key, segments)
    } else {
      remoteSequences.set(key, message.sequence)
      receivedSegments.delete(key)
    }
    const expiryTimer = remoteExpiryTimers.get(key)
    if (expiryTimer) clearTimeout(expiryTimer)
    if (message.phase === 'CANCEL') {
      remoteByKey.value.delete(key)
      remoteByKey.value = new Map(remoteByKey.value)
      remoteExpiryTimers.set(key, setTimeout(() => {
        remoteExpiryTimers.delete(key)
        remoteSequences.delete(key)
        receivedSegments.delete(key)
      }, remoteTtlMs))
      return
    }
    let coordinates = message.coordinates
    if (message.coordinateOffset !== undefined) {
      coordinates = []
      // 빠진 구간을 가로지르는 선분을 만들지 않고, 연속 수신한 앞부분만 표시한다.
      const segments = receivedSegments.get(key)!
      while (segments.has(coordinates.length)) {
        const segment = segments.get(coordinates.length)!.coordinates
        if (segment.length === 0) break
        coordinates.push(...segment)
      }
    }
    remoteByKey.value.set(key, {
      id: `remote:${key}`,
      coordinates,
      color: message.color,
      width: message.width,
    })
    remoteByKey.value = new Map(remoteByKey.value)
    remoteExpiryTimers.set(key, setTimeout(() => {
      remoteExpiryTimers.delete(key)
      remoteSequences.delete(key)
      receivedSegments.delete(key)
      remoteByKey.value.delete(key)
      remoteByKey.value = new Map(remoteByKey.value)
    }, remoteTtlMs))
  }

  function connect() {
    if (!unsubscribe) {
      unsubscribe = options.transport.subscribe<unknown>(drawingPreviewTopic(options.tripId), receive)
    }
    options.transport.connect()
  }

  async function disconnect() {
    unsubscribe?.()
    unsubscribe = null
    if (throttleTimer) clearTimeout(throttleTimer)
    throttleTimer = null
    pendingEvent = null
    remoteExpiryTimers.forEach(clearTimeout)
    remoteExpiryTimers.clear()
    remoteSequences.clear()
    receivedSegments.clear()
    sentSegments.clear()
    remoteByKey.value = new Map()
    await options.transport.disconnect()
  }

  return { remoteDrawings, publish, connect, disconnect }
}
