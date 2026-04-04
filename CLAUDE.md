# FitAI Assistant — Instrucciones para Claude Code

## Descripción del Proyecto

**FitAI Assistant** es un asistente personal de salud y fitness por suscripción mensual que opera en Telegram. Ayuda a los usuarios a perder o ganar peso, mejorar su alimentación y construir rutinas de ejercicio mediante conversaciones naturales con un agente de IA.

El sistema tiene dos partes:
1. **Bot de Telegram** — cara al usuario final, impulsado por agentes de OpenAI (GPT-4o) dentro de n8n
2. **Panel de administración web** — cara interna (Express + EJS), para gestionar usuarios, membresías y pagos

---

## Separación Crítica de Roles

| Rol | Tecnología | Contexto |
|-----|-----------|----------|
| **LLM en producción** | OpenAI GPT-4o | Corre dentro de nodos AI Agent de n8n. Genera respuestas para los usuarios en Telegram. |
| **Herramienta de desarrollo** | Claude Code | Genera código, documentación, workflows. NUNCA interactúa con usuarios finales en producción. |

**NUNCA confundir estos roles.** Claude Code no reemplaza a OpenAI en producción. OpenAI no se usa para tareas de desarrollo.

---

## Stack Tecnológico

| Componente | Tecnología | Versión Recomendada |
|-----------|-----------|-------------------|
| Agentes de IA (runtime) | OpenAI API (GPT-4o) | Última estable |
| Embeddings | OpenAI text-embedding-3-small | Última estable |
| Orquestación | n8n self-hosted | 2.11.3 (standalone Docker, SQLite) |
| Canal | Telegram Bot API | v6+ |
| Base de datos | PostgreSQL | 16 |
| Caché | Redis | 7 |
| Vector store | Qdrant | 1.7+ |
| Panel admin | Express + EJS | Express 4.x, EJS 3.x |
| Infraestructura | Docker Compose | 2.x |
| Reverse proxy | Nginx | 1.25+ |
| OS servidor | Ubuntu | 22.04 LTS |

---

## Estructura del Proyecto

```
asistente-nutrition-fitness/
├── CLAUDE.md                    # Este archivo — instrucciones para Claude Code
├── README.md                    # Documentación pública del proyecto
├── .mcp.json                    # Configuración de MCPs para Claude Code
├── .env.example                 # Variables de entorno (plantilla)
├── docker-compose.yml           # Stack completo de servicios
├── infra/
│   └── nginx.conf               # Configuración de Nginx reverse proxy
├── docs/
│   ├── architecture.md          # Arquitectura técnica con diagramas
│   ├── data-models.md           # Modelos de datos, SQL, ER, JSONs de ejemplo
│   ├── n8n-flows.md             # Documentación de los 10 workflows de n8n
│   ├── api-integrations.md      # Integraciones externas (Telegram, OpenAI, Qdrant, etc.)
│   ├── admin-panel.md           # Documentación del panel de administración
│   ├── deployment.md            # Guía de despliegue en VPS
│   └── project-status.md        # Estado actual y próximos pasos
├── skills/
│   ├── dev/                     # Skills de DESARROLLO — uso exclusivo de Claude Code
│   │   ├── n8n-workflow-debugging.md  # Debugging de workflows n8n: causas raíz + checklist
│   │   └── n8n-ai-agent-tools.md     # Patrones AI Agent + toolWorkflow: fields.values, $fromAI
│   └── business/                # Skills de NEGOCIO — base de conocimiento del agente OpenAI
│       ├── nutrition.md         # Nutrición: fórmulas, macros, restricciones, alertas
│       ├── fitness.md           # Fitness: principios, rutinas completas, recuperación
│       ├── habit-psychology.md  # Psicología del hábito: coaching, meseta, motivación
│       └── metrics-calculation.md # Métricas: 9 funciones JS (BMI, TMB, progreso, etc.)
├── prompts/
│   ├── system-prompt.md         # System prompt del agente OpenAI
│   ├── onboarding.md            # Flujo completo de onboarding
│   ├── meal-plan-generation.md  # Templates de generación de planes de comidas
│   └── workout-plan-generation.md # Templates de generación de rutinas
├── n8n/
│   └── workflows/
│       └── README.md            # Guía de workflows de n8n
├── admin-panel/
│   └── README.md                # Instrucciones del panel admin
└── src/
    └── bot/
        └── handlers/
            └── README.md        # Descripción de handlers del bot
```

