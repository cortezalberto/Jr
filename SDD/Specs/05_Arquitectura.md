# 05 — Arquitectura del Sistema

> **Origen del contenido:** Consolidación de `arquitectura.md` (200+ líneas), `CLAUDE.md` (Architecture section), `docBack.md`, `docGateway.md`, y READMEs de cada componente. Se mejoró la redacción y se estructuró bajo el estándar SDD. Se generó como contenido nuevo: el diagrama C4 textual de contexto y contenedores, la tabla de decisiones arquitectónicas (ADR), y la sección de escalabilidad — estos no existían como documentos independientes.

---

## 5.1 Topología de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE PRESENTACIÓN                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Dashboard   │  │   pwaMenu    │  │  pwaWaiter   │          │
│  │  :5177       │  │   :5176      │  │   :5178      │          │
│  │  React 19    │  │   React 19   │  │   React 19   │          │
│  │  Zustand     │  │   Zustand    │  │   Zustand    │          │
│  │  Admin/Mgr   │  │   i18n       │  │   Waiter     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │ HTTP+WS          │ HTTP+WS          │ HTTP+WS         │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼─────────────────┐
│         ▼                  ▼                  ▼                  │
│  ┌──────────────┐  ┌──────────────────────────────────┐         │
│  │  REST API    │  │     WebSocket Gateway             │         │
│  │  :8000       │  │     :8001                         │         │
│  │  FastAPI     │  │     FastAPI WS                    │         │
│  │  SQLAlchemy  │  │     Redis Pub/Sub + Streams       │         │
│  │  9 router    │  │     Worker Pool (10 workers)      │         │
│  │  groups      │  │     Circuit Breaker               │         │
│  └──────┬───────┘  └──────────────┬───────────────────┘         │
│         │                         │                              │
│         │         CAPA DE SERVICIOS                              │
└─────────┼─────────────────────────┼─────────────────────────────┘
          │                         │
┌─────────┼─────────────────────────┼─────────────────────────────┐
│         ▼                         ▼                              │
│  ┌──────────────┐  ┌──────────────────┐                         │
│  │ PostgreSQL   │  │     Redis         │                         │
│  │ :5432        │  │     :6380         │                         │
│  │ 54+ tablas   │  │     Pub/Sub       │                         │
│  │ AuditMixin   │  │     Streams       │                         │
│  │ pgvector     │  │     Token BL      │                         │
│  └──────────────┘  │     Rate Limit    │                         │
│                    └──────────────────┘                          │
│                    CAPA DE DATOS                                 │
└─────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │  Mercado Pago    │ ←── Webhooks
                    │  (externo)       │
                    └──────────────────┘
