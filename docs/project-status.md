# Estado del Proyecto — FitAI Assistant

**Última actualización:** 2026-03-30

---

## Estado Actual: En Producción Local — Sistema Completo ✅

El sistema está corriendo localmente con Docker. **Todos los 9 workflows activos.** RAG pipeline completo. Panel de administración web construido y operativo en `localhost:3000`. Soporta gestión completa de usuarios, membresías, prospectos, pagos y migración de cuenta Telegram.

---

## Workflows en n8n — Estado E2E

| ID | Nombre | Estado | Notas |
|----|--------|--------|-------|
| `fI5u4rs3iXPfeXFl` | FitAI - Telegram Webhook Handler | ✅ E2E OK | Handler unificado (38 nodos): onboarding, AI Agent + 5 tools + Vector Store RAG + flujo contacto/teléfono + flujo migración token |
| `3uXT5ld76uIUCENn` | FitAI - Knowledge Base Indexer | ✅ E2E OK | Webhook POST; indexó 25 secciones → 106 puntos en knowledge_rag |
| `bhJ8qqZXr68Id3pH` | FitAI - Progress Calculator | ✅ E2E OK | Recibe userId+chatId vía toolWorkflow, calcula métricas, responde |
| `KQhP9lQNxCKeOsbJ` | FitAI - Meal Plan Generator | ✅ E2E OK | Genera plan semanal con GPT-4o, guarda en DB, envía por Telegram |
| `ETjiYAUhXfsVSyWQ` | FitAI - Workout Plan Generator | ✅ E2E OK | Genera rutina personalizada, guarda en DB, envía por Telegram |
| `vAqqjXg2IE1ldgg3` | FitAI - RAG Personal Indexer | ✅ E2E OK | Indexa en Qdrant vía tool del AI Agent; fechas en hora Colombia |
| `UfO8uMAfcfkxv4np` | FitAI - RAG Personal Search | ✅ E2E OK | Sub-workflow HTTP: embeddings → Qdrant search con filtro userId; contexto con fecha Colombia |
| `SntGuE97yl9efvo5` | FitAI - Meal Reminder Scheduler | ✅ E2E OK | Envió mensaje real de recordatorio de desayuno (message_id=34) |
| `tkSAHhjJnO4nTFsM` | FitAI - Weight Update Requester | ✅ Lógica OK | No envía mensajes (correcto: usuarios registraron peso hace <5 días) |
| `I4Q4C6SOPY2fnK3W` | FitAI - Membership Alert | ✅ Lógica OK | Detecta vencimientos; falla Telegram solo por telegram_id=777001 de test |

---

## Infraestructura

| Servicio | Estado | Detalles |
|----------|--------|----------|
| n8n 2.11.3 | ✅ Running | Docker standalone, puerto 5678, SQLite backend |
| PostgreSQL 16 | ✅ Running | Contenedor `fitai-postgres`, red `fitai-network` |
| Redis 7 | ✅ Running | Puerto 6379 expuesto al host |
| Qdrant 1.13.0 | ✅ Running | Puerto 6333, colecciones `user_rag` y `knowledge_rag` — compatible con @langchain/qdrant@1.0.1 |
| ngrok | ✅ Running | Expone n8n al exterior para el webhook de Telegram |

---

## Credenciales en n8n

| ID | Nombre | Tipo |
|----|--------|------|
| `1duS64x2hsrz3moJ` | Telegram account fitia | telegramApi |
| `QLEgAnHDncQkLeNb` | Postgres account Fitia | postgres |
| `NOJoPVNWDXiywRgw` | OpenAi account | openAiApi |
| `ZgvYkNPmxRynoz3F` | Qdrant FitAI | qdrantApi (url: `http://host.docker.internal:6333`) |

---

## Fixes Críticos Aplicados Durante Desarrollo