---

## Comandos Frecuentes de Desarrollo

### Setup Inicial Completo

```bash
# 1. Clonar el repositorio
git clone <repo-url> asistente-nutrition-fitness
cd asistente-nutrition-fitness

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con los valores reales

# 3. Levantar todos los servicios
docker compose up -d

# 4. Verificar que todos los servicios están corriendo
docker compose ps

# 5. Acceder a n8n para configuración inicial
# Abrir http://localhost:5678 en el navegador
```

### Iniciar n8n en Local

```bash
# Levantar solo n8n con sus dependencias
docker compose up -d n8n postgres redis qdrant

# Ver logs de n8n
docker compose logs -f n8n

# Reiniciar n8n después de cambios
docker compose restart n8n
```

### Sincronizar Workflows n8n → Repositorio

**REGLA: Después de cualquier cambio en un workflow de n8n, sincronizar al repo inmediatamente.**

```python
# Exportar un workflow específico al repo (usar su ID y filename correspondiente)
import urllib.request, json

API_KEY = "..."  # N8N_API_KEY del .env
WF_ID = "fI5u4rs3iXPfeXFl"
FILENAME = "n8n/workflows/01-telegram-webhook-handler.json"

req = urllib.request.Request(f"http://localhost:5678/api/v1/workflows/{WF_ID}",
    headers={"X-N8N-API-KEY": API_KEY})
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read())
with open(FILENAME, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
```

Mapa de IDs → archivos del repo:
| Workflow ID | Archivo |
|-------------|---------|
| `fI5u4rs3iXPfeXFl` | `n8n/workflows/01-telegram-webhook-handler.json` |
| `CCkMv75zwDDoj513` | `n8n/workflows/02-process-text-message.json` |
| `Gr7BeeNHBx6ZtQGS` | `n8n/workflows/02-main-ai-agent.json` |
| `yiUgnJ6gCoaIFVXe` | `n8n/workflows/03-onboarding-flow.json` |
| `KQhP9lQNxCKeOsbJ` | `n8n/workflows/04-meal-plan-generator.json` |
| `SntGuE97yl9efvo5` | `n8n/workflows/05-meal-reminder-scheduler.json` |
| `tkSAHhjJnO4nTFsM` | `n8n/workflows/06-weight-update-requester.json` |
| `bhJ8qqZXr68Id3pH` | `n8n/workflows/07-progress-calculator.json` |
| `ETjiYAUhXfsVSyWQ` | `n8n/workflows/08-workout-plan-generator.json` |
| `vAqqjXg2IE1ldgg3` | `n8n/workflows/09-rag-personal-indexer.json` |
| `I4Q4C6SOPY2fnK3W` | `n8n/workflows/10-membership-alert.json` |
| `3uXT5ld76uIUCENn` | `n8n/workflows/11-knowledge-base-indexer.json` |
| `DQsnzXQWMSqJxigL` | `n8n/workflows/13-log-food-intake.json` |
| `J2y4wKYEugHe4Mkg` | `n8n/workflows/14-get-daily-status.json` |
| `xILhDSQy0ZP40jjt` | `n8n/workflows/15-daily-plan-generator-cron.json` |
| `NFhsChTrhIc05uyc` | `n8n/workflows/16-morning-briefing.json` |
| `ErIUGcIkS5Rim65L` | `n8n/workflows/17-evening-checkin.json` |
| `gsIQcXRlMznc3uJ8` | `n8n/workflows/18-weekly-report.json` |
| `ytuz6H8cdBm8oyTx` | `n8n/workflows/19-silence-detector.json` |

### Importar/Exportar Workflows de n8n (CLI)

```bash
# Exportar todos los workflows
docker compose exec n8n n8n export:workflow --all --output=/home/node/backups/workflows.json

# Importar workflows desde archivo
docker compose exec n8n n8n import:workflow --input=/home/node/backups/workflows.json

# Exportar credenciales (para backup, no compartir)
docker compose exec n8n n8n export:credentials --all --output=/home/node/backups/credentials.json
```

### Migraciones de Base de Datos

