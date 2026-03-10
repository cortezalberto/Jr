import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  GitBranch,
  FolderTree,
  Layers,
  Package,
  DollarSign,
  AlertTriangle,
  Tags,
  Percent,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  List,
  LayoutGrid,
  Users,
  UtensilsCrossed,
  Megaphone,
  ShoppingCart,
  BarChart3,
  TrendingUp,
  History,
  Award,
  Shield,
  UserCog,
  ChefHat,
  Ban,
  BookOpen,
  Carrot,
} from 'lucide-react'
import { useBranchStore, selectSelectedBranchId } from '../../stores/branchStore'
import { useAuthStore } from '../../stores/authStore'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSubGroup {
  name: string
  icon: React.ComponentType<{ className?: string }>
  children: (NavItem | NavSubGroup)[]
}

interface NavGroup {
  name: string
  icon: React.ComponentType<{ className?: string }>
  children: (NavItem | NavSubGroup)[]
}

type NavigationItem = NavItem | NavGroup

function isNavGroup(item: NavigationItem): item is NavGroup {
  return 'children' in item && !('href' in item)
}

function isNavSubGroup(item: NavItem | NavSubGroup): item is NavSubGroup {
  return 'children' in item && !('href' in item)
}

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Restaurante', href: '/restaurant', icon: Building2 },
  {
    name: 'Cocina',
    icon: ChefHat,
    children: [
      { name: 'Comandas', href: '/kitchen', icon: ClipboardList },
      { name: 'Recetas', href: '/recipes', icon: BookOpen },
      { name: 'Ingredientes', href: '/ingredients', icon: Carrot },
    ],
  },
  {
    name: 'Gestion',
    icon: ClipboardList,
    children: [
      {
        name: 'Sucursales',
        icon: GitBranch,
        children: [
          { name: 'Todas', href: '/branches', icon: List },
          { name: 'Mesas', href: '/branches/tables', icon: LayoutGrid },
          {
            name: 'Personal',
            icon: Users,
            children: [
              { name: 'Datos', href: '/branches/staff', icon: Users },
              { name: 'Roles', href: '/branches/staff/roles', icon: UserCog },
            ],
          },
          { name: 'Pedidos', href: '/branches/orders', icon: ShoppingCart },
        ],
      },
      {
        name: 'Productos',
        icon: Package,
        children: [
          { name: 'Categorias', href: '/categories', icon: FolderTree },
          { name: 'Subcategorias', href: '/subcategories', icon: Layers },
          { name: 'Platos y Bebidas', href: '/products', icon: UtensilsCrossed },
          { name: 'Exclusiones', href: '/product-exclusions', icon: Ban },
          { name: 'Alergenos', href: '/allergens', icon: AlertTriangle },
          { name: 'Insignia', href: '/badges', icon: Award },
          { name: 'Sellos', href: '/seals', icon: Shield },
        ],
      },
    ],
  },
  {
    name: 'Marketing',
    icon: Megaphone,
    children: [
      { name: 'Precios', href: '/prices', icon: DollarSign },
      { name: 'Tipos de Promo', href: '/promotion-types', icon: Tags },
      { name: 'Promociones', href: '/promotions', icon: Percent },
    ],
  },
  {
    name: 'Estadisticas',
    icon: BarChart3,
    children: [
      { name: 'Ventas', href: '/statistics/sales', icon: TrendingUp },
      {
        name: 'Historial',
        icon: History,
        children: [
          { name: 'Sucursales', href: '/statistics/history/branches', icon: GitBranch },
          { name: 'Clientes', href: '/statistics/history/customers', icon: Users },
        ],
      },
    ],
  },
]

const bottomNavigation = [
  { name: 'Configuracion', href: '/settings', icon: Settings },
]

// Memoized map of group names to their paths (computed once at module level)
const groupPathsMap = new Map<string, string[]>()

