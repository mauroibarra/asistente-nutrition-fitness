# Skill: AI Agent Tools en n8n (toolWorkflow)

Patrones correctos para configurar herramientas (tools) en el nodo AI Agent de n8n y pasar datos a sub-workflows.

---

## Arquitectura: AI Agent + toolWorkflow

El AI Agent de n8n llama tools (sub-workflows) via el nodo `toolWorkflow`. El flujo es:

```
Telegram Trigger → ... → AI Agent ──(tool call)──→ toolWorkflow node
                                                         ↓
                                               Sub-workflow recibe datos
                                               via Execute Workflow Trigger
                                                         ↓
                                               Sub-workflow retorna resultado
                                                         ↓
                   AI Agent recibe resultado y lo incluye en su respuesta
```

---

## Tabla de responsabilidades de datos

| Dato | Quién lo controla | Cómo configurarlo |
|------|------------------|--------------------|
| Texto de la consulta del usuario | LLM automáticamente | Campo `query` — siempre presente |
| userId, chatId (contexto del developer) | Developer (expresión n8n) | `fields.values` con `={{ expresion }}` |
| Parámetros que el LLM decide (peso, fecha) | LLM via `$fromAI()` | `fields.values` con `={{ $fromAI(...) }}` |

---

## Configuración correcta de un toolWorkflow node

### typeVersion a usar: 1.3

```json
{
  "name": "Tool: Progreso",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 1.3,
  "parameters": {
    "name": "Progreso",
    "description": "Calcula el progreso de peso del usuario. Úsala cuando el usuario pregunte por su progreso o evolución.",
    "source": "database",
    "workflowId": { "__rl": true, "value": "bhJ8qqZXr68Id3pH", "mode": "id" },
    "fields": {
      "values": [
        {
          "name": "userId",
          "type": "numberValue",
          "numberValue": "={{ $('Check User & Membership').item.json.user_id }}"
        },
        {
          "name": "chatId",
          "type": "numberValue",
          "numberValue": "={{ $('Telegram Trigger').item.json.message.chat.id }}"
        }
      ]
    }
  }
}
```

**Notas importantes:**
- El campo `name` NO puede tener espacios (usar `_` o PascalCase)
- `source: "database"` cuando se referencia por ID
- `workflowId` debe usar el formato resource locator: `{"__rl": true, "value": "ID", "mode": "id"}`

---

## Lo que recibe el sub-workflow

En `Execute Workflow Trigger`, el output es:

```json
{
  "query": "dame mi progreso de peso",
  "userId": 4,
  "chatId": 1435522255
}
```

Acceso en el sub-workflow:
```javascript
$('Execute Workflow Trigger').first().json.userId    // → 4
$('Execute Workflow Trigger').first().json.chatId   // → 1435522255
$('Execute Workflow Trigger').first().json.query    // → "dame mi progreso de peso"
```

---

## Pasar parámetros que el LLM debe decidir ($fromAI)

Útil para cuando el agente necesita especificar un valor concreto (no contexto):

```json
{
  "name": "weight_kg",
  "type": "numberValue",
  "numberValue": "={{ $fromAI('weight_kg', 'El peso corporal del usuario en kilogramos', 'number') }}"
}
```

El LLM leerá de la conversación el valor y lo pasará al sub-workflow.

---

## Patrón completo: Handler → Tool → Sub-workflow

### En el Handler workflow

```
Telegram Trigger
  → Route Message Type (IF: voice vs text/callback)
    [voice] → Get Voice File → Transcribe Voice → Set Text from Voice ─┐
    [text]  → Call process text message (executeWorkflow subprocess)   ─┤
                                                                         ↓
                                                              Set User Context (convergencia)
  → Upsert User (SQL: users table)
  → Check User & Membership (SQL: user_id, onboarding_completed)
  → IF "Onboarding Complete?" (string equals "true")
    [true] → FitAI Main AI Agent
               ↓ tools conectados via ai_tool port:
               ├── Tool: Progreso   (typeVersion 1.3, fields: userId + chatId)
               ├── Tool: Plan Comidas (typeVersion 1.3, fields: userId + chatId)
               └── Tool: Rutina   (typeVersion 1.3, fields: userId + chatId)
    [false] → Onboarding response
  → Send Response (Telegram)
```

**Nota crítica — nodo de convergencia `Set User Context`:**
El handler tiene dos caminos para el texto (voz y texto/subprocess). Ambos convergen en el nodo `Set User Context` (Set node) antes de `Upsert User`. Todos los nodos downstream deben referenciar `$('Set User Context').item.json.*` para obtener `message.text`, `chatId`, `telegramId`, `firstName`. **No** referenciar `$('Call process text message').item.json.*` — ese nodo no existe en el path de voz.