```bash
# Conectar a PostgreSQL
docker compose exec postgres psql -U fitai -d fitai_db

# Ejecutar un archivo de migración
docker compose exec -T postgres psql -U fitai -d fitai_db < migrations/001_initial_schema.sql

# Verificar estado de las tablas
docker compose exec postgres psql -U fitai -d fitai_db -c "\dt"
```

### Indexar Documentos en Qdrant

```bash
# Verificar que Qdrant está corriendo
curl http://localhost:6333/collections

# Crear colecciones (ejecutar una vez)
curl -X PUT http://localhost:6333/collections/knowledge_rag \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": { "size": 1536, "distance": "Cosine" }
  }'

curl -X PUT http://localhost:6333/collections/user_rag \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": { "size": 1536, "distance": "Cosine" }
  }'
```

### Deploy a Producción

```bash
# En el servidor VPS
cd /opt/fitai

# Pull de cambios
git pull origin main

# Rebuild y restart
docker compose pull
docker compose up -d --build

# Verificar estado
docker compose ps
docker compose logs --tail=50
```

---

## Configuración de MCPs

Los MCPs (Model Context Protocols) permiten a Claude Code interactuar directamente con los servicios del proyecto. La configuración está en `.mcp.json` en la raíz del proyecto.

### n8n-mcp

Permite crear, editar y ejecutar workflows de n8n sin abrir la UI:

```bash
# Listar workflows
# → usa n8n-mcp tool: list_workflows

# Crear un workflow nuevo
# → usa n8n-mcp tool: create_workflow con el JSON del workflow

# Activar/desactivar un workflow
# → usa n8n-mcp tool: activate_workflow / deactivate_workflow
```

**Repositorio**: https://github.com/czlonkowski/n8n-mcp

### Filesystem MCP

Permite leer y escribir archivos del proyecto directamente.

### PostgreSQL MCP

Permite ejecutar queries directos a la base de datos durante el desarrollo:

```bash
# Consultar usuarios
# → usa postgres MCP: query "SELECT * FROM users LIMIT 10"

# Ver estructura de una tabla
# → usa postgres MCP: query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'"
```

---

## Uso del Skill Repository de n8n

El repositorio https://github.com/czlonkowski/n8n-skills contiene patrones y skills reutilizables para n8n. Para usarlos:

1. Revisar los templates disponibles en el repositorio
2. Identificar patrones aplicables (AI Agent, Telegram bot, scheduled tasks)
3. Adaptar los templates a las necesidades de FitAI
4. Importar en n8n via la UI o via n8n-mcp

---

## Convenciones del Proyecto

### Naming de Archivos
- Documentación: `kebab-case.md` (ej: `data-models.md`)
- Código fuente: `camelCase.js` o `kebab-case.js` según contexto
- Variables de entorno: `UPPER_SNAKE_CASE`

### Estructura de Workflows de n8n
- Prefijo: `FitAI - ` seguido del nombre descriptivo
- Los 12 workflows del sistema:
  1. `FitAI - Telegram Webhook Handler` — punto de entrada, enruta texto/voz/callbacks
  2. `FitAI - Process text message` — subprocess de debounce multi-mensaje (PostgreSQL)
  3. `FitAI - Main AI Agent` — agente OpenAI con tools, integrado en el handler
  4. `FitAI - Onboarding Flow` — sub-workflow de onboarding, integrado en el handler
  5. `FitAI - Meal Plan Generator` — tool llamada por el AI Agent
  6. `FitAI - Workout Plan Generator` — tool llamada por el AI Agent
  7. `FitAI - Progress Calculator` — tool llamada por el AI Agent
  8. `FitAI - RAG Personal Indexer` — indexación de datos del usuario en Qdrant
  9. `FitAI - Knowledge Base Indexer` — indexación del knowledge base en Qdrant
  10. `FitAI - Meal Reminder Scheduler` — cron diario
  11. `FitAI - Weight Update Requester` — cron semanal
  12. `FitAI - Membership Alert` — cron de alertas de membresía

### Variables de Entorno
- Nunca hardcodear credenciales en el código
- Todas las keys van en `.env`
- Las credenciales de n8n se configuran dentro de n8n, separadas del código
- Usar `.env.example` como referencia (sin valores reales)

---

## Flujo de Trabajo Recomendado

### Desarrollo con Claude Code + n8n

