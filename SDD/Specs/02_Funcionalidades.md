# 02 — Funcionalidades del Sistema

> **Origen del contenido:** Historias de usuario auditadas y consolidadas desde `proyehisto0.md` (33 HU originales ampliadas a 20 épicas con 83 HU). Se mejoró la redacción para cumplir con el rigor SDD, se agregaron criterios de aceptación faltantes en épicas E16–E20, y se normalizó el formato de gobernanza. La estructura épica-HU es 100 % derivada del documento existente.

---

## Índice de Épicas

| ID | Épica | HU | Gobernanza predominante |
|----|-------|----|------------------------|
| E01 | Infraestructura y DevOps | HU-0101 a HU-0104 | CRITICO / BAJO |
| E02 | Autenticación y Seguridad | HU-0201 a HU-0208 | CRITICO |
| E03 | Gestión de Tenants y Sucursales | HU-0301 a HU-0303 | CRITICO / ALTO / MEDIO |
| E04 | Gestión de Staff | HU-0401 a HU-0404 | CRITICO / MEDIO |
| E05 | Estructura del Menú | HU-0501 a HU-0505 | BAJO / ALTO |
| E06 | Alérgenos y Perfiles Alimentarios | HU-0601 a HU-0603 | CRITICO |
| E07 | Gestión de Mesas y Sectores | HU-0701 a HU-0703 | BAJO / MEDIO |
| E08 | Sesión de Mesa y Comensales | HU-0801 a HU-0803 | ALTO / MEDIO |
| E09 | Menú Digital (pwaMenu) | HU-0901 a HU-0904 | MEDIO / BAJO |
| E10 | Carrito Compartido y Pedidos | HU-1001 a HU-1005 | MEDIO / ALTO |
| E11 | Ciclo de Vida de Rondas | HU-1101 a HU-1108 | MEDIO / BAJO |
| E12 | Operaciones del Mozo | HU-1201 a HU-1208 | MEDIO / BAJO |
| E13 | Cocina | HU-1301 a HU-1303 | MEDIO |
| E14 | Facturación y Pagos | HU-1401 a HU-1406 | CRITICO |
| E15 | WebSocket Gateway | HU-1501 a HU-1508 | ALTO / CRITICO |
| E16 | Promociones | HU-1601, HU-1602 | BAJO |
| E17 | Recetas e Ingredientes | HU-1701, HU-1702 | BAJO |
| E18 | Fidelización de Clientes | HU-1801 a HU-1803 | CRITICO |
| E19 | Reportes y Analíticas | HU-1901 a HU-1903 | MEDIO |
| E20 | PWA y Experiencia Offline | HU-2001 a HU-2005 | BAJO / MEDIO |

**Total: 20 épicas, 83 historias de usuario.**

---

## Historias de Usuario por Épica

### E01 — Infraestructura y DevOps

#### HU-0101: Configuración de Base de Datos PostgreSQL
**Como** equipo de desarrollo, **quiero** una base de datos PostgreSQL configurada con todas las tablas del modelo de dominio, **para** persistir la información del sistema de forma relacional y confiable.

**Criterios de aceptación:**
- 52+ tablas del modelo definidas con SQLAlchemy 2.0
- Relaciones FK con cascadas apropiadas y CHECK constraints
- Índices en campos frecuentes (tenant_id, branch_id, is_active, status)
- Script de seed con datos de demostración (5 usuarios de prueba)
- AuditMixin en todas las entidades (created_at, updated_at, soft delete)

**Gobernanza:** CRITICO

---

#### HU-0102: Configuración de Redis
**Como** equipo de desarrollo, **quiero** un servidor Redis configurado para caché, pub/sub y blacklist de tokens, **para** soportar comunicación en tiempo real y gestión de sesiones.

**Criterios de aceptación:**
- Redis disponible en puerto 6380, pool de conexiones asíncronas (singleton)
- Canales pub/sub por branch (`branch:{id}:events`)
- Redis Streams con consumer groups para eventos críticos
- Blacklist de tokens JWT con TTL automático
- Scripts Lua para rate limiting atómico

**Gobernanza:** CRITICO

---

#### HU-0103: Docker Compose para Desarrollo
**Como** desarrollador, **quiero** levantar todo el entorno con un solo comando, **para** comenzar a desarrollar sin configuración manual.

