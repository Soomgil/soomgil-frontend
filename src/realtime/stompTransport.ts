import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs'

export interface RealtimeTransport {
  readonly connected: boolean
  connect(): void
  disconnect(): Promise<void>
  publish(destination: string, payload: unknown): boolean
  subscribe<T>(destination: string, handler: (payload: T) => void): () => void
}

export interface StompTransportOptions {
  brokerUrl: string
  accessToken: () => string | null
  reconnectDelayMs?: number
}

interface PendingSubscription {
  destination: string
  handler: (payload: unknown) => void
  active: StompSubscription | null
}

export class StompTransport implements RealtimeTransport {
  private readonly client: Client
  private readonly subscriptions = new Set<PendingSubscription>()

  constructor(options: StompTransportOptions) {
    this.client = new Client({
      brokerURL: options.brokerUrl,
      reconnectDelay: options.reconnectDelayMs ?? 1000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => undefined,
      beforeConnect: async () => {
        const token = options.accessToken()
        this.client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {}
      },
      onConnect: () => {
        this.subscriptions.forEach((subscription) => this.activateSubscription(subscription))
      },
      onWebSocketClose: () => {
        this.subscriptions.forEach((subscription) => {
          subscription.active = null
        })
      },
    })
  }

  get connected() {
    return this.client.connected
  }

  connect() {
    if (!this.client.active) this.client.activate()
  }

  async disconnect() {
    this.subscriptions.forEach((subscription) => {
      subscription.active?.unsubscribe()
      subscription.active = null
    })
    await this.client.deactivate()
  }

  publish(destination: string, payload: unknown) {
    if (!this.client.connected) return false
    this.client.publish({ destination, body: JSON.stringify(payload) })
    return true
  }

  subscribe<T>(destination: string, handler: (payload: T) => void) {
    const subscription: PendingSubscription = {
      destination,
      handler: handler as (payload: unknown) => void,
      active: null,
    }
    this.subscriptions.add(subscription)
    if (this.client.connected) this.activateSubscription(subscription)

    return () => {
      subscription.active?.unsubscribe()
      subscription.active = null
      this.subscriptions.delete(subscription)
    }
  }

  private activateSubscription(subscription: PendingSubscription) {
    subscription.active?.unsubscribe()
    subscription.active = this.client.subscribe(subscription.destination, (message: IMessage) => {
      try {
        subscription.handler(JSON.parse(message.body) as unknown)
      } catch {
        // Ignore malformed broker messages and keep the subscription alive.
      }
    })
  }
}

export function resolveWebSocketUrl(configuredUrl?: string) {
  if (configuredUrl) return configuredUrl
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