1. **Diseñar** el workflow en `docs/n8n-flows.md` primero
2. **Crear** el workflow usando n8n-mcp o la public API de n8n
3. **Configurar** credenciales en la UI de n8n (las credenciales no se pueden crear via MCP)
4. **Probar** el workflow en n8n (modo manual o webhook de prueba)
5. **Iterar** modificaciones via public API con el ciclo correcto (ver abajo)
6. **Exportar** el workflow final y guardarlo en `n8n/workflows/`

### Ciclo obligatorio para actualizar un workflow activo con webhook

Un simple PUT/PATCH no actualiza el handler en ejecución. Siempre usar este ciclo:

```python
import urllib.request, json, time

BASE = "http://localhost:5678"
API_KEY = "..."  # X-N8N-API-KEY

def api(method, path, body=None):
    data = json.dumps(body, ensure_ascii=False).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers={"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def update_workflow(wf_id, modified_nodes, modified_connections):
    wf = api("GET", f"/api/v1/workflows/{wf_id}")
    # ⚠️ SOLO estas 4 claves. Cualquier clave extra causa HTTP 400.
    payload = {
        "name": wf["name"],
        "nodes": modified_nodes,
        "connections": modified_connections,
        "settings": wf.get("settings") or {"executionOrder": "v1"}
    }
    api("POST", f"/api/v1/workflows/{wf_id}/deactivate", {})
    result = api("PUT", f"/api/v1/workflows/{wf_id}", payload)
    time.sleep(1)
    api("POST", f"/api/v1/workflows/{wf_id}/activate", {})
    return result
```

### Desarrollo del Panel Admin

1. Escribir el código en `admin-panel/`
2. Probar localmente con `docker compose up admin-panel`
3. Verificar la conexión con PostgreSQL
4. Probar flujos CRUD completos

---

## Skills — Cuándo y Cómo Usarlas

Los skills están divididos en dos categorías con propósitos distintos. **Claude Code DEBE leer el skill correspondiente antes de ejecutar cada tipo de tarea.**

### Skills de Desarrollo — `skills/dev/`

Uso exclusivo de Claude Code durante el desarrollo. No llegan al agente OpenAI en producción.

| Skill | Cuándo leerlo OBLIGATORIAMENTE |
|-------|-------------------------------|
| [`skills/dev/n8n-workflow-debugging.md`](skills/dev/n8n-workflow-debugging.md) | Antes de modificar cualquier workflow de n8n. Antes de diagnosticar un error en una ejecución. Antes de cambiar la forma en que se actualiza un workflow activo. |
| [`skills/dev/n8n-ai-agent-tools.md`](skills/dev/n8n-ai-agent-tools.md) | Antes de crear o modificar nodos `toolWorkflow`. Antes de cambiar cómo el AI Agent pasa datos a sub-workflows. Antes de configurar `fields.values` o `$fromAI()`. |

**Regla:** Si vas a tocar n8n y no has leído el skill correspondiente en esta sesión, léelo primero.

---

### Skills de Negocio — `skills/business/`

Base de conocimiento del dominio. Son los documentos que el agente OpenAI en producción usa para generar respuestas correctas. Claude Code los usa para:
- Generar o revisar prompts del sistema
- Diseñar flujos de onboarding
- Validar que los planes generados son coherentes con las reglas del negocio
- Indexar en Qdrant (`knowledge_rag`) para RAG

| Skill | Cuándo usarlo |
|-------|--------------|
| [`skills/business/nutrition.md`](skills/business/nutrition.md) | Al escribir o revisar prompts de planes de comidas. Al validar cálculos calóricos. Al diseñar el onboarding nutricional. Al indexar en Qdrant. |
| [`skills/business/fitness.md`](skills/business/fitness.md) | Al escribir o revisar prompts de rutinas de ejercicio. Al validar que las rutinas generadas sean seguras y coherentes con el nivel del usuario. |
| [`skills/business/habit-psychology.md`](skills/business/habit-psychology.md) | Al diseñar mensajes de motivación, recordatorios y respuestas ante abandono. Al revisar el tono del system prompt. |
| [`skills/business/metrics-calculation.md`](skills/business/metrics-calculation.md) | Al implementar o revisar el nodo de cálculo de progreso. Al validar fórmulas de BMI, TMB, deficit calórico y proyecciones de peso. |

