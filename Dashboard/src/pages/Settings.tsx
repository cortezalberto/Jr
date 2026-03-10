import { useRef, useCallback } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { PageContainer } from '../components/layout'
import { Card, CardHeader, Button, ConfirmDialog } from '../components/ui'
import { RefreshCw, Trash2, Download, Upload } from 'lucide-react'

// Maximum file size for import (5MB)
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
import {
  useCategoryStore,
  selectCategories,
} from '../stores/categoryStore'
import {
  useSubcategoryStore,
  selectSubcategories,
} from '../stores/subcategoryStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { useRestaurantStore, selectRestaurant } from '../stores/restaurantStore'
import { toast } from '../stores/toastStore'
import { STORAGE_KEYS } from '../utils/constants'
import { handleError } from '../utils/logger'
import { helpContent } from '../utils/helpContent'
import { useState } from 'react'

function clearAllStorageData(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
}

export function SettingsPage() {
  // REACT 19: Document metadata
  useDocumentTitle('Configuración')

  // Using selectors
  const categories = useCategoryStore(selectCategories)
  const setCategories = useCategoryStore((s) => s.setCategories)

  const subcategories = useSubcategoryStore(selectSubcategories)
  const setSubcategories = useSubcategoryStore((s) => s.setSubcategories)

  const products = useProductStore(selectProducts)
  const setProducts = useProductStore((s) => s.setProducts)

  const restaurant = useRestaurantStore(selectRestaurant)
  const setRestaurant = useRestaurantStore((s) => s.setRestaurant)

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)

  // Ref for hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ref for hidden download link
  const downloadLinkRef = useRef<HTMLAnchorElement>(null)

  const handleExportData = useCallback(() => {
    try {
      const data = {
        restaurant,
        categories,
        subcategories,
        products,
        exportedAt: new Date().toISOString(),
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)

      if (downloadLinkRef.current) {
        downloadLinkRef.current.href = url
        downloadLinkRef.current.download = `buen-sabor-backup-${new Date().toISOString().split('T')[0]}.json`
        downloadLinkRef.current.click()
        // Delay revoke to ensure download starts
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }

      toast.success('Datos exportados correctamente')
    } catch (error) {
      handleError(error, 'SettingsPage.handleExportData')
      toast.error('Error al exportar datos')
    }
  }, [restaurant, categories, subcategories, products])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Validate object has required string fields
  const hasRequiredFields = useCallback((obj: unknown, fields: string[]): boolean => {
    if (!obj || typeof obj !== 'object') return false
    const record = obj as Record<string, unknown>
    return fields.every(field => typeof record[field] === 'string' || record[field] === undefined)
  }, [])

  // Validate imported data structure with deep validation
  const validateImportData = useCallback((data: unknown): data is {
    restaurant?: unknown
    categories?: unknown[]
    subcategories?: unknown[]
    products?: unknown[]
  } => {
    if (!data || typeof data !== 'object') return false
    const obj = data as Record<string, unknown>

    // Validate restaurant object structure if present
    if (obj.restaurant !== undefined) {
      if (typeof obj.restaurant !== 'object' || obj.restaurant === null) return false
      const rest = obj.restaurant as Record<string, unknown>
      if (typeof rest.name !== 'string' || typeof rest.slug !== 'string') return false
    }

    // Validate categories array and items if present
    if (obj.categories !== undefined) {
      if (!Array.isArray(obj.categories)) return false
      if (!obj.categories.every(item => hasRequiredFields(item, ['id', 'name', 'branch_id']))) return false
    }

    // Validate subcategories array and items if present
    if (obj.subcategories !== undefined) {
      if (!Array.isArray(obj.subcategories)) return false
      if (!obj.subcategories.every(item => hasRequiredFields(item, ['id', 'name', 'category_id']))) return false
    }

    // Validate products array and items if present
    if (obj.products !== undefined) {
      if (!Array.isArray(obj.products)) return false
      if (!obj.products.every(item => hasRequiredFields(item, ['id', 'name', 'category_id']))) return false
    }

    return true
  }, [hasRequiredFields])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Validate file size to prevent DoS
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        toast.error('Archivo muy grande. El tamaño máximo es 5MB.')
        return
      }

      // Validate file type
      if (!file.name.endsWith('.json')) {
        toast.error('Solo se permiten archivos .json')
        return
      }

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        // Validate structure before importing
        if (!validateImportData(data)) {
          toast.error('Archivo invalido: estructura de datos incorrecta')
          return
        }

        // Only import valid data
        if (data.restaurant && typeof data.restaurant === 'object') {
          setRestaurant(data.restaurant)
        }
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories)
        }
        if (data.subcategories && Array.isArray(data.subcategories)) {
          setSubcategories(data.subcategories)
        }
        if (data.products && Array.isArray(data.products)) {
          setProducts(data.products)
        }

        toast.success('Datos importados correctamente')
      } catch (error) {
        handleError(error, 'SettingsPage.handleFileChange')
        toast.error('Error al importar datos. Archivo invalido.')
      }

      // Reset input value to allow re-importing same file
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [setRestaurant, setCategories, setSubcategories, setProducts, validateImportData]
  )

  const handleResetData = useCallback(() => {
    clearAllStorageData()
    window.location.reload()
  }, [])

  const handleClearCache = useCallback(() => {
    clearAllStorageData()
    toast.success('Cache limpiado. Recarga la pagina para ver los cambios.')
  }, [])

  return (
    <PageContainer
      title="Configuracion"
      description="Administra la configuracion del dashboard"
      helpContent={helpContent.settings}
    >
      {/* Hidden elements for file operations */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Seleccionar archivo de backup"
      />
      <a
        ref={downloadLinkRef}
        className="hidden"
        aria-hidden="true"
      />

      <div className="max-w-2xl space-y-6">
        {/* Data Management */}
        <Card>
          <CardHeader
            title="Gestion de Datos"
            description="Exporta, importa o resetea los datos del dashboard"
          />

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[var(--bg-tertiary)]/50 rounded-lg">
              <div>
                <p className="font-medium text-[var(--text-primary)]">Exportar Datos</p>
                <p className="text-sm text-[var(--text-muted)]">
                  Descarga un backup de todos los datos
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleExportData}
                leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
              >
                Exportar
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-[var(--bg-tertiary)]/50 rounded-lg">
              <div>
                <p className="font-medium text-[var(--text-primary)]">Importar Datos</p>
                <p className="text-sm text-[var(--text-muted)]">
                  Restaura datos desde un archivo backup
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleImportClick}
                leftIcon={<Upload className="w-4 h-4" aria-hidden="true" />}
              >
                Importar
              </Button>
            </div>
          </div>
        </Card>

        {/* Cache */}
        <Card>
          <CardHeader
            title="Cache"
            description="Administra el cache local del navegador"
          />

          <div className="flex items-center justify-between p-4 bg-[var(--bg-tertiary)]/50 rounded-lg">
            <div>
              <p className="font-medium text-[var(--text-primary)]">Limpiar Cache</p>
              <p className="text-sm text-[var(--text-muted)]">
                Elimina los datos almacenados en el navegador
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleClearCache}
              leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
            >
              Limpiar
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="border-[var(--danger-border)]/30">
          <CardHeader
            title="Zona de Peligro"
            description="Acciones destructivas e irreversibles"
          />

          <div className="flex items-center justify-between p-4 bg-[var(--danger-border)]/10 rounded-lg border border-[var(--danger-border)]/30">
            <div>
              <p className="font-medium text-[var(--danger-text)]">Resetear Datos</p>
              <p className="text-sm text-[var(--danger-text)]/70">
                Elimina todos los datos y restaura los valores por defecto
              </p>
            </div>
            <Button
              variant="danger"
              onClick={() => setIsResetDialogOpen(true)}
              leftIcon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
            >
              Resetear
            </Button>
          </div>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader title="Informacion" />
          <div className="space-y-2 text-sm" role="list">
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">Version</span>
              <span className="text-[var(--text-primary)]">1.0.0</span>
            </div>
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">Categorias</span>
              <span className="text-[var(--text-primary)]">{categories.length}</span>
            </div>
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">Subcategorias</span>
              <span className="text-[var(--text-primary)]">{subcategories.length}</span>
            </div>
            <div className="flex justify-between" role="listitem">
              <span className="text-[var(--text-muted)]">Productos</span>
              <span className="text-[var(--text-primary)]">{products.length}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isResetDialogOpen}
        onClose={() => setIsResetDialogOpen(false)}
        onConfirm={handleResetData}
        title="Resetear Datos"
        message="¿Estas seguro de resetear todos los datos? Esta accion no se puede deshacer y perderas toda la informacion almacenada."
        confirmLabel="Resetear"
      />
    </PageContainer>
  )
}

export default SettingsPage
