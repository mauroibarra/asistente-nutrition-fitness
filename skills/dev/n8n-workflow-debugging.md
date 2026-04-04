# Skill: Debugging de Workflows n8n

Guía práctica para diagnosticar y corregir problemas en workflows de n8n, basada en experiencia real con n8n 2.x self-hosted.

---

## Regla #0: Investigar antes de probar

Antes de modificar cualquier nodo o workflow para corregir un comportamiento inesperado:
1. Leer el JSON del nodo directamente (`GET /api/v1/workflows/{id}`)
2. Buscar el patrón correcto en n8n-skills, documentación oficial, o internet
3. Entender exactamente qué hace el nodo antes de modificarlo

**Nunca** hacer prueba-y-error sin haber identificado la causa raíz primero.

---

## 1. Workflow activo no refleja los cambios

**Síntoma:** Se modifica el workflow via REST API pero los webhooks siguen ejecutando la versión anterior.

**Causa:** n8n usa `workflow_publish_history` para saber qué versión corre el execution engine. Un PATCH/PUT solo actualiza el draft en `workflow_entity`.

**Fix — ciclo correcto de actualización:**
```python
import urllib.request, json, time

BASE = "http://localhost:5678"
API_KEY = "..."
WF_ID = "..."
HEADERS = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}

def api(method, path, body=None):
    data = json.dumps(body, ensure_ascii=False).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# 0. Cargar workflow actual
wf = api("GET", f"/api/v1/workflows/{WF_ID}")

# 1. Desactivar
api("POST", f"/api/v1/workflows/{WF_ID}/deactivate", {})

# 2. Guardar cambios — SOLO estas 4 claves. Cualquier clave adicional (staticData,
#    pinData, versionId, etc.) causa 400 "must NOT have additional properties".
payload = {
    "name": wf["name"],
    "nodes": wf["nodes"],          # lista modificada
    "connections": wf["connections"],  # dict modificado
    "settings": wf.get("settings") or {"executionOrder": "v1"}
}
result = api("PUT", f"/api/v1/workflows/{WF_ID}", payload)
print(f"PUT OK — {len(result.get('nodes', []))} nodes")

# 3. Reactivar (crea nueva entrada en workflow_publish_history)
time.sleep(1)
api("POST", f"/api/v1/workflows/{WF_ID}/activate", {})
```

---

## 2. Nodo downstream no se ejecuta (flujo se detiene silenciosamente)

**Síntoma:** La ejecución muestra `status: success` pero el `lastNodeExecuted` es un nodo intermedio. Los nodos siguientes nunca corren.

**Causa:** Un nodo upstream devolvió 0 items (ej: query SQL que no encontró filas). n8n no ejecuta nodos sin items de entrada — y esto no se reporta como error.

**Fix:** Activar `alwaysOutputData: true` en el nodo que puede devolver 0 resultados:
```json
{
  "name": "Get Previous Plan",
  "type": "n8n-nodes-base.postgres",
  "alwaysOutputData": true,
  "parameters": { ... }
}
```

Cuándo usarlo: queries "get previous X" donde el primer run no tiene historial, lookups opcionales, cualquier SELECT que pueda retornar 0 filas en un flujo que debe continuar.

**⚠️ Excepción crítica — `executeQuery` con typeVersion 2.5:** `alwaysOutputData: true` **no funciona** con la operación `executeQuery` del nodo Postgres en typeVersion 2.5. Devuelve `[]` (array vacío real) en lugar de `[{json:{}}]`, y el flujo se detiene igual.

**Fix para `executeQuery` — SQL UNION ALL fallback (solución definitiva):**
Hacer que el SQL siempre devuelva exactamente 1 fila usando un fallback:
```sql
SELECT id, first_name, true::boolean AS found
FROM users
WHERE migration_token = UPPER(TRIM($1))
  AND migration_token_expires_at > NOW()
UNION ALL
SELECT NULL::integer, NULL::text, false::boolean
LIMIT 1
```
- Si hay match: devuelve la fila real con `found = true`
- Si no hay match: devuelve `(NULL, NULL, false)` — 1 fila garantizada
- El IF node verifica `$json.found` (boolean) en lugar de `$json.id exists`

Un Code node normalizador NO resuelve el problema — n8n no lo ejecuta si el upstream entrega `[]`.

---

## 3. $json tiene datos incorrectos / null unexpectedly

**Síntoma:** `$json.weekNumber` es null aunque un nodo anterior sí lo calculó.

**Causa:** En n8n, `$json` siempre apunta al output del nodo inmediatamente anterior en la conexión. Si hay un nodo intermedio (ej: UPDATE SQL que devuelve `{rowCount: 0}`), `$json` en el siguiente nodo es el output de ese UPDATE, no del nodo de parseo.

**Diagnóstico:** Revisar la cadena de conexiones del workflow: A → B → C → D. En D, `$json` es lo que C emitió.