### Handler (fI5u4rs3iXPfeXFl)
- **IF node "Onboarding Complete?"**: Cambiado a typeVersion 2 con comparación de string (`equals "true"`). El SQL retorna `'true'`/`'false'` como texto para evitar problemas de tipos boolean.
- **AI Agent text expression**: `$json['message.text']` → `$json.message.text`
- **Tool nodes (typeVersion 2 → 1.3)**: Cambiados a typeVersion 1.3 para usar `fields.values` — el patrón correcto para inyectar contexto del developer (`userId`, `chatId`) en sub-workflows via toolWorkflow.
- **Sistema prompt**: Incluye `userId` y `chatId` para que el agente los use en tool calls.

### Meal Plan Generator (KQhP9lQNxCKeOsbJ)
- **"Save New Plan"**: `$json.weekNumber` → `$('Parse and Validate Plan').first().json.weekNumber` (el `$json` en ese punto es el output del UPDATE anterior, no del nodo de parseo).
- **"Get Previous Plan"**: `alwaysOutputData: true` para que el flujo continúe cuando no hay plan previo.

### Workout Plan Generator (ETjiYAUhXfsVSyWQ)
- **"Save New Plan"**: `$json.*` → referencias explícitas a `$('Parse Workout Plan').first().json.*`
- **"Get Previous Exercise Plan"**: `alwaysOutputData: true` — crítico para la primera generación (sin historial).

### RAG Personal Indexer (vAqqjXg2IE1ldgg3)
- Reemplazados nodos `n8n-nodes-base.openAi` (v1.8, no instalado) con nodos LangChain nativos:
  - `@n8n/n8n-nodes-langchain.vectorStoreQdrant` (modo insert)
  - `@n8n/n8n-nodes-langchain.documentDefaultDataLoader`
  - `@n8n/n8n-nodes-langchain.embeddingsOpenAi`
- `Prepare Document`: parsing de campo `query` (enviado por AI Agent) cuando `$fromAI()` retorna "undefined"
- `Document Loader`: requiere nodo `textSplitterCharacterTextSplitter` conectado como sub-nodo `ai_textSplitter`
- Conectado al Handler como `Tool: Registrar Evento` (typeVersion 1.3, ai_tool)
- Sistema prompt actualizado con instrucciones sobre cuándo usar `RegistrarEvento`

### Handler — Tool: Registrar Evento
- Nuevo `toolWorkflow` node conectado a `FitAI Main AI Agent` vía `ai_tool`
- `workflowId`: `vAqqjXg2IE1ldgg3`
- Campos: `userId` (fijo del contexto), `eventType` y `eventDataJson` (vía `$fromAI()`)
- AI Agent llama la tool automáticamente al detectar peso, comidas, o cambios de perfil

### Handler — Tool: Contexto Personal (vectorStoreQdrant typeVersion 1.3) ✅ FINAL
- **Root cause del bug**: `@langchain/qdrant@1.0.1` (n8n 2.11.3) usa `POST /points/query` — endpoint que solo existe en Qdrant ≥ 1.10.0. Con Qdrant 1.7.4 devolvía 404 "Not Found".
- **Fix**: Qdrant actualizado a **v1.13.0** en `docker-compose.yml`. Volumen de datos preservado.
- Nodo: `vectorStoreQdrant` typeVersion **1.3**, `mode: "retrieve-as-tool"`, `qdrantCollection.mode: "id"`
- embeddingsOpenAi typeVersion **1**, `model: "text-embedding-3-small"` como **string** (NO Resource Locator `{__rl}`)
- Validado exec 354: AI dice "Hoy, 28/03/2026..." con datos correctos del RAG ✅


