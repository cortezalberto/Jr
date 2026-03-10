import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout/PageContainer'
import { GitBranch } from 'lucide-react'
import { helpContent } from '../utils/helpContent'

export function HistoryBranchesPage() {
  // REACT 19: Document metadata
  useDocumentTitle('Historial por Sucursal')

  return (
    <PageContainer
      title="Historial por Sucursales"
      description="Historial de pedidos agrupado por sucursal"
      helpContent={helpContent.historyBranches}
    >
      <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
        <GitBranch className="w-16 h-16 mb-4" />
        <h2 className="text-xl font-semibold text-[var(--text-secondary)] mb-2">
          Historial por Sucursales
        </h2>
        <p className="text-center max-w-md">
          Proximamente podras consultar el historial de pedidos filtrado por sucursal,
          ver estadisticas de ventas y exportar reportes.
        </p>
      </div>
    </PageContainer>
  )
}

export default HistoryBranchesPage
