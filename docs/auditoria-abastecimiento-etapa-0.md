# Etapa 0 — Auditoría técnica para el sistema de abastecimiento

Estado: diagnóstico y plan. No se modificó código ni producción.
Base: especificación maestra v1.0 (inventario, importaciones, pagos, DHL, pronóstico, planificador).

## 1. Arquitectura actual

| Área | Hoy |
|---|---|
| App | Next.js 13.5.8 (App Router), React 19, TypeScript |
| Base de datos | Neon Postgres vía driver HTTP `neon()` (`lib/db.ts`). **Sin transacciones entre consultas.** |
| Esquema | `init*Tables()` con `CREATE TABLE IF NOT EXISTS` por módulo. Sin herramienta de migraciones. |
| Despliegue | Railway (Docker, Node + Python para Excel/PDF). Dev y producción **comparten la misma base**. |
| Usuarios | `users.json`, roles `admin`/`member`, permisos por módulo y por sub-apartado (`linkAccess`). |
| Tiendas | `stores.json` + tabla `tn_conexiones`. NUVEO (6524145) y Lumeo (6590142) son `store_id` independientes. |
| Integraciones | Tienda Nube (OAuth, webhook `order/paid`), Mercado Libre (`ml_conexiones`, `mlClient`), Meta Ads. |
| Pruebas | Prácticamente ninguna (un script suelto). Sin framework. |
| Auditoría | Solo por módulo (historial de tickets/retiros, auditoría de transferencias). No hay registro genérico. |

## 2. Spec contra lo que ya existe

| Requisito | Estado | Detalle |
|---|---|---|
| SKU comerciales → físicos (BOM) | Parcial | Tabla `kits` expande combos al descontar. Sin versiones ni vigencia. |
| Idempotencia de ventas | Hecho | `pedidos_procesados` por (canal, pedido, SKU). |
| Egreso físico al despachar | Hecho | El stock se descuenta al escanear en Despacho. |
| Stock físico / reservado / disponible / tránsito / defectuoso / Full | **Falta** | `stock.cantidad` es una sola cifra (admite negativos). |
| Libro de movimientos inmutable | Parcial | `movimientos` existe pero sin usuario, documento de referencia ni evento único; `ajustarStock` no registra tipo/canal. |
| Ubicaciones / sectores | Falta | |
| Recuentos y ajustes auditables | Falta | |
| Mapeo por canal (publicación → SKU) | Parcial | `ml_items_sku` solo cachea SKU de ML. |
| Órdenes de compra, condiciones de pago, deuda con proveedor | Falta | `compras_importacion` es un ledger de lo comprado, sin proveedor ni pagos. |
| Recepción caja por caja | Hecho | `recepcion_escaneos` suma stock por caja (sin faltantes/dañados). |
| Envíos en camino | Parcial | `stock_reposiciones` (carga manual). |
| DHL (tracking automático, ETA) | Falta | |
| Aduana, impuestos, costo landed | Falta | |
| Cotizaciones y monedas | Falta | |
| Demanda y pronóstico | Parcial | `ventas-semanales` (por semana y SKU, solo ventas). Sin serie diaria ni modelos. |
| Planificador de recompra | Falta | |
| Flujo de caja de abastecimiento | Falta | `finanzas` cubre gastos y suscripciones, no cuentas por pagar. |
| Centro de alertas | Falta | Hay notificadores aislados (conciliación, tickets). |
| Marca / sociedad | Falta | Hoy se simula con `store_id`. |

## 3. Riesgos

1. **Sin transacciones.** La spec exige consistencia entre inventario, reservas y estados. Con el driver HTTP cada consulta es independiente. Solución: usar el `Pool` de `@neondatabase/serverless` (WebSocket) para las operaciones críticas.
2. **Base compartida entre dev y producción.** Ya hubo un incidente de datos reales pisados en pruebas. Antes de migrar inventario hace falta una base de staging.
3. **Migrar el stock a un libro de movimientos** afecta Despacho, Importaciones, la pantalla de Stock y Retiros. Requiere período de convivencia (nuevo y viejo en paralelo) y conciliación.
4. **Sin tests.** Los 20 casos de la sección 24 de la spec necesitan un framework (propuesta: Vitest) antes de tocar el stock.
5. **Dependencias externas sin definir:** credenciales DHL Express, fuente de cotización USDT/ARS y criterios aduaneros (los define el despachante; no se inventan).
6. **Datos históricos.** La serie de ventas hay que construirla desde `movimientos` y los pedidos; los quiebres pasados contaminan la demanda observada.

## 4. Decisiones pendientes (bloquean el diseño)

1. Prioridad inicial: inventario confiable, deuda y vencimientos con Jean, o planificador de compras.
2. Aprobar transacciones reales (Pool) y una base de staging.
3. Mercado Libre Full: ¿desde la Etapa 1 o más adelante?
4. DHL: ¿hay credenciales de API? ¿qué tipo de cuenta?
5. NUVEO y Lumeo: ¿inventarios separados o una misma estructura con marca/sociedad?

### Respuestas (2026-11-10)