### Panel de Administración — Admin Panel (Express + EJS)
- Construido completo: login, dashboard, CRUD usuarios, prospectos, pagos
- `admin-panel/app.js` carga `.env` (hostnames Docker para producción) y luego `.env.local` si existe (overrides `localhost` para desarrollo). En VPS no hay `.env.local` → cero fricción de deploy
- Campos adicionales en usuarios: `document_number`, `country`, `city`, `phone_number` (migración `002`)
- Migración de cuenta Telegram: código `FIT-XXXXXX` 24h + fusión manual con prospecto (migración `003`)
- Zona de peligro: eliminar usuario requiere escribir el nombre completo; DELETE CASCADE elimina toda la data asociada
- **Separación Usuarios / Prospectos**: lista de Usuarios filtra con `WHERE EXISTS (SELECT 1 FROM memberships WHERE user_id = u.id)` — solo muestra quienes tienen al menos una membresía. Prospectos = usuarios sin ninguna membresía. Sin solapamiento entre ambas vistas.
- **CSS**: rediseño completo — botones sólidos con texto blanco (contraste WCAG AA), navbar oscuro, tablas mejoradas, filtros en contenedor, login con gradiente. Fix de especificidad: `.table a:not(.btn)` evita que el color de links sobreescriba el color de botones dentro de tablas.
- **Nota operativa**: el panel debe reiniciarse (`pkill -f "node app.js" && nohup node app.js`) para cargar cambios de rutas en desarrollo local.

### Handler — Flujo de Contacto / Teléfono
- `Route Message Type` (Switch) ampliado a 4 ramas: text, voice, callback, **contact**
- Rama contact: `Set Phone Data` → `Save Phone Number` (UPDATE `users.phone_number`) → `Phone ACK` (envía confirmación y elimina el teclado de contacto)
- Al terminar onboarding, se envía automáticamente un `ReplyKeyboardMarkup` con botón `request_contact: true` para capturar el celular sin pedírselo manualmente

### Handler — Auto-guardado de Perfil al Finalizar Onboarding
- `Onboarding Agent` genera bloque `[PERFIL_COMPLETO]{json}[/PERFIL_COMPLETO]` cuando recopila los 20 datos
- `Parse Profile` (Code node): extrae el JSON del bloque
- `Has PERFIL_COMPLETO?` (IF): bifurca si el bloque está presente
- `Save User Profile`: UPSERT en `user_profiles` + `onboarding_completed = true` en `users`
- `Update User Contact Data`: guarda `country`, `city`, `document_number`, `phone_number` en `users`
- `Send Profile Done`: envía mensaje de confirmación
- `Request Phone Number`: envía `ReplyKeyboardMarkup` con botón de contacto

### Handler — Migración de Cuenta Telegram
- `Check Migration Token`: SQL con `UNION ALL` fallback que **siempre devuelve 1 fila** — si hay match devuelve la fila del usuario con `migration_match = true`; si no hay match devuelve `(NULL, NULL, false)`. Esto garantiza que el flujo nunca se detenga por 0 resultados.
- `Normalize Token Result` (Code node): capa de seguridad adicional por si el SQL cambia
- `Is Migration Token?` (IF): verifica `$json.migration_match === true`
- rama true → `Apply Migration` (UPDATE `telegram_id`, limpia token) → `Send Migration Success`
- rama false → `Upsert User` → flujo normal (respuesta a prospectos incluida)

**Lección aprendida**: `alwaysOutputData: true` en nodo Postgres con operación `executeQuery` y typeVersion 2.5 devuelve `[]` real — n8n no ejecuta ningún nodo downstream sin importar el tipo. La solución es SQL que garantice al menos 1 fila (`UNION ALL` con fila fallback).

### Telegram — Attribution Footer
- `appendAttribution: false` aplicado a todos los nodos Telegram de tipo send en todos los workflows
- Affected: Meal Reminder Scheduler, Weight Update Requester, Progress Calculator, Membership Alert (aplicado vía API), plus todos los nodos del Handler
- El mensaje "This message was sent automatically with n8n" no aparece en ningún flujo

### Timezone Colombia
- `GENERIC_TIMEZONE=America/Bogota` ya estaba en n8n → cron triggers correctos
- `Prepare Document` (RAG Indexer) y `Format Results` (RAG Search) actualizados a `toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })` en lugar de `toISOString().split('T')[0]`

### Knowledge Base Indexer (3uXT5ld76uIUCENn)
- Nuevo workflow con webhook POST (path: `kb-indexer-fitai`)
- Indexó 25 secciones de 4 skills (nutrition, fitness, habit-psychology, metrics-calculation) → 106 puntos en `knowledge_rag`