**Fix:** Referenciar explícitamente el nodo correcto:
```javascript
// Mal: $json.weekNumber (si el nodo anterior es un UPDATE)
// Bien:
$('Parse and Validate Plan').first().json.weekNumber
$('Build Workout Prompt').first().json.userId
```

---

## 4. IF node con error de tipo boolean/string

**Síntoma:** `"Wrong type: '' is a string but was expecting a boolean [condition 0, item 0]"`

**Causa:** El IF node typeVersion 1 tiene `options.leftValue: ""` y typeValidation strict. El campo vacío se valida como string cuando el operador espera boolean.

**Fix:** Usar typeVersion 2 del IF node y comparar strings en lugar de booleans:

```json
{
  "typeVersion": 2,
  "parameters": {
    "conditions": {
      "options": { "version": 2, "caseSensitive": true, "typeValidation": "strict" },
      "combinator": "and",
      "conditions": [{
        "id": "c1",
        "operator": { "type": "string", "operation": "equals" },
        "leftValue": "={{ $json.onboarding_completed }}",
        "rightValue": "true"
      }]
    }
  }
}
```

Y en SQL retornar como string:
```sql
CASE WHEN COALESCE(field, false) THEN 'true' ELSE 'false' END as field
```

---

## 5. Leer datos de ejecuciones sin UI

**Via public API** (solo metadatos, sin resultData):
```bash
curl "http://localhost:5678/api/v1/executions?limit=10" -H "X-N8N-API-KEY: {KEY}"
```

**Via SQLite** (datos completos, incluyendo node outputs):
```bash
docker cp n8n:/home/node/.n8n/database.sqlite /tmp/n8n.sqlite
docker cp n8n:/home/node/.n8n/database.sqlite-wal /tmp/n8n.sqlite-wal
docker cp n8n:/home/node/.n8n/database.sqlite-shm /tmp/n8n.sqlite-shm
```

```python
import sqlite3, json, zlib, re

conn = sqlite3.connect('/tmp/n8n.sqlite')
c = conn.cursor()
c.execute('SELECT data FROM execution_data WHERE executionId = {ID}')
row = c.fetchone()
data_raw = row[0]
if isinstance(data_raw, bytes):
    try: data_str = zlib.decompress(data_raw).decode()
    except: data_str = data_raw.decode()
else:
    data_str = data_raw

# Buscar errores o valores específicos
matches = re.findall(r'.{0,30}error.{0,150}', data_str, re.IGNORECASE)
```

Nota: n8n usa un formato JSON indexado donde las referencias son strings con índices (`"42"` = referencia a `obj[42]`).

---

## 6. Nodo "Install this node to use it"

**Causa:** El tipo de nodo no está disponible en la instalación de n8n. Común con `n8n-nodes-base.openAi` v1.8 en n8n 2.x.

**Fix para AI/embeddings:** Usar nodos LangChain nativos que siempre están disponibles:
- Embeddings: `@n8n/n8n-nodes-langchain.embeddingsOpenAi`
- Vector store: `@n8n/n8n-nodes-langchain.vectorStoreQdrant`
- Document loader: `@n8n/n8n-nodes-langchain.documentDefaultDataLoader`

---

## 7. Credenciales con valores en blanco

**Síntoma:** Workflow activo pero el nodo no hace nada (sin error visible).

**Causa:** Las credenciales creadas via API tienen `accessToken = __n8n_BLANK_VALUE_...`. Si el token real está en blanco, el nodo no ejecuta acciones externas (ej: telegramTrigger no registra webhook).

**Diagnóstico:** Verificar via UI de n8n o via query a `credentials_entity` en SQLite.

**Fix:** Siempre configurar credenciales via la UI de n8n, no via API.

---

## 8. Split In Batches sin loop-back — flujo silencioso

**Síntoma:** `lastNodeExecuted: "Split In Batches"`, los nodos downstream nunca se ejecutan. En los datos de ejecución: `output[0]: None`, `output[1]: N items`.

**Causa:** `splitInBatches` tiene dos outputs:
- `output[0]` (loop): batch actual a procesar
- `output[1]` (done): se dispara cuando terminan todos los batches

Sin conexión de loop-back desde el último nodo → Split In Batches, el nodo pone todos los items en output[1] ("done") que no está conectado a nada. El flujo se detiene silenciosamente.

**Fix A — Loop-back completo:**
```
Get Members → Split In Batches → Process → IF → [true] Send → Split In Batches (loop)
                                                 [false] → Split In Batches (loop)
```

**Fix B — Eliminar Split In Batches (recomendado para Telegram bots):**
```
Get Members → Process → IF → Send
```
n8n procesa múltiples items automáticamente. Solo usar `splitInBatches` cuando se necesita control real de batch size (ej: rate limits externos estrictos).

---

## 9. IF node typeVersion 2 con Date de PostgreSQL y typeValidation strict

**Síntoma:** `Wrong type: 'Thu Mar 26 2026...' is an object but was expecting a string [condition N, item 0]`

