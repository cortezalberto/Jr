# 03 — Reglas de Negocio

> **Origen del contenido:** Reglas extraídas mediante auditoría del modelo de datos (`backend/rest_api/models/`), servicios de dominio (`services/domain/`), permisos (`services/permissions/`), CLAUDE.md y arquitectura.md. Se generó como contenido nuevo la clasificación por dominio, las tablas de invariantes y las reglas de transición de estado — estos no existían como documento independiente.

---

## 3.1 Multi-Tenancy y Aislamiento

| ID | Regla | Consecuencia de violación |
|----|-------|--------------------------|
| RN-001 | Toda entidad principal DEBE contener `tenant_id` como campo obligatorio | Fuga de datos entre restaurantes |
| RN-002 | Toda query DEBE filtrar por `tenant_id` del usuario autenticado, sin excepción | Acceso cruzado entre tenants |
| RN-003 | Los catálogos de dominio (CookingMethod, FlavorProfile, TextureProfile, CuisineType) son tenant-scoped | Contaminación de catálogos |
| RN-004 | Un usuario solo puede pertenecer a un tenant | Integridad del modelo |

---

## 3.2 Autenticación y Autorización

| ID | Regla |
|----|-------|
| RN-010 | Access token JWT tiene validez de 15 minutos; refresh token 7 días (HttpOnly cookie) |
| RN-011 | Table token HMAC tiene validez de 3 horas y se transmite en header `X-Table-Token` |
| RN-012 | Un token de refresh usado se invalida inmediatamente en la blacklist de Redis |
| RN-013 | El logout DEBE deshabilitar retry en 401 para evitar loop infinito |
| RN-014 | La blacklist de tokens opera en modo fail-closed: si Redis no responde, se deniega acceso |

### Matriz de Permisos RBAC

| Operación | ADMIN | MANAGER | KITCHEN | WAITER |
|-----------|-------|---------|---------|--------|
| Crear entidades | Todas | Staff, Mesas, Alérgenos, Promociones (propias) | Ninguna | Ninguna |
| Editar entidades | Todas | Igual que crear | Ninguna | Ninguna |
| Eliminar entidades | Todas | Ninguna | Ninguna | Ninguna |
| Ver mesas | Todas las sucursales | Sus sucursales | No aplica | Solo sectores asignados HOY |
| Cambiar estado de ronda | Todos los estados | CONFIRMED→SUBMITTED | SUBMITTED→IN_KITCHEN, IN_KITCHEN→READY | PENDING→CONFIRMED, READY→SERVED |
| Registrar pagos | Sí | Sí | No | Sí (manual) |
| Ver reportes | Sí | Sí (sus sucursales) | No | No |

---

## 3.3 Sucursales y Estructura Organizativa

| ID | Regla |
|----|-------|
| RN-020 | El slug de sucursal DEBE ser único dentro del tenant |
| RN-021 | El código de mesa es alfanumérico (ej: "INT-01") y único dentro de la sucursal, NO globalmente |
| RN-022 | Un sector pertenece a una sucursal o es global (branch_id = NULL) |
| RN-023 | Un mozo SOLO puede acceder a la sucursal si tiene WaiterSectorAssignment para la fecha actual |
| RN-024 | Las asignaciones de mozo son por día y turno — no persisten entre jornadas |

---

## 3.4 Catálogo de Menú

| ID | Regla |
|----|-------|
| RN-030 | La jerarquía del menú es estrictamente: Categoría → Subcategoría → Producto |
| RN-031 | Los nombres de categoría DEBEN ser únicos dentro de la sucursal (`UNIQUE(branch_id, name)`) |
| RN-032 | Los nombres de subcategoría DEBEN ser únicos dentro de la categoría (`UNIQUE(category_id, name)`) |
| RN-033 | Un producto DEBE tener un BranchProduct para ser visible en una sucursal |
| RN-034 | El precio se almacena en centavos como entero (`price_cents >= 0`); conversión: backend cents ↔ frontend pesos |
| RN-035 | Al soft-delete una categoría se desactivan en cascada subcategorías y productos |
| RN-036 | Al soft-delete una subcategoría se desactivan en cascada los productos asociados |
| RN-037 | Las URLs de imágenes de producto DEBEN pasar validación SSRF (bloqueo IPs internas, cloud metadata) |

---

## 3.5 Alérgenos y Seguridad Alimentaria

| ID | Regla |
|----|-------|
| RN-040 | La asociación ProductAllergen incluye obligatoriamente `presence_type` (CONTAINS, MAY_CONTAIN, FREE_FROM) y `risk_level` |
| RN-041 | `UNIQUE(product_id, allergen_id, presence_type)` — un producto no puede tener duplicados de la misma combinación |
| RN-042 | Las reacciones cruzadas (AllergenCrossReaction) DEBEN considerarse al filtrar menú para el comensal |
| RN-043 | Severity levels: mild, moderate, severe, life_threatening — impactan prioridad de visualización |
| RN-044 | Los 14 alérgenos principales DEBEN estar pre-cargados en el seed de cada tenant |

