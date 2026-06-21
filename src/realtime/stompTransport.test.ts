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

describe('StompTransport', () => {
  beforeEach(() => {
    stomp.clients.length = 0
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
    client.config.onConnect()
    expect(client.subscribe).toHaveBeenCalledWith('/topic/trips/trip-1/map-drawings', expect.any(Function))
    const callback = client.subscribe.mock.results[0].value.callback
    callback({ body: JSON.stringify({ previewId: 'stroke-1' }) })
    expect(handler).toHaveBeenCalledWith({ previewId: 'stroke-1' })
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

  it('현재 origin을 기준으로 기본 websocket URL을 만든다', () => {
    expect(resolveWebSocketUrl()).toBe('ws://localhost:3000/ws')
    expect(resolveWebSocketUrl('wss://api.example.com/ws')).toBe('wss://api.example.com/ws')
  })
})
