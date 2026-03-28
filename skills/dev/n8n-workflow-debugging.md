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

## 11. Checklist de debugging rápido

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
