/**
 * WebSocket service for Dashboard real-time updates
 * Connects to ws://localhost:8001/ws/admin for admin/manager role
 * or ws://localhost:8001/ws/kitchen for kitchen role
 *
 * A006 FIX: Added throttling support to prevent excessive re-renders
 * MED-04 FIX: Uses centralized logger instead of console.*
 */

import { getAuthToken } from './api'
import { logger } from '../utils/logger'

// MED-04 FIX: WebSocket logger context
const WS_CONTEXT = 'WebSocket'

/**
 * A006 FIX: Simple throttle implementation for WebSocket events
 * Ensures callbacks are called at most once per `limit` milliseconds
 */
function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): T {
  let lastCall = 0
  let timeout: ReturnType<typeof setTimeout> | null = null

  return ((...args: unknown[]) => {
    const now = Date.now()
    const remaining = limit - (now - lastCall)

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      lastCall = now
      func(...args)
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now()
        timeout = null
        func(...args)
      }, remaining)
    }
  }) as T
}

// A006 FIX: Default throttle delay for WebSocket events (100ms)
const DEFAULT_THROTTLE_DELAY = 100

// WebSocket event types from backend
// CROSS-SYS-01 FIX: Synchronized with backend/shared/infrastructure/events/event_types.py
export type WSEventType =
  // Round lifecycle events (PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED)
  | 'ROUND_PENDING'
  | 'ROUND_CONFIRMED'
  | 'ROUND_SUBMITTED'
  | 'ROUND_IN_KITCHEN'
  | 'ROUND_READY'
  | 'ROUND_SERVED'
  | 'ROUND_CANCELED'
  | 'ROUND_ITEM_DELETED'  // Item removed from round by waiter
  // Service call events
  | 'SERVICE_CALL_CREATED'
  | 'SERVICE_CALL_ACKED'
  | 'SERVICE_CALL_CLOSED'
  // Billing events
  | 'CHECK_REQUESTED'
  | 'CHECK_PAID'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_FAILED'
  // Table events
  | 'TABLE_CLEARED'
  | 'TABLE_STATUS_CHANGED'
  | 'TABLE_SESSION_STARTED'
  // Kitchen ticket events
  | 'TICKET_IN_PROGRESS'
  | 'TICKET_READY'
  | 'TICKET_DELIVERED'
  // Admin CRUD events
  | 'ENTITY_CREATED'
  | 'ENTITY_UPDATED'
  | 'ENTITY_DELETED'
  | 'CASCADE_DELETE'

// DEF-HIGH-01 FIX: Entity types for admin CRUD events
export type AdminEntityType =
  | 'branch'
  | 'category'
  | 'subcategory'
  | 'product'
  | 'allergen'
  | 'table'
  | 'staff'
  | 'promotion'

/**
 * WebSocket event structure
 * WS-MED-03 FIX: Made branch_id and table_id optional since not all events have them
 * (e.g., ENTITY_CREATED for admin CRUD doesn't require table_id)
 */
export interface WSEvent {
  type: WSEventType
  // WS-MED-03 FIX: Made optional - not all events have branch_id (e.g., tenant-level events)
  branch_id?: number
  // WS-MED-03 FIX: Made optional - admin CRUD events don't have table_id
  table_id?: number
  session_id?: number
  entity?: {
    round_id?: number
    round_number?: number
    call_id?: number
    call_type?: string
    check_id?: number
    total_cents?: number
    paid_cents?: number
    payment_id?: number
    amount_cents?: number
    provider?: string
    table_code?: string
    // ROUND_ITEM_DELETED event fields
    item_id?: number
    round_deleted?: boolean
    // DEF-HIGH-01 FIX: Admin CRUD entity data
    entity_type?: AdminEntityType
    entity_id?: number
    entity_name?: string
    affected_entities?: Array<{
      type: AdminEntityType
      id: number
      name?: string
    }>
  }
  timestamp?: string
}

type EventCallback = (event: WSEvent) => void
type ConnectionStateCallback = (isConnected: boolean) => void

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'

// Exponential backoff configuration
const BASE_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const JITTER_FACTOR = 0.3
const MAX_RECONNECT_ATTEMPTS = 50  // Increased from 10 for more persistent reconnection

// Heartbeat configuration
const HEARTBEAT_INTERVAL = 30000
const HEARTBEAT_TIMEOUT = 10000

// QA-AUDIT-01: Close codes that should NOT trigger reconnection (permanent errors)
// SEC-MED-02 FIX: Added 4029 (RATE_LIMITED) to prevent infinite retry spam
const NON_RECOVERABLE_CLOSE_CODES = new Set([
  4001, // AUTH_FAILED - JWT invalid/expired, needs re-login
  4003, // FORBIDDEN - Insufficient role or invalid origin
  4029, // RATE_LIMITED - Too many messages, client is spamming
])

// QA-AUDIT-02: Callback for max reconnect reached (allows UI notification)
type MaxReconnectCallback = () => void

