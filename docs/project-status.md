# Estado del Proyecto — FitAI Assistant

**Última actualización:** 2026-04-04 (v2.2 post-sesión onboarding)

---

## Estado Actual: v2 Implementación Completa ✅

**18 workflows activos en n8n.** Sistema v2 completo: tracking diario, coach proactivo, onboarding conversacional Redis, planes diarios por fecha. Panel de administración web operativo en `localhost:3000`.

---

## Implementación v2 — Resumen de Fases

| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | SQL migrations (daily_targets, daily_intake_logs, plan_date) | ✅ Ejecutado |
| 2 | Main AI Agent v2: 6 nodos contexto paralelos, Build Context, system prompt v2 | ✅ Completado |
| 3 | Tools: Log Food Intake + Get Daily Status | ✅ Completado |
| 4 | Onboarding Flow v2: Redis state machine, 19 nodos, TTL 48h | ✅ Completado |
| 5 | Meal Plan Generator v2: diario, planDate, 4 contextos, gpt-4o temp=0.85 | ✅ Completado |
| 6 | Daily Plan Generator Cron: 9pm, LEFT JOIN usuarios sin plan mañana | ✅ Completado |
| 7 | 5 workflows proactivos: Morning Briefing, Evening Check-in, Weekly Report, Silence Detector, Meal Reminder v2 | ✅ Completado |
| 8 | Test E2E Final: infraestructura, flujo principal, planes, proactivos | ✅ Validado |

---

## Workflows en n8n — Estado E2E (v2)

| ID | Nombre | Nodos | Estado | Notas |
|----|--------|-------|--------|-------|
| `fI5u4rs3iXPfeXFl` | FitAI - Telegram Webhook Handler | 65 | ✅ Activo | v2.1: fullSystemPrompt dinámico, anti-hallucination rules, cadena post-respuesta (Log Conversation + Build RAG Payload + Trigger RAG Indexer), timezone fix |
| `CCkMv75zwDDoj513` | FitAI - Process text message | 7 | ✅ Activo | Debounce multi-mensaje via message_buffer |
| `yiUgnJ6gCoaIFVXe` | FitAI - Onboarding Flow | 27 | ✅ Activo | v2.2: AI Agent (sin memory), intent parser, 21 pasos, Redis TTL 48h, Merge append+Collapse, fixes SQL schema |
| `KQhP9lQNxCKeOsbJ` | FitAI - Meal Plan Generator | 13 | ✅ Activo | v2: plan diario (plan_date), 4 contextos paralelos, gpt-4o temp=0.85 max_tokens=2048 |
| `SntGuE97yl9efvo5` | FitAI - Meal Reminder Scheduler | 6 | ✅ Activo | v2: jsonb_array_elements → meals[], balance día, dedup por meal_name |
| `tkSAHhjJnO4nTFsM` | FitAI - Weight Update Requester | 6 | ✅ Activo | Cron lunes 9am |
| `bhJ8qqZXr68Id3pH` | FitAI - Progress Calculator | 7 | ✅ Activo | Tool del AI Agent |
| `ETjiYAUhXfsVSyWQ` | FitAI - Workout Plan Generator | 11 | ✅ Activo | Tool del AI Agent |
| `vAqqjXg2IE1ldgg3` | FitAI - RAG Personal Indexer | 6 | ✅ Activo | Indexa en user_rag (Qdrant) |
| `3uXT5ld76uIUCENn` | FitAI - Knowledge Base Indexer | 7 | ✅ Activo | 106 puntos en knowledge_rag |
| `I4Q4C6SOPY2fnK3W` | FitAI - Membership Alert | 4 | ✅ Activo | Cron alertas vencimiento |
| `DQsnzXQWMSqJxigL` | FitAI - Log Food Intake | 5 | ✅ Activo | Tool: INSERT daily_intake_logs + UPSERT daily_targets, responde balance_dia |
| `J2y4wKYEugHe4Mkg` | FitAI - Get Daily Status | 5 | ✅ Activo | Tool: retorna calorias/proteina/comidas/plan pendiente |
| `xILhDSQy0ZP40jjt` | FitAI - Daily Plan Generator Cron | 7 | ✅ Activo | Cron 9pm, LEFT JOIN usuarios sin plan mañana, UPSERT daily_targets |
| `NFhsChTrhIc05uyc` | FitAI - Morning Briefing | 6 | ✅ Activo | Cron */30 5-9, wake_up_time ±15min, plan del día, dedup morning_briefing |
| `ErIUGcIkS5Rim65L` | FitAI - Evening Check-in | 6 | ✅ Activo | Cron 8-10pm, balance final del día o casual si sin datos, dedup evening_checkin |
| `gsIQcXRlMznc3uJ8` | FitAI - Weekly Report | 6 | ✅ Activo | Cron domingo 10am, LATERAL JOINs, peso/nutricion/ejercicio, dedup weekly_report |
| `ytuz6H8cdBm8oyTx` | FitAI - Silence Detector | 6 | ✅ Activo | Cron 6pm, ventana 24-72h, mensaje casual, dedup silence_check |

