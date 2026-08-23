import { beforeEach, describe, expect, it, vi } from 'vitest'

const stomp = vi.hoisted(() => ({ clients: [] as any[] }))

vi.mock('@stomp/stompjs', () => ({
  Client: class MockClient {
    active = false
    connected = false
    connectHeaders: Record<string, string> = {}
    config: Record<string, any>
    publish = vi.fn()
    subscribe = vi.fn((_destination: string, callback: (message: { body: string }) => void) => ({
      callback,
      unsubscribe: vi.fn(),
    }))
    deactivate = vi.fn(async () => {
      this.active = false
      this.connected = false
    })

    constructor(config: Record<string, any>) {
      this.config = config
      stomp.clients.push(this)
    }

    activate() {
      this.active = true
    }
  },
}))

import { StompTransport, resolveWebSocketUrl } from './stompTransport'
import { clearCollaborationSessionIds, getCollaborationSessionId } from './collaborationSession'

describe('StompTransport', () => {
  beforeEach(() => {
    stomp.clients.length = 0
    clearCollaborationSessionIds()
    vi.clearAllMocks()
  })

  it('연결 시 최신 bearer token을 사용하고 대기 중 구독을 활성화한다', async () => {
    const handler = vi.fn()
    const transport = new StompTransport({
      brokerUrl: 'ws://localhost/ws',
      accessToken: () => 'token-1',
    })
    transport.subscribe('/topic/trips/trip-1/map-drawings', handler)
    transport.connect()
    const client = stomp.clients[0]

    expect(client.active).toBe(true)
    await client.config.beforeConnect()
    expect(client.connectHeaders).toEqual({ Authorization: 'Bearer token-1' })

    client.connected = true
    client.config.onConnect({ headers: { 'X-Soomgil-WebSocket-Session-Id': 'session-1' } })
    expect(client.subscribe).toHaveBeenCalledWith('/topic/trips/trip-1/map-drawings', expect.any(Function))
    expect(getCollaborationSessionId()).toBe('session-1')
    const callback = client.subscribe.mock.results[0].value.callback
    callback({ body: JSON.stringify({ previewId: 'stroke-1' }) })
    expect(handler).toHaveBeenCalledWith({ previewId: 'stroke-1' })

    await transport.disconnect()
    expect(getCollaborationSessionId()).toBeNull()
  })

  it('잘못된 broker 메시지와 handler 예외를 기록하고 구독을 유지한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = vi.fn(() => {
      throw new Error('handler failed')
    })
    const transport = new StompTransport({
      brokerUrl: 'ws://localhost/ws',
      accessToken: () => 'token-1',
    })
    transport.subscribe('/topic/trips/trip-1/itinerary', handler)
    const client = stomp.clients[0]
    client.connected = true
    client.config.onConnect({ headers: {} })
    const callback = client.subscribe.mock.results[0].value.callback

    callback({ body: '{' })
    callback({ body: JSON.stringify({ tripId: 'trip-1' }) })

    expect(warn).toHaveBeenCalledWith('Malformed STOMP message ignored', expect.any(SyntaxError))
    expect(handler).toHaveBeenCalledWith({ tripId: 'trip-1' })
    expect(error).toHaveBeenCalledWith('STOMP message handler failed', expect.any(Error))

    warn.mockRestore()
    error.mockRestore()
  })

  it('연결된 경우에만 JSON payload를 publish한다', () => {
    const transport = new StompTransport({
      brokerUrl: 'ws://localhost/ws',
      accessToken: () => null,
    })
    const client = stomp.clients[0]

    expect(transport.publish('/app/test', { value: 1 })).toBe(false)
    client.connected = true
    expect(transport.publish('/app/test', { value: 1 })).toBe(true)
    expect(client.publish).toHaveBeenCalledWith({ destination: '/app/test', body: '{"value":1}' })
  })

  it('최초 연결과 재연결을 구분하고 연결 해제를 알린다', () => {
    const onConnected = vi.fn()
    const onDisconnected = vi.fn()
    new StompTransport({
      brokerUrl: 'ws://localhost/ws',
      accessToken: () => null,
      onConnected,
      onDisconnected,
    })
    const client = stomp.clients[0]

    client.config.onConnect({ headers: {} })
    client.config.onWebSocketClose()
    client.config.onConnect({ headers: {} })

    expect(onConnected).toHaveBeenNthCalledWith(1, false)
    expect(onConnected).toHaveBeenNthCalledWith(2, true)
    expect(onDisconnected).toHaveBeenCalledOnce()
  })

  it('현재 origin을 기준으로 기본 websocket URL을 만든다', () => {
    expect(resolveWebSocketUrl()).toBe('ws://localhost:3000/ws')
    expect(resolveWebSocketUrl('wss://api.example.com/ws')).toBe('wss://api.example.com/ws')
  })
})
