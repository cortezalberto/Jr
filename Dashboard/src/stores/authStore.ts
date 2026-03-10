import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authAPI, setAuthToken, setRefreshToken, setOnTokenExpired, setOnTokenRefreshed, type AuthUser, type LoginResponse } from '../services/api'
import { dashboardWS } from '../services/websocket'
import { STORAGE_KEYS } from '../utils/constants'
import {
  isAdmin,
  isManager,
  isAdminOrManager,
  canDelete,
  canCreateBranch,
  canEditBranch,
} from '../utils/permissions'

// =============================================================================
// SEC-01: Security Constants
// =============================================================================

// Base refresh interval (14 min = 1 min before 15 min token expiry)
const BASE_REFRESH_INTERVAL_MS = 14 * 60 * 1000

// SEC-01: Jitter range to prevent timing attacks (±2 minutes)
const JITTER_RANGE_MS = 2 * 60 * 1000

// Max retry attempts before auto-logout
const MAX_REFRESH_ATTEMPTS = 3

// =============================================================================
// SEC-02: Refresh Interval with Jitter
// =============================================================================

let refreshTimeoutId: ReturnType<typeof setTimeout> | null = null

/**
 * SEC-01: Calculate refresh interval with random jitter
 * Prevents predictable refresh timing that could be exploited
 */
function getRefreshIntervalWithJitter(): number {
  const jitter = (Math.random() - 0.5) * 2 * JITTER_RANGE_MS
  const interval = BASE_REFRESH_INTERVAL_MS + jitter
  return Math.max(interval, 60000) // Minimum 1 minute
}

/**
 * SEC-02: Start token refresh with jitter-based scheduling
 * Uses setTimeout instead of setInterval for variable timing
 */
function startTokenRefreshInterval(refreshFn: () => Promise<boolean>): void {
  stopTokenRefreshInterval()

  const scheduleNextRefresh = () => {
    const interval = getRefreshIntervalWithJitter()
    console.log(`[AuthStore] Next token refresh in ${Math.round(interval / 1000)}s`)

    refreshTimeoutId = setTimeout(async () => {
      try {
        const success = await refreshFn()
        if (success) {
          // SEC-03: Notify other tabs about successful refresh
          authBroadcast.postMessage({ type: 'TOKEN_REFRESHED' })
        }
      } catch (err) {
        console.error('[AuthStore] Scheduled token refresh failed', err)
      }
      // Schedule next refresh regardless of success/failure
      scheduleNextRefresh()
    }, interval)
  }

  scheduleNextRefresh()
  console.log('[AuthStore] Token refresh interval started with jitter')
}

function stopTokenRefreshInterval(): void {
  if (refreshTimeoutId) {
    clearTimeout(refreshTimeoutId)
    refreshTimeoutId = null
    console.log('[AuthStore] Token refresh interval stopped')
  }
}

// =============================================================================
// SEC-03: BroadcastChannel for Tab Synchronization
// =============================================================================

type AuthBroadcastMessage =
  | { type: 'TOKEN_REFRESHED' }
  | { type: 'LOGOUT' }
  | { type: 'LOGIN'; token: string }

let authBroadcast: BroadcastChannel

// Initialize BroadcastChannel with error handling
function initAuthBroadcast(): BroadcastChannel {
  if (authBroadcast) return authBroadcast

  try {
    authBroadcast = new BroadcastChannel('dashboard-auth-sync')

    authBroadcast.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      const { type } = event.data

      switch (type) {
        case 'TOKEN_REFRESHED':
          // Another tab refreshed - skip our next scheduled refresh
          console.log('[AuthStore] Token refreshed in another tab')
          break

        case 'LOGOUT':
          // Another tab logged out - sync logout here
          console.log('[AuthStore] Logout detected in another tab')
          performLocalLogout()
          break

        case 'LOGIN':
          // Another tab logged in - reload to sync state
          console.log('[AuthStore] Login detected in another tab')
          window.location.reload()
          break
      }
    }

    authBroadcast.onmessageerror = () => {
      console.warn('[AuthStore] BroadcastChannel message error')
    }
  } catch {
    // BroadcastChannel not supported - create mock
    console.warn('[AuthStore] BroadcastChannel not supported')
    authBroadcast = {
      postMessage: () => {},
      close: () => {},
      onmessage: null,
      onmessageerror: null,
    } as unknown as BroadcastChannel
  }

  return authBroadcast
}