---

## Infraestructura

| Servicio | Estado | Detalles |
|----------|--------|----------|
| n8n 2.11.3 | ✅ Running | Docker standalone, puerto 5678, SQLite backend |
| PostgreSQL 16 | ✅ Running | Contenedor `fitai-postgres`, 12 tablas |
| Redis 7 | ✅ Running | Puerto 6379; estado onboarding (TTL 48h) |
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
| `UGH5aP9zo2YPdm6x` | Redis FitAI | redis |

---

## Tablas PostgreSQL — Estado

| Tabla | Estado | Notas |
|-------|--------|-------|
| `users` | ✅ | phone_number, migration_token, telegram_id |
| `memberships` | ✅ | status: active/expired/trial/cancelled/paused |
| `user_profiles` | ✅ | caloric_target, protein/carb/fat_target_g, onboarding_completed |
| `goals` | ✅ | goal_type, target_weight, start_weight |
| `meal_plans` | ✅ | plan_date (v2), week_number nullable (deprecated), meals[] JSON |
| `daily_targets` | ✅ | target_date, calories/protein/carb/fat consumed, meals_logged |
| `daily_intake_logs` | ✅ | meal_type, description, estimated_calories/protein/carbs/fat |
| `weight_logs` | ✅ | peso diario |
| `exercise_plans` | ✅ | plan de ejercicio |
| `conversation_logs` | ✅ | message_type values: text, morning_briefing, meal_reminder, evening_checkin, weekly_report, silence_check, workout_completed |
| `admin_users` | ✅ | Panel admin auth |
| `message_buffer` | ✅ | Debounce multi-mensaje |

---

## Fixes Críticos v2 (Fases 1-8)

### Phase 2-3: Build Context + Tools
- **Load User Profile SQL** (v1→v2): reemplazó `users.last_name/current_weight_kg/activity_level` → `user_profiles.caloric_target/protein_target_g/goal`. Fix aplicado en Fase 8 tras detectar error en ejecución 542.
- **Upsert daily_targets**: falla si `caloric_target IS NULL` — el onboarding debe completarse antes de que log_food funcione correctamente.
- **conversation_logs.message_text NOT NULL**: todos los INSERTs proactivos usan `message_text='[proactive]'` como placeholder.

### Phase 5-6: Meal Plan v2 + Cron
- **meal_plans.week_number NOT NULL**: `ALTER COLUMN week_number DROP NOT NULL` para soportar el plan diario v2.
- **CURRENT_DATE AT TIME ZONE bug**: `(CURRENT_DATE AT TIME ZONE 'America/Bogota') + INTERVAL '1 day'` en DB UTC produce la fecha de hoy, no mañana. Fix: usar `CURRENT_DATE + 1` directamente.

### Phase 7: Proactive Workflows
- **Weekly Report dedup**: faltaba cláusula `NOT EXISTS` — añadida en segunda iteración.
- **appendAttribution=false**: todos los nodos Telegram de los 5 workflows proactivos.

### Onboarding v2.2 — Fixes de Sesión 2026-04-04