**Causa:** Un campo fecha de PostgreSQL (ej: `logged_at`) viene como string tipo Date. Una condición de tipo `string` con `typeValidation: "strict"` no puede coercionarlo.

**Fix:** Cambiar `conditions.options.typeValidation` de `"strict"` a `"loose"`:
```json
{
  "conditions": {
    "options": {
      "caseSensitive": true,
      "typeValidation": "loose"
    }
  }
}
```

---

## 10. httpRequest typeVersion 4.2 — configuración correcta para body JSON

**Síntoma:** OpenAI responde `"you must provide a model parameter"` aunque el body parece correcto. O el body llega vacío al endpoint externo.

**Causa:** La config `body.mode: "raw"` + `rawBody` es sintaxis de typeVersion anterior. En typeVersion 4.2 se ignora silenciosamente.

**Fix — config correcta:**
```json
{
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ model: 'text-embedding-3-small', input: $json.query }) }}"
}
```

**Config INCORRECTA (typeVersion < 4.2):**
```json
{
  "body": { "mode": "raw" },
  "rawBody": "={{ JSON.stringify({...}) }}"
}
```

**Para agregar headers custom (ej: Qdrant api-key):**
```json
{
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [{ "name": "api-key", "value": "tu-api-key-aqui" }]
  }
}
```

---

## 11. telegramTrigger en n8n 2.x — URL, secret token y registro manual

### URL del webhook
El nodo `telegramTrigger` registra la ruta como `{webhookId}/webhook`. La URL completa es:
```
{WEBHOOK_URL}/webhook/{webhookId}/webhook
```
(no `/webhook/{webhookId}` — hay un `/webhook` al final).

### Secret token
n8n genera el header `X-Telegram-Bot-Api-Secret-Token` como:
```python
import re
secret = f"{workflowId}_{nodeId}"
secret = re.sub(r'[^a-zA-Z0-9_\-]', '', secret)
```
Sin este header, n8n retorna 403 en el webhook.

### Credencial con token vacío
Las credenciales creadas via API en n8n tienen `accessToken = __n8n_BLANK_VALUE_...`. Si el accessToken está en blanco, el nodo **NO** llama a `setWebhook` al activar el workflow. Siempre configurar credenciales via la UI de n8n y verificar que el token real esté guardado.

### N8N_ENCRYPTION_KEY
n8n genera su propia clave en `/home/node/.n8n/config` (campo `encryptionKey`) si no se pasa `N8N_ENCRYPTION_KEY` al contenedor. La clave en `.env` NO aplica al contenedor standalone — leer la clave real de `/home/node/.n8n/config`.

### Registro manual del webhook
Si `getWebhookInfo` sigue mostrando la URL antigua después de activar:
1. Activar el workflow (ciclo deactivate → PUT → activate)
2. Verificar con `getWebhookInfo` que la URL es correcta
3. Si no, llamar `setWebhook` manualmente con la URL y el secret calculado:
```python
import urllib.request, json
TOKEN = "..."
URL = "https://tu-ngrok.ngrok-free.dev/webhook/{webhookId}/webhook"
SECRET = re.sub(r'[^a-zA-Z0-9_\-]', '', f"{workflowId}_{nodeId}")
data = json.dumps({"url": URL, "secret_token": SECRET}).encode()
req = urllib.request.Request(f"https://api.telegram.org/bot{TOKEN}/setWebhook",
    data=data, headers={"Content-Type": "application/json"}, method="POST")
print(urllib.request.urlopen(req).read())
```

---

## 12. Debounce multi-mensaje con PostgreSQL (executeWorkflow subprocess)

**Problema:** Cuando un usuario envía varios mensajes en ráfaga (ej: "hola" + "cómo estás" en 2 segundos), el handler de Telegram crea múltiples ejecuciones paralelas. Si el debounce usa `$getWorkflowStaticData('global')`, cada ejecución tiene su propia copia en memoria y hay race conditions — el estado no se comparte de forma atómica.

**Solución validada:** Usar PostgreSQL para el estado del debounce (tabla `message_buffer`).

### Tabla requerida

```sql
CREATE TABLE IF NOT EXISTS message_buffer (
  chat_id   BIGINT PRIMARY KEY,
  text      TEXT    NOT NULL DEFAULT '',
  last_ts   BIGINT  NOT NULL DEFAULT 0  -- ms timestamp del último escritor
);
```

### Flujo del subprocess `FitAI - Process text message`

```
Start → Extract Message (Code) → Buffer Write (Postgres) → Debounce Wait (Wait, 2s)
     → Flush Check (Postgres CTE) → Is Last Writer? (IF) → Set Text from Message
                                                         → [false] STOP (clean)
```

### Buffer Write — INSERT atómico con concatenación

