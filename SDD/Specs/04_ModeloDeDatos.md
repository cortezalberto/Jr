# 04 — Modelo de Datos

> **Origen del contenido:** Modelo extraído directamente de los archivos SQLAlchemy en `backend/rest_api/models/` (21 archivos, 54+ clases). Se auditaron las relaciones, constraints y tipos de datos del código fuente. Se generó como contenido nuevo el diagrama ER textual, la clasificación por dominio y la documentación de constraints CHECK — estos no existían como documento consolidado.

---

## 4.1 Visión General

El modelo de datos implementa **54+ entidades SQLAlchemy** distribuidas en 21 archivos, con las siguientes características transversales:

- **AuditMixin** en todas las entidades: `is_active`, `created_at`, `updated_at`, `deleted_at`, `created_by_id/email`, `updated_by_id/email`, `deleted_by_id/email`
- **Multi-tenancy** via `tenant_id` (BigInteger) en toda entidad
- **Soft delete** como mecanismo de eliminación por defecto
- **BigInteger** como tipo de ID primario
- **CHECK constraints** en DB para invariantes de negocio

---

## 4.2 Entidades por Dominio

### 4.2.1 Tenant y Sucursales

#### Tenant
| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| id | BigInteger | PK | Identificador del restaurante |
| name | String | NOT NULL | Nombre del restaurante |
| slug | String | UNIQUE, NOT NULL | Slug URL-friendly |
| description | Text | nullable | Descripción |
| logo | String | nullable | URL del logo |
| theme_color | String | default="#f97316" | Color accent |

**Relaciones:** → branches (1:N), → users (1:N), → products (1:N)

#### Branch
| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| id | BigInteger | PK | |
| tenant_id | BigInteger | FK(tenant), NOT NULL | |
| name | String | NOT NULL | Nombre del local |
| slug | String | NOT NULL | Slug para URL pública |
| address | String | nullable | Dirección física |
| phone | String | nullable | Teléfono |
| timezone | String | nullable | Zona horaria |
| opening_time | String | nullable | Horario apertura |
| closing_time | String | nullable | Horario cierre |

**Relaciones:** → tenant, → tables (1:N), → sectors (1:N), → branch_products (1:N), → waiter_assignments (1:N), → promotions (M:N via PromotionBranch)

---

### 4.2.2 Usuarios y Roles

#### User
| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| id | BigInteger | PK | |
| tenant_id | BigInteger | FK(tenant), NOT NULL | |
| email | String | UNIQUE per tenant, NOT NULL | |
| password | String | NOT NULL | Hash bcrypt |
| first_name | String | NOT NULL | |
| last_name | String | NOT NULL | |
| phone | String | nullable | |
| dni | String | nullable | Documento de identidad |
| hire_date | Date | nullable | |

**Relaciones:** → tenant, → branch_roles (1:N), → sector_assignments (1:N)

#### UserBranchRole
| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| id | BigInteger | PK | |
| user_id | BigInteger | FK(user), NOT NULL | |
| tenant_id | BigInteger | FK(tenant), NOT NULL | |
| branch_id | BigInteger | FK(branch), NOT NULL | |
| role | String(Enum) | NOT NULL | WAITER, KITCHEN, MANAGER, ADMIN |

**Relación M:N** entre User y Branch con rol.

---

### 4.2.3 Catálogo de Menú

#### Category
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK(branch), NOT NULL |
| name | String | NOT NULL, UNIQUE(branch_id, name) |
| icon | String | nullable |
| image | String | nullable |
| order | Integer | nullable |

**Relaciones:** → subcategories (1:N)

#### Subcategory
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| category_id | BigInteger | FK(category), NOT NULL |
| name | String | NOT NULL, UNIQUE(category_id, name) |
| image | String | nullable |
| order | Integer | nullable |

**Relaciones:** → category, → products (1:N via product.subcategory_id)