function getGroupPaths(items: (NavItem | NavSubGroup)[]): string[] {
  const paths: string[] = []
  for (const item of items) {
    if (isNavSubGroup(item)) {
      // Recursively get paths from nested subgroups
      paths.push(...getGroupPaths(item.children))
    } else {
      paths.push(item.href)
    }
  }
  return paths
}

// Recursively register all subgroups in the path map
function registerSubgroups(items: (NavItem | NavSubGroup)[]) {
  for (const item of items) {
    if (isNavSubGroup(item)) {
      const itemPaths = getGroupPaths(item.children)
      groupPathsMap.set(item.name, itemPaths)
      registerSubgroups(item.children)
    }
  }
}

// Pre-compute all group paths at module initialization
for (const item of navigation) {
  if (isNavGroup(item)) {
    groupPathsMap.set(item.name, getGroupPaths(item.children))
    registerSubgroups(item.children)
  }
}

// Helper to check if a path is active
function isPathActive(pathname: string, targetPath: string): boolean {
  return pathname === targetPath || pathname.startsWith(targetPath + '/')
}

// Helper to check if a subgroup has any active child (recursively)
function hasActiveChild(children: (NavItem | NavSubGroup)[], pathname: string): boolean {
  return children.some((child) => {
    if (isNavSubGroup(child)) {
      return hasActiveChild(child.children, pathname)
    }
    return isPathActive(pathname, (child as NavItem).href)
  })
}