### Cron Workflows (SntGuE97yl9efvo5, tkSAHhjJnO4nTFsM, I4Q4C6SOPY2fnK3W)
- **`Split In Batches` removido de los 3 workflows**: sin conexión de loop-back, el nodo enviaba todos los items al output[1] ("done") que no estaba conectado, deteniendo el flujo silenciosamente. Solución: conexión directa del nodo "get" al nodo de procesamiento.
- **`Needs Weight Update` IF node**: `typeValidation: strict` → `loose` para manejar valores Date de PostgreSQL sin error de tipo.
- **`Build Weight Request Message`**: referencia `$('Split In Batches').item.json` → `$('Get Active Members').item.json` tras remover Split In Batches.

---

## Panel de Administración — Estado

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| Login / Auth | ✅ Operativo | express-session + bcrypt; `scripts/create-admin.js` para primer admin |
| Dashboard | ✅ Operativo | 4 métricas (usuarios, activos, por vencer, ingresos mes), lista de vencimientos y últimos pagos |
| Usuarios — Lista | ✅ Operativo | Filtros por status/plan/búsqueda, paginación. Solo muestra usuarios con al menos una membresía (excluye prospectos) |
| Usuarios — Alta | ✅ Operativo | Campos: Telegram ID, nombre, apellido, documento, celular, país, ciudad, plan, duración |
| Usuarios — Detalle | ✅ Operativo | Datos personales, membresía (pausar/cancelar/renovar), perfil de salud, historial de peso (gráfico de barras), historial de pagos |
| Usuarios — Editar | ✅ Operativo | Edición de todos los campos (nombre, apellido, Telegram ID, documento, celular, país, ciudad) |
| Usuarios — Eliminar | ✅ Operativo | Confirmación por nombre completo (zona de peligro); DELETE CASCADE en toda la data del usuario |
| Migración de cuenta | ✅ Operativo | Opción A: código `FIT-XXXXXX` 24h (generar/revocar); Opción B: fusión manual con prospecto |
| Prospectos | ✅ Operativo | Lista usuarios sin membresía activa; detalle con datos de Telegram (read-only); formulario de conversión a miembro |
| Pagos | ✅ Operativo | Lista paginada + formulario de registro inline (usuario, monto, método, referencia, fecha) |

---

## Inventario de Archivos del Proyecto