### En el sub-workflow (Progress Calculator, etc.)

```
Execute Workflow Trigger
  → Get User Data (SQL con $('Execute Workflow Trigger').first().json.userId)
  → Calculate Metrics (Code node)
  → [Opcionalmente: Send Telegram message con chatId]
  → Return Item (noOp — marca el fin del workflow para toolWorkflow)
```

---

## Errores comunes y soluciones

### "The workflow did not return a response"
El AI Agent recibió un error del sub-workflow. Causas frecuentes:
- El sub-workflow se detuvo silenciosamente (un nodo SQL retornó 0 filas, ver `alwaysOutputData`)
- Error en un nodo del sub-workflow (ver ejecución en n8n UI)

### "No information about the workflow to execute found"
El `workflowId` está en formato incorrecto. Debe ser:
```json
{ "__rl": true, "value": "ID_AQUI", "mode": "id" }
```
NO una string plana.

### El agente recibe los datos pero no usa userId
El sistema prompt debe indicarle explícitamente al agente que use userId:
```
- userId para herramientas: {{ $('Check User & Membership').item.json.user_id }}
```

### Tool se llama pero el sub-workflow recibe solo {query: "..."}
Los `fields.values` no están configurados (o están en la versión incorrecta del nodo). Verificar que el nodo sea typeVersion 1.3 con el bloque `fields.values`.

---

## Descripción efectiva de tools

La `description` del tool es lo que el LLM lee para decidir cuándo llamarlo. Debe ser:
- Específica sobre cuándo usarla: "Úsala cuando el usuario pregunte por su progreso de peso"
- En el mismo idioma que el sistema prompt
- Corta (1-2 oraciones máximo)

```javascript
// Mal:
"Tool para calcular progreso"

// Bien:
"Calcula el progreso de peso y métricas del usuario. Úsala cuando el usuario pregunte por su progreso, evolución de peso, o estadísticas de avance."
```

---

## Nodos disponibles para AI Agent en n8n

| Tipo de nodo | Puerto de conexión | Uso |
|-------------|-------------------|-----|
| `toolWorkflow` | `ai_tool` | Llamar sub-workflows como tools |
| `lmChatOpenAi` | `ai_languageModel` | Modelo de lenguaje (GPT-4o, etc.) |
| `memoryBufferWindow` | `ai_memory` | Memoria de conversación (últimos N mensajes) |
| `vectorStoreQdrant` (retrieve) | `ai_tool` o `ai_vectorStore` | **ROTO en n8n 2.11.3** — usar toolWorkflow en su lugar |

Todos se conectan al AI Agent via sus puertos especializados (no el puerto `main`).

---

## BUG CONOCIDO: vectorStoreQdrant retrieve-as-tool — NodeOperationError "Not Found" (n8n 2.11.3)

**Síntoma:** El nodo `vectorStoreQdrant` en modo `retrieve-as-tool` lanza `NodeOperationError: Not Found` antes de llegar a Qdrant. No se registran llamadas HTTP a Qdrant.

**Causa real (confirmada):** Incompatibilidad de versiones. El paquete `@langchain/qdrant@1.0.1` que usa n8n 2.11.3 llama a `POST /collections/{name}/points/query` (la "Universal Query API" de Qdrant), que solo existe en **Qdrant ≥ 1.10.0**. Con Qdrant 1.7.4 ese endpoint devuelve 404 → NodeOperationError "Not Found". La inserción (upsert) funciona porque no usa ese endpoint.

**Fix confirmado:**
- Actualizar Qdrant a v1.13.0+ (`docker-compose.yml`: `image: qdrant/qdrant:v1.13.0`)
- El volumen de datos se preserva en la actualización
- Con Qdrant 1.13.0 el nodo funciona correctamente con `typeVersion: 1.3`

**Fix confirmado — actualizar Qdrant + usar typeVersion 1.3:**

**NO usar** el workaround toolWorkflow + HTTP. Actualizar Qdrant y usar el nodo nativo correctamente.

### Configuración correcta de vectorStoreQdrant en retrieve-as-tool (typeVersion 1.3):

```json
{
  "type": "@n8n/n8n-nodes-langchain.vectorStoreQdrant",
  "typeVersion": 1.3,
  "parameters": {
    "mode": "retrieve-as-tool",
    "toolDescription": "Busca en la memoria personal del usuario: historial de peso, comidas reportadas, metas y eventos registrados.",
    "qdrantCollection": { "__rl": true, "mode": "id", "value": "user_rag" },
    "topK": 5,
    "options": {}
  },
  "credentials": { "qdrantApi": { "id": "ZgvYkNPmxRynoz3F", "name": "Qdrant account Fitia" } }
}
```