**Criterios de aceptación:**
- `docker compose up -d --build` levanta DB, Redis, backend API, WS Gateway
- Variables de entorno via `.env`, volúmenes persistentes para PostgreSQL
- pgAdmin en puerto 5050, hot reload funcional

**Gobernanza:** BAJO

---

#### HU-0104: Configuración de Entornos (.env)
**Como** desarrollador, **quiero** archivos `.env.example` en cada componente, **para** configurar rápidamente mi entorno local.

**Criterios de aceptación:**
- `.env.example` en backend, Dashboard, pwaMenu, pwaWaiter
- Variables documentadas, valores por defecto funcionales, sensibles marcadas como requeridas

**Gobernanza:** BAJO

---

### E02 — Autenticación y Seguridad

#### HU-0201: Login con JWT
**Como** usuario del sistema (admin, manager, mozo, cocina), **quiero** autenticarme con email y contraseña, **para** acceder a las funcionalidades correspondientes a mi rol.

**Criterios de aceptación:**
- `POST /api/auth/login` → access token (15 min) + refresh token (7 días, HttpOnly cookie)
- Payload: sub (user_id), tenant_id, branch_ids, roles
- Contraseñas bcrypt, 401 genérico ante credenciales inválidas
- Rate limiting en login para prevenir fuerza bruta

**Gobernanza:** CRITICO

---

#### HU-0202: Refresh de Token
**Como** usuario autenticado, **quiero** que mi sesión se renueve automáticamente, **para** no tener que re-autenticarme cada 15 minutos.

**Criterios de aceptación:**
- `POST /api/auth/refresh` rota refresh token, invalida anterior en Redis
- Frontend refresh proactivo cada 14 minutos
- Fallo redirige a login

**Gobernanza:** CRITICO

---

#### HU-0203: Logout
**Como** usuario autenticado, **quiero** cerrar mi sesión de forma segura, **para** que nadie más pueda usar mi sesión.

**Criterios de aceptación:**
- `POST /api/auth/logout` invalida tokens, limpia cookie
- Sin loop infinito: retry deshabilitado en 401 durante logout

**Gobernanza:** CRITICO

---

#### HU-0204: Obtener Perfil del Usuario
**Como** usuario autenticado, **quiero** consultar mi información de perfil, **para** ver mis datos y roles asignados.

**Criterios de aceptación:**
- `GET /api/auth/me` retorna id, email, nombre, tenant_id, branch_ids, roles
- 401 si token expirado o blacklisted

**Gobernanza:** CRITICO

---

#### HU-0205: Table Token para Comensales
**Como** comensal que escanea un QR, **quiero** recibir un token de acceso temporal, **para** interactuar con el menú y pedidos sin registrarme.

**Criterios de aceptación:**
- HMAC table token con table_id, session_id, diner_id, branch_id
- Validez 3 horas, header `X-Table-Token`

**Gobernanza:** CRITICO

---

#### HU-0206: Middlewares de Seguridad
**Como** equipo de seguridad, **quiero** middlewares de protección en la API, **para** prevenir ataques comunes.

**Criterios de aceptación:**
- CORS, CSP, HSTS (prod), X-Frame-Options: DENY, nosniff
- Validación Content-Type, SSRF protection, validación de origen WebSocket

**Gobernanza:** CRITICO

---

#### HU-0207: Control de Acceso por Roles (RBAC)
**Como** administrador del sistema, **quiero** que cada rol tenga permisos específicos, **para** garantizar que solo usuarios autorizados realicen operaciones sensibles.

**Criterios de aceptación:**
- ADMIN: acceso total | MANAGER: staff, mesas, alérgenos, promociones (sus sucursales) | KITCHEN: tickets | WAITER: mesas asignadas
- PermissionContext + Strategy Pattern, 403 descriptivo

**Gobernanza:** CRITICO

---

#### HU-0208: Rate Limiting en Endpoints Críticos
**Como** equipo de seguridad, **quiero** limitar la tasa de requests en endpoints de facturación, **para** prevenir abuso.

**Criterios de aceptación:**
- Billing: 5–20 req/min, Login: rate limited, 429 con Retry-After
- Por IP y por usuario

**Gobernanza:** CRITICO

---

### E03 — Gestión de Tenants y Sucursales

#### HU-0301: Multi-Tenancy
**Como** operador de la plataforma, **quiero** que múltiples restaurantes operen de forma aislada, **para** ofrecer el servicio a diferentes clientes.

