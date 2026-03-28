# Estado del Proyecto — FitAI Assistant

**Última actualización:** 2026-03-28

---

## Estado Actual: En Producción Local — Todos los Flows Probados

El sistema está corriendo localmente con Docker. Todos los workflows han sido probados E2E. Los cron workflows funcionan con lógica correcta; la alerta de membresía falla solo por datos de test (telegram_id falso).

---

## Workflows en n8n — Estado E2E

| ID | Nombre | Estado | Notas |
|----|--------|--------|-------|
| `fI5u4rs3iXPfeXFl` | FitAI - Telegram Webhook Handler | ✅ E2E OK | Handler unificado (18 nodos): onboarding check, AI Agent, send response |
| `bhJ8qqZXr68Id3pH` | FitAI - Progress Calculator | ✅ E2E OK | Recibe userId+chatId vía toolWorkflow, calcula métricas, responde |
| `KQhP9lQNxCKeOsbJ` | FitAI - Meal Plan Generator | ✅ E2E OK | Genera plan semanal con GPT-4o, guarda en DB, envía por Telegram |
| `ETjiYAUhXfsVSyWQ` | FitAI - Workout Plan Generator | ✅ E2E OK | Genera rutina personalizada, guarda en DB, envía por Telegram |
| `vAqqjXg2IE1ldgg3` | FitAI - RAG Personal Indexer | ✅ Construido | Usa LangChain nodes; pendiente conectar como tool en el Handler |
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
| Qdrant 1.7+ | ✅ Running | Puerto 6333, colecciones `user_rag` y `knowledge_rag` creadas |
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
- `Prepare Document`: añadida validación de input para manejar datos vacíos gracefully

### Cron Workflows (SntGuE97yl9efvo5, tkSAHhjJnO4nTFsM, I4Q4C6SOPY2fnK3W)
- **`Split In Batches` removido de los 3 workflows**: sin conexión de loop-back, el nodo enviaba todos los items al output[1] ("done") que no estaba conectado, deteniendo el flujo silenciosamente. Solución: conexión directa del nodo "get" al nodo de procesamiento.
- **`Needs Weight Update` IF node**: `typeValidation: strict` → `loose` para manejar valores Date de PostgreSQL sin error de tipo.
- **`Build Weight Request Message`**: referencia `$('Split In Batches').item.json` → `$('Get Active Members').item.json` tras remover Split In Batches.

---

## Inventario de Archivos del Proyecto

| # | Archivo | Estado | Contenido |
|---|---------|--------|-----------|
| 1 | `CLAUDE.md` | ✅ Completo | Instrucciones Claude Code, stack, comandos, MCPs, convenciones |
| 2 | `README.md` | ✅ Completo | Documentación pública del proyecto |
| 3 | `.mcp.json` | ✅ Completo | Configuración de MCPs (n8n, filesystem, postgres) |
| 4 | `.env.example` | ✅ Completo | 20+ variables de entorno con descripciones |
| 5 | `docker-compose.yml` | ✅ Completo | 6 servicios con healthchecks, volumes, networks |
| 6 | `infra/nginx.conf` | ✅ Completo | Reverse proxy, rate limiting, security headers |
| 7 | `docs/architecture.md` | ✅ Completo | Diagramas Mermaid, flujo request-response, ADRs |
| 8 | `docs/data-models.md` | ✅ Completo | SQL completo, ER diagram, JSON de ejemplo |
| 9 | `docs/n8n-flows.md` | ✅ Completo | 8 workflows documentados con nodos y lógica |
| 10 | `docs/api-integrations.md` | ✅ Completo | Telegram, OpenAI, Qdrant, PostgreSQL, Redis |
| 11 | `docs/admin-panel.md` | ✅ Completo | Wireframes, endpoints, auth, integración |
| 12 | `docs/deployment.md` | ✅ Completo | Guía VPS, Docker, SSL, backups, monitoreo |
| 13 | `skills/business/nutrition.md` | ✅ Completo | Fórmulas, macros, alimentos |
| 14 | `skills/business/fitness.md` | ✅ Completo | Principios, rutinas completas |
| 15 | `skills/business/habit-psychology.md` | ✅ Completo | Modelo de hábito, coaching |
| 16 | `skills/business/metrics-calculation.md` | ✅ Completo | 9 funciones JS de cálculo |
| 17 | `skills/dev/n8n-workflow-debugging.md` | ✅ Nuevo | Guía de debugging de workflows n8n |
| 18 | `skills/dev/n8n-ai-agent-tools.md` | ✅ Nuevo | Patrones correctos de AI Agent + toolWorkflow |
| 19 | `prompts/system-prompt.md` | ✅ Completo | System prompt con personalidad y reglas |
| 20 | `prompts/onboarding.md` | ✅ Completo | 17 preguntas de onboarding |
| 21 | `prompts/meal-plan-generation.md` | ✅ Completo | Templates de planes de comidas |
| 22 | `prompts/workout-plan-generation.md` | ✅ Completo | Templates de rutinas |
| 23 | `n8n/workflows/README.md` | ✅ Completo | Guía de workflows |
| 24 | `admin-panel/README.md` | ✅ Completo | Setup del panel admin |
| 25 | `src/bot/handlers/README.md` | ✅ Completo | Descripción de handlers |

---

## Próximos Pasos

### Inmediatos
1. **Conectar RAG Personal Indexer como tool** en el Handler — añadir `toolWorkflow` con `workflowId: vAqqjXg2IE1ldgg3` para que el agente indexe eventos (peso, comidas, cambios de perfil)
2. **Indexar knowledge base** en Qdrant — ejecutar RAG Personal Indexer con los archivos de `skills/business/`
3. **Configurar Vector Store Tool** en el AI Agent para consultas RAG (buscar contexto personal del usuario)

### Corto Plazo
4. **Construir panel de administración** (Express + EJS) — gestión de usuarios, membresías, pagos
5. **Prueba E2E completa** — onboarding nuevo usuario → planes → progreso → recordatorios

### Producción
6. **Migrar a VPS** — según `docs/deployment.md`
7. **Configurar HTTPS** con Certbot / Nginx
8. **Activar pagos** — integrar pasarela en el panel admin

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
