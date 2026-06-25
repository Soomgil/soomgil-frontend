import { Client, type IFrame, type IMessage, type StompSubscription } from '@stomp/stompjs'
import {
  COLLABORATION_SESSION_HEADER,
  registerCollaborationSessionId,
  unregisterCollaborationSessionId,
} from './collaborationSession'

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
  private collaborationSessionId: string | null = null

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
      onStompError: (frame: IFrame) => {
        console.error('STOMP broker error', {
          message: frame.headers.message,
          body: frame.body,
          headers: frame.headers,
        })
      },
      onWebSocketError: (event) => {
        console.error('WebSocket connection error', event)
      },
      onConnect: (frame: IFrame) => {
        this.updateCollaborationSession(frame.headers[COLLABORATION_SESSION_HEADER])
        this.subscriptions.forEach((subscription) => this.activateSubscription(subscription))
      },
      onWebSocketClose: () => {
        this.clearCollaborationSession()
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
    this.clearCollaborationSession()
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
      let payload: unknown
      try {
        payload = JSON.parse(message.body) as unknown
      } catch (cause) {
        // Ignore malformed broker messages and keep the subscription alive.
        console.warn('Malformed STOMP message ignored', cause)
        return
      }
      try {
        subscription.handler(payload)
      } catch (cause) {
        console.error('STOMP message handler failed', cause)
      }
    })
  }

  private updateCollaborationSession(sessionId: string | undefined) {
    this.clearCollaborationSession()
    this.collaborationSessionId = registerCollaborationSessionId(sessionId)
  }

  private clearCollaborationSession() {
    unregisterCollaborationSessionId(this.collaborationSessionId)
    this.collaborationSessionId = null
  }
}

export function resolveWebSocketUrl(configuredUrl?: string) {
  if (configuredUrl) return configuredUrl
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