**Criterios de aceptación:**
- tenant_id en todas las entidades, filtrado automático en queries
- Catálogos (CookingMethod, FlavorProfile, TextureProfile, CuisineType) por tenant

**Gobernanza:** CRITICO

---

#### HU-0302: CRUD de Sucursales
**Como** administrador, **quiero** gestionar las sucursales de mi restaurante, **para** configurar la operación de cada local.

**Criterios de aceptación:**
- Crear/editar/soft delete sucursales con nombre, dirección, slug único
- `GET /api/public/branches` sin auth para listado público

**Gobernanza:** ALTO

---

#### HU-0303: Selector de Sucursal en Dashboard
**Como** administrador o manager, **quiero** seleccionar la sucursal activa en el Dashboard, **para** gestionar una sucursal específica.

**Criterios de aceptación:**
- Dropdown en header, persiste en localStorage, auto-selección si solo hay una

**Gobernanza:** MEDIO

---

### E04 — Gestión de Staff

#### HU-0401: CRUD de Usuarios
**Como** administrador, **quiero** gestionar los usuarios del sistema, **para** controlar quién accede a la plataforma.

**Criterios de aceptación:**
- Crear usuario con email, nombre, contraseña; asignar roles por sucursal (M:N)
- Editar, desactivar, filtrar por sucursal/rol

**Gobernanza:** CRITICO

---

#### HU-0402: Asignación Diaria de Mozos a Sectores
**Como** manager, **quiero** asignar mozos a sectores cada día, **para** distribuir la carga de trabajo en el salón.

**Criterios de aceptación:**
- WaiterSectorAssignment por día y turno
- Validar rol WAITER en la sucursal, un mozo puede tener múltiples sectores

**Gobernanza:** MEDIO

---

#### HU-0403: Verificación de Asignación del Mozo
**Como** mozo, **quiero** que se verifique mi asignación al iniciar sesión, **para** asegurar que estoy autorizado a trabajar hoy.

**Criterios de aceptación:**
- `GET /api/waiter/verify-branch-assignment?branch_id={id}` verifica asignación HOY
- Si no asignado → "Acceso Denegado"

**Gobernanza:** MEDIO

---

#### HU-0404: Gestión de Staff desde Dashboard
**Como** administrador, **quiero** una vista completa de gestión de personal, **para** administrar todos los empleados.

**Criterios de aceptación:**
- Tabla de empleados con roles/sucursales, formulario CRUD, filtros

**Gobernanza:** CRITICO

---

### E05 — Estructura del Menú

#### HU-0501: CRUD de Categorías
**Como** administrador, **quiero** gestionar las categorías del menú, **para** organizar los productos de forma lógica.

**Criterios de aceptación:**
- Crear con nombre, imagen, orden; por sucursal (branch_id)
- Cascade soft delete → subcategorías → productos

**Gobernanza:** BAJO

---

#### HU-0502: CRUD de Subcategorías
**Como** administrador, **quiero** gestionar subcategorías dentro de cada categoría, **para** crear una jerarquía de menú de tres niveles.

**Criterios de aceptación:**
- Vinculada a categoría padre, cascade soft delete a productos

**Gobernanza:** BAJO

---

#### HU-0503: CRUD de Productos
**Como** administrador, **quiero** gestionar los productos del menú, **para** definir qué puede pedir un cliente.

**Criterios de aceptación:**
- Nombre, descripción, imagen (SSRF-validated), subcategoría
- Precio por sucursal via BranchProduct (centavos), soft delete

**Gobernanza:** ALTO

---

#### HU-0504: Precios por Sucursal
**Como** administrador, **quiero** definir precios diferentes para cada sucursal, **para** adaptar los precios según la ubicación.

**Criterios de aceptación:**
- BranchProduct: producto ↔ sucursal con price_cents, is_available
- Sin precio en sucursal = no visible

**Gobernanza:** ALTO

---

#### HU-0505: Menú Público por Slug
**Como** cliente, **quiero** acceder al menú digital sin autenticación, **para** explorar los productos.

**Criterios de aceptación:**
- `GET /api/public/menu/{slug}` retorna categorías, subcategorías, productos activos con precios

**Gobernanza:** ALTO

---

### E06 — Alérgenos y Perfiles Alimentarios

#### HU-0601: CRUD de Alérgenos
**Como** administrador, **quiero** gestionar el catálogo de alérgenos, **para** informar a los clientes sobre posibles riesgos.