---

## 3.6 Sesiones de Mesa

| ID | Regla |
|----|-------|
| RN-050 | Una mesa SOLO puede tener una sesión OPEN a la vez |
| RN-051 | Los estados de mesa son: FREE → ACTIVE → PAYING → FREE (ciclo) + OUT_OF_SERVICE (lateral) |
| RN-052 | Los comensales PUEDEN seguir haciendo pedidos mientras la mesa está en estado PAYING |
| RN-053 | El table token contiene: table_id, session_id, diner_id, branch_id — y es intransferible |
| RN-054 | El campo `cart_version` en TableSession permite optimistic locking en operaciones de carrito |

### Diagrama de Estados de Mesa

```
                ┌──────────────────┐
                │  OUT_OF_SERVICE  │
                └──────────────────┘
                        ↑↓
    ┌──────┐     ┌──────────┐     ┌─────────┐
    │ FREE │ ──→ │  ACTIVE  │ ──→ │ PAYING  │ ──→ FREE
    └──────┘     └──────────┘     └─────────┘
     (QR scan /    (pedidos en      (CHECK_REQUESTED,
      waiter       curso)           aún puede pedir)
      activate)
```

---

## 3.7 Ciclo de Vida de Rondas

### Transiciones Válidas

```
PENDING ──→ CONFIRMED ──→ SUBMITTED ──→ IN_KITCHEN ──→ READY ──→ SERVED
   │              │
   └──→ CANCELED  └──→ CANCELED
```

| Transición | Rol autorizado | Evento emitido | Patrón |
|-----------|---------------|----------------|--------|
| → PENDING | DINER (envío desde carrito) | ROUND_PENDING | Direct Redis |
| PENDING → CONFIRMED | WAITER | ROUND_CONFIRMED | Direct Redis |
| CONFIRMED → SUBMITTED | ADMIN / MANAGER | ROUND_SUBMITTED | Outbox |
| SUBMITTED → IN_KITCHEN | KITCHEN | ROUND_IN_KITCHEN | Direct Redis |
| IN_KITCHEN → READY | KITCHEN | ROUND_READY | Outbox |
| READY → SERVED | WAITER / cualquier staff | ROUND_SERVED | Direct Redis |
| PENDING/CONFIRMED → CANCELED | WAITER / ADMIN | ROUND_CANCELED | Direct Redis |

### Reglas de Rondas

| ID | Regla |
|----|-------|
| RN-060 | NO se puede saltar estados — la transición debe ser secuencial |
| RN-061 | Solo se pueden cancelar rondas en PENDING o CONFIRMED |
| RN-062 | Cocina NO ve rondas PENDING ni CONFIRMED — solo SUBMITTED en adelante |
| RN-063 | Cada RoundItem DEBE tener `qty > 0` y `unit_price_cents >= 0` |
| RN-064 | Una ronda usa `idempotency_key` para prevenir envíos duplicados |
| RN-065 | Si al eliminar un ítem la ronda queda vacía, la ronda se elimina automáticamente |
| RN-066 | Los ítems de una ronda se combinan de todos los comensales de la mesa |

---

## 3.8 Carrito Compartido

| ID | Regla |
|----|-------|
| RN-070 | El carrito es por sesión de mesa, visible para todos los comensales |
| RN-071 | Solo el comensal que agregó un ítem puede modificarlo o eliminarlo |
| RN-072 | La cantidad por ítem está acotada entre 1 y 99 (`CHECK qty > 0 AND qty <= 99`) |
| RN-073 | `UNIQUE(session_id, diner_id, product_id)` — un comensal no puede tener duplicados del mismo producto (se hace UPSERT) |
| RN-074 | Al enviar la ronda, el carrito se limpia (CART_CLEARED) |
| RN-075 | Conflictos de concurrencia se resuelven por orden de llegada al servidor |

---

## 3.9 Facturación y Pagos

| ID | Regla |
|----|-------|
| RN-080 | Un Check (tabla `app_check`) corresponde a una sesión de mesa |
| RN-081 | `total_cents >= 0` y `paid_cents <= total_cents` y `paid_cents >= 0` — invariantes CHECK en DB |
| RN-082 | Solo se cobran ítems de rondas NO canceladas |
| RN-083 | Los pagos usan Allocation FIFO para vincular Payment → Charge |
| RN-084 | `amount_cents > 0` en Payment y en Charge — no se aceptan montos cero o negativos |
| RN-085 | Si `paid_cents == total_cents` → Check pasa a PAID automáticamente |
| RN-086 | La mesa no puede cerrarse si el Check no está PAID |
| RN-087 | Los eventos de billing (CHECK_*, PAYMENT_*) DEBEN usar Outbox pattern para garantizar entrega |
| RN-088 | Rate limiting en endpoints de billing: 5–20 req/min según endpoint |