```sql
INSERT INTO message_buffer (chat_id, text, last_ts)
VALUES ($1, $2, $3)
ON CONFLICT (chat_id) DO UPDATE SET
  text = CASE
    WHEN NOW() - to_timestamp(message_buffer.last_ts / 1000.0) > INTERVAL '30 seconds'
    THEN EXCLUDED.text           -- reset después de 30s de inactividad
    ELSE message_buffer.text || E'\n' || EXCLUDED.text  -- concatenar
  END,
  last_ts = GREATEST(message_buffer.last_ts, EXCLUDED.last_ts)
RETURNING chat_id, last_ts
```

`queryReplacement: ={{ [$json.chatId, $json.text, $json.ts] }}`

**Por qué `GREATEST`:** Si dos ejecuciones llegan casi simultáneamente, la que tiene el ts mayor "gana" — su `last_ts` queda en la fila. Solo esa ejecución podrá hacer el Flush exitosamente.

### Flush Check — DELETE atómico (CTE)

```sql
WITH deleted AS (
  DELETE FROM message_buffer
  WHERE chat_id = $1 AND last_ts = $2
  RETURNING text
)
SELECT text FROM deleted
```

`queryReplacement: ={{ [$json.chat_id, $json.last_ts] }}`

- Si `last_ts` en DB coincide con `$2` → es el último escritor → DELETE exitoso → retorna `{text: '...'}`
- Si `last_ts` en DB fue sobreescrito por otro escritor → DELETE finds 0 rows → n8n retorna `{success: 'True'}`

### Gotcha crítico: n8n Postgres typeVersion 2.5 + CTE con 0 filas → `{success: 'True'}`

Cuando un `executeQuery` no retorna filas (incluyendo `SELECT ... FROM deleted` donde el CTE deleted 0 rows), n8n devuelve `{success: 'True'}` en lugar de un array vacío. El flujo NO se detiene — pasa al nodo siguiente con ese objeto. Si el nodo siguiente espera `$json.text`, obtiene `undefined`, lo cual causa errores en cadena.

**Fix obligatorio — IF node "Is Last Writer?" después de Flush Check:**

```json
{
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "parameters": {
    "conditions": {
      "conditions": [{
        "leftValue": "={{ $json.text }}",
        "operator": { "type": "string", "operation": "notEmpty", "singleValue": true }
      }]
    }
  }
}
```

- `true` (text no vacío): este flujo es el último escritor → continuar procesamiento
- `false` (text vacío o `{success:'True'}`): este flujo NO es el último escritor → **stop limpio (status: success)**

El false branch no tiene conexión → n8n termina la ejecución con éxito sin error.

---

## 13. Checklist de debugging rápido

Cuando un workflow no funciona como se espera:

1. ✅ ¿La ejecución que analizas es **posterior al último deploy**? (`startedAt > workflow.updatedAt` — ver sección 20)
2. ✅ ¿Los cambios están "publicados"? (ciclo deactivate → PUT → activate)
3. ✅ ¿El PUT payload tiene solo las 4 claves permitidas? (`name`, `nodes`, `connections`, `settings` — ver sección 19)
4. ✅ ¿El nodo anterior puede devolver 0 items? (`alwaysOutputData`)
5. ✅ ¿`$json` apunta al nodo correcto? (revisar cadena de conexiones)
6. ✅ ¿Las credenciales tienen valores reales? (no `__n8n_BLANK_VALUE_`)
7. ✅ ¿El tipo del nodo está disponible? (no "install this node")
8. ✅ Ver `lastNodeExecuted` en la ejecución para saber dónde se detuvo
9. ✅ Buscar el error exacto en los datos de la ejecución (SQLite o UI)
10. ✅ ¿`Split In Batches` tiene loop-back? (output[0] → proceso → loop-back → Split In Batches)
11. ✅ ¿IF node con fechas de PG usa `typeValidation: loose`? (no strict con Date objects)
12. ✅ ¿`documentDefaultDataLoader` tiene text splitter sub-nodo? (`ai_textSplitter` → `Document Loader`)
13. ✅ ¿`$fromAI()` retorna `"undefined"` string? → usar JSON-in-query: instruir al AI a formatear `query` como JSON
14. ✅ ¿httpRequest typeVersion 4.2 con body JSON? → usar `specifyBody: "json"` + `jsonBody`, NO `body.mode: "raw"` + `rawBody`
15. ✅ ¿`vectorStoreQdrant` retrieve-as-tool lanza "Not Found"? → bug en n8n 2.11.3, reemplazar con `toolWorkflow` + sub-workflow HTTP (ver `skills/dev/n8n-ai-agent-tools.md`)
16. ✅ ¿`telegramTrigger` no recibe mensajes después de activar? → Verificar URL `{WEBHOOK_URL}/webhook/{webhookId}/webhook` y que la credencial tiene token real. Si la URL está mal, llamar `setWebhook` manualmente (ver sección 11)
17. ✅ ¿Postgres `executeQuery` CTE retorna `{success:'True'}` en lugar de datos? → la CTE eliminó 0 filas. Agregar IF node "Is Last Writer?" después (ver sección 12)
18. ✅ ¿Debounce con múltiples mensajes simultáneos? → NO usar `$getWorkflowStaticData`. Usar PostgreSQL `message_buffer` (ver sección 12)
19. ✅ ¿Flujo con IF nodes o state machine? → **Validar TODAS las combinaciones de estado antes de implementar** (ver sección 14)
20. ✅ ¿Queries SQL con fechas usan `CURRENT_DATE`? → Reemplazar con `(NOW() AT TIME ZONE 'America/Bogota')::date` (ver sección 15)
21. ✅ ¿Nodo downstream lejano usa `.item.json` para referencias upstream? → Cambiar a `.first().json` (ver sección 17)
22. ✅ ¿Campo de Set node tiene punto en el nombre (ej: `message.text`)? → El output es anidado: `json.message.text`, no `json.text` (ver sección 18)
23. ✅ ¿`systemMessage` del AI Agent no evalúa expresiones? → El campo necesita prefijo `=`. Usar `={{ $json.fullSystemPrompt }}` y construir el prompt en Build Context (ver CLAUDE.md)
24. ✅ ¿AI Agent lanza "Expected string, received object → at input" al llamar un tool? → Hay un campo `$fromAI()` extra en `fields.values` del toolWorkflow. Mover ese dato al JSON del campo `query` vía descripción del tool (ver sección 21)
25. ✅ ¿Downstream de un Merge se ejecuta N veces (ej: mensajes duplicados)? → Merge mal configurado: usar `mode: "append"` + Code node "Collapse to One Item" después (ver sección 22)
26. ✅ ¿Error `column "X_kg" does not exist` o `invalid input value for enum`? → Auditar schema real con `\d tablename` y listar enums antes de escribir SQL (ver sección 23)
27. ✅ ¿`ON CONFLICT (user_id)` falla con "no unique or exclusion constraint"? → La tabla no tiene unique constraint en esa columna. Usar DELETE + INSERT (ver sección 23)
28. ✅ ¿Estado de prueba inyectado en Redis causa errores de enum? → Verificar que los valores coincidan exactamente con los enums del DB (ver sección 24)