**Criterios de aceptación:**
- Por tenant, 14 principales en seed, severity levels, cross-reactions

**Gobernanza:** CRITICO

---

#### HU-0602: Asociación Producto-Alérgeno
**Como** administrador, **quiero** asociar alérgenos a cada producto, **para** que los clientes identifiquen riesgos alimentarios.

**Criterios de aceptación:**
- ProductAllergen M:N con presence_type y risk_level

**Gobernanza:** CRITICO

---

#### HU-0603: Filtros Dietarios en pwaMenu
**Como** comensal con restricciones dietarias, **quiero** filtrar el menú por alérgenos y preferencias, **para** encontrar productos seguros.

**Criterios de aceptación:**
- Filtros por alérgenos (con cross-reactions), cocción, sabor, textura
- Productos filtrados muestran badge de seguridad

**Gobernanza:** CRITICO

---

### E07 — Gestión de Mesas y Sectores

#### HU-0701: CRUD de Sectores
**Como** administrador, **quiero** definir sectores dentro de una sucursal, **para** organizar el salón en zonas.

**Criterios de aceptación:**
- BranchSector con nombre, prefijo, branch_id; cascade soft delete a mesas

**Gobernanza:** BAJO

---

#### HU-0702: CRUD de Mesas
**Como** administrador, **quiero** gestionar las mesas de cada sector, **para** definir la capacidad y disposición del salón.

**Criterios de aceptación:**
- Código alfanumérico (ej: "INT-01"), único por sucursal
- Estados: FREE, ACTIVE, PAYING, OUT_OF_SERVICE

**Gobernanza:** BAJO

---

#### HU-0703: Vista de Mesas en Dashboard
**Como** administrador, **quiero** ver el estado de todas las mesas en tiempo real, **para** supervisar la operación.

**Criterios de aceptación:**
- Grilla por sector, colores por estado, actualización WebSocket, click → detalle

**Gobernanza:** MEDIO

---

### E08 — Sesión de Mesa y Comensales

#### HU-0801: Iniciar Sesión de Mesa (Escaneo QR)
**Como** comensal, **quiero** escanear el código QR de la mesa, **para** unirme a la sesión digital.

**Criterios de aceptación:**
- `POST /api/tables/code/{code}/session` crea/retorna sesión
- Mesa FREE → nueva sesión OPEN; Mesa ACTIVE → unirse a existente
- Retorna table token, evento TABLE_SESSION_STARTED

**Gobernanza:** ALTO

---

#### HU-0802: Registro de Comensal
**Como** comensal, **quiero** registrar mi nombre y color, **para** que los demás identifiquen mis ítems en el carrito.

**Criterios de aceptación:**
- Nombre + color único por sesión, Diner vinculado a sesión y opcionalmente a Customer

**Gobernanza:** MEDIO

---

#### HU-0803: Pantalla de Unirse a Mesa (pwaMenu)
**Como** comensal, **quiero** ver una pantalla de bienvenida al escanear el QR, **para** elegir un nombre y unirme.

**Criterios de aceptación:**
- Nombre del restaurante, número de mesa, campo nombre, lista de comensales existentes

**Gobernanza:** MEDIO

---

### E09 — Menú Digital (pwaMenu)

#### HU-0901: Exploración de Menú por Categorías
**Como** comensal, **quiero** navegar el menú por categorías y subcategorías, **para** encontrar lo que deseo pedir.

**Criterios de aceptación:**
- Jerarquía 3 niveles, solo items activos con precio, navegación fluida

**Gobernanza:** MEDIO

---

#### HU-0902: Detalle de Producto
**Como** comensal, **quiero** ver el detalle completo de un producto, **para** decidir si quiero pedirlo.

**Criterios de aceptación:**
- Imagen, nombre, descripción, precio, alérgenos, tiempo estimado
- Botón "Agregar al carrito" con cantidad y notas

**Gobernanza:** MEDIO

---

#### HU-0903: Búsqueda de Productos
**Como** comensal, **quiero** buscar productos por nombre, **para** encontrar rápidamente lo que quiero.

**Criterios de aceptación:**
- Búsqueda en tiempo real (debounce 300ms), resultados con miniatura

**Gobernanza:** BAJO

---

#### HU-0904: Internacionalización (i18n)
**Como** comensal extranjero, **quiero** ver el menú en mi idioma, **para** entender la oferta.