```

---

## 5.2 Componentes Principales

### 5.2.1 Dashboard (Puerto 5177)

| Aspecto | Detalle |
|---------|---------|
| Stack | React 19 + TypeScript 5.9 + Vite 7.2 + babel-plugin-react-compiler |
| Estado | 15 stores Zustand con persistencia localStorage |
| Tests | 100+ tests Vitest |
| Páginas | 24+ páginas funcionales |
| Roles | ADMIN, MANAGER |
| Comunicación | HTTP REST + WebSocket (`/ws/admin`) |
| Patterns | useFormModal, useConfirmDialog, BroadcastChannel (multi-tab sync) |

### 5.2.2 pwaMenu (Puerto 5176)

| Aspecto | Detalle |
|---------|---------|
| Stack | React 19 + TypeScript 5.9 + Vite 7.2 + PWA (Workbox) |
| i18n | es/en/pt via i18next, detección automática |
| Cache | CacheFirst (imágenes 30d), NetworkFirst (APIs 5s timeout), SPA fallback |
| Estado | tableStore modular (store.ts, selectors.ts, helpers.ts, types.ts) |
| Auth | Table Token (HMAC, 3h) via `X-Table-Token` |
| Patterns | useOptimistic (React 19), RoundConfirmationPanel, useImplicitPreferences |

### 5.2.3 pwaWaiter (Puerto 5178)

| Aspecto | Detalle |
|---------|---------|
| Stack | React 19 + TypeScript 5.9 + Vite 7.2 |
| Estado | 3 stores Zustand |
| Tests | Vitest 3.2 |
| Auth | JWT + verificación de asignación diaria |
| Features | Grilla por sector, comanda rápida, autogestión, push notifications |
| Patterns | RetryQueueStore (offline), sector grouping |

### 5.2.4 REST API (Puerto 8000)

| Aspecto | Detalle |
|---------|---------|
| Stack | FastAPI 0.115 + SQLAlchemy 2.0 + Pydantic 2 |
| Arquitectura | Clean Architecture: Router → Domain Service → Repository → Model |
| Routers | 9 grupos, 48 archivos |
| Services | 14 domain services + base classes (BaseCRUDService, BranchScopedService) |
| Repositories | TenantRepository, BranchRepository con eager loading |
| Seguridad | JWT, RBAC (PermissionContext + Strategy), CORS, CSP, rate limiting |
| Eventos | Redis Pub/Sub (directo) + Outbox pattern (críticos) |

### 5.2.5 WebSocket Gateway (Puerto 8001)

| Aspecto | Detalle |
|---------|---------|
| Stack | FastAPI WebSocket + Redis |
| Tamaño | 12,605 líneas, 51 archivos Python |
| Endpoints | `/ws/waiter`, `/ws/kitchen`, `/ws/diner`, `/ws/admin` |
| Auth | Strategy pattern: JWTAuthStrategy, TableTokenAuthStrategy |
| Broadcast | Worker pool 10 workers, ~160ms para 400 usuarios |
| Resiliencia | Circuit breaker (3 estados), retry con jitter decorrelacionado |
| Locks | Sharded por branch, orden estricto (anti-deadlock) |
| Delivery | Pub/Sub (at-most-once) + Streams (at-least-once con DLQ) |

---

## 5.3 Clean Architecture (Backend)

```
┌─────────────────────────────────────────────┐
│              ROUTERS (thin controllers)      │
│  - HTTP parsing, Pydantic validation        │
│  - Dependency injection (auth, DB)          │
│  - Response construction                    │
│  - NO business logic                        │
├─────────────────────────────────────────────┤
│           DOMAIN SERVICES                   │
│  - ALL business logic                       │
│  - CategoryService, ProductService, etc.    │
│  - BaseCRUDService / BranchScopedService    │
│  - Hooks: _validate_create, _after_delete   │
├─────────────────────────────────────────────┤
│             REPOSITORIES                    │
│  - TenantRepository, BranchRepository       │
│  - Auto-filter by tenant_id/branch_id       │
│  - Eager loading preconfigurado             │
│  - Prevención N+1                           │
├─────────────────────────────────────────────┤
│               MODELS                        │
│  - 54+ SQLAlchemy classes                   │
│  - AuditMixin (soft delete, timestamps)     │
│  - CHECK constraints                        │
│  - 21 archivos por dominio                  │
└─────────────────────────────────────────────┘
```

---

## 5.4 Estructura de Directorios

```
integrador/
├── backend/
│   ├── rest_api/
│   │   ├── core/              # App config, middlewares, CORS
│   │   ├── models/            # 21 archivos SQLAlchemy
│   │   ├── routers/           # 48 archivos, 9 grupos
│   │   │   ├── admin/         # 15 routers CRUD
│   │   │   ├── auth/          # Login, refresh, logout
│   │   │   ├── billing/       # Pagos, webhooks
│   │   │   ├── content/       # Recetas, ingredientes, RAG
│   │   │   ├── diner/         # Cart, orders, customer
│   │   │   ├── kitchen/       # Rounds, tickets
│   │   │   ├── public/        # Menu, health (no auth)
│   │   │   ├── tables/        # Sessions
│   │   │   └── waiter/        # Waiter operations
│   │   ├── services/
│   │   │   ├── domain/        # 14 domain services
│   │   │   ├── crud/          # Repository, soft delete
│   │   │   ├── permissions/   # RBAC Strategy pattern
│   │   │   ├── events/        # Outbox service
│   │   │   └── payments/      # Payment processing
│   │   ├── main.py            # FastAPI entry point
│   │   └── seed.py            # Demo data
│   ├── shared/                # Shared between backend + ws_gateway
│   │   ├── config/            # Settings, logging, constants
│   │   ├── security/          # Auth, passwords, blacklist
│   │   ├── infrastructure/    # DB engine, Redis pool, events
│   │   └── utils/             # Exceptions, validators, schemas
│   └── tests/                 # pytest suite
│
├── Dashboard/                 # React 19 admin SPA
├── pwaMenu/                   # React 19 customer PWA
├── pwaWaiter/                 # React 19 waiter PWA
│
├── ws_gateway/                # WebSocket Gateway
│   ├── main.py
│   ├── connection_manager.py  # Thin orchestrator
│   ├── redis_subscriber.py    # Thin orchestrator
│   ├── core/
│   │   ├── connection/        # Lifecycle, Broadcaster, Cleanup, Stats
│   │   └── subscriber/        # Event processing
│   └── components/
│       ├── auth/              # JWT + TableToken strategies
│       ├── broadcast/         # Router, strategies (Batch, Adaptive)
│       ├── connection/        # Index, LockManager
│       ├── core/              # Constants, WSCloseCodes
│       ├── events/            # EventRouter, filtering
│       └── rate_limit/        # Lua scripts, per-connection
│
└── devOps/                    # Docker Compose, Grafana
    └── docker-compose.yml
```

---

## 5.5 Patrones de Comunicación

### 5.5.1 REST API (Sincrónico)

```
Frontend ──HTTP──→ REST API (:8000)
                    │
                    ├─→ PostgreSQL (read/write)
                    ├─→ Redis (token blacklist, cache)
                    └─→ Redis Pub/Sub (event publish)
