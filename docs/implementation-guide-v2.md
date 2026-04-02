# Guia de Implementacion v2 — Prompts para Claude Code

> Ejecutar en orden. Cada fase depende de la anterior.
> Cada fase incluye un CHECKPOINT obligatorio que debe pasar antes de continuar.
> Total: 8 fases, 61 validaciones.

| Fase | Que hace | Depende de | Checks |
|---|---|---|---|
| 1 | Tablas daily_targets, daily_intake_logs, plan_date | — | 8 |
| 2 | Main AI Agent: system prompt v2, 5 nodos, 2 tools | F1 | 7 |
| 3 | Workflows log_food_intake, get_daily_status | F2 | 5 |
| 4 | Onboarding v2 bloques + transicion coaching | F1-3 | 5 |
| 5 | Meal Plan Generator semanal → diario | F1 | 5 |
| 6 | Daily Plan Generator Cron | F5 | 4 |
| 7 | 5 workflows proactivos | F1,5 | 8 |
| 8 | Test E2E completo | Todas | 19 |

Regla: >= 80% pasan Y ninguna E2E critica fallo con error de datos. Tests sin usuario de prueba = SKIP (no fallo).

---

## Fase 1: Migracion de Base de Datos

### Prompt:

```
Lee: migrations/006_daily_tracking.sql, docs/data-models.md, CLAUDE.md

Ejecuta la migracion:
docker compose exec -T postgres psql -U fitai -d fitai_db < migrations/006_daily_tracking.sql

Tambien asegura que conversation_logs tenga assistant_response:
ALTER TABLE conversation_logs ADD COLUMN IF NOT EXISTS assistant_response TEXT;
CREATE INDEX IF NOT EXISTS idx_conversation_logs_type_date ON conversation_logs(user_id, message_type, created_at);

--- CHECKPOINT FASE 1 (8 validaciones) ---

Ejecuta TODAS y reporta resultado. NO avances si alguna falla:

V1 — Tablas existen:
docker compose exec postgres psql -U fitai -d fitai_db -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('daily_targets','daily_intake_logs') ORDER BY 1;"
ESPERADO: 2 filas

V2 — Columnas de daily_targets:
docker compose exec postgres psql -U fitai -d fitai_db -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='daily_targets' ORDER BY ordinal_position;"
ESPERADO: 14+ columnas incluyendo calories_consumed, protein_consumed_g, meals_logged

V3 — UNIQUE constraint:
docker compose exec postgres psql -U fitai -d fitai_db -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='daily_targets' AND constraint_type='UNIQUE';"
ESPERADO: 1 fila

V4 — plan_date en meal_plans:
docker compose exec postgres psql -U fitai -d fitai_db -c "SELECT column_name,data_type FROM information_schema.columns WHERE table_name='meal_plans' AND column_name='plan_date';"
ESPERADO: 1 fila tipo date

V5 — Indices:
docker compose exec postgres psql -U fitai -d fitai_db -c "SELECT indexname FROM pg_indexes WHERE tablename IN ('daily_targets','daily_intake_logs','conversation_logs') AND indexname LIKE 'idx_%';"
ESPERADO: 3+ indices

V6 — INSERT prueba daily_targets:
docker compose exec postgres psql -U fitai -d fitai_db -c "INSERT INTO daily_targets (user_id,target_date,caloric_target,protein_target_g,carb_target_g,fat_target_g) VALUES (9999,CURRENT_DATE,1800,135,200,60) ON CONFLICT DO NOTHING RETURNING id;"
docker compose exec postgres psql -U fitai -d fitai_db -c "DELETE FROM daily_targets WHERE user_id=9999;"
ESPERADO: sin errores

V7 — INSERT prueba daily_intake_logs:
docker compose exec postgres psql -U fitai -d fitai_db -c "INSERT INTO daily_intake_logs (user_id,log_date,meal_type,description,estimated_calories) VALUES (9999,CURRENT_DATE,'breakfast','test',400) RETURNING id;"
docker compose exec postgres psql -U fitai -d fitai_db -c "DELETE FROM daily_intake_logs WHERE user_id=9999;"
ESPERADO: sin errores

V8 — assistant_response existe:
docker compose exec postgres psql -U fitai -d fitai_db -c "SELECT column_name FROM information_schema.columns WHERE table_name='conversation_logs' AND column_name='assistant_response';"
ESPERADO: 1 fila

Reporta: "CHECKPOINT FASE 1: X/8 pasaron"
```