class DashboardWebSocket {
  private ws: WebSocket | null = null
  private listeners: Map<WSEventType | '*', Set<EventCallback>> = new Map()
  private connectionStateListeners: Set<ConnectionStateCallback> = new Set()
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private isIntentionallyClosed = false
  private endpoint: 'admin' | 'kitchen' = 'admin'
  // QA-AUDIT-03: Track last close code for smart reconnection
  private lastCloseCode: number | null = null
  // QA-AUDIT-02: Callback when max reconnect attempts reached
  private onMaxReconnectReached: MaxReconnectCallback | null = null

  /**
   * Connect to WebSocket server
   * @param endpoint - 'admin' for full access or 'kitchen' for kitchen-only events
   */
  connect(endpoint: 'admin' | 'kitchen' = 'admin'): void {
    const token = getAuthToken()
    if (!token) {
      logger.warn(WS_CONTEXT, 'No auth token available, cannot connect')
      return
    }

    // QA-AUDIT-01: Clear pending reconnect timeout to prevent race condition
    // This prevents duplicate connections if connect() is called while a reconnect is scheduled
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // Check if already connected or connecting to the same endpoint
    if (this.ws && this.endpoint === endpoint) {
      const state = this.ws.readyState
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        logger.debug(WS_CONTEXT, 'Already connected or connecting')
        return
      }
    }

    // Close existing connection if switching endpoints
    if (this.ws && this.endpoint !== endpoint) {
      this.disconnect()
    }

    this.endpoint = endpoint
    this.isIntentionallyClosed = false

