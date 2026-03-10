import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, Badge, Button, Select } from '../components/ui'
import { Package, Clock, ChefHat, CheckCircle2, RefreshCw, Wifi, WifiOff, AlertCircle } from 'lucide-react'
import { ordersAPI, kitchenAPI, type ActiveOrder, type OrderStats } from '../services/api'
import { dashboardWS, type WSEvent } from '../services/websocket'
import { useBranchStore, selectBranches } from '../stores/branchStore'
import { logger } from '../utils/logger'

type OrderStatus = 'SUBMITTED' | 'IN_KITCHEN' | 'READY'

const statusConfig: Record<OrderStatus, { label: string; variant: 'warning' | 'info' | 'success'; icon: React.ReactNode }> = {
  SUBMITTED: { label: 'Nuevo', variant: 'warning', icon: <Package className="w-4 h-4" /> },
  IN_KITCHEN: { label: 'En cocina', variant: 'info', icon: <ChefHat className="w-4 h-4" /> },
  READY: { label: 'Listo', variant: 'success', icon: <CheckCircle2 className="w-4 h-4" /> },
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '--:--'
  const date = new Date(dateStr)
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function getElapsedMinutes(dateStr: string | null): number {
  if (!dateStr) return 0
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / 60000)
}

interface OrderCardProps {
  order: ActiveOrder
  onStatusChange: (orderId: number, status: OrderStatus) => Promise<void>
  isUpdating: boolean
}