| # | Archivo | Estado | Contenido |
|---|---------|--------|-----------|
| 1 | `CLAUDE.md` | ✅ Completo | Instrucciones Claude Code, stack, comandos, MCPs, convenciones |
| 2 | `README.md` | ✅ Completo | Documentación pública del proyecto |
| 3 | `.mcp.json` | ✅ Completo | Configuración de MCPs (n8n, filesystem, postgres) |
| 4 | `.env.example` | ✅ Completo | 20+ variables de entorno con descripciones |
| 5 | `.env.local` | ✅ Completo | Overrides para desarrollo local (gitignored); hostnames `localhost` en lugar de Docker |
| 6 | `docker-compose.yml` | ✅ Completo | 6 servicios con healthchecks, volumes, networks |
| 7 | `infra/nginx.conf` | ✅ Completo | Reverse proxy, rate limiting, security headers |
| 8 | `docs/architecture.md` | ✅ Completo | Diagramas Mermaid, flujo request-response, ADRs |
| 9 | `docs/data-models.md` | ✅ Completo | SQL completo, ER diagram, JSON de ejemplo |
| 10 | `docs/n8n-flows.md` | ✅ Completo | 8 workflows documentados con nodos y lógica |
| 11 | `docs/api-integrations.md` | ✅ Completo | Telegram, OpenAI, Qdrant, PostgreSQL, Redis |
| 12 | `docs/admin-panel.md` | ✅ Completo | Wireframes, endpoints, auth, integración |
| 13 | `docs/deployment.md` | ✅ Completo | Guía VPS, Docker, SSL, backups, monitoreo |
| 14 | `migrations/001_initial_schema.sql` | ✅ Completo | Schema inicial completo |
| 15 | `migrations/002_contact_fields.sql` | ✅ Completo | Columnas: document_number, country, city, phone_number en users |
| 16 | `migrations/003_migration_token.sql` | ✅ Completo | Columnas: migration_token, migration_token_expires_at en users |
| 17 | `skills/business/nutrition.md` | ✅ Completo | Fórmulas, macros, alimentos |
| 18 | `skills/business/fitness.md` | ✅ Completo | Principios, rutinas completas |
| 19 | `skills/business/habit-psychology.md` | ✅ Completo | Modelo de hábito, coaching |
| 20 | `skills/business/metrics-calculation.md` | ✅ Completo | 9 funciones JS de cálculo |
| 21 | `skills/dev/n8n-workflow-debugging.md` | ✅ Completo | Guía de debugging de workflows n8n |
| 22 | `skills/dev/n8n-ai-agent-tools.md` | ✅ Completo | Patrones correctos de AI Agent + toolWorkflow |
| 23 | `prompts/system-prompt.md` | ✅ Completo | System prompt con personalidad y reglas |
| 24 | `prompts/onboarding.md` | ✅ Completo | 20 preguntas de onboarding (incluye país, ciudad, documento) |
| 25 | `prompts/meal-plan-generation.md` | ✅ Completo | Templates de planes de comidas |
| 26 | `prompts/workout-plan-generation.md` | ✅ Completo | Templates de rutinas |
| 27 | `n8n/workflows/README.md` | ✅ Completo | Guía de workflows |
| 28 | `n8n/workflows/01-telegram-webhook-handler.json` | ✅ Sincronizado | 38 nodos; incluye flujo contacto, migración (UNION ALL), auto-guardado de perfil |
| 29 | `n8n/workflows/11-knowledge-base-indexer.json` | ✅ Sincronizado | Webhook POST; indexa skills/business/ en knowledge_rag |
| 30 | `admin-panel/app.js` | ✅ Completo | Express server con carga de .env + .env.local |
| 31 | `admin-panel/routes/users.js` | ✅ Completo | CRUD completo + migración token + merge |
| 32 | `admin-panel/routes/prospects.js` | ✅ Completo | Lista + detalle + conversión a miembro |
| 33 | `admin-panel/scripts/create-admin.js` | ✅ Completo | CLI para crear primer admin |
| 34 | `admin-panel/README.md` | ✅ Completo | Setup del panel admin |
| 35 | `src/bot/handlers/README.md` | ✅ Completo | Descripción de handlers |

---

## Próximos Pasos

### Corto Plazo
1. **Prueba E2E completa** — onboarding nuevo usuario → planes → progreso → recordatorios
2. **Flujo de onboarding en n8n** — verificar que las 20 preguntas actualizadas (país, ciudad, documento) funcionan correctamente en el Onboarding Agent y que `[PERFIL_COMPLETO]` incluye esos campos

### Producción
3. **Migrar a VPS** — según `docs/deployment.md`
4. **Configurar HTTPS** con Certbot / Nginx
5. **Activar pagos** — integrar pasarela en el panel admin

---

## Decisiones Arquitectónicas Tomadas

| Decisión | Elección | Justificación |
|----------|---------|---------------|
| Panel admin | Express + EJS | Mínimas dependencias, ~80MB Docker |
| LLM producción | OpenAI GPT-4o en n8n | Integración nativa, mejor function calling |
| Vector store | Qdrant self-hosted | Nodo nativo en n8n, filtrado por metadata |
| Pagos | Manual (Fase 1) | Evita complejidad regulatoria en el MVP |
| Orquestación | n8n (sin backend custom) | Visual, no-code para ajustes |
| Embeddings | text-embedding-3-small (1536d) | Balance costo/calidad para RAG |
| Tool injection | typeVersion 1.3 + fields.values | Patrón más estable para inyectar contexto en sub-workflows |