**Criterios de aceptación:**
- es/en/pt con `t()` universal, selector de idioma, persiste en localStorage

**Gobernanza:** MEDIO

---

### E10 — Carrito Compartido y Pedidos

#### HU-1001: Agregar Producto al Carrito
**Como** comensal, **quiero** agregar productos a mi carrito, **para** preparar mi pedido.

**Criterios de aceptación:**
- Cantidad 1–99, notas, identificado con nombre/color del comensal
- Evento CART_ITEM_ADDED via WebSocket, UI optimista

**Gobernanza:** MEDIO

---

#### HU-1002: Sincronización Multi-Dispositivo del Carrito
**Como** comensal en mesa compartida, **quiero** ver en tiempo real lo que agregan los demás, **para** coordinar el pedido grupal.

**Criterios de aceptación:**
- Eventos: CART_ITEM_ADDED/UPDATED/REMOVED/CLEARED
- Cada ítem muestra quién lo agregó, conflictos por orden de llegada

**Gobernanza:** ALTO

---

#### HU-1003: Modificar y Eliminar Ítems del Carrito
**Como** comensal, **quiero** cambiar la cantidad o eliminar ítems, **para** ajustar mi pedido.

**Criterios de aceptación:**
- Solo el comensal propietario puede modificar, UI optimista con rollback

**Gobernanza:** MEDIO

---

#### HU-1004: Confirmación Grupal del Pedido
**Como** grupo de comensales, **queremos** votar para confirmar el envío, **para** asegurar que todos están de acuerdo.

**Criterios de aceptación:**
- Votación con indicador visual, timeout configurable, cancelación individual

**Gobernanza:** MEDIO

---

#### HU-1005: Envío de Ronda
**Como** mesa de comensales, **quiero** que nuestro pedido confirmado se envíe al sistema, **para** que el mozo lo revise.

**Criterios de aceptación:**
- Ítems de todos combinados en una Round (estado PENDING)
- Cada ítem con diner_id, evento ROUND_PENDING, carrito limpiado

**Gobernanza:** ALTO

---

### E11 — Ciclo de Vida de Rondas

#### HU-1101: Mozo Confirma Pedido (PENDING → CONFIRMED)
**Como** mozo, **quiero** confirmar un pedido pendiente, **para** asegurar que es correcto antes de enviarlo a cocina.

**Gobernanza:** MEDIO

#### HU-1102: Admin/Manager Envía a Cocina (CONFIRMED → SUBMITTED)
**Como** administrador o manager, **quiero** enviar pedidos confirmados a cocina, **para** iniciar la preparación. Usa Outbox pattern.

**Gobernanza:** MEDIO

#### HU-1103: Cocina Inicia Preparación (SUBMITTED → IN_KITCHEN)
**Como** personal de cocina, **quiero** marcar que comencé a preparar un pedido.

**Gobernanza:** MEDIO

#### HU-1104: Cocina Marca como Listo (IN_KITCHEN → READY)
**Como** personal de cocina, **quiero** marcar que un pedido está listo para servir. Usa Outbox pattern.

**Gobernanza:** MEDIO

#### HU-1105: Staff Marca como Servido (READY → SERVED)
**Como** mozo o personal, **quiero** marcar que un pedido fue entregado a la mesa.

**Gobernanza:** MEDIO

#### HU-1106: Cancelar Ronda
**Como** mozo o administrador, **quiero** cancelar una ronda pendiente o confirmada. Solo PENDING/CONFIRMED.

**Gobernanza:** MEDIO

#### HU-1107: Eliminar Ítem de Ronda
**Como** mozo, **quiero** eliminar un ítem específico de una ronda pendiente. Si queda vacía → eliminar ronda.

**Gobernanza:** MEDIO

#### HU-1108: Vista de Rondas con Filtros
**Como** mozo, **quiero** filtrar las rondas por estado. Tabs: Todos, Pendientes, Listos, Servidos.

**Gobernanza:** BAJO

---

### E12 — Operaciones del Mozo

#### HU-1201: Selección de Sucursal Pre-Login
**Como** mozo, **quiero** seleccionar la sucursal antes de iniciar sesión.

**Gobernanza:** MEDIO

#### HU-1202: Login del Mozo
**Como** mozo, **quiero** iniciar sesión con mis credenciales. Verifica asignación post-login.

**Gobernanza:** MEDIO

