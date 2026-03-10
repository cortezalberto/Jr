import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ToastContainer } from '../ui'
import { useInitializeData } from '../../hooks/useInitializeData'
import { useWebSocketConnection } from '../../hooks/useWebSocketConnection'
import { useAdminWebSocket } from '../../hooks/useAdminWebSocket'
import { useTableWebSocket } from '../../hooks/useTableWebSocket'

export function Layout() {
  // Load data from backend API on mount
  useInitializeData()

  // AUDIT FIX: Connect WebSocket globally when authenticated
  useWebSocketConnection()

  // AUDIT FIX: Subscribe to admin CRUD events for real-time sync
  useAdminWebSocket()

  // FIX: Subscribe to table events (ROUND_SUBMITTED, CHECK_REQUESTED, etc.)
  // This enables real-time order updates from pwaMenu
  useTableWebSocket()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--primary-500)] focus:text-[var(--text-primary)] focus:rounded-lg focus:outline-none"
      >
        Saltar al contenido principal
      </a>
      <Sidebar />
      <main id="main-content" className="ml-64 min-h-screen" role="main">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  )
}