**Regla:** Antes de generar un plan de comidas, rutina o respuesta sobre progreso, leer el skill de negocio correspondiente para garantizar coherencia con las reglas del dominio.

---

## Patrones Críticos de n8n (Lecciones Aprendidas)

Antes de modificar cualquier workflow, consultar `skills/n8n-workflow-debugging.md` y `skills/n8n-ai-agent-tools.md`. Resumen de los puntos más críticos:

### toolWorkflow — inyección de contexto
Para pasar `userId`, `chatId` u otro contexto del developer a sub-workflows, usar **typeVersion 1.3** con `fields.values`:
```json
{ "name": "userId", "type": "numberValue", "numberValue": "={{ $('Check User & Membership').item.json.user_id }}" }
```
**NO** usar `workflowInputs.schema` de typeVersion 2 para esto.

**REGLA CRÍTICA — `$fromAI()` en `fields.values` rompe el tool schema:**
Agregar un campo con `$fromAI()` en `fields.values` hace que n8n exponga múltiples parámetros en el schema del tool. GPT-4o pasa un objeto estructurado en `input` en lugar de un string, causando: `"Expected string, received object → at input"`.

`fields.values` debe contener SOLO valores estáticos (userId, chatId). Todo lo que GPT-4o deba decidir va dentro del JSON del campo `query`, documentado en la `description` del tool:
```
description: "...Pasa como JSON: {\"food_name\": \"...\", \"log_date\": \"YYYY-MM-DD\", ...}"
```

### $json apunta al nodo ANTERIOR directo
Si la cadena es `ParsePlan → UpdateSQL → SavePlan`, en `SavePlan` el `$json` es el output del UPDATE (vacío), no del ParsePlan. Siempre referenciar el nodo explícitamente: `$('Parse and Validate Plan').first().json.weekNumber`

### Nodo SQL con 0 filas detiene el flujo silenciosamente
Activar `"alwaysOutputData": true` en cualquier nodo Postgres SELECT que pueda retornar 0 filas cuando los 0 resultados son un caso válido (ej: "Get Previous Plan" para usuarios nuevos).

### IF node — comparar strings, no booleans
Usar typeVersion 2 del IF node. Retornar `'true'`/`'false'` como strings desde SQL y comparar con `string equals "true"`. El typeVersion 1 con boolean causa errores de tipo.

### n8n standalone (no docker-compose)
El contenedor `n8n` es standalone — **no** está en `docker-compose.yml`. No puede resolver hostnames de `fitai-network`. Siempre usar `host.docker.internal` para conectarse a PostgreSQL, Redis y Qdrant desde n8n.

### Convergencia voz + texto — nodo `Set User Context`
El handler tiene dos paths para obtener el texto del usuario:
- **Texto/callback**: `Call process text message` (subprocess con debounce) → `Set User Context`
- **Voz**: `Transcribe Voice` → `Set Text from Voice` → `Set User Context`

Ambos paths convergen en `Set User Context` (Set node). **Todos los nodos downstream deben referenciar `$('Set User Context').item.json.*`** para obtener `message.text`, `chatId`, `telegramId`, `firstName`. Nunca referenciar `$('Call process text message').item.json.*` — ese nodo no existe en el path de voz.

**Estructura real del output de Set User Context:** El campo se llama `message.text` en el Set node, lo que crea un objeto anidado. El acceso correcto es `json.message.text`, NO `json.text`:
```javascript
// CORRECTO
$('Set User Context').first().json.message.text  // 'texto del usuario'
$('Set User Context').first().json.chatId        // '1435522255'

// INCORRECTO — undefined
$('Set User Context').first().json.text
```

**Nodos post-respuesta (lejanos en la cadena) deben usar `.first()`, no `.item()`:**
En nodos que corren después de `Send Response` (Log Conversation, Build RAG Payload), `.item.json` no resuelve correctamente para nodos upstream lejanos. Usar `.first().json` para cualquier nodo que no sea el padre directo.