#### HU-1203: Grilla de Mesas por Sector
**Como** mozo, **quiero** ver todas mis mesas agrupadas por sector con actualización WebSocket.

**Gobernanza:** MEDIO

#### HU-1204: Card de Mesa con Animaciones
**Como** mozo, **quiero** indicadores visuales en cada mesa. Prioridad: service call (rojo) > ready (naranja) > status change (azul) > new order (amarillo) > check requested (púrpura).

**Gobernanza:** BAJO

#### HU-1205: Detalle de Mesa
**Como** mozo, **quiero** ver el detalle completo de una mesa con rondas, llamados, cuenta.

**Gobernanza:** MEDIO

#### HU-1206: Comanda Rápida
**Como** mozo, **quiero** tomar pedidos directamente desde mi dispositivo. Menú compacto sin imágenes.

**Gobernanza:** MEDIO

#### HU-1207: Gestión de Llamados de Servicio
**Como** mozo, **quiero** ver y resolver llamados de servicio. Outbox pattern para SERVICE_CALL_CREATED.

**Gobernanza:** MEDIO

#### HU-1208: Autogestión de Mesas
**Como** mozo, **quiero** activar mesas y tomar pedidos completos sin que el cliente use su celular.

**Gobernanza:** MEDIO

---

### E13 — Cocina

#### HU-1301: Vista de Tickets de Cocina
**Como** personal de cocina, **quiero** ver los pedidos que debo preparar. Solo SUBMITTED+, FIFO.

**Gobernanza:** MEDIO

#### HU-1302: Cambio de Estado en Cocina
**Como** personal de cocina, **quiero** cambiar el estado de los pedidos. SUBMITTED → IN_KITCHEN → READY.

**Gobernanza:** MEDIO

#### HU-1303: Kitchen Tickets
**Como** sistema, **quiero** generar tickets de cocina al hacer SUBMITTED, agrupados por estación (BAR/HOT_KITCHEN/COLD_KITCHEN).

**Gobernanza:** MEDIO

---

### E14 — Facturación y Pagos

#### HU-1401: Solicitar Cuenta
**Como** comensal, **quiero** solicitar la cuenta. Mesa → PAYING, Outbox CHECK_REQUESTED.

**Gobernanza:** CRITICO

#### HU-1402: Generación de Cuenta con Cargos
**Como** sistema, **quiero** calcular los cargos automáticamente. Charges por ítem en centavos.

**Gobernanza:** CRITICO

#### HU-1403: División de Cuenta
**Como** grupo de comensales, **queremos** dividir la cuenta. Allocation FIFO, pago parcial permitido.

**Gobernanza:** CRITICO

#### HU-1404: Pago con Mercado Pago
**Como** comensal, **quiero** pagar con Mercado Pago. Webhook confirma pago, PAYMENT_APPROVED.

**Gobernanza:** CRITICO

#### HU-1405: Pago en Efectivo/Manual
**Como** mozo, **quiero** registrar pagos manuales (cash/card/transfer).

**Gobernanza:** CRITICO

#### HU-1406: Confirmar Pago y Cerrar Mesa
**Como** mozo o administrador, **quiero** confirmar el pago y liberar la mesa. Sesión CLOSED, mesa FREE.

**Gobernanza:** CRITICO

---

### E15 — WebSocket Gateway

#### HU-1501: Conexión WebSocket para Mozos
`/ws/waiter?token=JWT` — sector-based filtering, heartbeat 30s/60s.

**Gobernanza:** ALTO

#### HU-1502: Conexión WebSocket para Cocina
`/ws/kitchen?token=JWT` — solo SUBMITTED+.

**Gobernanza:** ALTO

#### HU-1503: Conexión WebSocket para Comensales
`/ws/diner?table_token=` — cart events, round IN_KITCHEN+, billing events.

**Gobernanza:** ALTO

#### HU-1504: Conexión WebSocket para Admin
`/ws/admin?token=JWT` — todos los eventos de branch + ENTITY_*.

**Gobernanza:** ALTO

#### HU-1505: Broadcasting Eficiente
Worker pool 10 workers, sharded locks por branch, ~160ms para 400 usuarios.

**Gobernanza:** ALTO

#### HU-1506: Circuit Breaker
CLOSED → OPEN (5 fallos) → HALF_OPEN (30s, 3 pruebas). Protección Redis.

**Gobernanza:** ALTO

#### HU-1507: Rate Limiting en WebSocket
Close code 4029, configurable por endpoint.