---

## Fase 2: Actualizar Main AI Agent

### Prompt:

```
Lee: docs/n8n-flows.md seccion 2, prompts/system-prompt.md, skills/dev/n8n-ai-agent-tools.md, n8n/workflows/02-main-ai-agent.json, CLAUDE.md

Modifica n8n/workflows/02-main-ai-agent.json:

1. SYSTEM PROMPT: Reemplaza con prompts/system-prompt.md. Variables: {{userName}}, {{userProfile}}, {{dailyStatus}}, {{weeklyTrend}}, {{nextAction}}, {{currentDate}}, {{ragContext}}, {{userRagContext}} → expresiones n8n {{ $json.X }}.

2. 5 NODOS PARALELOS NUEVOS (queries en docs/n8n-flows.md seccion 2, nodos 5a-5e):
   - "Load Daily Status", "Load Today Meals", "Load Today Plan", "Load Weight Trend", "Load Weekly Average"
   - Credenciales PostgreSQL existentes, alwaysOutputData: true

3. BUILD CONTEXT: Codigo JavaScript completo de docs/n8n-flows.md seccion 2 (construye dailyStatus, weeklyTrend, nextAction).

4. 2 TOOLS NUEVAS (typeVersion 1.3, patron de skills/dev/n8n-ai-agent-tools.md):
   - LogFoodIntake: fields.values userId+chatId, $fromAI: meal_type, description, estimated_calories, estimated_protein_g, estimated_carbs_g, estimated_fat_g. workflowId: placeholder.
   - GetDailyStatus: fields.values userId+chatId, sin $fromAI. workflowId: placeholder.

5. CONEXIONES: nodos paralelos desde trigger → Build Context. Tools al AI Agent via ai_tool. NO romper tools existentes.

Importa: curl -X PUT "http://localhost:5678/api/v1/workflows/Gr7BeeNHBx6ZtQGS" ... Commit.

--- CHECKPOINT FASE 2 (7 validaciones) ---

V1 — Workflow importado:
curl -s ".../workflows/Gr7BeeNHBx6ZtQGS" -H "X-N8N-API-KEY: ..." | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'Nodos:{len(d[\"nodes\"])} Activo:{d[\"active\"]}')"
ESPERADO: mas nodos que antes, activo=true

V2 — 5 nodos paralelos:
Verificar que existen: Load Daily Status, Load Today Meals, Load Today Plan, Load Weight Trend, Load Weekly Average
ESPERADO: 5/5

V3 — 2 nuevas tools:
Verificar nodos toolWorkflow: LogFoodIntake y GetDailyStatus con typeVersion 1.3
ESPERADO: ambas presentes

V4 — Tools existentes intactas:
Contar total de conexiones ai_tool
ESPERADO: 7+ (las existentes + 2 nuevas)

V5 — System prompt tiene nuevas variables:
Buscar dailyStatus, weeklyTrend, nextAction en el prompt del AI Agent
ESPERADO: las 3 presentes

V6 — Build Context referencia nodos nuevos:
Buscar "Load Daily Status", "Load Today Meals", etc. en el codigo del Build Context
ESPERADO: todas las referencias

V7 — E2E: Si hay usuario de prueba, enviar "hola" y verificar que el workflow ejecuta sin errores y Build Context genera las 3 variables (aunque vacias). Si no hay usuario → SKIP.

Reporta: "CHECKPOINT FASE 2: X/7 pasaron"
```

---

## Fase 3: Crear Workflows de las Nuevas Tools

### Prompt:

```
Lee: docs/n8n-flows.md secciones 11 y 12, skills/dev/n8n-ai-agent-tools.md, n8n/workflows/07-progress-calculator.json (referencia)

Crea:
1. n8n/workflows/13-log-food-intake.json — Trigger → Insert Intake Log → Upsert Daily Targets → Build Response. Queries en seccion 11.
2. n8n/workflows/14-get-daily-status.json — Trigger → Get Daily Targets + Get Today Intake + Get Today Plan (paralelo) → Build Status Response. Queries en seccion 12.

alwaysOutputData: true en queries. Credenciales existentes.

Importa ambos. Anota IDs. Actualiza placeholders en 02-main-ai-agent.json. Re-importa Agent. Activa ambos. Actualiza CLAUDE.md. Commit.

--- CHECKPOINT FASE 3 (5 validaciones) ---

V1 — Ambos workflows en n8n:
Buscar workflows con "food", "intake", "daily", "status" en el nombre.
ESPERADO: 2 workflows visibles y activos

V2 — IDs correctos en Main AI Agent:
Verificar que LogFoodIntake.workflowId y GetDailyStatus.workflowId apuntan a los IDs reales (no placeholders).

V3 — E2E log_food_intake:
Ejecutar manualmente con datos de prueba: { userId: <real>, meal_type: "breakfast", description: "test", estimated_calories: 400, estimated_protein_g: 25, ... }
Verificar INSERT en daily_intake_logs + UPSERT en daily_targets.

V4 — E2E get_daily_status:
Ejecutar manualmente con { userId: <real> }
Verificar que retorna JSON con calorias, proteina, comidas.

V5 — Limpieza:
Borrar datos de prueba de V3.

Reporta: "CHECKPOINT FASE 3: X/5 pasaron"
```

---

## Fase 4: Actualizar Onboarding Flow

### Prompt:

```
Lee: prompts/onboarding.md, docs/n8n-flows.md seccion 3, n8n/workflows/03-onboarding-flow.json

Modifica 03-onboarding-flow.json:

1. BIENVENIDA: "Hola! Soy tu coach..." + "Como te llamo?" integrado. step="ask_name". TTL=172800.
2. VALIDATE AND PROCESS: 21 steps, sin confirmaciones repetitivas, transiciones naturales, restricciones+alergias combinadas, actividad al final, confirmacion breve, correccion por bloque. Codigo completo en seccion 3 nodo 6.
3. CALCULATE METRICS: lose_fat=TDEE*0.80, gain_muscle=1.10, maintain=1.0, recomposition=0.95. 4 niveles actividad. estimated_weeks.
4. SAVE PROFILE: meals_per_day, equipment (renombrados).
5. POST-ONBOARDING: Create Tomorrow Daily Targets + Generate First Day Plan + Index Onboarding Summary.
6. MENSAJES CIERRE: metricas contextuales + bienvenida al servicio. SIN lista de comandos.

Importa, commit.

--- CHECKPOINT FASE 4 (5 validaciones) ---

V1 — Workflow importado: nodos >= 19, activo = true

V2 — Nodos post-onboarding: verificar Create Tomorrow Daily Targets, Generate First Day Plan, Index Onboarding Summary

V3 — TTL Redis = 172800:
Verificar en nodos Redis SET

V4 — Mensaje bienvenida es v2:
Buscar "coach" en codigo (v2) y verificar que NO contiene "Bienvenido a FitAI" (v1)

V5 — E2E: Si hay usuario nuevo de prueba, enviar /start y verificar primeros 3-4 pasos del onboarding: bienvenida v2, transiciones fluidas sin repeticion. Si no hay usuario → SKIP.

Reporta: "CHECKPOINT FASE 4: X/5 pasaron"
```

---

## Fase 5: Actualizar Meal Plan Generator

### Prompt:

```
Lee: prompts/meal-plan-generation.md, docs/n8n-flows.md seccion 4, n8n/workflows/04-meal-plan-generator.json

Modifica 04-meal-plan-generator.json:

1. TRIGGER: recibe userId + planDate.
2. NODOS PARALELOS: Get Recent Meals (3 dias), Get Yesterday Intake, Get Weekly Average, Check Workout Day. Queries en seccion 4 nodos 3-6.
3. BUILD PROMPT: template diario con recentMeals, yesterdayIntake, weeklyAvg, isWeekend, hasWorkout. Codigo en nodo 7.
4. OPENAI: temperature 0.85, max_tokens 2048.
5. PARSE: validar 1 dia (meals array, min 3). Codigo en nodo 9.
6. DEACTIVATE: solo mismo plan_date.
7. SAVE: con plan_date, sin week_number/expires_at.
8. FORMAT: un solo dia.

Importa, commit.

--- CHECKPOINT FASE 5 (5 validaciones) ---

V1 — Workflow importado: ~12 nodos, activo

V2 — Nodos de contexto: Recent Meals, Yesterday Intake, Weekly Average, Workout Day — todos presentes

V3 — OpenAI: temperature ~0.85, max_tokens ~2048

V4 — SQL usa plan_date (no week_number) en INSERT

V5 — E2E: Ejecutar con { userId: <real>, planDate: "<manana>" }. Verificar que genera plan de 1 dia con 3+ comidas, se guarda con plan_date correcto en meal_plans. Limpiar despues.

Reporta: "CHECKPOINT FASE 5: X/5 pasaron"
```

---

## Fase 6: Daily Plan Generator Cron

### Prompt:

```
Lee: docs/n8n-flows.md seccion 4.1

Crea n8n/workflows/15-daily-plan-generator-cron.json:
Cron 0 21 * * * America/Bogota. Query LEFT JOIN usuarios sin plan manana. Loop ejecuta Meal Plan Generator. UPSERT daily_targets. Wait 1s. continueOnFail: true.

Importa, activa, CLAUDE.md, commit.

--- CHECKPOINT FASE 6 (4 validaciones) ---

V1 — Workflow activo en n8n

V2 — Cron: 0 21 * * *, timezone America/Bogota

V3 — Query tiene LEFT JOIN + WHERE mp.id IS NULL

V4 — E2E: Ejecutar manualmente. Si hay usuarios activos: genera plan(es) para manana. Si no hay: termina sin error. Verificar:
docker compose exec postgres psql -U fitai -d fitai_db -c "SELECT user_id,plan_date,total_calories FROM meal_plans WHERE plan_date=CURRENT_DATE+1;"

Reporta: "CHECKPOINT FASE 6: X/4 pasaron"
```

---

## Fase 7: 5 Workflows Proactivos

### Prompt:

```
Lee: docs/n8n-flows.md secciones 5, 13, 14, 15, 16

Crear/actualizar:
1. 05-meal-reminder-scheduler.json → v2: cron */15 7-21, jsonb_array_elements, balance dia, dedup meal_reminder
2. 16-morning-briefing.json: cron */30 5-9, wake_up_time ±15min, dedup morning_briefing
3. 17-evening-checkin.json: cron 0 20-22, resumen o casual, dedup evening_checkin
4. 18-weekly-report.json: cron 0 10 * * 0, LATERAL JOINs, dedup weekly_report
5. 19-silence-detector.json: cron 0 18, 24-72h, dedup silence_check

TODOS: America/Bogota, appendAttribution:false, continueOnFail:true, alwaysOutputData:true.

Importa, activa, CLAUDE.md, project-status.md, commit.

--- CHECKPOINT FASE 7 (8 validaciones) ---

V1 — 5 workflows activos en n8n

V2 — Crons correctos:
- Meal Reminder: */15 7-21 * * *
- Morning Briefing: */30 5-9 * * *
- Evening Check-in: 0 20-22 * * *
- Weekly Report: 0 10 * * 0
- Silence Detector: 0 18 * * *
Todos America/Bogota

V3 — appendAttribution: false en todos los nodos Telegram (0 nodos con true)

V4 — Dedup: cada query tiene NOT EXISTS con conversation_logs y message_type correcto

V5 — E2E Meal Reminder: ejecutar. Si hay comida proxima: se envia con balance. Segunda ejecucion: no duplica.

V6 — E2E Morning Briefing: ejecutar. Verifica mensaje + dedup.

V7 — E2E Evening Check-in: ejecutar. Con datos: resumen. Sin datos: casual. Dedup funciona.

V8 — E2E Silence Detector: verificar query de silenciosos (24-72h). Si hay, enviar. No duplicar.

Reporta: "CHECKPOINT FASE 7: X/8 pasaron"
```