---

## 14. Regla E2E — Validar todas las combinaciones de estado (OBLIGATORIO)

**OBLIGATORIO antes de implementar cualquier flujo con IF nodes, routing condicional o state machines.**

### Proceso

1. Listar todas las variables de estado y sus valores posibles (booleanos, nulls, strings)
2. Construir la tabla de combinaciones (2^n para n variables booleanas)
3. Para **cada combinación**, responder: ¿cuál es el path correcto? ¿tiene sentido el routing?
4. Verificar también el flujo **post-acción**: después de guardar datos, ¿las condiciones aguas abajo siguen siendo correctas?
5. Pregunta clave: ¿puede un usuario llegar a este estado sin haber completado el paso previo esperado?

### Ejemplo — Onboarding (3 variables, 8 combinaciones)

| `onboarding_completed` | `profile_saved` | `phone_provided` | Routing correcto |
|---|---|---|---|
| true | any | any | AI Agent |
| false | false | false | Onboarding Agent |
| false | false | true | Onboarding Agent (no pedir teléfono si no hay perfil) |
| false | true | false | Send Phone Reminder |
| false | true | true | Complete Onboarding directo |

### Por qué esto importa

Se diseñó `phone_pending` dos veces (flag + derivado) con fallos en ambas iteraciones porque solo se validó el "camino feliz":
- **Fallo 1:** Usuario con profile row pero sin perfil real recibía botón de teléfono sin haber completado el onboarding
- **Fallo 2:** Al completar el perfil siempre se pedía el teléfono, ignorando que el usuario podría ya tenerlo

La solución final usa `profile_saved` (derivado de `goal IS NOT NULL`) + `phone_provided` (derivado de `phone_number != ''`) con todos los caminos validados explícitamente.

---

## 15. Timezone bug en PostgreSQL con servidor UTC — historial completo

**Síntoma 1:** `log_date` de un INSERT hechos a las 19:31 Colombia aparece como el día siguiente (fecha UTC).

**Síntoma 2:** `target_date = (CURRENT_DATE AT TIME ZONE 'America/Bogota') + INTERVAL '1 day'` guarda *hoy* en lugar de mañana.

**Síntoma 3:** `CURRENT_DATE + 1` en un cron que corre a las 9pm Colombia guarda *pasado mañana* en lugar de mañana.

**Causa raíz:** PostgreSQL en Docker (UTC) tiene `CURRENT_DATE = fecha UTC`. A las 19:00-23:59 Colombia (UTC+5), `CURRENT_DATE` ya es el día siguiente en UTC. Los tres síntomas tienen el mismo origen.

**Tabla completa de patrones:**