function OrderCard({ order, onStatusChange, isUpdating }: OrderCardProps) {
  const config = statusConfig[order.status as OrderStatus]
  const elapsed = getElapsedMinutes(order.submitted_at)
  const isUrgent = elapsed > 15 && order.status !== 'READY'

  const getNextStatus = (): OrderStatus | null => {
    if (order.status === 'SUBMITTED') return 'IN_KITCHEN'
    if (order.status === 'IN_KITCHEN') return 'READY'
    return null
  }

  const nextStatus = getNextStatus()
  const nextStatusLabel = nextStatus ? statusConfig[nextStatus].label : null

  return (
    <Card className={`relative ${isUrgent ? 'ring-2 ring-red-500' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold text-[var(--primary-500)]">
            {order.table_code || `#${order.id}`}
          </div>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span className={`text-sm ${isUrgent ? 'text-[var(--danger-text)] font-semibold' : ''}`}>
            {formatTime(order.submitted_at)} ({elapsed} min)
          </span>
        </div>
      </div>

      {/* Branch */}
      <p className="text-xs text-[var(--text-muted)] mb-3">{order.branch_name}</p>

      {/* Items */}
      <div className="space-y-2 mb-4">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between p-3 bg-[var(--bg-tertiary)]/50 rounded-lg"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-[var(--primary-400)]">
                  {item.qty}x
                </span>
                <span className="text-[var(--text-primary)] font-medium">{item.product_name}</span>
              </div>
              {item.diner_name && (
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {item.diner_name}
                </p>
              )}
              {item.notes && (
                <p className="mt-1 text-sm text-[var(--warning-text)] flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" aria-hidden="true" />
                  {item.notes}
                </p>
              )}
            </div>
            <span className="text-[var(--text-tertiary)] text-sm">
              ${(item.unit_price_cents / 100).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex justify-between items-center pt-3 border-t border-[var(--border-default)] mb-4">
        <span className="text-[var(--text-tertiary)]">Total</span>
        <span className="text-[var(--text-primary)] font-bold">${(order.total_cents / 100).toFixed(2)}</span>
      </div>

      {/* Actions */}
      {nextStatusLabel && (
        <Button
          onClick={() => onStatusChange(order.id, nextStatus!)}
          disabled={isUpdating}
          isLoading={isUpdating}
          className="w-full"
          size="lg"
          leftIcon={nextStatus === 'IN_KITCHEN' ? <ChefHat className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        >
          Marcar como {nextStatusLabel}
        </Button>
      )}
    </Card>
  )
}

export function OrdersPage() {
  useDocumentTitle('Pedidos')

  const branches = useBranchStore(selectBranches)
  const [orders, setOrders] = useState<ActiveOrder[]>([])
  const [stats, setStats] = useState<OrderStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isWsConnected, setIsWsConnected] = useState(false)

  // CRIT-02 FIX: Add isMounted ref to prevent setState on unmounted component
  const isMountedRef = React.useRef(true)
  React.useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const branchId = selectedBranch ? parseInt(selectedBranch, 10) : undefined
      const [ordersData, statsData] = await Promise.all([
        ordersAPI.getActiveOrders(branchId, statusFilter || undefined),
        ordersAPI.getStats(branchId),
      ])
      // CRIT-02 FIX: Check if component is still mounted before setting state
      if (!isMountedRef.current) return
      setOrders(ordersData)
      setStats(statsData)
    } catch (err) {
      if (!isMountedRef.current) return
      setError('Error al cargar los pedidos')
      // QA-AUDIT: Use static logger import
      logger.error('OrdersPage', 'Fetch error', err)
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [selectedBranch, statusFilter])

  // Handle WebSocket events
  const handleWSEvent = useCallback((event: WSEvent) => {
    const { type } = event

    switch (type) {
      case 'ROUND_SUBMITTED':
      case 'ROUND_IN_KITCHEN':
      case 'ROUND_READY':
      case 'ROUND_SERVED':
      case 'ROUND_CANCELED':  // QA-AUDIT: Handle round cancellation
        // Refresh data on order-related events
        fetchData()
        break
    }
  }, [fetchData])

  // QA-AUDIT: Keep handler ref updated without causing effect re-runs
  const handleWSEventRef = useRef(handleWSEvent)
  useEffect(() => {
    handleWSEventRef.current = handleWSEvent
  })

  // Initial data fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // WebSocket connection - QA-AUDIT: Use ref pattern to avoid re-subscription
  useEffect(() => {
    dashboardWS.connect('admin')

    const unsubscribeConnection = dashboardWS.onConnectionChange(setIsWsConnected)
    // Use ref to avoid reconnection loops when fetchData changes
    const unsubscribeEvents = dashboardWS.on('*', (event) => handleWSEventRef.current(event))

    return () => {
      unsubscribeConnection()
      unsubscribeEvents()
    }
  }, [])  // QA-AUDIT: Empty deps - subscribe once

  // Fallback polling when WS disconnected
  useEffect(() => {
    if (isWsConnected) return

    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [isWsConnected, fetchData])

  const handleStatusChange = async (orderId: number, status: OrderStatus) => {
    setUpdatingOrderId(orderId)
    try {
      await kitchenAPI.updateRoundStatus(orderId, status as 'IN_KITCHEN' | 'READY' | 'SERVED')
      // Update local state
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      )
      // Refresh stats
      const branchId = selectedBranch ? parseInt(selectedBranch, 10) : undefined
      const newStats = await ordersAPI.getStats(branchId)
      setStats(newStats)
    } catch (err) {
      setError('Error al actualizar el estado')
      // QA-AUDIT: Use static logger import
      logger.error('OrdersPage', 'Update error', err)
    } finally {
      setUpdatingOrderId(null)
    }
  }

  // Group orders by status
  const submittedOrders = orders.filter((o) => o.status === 'SUBMITTED')
  const inKitchenOrders = orders.filter((o) => o.status === 'IN_KITCHEN')
  const readyOrders = orders.filter((o) => o.status === 'READY')

  const branchOptions = [
    { value: '', label: 'Todas las sucursales' },
    ...branches.map((b) => ({ value: String(b.id), label: b.name })),
  ]

  const statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: 'SUBMITTED', label: 'Nuevos' },
    { value: 'IN_KITCHEN', label: 'En cocina' },
    { value: 'READY', label: 'Listos' },
  ]

  return (
    <PageContainer
      title="Pedidos"
      description="Gestiona los pedidos activos en tiempo real"
      actions={
        <div className="flex items-center gap-4">
          {/* Connection status indicator */}
          <div className="flex items-center gap-2">
            {isWsConnected ? (
              <>
                <Wifi className="w-4 h-4 text-[var(--success-icon)]" />
                <span className="text-sm text-[var(--success-icon)]">En vivo</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-[var(--warning-icon)]" />
                <span className="text-sm text-[var(--warning-icon)]">Reconectando...</span>
              </>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={fetchData}
            disabled={isLoading}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Actualizar
          </Button>
        </div>
      }
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--primary-500)]/10 rounded-lg">
              <Package className="w-5 h-5 text-[var(--primary-500)]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[var(--text-tertiary)] text-sm">Total Activos</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.total_active ?? '-'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--warning-border)]/10 rounded-lg">
              <Clock className="w-5 h-5 text-[var(--warning-icon)]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[var(--text-tertiary)] text-sm">Pendientes</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.pending ?? '-'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--info-border)]/10 rounded-lg">
              <ChefHat className="w-5 h-5 text-[var(--info-icon)]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[var(--text-tertiary)] text-sm">En Cocina</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.in_kitchen ?? '-'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--success-border)]/10 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-[var(--success-icon)]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[var(--text-tertiary)] text-sm">Listos</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.ready ?? '-'}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="w-64">
          <Select
            id="branch-filter"
            label="Sucursal"
            options={branchOptions}
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select
            id="status-filter"
            label="Estado"
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-[var(--danger-border)]/10 border border-[var(--danger-border)]/50 rounded-lg text-[var(--danger-text)]">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64" role="status">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--primary-500)] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[var(--text-tertiary)]">Cargando pedidos...</span>
          </div>
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-tertiary)]">No hay pedidos activos</p>
          <p className="text-[var(--text-muted)] text-sm mt-1">Los nuevos pedidos apareceran aqui</p>
        </Card>
      ) : statusFilter ? (
        // Single column when filtering by status
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              isUpdating={updatingOrderId === order.id}
            />
          ))}
        </div>
      ) : (
        // Three columns by status
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Nuevos */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Nuevos</h2>
              <Badge variant="warning">{submittedOrders.length}</Badge>
            </div>
            <div className="space-y-4">
              {submittedOrders.length === 0 ? (
                <Card className="text-center text-[var(--text-muted)] py-8">
                  No hay pedidos nuevos
                </Card>
              ) : (
                submittedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={handleStatusChange}
                    isUpdating={updatingOrderId === order.id}
                  />
                ))
              )}
            </div>
          </div>

          {/* En Cocina */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">En Cocina</h2>
              <Badge variant="info">{inKitchenOrders.length}</Badge>
            </div>
            <div className="space-y-4">
              {inKitchenOrders.length === 0 ? (
                <Card className="text-center text-[var(--text-muted)] py-8">
                  No hay pedidos en preparacion
                </Card>
              ) : (
                inKitchenOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={handleStatusChange}
                    isUpdating={updatingOrderId === order.id}
                  />
                ))
              )}
            </div>
          </div>

          {/* Listos */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Listos</h2>
              <Badge variant="success">{readyOrders.length}</Badge>
            </div>
            <div className="space-y-4">
              {readyOrders.length === 0 ? (
                <Card className="text-center text-[var(--text-muted)] py-8">
                  No hay pedidos listos
                </Card>
              ) : (
                readyOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={handleStatusChange}
                    isUpdating={updatingOrderId === order.id}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status announcement for screen readers */}
      <div role="status" aria-live="polite" className="sr-only">
        {submittedOrders.length} pedidos nuevos, {inKitchenOrders.length} en cocina, {readyOrders.length} listos
      </div>
    </PageContainer>
  )
}

export default OrdersPage