// Initialize on module load
initAuthBroadcast()

/**
 * SEC-03: Close BroadcastChannel on cleanup
 */
export function closeAuthBroadcast(): void {
  if (authBroadcast) {
    try {
      authBroadcast.close()
    } catch {
      // Ignore errors on close
    }
  }
}

// =============================================================================
// SEC-04: Local Logout (without broadcasting)
// =============================================================================

/**
 * Performs logout locally without broadcasting to other tabs
 * Used when receiving logout broadcast from another tab
 */
function performLocalLogout(): void {
  stopTokenRefreshInterval()
  setOnTokenRefreshed(null)
  setOnTokenExpired(null)
  dashboardWS.disconnect()

  // SEC-05: Clear tokens from memory explicitly
  setAuthToken(null)
  setRefreshToken(null)

  // Clear store state
  useAuthStore.setState({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    error: null,
    refreshAttempts: 0,
    isRefreshing: false,
  })

  // SEC-05: Clear localStorage completely
  try {
    localStorage.removeItem(STORAGE_KEYS.AUTH || 'dashboard-auth')
  } catch {
    console.warn('[AuthStore] Failed to clear localStorage')
  }
}

// =============================================================================
// Store Interface
// =============================================================================

interface AuthState {
  user: AuthUser | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  refreshAttempts: number
  isRefreshing: boolean
  // Actions
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<boolean>
  clearError: () => void
  refreshAccessToken: () => Promise<boolean>
}

