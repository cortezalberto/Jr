import { useMemo, useCallback, useActionState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
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
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { HelpButton } from '../components/ui/HelpButton'
import { CascadePreviewList } from '../components/ui/CascadePreviewList'
import {
  useAllergenStore,
  selectAllergens,
} from '../stores/allergenStore'
import { useProductStore, selectProducts } from '../stores/productStore'
import { useAuthStore, selectUserRoles } from '../stores/authStore'
import { deleteAllergenWithCascade, getAllergenPreview } from '../services/cascadeService'
import { toast } from '../stores/toastStore'
import { validateAllergen } from '../utils/validation'
import { handleError } from '../utils/logger'
import { canCreateAllergen, canEditAllergen, canDelete } from '../utils/permissions'
import { helpContent } from '../utils/helpContent'
import type { Allergen, AllergenFormData, TableColumn } from '../types'
import type { FormState } from '../types/form'

const initialFormData: AllergenFormData = {
  name: '',
  icon: '',
  description: '',
  is_mandatory: false,
  severity: 'moderate',
  is_active: true,
}

export function AllergensPage() {
  // REACT 19: Document metadata
  useDocumentTitle('Alérgenos')

  const allergens = useAllergenStore(selectAllergens)
  const fetchAllergens = useAllergenStore((s) => s.fetchAllergens)
  const createAllergenAsync = useAllergenStore((s) => s.createAllergenAsync)
  const updateAllergenAsync = useAllergenStore((s) => s.updateAllergenAsync)
  const deleteAllergenAsync = useAllergenStore((s) => s.deleteAllergenAsync)

  const products = useProductStore(selectProducts)

  // Role-based permissions
  const userRoles = useAuthStore(selectUserRoles)
  const canCreate = canCreateAllergen(userRoles)
  const canEdit = canEditAllergen(userRoles)
  const canDeleteAllergen = canDelete(userRoles)

  // SPRINT 11: Use custom hooks for modal and dialog state
  const modal = useFormModal<AllergenFormData, Allergen>(initialFormData)
  const deleteDialog = useConfirmDialog<Allergen>()

  // Fetch allergens from backend on mount
  useEffect(() => {
    fetchAllergens()
  }, [fetchAllergens])

  const sortedAllergens = useMemo(
    () => [...allergens].sort((a, b) => a.name.localeCompare(b.name)),
    [allergens]
  )

  const {
    paginatedItems: paginatedAllergens,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedAllergens)

  const getProductCount = useCallback(
    (allergenId: string) => {
      return products.filter((p) => p.allergen_ids?.includes(allergenId)).length
    },
    [products]
  )

  // REACT 19 IMPROVEMENT: Use useActionState for form handling
  const submitAction = useCallback(
    async (_prevState: FormState<AllergenFormData>, formData: FormData): Promise<FormState<AllergenFormData>> => {
      const data: AllergenFormData = {
        name: formData.get('name') as string,
        icon: formData.get('icon') as string,
        description: formData.get('description') as string,
        is_mandatory: formData.get('is_mandatory') === 'on',
        severity: (formData.get('severity') as AllergenFormData['severity']) || 'moderate',
        is_active: formData.get('is_active') === 'on',
      }

      const validation = validateAllergen(data)
      if (!validation.isValid) {
        return { errors: validation.errors, isSuccess: false }
      }

      try {
        if (modal.selectedItem) {
          await updateAllergenAsync(modal.selectedItem.id, data)
          toast.success('Alergeno actualizado correctamente')
        } else {
          await createAllergenAsync(data)
          toast.success('Alergeno creado correctamente')
        }
        return { isSuccess: true, message: 'Guardado correctamente' }
      } catch (error) {
        const message = handleError(error, 'AllergensPage.submitAction')
        toast.error(`Error al guardar el alergeno: ${message}`)
        return { isSuccess: false, message: `Error: ${message}` }
      }
    },
    [modal.selectedItem, updateAllergenAsync, createAllergenAsync]
  )

  const [state, formAction, isPending] = useActionState<FormState<AllergenFormData>, FormData>(
    submitAction,
    { isSuccess: false }
  )

  // SPRINT 11: Close modal on success using modal.close()
  if (state.isSuccess && modal.isOpen) {
    modal.close()
  }

  // SPRINT 11: Simplified modal handlers using custom hook
  const openEditModal = useCallback((allergen: Allergen) => {
    modal.openEdit(allergen)
  }, [modal])

  // SPRINT 11: Simplified delete handler - now async with backend
  const handleDelete = useCallback(async () => {
    if (!deleteDialog.item) return

    try {
      const productCount = getProductCount(deleteDialog.item.id)

      // First cascade delete locally (remove from products)
      const result = deleteAllergenWithCascade(deleteDialog.item.id)

      if (!result.success) {
        toast.error(result.error || 'Error al eliminar el alergeno')
        deleteDialog.close()
        return
      }

      // Then delete from backend
      await deleteAllergenAsync(deleteDialog.item.id)

      if (productCount > 0) {
        toast.warning(
          `Este alergeno estaba vinculado a ${productCount} producto(s). Se elimino la referencia.`
        )
      }

      toast.success('Alergeno eliminado correctamente')
      deleteDialog.close()
    } catch (error) {
      const message = handleError(error, 'AllergensPage.handleDelete')
      toast.error(`Error al eliminar el alergeno: ${message}`)
    }
  }, [deleteDialog, getProductCount, deleteAllergenAsync])

  const columns: TableColumn<Allergen>[] = useMemo(
    () => [
      {
        key: 'icon',
        label: 'Icono',
        width: 'w-16',
        render: (item) => (
          <span className="text-2xl" aria-label={`Icono de ${item.name}`}>
            {item.icon || '-'}
          </span>
        ),
      },
      {
        key: 'name',
        label: 'Nombre',
        render: (item) => <span className="font-medium">{item.name}</span>,
      },
      {
        key: 'description',
        label: 'Descripcion',
        render: (item) => (
          <span className="text-[var(--text-muted)] text-sm">
            {item.description || '-'}
          </span>
        ),
      },
      {
        key: 'is_active',
        label: 'Estado',
        width: 'w-24',
        render: (item) =>
          item.is_active !== false ? (
            <Badge variant="success">
              <span className="sr-only">Estado:</span> Activo
            </Badge>
          ) : (
            <Badge variant="danger">
              <span className="sr-only">Estado:</span> Inactivo
            </Badge>
          ),
      },
      {
        key: 'products',
        label: 'Productos',
        width: 'w-28',
        render: (item) => {
          const count = getProductCount(item.id)
          return <span className="text-[var(--text-muted)]">{count} productos</span>
        },
      },
      {
        key: 'actions',
        label: 'Acciones',
        width: 'w-28',
        render: (item) => (
          <div className="flex items-center gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  openEditModal(item)
                }}
                aria-label={`Editar ${item.name}`}
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
            {canDeleteAllergen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteDialog.open(item)
                }}
                className="text-[var(--danger-icon)] hover:text-[var(--danger-text)] hover:bg-[var(--danger-border)]/10"
                aria-label={`Eliminar ${item.name}`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [getProductCount, openEditModal, deleteDialog, canEdit, canDeleteAllergen]
  )

  return (
    <PageContainer
      title="Alergenos"
      description="Administra los alergenos para los productos del menu"
      helpContent={helpContent.allergens}
      actions={
        canCreate ? (
          <Button onClick={() => modal.openCreate()} leftIcon={<Plus className="w-4 h-4" />}>
            Nuevo Alergeno
          </Button>
        ) : undefined
      }
    >
      <Card padding="none">
        <Table
          data={paginatedAllergens}
          columns={columns}
          emptyMessage="No hay alergenos. Crea uno para comenzar."
          ariaLabel="Lista de alergenos"
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </Card>

      {/* SPRINT 11: Modal using useFormModal hook */}
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.close}
        title={modal.selectedItem ? 'Editar Alergeno' : 'Nuevo Alergeno'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={modal.close}>
              Cancelar
            </Button>
            <Button type="submit" form="allergen-form" isLoading={isPending}>
              {modal.selectedItem ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="allergen-form" action={formAction} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpButton
              title="Formulario de Alergeno"
              size="sm"
              content={
                <div className="space-y-3">
                  <p>
                    <strong>Completa los siguientes campos</strong> para crear o editar un alergeno:
                  </p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>
                      <strong>Nombre:</strong> Nombre del alergeno (ej: Gluten, Lacteos, Frutos Secos). Es obligatorio.
                    </li>
                    <li>
                      <strong>Icono:</strong> Un emoji representativo del alergeno (ej: 🌾, 🥛, 🥜). Se mostrara junto a los productos.
                    </li>
                    <li>
                      <strong>Descripcion:</strong> Informacion adicional sobre el alergeno para referencia.
                    </li>
                    <li>
                      <strong>Alergeno activo:</strong> Activa o desactiva la disponibilidad del alergeno para asignar a productos.
                    </li>
                  </ul>
                  <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mt-3">
                    <p className="text-[var(--primary-400)] font-medium text-sm">Consejo:</p>
                    <p className="text-sm mt-1">
                      Usa emojis claros y reconocibles para que los clientes identifiquen rapidamente los alergenos en el menu.
                    </p>
                  </div>
                </div>
              }
            />
            <span className="text-sm text-[var(--text-tertiary)]">Ayuda sobre el formulario</span>
          </div>

          <Input
            label="Nombre"
            name="name"
            value={modal.formData.name}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Ej: Gluten, Lacteos, Frutos Secos"
            error={state.errors?.name}
          />

          <Input
            label="Icono (emoji)"
            name="icon"
            value={modal.formData.icon}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, icon: e.target.value }))
            }
            placeholder="Ej: 🌾, 🥛, 🥜"
          />

          <Input
            label="Descripcion"
            name="description"
            value={modal.formData.description}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Descripcion del alergeno"
          />

          <Toggle
            label="Alergeno activo"
            name="is_active"
            checked={modal.formData.is_active}
            onChange={(e) =>
              modal.setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
            }
          />
        </form>
      </Modal>

      {/* SPRINT 11: Delete confirmation using useConfirmDialog hook */}
      {/* DASH-006: Show cascade preview with affected items */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title="Eliminar Alergeno"
        message={`¿Estas seguro de eliminar "${deleteDialog.item?.name}"?`}
        confirmLabel="Eliminar"
      >
        {deleteDialog.item && (() => {
          const preview = getAllergenPreview(deleteDialog.item.id)
          return preview && preview.totalItems > 0 ? (
            <CascadePreviewList preview={preview} maxItems={8} />
          ) : (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Ningun producto tiene este alergeno vinculado.
            </p>
          )
        })()}
      </ConfirmDialog>
    </PageContainer>
  )
}

export default AllergensPage