#### Product
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| name | String | NOT NULL |
| description | Text | nullable |
| image | String | nullable (SSRF validated) |
| category_id | BigInteger | FK(category) |
| subcategory_id | BigInteger | FK(subcategory) |
| featured | Boolean | indexed |
| popular | Boolean | indexed |
| badge | String | nullable |
| recipe_id | BigInteger | FK(recipe), nullable |
| inherits_from_recipe | Boolean | default=False |

**Relaciones:** → branch_products (1:N), → product_allergens (1:N), → recipe, → cooking_methods (M:N), → flavors (M:N), → textures (M:N), → round_items (1:N), → promotion_items (1:N)

#### BranchProduct
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK(branch), NOT NULL |
| product_id | BigInteger | FK(product), NOT NULL |
| price_cents | Integer | NOT NULL |
| is_available | Boolean | indexed, default=True |

**UNIQUE:** (branch_id, product_id)

---

### 4.2.4 Alérgenos

#### Allergen
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| name | String | NOT NULL |
| icon | String | nullable |
| description | Text | nullable |
| is_mandatory | Boolean | indexed |
| severity | String(Enum) | mild, moderate, severe, life_threatening |

#### ProductAllergen
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| product_id | BigInteger | FK(product), NOT NULL |
| allergen_id | BigInteger | FK(allergen), NOT NULL |
| presence_type | String(Enum) | contains, may_contain, free_from |
| risk_level | String(Enum) | low, standard, high |

**UNIQUE:** (product_id, allergen_id, presence_type)

#### AllergenCrossReaction
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| allergen_id | BigInteger | FK(allergen), NOT NULL |
| cross_reacts_with_id | BigInteger | FK(allergen), NOT NULL |
| probability | String(Enum) | high, medium, low |
| notes | Text | nullable |

**UNIQUE:** (allergen_id, cross_reacts_with_id)

---

### 4.2.5 Sectores y Mesas

#### BranchSector
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK(branch), nullable (global if NULL) |
| name | String | NOT NULL |
| prefix | String | NOT NULL |
| display_order | Integer | nullable |

**UNIQUE:** (tenant_id, branch_id, prefix)

#### WaiterSectorAssignment
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK(branch), NOT NULL |
| sector_id | BigInteger | FK(sector), NOT NULL |
| waiter_id | BigInteger | FK(user), NOT NULL |
| assignment_date | Date | NOT NULL |
| shift | String | nullable |

**UNIQUE:** (tenant_id, branch_id, sector_id, waiter_id, assignment_date, shift)

#### Table
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK(branch), NOT NULL |
| code | String | NOT NULL (ej: "INT-01") |
| capacity | Integer | nullable |
| sector_id | BigInteger | FK(sector), nullable |
| status | String(Enum) | indexed: FREE, ACTIVE, PAYING, OUT_OF_SERVICE |

#### TableSession
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK(branch), NOT NULL |
| table_id | BigInteger | FK(table), NOT NULL |
| status | String(Enum) | indexed: OPEN, PAYING, CLOSED |
| assigned_waiter_id | BigInteger | FK(user), nullable |
| opened_at | DateTime | NOT NULL |
| closed_at | DateTime | nullable |
| opened_by | String(Enum) | DINER, WAITER |
| opened_by_waiter_id | BigInteger | FK(user), nullable |
| cart_version | Integer | default=0 (optimistic locking) |

**Relaciones:** → table, → rounds (1:N), → service_calls (1:N), → checks (1:N), → diners (1:N), → cart_items (1:N)

---

### 4.2.6 Comensales y Clientes

#### Diner
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK, NOT NULL |
| session_id | BigInteger | FK(session), NOT NULL |
| name | String | NOT NULL |
| color | String | NOT NULL (hex) |
| local_id | String(UUID) | indexed, UNIQUE(session_id, local_id) |
| joined_at | DateTime | NOT NULL |
| device_id | String | indexed, nullable |
| device_fingerprint | String | indexed, nullable |
| implicit_preferences | JSON | nullable |
| customer_id | BigInteger | FK(customer), nullable |