---

## Fase 8: Test E2E Final

### Prompt:

```
Validacion final del sistema v2 completo. Ejecuta TODO:

--- A: INFRAESTRUCTURA (3 tests) ---

A1 — Tablas: SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','memberships','user_profiles','goals','meal_plans','exercise_plans','weight_logs','conversation_logs','daily_targets','daily_intake_logs','admin_users','message_buffer');
ESPERADO: 12 tablas

A2 — Workflows activos: listar todos
ESPERADO: 16+

A3 — Docker: docker compose ps
ESPERADO: postgres, redis, qdrant, n8n, admin-panel, nginx — todos Up/healthy

--- B: FLUJO PRINCIPAL (4 tests) ---

B1 — Handler routing: enviar "hola" con usuario activo. Verificar: Handler → membership OK → onboarding OK → Main Agent → respuesta Telegram.

B2 — Contexto v2: en ejecucion de B1, verificar que Build Context genera dailyStatus, weeklyTrend, nextAction.

B3 — Log food E2E: enviar "Desayune 3 huevos con arepa y cafe". Verificar: agente invoca log_food_intake → registro en daily_intake_logs → actualiza daily_targets → respuesta con balance ("Llevas X de Y kcal").

B4 — Daily status E2E: enviar "como voy hoy?". Verificar: respuesta muestra calorias consumidas vs meta.

--- C: PLANES (2 tests) ---

C1 — Plan diario: enviar "generame el plan de manana". Verificar: plan de 1 dia, 3+ comidas, guardado con plan_date.

C2 — Estructura correcta: SELECT plan_date, total_calories, jsonb_array_length(plan_json::jsonb->'meals') FROM meal_plans WHERE is_active=true ORDER BY generated_at DESC LIMIT 3;

--- D: PROACTIVOS (6 tests) ---

D1 — Daily Plan Cron: ejecutar. Genera planes para usuarios sin plan manana.
D2 — Morning Briefing: ejecutar. Mensaje con plan + meta. Sin duplicados.
D3 — Meal Reminder v2: ejecutar. Comida + balance. Sin duplicados.
D4 — Evening Check-in: ejecutar. Resumen o casual segun datos.
D5 — Silence Detector: ejecutar. Mensaje a silenciosos 24-72h.
D6 — Weekly Report: ejecutar. Metricas completas.

--- E: CIERRE (4 tests) ---

E1 — Exportar todos los workflows JSON al repo.
E2 — CLAUDE.md tiene todos los IDs nuevos (7 workflows nuevos).
E3 — project-status.md actualizado.
E4 — Commit final: "v2: implementacion completa — 16+ workflows activos, tracking diario, coach proactivo"

--- REPORTE FINAL ---

REPORTE DE IMPLEMENTACION v2
============================
Fecha: [fecha]
Workflows activos: [numero]

Seccion A (Infraestructura): [X/3]
Seccion B (Flujo principal): [X/4]
Seccion C (Planes): [X/2]
Seccion D (Proactivos): [X/6]
Seccion E (Cierre): [X/4]

TOTAL: [X/19]

ISSUES: [listar]
SKIPS: [tests sin usuario de prueba]
```

---

## Notas de Ejecucion

### Credenciales (NO crear nuevas):
FitAI PostgreSQL, FitAI Telegram Bot, FitAI OpenAI, FitAI Redis, Qdrant account Fitia

### Rollback:
- SQL tiene IF NOT EXISTS → re-ejecutable
- Workflows → reimportar JSON
- v1 → git checkout HEAD~1 -- n8n/workflows/XX.json