### Debounce multi-mensaje — subprocess `FitAI - Process text message`
El handler delega el texto a `CCkMv75zwDDoj513` via `executeWorkflow`. Este subprocess:
1. Escribe el texto en la tabla `message_buffer` (PostgreSQL) con `INSERT ... ON CONFLICT ... GREATEST(last_ts)`
2. Espera 2 segundos (Wait node)
3. Intenta DELETE atómico (`WHERE chat_id=$1 AND last_ts=$2`)
4. **IF "Is Last Writer?"**: si el DELETE retornó texto → continuar; si retornó `{success:'True'}` (0 filas) → stop limpio

La tabla requiere `migrations/005_message_buffer.sql`. Ver `skills/dev/n8n-workflow-debugging.md` sección 11.

### Timezone — siempre usar America/Bogota
n8n tiene `GENERIC_TIMEZONE=America/Bogota`. En Code nodes:
```javascript
// CORRECTO — fecha en hora Colombia
new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// INCORRECTO — siempre UTC, no sirve para fechas locales
new Date().toISOString()
```

En **queries SQL de PostgreSQL**, `CURRENT_DATE` retorna la fecha UTC del servidor. Entre las 19:00 y 23:59 hora Colombia (00:00-04:59 UTC del día siguiente), un registro hecho "hoy en Colombia" se guarda con la fecha de "mañana UTC". Usar siempre:
```sql
-- CORRECTO — fecha actual en Colombia
(NOW() AT TIME ZONE 'America/Bogota')::date

-- CORRECTO — mañana en Colombia (ej: Daily Plan Cron que corre a las 9pm)
(NOW() AT TIME ZONE 'America/Bogota')::date + 1

-- INCORRECTO — fecha UTC, puede ser un día adelante respecto a Colombia
CURRENT_DATE

-- INCORRECTO — aplicar AT TIME ZONE a DATE (no a timestamptz)
-- Esto interpreta la fecha como medianoche UTC → da ayer Colombia
CURRENT_DATE AT TIME ZONE 'America/Bogota'

-- INCORRECTO — parecía fix pero falla a las 9pm Colombia
-- A esa hora CURRENT_DATE UTC ya es mañana Colombia → +1 da pasado mañana
CURRENT_DATE + 1
```
El Daily Plan Generator Cron corre a las 9pm Colombia (2am UTC del día siguiente). `CURRENT_DATE + 1` a esa hora daría "pasado mañana Colombia" en vez de "mañana Colombia". `(NOW() AT TIME ZONE 'America/Bogota')::date + 1` siempre da correctamente "mañana Colombia".

Aplica a: `log_date` en INSERTs de `daily_intake_logs`, `target_date` en `daily_targets`, `plan_date` en `meal_plans`, y todos los filtros `WHERE ... = CURRENT_DATE` en los workflows de contexto (Load Daily Status, Load Today Meals, Load Today Plan, Get Daily Targets, Get Today Meals, Get Today Plan) y proactivos (Morning Briefing, Evening Check-in, Meal Reminder, Silence Detector, Weekly Report, Daily Plan Cron).

### RAG — estado actual y flujo de indexación automática

**Colecciones:**
- `knowledge_rag`: 106 puntos (4 skills de business indexados)
- `user_rag`: conversaciones y eventos del usuario — indexados **automáticamente** después de cada respuesta

**Flujo automático post-conversación (handler, post Send Response):**
```
FitAI Main AI Agent → Send Response
                           ↓
              Log Conversation (Postgres → conversation_logs)
                           ↓
              Build RAG Payload (Code → {userId, query: JSON con eventType:'conversation'})
                           ↓
              Trigger RAG Indexer (executeWorkflow async → vAqqjXg2IE1ldgg3)
```
Este chain se dispara automáticamente en cada conversación. El RAG Indexer clasifica el `eventType` (`conversation`, `meal_reported`, `weight_log`, `goal_set`) y upserta en Qdrant con el texto apropiado.

**Tool: Registrar Evento** sigue existiendo como complemento — el agente puede forzar indexado de algo específico, pero ya NO es el único mecanismo.

**Requisitos de infraestructura:**
- Requiere **Qdrant ≥ 1.10.0** — `@langchain/qdrant@1.0.1` usa `POST /points/query` (no existe en ≤1.7.4)
- Docker image: `qdrant/qdrant:v1.13.0`
- `embeddingsOpenAi` typeVersion: **1** (no 1.2), `model` como string plana `"text-embedding-3-small"`