| Expresión SQL | Resultado (ejemplo: 9pm Colombia = 2am UTC next day) | Veredicto |
|---|---|---|
| `(NOW() AT TIME ZONE 'America/Bogota')::date` | Fecha Colombia correcta | ✅ CORRECTO |
| `(NOW() AT TIME ZONE 'America/Bogota')::date + 1` | Mañana Colombia correcta | ✅ CORRECTO |
| `CURRENT_DATE` | Fecha UTC (puede ser 1 día adelante) | ❌ MAL |
| `CURRENT_DATE + 1` | UTC+1 (puede ser pasado mañana Colombia) | ❌ MAL |
| `CURRENT_DATE AT TIME ZONE 'America/Bogota'` | AT TIME ZONE sobre DATE → interpreta como medianoche UTC → ayer Colombia | ❌ MAL |
| `(CURRENT_DATE AT TIME ZONE 'America/Bogota') + INTERVAL '1 day'` | Misma trampa → hoy Colombia | ❌ MAL |

**Fix definitivo — usar siempre `NOW() AT TIME ZONE`:**
```sql
-- Fecha de hoy en Colombia
(NOW() AT TIME ZONE 'America/Bogota')::date

-- Fecha de mañana en Colombia (para crons nocturnos)
(NOW() AT TIME ZONE 'America/Bogota')::date + 1
```

**Por qué `CURRENT_DATE AT TIME ZONE` es trampa:** `AT TIME ZONE` aplicado a `DATE` (no a `timestamptz`) interpreta el DATE como medianoche UTC y lo convierte a Colombia → devuelve ayer por la tarde. No hace lo que parece.

**Workflows afectados y sus correcciones (aplicadas en 2026-04-02):**
- `log_date` en `daily_intake_logs` (Log Food Intake workflow)
- `target_date` en `daily_targets` (Log Food Intake + Daily Plan Cron)
- `plan_date` en `meal_plans` (Daily Plan Cron)
- Todos los filtros `WHERE ... = CURRENT_DATE` en contexto y proactivos (16 ocurrencias en 9 workflows)

---

## 16. `conversation_logs.message_text` es NOT NULL

**Síntoma:** `INSERT INTO conversation_logs (user_id, message_type, assistant_response, ...)` falla con `null value in column "message_text" violates not-null constraint`.

**Causa:** La tabla tiene `message_text TEXT NOT NULL`. Es el campo del mensaje del usuario. Los workflows proactivos no tienen mensaje de usuario, así que hay que pasarle un placeholder.

**Fix:** En todos los INSERTs proactivos incluir `message_text = '[proactive]'`:
```sql
INSERT INTO conversation_logs (user_id, message_type, message_text, assistant_response, created_at)
VALUES ($1, 'meal_reminder', '[proactive]', $2, NOW());
```

**Aplica a:** Todos los workflows proactivos (meal_reminder, morning_briefing, evening_checkin, weekly_report, silence_check, etc.).

**Aplica también al Log Conversation post-respuesta:** El nodo "Log Conversation" en el handler usa `message_text = $('Set User Context').first().json.message.text`. Si esa expresión retorna null (ej: por usar `.item` en vez de `.first()`, o por un path incorrecto), el INSERT falla. Siempre añadir `|| '[no text]'` como fallback:
```
={{ ($('Set User Context').first().json.message && $('Set User Context').first().json.message.text) ? $('Set User Context').first().json.message.text : '[no text]' }}
```

---

## 17. `.item` vs `.first()` — referencias a nodos upstream lejanos

**Síntoma:** Un campo como `userMessage` llega como string vacío `''` aunque el nodo referenciado sí tenía datos.

**Causa:** El accessor `.item` solo resuelve correctamente en nodos que están en el **path directo de ejecución** del item actual. En nodos que corren tarde en la cadena (ej: después de `Send Response`), `.item` no puede navegar hacia upstream nodes que no son el padre inmediato.

**Ejemplo concreto:** En el nodo "Build RAG Payload" (que corre 4 nodos después de Set User Context):
```javascript
// MAL — .item falla para nodos lejanos
$('Set User Context').item.json.message.text  // → ''

// BIEN — .first() siempre funciona para nodos lejanos
$('Set User Context').first().json.message.text  // → 'texto real'
```

**Regla general:**
- Nodo inmediatamente anterior → `.item.json` funciona
- Cualquier nodo anterior más lejano en la cadena → siempre usar `.first().json`

**Aplica a:** Code nodes, Postgres `queryReplacement`, y cualquier expresión `={{ }}` que referencie un nodo que no es el padre directo del nodo actual.

---

## 18. Set node — dot-notation crea objetos anidados

**Síntoma:** `$('Set User Context').first().json.text` retorna `undefined` aunque el Set node definitivamente tiene ese campo.

**Causa:** En el nodo Set (n8n-nodes-base.set), si el nombre del campo contiene un punto (ej: `message.text`), n8n crea un objeto **anidado**: `{ message: { text: "..." } }`. El campo NO se llama `text` — se accede como `json.message.text`.