### Estados del Check

```
OPEN ──→ REQUESTED ──→ IN_PAYMENT ──→ PAID
                                    └──→ FAILED
```

### Métodos de Pago

| Método | Proveedor | Registrado por |
|--------|-----------|----------------|
| Digital | Mercado Pago | SYSTEM (webhook) o DINER |
| Efectivo | — | WAITER (manual) |
| Tarjeta | — | WAITER (manual) |
| Transferencia | — | WAITER (manual) |

---

## 3.10 Kitchen Tickets

| ID | Regla |
|----|-------|
| RN-090 | Se genera KitchenTicket al transicionar a SUBMITTED |
| RN-091 | Los tickets se agrupan por estación (station): BAR, HOT_KITCHEN, COLD_KITCHEN |
| RN-092 | Estados del ticket: PENDING → IN_PROGRESS → READY → DELIVERED |
| RN-093 | No se puede saltar estados en tickets |

---

## 3.11 Llamados de Servicio

| ID | Regla |
|----|-------|
| RN-100 | Tipos: WAITER_CALL, PAYMENT_HELP, OTHER |
| RN-101 | Estados: OPEN → ACKED → CLOSED |
| RN-102 | SERVICE_CALL_CREATED usa Outbox pattern (entrega garantizada) |
| RN-103 | Solo el mozo asignado al sector (o ADMIN/MANAGER) puede resolver llamados |

---

## 3.12 WebSocket y Eventos

| ID | Regla |
|----|-------|
| RN-110 | Heartbeat: cliente envía ping cada 30s; servidor cierra conexión tras 60s sin actividad |
| RN-111 | Close codes: 4001 (auth failed), 4003 (forbidden), 4029 (rate limited) |
| RN-112 | Eventos con `sector_id` se envían SOLO a mozos asignados a ese sector |
| RN-113 | ADMIN/MANAGER siempre reciben todos los eventos de su branch |
| RN-114 | Eventos críticos (billing, round SUBMITTED/READY, service call) usan Redis Streams (at-least-once) |
| RN-115 | Eventos de menor criticidad (cart, status change, entity CRUD) usan Redis Pub/Sub (at-most-once) |

---

## 3.13 Soft Delete y Auditoría

| ID | Regla |
|----|-------|
| RN-120 | Toda entidad hereda AuditMixin: `is_active`, `created_at`, `updated_at`, `deleted_at` |
| RN-121 | El soft delete registra `deleted_by_id`, `deleted_by_email` y `deleted_at` |
| RN-122 | Las queries DEBEN filtrar por `is_active = True` por defecto |
| RN-123 | El cascade soft delete propaga desactivación a entidades dependientes |

---

## 3.14 Fidelización de Clientes

| ID | Regla |
|----|-------|
| RN-130 | Fase 1 (Device Tracking): fingerprint de dispositivo sin consentimiento (anonymous) |
| RN-131 | Fase 2 (Preferencias Implícitas): se registran filtros de alérgenos y cocción usados por el dispositivo |
| RN-132 | Fase 4 (Opt-In): requiere consentimiento GDPR explícito y revocable (`consent_remember`, `consent_marketing`, `consent_date`) |
| RN-133 | El campo `ai_personalization_enabled` requiere opt-in adicional |
| RN-134 | Customer tiene únicos condicionales: `(tenant_id, phone)` y `(tenant_id, email)` cuando no son NULL |

---

## 3.15 Promociones

| ID | Regla |
|----|-------|
| RN-140 | `start_date <= end_date` (CHECK constraint en DB) |
| RN-141 | `price_cents >= 0` |
| RN-142 | `quantity > 0` en PromotionItem |
| RN-143 | Una promoción se vincula a una o más sucursales via PromotionBranch |

---

## 3.16 Convenciones Generales

| ID | Regla |
|----|-------|
| RN-150 | IDs en frontend: `crypto.randomUUID()` (string); en backend: BigInteger (numeric) |
| RN-151 | Conversión IDs: `String(backendId)` frontend, `parseInt(frontendId, 10)` backend |
| RN-152 | UI en español, comentarios de código en inglés |
| RN-153 | Color accent: naranja `#f97316` |
| RN-154 | pwaMenu: TODOS los textos de UI deben usar `t()` — cero hardcoded strings |
| RN-155 | Comparación de booleanos SQLAlchemy: `.is_(True)`, nunca `== True` |
| RN-156 | Tablas con nombres reservados SQL usan prefijo: `Check` → `__tablename__ = "app_check"` |