```

### 5.5.2 WebSocket (Asincrónico)

```
Frontend ──WS──→ WS Gateway (:8001)
                    │
                    ├─← Redis Pub/Sub (subscribe to branch events)
                    ├─← Redis Streams (critical events, at-least-once)
                    └─→ Frontend (broadcast to connected clients)
```

### 5.5.3 Outbox Pattern (Garantía de Entrega)

```
REST API:
  1. Write business data + OutboxEvent → PostgreSQL (atomic commit)
  2. Background processor reads unpublished OutboxEvent
  3. Publishes to Redis Streams
  4. Marks as published

WS Gateway:
  5. StreamConsumer reads from Redis Streams (consumer group)
  6. Broadcasts to connected clients
  7. ACKs message
  8. Failures → DLQ after 3 retries
```

---

## 5.6 Seguridad en Profundidad

```
Layer 1: CORS + Origin Validation
  ↓
Layer 2: Content-Type Validation (POST/PUT/PATCH must be JSON/form)
  ↓
Layer 3: Security Headers (CSP, HSTS, X-Frame-Options, nosniff)
  ↓
Layer 4: Rate Limiting (per IP + per user, Lua scripts)
  ↓
Layer 5: Authentication (JWT 15min / Table Token 3h)
  ↓
Layer 6: Authorization (RBAC via PermissionContext + Strategy)
  ↓
Layer 7: Input Validation (Pydantic + SSRF protection)
  ↓
Layer 8: Database Constraints (CHECK, UNIQUE, FK)
```

---

## 5.7 Escalabilidad

| Dimensión | Estrategia actual | Capacidad |
|-----------|-------------------|-----------|
| Usuarios concurrentes | Worker pool 10 workers, sharded locks | 400–600 por instancia |
| Broadcast latency | Parallel batch (Adaptive/Fixed strategy) | ~160ms para 400 users |
| Redis operaciones | Connection pool singleton, Lua scripts atómicos | Miles ops/s |
| DB queries | Eager loading, índices, connection pooling | N+1 prevention |
| Horizontal scaling | Múltiples WS Gateway instances comparten Redis | Lineal |
| Resiliencia | Circuit breaker (5 fallos → open 30s), retry con jitter | Auto-recovery |

---

## 5.8 Decisiones Arquitectónicas (ADR)

| ADR | Decisión | Alternativas consideradas | Justificación |
|-----|----------|--------------------------|---------------|
| ADR-001 | Monorepo con 5 componentes | Monolito, microservicios | Balance entre cohesión y despliegue independiente |
| ADR-002 | FastAPI + SQLAlchemy 2.0 | Django, Flask | Async nativo, tipado fuerte, Pydantic integrado |
| ADR-003 | Zustand (no Redux, no Context) | Redux Toolkit, React Context | Mínimo boilerplate, selectores eficientes, persist middleware |
| ADR-004 | JWT + Table Token (no sessions server-side) | Session cookies, OAuth | Stateless para staff, HMAC lightweight para comensales |
| ADR-005 | Redis Pub/Sub + Streams (no Kafka) | Kafka, RabbitMQ | Simplicidad para escala actual; Streams para at-least-once sin infra adicional |
| ADR-006 | Outbox pattern para eventos críticos | Saga, 2PC | Garantía de entrega sin coordinador distribuido |
| ADR-007 | PWA (no app nativa) | React Native, Flutter | Cero fricción de instalación, un codebase web |
| ADR-008 | Soft delete (no hard delete) | Hard delete, archive table | Auditoría completa, restore capability, cascade logic |
| ADR-009 | Strategy pattern para RBAC | Decorator-based, middleware-only | Extensible, testeable, composable con mixins |
| ADR-010 | Worker pool broadcast | Sequential, simple batch | 25x speedup (160ms vs 4000ms) para 400 usuarios |

---

## 5.9 Infraestructura

| Servicio | Puerto | Imagen/Runtime | Propósito |
|----------|--------|---------------|-----------|
| PostgreSQL | 5432 | postgres:16 + pgvector | Base de datos principal |
| Redis | 6380 | redis:7 | Cache, Pub/Sub, Streams, Token BL, Rate Limit |
| REST API | 8000 | Python 3.11 + uvicorn | API REST principal |
| WS Gateway | 8001 | Python 3.11 + uvicorn | WebSocket en tiempo real |
| Dashboard | 5177 | Node.js + Vite dev server | Admin SPA |
| pwaMenu | 5176 | Node.js + Vite dev server | Customer PWA |
| pwaWaiter | 5178 | Node.js + Vite dev server | Waiter PWA |
| pgAdmin | 5050 | dpage/pgadmin4 | DB admin GUI |
| Grafana | — | grafana/grafana | Monitoring (devOps/) |