### AI Agent systemMessage — expresiones dinámicas REQUIEREN prefijo `=`
El campo `options.systemMessage` del nodo AI Agent trata su contenido como **string estático** a menos que tenga el prefijo `=`. Sin ese prefijo, cualquier `{{variable}}` llega literal a GPT-4o.

**Patrón correcto (v2):** construir el system prompt completo (reglas estáticas + contexto dinámico) en el nodo **Build Context** como `fullSystemPrompt`, y referenciarlo así en el AI Agent:
```json
"options": { "systemMessage": "={{ $json.fullSystemPrompt }}" }
```
El nodo Build Context retorna `fullSystemPrompt` como string que concatena las reglas de comportamiento con el bloque `CONTEXTO DEL USUARIO ACTUAL` (con números reales: `caloric_target`, `protein_target_g`, `tdee`, `bmr`, etc.).

**NUNCA** usar `{{variable}}` directamente en `systemMessage` sin el `=` — no se evalúa.

### Merge node fan-out — N ramas paralelas ejecuta downstream N veces
Cuando un nodo abanica a N ramas paralelas que convergen en un Merge, el Merge con config incorrecta dispara el downstream una vez por cada input. Fix:
1. `mode: "append"`, `numberInputs: N` (sin config adicional — no usar `combine`/`mergeByPosition`)
2. Agregar Code node "Collapse to One Item" después: `return [{ json: { done: true } }];` con `mode: runOnceForAllItems`

### PostgreSQL — array literal format para parámetros `text[]`
`JSON.stringify([])` produce `"[]"` — inválido para `text[]`. Usar formato `{}`:
```javascript
// Correcto:
'{' + (arr||[]).map(v => '"' + String(v).replace(/"/g,'\\"') + '"').join(',') + '}'
// Para escalar → text[]:
val ? '{"' + String(val) + '"}' : '{}'
```

### PostgreSQL — auditar schema antes de escribir SQL
Antes de cualquier INSERT/UPDATE en tabla nueva: `\d tablename` (columnas exactas) y listar enums. `ON CONFLICT (col)` requiere UNIQUE CONSTRAINT — un índice simple no sirve. Para tablas sin unique constraint en user_id (ej: `goals`), usar DELETE + INSERT.

### memoryBufferWindow — memoria in-RAM, se pierde en restart
El nodo `FitAI Memory` (`memoryBufferWindow`, typeVersion 1.3) almacena el historial de conversaciones **en RAM** del proceso n8n. No persiste en SQLite, Redis ni ninguna base de datos.

Consecuencias:
- La memoria se borra al reiniciar n8n (todos los usuarios)
- No hay forma de limpiar la memoria de un usuario específico sin reiniciar n8n
- En producción, considerar migrar a `memoryRedisChat` para persistencia y limpieza selectiva por `sessionId`

**Limpiar memoria de todos los usuarios:** `docker restart n8n`

### ⚠️ NOTA DE PRODUCCIÓN — Activar v2 con usuarios existentes
Al desplegar v2 en producción sobre usuarios que ya tienen historial v1, la memoria del agente (in-RAM) tiene el tono y patrones del agente v1. Esto hace que el agente ignore las reglas del nuevo system prompt durante las primeras interacciones.

**Acción requerida al activar v2 en producción:**
```bash
# 1. Reiniciar n8n para limpiar memoria de TODOS los usuarios
docker restart n8n

# 2. Verificar que los 18 workflows siguen activos
# (n8n reactiva automáticamente los workflows marcados como active=true)
```
Ejecutar este restart durante una ventana de bajo tráfico (madrugada). El impacto es que las conversaciones activas perderán contexto de los últimos 10 mensajes — la próxima respuesta del agente arrancará fresco con el nuevo tono.

---

## Usuario de Prueba (E2E real)

Para tests que requieren mensajes reales de Telegram:

| Campo | Valor |
|-------|-------|
| Nombre | Mauro |
| `user_id` (DB) | `212` |
| `telegram_id` / `chat_id` | `1435522255` |

Los usuarios `telegram_id=999999` ("Leandro") y `777001` ("TestFitAI") son ficticios — sin chat real activo.

---

## Reglas de Trabajo con Claude Code