**embeddingsOpenAi que funciona** (`typeVersion: 1`, no 1.2; `model` como string, no Resource Locator):
```json
{
  "type": "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
  "typeVersion": 1,
  "parameters": { "model": "text-embedding-3-small", "options": {} }
}
```

Conectar embeddings → vectorStoreQdrant vía `ai_embedding`, y vectorStoreQdrant → AI Agent vía `ai_tool`.

---

### Workaround histórico (ya NO necesario):

En versiones previas se usó toolWorkflow + sub-workflow HTTP. Mantener `12-rag-personal-search.json` como referencia, pero el Handler ya usa el nodo nativo.

En el Handler, el workaround era reemplazar el nodo `vectorStoreQdrant` con un `toolWorkflow` que llamara a un sub-workflow dedicado:

```json
{
  "name": "Tool: Contexto Personal",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 1.3,
  "parameters": {
    "name": "ContextoPersonal",
    "description": "Busca en la memoria personal del usuario: historial de peso, comidas reportadas, metas y eventos registrados. Úsala cuando el usuario mencione comidas, peso, o pregunte qué ha registrado.",
    "source": "database",
    "workflowId": { "__rl": true, "value": "UfO8uMAfcfkxv4np", "mode": "id" },
    "fields": {
      "values": [{ "name": "userId", "type": "numberValue", "numberValue": "={{ $('Check User & Membership').item.json.user_id }}" }]
    }
  }
}
```

El sub-workflow (`FitAI - RAG Personal Search`, ID `UfO8uMAfcfkxv4np`) usa nodos HTTP Request:

```
Execute Workflow Trigger
  → Get Embedding (httpRequest POST → api.openai.com/v1/embeddings, specifyBody: "json")
  → Search Qdrant (httpRequest POST → host.docker.internal:6333/collections/user_rag/points/search, header api-key)
  → Format Results (Code node → devuelve { context: "..." })
  → Return Results (noOp)
```

**Config correcta del nodo httpRequest typeVersion 4.2 para JSON body:**
```json
{
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ model: 'text-embedding-3-small', input: $json.query }) }}"
}
```
**INCORRECTO** (causa "you must provide a model parameter" en OpenAI):
```json
{
  "body": { "mode": "raw" },
  "rawBody": "={{ JSON.stringify({...}) }}"
}
```

**Search Qdrant con filtro por userId:**
```javascript
JSON.stringify({
  vector: $json.data[0].embedding,
  limit: 5,
  filter: { must: [{ key: 'metadata.userId', match: { value: $('Execute Workflow Trigger').first().json.userId } }] },
  with_payload: true
})
```

**Format Results Code node:**
```javascript
const results = $input.first().json.result || [];
if (results.length === 0) {
  return [{ json: { context: 'No hay registros previos del usuario en memoria.' } }];
}
const context = results
  .map(r => r.payload?.content || JSON.stringify(r.payload))
  .join('\n---\n');
return [{ json: { context, found: results.length } }];
```

**Validado:** AI responde correctamente con historial de comidas del usuario (test real con chat_id 1435522255).

---

## ADVERTENCIA: $fromAI() en fields.values no funciona como se espera

`$fromAI('paramName', 'desc')` en `fields.values` de un `toolWorkflow` **retorna la string `"undefined"`** si el AI Agent no incluyó ese parámetro en su tool call. El AI Agent siempre envía el campo `query` pero puede no enviar campos custom.

**Patrón INCORRECTO (parece funcionar pero falla silenciosamente):**
```json
{
  "name": "eventType",
  "type": "stringValue",
  "stringValue": "={{ $fromAI('eventType', 'El tipo de evento') }}"
}
```
El sub-workflow recibe `eventType: "undefined"` (string), no el valor esperado.

**Patrón CORRECTO — JSON-in-query:**

Instructar al AI en la descripción del tool a formatear `query` como JSON:
```
description: "Registra un evento. El campo query DEBE ser JSON: {\"eventType\":\"weight_log\",\"weight_kg\":77.5}"
```

En el sub-workflow, parsear `$json.query` como JSON:
```javascript
const { userId, query } = $input.first().json;
const parsed = JSON.parse(query);  // { eventType, weight_kg, ... }
```

**Por qué:** El AI Agent llama las tools con un único campo `query` (auto-generado). Los `fields.values` con expresiones fijas (`={{ expresión }}`) funcionan para contexto del developer (userId, chatId). Los `$fromAI()` solo funcionan cuando el AI explícitamente pasa esos parámetros como parte del schema de la herramienta — lo cual requiere `Specify Input Schema` habilitado.
