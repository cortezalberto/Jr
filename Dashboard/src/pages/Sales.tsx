import { useState, useEffect, useMemo, useCallback } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Users,
  Clock,
  Download,
  RefreshCw,
} from 'lucide-react'
import { Card, Button, Select } from '../components/ui'
import { helpContent } from '../utils/helpContent'
import { useBranchStore, selectBranches } from '../stores/branchStore'
import {
  reportsAPI,
  type ReportsSummary,
  type DailySales,
  type TopProduct,
} from '../services/api'
import { toast } from '../stores/toastStore'
import { handleError } from '../utils/logger'

type DateRange = '7' | '14' | '30' | '90'

export function SalesPage() {
  useDocumentTitle('Ventas')

  const branches = useBranchStore(selectBranches)

  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange>('30')
  const [isLoading, setIsLoading] = useState(true)
  const [summary, setSummary] = useState<ReportsSummary | null>(null)
  const [dailySales, setDailySales] = useState<DailySales[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])

  const branchOptions = useMemo(
    () => [
      { value: '', label: 'Todas las sucursales' },
      ...branches.map((b) => ({ value: String(b.id), label: b.name })),
    ],
    [branches]
  )

  const dateRangeOptions = [
    { value: '7', label: 'Ultimos 7 dias' },
    { value: '14', label: 'Ultimos 14 dias' },
    { value: '30', label: 'Ultimos 30 dias' },
    { value: '90', label: 'Ultimos 90 dias' },
  ]

  const fetchReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const branchId = selectedBranchId ? parseInt(selectedBranchId, 10) : undefined
      const days = parseInt(dateRange, 10)

      const [summaryData, dailyData, topData] = await Promise.all([
        reportsAPI.getSummary(branchId, days),
        reportsAPI.getDailySales(branchId, days),
        reportsAPI.getTopProducts(branchId, days, 10),
      ])

      setSummary(summaryData)
      setDailySales(dailyData)
      setTopProducts(topData)
    } catch (error) {
      handleError(error, 'SalesPage.fetchReports')
      toast.error('Error al cargar los reportes')
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranchId, dateRange])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
  }

  const formatHour = (hour: number | null) => {
    if (hour === null) return '-'
    return `${hour}:00 - ${hour + 1}:00`
  }

  // Simple bar chart component
  const maxDailySale = Math.max(...dailySales.map((d) => d.total_sales_cents), 1)

  // Export to CSV
  const exportToCSV = useCallback(() => {
    const headers = ['Fecha', 'Ventas', 'Pedidos', 'Ticket Promedio']
    const rows = dailySales.map((d) => [
      d.date,
      (d.total_sales_cents / 100).toFixed(2),
      d.order_count,
      (d.avg_order_cents / 100).toFixed(2),
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ventas_${dateRange}dias_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Reporte exportado')
  }, [dailySales, dateRange])

  return (
    <PageContainer
      title="Ventas"
      description="Estadisticas de ventas por sucursal"
      helpContent={helpContent.sales}
      actions={
        <div className="flex items-center gap-3">
          <Select
            options={branchOptions}
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="w-48"
            aria-label="Filtrar por sucursal"
          />
          <Select
            options={dateRangeOptions}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="w-40"
            aria-label="Periodo de tiempo"
          />
          <Button
            variant="ghost"
            onClick={fetchReports}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            disabled={isLoading}
          >
            Actualizar
          </Button>
          <Button
            variant="secondary"
            onClick={exportToCSV}
            leftIcon={<Download className="w-4 h-4" />}
            disabled={dailySales.length === 0}
          >
            Exportar CSV
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[var(--text-tertiary)]">Ventas Totales</p>
            <DollarSign className="w-5 h-5 text-[var(--success-icon)]" />
          </div>
          {isLoading ? (
            <div className="h-8 bg-[var(--bg-tertiary)] rounded w-32 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {formatCurrency(summary?.total_revenue_cents || 0)}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[var(--text-tertiary)]">Pedidos</p>
            <ShoppingBag className="w-5 h-5 text-[var(--info-icon)]" />
          </div>
          {isLoading ? (
            <div className="h-8 bg-[var(--bg-tertiary)] rounded w-20 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[var(--text-primary)]">{summary?.total_orders || 0}</p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[var(--text-tertiary)]">Sesiones</p>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          {isLoading ? (
            <div className="h-8 bg-[var(--bg-tertiary)] rounded w-16 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[var(--text-primary)]">{summary?.total_sessions || 0}</p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[var(--text-tertiary)]">Ticket Promedio</p>
            <TrendingUp className="w-5 h-5 text-[var(--primary-500)]" />
          </div>
          {isLoading ? (
            <div className="h-8 bg-[var(--bg-tertiary)] rounded w-28 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {formatCurrency(summary?.avg_order_value_cents || 0)}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[var(--text-tertiary)]">Hora Pico</p>
            <Clock className="w-5 h-5 text-[var(--warning-icon)]" />
          </div>
          {isLoading ? (
            <div className="h-8 bg-[var(--bg-tertiary)] rounded w-24 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {formatHour(summary?.busiest_hour ?? null)}
            </p>
          )}
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily Sales Chart */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Ventas Diarias</h3>
          {isLoading ? (
            <div className="h-64 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
          ) : dailySales.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
              No hay datos para el periodo seleccionado
            </div>
          ) : (
            <div className="h-64 flex items-end gap-1 overflow-x-auto pb-2">
              {dailySales.map((day) => {
                const height = (day.total_sales_cents / maxDailySale) * 100
                return (
                  <div
                    key={day.date}
                    className="flex-1 min-w-[20px] max-w-[40px] flex flex-col items-center group"
                  >
                    <div
                      className="w-full bg-[var(--primary-500)] rounded-t transition-all hover:bg-orange-400"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${day.date}: ${formatCurrency(day.total_sales_cents)}`}
                    />
                    <span className="text-[10px] text-[var(--text-muted)] mt-1 rotate-45 origin-left whitespace-nowrap">
                      {day.date.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Top Products */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Productos Mas Vendidos</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
              No hay datos para el periodo seleccionado
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {topProducts.map((product, index) => {
                const maxQty = topProducts[0]?.quantity_sold || 1
                const width = (product.quantity_sold / maxQty) * 100
                return (
                  <div key={product.product_id} className="flex items-center gap-3">
                    <span className="text-[var(--text-muted)] w-6 text-right">{index + 1}.</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-[var(--text-primary)] truncate">{product.product_name}</span>
                        <span className="text-[var(--text-tertiary)] ml-2">
                          {product.quantity_sold} uds
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--bg-tertiary)] rounded overflow-hidden">
                        <div
                          className="h-full bg-[var(--info-border)] rounded"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[var(--success-text)] text-sm w-24 text-right">
                      {formatCurrency(product.total_revenue_cents)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Daily Sales Table */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Detalle por Dia</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-10 bg-[var(--bg-tertiary)]/50 rounded animate-pulse" />
            ))}
          </div>
        ) : dailySales.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] py-8">
            No hay datos para el periodo seleccionado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-default)]">
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium text-right">Ventas</th>
                  <th className="pb-2 font-medium text-right">Pedidos</th>
                  <th className="pb-2 font-medium text-right">Ticket Prom.</th>
                </tr>
              </thead>
              <tbody>
                {dailySales.slice().reverse().map((day) => (
                  <tr key={day.date} className="border-b border-[var(--border-default)]/50 hover:bg-[var(--bg-tertiary)]/30">
                    <td className="py-2 text-[var(--text-primary)]">{day.date}</td>
                    <td className="py-2 text-right text-[var(--success-text)]">
                      {formatCurrency(day.total_sales_cents)}
                    </td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">{day.order_count}</td>
                    <td className="py-2 text-right text-[var(--text-secondary)]">
                      {formatCurrency(day.avg_order_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Screen reader announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {isLoading
          ? 'Cargando estadisticas de ventas...'
          : `Mostrando ventas de los ultimos ${dateRange} dias`}
      </div>
    </PageContainer>
  )
}

export default SalesPage
