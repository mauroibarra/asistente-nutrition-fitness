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
import urllib.request, json

BASE = "http://localhost:5678"
API_KEY = "..."
WF_ID = "..."

# 1. Desactivar
req = urllib.request.Request(f"{BASE}/api/v1/workflows/{WF_ID}/deactivate",
    data=b'{}', headers={"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}, method="POST")
urllib.request.urlopen(req)

# 2. Guardar cambios
payload = {"name": wf["name"], "nodes": wf["nodes"], "connections": wf["connections"],
           "settings": wf.get("settings") or {"executionOrder": "v1"}, "staticData": wf.get("staticData")}
req = urllib.request.Request(f"{BASE}/api/v1/workflows/{WF_ID}",
    data=json.dumps(payload).encode(), headers={"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}, method="PUT")
urllib.request.urlopen(req)

# 3. Reactivar (esto crea una nueva entrada en workflow_publish_history)
import time; time.sleep(1)
req = urllib.request.Request(f"{BASE}/api/v1/workflows/{WF_ID}/activate",
    data=b'{}', headers={"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}, method="POST")
urllib.request.urlopen(req)
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

1. ✅ ¿Los cambios están "publicados"? (ciclo deactivate → PUT → activate)
2. ✅ ¿El nodo anterior puede devolver 0 items? (`alwaysOutputData`)
3. ✅ ¿`$json` apunta al nodo correcto? (revisar cadena de conexiones)
4. ✅ ¿Las credenciales tienen valores reales? (no `__n8n_BLANK_VALUE_`)
5. ✅ ¿El tipo del nodo está disponible? (no "install this node")
6. ✅ Ver `lastNodeExecuted` en la ejecución para saber dónde se detuvo
7. ✅ Buscar el error exacto en los datos de la ejecución (SQLite o UI)
8. ✅ ¿`Split In Batches` tiene loop-back? (output[0] → proceso → loop-back → Split In Batches)
9. ✅ ¿IF node con fechas de PG usa `typeValidation: loose`? (no strict con Date objects)
10. ✅ ¿`documentDefaultDataLoader` tiene text splitter sub-nodo? (`ai_textSplitter` → `Document Loader`)
11. ✅ ¿`$fromAI()` retorna `"undefined"` string? → usar JSON-in-query: instruir al AI a formatear `query` como JSON
12. ✅ ¿httpRequest typeVersion 4.2 con body JSON? → usar `specifyBody: "json"` + `jsonBody`, NO `body.mode: "raw"` + `rawBody`
13. ✅ ¿`vectorStoreQdrant` retrieve-as-tool lanza "Not Found"? → bug en n8n 2.11.3, reemplazar con `toolWorkflow` + sub-workflow HTTP (ver `skills/dev/n8n-ai-agent-tools.md`)
13. ✅ ¿`telegramTrigger` no recibe mensajes después de activar? → Verificar URL `{WEBHOOK_URL}/webhook/{webhookId}/webhook` y que la credencial tiene token real (no `__n8n_BLANK_VALUE_`). Si la URL está mal, llamar `setWebhook` manualmente con secret = `{workflowId}_{nodeId}` (ver sección 11)
14. ✅ ¿Postgres `executeQuery` CTE retorna `{success:'True'}` en lugar de datos? → la CTE eliminó 0 filas (otro escritor ganó el `last_ts`). Agregar IF node "Is Last Writer?" después — `$json.text notEmpty` → continuar; false → stop limpio
15. ✅ ¿Debounce con múltiples mensajes simultáneos? → NO usar `$getWorkflowStaticData` (race condition en memoria). Usar tabla PostgreSQL `message_buffer` con `INSERT ... ON CONFLICT` + `GREATEST(last_ts)` (ver sección 11)
