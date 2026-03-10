import { useMemo, useCallback, useActionState } from 'react'
import { Plus, Pencil, Trash2, Award } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFormModal } from '../hooks/useFormModal'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { usePagination } from '../hooks/usePagination'
import { PageContainer } from '../components/layout/PageContainer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Toggle } from '../components/ui/Toggle'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge as UIBadge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { useBadgeStore, selectBadges } from '../stores/badgeStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { toast } from '../stores/toastStore'
import { validateBadge } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateBadge, canEditBadge, canDelete } from '../utils/permissions'
import type { ProductBadge, BadgeFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: BadgeFormData = {
  name: '',
  color: 'var(--primary-500)',
  is_active: true,
}

export default function BadgesPage() {
  // REACT 19: Document metadata
  useDocumentTitle('Distintivos')

  const badges = useBadgeStore(selectBadges)
  const addBadge = useBadgeStore((s) => s.addBadge)
  const updateBadge = useBadgeStore((s) => s.updateBadge)
  const deleteBadge = useBadgeStore((s) => s.deleteBadge)

  const products = useProductStore(selectProducts)
  const removeBadgeFromProducts = useProductStore((s) => s.removeBadgeFromProducts)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateBadge(userRoles)
  const canEdit = canEditBadge(userRoles)
  const canDeleteBadge = canDelete(userRoles)

  // SPRINT 13: Use custom hooks for modal and dialog state
  const modal = useFormModal<BadgeFormData, ProductBadge>(initialFormData)
  const deleteDialog = useConfirmDialog<ProductBadge>()

  const sortedBadges = useMemo(
    () => [...badges].sort((a, b) => a.name.localeCompare(b.name)),
    [badges]
  )

  const {
    paginatedItems: paginatedBadges,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedBadges)

  const getProductCount = useCallback(
    (badgeName: string) => {
      return products.filter((p) => p.badge === badgeName).length
    },
    [products]
  )

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<BadgeFormData>, formData: FormData): Promise<FormState<BadgeFormData>> => {
      const data: BadgeFormData = {
        name: formData.get('name') as string,
        color: formData.get('color') as string,
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validateBadge(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          updateBadge(modal.selectedItem.id, data)
          toast.success('Insignia actualizada correctamente')
        } else {
          addBadge(data)
          toast.success('Insignia creada correctamente')
        }
        return { isSuccess: true, message: 'Guardado correctamente' }
      } catch (error) {
        const message = handleError(error, 'BadgesPage.submitAction')
        toast.error(`Error al guardar la insignia: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateBadge, addBadge]
  )

  const [state, formAction, isPending] = useActionState<FormState<BadgeFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // SPRINT 13: Close modal on success using modal.close()
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // SPRINT 13: Simplified modal handlers using custom hook
  const openCreateModal = useCallback(() => {
    modal.openCreate(initialFormData)
  }, [modal])

  const openEditModal = useCallback((badge: ProductBadge) => {
    modal.openEdit(badge, {
      name: badge.name,
      color: badge.color || 'var(--primary-500)',
      is_active: badge.is_active ?? true,
    })
  }, [modal])

  // SPRINT 13: Simplified delete handler
  const handleDelete = useCallback(() => {
    if (!deleteDialog.item) return

    try {
      const productCount = getProductCount(deleteDialog.item.name)

      // Remove badge from products if needed
      if (removeBadgeFromProducts && productCount > 0) {
        removeBadgeFromProducts(deleteDialog.item.name)
      }

      // Delete badge
      deleteBadge(deleteDialog.item.id)

      if (productCount > 0) {
        toast.warning(
          `Esta insignia estaba vinculada a ${productCount} producto(s). Se elimino la referencia.`
        )
      }

      toast.success('Insignia eliminada correctamente')
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'BadgesPage.handleDelete')
      toast.error(`Error al eliminar la insignia: ${message}`)
    }
  }, [deleteDialog, getProductCount, deleteBadge, removeBadgeFromProducts])

  const columns: TableColumn<ProductBadge>[] = useMemo(
    () => [
      {
        key: 'preview',
        label: 'Preview',
        render: (badge) => (
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[var(--primary-500)]" />
            <span
              className="text-xs px-2 py-1 rounded font-semibold"
              style={{
                backgroundColor: `${badge.color}33`,
                color: badge.color,
              }}
            >
              {badge.name}
            </span>
          </div>
        ),
      },
      {
        key: 'name',
        label: 'Nombre',
        sortable: true,
      },
      {
        key: 'color',
        label: 'Color',
        render: (badge) => (
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded border border-[var(--border-default)]"
              style={{ backgroundColor: badge.color }}
            />
            <span className="text-sm text-[var(--text-tertiary)] font-mono">{badge.color}</span>
          </div>
        ),
      },
      {
        key: 'is_active',
        label: 'Estado',
        render: (badge) => (
          <UIBadge variant={badge.is_active ? 'success' : 'danger'}>
            {badge.is_active ? 'Activo' : 'Inactivo'}
          </UIBadge>
        ),
      },
      {
        key: 'actions',
        label: '',
        render: (badge) => {
          const productCount = getProductCount(badge.name)
          return (
            <div className="flex items-center justify-end gap-2">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(badge)}
                  aria-label={`Editar ${badge.name}`}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              {canDeleteBadge && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteDialog.open(badge)}
                  aria-label={`Eliminar ${badge.name}`}
                  disabled={productCount > 0}
                  title={
                    productCount > 0
                      ? `No se puede eliminar. ${productCount} producto(s) usan esta insignia.`
                      : undefined
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [getProductCount, openEditModal, deleteDialog, canEdit, canDeleteBadge]
  )

  return (
    <>
      <title>Insignias - Dashboard</title>
      <meta name="description" content="Gestión de insignias para productos del restaurante" />

      <PageContainer
        title="Insignias"
        actions={
          canCreate ? (
            <Button onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Insignia
            </Button>
          ) : undefined
        }
      >
        <Card>
          <Table
            columns={columns}
            data={paginatedBadges}
            emptyMessage="No hay insignias creadas. Crea una para comenzar."
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </Card>

        {/* SPRINT 13: Modal using useFormModal hook */}
        <Modal
          isOpen={modal.isOpen}
          onClose={modal.close}
          title={modal.selectedItem ? 'Editar Insignia' : 'Nueva Insignia'}
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={modal.close}>
                Cancelar
              </Button>
              <Button type="submit" form="badge-form" isLoading={isPending}>
                {modal.selectedItem ? 'Guardar Cambios' : 'Crear Insignia'}
              </Button>
            </>
          }
        >
          <form id="badge-form" action={formAction} className="space-y-4">
            <Input
              label="Nombre"
              name="name"
              placeholder="Ej: Nuevo, Popular, Chef's Choice"
              value={modal.formData.name}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              error={state.errors?.name}
              required
            />

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  name="color"
                  value={modal.formData.color}
                  onChange={(e) =>
                    modal.setFormData((prev) => ({ ...prev, color: e.target.value }))
                  }
                  className="h-10 w-20 rounded border border-[var(--border-default)] bg-[var(--bg-tertiary)] cursor-pointer"
                />
                <Input
                  name="color_text"
                  placeholder="var(--primary-500)"
                  value={modal.formData.color}
                  onChange={(e) =>
                    modal.setFormData((prev) => ({ ...prev, color: e.target.value }))
                  }
                  error={state.errors?.color}
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Color del texto y fondo de la insignia
              </p>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Vista Previa
              </label>
              <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-default)]">
                {modal.formData.name ? (
                  <span
                    className="inline-block text-xs px-2 py-1 rounded font-semibold"
                    style={{
                      backgroundColor: `${modal.formData.color}33`,
                      color: modal.formData.color,
                    }}
                  >
                    {modal.formData.name}
                  </span>
                ) : (
                  <span className="text-sm text-[var(--text-muted)]">
                    Ingresa un nombre para ver la vista previa
                  </span>
                )}
              </div>
            </div>

            <Toggle
              label="Activo"
              name="is_active"
              checked={modal.formData.is_active}
              onChange={(e) =>
                modal.setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
              }
            />
          </form>
        </Modal>

        {/* SPRINT 13: Delete confirmation using useConfirmDialog hook */}
        <ConfirmDialog
          isOpen={deleteDialog.isOpen}
          onClose={deleteDialog.close}
          onConfirm={handleDelete}
          title="Eliminar Insignia"
          message={`¿Estas seguro de eliminar "${deleteDialog.item?.name}"?`}
          confirmLabel="Eliminar"
        />
      </PageContainer>
    </>
  )
}