1. Prioridad: a criterio del desarrollo → se empieza por inventario confiable (Etapa 1).
2. Transacciones reales y base de pruebas separada: aprobado.
3. Mercado Libre Full: más adelante.
4. DHL: no hay credenciales todavía → la Etapa 4 queda en carga manual de guías hasta tenerlas.
5. NUVEO / Lumeo: respuesta ambigua. No bloquea la Etapa 1, que sigue separando por `store_id`.

### Estado de la Etapa 1

Hecho (sin cambios en producción, todavía no conectado a nada):

- `lib/inventario.ts`: libro de movimientos con `event_id` único (idempotente), estados de stock (apto, reservado, defectuoso, en revisión), reservas por pedido y componente físico, despacho que convierte la reserva en egreso sin descontar dos veces, liberación, recepciones, devoluciones y reclasificaciones. Compatible con las ventas semanales (solo el despacho cuenta como `venta`).
- `tests/inventario.test.ts` (`npm run test:inventario`): 20 casos sobre un Postgres real en memoria (PGlite), incluidos los casos 1–8 y 16 de la especificación y la atomicidad. No toca ninguna base de Neon.

Despacho conectado al motor nuevo (2026-11-10), detrás de un interruptor:

- `INVENTARIO_V2` (variable de entorno). Apagado (por defecto) el escaneo descuenta exactamente como antes. Con `INVENTARIO_V2=1` el escaneo descuenta con una transacción real por paquete (`descontarStockV2` en `lib/despachoDb.ts`) y registra cada movimiento con `event_id`.
- Si el motor nuevo falla sin dejar rastro, el escaneo cae solo al descuento de siempre. Si sí dejó rastro (se confirmó), no descuenta de nuevo.
- Validado en staging (`npm run test:inventario:paridad`): mismo stock final e historial que `deducirStock` en 8 situaciones (SKU simple, combos, combos que comparten componente, SKU inexistente, stock insuficiente, Cambio, Mercado Libre, envío combinado), más un escaneo completo de Despacho con un pedido real de Tienda Nube y el rechazo del segundo escaneo.
- Única diferencia deliberada: en un envío combinado el historial rotula cada movimiento con el pedido del que sale el producto (antes todos figuraban con el pedido principal).
- La migración de esquema se corre sola, una vez por proceso, la primera vez que se escanea con el interruptor prendido. Hasta entonces producción no tiene ninguna columna ni tabla nueva.

Para prender en producción: definir `INVENTARIO_V2=1` en Railway. Para apagar: quitarla (vuelve al comportamiento anterior al próximo despliegue; las columnas agregadas quedan y no molestan).

Pendiente de la Etapa 1:

- Base de staging en Neon (una *branch* de la base actual) y adaptador de transacciones con el `Pool` de `@neondatabase/serverless` (requiere el paquete `ws` en Node). No se escribió todavía: no se puede probar sin esa base.
- Correr `migrarInventario()` en staging, y recién después en producción (solo agrega columnas y una tabla).
- Conectar: Despacho (`despacharPedido`), recepción de Importaciones (`registrarRecepcion`) y la pantalla de Stock (mostrar reservado/disponible), con un período de convivencia y conciliación contra el stock actual.
- Recuentos con aprobación y registro de auditoría genérico.

## 5. Plan por etapas (adaptado a lo existente)

Cada etapa se entrega con tests, validación con datos de prueba y autorización antes de desplegar.

- **Etapa 1 — Inventario central.** Base de staging y Vitest. Endurecer `movimientos` (usuario, referencia, `event_id` único). Estados de stock (reservado, tránsito, defectuoso, Full) sobre `stock`. Reservas con conversión a egreso al despachar. Separar SKU físico y comercial reutilizando `kits`. Recuentos y ajustes con aprobación. Registro de auditoría genérico.
- **Etapa 2 — Canales.** Mapeo de publicaciones a SKU con alerta de conciliación. Cancelaciones y devoluciones (sin reincorporar hasta verificar). Full como ubicación separada.
- **Etapa 3 — Proveedores y órdenes.** Extender `compras_importacion`: proveedor, condiciones de pago (50/50, +30 días desde el tracking), pagos y comisiones, deuda y vencimientos.
- **Etapa 4 — DHL y recepción.** Guías, eventos, ETA, recepciones parciales y faltantes/dañados sobre lo ya construido.
- **Etapa 5 — Costos y finanzas.** Cotizaciones, fletes, tributos, costo landed, calendario de pagos.
- **Etapa 6 — Demanda.** Serie diaria, días atípicos, modelo simple (media móvil con ajuste por día), escenarios y registro de precisión.
- **Etapa 7 — Planificador.** Simulación diaria, fecha de quiebre, fecha límite de compra y cantidad sugerida explicable.
- **Etapa 8 — Alertas y dashboard.**

Los pagos, compras y despliegues con efecto real siguen requiriendo confirmación manual.

## 6. Supuestos

- Se amplía ShipFlow existente; no se crea un sistema paralelo.
- Los cálculos de impuestos y valoración aduanera se configuran con el despachante; no se asumen porcentajes fijos.
- La IA no es fuente de verdad para movimientos de stock ni contabilidad.
