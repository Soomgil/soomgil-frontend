import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeTransport } from './stompTransport'
import {
  downsampleCoordinates,
  drawingPreviewSendDestination,
  drawingPreviewTopic,
  useDrawingPreviewChannel,
  type DrawingPreviewMessage,
} from './drawingPreview'

class FakeTransport implements RealtimeTransport {
  connected = false
  published: Array<{ destination: string; payload: unknown }> = []
  private subscriptions = new Map<string, (payload: unknown) => void>()

  connect() {
    this.connected = true
  }

  async disconnect() {
    this.connected = false
  }

  publish(destination: string, payload: unknown) {
    if (!this.connected) return false
    this.published.push({ destination, payload })
    return true
  }

  subscribe<T>(destination: string, handler: (payload: T) => void) {
    this.subscriptions.set(destination, handler as (payload: unknown) => void)
    return () => this.subscriptions.delete(destination)
  }

  receive(destination: string, payload: unknown) {
    this.subscriptions.get(destination)?.(payload)
  }
}

describe('drawing preview realtime channel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-21T05:00:00Z'))
  })

  it('긴 획을 100점 이하 구간으로 중계하고 팀원의 기존 좌표를 그대로 유지한다', async () => {
    const senderTransport = new FakeTransport()
    const receiverTransport = new FakeTransport()
    const sender = useDrawingPreviewChannel({ tripId: 'trip-1', clientId: 'sender', transport: senderTransport })
    const receiver = useDrawingPreviewChannel({ tripId: 'trip-1', clientId: 'receiver', transport: receiverTransport })
    sender.connect()
    receiver.connect()
    const coordinates = Array.from({ length: 10001 }, (_, index) => ({
      lng: 127 + Math.sin(index / 17) / 100,
      lat: 36 + Math.cos(index / 23) / 100,
    }))
    const draft = { previewId: 'long-stroke', color: '#ef4444', width: 6 }
    const relay = () => {
      const packets = senderTransport.published.splice(0)
      packets.forEach(({ payload }) => {
        const message = payload as DrawingPreviewMessage
        expect(message.coordinates.length).toBeLessThanOrEqual(100)
        receiverTransport.receive(drawingPreviewTopic('trip-1'), { ...message, clientId: 'server-session' })
      })
      return packets
    }
    sender.publish({ ...draft, sequence: 1, phase: 'UPDATE', coordinates: coordinates.slice(0, 1001) })
    relay()
    expect(receiver.remoteDrawings.value[0]!.coordinates).toEqual(coordinates.slice(0, 1001))
    vi.advanceTimersByTime(50)
    sender.publish({ ...draft, sequence: 2, phase: 'UPDATE', coordinates: coordinates.slice(0, 1101) })
    expect(relay()).toHaveLength(2)
    expect(receiver.remoteDrawings.value[0]!.coordinates).toEqual(coordinates.slice(0, 1101))
    vi.advanceTimersByTime(50)
    sender.publish({ ...draft, sequence: 3, phase: 'UPDATE', coordinates })
    relay()
    expect(receiver.remoteDrawings.value[0]!.coordinates).toEqual(coordinates)
    sender.publish({ ...draft, sequence: 4, phase: 'END', coordinates })
    relay()
    expect(receiver.remoteDrawings.value[0]!.coordinates).toEqual(coordinates)
    await sender.disconnect()
    await receiver.disconnect()
  })

  it('구간이 역순으로 도착해도 빈 구간을 가로지르지 않고 취소 후 재생하지 않는다', async () => {
    const transport = new FakeTransport()
    const receiver = useDrawingPreviewChannel({ tripId: 'trip-1', clientId: 'receiver', transport })
    receiver.connect()
    const message: DrawingPreviewMessage = {
      tripId: 'trip-1', clientId: 'sender', previewId: 'stroke', sequence: 1,
      phase: 'END', coordinateOffset: 2, coordinates: [{ lng: 127.2, lat: 36 }],
      color: '#ef4444', width: 4, sentAt: new Date().toISOString(),
    }
    const topic = drawingPreviewTopic('trip-1')
    transport.receive(topic, message)
    expect(receiver.remoteDrawings.value[0]!.coordinates).toEqual([])
    transport.receive(topic, { ...message, coordinateOffset: 0, coordinates: [{ lng: 127, lat: 36 }, { lng: 127.1, lat: 36 }] })
    expect(receiver.remoteDrawings.value[0]!.coordinates).toHaveLength(3)
    transport.receive(topic, { ...message, sequence: 0, coordinates: [{ lng: 128, lat: 37 }] })
    expect(receiver.remoteDrawings.value[0]!.coordinates.at(-1)).toEqual({ lng: 127.2, lat: 36 })
    transport.receive(topic, { ...message, sequence: 2, phase: 'CANCEL', coordinates: [] })
    transport.receive(topic, message)
    expect(receiver.remoteDrawings.value).toEqual([])
    await receiver.disconnect()
  })

  it('중도 입장한 팀원에게 확정 구간을 재전송하고 긴 획의 앞부분도 함께 유지한다', async () => {
    const senderTransport = new FakeTransport()
    const receiverTransport = new FakeTransport()
    const sender = useDrawingPreviewChannel({ tripId: 'trip-1', clientId: 'sender', transport: senderTransport })
    const receiver = useDrawingPreviewChannel({ tripId: 'trip-1', clientId: 'receiver', transport: receiverTransport, remoteTtlMs: 3000 })
    sender.connect()
    receiver.connect()
    const draft = { previewId: 'stroke', color: '#ef4444', width: 4, phase: 'UPDATE' as const }
    const coordinates = Array.from({ length: 401 }, (_, i) => ({ lng: 127 + i / 10000, lat: 36 }))
    sender.publish({ ...draft, sequence: 1, coordinates: coordinates.slice(0, 201) })
    senderTransport.published.splice(0)
    vi.advanceTimersByTime(2100)
    sender.publish({ ...draft, sequence: 2, coordinates: coordinates.slice(0, 301) })
    senderTransport.published.splice(0).forEach(({payload}) => receiverTransport.receive(drawingPreviewTopic('trip-1'), payload))
    expect(receiver.remoteDrawings.value[0]!.coordinates).toEqual(coordinates.slice(0, 301))
    vi.advanceTimersByTime(2100)
    sender.publish({ ...draft, sequence: 3, coordinates })
    senderTransport.published.splice(0).forEach(({payload}) => receiverTransport.receive(drawingPreviewTopic('trip-1'), payload))
    expect(receiver.remoteDrawings.value[0]!.coordinates).toEqual(coordinates)
    vi.advanceTimersByTime(3000)
    expect(receiver.remoteDrawings.value).toEqual([])
    await sender.disconnect()
    await receiver.disconnect()
  })

  it('좌표의 처음·끝과 큰 굴곡을 유지하며 최대 개수 이하로 줄인다', () => {
    const coordinates = Array.from({ length: 101 }, (_, index) => ({
      lng: index,
      lat: index === 50 ? 100 : 0,
    }))
    const sampled = downsampleCoordinates(coordinates, 32)

    expect(sampled.length).toBeLessThanOrEqual(32)
    expect(sampled[0]).toEqual(coordinates[0])
    expect(sampled.at(-1)).toEqual(coordinates.at(-1))
    expect(sampled).toContainEqual(coordinates[50])
  })

  it('UPDATE를 throttle하고 END는 즉시 전송한다', () => {
    const transport = new FakeTransport()
    const channel = useDrawingPreviewChannel({
      tripId: 'trip 1',
      clientId: 'client-1',
      transport,
      throttleMs: 50,
      maxCoordinates: 3,
    })
    channel.connect()
    const coordinates = Array.from({ length: 3 }, (_, index) => ({ lng: index, lat: index }))

    channel.publish({ previewId: 'stroke-1', sequence: 1, phase: 'UPDATE', coordinates, color: '#111827', width: 4 })
    channel.publish({ previewId: 'stroke-1', sequence: 2, phase: 'UPDATE', coordinates: coordinates.map(p => ({ ...p, lat: p.lat + 1 })), color: '#111827', width: 4 })
    expect(transport.published).toHaveLength(1)

    vi.advanceTimersByTime(50)
    expect(transport.published).toHaveLength(2)
    expect(transport.published[1]?.destination).toBe(drawingPreviewSendDestination('trip 1'))
    expect((transport.published[1]?.payload as DrawingPreviewMessage).coordinates.length).toBeLessThanOrEqual(3)

    channel.publish({ previewId: 'stroke-1', sequence: 3, phase: 'END', coordinates, color: '#111827', width: 4 })
    expect(transport.published).toHaveLength(3)
  })

  it('기본 실시간 미리보기는 자연스러운 선을 위해 최대 100개 좌표를 전달한다', () => {
    const transport = new FakeTransport()
    const channel = useDrawingPreviewChannel({
      tripId: 'trip-1',
      clientId: 'client-1',
      transport,
    })
    channel.connect()
    const coordinates = Array.from({ length: 80 }, (_, index) => ({
      lng: 127 + index / 1000,
      lat: 36 + Math.sin(index / 4) / 100,
    }))

    channel.publish({ previewId: 'stroke-1', sequence: 1, phase: 'UPDATE', coordinates, color: '#111827', width: 4 })

    expect((transport.published[0]!.payload as DrawingPreviewMessage).coordinates).toHaveLength(80)
  })

  it('자기 echo를 제외하고 원격 preview를 반영·취소·만료한다', async () => {
    const transport = new FakeTransport()
    const channel = useDrawingPreviewChannel({
      tripId: 'trip-1',
      clientId: 'client-1',
      transport,
      remoteTtlMs: 1000,
      currentSessionId: () => 'session-1',
    })
    channel.connect()
    const message: DrawingPreviewMessage = {
      tripId: 'trip-1', clientId: 'client-2', previewId: 'stroke-1', sequence: 1,
      phase: 'UPDATE', coordinates: Array.from({ length: 40 }, (_, index) => ({ lng: 127 + index, lat: 36 })),
      color: '#ef4444', width: 6, sentAt: new Date().toISOString(),
    }

    transport.receive(drawingPreviewTopic('trip-1'), { ...message, clientId: 'client-1' })
    transport.receive(drawingPreviewTopic('trip-1'), { ...message, clientId: 'session-1' })
    expect(channel.remoteDrawings.value).toEqual([])

    transport.receive(drawingPreviewTopic('trip-1'), message)
    expect(channel.remoteDrawings.value).toEqual([expect.objectContaining({
      id: 'remote:client-2:stroke-1', color: '#ef4444', width: 6,
    })])
    expect(channel.remoteDrawings.value[0]!.coordinates.length).toBeLessThanOrEqual(100)

    transport.receive(drawingPreviewTopic('trip-1'), { ...message, sequence: 0, color: '#000000' })
    transport.receive(drawingPreviewTopic('trip-1'), { drawing: { id: 'saved-drawing' } })
    expect(channel.remoteDrawings.value[0]?.color).toBe('#ef4444')

    transport.receive(drawingPreviewTopic('trip-1'), { ...message, phase: 'CANCEL', sequence: 2 })
    expect(channel.remoteDrawings.value).toEqual([])

    transport.receive(drawingPreviewTopic('trip-1'), message)
    vi.advanceTimersByTime(1000)
    expect(channel.remoteDrawings.value).toEqual([])
    await channel.disconnect()
  })
})