- **AI Agent reemplaza nodo OpenAI deprecated**: `Generate Onboarding Message` (openAi v1.1) reemplazado por `@n8n/n8n-nodes-langchain.agent` (tv=2) + `lmChatOpenAi` (tv=1.2) con gpt-4o-mini. Evita el deprecation y soporta conversación real.
- **memoryBufferWindow eliminado del onboarding**: la memoria in-RAM causaba que el agente "doblara" sobre respuestas anteriores alucinadas, concluyendo el onboarding por su cuenta y saltando pasos. Fix: sin memoria. Cada ejecución es stateless — el contexto viene del system prompt.
- **humanMessage estructurado (no texto crudo)**: en lugar de pasar el texto del usuario al agente, se pasa una instrucción explícita de tarea: `"Dato anterior aceptado. Tarea: [descripción del paso]"`. Previene que el agente free-forme basado en texto ambiguo.
- **Intent parser para texto libre**: nodo `Parse User Intent` (openAi gpt-4o-mini, temp=0) normaliza respuestas naturales a valores canónicos (`"soy un chico"` → `"male"`, `"camino bastante"` → `"lightly_active"`). El `Has Callback?` IF node enruta callbacks directo a validación (sin parser).
- **Merge fan-out 4× → append + Collapse**: `Calculate Metrics` abanica a 4 nodos DB en paralelo. Merge `mode: "append"` espera todos los inputs. Nodo `Collapse to One Item` (Code) reduce a 1 item antes de continuar. Sin esto, todos los downstream (Send Metrics Message, Send Welcome Message, Generate First Meal Plan) se ejecutaban 4 veces.
- **SQL schema audit — columnas y enums incorrectos**: múltiples mismatches corregidos en `Save Initial Goal` (ob-12): `target_weight_kg`→`target_weight`, `start_weight_kg`→`start_weight`, `ON CONFLICT (user_id)` inválido (goals sin unique constraint en user_id) → reemplazado por DELETE+INSERT, `CURRENT_DATE`→`(NOW() AT TIME ZONE 'America/Bogota')::date`.
- **PostgreSQL text[] array literal format**: `JSON.stringify([])` produce `"[]"` (JSON válido pero inválido para `text[]` de PG). Fix en `Save User Profile` (ob-11): usar formato `{}`: `'{' + arr.map(v => '"' + v + '"').join(',') + '}'`.

### Post-v2: Fixes de Sesión 2026-04-02

