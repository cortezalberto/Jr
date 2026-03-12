# 06 — Contratos de API

> **Origen del contenido:** Endpoints extraídos directamente de los 48 archivos de routers en `backend/rest_api/routers/` y los 4 endpoints WebSocket en `ws_gateway/`. Se auditaron los decoradores de ruta, parámetros, dependencias y schemas Pydantic del código fuente. Se generó como contenido nuevo: la documentación de Request/Response bodies, códigos de error, y la tabla de eventos WebSocket — estos no existían como documento consolidado.

---

## 6.1 Convenciones Generales

| Aspecto | Convención |
|---------|-----------|
| Base URL | `http://localhost:8000/api` |
| Content-Type | `application/json` (POST/PUT/PATCH) |
| Autenticación Staff | `Authorization: Bearer {jwt_token}` |
| Autenticación Diner | `X-Table-Token: {table_token}` |
| Paginación | `?limit=100&offset=0` (max 500) |
| IDs | BigInteger (numeric) |
| Precios | Enteros en centavos |
| Soft Delete | `is_active: false` (no eliminación física) |
| Errores | `{ "detail": "message" }` con HTTP status code |
| Idempotencia | Header `X-Idempotency-Key` en operaciones críticas |

### Códigos de Error Comunes

| Código | Significado |
|--------|-------------|
| 400 | Validación fallida (Pydantic, reglas de negocio) |
| 401 | Token inválido, expirado o blacklisted |
| 403 | Rol insuficiente para la operación |
| 404 | Entidad no encontrada (scoped por tenant) |
| 409 | Conflicto (duplicado, estado inválido) |
| 429 | Rate limit excedido (Retry-After header) |
| 500 | Error interno del servidor |

---

## 6.2 Autenticación (`/api/auth`)

### POST `/api/auth/login`
Login con credenciales.

**Request:**
```json
{
  "email": "admin@demo.com",
  "password": "admin123"
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "admin@demo.com",
    "first_name": "Admin",
    "last_name": "Demo",
    "tenant_id": 1,
    "branch_ids": [1, 2],
    "roles": ["ADMIN"]
  }
}
```
+ Cookie `HttpOnly`: `refresh_token=...` (7 días)

**Response 401:** `{ "detail": "Credenciales inválidas" }`

---

### POST `/api/auth/refresh`
Renueva access token usando refresh token de cookie.