**Gobernanza:** ALTO

#### HU-1508: Eventos Críticos con Redis Streams
Consumer groups at-least-once, DLQ, reintentos con backoff.

**Gobernanza:** CRITICO

---

### E16 — Promociones

#### HU-1601: CRUD de Promociones
**Como** administrador, **quiero** crear y gestionar promociones con período de vigencia y productos asociados.

**Gobernanza:** BAJO

#### HU-1602: Visualización de Promociones en pwaMenu
**Como** comensal, **quiero** ver las promociones disponibles con badge y precio original tachado.

**Gobernanza:** BAJO

---

### E17 — Recetas e Ingredientes

#### HU-1701: Gestión de Ingredientes
**Como** administrador o chef, **quiero** gestionar IngredientGroup → Ingredient → SubIngredient por tenant.

**Gobernanza:** BAJO

#### HU-1702: Gestión de Recetas
**Como** chef o administrador, **quiero** documentar recetas con ingredientes, cantidades e instrucciones. Roles: KITCHEN, MANAGER, ADMIN.

**Gobernanza:** BAJO

---

### E18 — Fidelización de Clientes

#### HU-1801: Device Tracking (Fase 1)
**Como** sistema, **quiero** identificar dispositivos recurrentes sin registro ni consentimiento.

**Gobernanza:** CRITICO

#### HU-1802: Preferencias Implícitas (Fase 2)
**Como** sistema, **quiero** aprender preferencias del cliente por historial (productos, alérgenos evitados, cocción).

**Gobernanza:** CRITICO

#### HU-1803: Perfil de Cliente Opt-In (Fase 4)
**Como** cliente frecuente, **quiero** crear un perfil voluntario con consentimiento GDPR para recomendaciones.

**Gobernanza:** CRITICO

---

### E19 — Reportes y Analíticas

#### HU-1901: Dashboard de Métricas Operativas
**Como** administrador, **quiero** ver métricas clave: mesas activas, tiempos, pedidos/hora, ingresos.

**Gobernanza:** MEDIO

#### HU-1902: Reportes de Cocina
**Como** chef o manager, **quiero** tiempos de preparación por plato, picos de demanda, exportación CSV/PDF.

**Gobernanza:** MEDIO

#### HU-1903: Reportes de Ventas
**Como** administrador, **quiero** informes de ventas por período, categoría, método de pago, ticket promedio.

**Gobernanza:** MEDIO

---

### E20 — PWA y Experiencia Offline

#### HU-2001: Instalación como PWA (pwaMenu)
Manifest, service worker, prompt de instalación, modo standalone.

**Gobernanza:** BAJO

#### HU-2002: Instalación como PWA (pwaWaiter)
Manifest naranja (#f97316), offline con datos cacheados.

**Gobernanza:** BAJO

#### HU-2003: Cola de Reintentos Offline (pwaWaiter)
RetryQueueStore, reintento FIFO al recuperar conexión.

**Gobernanza:** MEDIO

#### HU-2004: Notificaciones Push (pwaWaiter)
Push notifications para llamados de servicio y cuenta.

**Gobernanza:** BAJO

#### HU-2005: Auto-Reconexión WebSocket
Backoff exponencial, indicador visual, re-sincronización al reconectar.

**Gobernanza:** MEDIO

---

## Plan de Implementación (Bloques de Sprints)

| Bloque | Sprints | Épicas | Descripción |
|--------|---------|--------|-------------|
| 1 | 1–2 | E01, E02, E03 | Fundación: DB, Redis, Docker, Auth, RBAC, Multi-Tenancy |
| 2 | 3–4 | E04, E05, E06 | Estructura: Staff, Menú, Alérgenos |
| 3 | 5 | E15 | WebSocket Gateway completo |
| 4 | 6–7 | E03, E04, E07, E13 | Dashboard Admin: selector, staff UI, mesas, cocina |
| 5 | 8–9 | E08, E09, E10 | Flujo del Comensal: QR, menú, carrito, pedidos |
| 6 | 10 | E11 | Ciclo de Rondas completo |
| 7 | 11 | E12 | Operaciones del Mozo |
| 8 | 12 | E14 | Facturación y Pagos |
| 9 | 13–14 | E16, E17, E20 | Complementarias: Promociones, Recetas, PWA |
| 10 | 15–16 | E18, E19 | Fidelización y Analíticas |
