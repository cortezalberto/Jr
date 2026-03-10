/**
 * WebSocket service for diner real-time updates
 * Connects to ws://localhost:8001/ws/diner
 */

import type { WSEvent, WSEventType } from '../types/backend'
import { getTableToken } from './api'
import { wsLogger } from '../utils/logger'

type EventCallback = (event: WSEvent) => void

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'
// CLIENT-MED-01 FIX: Increased from 10 to 50 for consistency with Dashboard
const MAX_RECONNECT_ATTEMPTS = 50

// Exponential backoff configuration
const BASE_RECONNECT_DELAY = 1000 // Start with 1 second
const MAX_RECONNECT_DELAY = 30000 // Cap at 30 seconds
const JITTER_FACTOR = 0.3 // Add up to 30% random jitter

// Phase 5: Heartbeat configuration
const HEARTBEAT_INTERVAL = 30000 // 30 seconds
const HEARTBEAT_TIMEOUT = 10000 // 10 seconds to receive pong

// SEC-MED-02 FIX: Close codes that should NOT trigger reconnection
const NON_RECOVERABLE_CLOSE_CODES = new Set([
  4001, // AUTH_FAILED - Token invalid/expired
  4003, // FORBIDDEN - Insufficient permissions or invalid origin
  4029, // RATE_LIMITED - Too many messages
])

// RES-MED-01 FIX: Callback type for max reconnect notification
type MaxReconnectCallback = () => void

// MENU-SVC-LOW-02 FIX: Connection state enum for logging
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closed'

class DinerWebSocket {
  private ws: WebSocket | null = null
  private listeners: Map<WSEventType | '*', Set<EventCallback>> = new Map()
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private isIntentionallyClosed = false

  // Phase 5: Heartbeat state
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private lastPongReceived: number = 0

  // DEF-CRIT-03: Visibility change listener for reconnection after sleep
  private visibilityHandler: (() => void) | null = null

  // MENU-SVC-LOW-02 FIX: Track connection state for debugging
  private connectionState: ConnectionState = 'disconnected'

  // RES-MED-01 FIX: Callback when max reconnect attempts reached
  private onMaxReconnectReached: MaxReconnectCallback | null = null

  constructor() {
    // DEF-CRIT-03 FIX: Set up visibility change listener for reconnection after device sleep
    this.setupVisibilityListener()
  }

  /**
   * DEF-CRIT-03 FIX: Listen for page visibility changes to reconnect after sleep/background
   * WS-MED-04 FIX: Clean up existing listener before setting up new one to prevent duplicates
   */
  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return

    // WS-MED-04 FIX: Clean up any existing listener first to prevent memory leak on re-instantiation
    this.cleanupVisibilityListener()

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        wsLogger.info(' Page became visible, checking connection...')