- **systemMessage sin `=` prefix**: El campo `options.systemMessage` del AI Agent trata el contenido como string estático sin el prefijo `=`. `{{variable}}` llegaba literal a GPT-4o. Fix: cambiar a `={{ $json.fullSystemPrompt }}` y construir el prompt completo en Build Context.
- **fullSystemPrompt pattern**: Build Context construye un string que concatena las REGLAS CRÍTICAS estáticas + bloque `CONTEXTO DEL USUARIO ACTUAL` dinámico. El AI Agent lo consume con `={{ $json.fullSystemPrompt }}`.
- **memoryBufferWindow contamina con tono viejo**: Al actualizar el system prompt, la RAM tenía historial del agente anterior. Fix: `docker restart n8n`. Para producción: migrar a `memoryRedisChat`.
- **Timezone bug masivo — CURRENT_DATE**: 16 ocurrencias en 9 workflows usaban `CURRENT_DATE` (UTC) en vez de `(NOW() AT TIME ZONE 'America/Bogota')::date`. A las 19:00-23:59 Colombia, `CURRENT_DATE` ya es mañana en UTC. Corregido en: handler (4 nodos de contexto), Log Food Intake, Get Daily Status, Daily Plan Cron, Morning Briefing, Evening Check-in, Meal Reminder, Weekly Report, Silence Detector.
- **Agente inventaba planes de comida**: Cuando `dailyStatus = "sin targets"`, GPT-4o inventaba arepa, pollo, batido, pescado. Fix: regla #1 `NUNCA INVENTES DATOS` + sección `REGLA ABSOLUTA SOBRE DATOS FALTANTES` en el system prompt. Validado: bot responde "Hoy no tienes plan generado y no me has reportado nada. Con tu meta de *2,217 kcal*...".
- **RAG Personal no se alimentaba automáticamente**: `Send Response` no tenía conexiones salientes — el flujo moría ahí. Solo `Tool: Registrar Evento` indexaba (si el agente decidía llamarla). Fix: cadena post-respuesta `Send Response → Log Conversation → Build RAG Payload → Trigger RAG Indexer (async)`. RAG Indexer actualizado para manejar `eventType: 'conversation'`.
- **JS double-escape en template literals**: Al construir `STATIC_RULES` con backtick en nombres de tools (`` `log_food_intake` ``), una pasada `.replace('`', r'\`')` sobre texto ya pre-escapado generaba `\\``. Fix: definir con backticks literales y hacer una sola pasada de escape. Validar con `node --check` antes de enviar.
- **log_food_intake registraba todo como HOY**: Cuando el usuario decía "ayer cene...", el INSERT usaba `(NOW() AT TIME ZONE 'America/Bogota')::date` hardcodeado. Fix en 3 partes: (1) Log Food Intake workflow acepta `log_date` como `$2::date` en el SQL; (2) Tool description le indica a GPT-4o incluir `log_date` en el JSON del `query`; (3) system prompt sección 7 añade reglas de determinación de fecha + prohibición de sumar calorías de ayer al balance de hoy. Validado: "ayer cene huevos con patacones" → `log_date=2026-04-01`, "hoy desayune arepa con huevo" → `log_date=2026-04-02`.
- **`$fromAI()` en `fields.values` rompe tool schema**: Agregar `log_date` como campo `$fromAI()` en `fields.values` del toolWorkflow causó `"Expected string, received object → at input"` en el AI Agent. Causa: n8n genera un JSON Schema con múltiples parámetros, GPT-4o pasa objeto en vez de string. Fix: eliminar el campo `$fromAI()` de `fields.values` y mover `log_date` al JSON dentro del campo `query` (documentado en la descripción del tool). Regla: `fields.values` solo para valores estáticos (userId, chatId).

---

## Inventario de Archivos del Proyecto

| # | Archivo | Estado | Contenido |
|---|---------|--------|-----------|
| 1 | `CLAUDE.md` | ✅ v2 Completo | 18 IDs de workflows, comandos, patrones críticos v2 |
| 2 | `README.md` | ✅ Completo | Documentación pública |
| 3 | `.mcp.json` | ✅ Completo | MCPs: n8n, filesystem, postgres |
| 4 | `.env.example` | ✅ Completo | Variables de entorno |
| 5 | `docker-compose.yml` | ✅ Completo | 6 servicios con healthchecks |
| 6 | `infra/nginx.conf` | ✅ Completo | Reverse proxy |
| 7 | `docs/architecture.md` | ✅ Completo | Diagramas Mermaid, flujo, ADRs |
| 8 | `docs/data-models.md` | ✅ Completo | SQL, ER diagram; incluye daily_targets, daily_intake_logs, plan_date |
| 9 | `docs/n8n-flows.md` | ✅ Completo | 16+ workflows: v2 handler, onboarding, meal plan diario, 5 proactivos |
| 10 | `docs/api-integrations.md` | ✅ Completo | Telegram, OpenAI, Qdrant, PostgreSQL, Redis |
| 11 | `docs/admin-panel.md` | ✅ Completo | Wireframes, endpoints, auth |
| 12 | `docs/deployment.md` | ✅ Completo | Guía VPS, Docker, SSL, backups |
| 13 | `docs/project-status.md` | ✅ v2 Completo | Este archivo |
| 14 | `skills/dev/n8n-workflow-debugging.md` | ✅ v2.2 Completo | 24 lecciones: incluye Merge fan-out, PostgreSQL schema audit, test data enums, array literals |
| 15 | `skills/dev/n8n-ai-agent-tools.md` | ✅ Completo | Patrones AI Agent + toolWorkflow |
| 16-19 | `skills/business/*.md` | ✅ Completo | nutrition, fitness, habit-psychology, metrics-calculation |
| 20 | `prompts/system-prompt.md` | ✅ v2 Completo | dailyStatus, weeklyTrend, nextAction, 14 secciones |
| 21 | `prompts/onboarding.md` | ✅ v2 Completo | 5 bloques, 21 steps, TTL 48h |
| 22 | `prompts/meal-plan-generation.md` | ✅ v2 Completo | Plan DIARIO con contexto |
| 23 | `prompts/workout-plan-generation.md` | ✅ Completo | Templates rutinas |
| 24-41 | `n8n/workflows/*.json` | ✅ Sincronizados | 18 workflows exportados |
| 42 | `admin-panel/app.js` | ✅ Completo | Express server |
| 43-45 | `admin-panel/routes/*.js` | ✅ Completo | users, prospects, payments |
| 46 | `migrations/001-006_*.sql` | ✅ Ejecutados | Schema completo v2 |

---

## Próximos Pasos (Post-v2)

### Producción
1. **Migrar a VPS** — según `docs/deployment.md`
2. **Configurar HTTPS** con Certbot + Nginx
3. **Activar pagos** — integrar pasarela de pago en el panel admin
4. **Prueba E2E real** — onboarding nuevo usuario → plan diario → morning briefing → check-in

### Mejoras Opcionales
5. **Workout Plan v2** — adaptar al formato diario (similar a Meal Plan v2)
6. **Push notifications** — integrar Canal de Alertas Telegram en lugar de mensajes directos
7. **Analytics dashboard** — métricas de adherencia agregadas en el panel admin

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
| Planes | Diarios (plan_date) en vez de semanales | Más adaptación al intake real, variedad, entrenamiento |
| Onboarding | Redis state machine TTL 48h | Sin rows pendientes en DB, expiración automática |
| Proactivos | 5 crons independientes con dedup | Modular, cada uno fácil de ajustar o desactivar |