### Investigar antes de probar
Antes de modificar cualquier nodo o workflow para corregir un comportamiento inesperado:
1. Leer el JSON del nodo directamente (`GET /api/v1/workflows/{id}`)
2. Buscar el patrón correcto en `skills/dev/`, documentación oficial de n8n, o internet
3. Entender exactamente qué hace el nodo antes de modificarlo

**Nunca** hacer prueba-y-error sin haber identificado la causa raíz primero.

### Registrar lecciones como skills
Cada vez que se aprende la solución correcta a un problema técnico (especialmente con n8n), inmediatamente:
1. Actualizar el archivo de skill correspondiente en `skills/dev/`
2. Actualizar el checklist en `skills/dev/n8n-workflow-debugging.md`

Sin este registro, las correcciones se pierden al cerrar el contexto.

### Validar todas las combinaciones antes de implementar flujos con estados
Antes de implementar o modificar cualquier flujo con múltiples estados (IF nodes, state machines, routing condicional):

1. Listar **todas** las variables de estado relevantes y sus valores posibles
2. Construir la tabla de combinaciones (2^n para n booleanos)
3. Verificar que **cada combinación** tiene un routing lógico y correcto — incluyendo las que parecen imposibles en el flujo normal
4. Verificar el flujo **post-acción**: ¿qué pasa después de guardar datos? ¿siguen siendo correctas las condiciones?
5. Preguntar explícitamente: ¿puede un usuario llegar a este estado sin haber pasado por el paso previo esperado?

**Por qué:** Se diseñó `phone_pending` como flag y luego como derivado, ambos con fallos porque solo se validó el "camino feliz":
- `phone_pending=true` sin perfil → botón de teléfono sin haber completado el onboarding
- Al guardar perfil siempre pedía teléfono, ignorando que el usuario podría ya tenerlo

### Nunca confirmar sin test
NUNCA declarar una corrección como "funcionando" sin ejecutar primero un test real que lo valide. Anunciar una solución sin probarla es equivalente a no haberla verificado.

---

## Reglas de Seguridad

1. **NUNCA** hardcodear credenciales, tokens o secrets en archivos del repositorio
2. **NUNCA** commitear el archivo `.env` — solo `.env.example`
3. Las credenciales de n8n (OpenAI API key, Telegram token) se configuran dentro de n8n via su UI, separadas del código fuente
4. El panel admin debe estar protegido por autenticación (session + bcrypt)
5. En producción, el panel admin debe estar detrás de Nginx con HTTPS
6. Redis y PostgreSQL no deben exponer puertos al exterior — solo accesibles dentro de la red Docker
7. Qdrant no debe exponer su puerto al exterior en producción
8. Usar `TELEGRAM_WEBHOOK_SECRET` para verificar la autenticidad de los webhooks

---

## Variables de Entorno Requeridas

| Variable | Descripción | Obligatoria |
|----------|------------|-------------|
| `OPENAI_API_KEY` | API key de OpenAI para GPT-4o y embeddings | Sí |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram (obtenido de BotFather) | Sí |
| `TELEGRAM_WEBHOOK_SECRET` | Secret para verificar webhooks de Telegram | Sí |
| `DATABASE_URL` | URL de conexión a PostgreSQL (`postgresql://user:pass@host:5432/db`) | Sí |
| `POSTGRES_USER` | Usuario de PostgreSQL (para Docker) | Sí |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL (para Docker) | Sí |
| `POSTGRES_DB` | Nombre de la base de datos (para Docker) | Sí |
| `REDIS_URL` | URL de conexión a Redis (`redis://host:6379`) | Sí |
| `QDRANT_URL` | URL de Qdrant (`http://host:6333`) | Sí |
| `QDRANT_API_KEY` | API key de Qdrant (si se configura autenticación) | No |
| `N8N_BASE_URL` | URL base de n8n (`http://localhost:5678`) | Sí |
| `N8N_API_KEY` | API key de n8n para acceso programático | Sí |
| `N8N_ENCRYPTION_KEY` | Clave de encriptación de credenciales en n8n | Sí |
| `ADMIN_PANEL_PORT` | Puerto del panel de administración (default: 3000) | No |
| `ADMIN_PANEL_SECRET_KEY` | Secret para sesiones del panel admin | Sí |
| `NODE_ENV` | Entorno de ejecución (`development` / `production`) | No |
| `LOG_LEVEL` | Nivel de logging (`debug` / `info` / `warn` / `error`) | No |