        // If we were connected but connection is now stale, reconnect
        if (!this.isIntentionallyClosed && !this.isConnected()) {
          wsLogger.info(' Connection lost during sleep, reconnecting...')
          this.reconnectAttempts = 0 // Reset attempts for fresh start
          this.connect()
        } else if (this.isConnected()) {
          // Connection still open, but may be stale - send ping to verify
          this.sendPing()
        }
      }
    }

    document.addEventListener('visibilitychange', this.visibilityHandler)
    wsLogger.info(' Visibility listener set up for reconnection after sleep')
  }

  /**
   * Clean up visibility listener
   */
  private cleanupVisibilityListener(): void {
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
  }

  /**
   * MENU-SVC-LOW-02 FIX: Log and update connection state
   */
  private setConnectionState(newState: ConnectionState): void {
    const oldState = this.connectionState
    if (oldState !== newState) {
      this.connectionState = newState
      wsLogger.debug(`Connection state: ${oldState} -> ${newState}`)
    }
  }

  /**
   * Connect to WebSocket server
   * Requires a valid table token
   * MENU-CRIT-02 FIX: Re-registers visibility listener if it was removed
   */
  connect(): void {
    const token = getTableToken()
    if (!token) {
      wsLogger.warn(' No table token available, cannot connect')
      return
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      wsLogger.info(' Already connected')
      return
    }

    this.isIntentionallyClosed = false
    // MENU-SVC-LOW-02 FIX: Log connecting state
    this.setConnectionState('connecting')

    // MENU-CRIT-02 FIX: Re-register visibility listener if it was cleaned up
    if (!this.visibilityHandler) {
      this.setupVisibilityListener()
    }

    try {
      // MENU-SVC-MED-02: Token passed in URL query parameter is acceptable here.
      // Table tokens are short-lived, session-scoped, and not sensitive credentials.
      // Unlike user JWTs, table tokens are meant to be shareable (e.g., via QR code)
      // and cannot be used to access user data or perform privileged operations.
      // WebSocket protocol does not support custom headers during handshake,
      // so query parameter is the standard approach for token-based auth.
      const url = `${WS_BASE}/ws/diner?table_token=${encodeURIComponent(token)}`
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        wsLogger.info(' Connected to diner WebSocket')
        this.reconnectAttempts = 0
        // MENU-SVC-LOW-02 FIX: Log connected state
        this.setConnectionState('connected')
        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Phase 5: Handle heartbeat pong
          if (data.type === 'pong') {
            this.lastPongReceived = Date.now()
            this.clearHeartbeatTimeout()
            return
          }

          this.notifyListeners(data as WSEvent)
        } catch (err) {
          wsLogger.error(' Failed to parse message:', err)
        }
      }

      this.ws.onclose = (event) => {
        wsLogger.info(` Connection closed: ${event.code} ${event.reason || ''}`)
        this.ws = null
        this.stopHeartbeat()

        if (!this.isIntentionallyClosed) {
          // SEC-MED-02 FIX: Check if close code indicates permanent error (no retry)
          if (NON_RECOVERABLE_CLOSE_CODES.has(event.code)) {
            wsLogger.warn(` Non-recoverable close code ${event.code}, not reconnecting`)
            this.setConnectionState('closed')
            this.onMaxReconnectReached?.()
            return
          }
          // MENU-SVC-LOW-02 FIX: Log reconnecting state
          this.setConnectionState('reconnecting')
          this.scheduleReconnect()
        } else {
          // MENU-SVC-LOW-02 FIX: Log closed state
          this.setConnectionState('closed')
        }
      }

      this.ws.onerror = (error) => {
        wsLogger.error(' Error:', error)
      }
    } catch (err) {
      wsLogger.error(' Failed to create WebSocket:', err)
      this.scheduleReconnect()
    }
  }

  /**
   * Disconnect from WebSocket server
   * MENU-CRIT-02 FIX: Now removes visibility change listener on disconnect
   */
  disconnect(): void {
    this.isIntentionallyClosed = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.stopHeartbeat()

    // MENU-CRIT-02 FIX: Remove visibility listener on disconnect to prevent memory leak
    this.cleanupVisibilityListener()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.reconnectAttempts = 0
    // MENU-SVC-LOW-02 FIX: Log disconnected state
    this.setConnectionState('disconnected')
    wsLogger.info(' Disconnected')
  }

  /**
   * Full cleanup including visibility listener (call when unloading)
   */
  destroy(): void {
    this.disconnect()
    this.cleanupVisibilityListener()
    this.listeners.clear()
    wsLogger.info(' WebSocket service destroyed')
  }

  /**
   * Subscribe to specific event types
   * Use '*' to listen to all events
   */
  on(eventType: WSEventType | '*', callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType)
      listeners?.delete(callback)
      // CLIENT-LOW-02 FIX: Clean up empty Set to prevent memory leak
      if (listeners?.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * Unsubscribe from an event type
   * CLIENT-LOW-02 FIX: Also cleans up empty Sets
   */
  off(eventType: WSEventType | '*', callback: EventCallback): void {
    const listeners = this.listeners.get(eventType)
    listeners?.delete(callback)
    if (listeners?.size === 0) {
      this.listeners.delete(eventType)
    }
  }

  /**
   * RES-MED-01 FIX: Register callback for when max reconnect attempts reached
   * Allows UI to show "Connection lost" notification
   */
  onMaxReconnect(callback: MaxReconnectCallback): () => void {
    this.onMaxReconnectReached = callback
    return () => {
      this.onMaxReconnectReached = null
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private notifyListeners(event: WSEvent): void {
    // Notify specific listeners
    const specificListeners = this.listeners.get(event.type)
    if (specificListeners) {
      specificListeners.forEach((cb) => cb(event))
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*')
    if (wildcardListeners) {
      wildcardListeners.forEach((cb) => cb(event))
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      wsLogger.error(' Max reconnect attempts reached')
      // RES-MED-01 FIX: Notify UI about connection failure
      this.onMaxReconnectReached?.()
      return
    }

    this.reconnectAttempts++

    // Exponential backoff: 2^attempt * base delay, capped at max
    const exponentialDelay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    )

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * JITTER_FACTOR * Math.random()
    const delay = Math.round(exponentialDelay + jitter)

    wsLogger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, delay)
  }

  // =====================
  // Phase 5: Heartbeat
  // =====================

  /**
   * Start the heartbeat mechanism
   * Sends ping every HEARTBEAT_INTERVAL and expects pong within HEARTBEAT_TIMEOUT
   */
  private startHeartbeat(): void {
    this.stopHeartbeat() // Clear any existing heartbeat

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendPing()
      }
    }, HEARTBEAT_INTERVAL)

    wsLogger.info(' Heartbeat started')
  }

  /**
   * Stop the heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.clearHeartbeatTimeout()
  }

  /**
   * Send a ping message and set a timeout for pong response
   */
  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    try {
      this.ws.send(JSON.stringify({ type: 'ping' }))

      // Set timeout for pong response
      this.heartbeatTimeout = setTimeout(() => {
        wsLogger.warn(' Heartbeat timeout - no pong received')
        // Close connection to trigger reconnect
        this.ws?.close(4000, 'Heartbeat timeout')
      }, HEARTBEAT_TIMEOUT)
    } catch (err) {
      wsLogger.error(' Failed to send ping:', err)
    }
  }

  /**
   * Clear the heartbeat timeout (called when pong is received)
   */
  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  /**
   * Get the time since last pong (for debugging)
   */
  getLastPongAge(): number {
    if (this.lastPongReceived === 0) return -1
    return Date.now() - this.lastPongReceived
  }

  /**
   * MENU-SVC-LOW-02 FIX: Get current connection state (for debugging)
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }
}

// Singleton instance
export const dinerWS = new DinerWebSocket()

// Convenience hooks for React components
export function useDinerWebSocket() {
  return dinerWS
}