    try {
      const url = `${WS_BASE}/ws/${endpoint}?token=${encodeURIComponent(token)}`
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        logger.info(WS_CONTEXT, `Connected to ${endpoint} WebSocket`)
        this.reconnectAttempts = 0
        this.startHeartbeat()
        this.notifyConnectionState(true)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Handle heartbeat pong
          if (data.type === 'pong') {
            this.clearHeartbeatTimeout()
            return
          }

          this.notifyListeners(data as WSEvent)
        } catch (err) {
          logger.error(WS_CONTEXT, 'Failed to parse message', err)
        }
      }

      this.ws.onclose = (event) => {
        // QA-AUDIT-03: Track close code for smart reconnection decisions
        this.lastCloseCode = event.code
        logger.info(WS_CONTEXT, `Connection closed: ${event.code} ${event.reason}`)
        this.ws = null
        this.stopHeartbeat()
        this.notifyConnectionState(false)

        if (!this.isIntentionallyClosed) {
          // QA-AUDIT-01: Check if close code indicates permanent error (no retry)
          if (NON_RECOVERABLE_CLOSE_CODES.has(event.code)) {
            logger.warn(WS_CONTEXT, `Non-recoverable close code ${event.code}, not reconnecting. Please re-login.`)
            // Notify UI about auth failure
            this.onMaxReconnectReached?.()
            return
          }
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        logger.error(WS_CONTEXT, 'WebSocket error', error)
      }
    } catch (err) {
      logger.error(WS_CONTEXT, 'Failed to create WebSocket', err)
      this.scheduleReconnect()
    }
  }

  /**
   * WS-31-HIGH-02 FIX: Soft disconnect - close socket but preserve listeners
   * Use this when temporarily disconnecting (e.g., switching tabs, sleep)
   * Listeners are preserved so reconnection works seamlessly
   */
  softDisconnect(): void {
    this.isIntentionallyClosed = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.reconnectAttempts = 0
    this.notifyConnectionState(false)
    logger.info(WS_CONTEXT, 'Soft disconnected (listeners preserved)')
  }

  /**
   * WS-31-HIGH-02 FIX: Hard disconnect - close socket AND clear all listeners
   * Use this ONLY when logging out or destroying the service
   * CRIT-10 FIX: Clears listeners to prevent memory leak on full disconnect
   */
  disconnect(): void {
    this.softDisconnect()

    // CRIT-10 FIX: Clear all listeners to prevent memory leak
    this.listeners.clear()
    this.connectionStateListeners.clear()

    logger.info(WS_CONTEXT, 'Hard disconnected (listeners cleared)')
  }

  /**
   * WS-31-HIGH-02 FIX: Full cleanup (alias for disconnect)
   * Provided for API consistency with pwaMenu/pwaWaiter
   */
  destroy(): void {
    this.disconnect()
    logger.info(WS_CONTEXT, 'WebSocket service destroyed')
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
      // QA-AUDIT-MED-01: Clean up empty Set to prevent memory leak
      if (listeners?.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * C004 FIX: Subscribe to events filtered by branch ID
   * Only receives events for the specified branch
   */
  onFiltered(
    branchId: number,
    eventType: WSEventType | '*',
    callback: EventCallback
  ): () => void {
    const filteredCallback: EventCallback = (event) => {
      if (event.branch_id === branchId) {
        callback(event)
      }
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(filteredCallback)

    return () => {
      const listeners = this.listeners.get(eventType)
      listeners?.delete(filteredCallback)
      // QA-AUDIT-MED-01: Clean up empty Set
      if (listeners?.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * C004 FIX: Subscribe to events filtered by multiple branch IDs
   * Useful when user has access to multiple branches
   */
  onFilteredMultiple(
    branchIds: number[],
    eventType: WSEventType | '*',
    callback: EventCallback
  ): () => void {
    const branchIdSet = new Set(branchIds)
    const filteredCallback: EventCallback = (event) => {
      if (event.branch_id !== undefined && branchIdSet.has(event.branch_id)) {
        callback(event)
      }
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(filteredCallback)

    return () => {
      const listeners = this.listeners.get(eventType)
      listeners?.delete(filteredCallback)
      // QA-AUDIT-MED-01: Clean up empty Set
      if (listeners?.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * A006 FIX: Subscribe to events with throttling
   * Prevents excessive re-renders during high-traffic periods
   * @param eventType - Event type or '*' for all events
   * @param callback - Event handler
   * @param delay - Throttle delay in ms (default: 100ms)
   */
  onThrottled(
    eventType: WSEventType | '*',
    callback: EventCallback,
    delay: number = DEFAULT_THROTTLE_DELAY
  ): () => void {
    const throttledCallback = throttle(callback as (...args: unknown[]) => void, delay) as EventCallback

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(throttledCallback)

    return () => {
      const listeners = this.listeners.get(eventType)
      listeners?.delete(throttledCallback)
      // QA-AUDIT-MED-01: Clean up empty Set
      if (listeners?.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * A006 FIX: Subscribe with both branch filtering and throttling
   */
  onFilteredThrottled(
    branchId: number,
    eventType: WSEventType | '*',
    callback: EventCallback,
    delay: number = DEFAULT_THROTTLE_DELAY
  ): () => void {
    const throttledCallback = throttle(callback as (...args: unknown[]) => void, delay) as EventCallback
    const filteredCallback: EventCallback = (event) => {
      if (event.branch_id === branchId) {
        throttledCallback(event)
      }
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(filteredCallback)

    return () => {
      const listeners = this.listeners.get(eventType)
      listeners?.delete(filteredCallback)
      // QA-AUDIT-MED-01: Clean up empty Set
      if (listeners?.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * Subscribe to connection state changes
   */
  onConnectionChange(callback: ConnectionStateCallback): () => void {
    this.connectionStateListeners.add(callback)
    callback(this.isConnected())

    return () => {
      this.connectionStateListeners.delete(callback)
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * QA-AUDIT-02: Register callback for when max reconnect attempts reached
   * Allows UI to show "Connection lost" notification
   */
  onMaxReconnect(callback: MaxReconnectCallback): () => void {
    this.onMaxReconnectReached = callback
    return () => {
      this.onMaxReconnectReached = null
    }
  }

  /**
   * QA-AUDIT-03: Get last close code for debugging
   */
  getLastCloseCode(): number | null {
    return this.lastCloseCode
  }

  /**
   * DEF-DASH-01: Update token and reconnect WebSocket
   * Called when token is proactively refreshed to maintain connection
   */
  updateToken(): void {
    if (!this.isConnected()) {
      logger.debug(WS_CONTEXT, 'Not connected, skipping token update')
      return
    }

    logger.info(WS_CONTEXT, 'Token refreshed, reconnecting WebSocket')
    // Soft disconnect preserves listeners, then reconnect with new token
    this.softDisconnect()
    // Small delay to ensure clean disconnect before reconnect
    setTimeout(() => {
      this.connect(this.endpoint)
    }, 100)
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

  private notifyConnectionState(isConnected: boolean): void {
    this.connectionStateListeners.forEach((cb) => cb(isConnected))
  }

  private scheduleReconnect(): void {
    // QA-AUDIT-01: Clear any pending reconnect timeout to prevent race condition
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(WS_CONTEXT, 'Max reconnect attempts reached')
      // QA-AUDIT-02: Notify UI about connection failure
      this.onMaxReconnectReached?.()
      return
    }

    this.reconnectAttempts++

    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    )
    const jitter = exponentialDelay * JITTER_FACTOR * Math.random()
    const delay = Math.round(exponentialDelay + jitter)

    logger.info(WS_CONTEXT, `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null  // QA-AUDIT-01: Clear after firing
      this.connect(this.endpoint)
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendPing()
      }
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.clearHeartbeatTimeout()
  }

  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    try {
      this.ws.send(JSON.stringify({ type: 'ping' }))

      this.heartbeatTimeout = setTimeout(() => {
        logger.warn(WS_CONTEXT, 'Heartbeat timeout - no pong received')
        this.ws?.close(4000, 'Heartbeat timeout')
      }, HEARTBEAT_TIMEOUT)
    } catch (err) {
      logger.error(WS_CONTEXT, 'Failed to send ping', err)
    }
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }
}

// Singleton instance
export const dashboardWS = new DashboardWebSocket()