#### Customer
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| name | String | nullable |
| phone | String | nullable, UNIQUE(tenant_id, phone) when not null |
| email | String | nullable, UNIQUE(tenant_id, email) when not null |
| first_visit_at / last_visit_at | DateTime | |
| total_visits | Integer | default=0 |
| total_spent_cents | Integer | default=0 |
| avg_ticket_cents | Integer | default=0 |
| excluded_allergen_ids | JSON | nullable |
| dietary_preferences | JSON | nullable |
| favorite_product_ids | JSON | nullable |
| segment | String | indexed |
| consent_remember / consent_marketing | Boolean | |
| consent_date | DateTime | nullable |
| ai_personalization_enabled | Boolean | default=False |
| device_ids | JSON | nullable |

---

### 4.2.7 Pedidos (Rondas)

#### Round
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK, NOT NULL |
| table_session_id | BigInteger | FK(session), NOT NULL |
| round_number | Integer | |
| status | String(Enum) | indexed: DRAFT, SUBMITTED, IN_KITCHEN, READY, SERVED, CANCELED |
| submitted_at | DateTime | indexed |
| idempotency_key | String | nullable, UNIQUE(table_session_id, idempotency_key) |
| submitted_by | String(Enum) | DINER, WAITER |
| submitted_by_waiter_id | BigInteger | FK(user), nullable |
| confirmed_by_user_id | BigInteger | FK(user), nullable |

#### RoundItem
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| branch_id | BigInteger | FK, NOT NULL |
| round_id | BigInteger | FK(round), NOT NULL |
| product_id | BigInteger | FK(product), NOT NULL |
| diner_id | BigInteger | FK(diner), nullable |
| qty | Integer | CHECK > 0 |
| unit_price_cents | Integer | CHECK >= 0 |
| notes | Text | nullable |

---

### 4.2.8 Cocina

#### KitchenTicket
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id / branch_id | BigInteger | FK, NOT NULL |
| round_id | BigInteger | FK(round), NOT NULL |
| station | String(Enum) | indexed: BAR, HOT_KITCHEN, COLD_KITCHEN |
| status | String(Enum) | indexed: PENDING, IN_PROGRESS, READY, DELIVERED |
| priority | Integer | nullable |
| started_at / completed_at / delivered_at | DateTime | nullable |

#### KitchenTicketItem
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| ticket_id | BigInteger | FK(ticket), NOT NULL |
| round_item_id | BigInteger | FK(round_item), NOT NULL |
| qty | Integer | |
| status | String(Enum) | indexed: PENDING, IN_PROGRESS, READY |

#### ServiceCall
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id / branch_id | BigInteger | FK, NOT NULL |
| table_session_id | BigInteger | FK(session), NOT NULL |
| type | String(Enum) | WAITER_CALL, PAYMENT_HELP, OTHER |
| status | String(Enum) | indexed: OPEN, ACKED, CLOSED |
| acked_at | DateTime | nullable |
| acked_by_user_id | BigInteger | FK(user), nullable |

---

### 4.2.9 Facturación

#### Check (`app_check`)
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id / branch_id | BigInteger | FK, NOT NULL |
| table_session_id | BigInteger | FK(session), NOT NULL |
| status | String(Enum) | indexed: OPEN, REQUESTED, IN_PAYMENT, PAID, FAILED |
| total_cents | Integer | CHECK >= 0 |
| paid_cents | Integer | CHECK >= 0, CHECK <= total_cents |

#### Payment
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id / branch_id | BigInteger | FK, NOT NULL |
| check_id | BigInteger | FK(check), NOT NULL |
| payer_diner_id | BigInteger | FK(diner), nullable |
| provider | String(Enum) | CASH, MERCADO_PAGO |
| status | String(Enum) | indexed: PENDING, APPROVED, REJECTED |
| amount_cents | Integer | CHECK > 0 |
| external_id | String | nullable (ID de Mercado Pago) |
| payment_category | String(Enum) | DIGITAL, MANUAL |
| registered_by | String(Enum) | SYSTEM, DINER, WAITER |
| registered_by_waiter_id | BigInteger | FK(user), nullable |
| manual_method | String | nullable (cash, card, transfer) |