**Request:** Cookie `refresh_token` (automática con `credentials: 'include'`)

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```
+ Cookie rotada con nuevo refresh token

---

### GET `/api/auth/me`
Obtener perfil del usuario autenticado.

**Auth:** Bearer JWT

**Response 200:**
```json
{
  "id": 1,
  "email": "admin@demo.com",
  "first_name": "Admin",
  "last_name": "Demo",
  "tenant_id": 1,
  "branch_ids": [1, 2],
  "roles": ["ADMIN"]
}
```

---

### POST `/api/auth/logout`
Cerrar sesión e invalidar tokens.

**Auth:** Bearer JWT (retry en 401 DESHABILITADO)

**Response 200:** `{ "detail": "Sesión cerrada" }`

---

## 6.3 Endpoints Públicos (`/api/public`)

### GET `/api/public/branches`
Listar sucursales activas (sin auth, para pre-login de mozo).

**Response 200:**
```json
[
  {
    "id": 1,
    "name": "Sucursal Centro",
    "slug": "centro",
    "address": "Av. Principal 123"
  }
]
```

---

### GET `/api/public/menu/{branch_slug}`
Menú completo de una sucursal.

**Response 200:**
```json
{
  "branch": { "id": 1, "name": "Sucursal Centro", "slug": "centro" },
  "categories": [
    {
      "id": 1,
      "name": "Hamburguesas",
      "image": "https://...",
      "subcategories": [
        {
          "id": 1,
          "name": "Clásicas",
          "products": [
            {
              "id": 1,
              "name": "Hamburguesa Doble",
              "description": "...",
              "image": "https://...",
              "price_cents": 12550,
              "featured": true,
              "allergens": [
                { "id": 1, "name": "Gluten", "presence_type": "contains", "risk_level": "standard" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

### GET `/api/public/menu/{branch_slug}/allergens`
Alérgenos con reacciones cruzadas para la sucursal.

**Response 200:**
```json
[
  {
    "id": 1,
    "name": "Gluten",
    "icon": "🌾",
    "severity": "moderate",
    "cross_reactions": [
      { "allergen_id": 2, "name": "Trigo", "probability": "high" }
    ]
  }
]
```

---

### GET `/api/public/health`
Health check básico.

**Response 200:** `{ "status": "ok" }`

### GET `/api/public/health/detailed`
Health check con estado de dependencias.

**Response 200:**
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "version": "1.0.0"
}
```

---

## 6.4 Admin — Categorías (`/api/admin/categories`)

**Auth:** Bearer JWT (ADMIN, MANAGER)

### GET `/api/admin/categories?branch_id={id}&limit=100&offset=0`
**Response 200:** `[{ "id": 1, "name": "Hamburguesas", "branch_id": 1, "order": 1, "image": "..." }]`

### GET `/api/admin/categories/{id}`
**Response 200:** `{ "id": 1, "name": "Hamburguesas", ... }`

### POST `/api/admin/categories`
**Request:** `{ "name": "Hamburguesas", "branch_id": 1, "image": "https://...", "order": 1 }`
**Response 201:** `{ "id": 1, ... }`

### PATCH `/api/admin/categories/{id}`
**Request:** `{ "name": "Burgers" }` (campos parciales)
**Response 200:** `{ "id": 1, "name": "Burgers", ... }`

### DELETE `/api/admin/categories/{id}`
**Response 200:** `{ "detail": "Categoría eliminada", "affected": { "subcategories": 3, "products": 12 } }`

---

## 6.5 Admin — Productos (`/api/admin/products`)

**Auth:** Bearer JWT (ADMIN, MANAGER)

### GET `/api/admin/products?branch_id={id}&category_id={id}&limit=100&offset=0`
**Response 200:**
```json
[
  {
    "id": 1,
    "name": "Hamburguesa Doble",
    "description": "...",
    "image": "...",
    "category_id": 1,
    "subcategory_id": 1,
    "featured": true,
    "branch_products": [
      { "branch_id": 1, "price_cents": 12550, "is_available": true }
    ],
    "allergens": [
      { "allergen_id": 1, "presence_type": "contains", "risk_level": "standard" }
    ]
  }
]
```

### POST `/api/admin/products`
**Request:**
```json
{
  "name": "Hamburguesa Triple",
  "description": "...",
  "image": "https://...",
  "category_id": 1,
  "subcategory_id": 1,
  "branch_products": [
    { "branch_id": 1, "price_cents": 15000, "is_available": true }
  ],
  "allergens": [
    { "allergen_id": 1, "presence_type": "contains", "risk_level": "standard" }
  ]
}
```
**Response 201:** Product object completo

### PATCH `/api/admin/products/{id}`
**Request:** Campos parciales (nombre, descripción, precios, alérgenos)
**Response 200:** Product actualizado

### DELETE `/api/admin/products/{id}`
**Response 200:** `{ "detail": "Producto eliminado" }`

---

## 6.6 Admin — Sucursales (`/api/admin/branches`)

**Auth:** Bearer JWT (ADMIN)

### GET `/api/admin/branches`
### GET `/api/admin/branches/{id}`
### POST `/api/admin/branches`
**Request:** `{ "name": "Sucursal Norte", "slug": "norte", "address": "...", "phone": "..." }`

### PATCH `/api/admin/branches/{id}`
### DELETE `/api/admin/branches/{id}`

---

## 6.7 Admin — Staff (`/api/admin/staff`)

**Auth:** Bearer JWT (ADMIN, MANAGER para lectura)

### GET `/api/admin/staff?branch_id={id}&role={role}`
### GET `/api/admin/staff/{id}`
### POST `/api/admin/staff`
**Request:**
```json
{
  "email": "mozo@demo.com",
  "password": "password123",
  "first_name": "Juan",
  "last_name": "Pérez",
  "roles": [
    { "branch_id": 1, "role": "WAITER" }
  ]
}
```

### PATCH `/api/admin/staff/{id}`
### DELETE `/api/admin/staff/{id}` (ADMIN only)

---

## 6.8 Admin — Mesas y Sectores

### Sectores (`/api/admin/sectors`)

**Auth:** Bearer JWT (ADMIN, MANAGER)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/sectors?branch_id={id}` | Listar sectores (global + branch) |
| POST | `/api/admin/sectors` | Crear sector |
| DELETE | `/api/admin/sectors/{id}` | Eliminar sector |

**Request POST:** `{ "name": "Terraza", "prefix": "TER", "branch_id": 1 }`

### Mesas (`/api/admin/tables`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/tables?branch_id={id}` | Listar mesas con estados de rondas activas |
| GET | `/api/admin/tables/{id}` | Detalle de mesa |
| POST | `/api/admin/tables` | Crear mesa |
| POST | `/api/admin/tables/batch` | Crear múltiples mesas por sector |
| PATCH | `/api/admin/tables/{id}` | Actualizar mesa |
| DELETE | `/api/admin/tables/{id}` | Eliminar mesa |

**Request POST:** `{ "code": "INT-01", "capacity": 4, "sector_id": 1, "branch_id": 1 }`

---

## 6.9 Admin — Alérgenos (`/api/admin/allergens`)

**Auth:** Bearer JWT (ADMIN, MANAGER)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/allergens` | Listar alérgenos con cross-reactions |
| GET | `/api/admin/allergens/{id}` | Detalle |
| POST | `/api/admin/allergens` | Crear |
| PATCH | `/api/admin/allergens/{id}` | Actualizar |
| DELETE | `/api/admin/allergens/{id}` | Eliminar |
| GET | `/api/admin/allergens/cross-reactions` | Listar reacciones cruzadas |
| POST | `/api/admin/allergens/cross-reactions` | Crear reacción cruzada |
| PATCH | `/api/admin/allergens/cross-reactions/{id}` | Actualizar |
| DELETE | `/api/admin/allergens/cross-reactions/{id}` | Eliminar |

---

## 6.10 Admin — Pedidos (`/api/admin/orders`)

**Auth:** Bearer JWT (ADMIN, MANAGER)

### GET `/api/admin/orders/stats?branch_id={id}`
**Response 200:**
```json
{
  "active": 12,
  "pending": 3,
  "in_kitchen": 5,
  "ready": 4
}
```

### GET `/api/admin/orders?branch_id={id}&status={status}`
Lista de pedidos activos con filtro por estado.

---

## 6.11 Sesiones de Mesa (`/api/tables`)

### POST `/api/tables/{id}/session`
Crear o obtener sesión por ID numérico de mesa.

**Response 200:**
```json
{
  "session_id": 1,
  "table_id": 5,
  "table_code": "INT-01",
  "status": "OPEN",
  "table_token": "hmac_token...",
  "diner_id": 1,
  "diners": [{ "id": 1, "name": "Juan", "color": "#FF5733" }]
}
```

### POST `/api/tables/code/{code}/session`
Crear o obtener sesión por código de mesa (usado en QR scan).

**Query param:** `branch_slug={slug}` (requerido porque codes no son únicos globalmente)

---

## 6.12 Operaciones de Comensal (`/api/diner`)

**Auth:** X-Table-Token

### POST `/api/diner/register`
**Request:** `{ "name": "Juan", "local_id": "uuid-v4", "device_id": "fingerprint..." }`
**Response 200:** `{ "diner_id": 1, "color": "#FF5733", "table_token": "..." }`

### Carrito (`/api/diner/cart`)

| Método | Endpoint | Request | Descripción |
|--------|----------|---------|-------------|
| POST | `/cart/add` | `{ "product_id": 1, "quantity": 2, "notes": "sin cebolla" }` | Agregar (UPSERT) |
| PATCH | `/cart/{item_id}` | `{ "quantity": 3, "notes": "..." }` | Actualizar |
| DELETE | `/cart/{item_id}` | — | Eliminar ítem |
| GET | `/cart` | — | Obtener carrito con version |
| DELETE | `/cart` | — | Limpiar carrito |

**Response GET /cart:**
```json
{
  "items": [
    {
      "id": 1,
      "product_id": 5,
      "product_name": "Hamburguesa Doble",
      "quantity": 2,
      "notes": "sin cebolla",
      "diner_id": 1,
      "diner_name": "Juan",
      "diner_color": "#FF5733"
    }
  ],
  "cart_version": 3
}
```

### Rondas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/diner/rounds/submit` | Enviar ronda (idempotency_key header) |
| GET | `/diner/session/{id}/rounds` | Historial de rondas |
| GET | `/diner/session/{id}/total` | Total de la sesión |

**Request POST /rounds/submit:**
```json
{
  "items": [
    { "product_id": 1, "qty": 2, "unit_price_cents": 12550, "notes": "sin cebolla", "diner_id": 1 }
  ]
}
```

### Servicio y Cuenta

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/diner/service-call` | `{ "type": "WAITER_CALL" }` |
| GET | `/diner/check` | Obtener detalle de cuenta |

---

## 6.13 Customer / Fidelización (`/api/customer`)

**Auth:** X-Table-Token

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/customer/register` | Registro opt-in con consentimiento GDPR |
| GET | `/customer/recognize` | Verificar si device_id es conocido |
| GET | `/customer/me` | Perfil de cliente |
| PATCH | `/customer/me` | Actualizar preferencias |
| GET | `/customer/suggestions` | Recomendaciones personalizadas |

**Response GET /customer/suggestions:**
```json
{
  "favorites": [{ "product_id": 1, "name": "...", "order_count": 5 }],
  "last_ordered": [{ "product_id": 3, "name": "...", "last_date": "2026-03-10" }],
  "recommendations": [{ "product_id": 7, "name": "...", "reason": "similar_to_favorites" }]
}
```

---

## 6.14 Cocina (`/api/kitchen`)

**Auth:** Bearer JWT (KITCHEN role)

### Rondas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/kitchen/rounds` | Rondas SUBMITTED + IN_KITCHEN |
| GET | `/kitchen/rounds/{id}` | Detalle de ronda |
| POST | `/kitchen/rounds/{id}/status` | `{ "status": "IN_KITCHEN" }` |

### Kitchen Tickets

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/kitchen/tickets` | Tickets agrupados por estación |
| GET | `/kitchen/tickets/{id}` | Detalle de ticket |
| PATCH | `/kitchen/tickets/{id}/status` | `{ "status": "IN_PROGRESS" }` |
| POST | `/kitchen/rounds/{id}/tickets` | Auto-generar tickets desde ronda |

---

## 6.15 Operaciones del Mozo (`/api/waiter`)

**Auth:** Bearer JWT (WAITER role)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/waiter/verify-branch-assignment` | `?branch_id={id}` — verifica asignación HOY |
| GET | `/waiter/tables` | Mesas del mozo (filtradas por sector) |
| GET | `/waiter/tables/{id}/session` | Sesión con diners, rounds, check |
| POST | `/waiter/tables/{id}/activate` | Activar mesa (crear sesión como waiter) |
| POST | `/waiter/sessions/{id}/rounds` | Enviar ronda por comensal sin celular |
| POST | `/waiter/sessions/{id}/check` | Solicitar cuenta |
| POST | `/waiter/payments/manual` | Registrar pago manual |
| POST | `/waiter/tables/{id}/close` | Cerrar mesa |
| GET | `/waiter/branches/{id}/menu` | Menú compacto para comanda rápida (sin imágenes) |
| POST | `/waiter/service-calls/{id}/resolve` | Resolver llamado de servicio |

**Request POST /waiter/payments/manual:**
```json
{
  "check_id": 1,
  "amount_cents": 25000,
  "manual_method": "cash",
  "manual_notes": "Pago en efectivo"
}
```

---

## 6.16 Facturación (`/api/billing`)

**Auth:** X-Table-Token (diner) o Bearer JWT (staff)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | `/billing/check/request` | Table-Token | Solicitar cuenta (diner) |
| POST | `/billing/cash/pay` | JWT | Registrar pago efectivo (waiter) |
| POST | `/billing/tables/{id}/clear` | JWT | Limpiar mesa post-pago |
| GET | `/billing/check/{id}` | JWT/Token | Detalle de cuenta con pagos |
| GET | `/billing/check/{id}/balances` | JWT/Token | Balance por comensal |
| POST | `/billing/mercadopago/preference` | Token | Crear preferencia Mercado Pago |
| POST | `/billing/mercadopago/webhook` | — (IP whitelist) | Webhook Mercado Pago |

**Response GET /billing/check/{id}:**
```json
{
  "id": 1,
  "status": "REQUESTED",
  "total_cents": 37650,
  "paid_cents": 0,
  "charges": [
    { "id": 1, "description": "Hamburguesa Doble x2", "amount_cents": 25100, "diner_id": 1 },
    { "id": 2, "description": "Coca Cola x1", "amount_cents": 12550, "diner_id": 2 }
  ],
  "payments": []
}
```

**Rate limits:** 5–20 req/min según endpoint

---

## 6.17 Contenido (`/api/content`)

**Auth:** Bearer JWT (ADMIN, MANAGER, KITCHEN para recetas)

### Ingredientes

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET/POST | `/content/ingredient-groups` | CRUD de grupos |
| GET/POST | `/content/ingredients` | CRUD de ingredientes |

### Recetas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET/POST | `/content/recipes` | CRUD de recetas |
| GET/PATCH/DELETE | `/content/recipes/{id}` | Operaciones sobre receta |

### Promociones

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET/POST | `/content/promotions` | CRUD de promociones |
| GET/PATCH/DELETE | `/content/promotions/{id}` | Operaciones sobre promoción |

---

## 6.18 WebSocket Gateway (Puerto 8001)

### Endpoints de Conexión

| Endpoint | Auth | Rol | Eventos recibidos |
|----------|------|-----|-------------------|
| `/ws/waiter?token=JWT` | JWT | WAITER, ADMIN, MANAGER | ROUND_*, SERVICE_CALL_*, TABLE_*, CHECK_*, PAYMENT_* (filtrado por sector) |
| `/ws/kitchen?token=JWT` | JWT | KITCHEN | ROUND_SUBMITTED, ROUND_IN_KITCHEN, ROUND_READY, ROUND_SERVED, TICKET_* |
| `/ws/diner?table_token=` | Table Token | DINER | CART_*, ROUND_IN_KITCHEN+, CHECK_*, PAYMENT_* |
| `/ws/admin?token=JWT` | JWT | ADMIN, MANAGER | TODOS los eventos del branch + ENTITY_* |

### Protocolo

```
Client → Server: { "type": "ping" }
Server → Client: { "type": "pong" }

Server → Client (evento):
{
  "type": "ROUND_SUBMITTED",
  "data": {
    "round_id": 5,
    "table_id": 12,
    "table_code": "INT-03",
    "branch_id": 1,
    "sector_id": 2,
    "items": [...]
  },
  "timestamp": "2026-03-12T14:30:00Z"
}
```

### Close Codes

| Código | Significado |
|--------|-------------|
| 4001 | Autenticación fallida |
| 4003 | Forbidden (rol insuficiente) |
| 4029 | Rate limited |

### Heartbeat
- Cliente envía `ping` cada 30 segundos
- Servidor cierra conexión tras 60 segundos sin actividad

### Catálogo Completo de Eventos

| Evento | Admin | Kitchen | Waiters | Diners | Patrón |
|--------|-------|---------|---------|--------|--------|
| `ROUND_PENDING` | ✓ | — | ✓ (branch) | — | Direct Redis |
| `ROUND_CONFIRMED` | ✓ | — | ✓ | — | Direct Redis |
| `ROUND_SUBMITTED` | ✓ | ✓ | ✓ | — | Outbox |
| `ROUND_IN_KITCHEN` | ✓ | ✓ | ✓ | ✓ | Direct Redis |
| `ROUND_READY` | ✓ | ✓ | ✓ | ✓ | Outbox |
| `ROUND_SERVED` | ✓ | ✓ | ✓ | ✓ | Direct Redis |
| `ROUND_CANCELED` | ✓ | ✓ | ✓ | — | Direct Redis |
| `CART_ITEM_ADDED` | — | — | — | ✓ | Direct Redis |
| `CART_ITEM_UPDATED` | — | — | — | ✓ | Direct Redis |
| `CART_ITEM_REMOVED` | — | — | — | ✓ | Direct Redis |
| `CART_CLEARED` | — | — | — | ✓ | Direct Redis |
| `CART_SYNC` | — | — | — | ✓ | Direct Redis |
| `SERVICE_CALL_CREATED` | ✓ | — | ✓ | — | Outbox |
| `SERVICE_CALL_ACKED` | ✓ | — | ✓ | — | Direct Redis |
| `SERVICE_CALL_CLOSED` | ✓ | — | ✓ | — | Direct Redis |
| `CHECK_REQUESTED` | ✓ | — | ✓ | ✓ | Outbox |
| `CHECK_PAID` | ✓ | — | ✓ | ✓ | Outbox |
| `PAYMENT_APPROVED` | ✓ | — | ✓ | ✓ | Outbox |
| `PAYMENT_REJECTED` | ✓ | — | ✓ | ✓ | Outbox |
| `TABLE_SESSION_STARTED` | ✓ | — | ✓ | — | Direct Redis |
| `TABLE_CLEARED` | ✓ | — | ✓ | — | Direct Redis |
| `TABLE_STATUS_CHANGED` | ✓ | — | ✓ | — | Direct Redis |
| `TICKET_IN_PROGRESS` | ✓ | ✓ | — | — | Direct Redis |
| `TICKET_READY` | ✓ | ✓ | — | — | Direct Redis |
| `TICKET_DELIVERED` | ✓ | ✓ | — | — | Direct Redis |
| `ENTITY_CREATED` | ✓ | — | — | — | Direct Redis |
| `ENTITY_UPDATED` | ✓ | — | — | — | Direct Redis |
| `ENTITY_DELETED` | ✓ | — | — | — | Direct Redis |
| `CASCADE_DELETE` | ✓ | — | — | — | Direct Redis |

### Filtrado por Sector

Eventos con `sector_id` se envían **solo** a mozos asignados a ese sector. ADMIN y MANAGER siempre reciben todos los eventos del branch, sin filtro de sector.

---

## 6.19 Metrics (`/metrics`)

**Auth:** Ninguna (acceso interno)

### GET `/metrics`
Métricas Prometheus para Grafana.

**Response:** Formato Prometheus text/plain con métricas de requests, latencia, conexiones activas.