**Ejemplo:**
```json
// Set node assignments:
{ "name": "message.text", "value": "={{ $json.message?.text }}" }
{ "name": "chatId", "value": "={{ $json.chatId }}" }

// Output JSON resultante:
{
  "message": { "text": "hola" },
  "chatId": "1435522255"
}
```

**Acceso correcto:**
```javascript
// MAL
$('Set User Context').first().json.text  // undefined

// BIEN
$('Set User Context').first().json.message.text  // 'hola'
$('Set User Context').first().json.chatId        // '1435522255'
```

**Dónde aplica en FitAI:** Set User Context tiene `message.text` (nested), `chatId`, `telegramId`, `firstName`. Cualquier nodo que lea el texto del usuario debe usar `.message.text`.

---

## 19. n8n PUT API — `request/body must NOT have additional properties`

**Síntoma:** `HTTP 400: {"message":"request/body must NOT have additional properties"}` al hacer PUT a `/api/v1/workflows/{id}`.

**Causa:** El endpoint `PUT /api/v1/workflows/{id}` solo acepta exactamente 4 claves en el body. Cualquier otra clave (incluyendo `staticData`, `pinData`, `versionId`, `meta`, `tags`, `activeVersion`, etc.) causa el 400.

**Claves permitidas:**
```python
payload = {
    "name": wf["name"],
    "nodes": wf["nodes"],
    "connections": wf["connections"],
    "settings": wf.get("settings") or {"executionOrder": "v1"}
}
# NO incluir: staticData, pinData, versionId, meta, tags, id, active, etc.
```

**Diagnóstico rápido:** Si estás pasando `{k: v for k, v in wf.items() if k not in [...]}`, asegúrate de que el conjunto de exclusión incluya todo menos las 4 claves permitidas. Más seguro: construir el payload explícitamente con solo las 4 claves.

---

## 20. Validar timestamp de ejecución antes de concluir que un nodo no corrió

**Síntoma:** Se verifica una ejecución y se concluye que los nodos nuevos "no corrieron", pero la ejecución era anterior al deploy del fix.

**Regla obligatoria:** Antes de analizar cualquier ejecución para validar un fix:
1. Verificar `startedAt` de la ejecución
2. Comparar con `updatedAt` del workflow (obtenible via `GET /api/v1/workflows/{id}`)
3. Solo las ejecuciones con `startedAt > updatedAt` del workflow reflejan los cambios

```python
# Verificar que la ejecución es post-fix
import urllib.request, json
wf = api("GET", f"/api/v1/workflows/{WF_ID}")
print("Workflow updatedAt:", wf["updatedAt"])
# Luego comparar con la startedAt de la ejecución analizada
```

**Consecuencia de ignorar esto:** Se declara un fix como "fallando" cuando en realidad nunca fue probado, desperdiciando tiempo en debuggear un problema que no existe.

---

## 22. Merge node fan-out — downstream se ejecuta N veces

**Síntoma:** Un nodo downstream (ej: `Send Message`) se ejecuta 4 veces, enviando 4 mensajes idénticos.

**Causa:** Un nodo fuente (ej: `Calculate Metrics`) tiene conexiones salientes hacia N nodos en paralelo. Todos convergen en un nodo `Merge`. Si el Merge no está configurado correctamente, cada input que llega dispara el downstream de forma independiente.

**Ejemplo:**
```
Calculate Metrics → Save User Profile    ─┐
                  → Save Initial Goal     ├→ Merge → Send Message (ejecuta 4x)
                  → Save Initial Weight   │
                  → Create Daily Targets ─┘
```

**Fix — Merge `mode: "append"` + Code node "Collapse to One Item":**

```python
# Configurar el Merge node:
node['parameters'] = {
    "mode": "append",      # espera TODOS los inputs, sin config adicional
    "numberInputs": 4
}

# Agregar nodo Code inmediatamente después del Merge:
collapse_node = {
    "id": "ob-collapse-01",
    "name": "Collapse to One Item",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "return [{ json: { done: true } }];"
    }
}
# Conectar: Merge → Collapse → downstream
```

**Por qué `append` + Collapse:** `mode: "append"` espera todos los inputs antes de proceder (no dispara por cada input), pero concatena todos los items de todas las ramas (N items). El nodo Collapse reduce a 1 item para que el downstream corra una sola vez.

**Modos del Merge node en n8n 2.x:**
| Modo | Comportamiento | Requiere config |
|------|---------------|-----------------|
| `append` | Concatena todos los items de todas las ramas | No |
| `combine` (sin combineMode) | Error: "You need to define at least one pair of fields" | Sí |
| `combine` + `mergeByPosition` | Error: "You need to define at least one pair of fields" en n8n 2.11.3 | Sí |

**Conectar las ramas al Merge con índices correctos:**
```python
conns['Save User Profile']['main']   = [[{"node": "Merge", "type": "main", "index": 0}]]
conns['Save Initial Goal']['main']   = [[{"node": "Merge", "type": "main", "index": 1}]]
conns['Save Initial Weight']['main'] = [[{"node": "Merge", "type": "main", "index": 2}]]
conns['Create Targets']['main']      = [[{"node": "Merge", "type": "main", "index": 3}]]
```

