# 01 — Propósito del Sistema

> **Origen del contenido:** Sección consolidada a partir de la auditoría de `CLAUDE.md` (Project Overview), `arquitectura.md` (Visión General) y `proyehisto0.md` (Visión General). Se amplió con generación nueva la sección de stakeholders, problemas que resuelve y propuesta de valor diferencial.

---

## 1.1 Declaración de Propósito

**Integrador** (nombre comercial: *Buen Sabor*) es una plataforma integral de gestión de restaurantes multi-sucursal que digitaliza la totalidad del flujo operativo — desde el momento en que un cliente escanea un código QR en la mesa hasta la finalización del pago — coordinando en tiempo real a comensales, mozos, cocina y administración.

---

## 1.2 Problema que Resuelve

| # | Problema | Impacto sin el sistema |
|---|----------|----------------------|
| P1 | Toma de pedidos manual (papel, voz) introduce errores, demoras y malentendidos | Platos devueltos, insatisfacción, pérdida de ingresos |
| P2 | Falta de visibilidad en tiempo real del estado de cada mesa y pedido | Cuellos de botella en cocina, mesas desatendidas, tiempos de espera impredecibles |
| P3 | Gestión manual de múltiples sucursales con catálogos y precios diferentes | Inconsistencias de marca, costos administrativos altos, difícil escalamiento |
| P4 | Ausencia de información sobre alérgenos y preferencias dietarias | Riesgo para la salud del comensal, exposición legal del restaurante |
| P5 | Facturación fragmentada (efectivo, digital, división de cuenta) | Errores de cobro, fugas de ingreso, cierre de caja lento |
| P6 | Imposibilidad de identificar clientes recurrentes ni personalizar la experiencia | Baja fidelización, oportunidades de upselling desperdiciadas |
| P7 | Comunicación entre roles (mozo ↔ cocina ↔ admin) dependiente de proximidad física | Pérdida de información, re-trabajo, estrés operativo |

---

## 1.3 Propuesta de Valor

| Valor | Descripción |
|-------|-------------|
| **Pedido colaborativo desde el celular** | Varios comensales en la misma mesa arman un carrito compartido en tiempo real, eliminando la dependencia del mozo para tomar el pedido |
| **Operación 100 % en tiempo real** | WebSockets conectan todos los actores: un cambio de estado en cocina se refleja instantáneamente en el celular del mozo y del comensal |
| **Multi-tenant & multi-sucursal** | Un solo despliegue sirve a múltiples restaurantes con aislamiento total de datos; cada sucursal maneja precios, sectores y personal independientes |
| **Seguridad alimentaria integrada** | Catálogo de alérgenos con reacciones cruzadas, filtros dietarios avanzados y trazabilidad de ingredientes |
| **Facturación flexible** | División de cuenta por comensal, pago digital (Mercado Pago), efectivo, tarjeta o transferencia — todo desde el celular o registrado por el mozo |
| **PWA offline-ready** | Las apps de mozo y comensal funcionan sin conexión estable; acciones se encolan y sincronizan al recuperar señal |
| **Fidelización sin fricción** | Reconocimiento de dispositivo → preferencias implícitas → perfil opt-in con consentimiento GDPR, sin obligar al comensal a registrarse |

---

## 1.4 Stakeholders y Usuarios

| Perfil | Rol en el sistema | Objetivo principal |
|--------|-------------------|--------------------|
| **Administrador (ADMIN)** | Gestión total: sucursales, menú, personal, reportes | Controlar la operación y tomar decisiones basadas en datos |
| **Manager (MANAGER)** | Gestión parcial: staff, mesas, alérgenos, promociones en sus sucursales | Supervisar la operación diaria de una o más sucursales |
| **Mozo / Mesero (WAITER)** | Opera mesas asignadas: confirma pedidos, registra pagos, atiende llamados | Atender mesas con eficiencia y mínima fricción |
| **Cocina (KITCHEN)** | Recibe tickets, marca preparación, notifica platos listos | Priorizar y preparar pedidos sin errores |
| **Comensal (DINER)** | Escanea QR, explora menú, arma pedido, paga | Pedir y pagar rápido, con información clara sobre alérgenos y estado del pedido |
| **Cliente fidelizado (CUSTOMER)** | Comensal recurrente con perfil opt-in | Recibir recomendaciones personalizadas y acumular historial |
| **Operador de plataforma** | Gestiona tenants (restaurantes) | Ofrecer el servicio SaaS a múltiples clientes |

---

## 1.5 Alcance del Sistema

### Dentro del alcance (In-Scope)

- Gestión completa de restaurantes multi-sucursal (CRUD de sucursales, categorías, productos, precios por sucursal)
- Autenticación JWT + Table Tokens, RBAC con 4 roles, refresh tokens
- Menú digital PWA con i18n (es/en/pt), filtros dietarios, búsqueda
- Carrito compartido multi-dispositivo con sincronización WebSocket
- Ciclo completo de rondas: PENDING → CONFIRMED → SUBMITTED → IN_KITCHEN → READY → SERVED
- Operaciones de mozo: grilla de mesas, comanda rápida, llamados de servicio, autogestión
- Cocina: tickets por estación, cambios de estado, notificaciones
- Facturación: cuenta, cargos, división, pagos (Mercado Pago, efectivo, tarjeta, transferencia)
- WebSocket Gateway con circuit breaker, rate limiting, Redis Streams, worker pool
- Fidelización progresiva: device tracking → preferencias implícitas → perfil opt-in
- Promociones, recetas e ingredientes
- Reportes y analíticas operativas

### Fuera del alcance (Out-of-Scope)

- Gestión de inventario/stock (recetas documentan ingredientes, no gestionan stock físico)
- Delivery y logística de envío
- Facturación fiscal / emisión de facturas legales
- Reservas de mesa
- Integración con sistemas contables o ERP externos
- App nativa (se usan PWAs)

---

## 1.6 Indicadores de Éxito (KPIs)

| KPI | Métrica objetivo |
|-----|-----------------|
| Latencia de broadcast WebSocket | ≤ 160 ms para 400 usuarios concurrentes |
| Usuarios concurrentes por instancia | 400–600 |
| Tiempo medio de pedido (QR → cocina) | Reducción ≥ 40 % vs flujo manual |
| Errores de pedido | Reducción ≥ 80 % vs toma manual |
| Cobertura de tests frontend | ≥ 80 % en stores y flujos críticos |
| Uptime del sistema | ≥ 99.5 % (excluyendo mantenimiento programado) |