// =============================================================================
// Zustand Store
// =============================================================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      refreshAttempts: 0,
      isRefreshing: false,

      login: async (email: string, password: string): Promise<boolean> => {
        set({ isLoading: true, error: null })
        try {
          const response = await authAPI.login(email, password) as LoginResponse & { refresh_token?: string }

          // Store refresh token in API service
          if (response.refresh_token) {
            setRefreshToken(response.refresh_token)
          }

          set({
            user: response.user,
            token: response.access_token,
            refreshToken: response.refresh_token || null,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            refreshAttempts: 0,
          })

          // Set up callback for WebSocket reconnection on token refresh
          setOnTokenRefreshed(() => {
            dashboardWS.updateToken()
          })

          // Set up callback for token expiration
          setOnTokenExpired(() => {
            get().logout()
          })

          // Start proactive token refresh interval with jitter
          startTokenRefreshInterval(() => get().refreshAccessToken())

          // SEC-03: Notify other tabs about login
          authBroadcast.postMessage({ type: 'LOGIN', token: response.access_token })

          return true
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error de autenticacion'
          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
            error: message,
          })
          return false
        }
      },

      logout: () => {
        // SEC-03: Notify other tabs before logout
        authBroadcast.postMessage({ type: 'LOGOUT' })

        // Stop refresh interval
        stopTokenRefreshInterval()
        setOnTokenRefreshed(null)
        setOnTokenExpired(null)

        // Disconnect WebSocket before clearing auth state
        dashboardWS.disconnect()

        // Call backend to invalidate token (fire and forget)
        authAPI.logout()

        // SEC-05: Clear tokens from memory explicitly
        setAuthToken(null)
        setRefreshToken(null)

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
          refreshAttempts: 0,
          isRefreshing: false,
        })

        // SEC-05: Clear localStorage completely
        try {
          localStorage.removeItem(STORAGE_KEYS.AUTH || 'dashboard-auth')
        } catch {
          console.warn('[AuthStore] Failed to clear localStorage')
        }
      },

      checkAuth: async (): Promise<boolean> => {
        const { token, refreshToken: storedRefreshToken } = get()
        if (!token) {
          set({ isAuthenticated: false })
          return false
        }

        // Restore tokens to API client
        setAuthToken(token)
        if (storedRefreshToken) {
          setRefreshToken(storedRefreshToken)
        }

        // Set callback for token expiration
        setOnTokenExpired(() => {
          get().logout()
        })

        try {
          const user = await authAPI.getMe()
          set({
            user,
            isAuthenticated: true,
          })

          // Set up callback for WebSocket reconnection on token refresh
          setOnTokenRefreshed(() => {
            dashboardWS.updateToken()
          })

          // Start proactive token refresh interval with jitter
          startTokenRefreshInterval(() => get().refreshAccessToken())

          return true
        } catch {
          // Token is invalid or expired (refresh already attempted by fetchAPI)
          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
          })
          return false
        }
      },

      clearError: () => set({ error: null }),

      // SEC-06: Proactive token refresh with rotation validation
      // SEC-09: Refresh token is now in HttpOnly cookie, no need to check in memory
      refreshAccessToken: async (): Promise<boolean> => {
        const { refreshToken: currentRefreshToken, refreshAttempts, isRefreshing } = get()

        // Prevent concurrent refresh attempts
        if (isRefreshing) {
          console.log('[AuthStore] Token refresh already in progress, skipping')
          return false
        }

        // Check max retries before attempting
        if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
          console.warn('[AuthStore] Max refresh attempts reached, logging out')
          get().logout()
          return false
        }

        // SEC-09: Don't check for refreshToken in memory - it's in HttpOnly cookie
        // The server will reject the request if no valid cookie is present

        // Set isRefreshing flag and increment attempt counter
        set({ isRefreshing: true, refreshAttempts: refreshAttempts + 1 })

        try {
          const result = await authAPI.refresh()

          if (!result) {
            console.warn('[AuthStore] Token refresh returned empty result')
            set({ isRefreshing: false })
            return false
          }

          // SEC-06: Validate token rotation - backend SHOULD rotate refresh token
          if (!result.refresh_token) {
            console.warn('[AuthStore] Backend did not rotate refresh token - security warning')
            // Continue but log warning - this should be fixed on backend
          }

          // SEC-06: Validate new token is different from current
          if (result.refresh_token && result.refresh_token === currentRefreshToken) {
            console.error('[AuthStore] Refresh token not rotated - potential security issue')
            // This could indicate a replay attack or misconfigured backend
          }

          set({
            token: result.access_token,
            refreshToken: result.refresh_token || currentRefreshToken,
            refreshAttempts: 0,  // Reset on success
            isRefreshing: false,
          })

          // Update API client with new tokens
          setAuthToken(result.access_token)
          if (result.refresh_token) {
            setRefreshToken(result.refresh_token)
          }

          console.log('[AuthStore] Token refreshed successfully')
          return true
        } catch (err) {
          console.error('[AuthStore] Token refresh failed', err)
          set({ isRefreshing: false })
          return false
        }
      },
    }),
    {
      name: STORAGE_KEYS.AUTH || 'dashboard-auth',
      version: 4, // SEC-09: Bump version - refreshToken now in HttpOnly cookie
      partialize: (state) => ({
        // Only persist access token and user, not loading/error states
        // SEC-09: refreshToken is now in HttpOnly cookie, not localStorage
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, restore access token to API client
        if (state?.token) {
          setAuthToken(state.token)
        }
        // SEC-09: refreshToken is in HttpOnly cookie, no need to restore
        // Set callback for token expiration
        setOnTokenExpired(() => {
          useAuthStore.getState().logout()
        })
      },
    }
  )
)

// =============================================================================
// Selectors
// =============================================================================

export const selectUser = (state: AuthState) => state.user
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated
export const selectIsLoading = (state: AuthState) => state.isLoading
export const selectAuthError = (state: AuthState) => state.error

// C001 FIX: Use stable empty array references to avoid React 19 infinite re-renders
const EMPTY_ROLES: string[] = []
const EMPTY_BRANCH_IDS: number[] = []
export const selectUserRoles = (state: AuthState) => state.user?.roles ?? EMPTY_ROLES
export const selectUserBranchIds = (state: AuthState) => state.user?.branch_ids ?? EMPTY_BRANCH_IDS

// Permission-based selectors
export const selectIsAdmin = (state: AuthState) => isAdmin(state.user?.roles ?? EMPTY_ROLES)
export const selectIsManager = (state: AuthState) => isManager(state.user?.roles ?? EMPTY_ROLES)
export const selectIsAdminOrManager = (state: AuthState) => isAdminOrManager(state.user?.roles ?? EMPTY_ROLES)
export const selectCanDelete = (state: AuthState) => canDelete(state.user?.roles ?? EMPTY_ROLES)
export const selectCanCreateBranch = (state: AuthState) => canCreateBranch(state.user?.roles ?? EMPTY_ROLES)
export const selectCanEditBranch = (state: AuthState) => canEditBranch(state.user?.roles ?? EMPTY_ROLES)