---

## 23. PostgreSQL — auditar schema ANTES de escribir SQL

**Síntoma:** `column "target_weight_kg" of relation "goals" does not exist`, `invalid input value for enum activity_level: "moderate"`, `ON CONFLICT (user_id)` falla sin error de constraint único.

**Causa:** Asumir nombres de columnas, valores de enum, o existencia de constraints sin verificar el schema real.

**Regla obligatoria:** Antes de escribir cualquier INSERT/UPDATE/ON CONFLICT para una tabla nueva, ejecutar:
```sql
\d tablename
```
Y verificar:
1. **Nombres exactos de columnas** — el DB puede tener `target_weight` cuando el código usaba `target_weight_kg`
2. **Valores exactos de enums** — usar `SELECT typname, enumlabel FROM pg_enum JOIN pg_type ON ...` para listar todos los enums
3. **Constraints existentes** — `ON CONFLICT (col)` solo funciona si hay un `UNIQUE CONSTRAINT` o `PRIMARY KEY` en esa columna. Un índice simple (no único) no es suficiente

**Consulta para auditar todos los enums del proyecto:**
```sql
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
ORDER BY t.typname, e.enumsortorder;
```

**Patrón para tablas sin unique constraint en user_id (ej: `goals`):**
```sql
-- MAL — goals no tiene unique constraint en user_id
INSERT INTO goals (...) VALUES (...) ON CONFLICT (user_id) DO UPDATE ...

-- BIEN — DELETE + INSERT
DELETE FROM goals WHERE user_id = $1 AND is_active = true;
INSERT INTO goals (...) VALUES ($1, ...);
```

**Errores encontrados en FitAI (2026-04-04):**
| Código incorrecto | Schema real | Fix |
|---|---|---|
| `target_weight_kg` | `target_weight` | Renombrar en SQL |
| `start_weight_kg` | `start_weight` | Renombrar en SQL |
| `activity_level: 'moderate'` | enum `moderately_active` | Corregir valor |
| `ON CONFLICT (user_id)` en `goals` | Sin unique constraint en user_id | DELETE + INSERT |

---

## 24. Datos de prueba con valores de enum incorrectos — causa falsos errores

**Síntoma:** El workflow falla con `invalid input value for enum X: "valor"` pero el código parece correcto.

**Causa:** Los datos inyectados manualmente en Redis (o en cualquier otro estado de prueba) usan valores que no coinciden con los enums del DB. El workflow está correcto — los datos de prueba están mal.

**Ejemplo real:**
```bash
# MAL — 'moderate' no existe en el enum activity_level
redis-cli SET "onboarding:1435522255" '{"data": {"activity_level": "moderate"}}'

# BIEN — usar el valor exacto del enum
redis-cli SET "onboarding:1435522255" '{"data": {"activity_level": "moderately_active"}}'
```

**Regla:** Antes de inyectar cualquier estado de prueba en Redis, verificar que TODOS los valores de campo que mapean a enums de PostgreSQL usen los valores exactos del enum (ver sección 23 para listar enums).

---

## 21. `$fromAI()` en `fields.values` de toolWorkflow — rompe el schema del tool

**Síntoma:** AI Agent falla con `"Received tool input did not match expected schema — Expected string, received object → at input"` al intentar llamar una tool.

**Causa:** En un nodo `toolWorkflow` (typeVersion 1.3), los campos en `fields.values` con `$fromAI()` se exponen como parámetros adicionales en el schema JSON Schema del tool. Cuando hay más de un parámetro `$fromAI()` (el `query` implícito + el nuevo campo), GPT-4o pasa un objeto estructurado en el campo `input` en lugar de un string. n8n espera un string en `input` y el mismatch causa el error.

**Regla:** Solo usar `$fromAI()` en `fields.values` para parámetros que n8n maneja como "input adicional controlado". El campo `query` es suficiente para pasar todo el contexto que necesita GPT-4o.

**Fix:** Eliminar el campo extra `$fromAI()` de `fields.values` e incluir la información adicional en el JSON del campo `query`, documentándolo en la `description` del tool.

```python
# MAL — log_date como $fromAI() en fields.values rompe el schema
{"name": "log_date", "type": "stringValue", "stringValue": "={{ $fromAI('log_date', '...', 'string') }}"}

# BIEN — log_date va dentro del JSON en el campo 'query'
# description del tool: "...JSON con este formato: {\"food_name\": \"...\", \"log_date\": \"YYYY-MM-DD\"}"
# fields.values solo tiene userId y chatId (valores estáticos, sin $fromAI)
```

**Regla derivada:** `fields.values` debe contener solo valores estáticos (userId, chatId, etc.). Todo lo que GPT-4o debe "decidir" debe ir dentro del JSON del campo `query`.