#### Charge
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id / branch_id | BigInteger | FK, NOT NULL |
| check_id | BigInteger | FK(check), NOT NULL |
| diner_id | BigInteger | FK(diner), nullable |
| round_item_id | BigInteger | FK(round_item), nullable |
| amount_cents | Integer | CHECK > 0 |
| description | String | nullable |

#### Allocation
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| payment_id | BigInteger | FK(payment), NOT NULL |
| charge_id | BigInteger | FK(charge), NOT NULL |
| amount_cents | Integer | CHECK > 0 |

---

### 4.2.10 Carrito

#### CartItem
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id / branch_id | BigInteger | FK, NOT NULL |
| session_id | BigInteger | FK(session), NOT NULL |
| diner_id | BigInteger | FK(diner), NOT NULL |
| product_id | BigInteger | FK(product), NOT NULL |
| quantity | Integer | CHECK > 0 AND <= 99 |
| notes | Text | nullable |

**UNIQUE:** (session_id, diner_id, product_id)

---

### 4.2.11 Promociones

#### Promotion
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK, NOT NULL |
| name / description | String / Text | |
| price_cents | Integer | CHECK >= 0 |
| image | String | nullable |
| start_date / end_date | String | indexed, CHECK start_date <= end_date |
| start_time / end_time | String | nullable |
| promotion_type_id | Integer | nullable |

#### PromotionBranch / PromotionItem
Tablas intermedias para M:N con Branch y Product respectivamente.

---

### 4.2.12 Outbox (Transactional Events)

#### OutboxEvent
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | BigInteger | PK |
| tenant_id | BigInteger | FK |
| event_type | String | Tipo de evento |
| payload | JSON | Datos del evento |
| created_at | DateTime | Timestamp |
| published | Boolean | default=False |
| published_at | DateTime | nullable |

---

## 4.3 Diagrama de Relaciones (ER Textual)

```
Tenant (1) ──→ (N) Branch
Tenant (1) ──→ (N) User
Tenant (1) ──→ (N) Product
Tenant (1) ──→ (N) Allergen
Tenant (1) ──→ (N) Customer

User (M) ←──→ (N) Branch  [via UserBranchRole + role]

Branch (1) ──→ (N) BranchSector ──→ (N) Table
Branch (1) ──→ (N) BranchProduct ←── (N) Product
Branch (1) ──→ (N) Category ──→ (N) Subcategory ──→ (N) Product

BranchSector (1) ──→ (N) WaiterSectorAssignment ←── (N) User[WAITER]

Table (1) ──→ (N) TableSession ──→ (N) Diner
                                ──→ (N) Round ──→ (N) RoundItem
                                ──→ (N) CartItem
                                ──→ (N) ServiceCall
                                ──→ (N) Check

Round (1) ──→ (N) RoundItem ──→ Product
Round (1) ──→ (N) KitchenTicket ──→ (N) KitchenTicketItem

Check (1) ──→ (N) Charge
Check (1) ──→ (N) Payment ──→ (N) Allocation ←── (N) Charge

Product (M) ←──→ (N) Allergen [via ProductAllergen]
Allergen (M) ←──→ (N) Allergen [via AllergenCrossReaction]

Diner (N) ──→ (1) Customer [optional, via customer_id]

Promotion (M) ←──→ (N) Branch [via PromotionBranch]
Promotion (1) ──→ (N) PromotionItem ──→ Product
```

---

## 4.4 Índices Principales

| Tabla | Índice | Propósito |
|-------|--------|-----------|
| Todas | `tenant_id` | Filtrado multi-tenant |
| Todas | `is_active` | Filtrado soft delete |
| Table | `status` | Búsqueda por estado |
| TableSession | `status` | Sesiones activas |
| Round | `status`, `submitted_at` | Filtro y ordenamiento |
| Check | `status` | Cuentas activas |
| Payment | `status` | Pagos pendientes |
| BranchProduct | `is_available` | Productos disponibles |
| Product | `featured`, `popular` | Destacados |
| Diner | `local_id`, `device_id`, `device_fingerprint` | Lookup rápido |
| Customer | `segment` | Segmentación |
