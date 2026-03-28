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
  → Set Text from Message (extrae message.text y telegramId)
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
| `vectorStoreQdrant` (retrieve) | `ai_tool` o `ai_vectorStore` | Búsqueda semántica RAG |

Todos se conectan al AI Agent via sus puertos especializados (no el puerto `main`).