export function Sidebar() {
  const location = useLocation()
  const selectedBranchId = useBranchStore(selectSelectedBranchId)
  const selectedBranch = useBranchStore((state) =>
    selectedBranchId ? state.branches.find((b) => b.id === selectedBranchId) : undefined
  )
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  // Track open state for all groups dynamically
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}

    // Auto-open groups and subgroups if any child is active
    for (const item of navigation) {
      if (isNavGroup(item)) {
        const groupPaths = groupPathsMap.get(item.name) ?? []
        const isActive = groupPaths.some((path) => isPathActive(location.pathname, path))
        initial[item.name] = isActive

        // Check subgroups
        for (const child of item.children) {
          if (isNavSubGroup(child)) {
            const subPaths = groupPathsMap.get(child.name) ?? []
            const subIsActive = subPaths.some((path) => isPathActive(location.pathname, path))
            initial[child.name] = subIsActive
          }
        }
      }
    }

    return initial
  })

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // Recursive function to render subgroups and items
  const renderSubItem = (child: NavItem | NavSubGroup, depth: number = 0, parentKey: string = ''): React.ReactElement => {
    const itemKey = parentKey ? `${parentKey}-${child.name}` : child.name

    if (isNavSubGroup(child)) {
      const subIsOpen = openGroups[child.name] ?? false
      const subHasActiveChild = hasActiveChild(child.children, location.pathname)

      return (
        <div key={itemKey}>
          <button
            onClick={() => toggleGroup(child.name)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 ${
              subHasActiveChild
                ? 'text-[var(--primary-600)] bg-[var(--primary-500)]/10'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
            aria-expanded={subIsOpen}
            aria-label={`${subIsOpen ? 'Contraer' : 'Expandir'} ${child.name}`}
          >
            <child.icon className="w-4 h-4" aria-hidden="true" />
            <span className="text-sm font-medium flex-1 text-left">{child.name}</span>
            <ChevronRight
              className={`w-3 h-3 transition-transform duration-200 ${
                subIsOpen ? 'rotate-90' : ''
              }`}
              aria-hidden="true"
            />
          </button>
          {subIsOpen && (
            <div className={`mt-1 ml-4 pl-3 border-l border-[var(--border-default)] space-y-1`}>
              {child.children.map((subChild) => renderSubItem(subChild, depth + 1, itemKey))}
            </div>
          )}
        </div>
      )
    }

    // QA-DASH-CRIT-03 FIX: Use itemKey (hierarchical) instead of href to prevent duplicate keys
    // when same href appears in multiple navigation groups
    return (
      <NavLink
        key={itemKey}
        to={child.href}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 ${depth > 0 ? 'py-1.5' : 'py-2'} rounded-lg transition-colors duration-150 ${
            isActive
              ? 'bg-[var(--primary-500)]/15 text-[var(--primary-600)] border-l-3 border-[var(--primary-500)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`
        }
      >
        <child.icon className={`${depth > 0 ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} aria-hidden="true" />
        <span className={`${depth > 0 ? 'text-xs' : 'text-sm'} font-medium`}>{child.name}</span>
      </NavLink>
    )
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-64 border-r border-[var(--border-default)] flex flex-col bg-[var(--bg-secondary)]"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-[var(--primary-500)] to-[var(--primary-600)] rounded-lg flex items-center justify-center shadow-[var(--shadow-primary)]">
            <span className="text-[var(--text-inverse)] font-bold text-lg">B</span>
          </div>
          <span
            className="text-[var(--text-primary)] font-bold text-xl"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Buen Sabor
          </span>
        </div>
      </div>

      {/* Selected Branch Indicator */}
      {selectedBranch && (
        <div className="px-4 py-3 border-b border-[var(--border-default)] bg-gradient-to-r from-[var(--primary-500)]/10 to-transparent">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
            Sucursal activa
          </p>
          <p className="text-sm font-semibold text-[var(--primary-600)] truncate mt-0.5">
            {selectedBranch.name}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          // Check if item requires branch selection
          const requiresBranch = item.name !== 'Dashboard' && item.name !== 'Restaurante'
          const isDisabled = requiresBranch && !selectedBranchId

          if (isNavGroup(item)) {
            const isOpen = openGroups[item.name] ?? false
            const groupPaths = groupPathsMap.get(item.name) ?? []
            const hasActiveChild = groupPaths.some((path) => isPathActive(location.pathname, path))

            return (
              <div key={item.name}>
                <button
                  onClick={() => !isDisabled && toggleGroup(item.name)}
                  disabled={isDisabled}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 ${
                    isDisabled
                      ? 'text-[var(--text-muted)] cursor-not-allowed opacity-50'
                      : hasActiveChild
                      ? 'text-[var(--primary-600)] bg-[var(--primary-500)]/10'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Contraer' : 'Expandir'} ${item.name}`}
                  title={isDisabled ? 'Selecciona una sucursal para acceder' : undefined}
                >
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  <span className="font-semibold flex-1 text-left">{item.name}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && !isDisabled && (
                  <div className="mt-1 ml-4 pl-3 border-l border-[var(--border-default)] space-y-1">
                    {item.children.map((child) => renderSubItem(child, 0, item.name))}
                  </div>
                )}
              </div>
            )
          }

          // For non-group items (Dashboard, Restaurante)
          if (isDisabled) {
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-muted)] cursor-not-allowed opacity-50"
                title="Selecciona una sucursal para acceder"
              >
                <item.icon className="w-5 h-5" aria-hidden="true" />
                <span className="font-semibold">{item.name}</span>
              </div>
            )
          }

          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 ${
                  isActive
                    ? 'bg-[var(--primary-500)]/15 text-[var(--primary-600)] border-l-3 border-[var(--primary-500)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`
              }
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="font-semibold">{item.name}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-[var(--border-default)] space-y-1">
        {bottomNavigation.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 ${
                isActive
                  ? 'bg-[var(--primary-500)]/15 text-[var(--primary-600)] border-l-3 border-[var(--primary-500)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`
            }
          >
            <item.icon className="w-5 h-5" aria-hidden="true" />
            <span className="font-semibold">{item.name}</span>
          </NavLink>
        ))}

        {/* User Info */}
        {user && (
          <div className="px-3 py-2 mb-2 text-xs text-[var(--text-muted)]">
            <p className="truncate">{user.email}</p>
            <p className="text-[var(--text-tertiary)]">{user.roles.join(', ')}</p>
          </div>
        )}

        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
          onClick={logout}
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
          <span className="font-medium">Cerrar Sesion</span>
        </button>
      </div>
    </aside>
  )
}
