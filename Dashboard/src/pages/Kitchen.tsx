import { useState, useEffect, useCallback, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, Button, Badge, Modal } from '../components/ui'
import { ChefHat, Clock, CheckCircle2, AlertCircle, RefreshCw, Wifi, WifiOff, Users, X } from 'lucide-react'
import { kitchenAPI, type Round } from '../services/api'
import { dashboardWS, type WSEvent } from '../services/websocket'
import { useAuthStore, selectIsAuthenticated, selectUserBranchIds, selectUserRoles } from '../stores/authStore'
import { logger } from '../utils/logger'

type RoundStatus = Round['status']

// Flow: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
// Kitchen only sees SUBMITTED and IN_KITCHEN (after admin sends to kitchen)
const statusConfig: Record<RoundStatus, { label: string; variant: 'default' | 'warning' | 'info' | 'success' | 'danger'; next?: RoundStatus; color: string }> = {
  DRAFT: { label: 'Borrador', variant: 'default', color: 'bg-gray-200' },
  PENDING: { label: 'Pendiente', variant: 'danger', color: 'bg-red-100 border-red-300' },
  CONFIRMED: { label: 'Confirmado', variant: 'info', color: 'bg-blue-100 border-blue-300' },
  SUBMITTED: { label: 'Nuevo', variant: 'warning', next: 'IN_KITCHEN', color: 'bg-yellow-100 border-yellow-300' },
  IN_KITCHEN: { label: 'Terminado', variant: 'info', next: 'READY', color: 'bg-blue-100 border-blue-300' },
  READY: { label: 'Terminado', variant: 'success', next: 'SERVED', color: 'bg-green-100 border-green-300' },
  SERVED: { label: 'Servido', variant: 'default', color: 'bg-gray-100' },
  CANCELED: { label: 'Cancelado', variant: 'danger', color: 'bg-gray-100' },
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

// Compact card for kitchen view - similar to TableCard
interface RoundMiniCardProps {
  round: Round
  onClick: () => void
  isUrgent: boolean
}

function RoundMiniCard({ round, onClick, isUrgent }: RoundMiniCardProps) {
  const config = statusConfig[round.status]
  const elapsed = getElapsedMinutes(round.submitted_at)
  const totalItems = round.items.reduce((acc, item) => acc + item.qty, 0)

  return (
    <div
      onClick={onClick}
      className={`
        relative p-3 rounded-lg border-2 cursor-pointer transition-all duration-200
        hover:scale-[1.02] hover:shadow-md
        ${config.color}
        ${isUrgent ? 'ring-2 ring-red-500 animate-pulse' : ''}
      `}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {/* Table code */}
      <div className="text-center mb-2">
        <span className="text-xl font-bold text-gray-800">
          {round.table_code || `#${round.id}`}
        </span>
      </div>

      {/* Items count and time */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          <span>{totalItems} items</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className={isUrgent ? 'text-red-600 font-bold' : ''}>
            {elapsed}m
          </span>
        </div>
      </div>

      {/* Status badge */}
      <div className="mt-2 text-center">
        <Badge variant={config.variant} className="text-xs">
          {config.label}
        </Badge>
      </div>
    </div>
  )
}

// Modal for round details
interface RoundDetailModalProps {
  isOpen: boolean
  onClose: () => void
  round: Round | null
  onStatusChange: (roundId: number, status: RoundStatus) => Promise<void>
  isUpdating: boolean
  readOnly?: boolean
}

function RoundDetailModal({ isOpen, onClose, round, onStatusChange, isUpdating, readOnly = false }: RoundDetailModalProps) {
  if (!round) return null

  const config = statusConfig[round.status]
  const elapsed = getElapsedMinutes(round.submitted_at)
  const isUrgent = elapsed > 15 && round.status !== 'READY' && round.status !== 'SERVED'
  const nextStatusLabel = config.next ? statusConfig[config.next].label : null

  const handleNextStatus = async () => {
    if (config.next) {
      await onStatusChange(round.id, config.next)
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Mesa ${round.table_code || round.id}`}>
      <div className="space-y-4">
        {/* Header info */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-primary)]">
          <Badge variant={config.variant} className="text-sm px-3 py-1">
            {config.label}
          </Badge>
          <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <Clock className="w-4 h-4" />
            <span className={`text-sm ${isUrgent ? 'text-red-500 font-bold' : ''}`}>
              {formatTime(round.submitted_at)} ({elapsed} min)
            </span>
          </div>
        </div>

        {/* Items list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {round.items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between p-3 bg-[var(--bg-tertiary)]/50 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-[var(--primary-500)]">
                    {item.qty}x
                  </span>
                  <span className="text-[var(--text-primary)] font-medium">
                    {item.product_name}
                  </span>
                </div>
                {item.notes && (
                  <p className="mt-1 text-sm text-[var(--warning-text)] flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {item.notes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-[var(--border-primary)]">
          {readOnly ? (
            <div className="text-center text-sm text-[var(--text-muted)] py-2">
              Esperando autorización del manager
            </div>
          ) : nextStatusLabel ? (
            <Button
              onClick={handleNextStatus}
              disabled={isUpdating}
              isLoading={isUpdating}
              className="w-full"
              size="lg"
              leftIcon={
                config.next === 'IN_KITCHEN' ? (
                  <ChefHat className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )
              }
            >
              Marcar como {nextStatusLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

export function KitchenPage() {
  useDocumentTitle('Cocina')

  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const userBranchIds = useAuthStore(selectUserBranchIds)
  const userRoles = useAuthStore(selectUserRoles)

  const canAccessKitchen = userRoles.includes('KITCHEN') ||
                           userRoles.includes('ADMIN') ||
                           userRoles.includes('MANAGER')

  const [rounds, setRounds] = useState<Round[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWsConnected, setIsWsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatingRoundId, setUpdatingRoundId] = useState<number | null>(null)
  const [selectedRound, setSelectedRound] = useState<Round | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchRounds = useCallback(async () => {
    if (!isAuthenticated) return

    try {
      setError(null)
      const data = await kitchenAPI.getPendingRounds()
      setRounds(data)
    } catch (err) {
      setError('Error al cargar los pedidos')
      logger.error('KitchenPage', 'Fetch error', err)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  const handleWSEvent = useCallback((event: WSEvent) => {
    const { type, entity, branch_id } = event

    if (branch_id !== undefined && userBranchIds.length > 0 && !userBranchIds.includes(branch_id)) {
      return
    }

    switch (type) {
      case 'ROUND_PENDING':
        fetchRounds()
        break

      case 'ROUND_SUBMITTED':
        if (entity?.round_id) {
          setRounds((prev) =>
            prev.map((r) =>
              r.id === entity.round_id
                ? { ...r, status: 'SUBMITTED' }
                : r
            )
          )
        } else {
          fetchRounds()
        }
        break

      case 'ROUND_IN_KITCHEN':
        if (entity?.round_id) {
          setRounds((prev) =>
            prev.map((r) =>
              r.id === entity.round_id
                ? { ...r, status: 'IN_KITCHEN' }
                : r
            )
          )
        }
        break

      case 'ROUND_READY':
      case 'ROUND_SERVED':
        if (entity?.round_id) {
          setRounds((prev) => prev.filter((r) => r.id !== entity.round_id))
          // Close modal if viewing this round
          if (selectedRound?.id === entity.round_id) {
            setIsModalOpen(false)
            setSelectedRound(null)
          }
        }
        break

      case 'ROUND_CANCELED':
        if (entity?.round_id) {
          setRounds((prev) => prev.filter((r) => r.id !== entity.round_id))
          if (selectedRound?.id === entity.round_id) {
            setIsModalOpen(false)
            setSelectedRound(null)
          }
        }
        break
    }
  }, [fetchRounds, userBranchIds, selectedRound])

  const handleWSEventRef = useRef(handleWSEvent)
  useEffect(() => {
    handleWSEventRef.current = handleWSEvent
  })

  useEffect(() => {
    if (isAuthenticated) {
      fetchRounds()
    }
  }, [isAuthenticated, fetchRounds])

  useEffect(() => {
    if (!isAuthenticated) return

    dashboardWS.connect('kitchen')
    const unsubscribeConnection = dashboardWS.onConnectionChange(setIsWsConnected)
    const unsubscribeEvents = dashboardWS.on('*', (event) => handleWSEventRef.current(event))

    return () => {
      unsubscribeConnection()
      unsubscribeEvents()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || isWsConnected) return
    const interval = setInterval(fetchRounds, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, isWsConnected, fetchRounds])

  const handleStatusChange = async (roundId: number, status: RoundStatus) => {
    setUpdatingRoundId(roundId)
    try {
      const updated = await kitchenAPI.updateRoundStatus(
        roundId,
        status as 'IN_KITCHEN' | 'READY' | 'SERVED'
      )
      setRounds((prev) =>
        prev
          .map((r) => (r.id === roundId ? updated : r))
          .filter((r) => r.status !== 'SERVED')
      )
    } catch (err) {
      setError('Error al actualizar el estado')
      logger.error('KitchenPage', 'Update error', err)
    } finally {
      setUpdatingRoundId(null)
    }
  }

  const openRoundModal = (round: Round) => {
    setSelectedRound(round)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedRound(null)
  }

  // Group rounds by status
  // Kitchen only sees SUBMITTED and IN_KITCHEN (2 columns)
  // PENDING and CONFIRMED are handled by waiter/admin, not shown in kitchen view
  const newRounds = rounds.filter((r) => r.status === 'SUBMITTED')
  const inKitchenRounds = rounds.filter((r) => r.status === 'IN_KITCHEN')

  if (!canAccessKitchen) {
    return (
      <PageContainer
        title="Comandas"
        description="Gestiona los pedidos de la cocina en tiempo real"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[var(--danger-icon)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
              Acceso restringido
            </h2>
            <p className="text-[var(--text-tertiary)]">
              No tienes permisos para acceder a la cocina.
            </p>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title="Comandas"
      description="Gestiona los pedidos de la cocina en tiempo real"
      actions={
        <div className="flex items-center gap-4">
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
            onClick={fetchRounds}
            disabled={isLoading}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Actualizar
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-6 p-4 bg-[var(--danger-border)]/10 border border-[var(--danger-border)]/50 rounded-lg text-[var(--danger-text)]">
          {error}
        </div>
      )}

      {isLoading && !error ? (
        <div className="flex items-center justify-center h-64" role="status">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--primary-500)] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[var(--text-tertiary)]">Conectando al servidor...</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* New - admin sent to kitchen, ready for preparation */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Nuevos</h2>
              <Badge variant="warning">{newRounds.length}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
              {newRounds.length === 0 ? (
                <div className="col-span-full text-center text-[var(--text-muted)] py-8 bg-[var(--bg-secondary)] rounded-lg">
                  Sin pedidos nuevos
                </div>
              ) : (
                newRounds.map((round) => (
                  <RoundMiniCard
                    key={round.id}
                    round={round}
                    onClick={() => openRoundModal(round)}
                    isUrgent={getElapsedMinutes(round.submitted_at) > 15}
                  />
                ))
              )}
            </div>
          </div>

          {/* In Kitchen */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">En Cocina</h2>
              <Badge variant="info">{inKitchenRounds.length}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
              {inKitchenRounds.length === 0 ? (
                <div className="col-span-full text-center text-[var(--text-muted)] py-8 bg-[var(--bg-secondary)] rounded-lg">
                  Sin pedidos en preparación
                </div>
              ) : (
                inKitchenRounds.map((round) => (
                  <RoundMiniCard
                    key={round.id}
                    round={round}
                    onClick={() => openRoundModal(round)}
                    isUrgent={getElapsedMinutes(round.submitted_at) > 20}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Round Detail Modal */}
      <RoundDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        round={selectedRound}
        onStatusChange={handleStatusChange}
        isUpdating={updatingRoundId === selectedRound?.id}
        readOnly={selectedRound?.status === 'PENDING'}
      />

      {/* Screen reader announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {newRounds.length} pedidos nuevos, {inKitchenRounds.length} en cocina
      </div>
    </PageContainer>
  )
}

export default KitchenPage
