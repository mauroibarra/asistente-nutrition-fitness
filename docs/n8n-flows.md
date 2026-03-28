# Flujos n8n — FitAI Assistant

Este documento describe en detalle los 10 workflows de n8n que componen la lógica de negocio completa del bot FitAI Assistant. Cada workflow se documenta con su trigger, nodos en orden, lógica de ramificación, manejo de errores y credenciales requeridas.

---

## Tabla de Contenidos

1. [FitAI - Telegram Webhook Handler](#1-fitai---telegram-webhook-handler)
2. [FitAI - Main AI Agent](#2-fitai---main-ai-agent)
3. [FitAI - Onboarding Flow](#3-fitai---onboarding-flow)
4. [FitAI - Meal Plan Generator](#4-fitai---meal-plan-generator)
5. [FitAI - Meal Reminder Scheduler](#5-fitai---meal-reminder-scheduler)
6. [FitAI - Weight Update Requester](#6-fitai---weight-update-requester)
7. [FitAI - Progress Calculator](#7-fitai---progress-calculator)
8. [FitAI - Workout Plan Generator](#8-fitai---workout-plan-generator)
9. [FitAI - RAG Personal Indexer](#9-fitai---rag-personal-indexer)
10. [FitAI - Membership Alert](#10-fitai---membership-alert)

---

## 1. FitAI - Telegram Webhook Handler

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Telegram Webhook Handler` |
| **Trigger** | Webhook POST `/webhook/fitai-telegram` |
| **Propósito** | Punto de entrada único para todos los mensajes de Telegram. Valida membresía, aplica rate limiting, detecta estado de onboarding y enruta al sub-workflow correspondiente. |
| **Activación** | Siempre activo (production webhook) |

### Descripción del Propósito

Este workflow es el gateway central del sistema. Recibe cada actualización (update) que Telegram envía al bot, extrae los datos relevantes del mensaje, verifica que el usuario tenga una membresía activa y vigente, aplica control de rate limiting a través de Redis, determina si el usuario necesita completar el onboarding o si ya puede interactuar con el agente principal, y enruta la solicitud al sub-workflow apropiado. Ningún otro workflow recibe mensajes directos de Telegram; todo pasa por aquí.

### Nodos en Orden

#### Nodo 1: Webhook (Trigger)

- **Tipo**: Webhook
- **Método HTTP**: POST
- **Ruta**: `/webhook/fitai-telegram`
- **Autenticación**: Ninguna (Telegram no soporta autenticación en webhooks; se valida por la estructura del payload)
- **Response Mode**: `responseNode` (la respuesta se envía de forma asíncrona)
- **Opciones**:
  - Raw Body: habilitado (para logging del payload completo si es necesario)

**Salida**: el objeto JSON completo del Telegram Update.

#### Nodo 2: Extract Telegram Data (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: Parsear el update de Telegram y extraer los campos necesarios para el procesamiento posterior.

```javascript
const update = $input.first().json;
const message = update.body.message || update.body.edited_message;

if (!message) {
  return [{ json: { skip: true, reason: 'no_message' } }];
}

const chatId = message.chat.id;
const telegramId = message.from.id;
const firstName = message.from.first_name || '';
const lastName = message.from.last_name || '';
const username = message.from.username || '';
const text = message.text || '';
const messageType = message.photo ? 'photo'
  : message.voice ? 'voice'
  : message.document ? 'document'
  : message.location ? 'location'
  : 'text';
const messageId = message.message_id;
const date = new Date(message.date * 1000).toISOString();

return [{
  json: {
    skip: false,
    chatId,
    telegramId,
    firstName,
    lastName,
    username,
    text,
    messageType,
    messageId,
    date
  }
}];
```

**Salida**: objeto con `chatId`, `telegramId`, `firstName`, `lastName`, `username`, `text`, `messageType`, `messageId`, `date`, y flag `skip`.

#### Nodo 3: Should Process? (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.skip }}` es `false`
- **Rama true**: continúa al siguiente nodo
- **Rama false**: termina la ejecución (updates sin mensaje, como ediciones de grupo o callbacks no manejados)

#### Nodo 4: Check Supported Type (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.messageType }}` es igual a `text`
- **Rama true**: continúa al nodo de verificación de membresía
- **Rama false**: nodo "Unsupported Type Response"

#### Nodo 5: Unsupported Type Response (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Extract Telegram Data').item.json.chatId }}`
- **Texto**: `Por el momento solo puedo procesar mensajes de texto. Escríbeme tu consulta y con gusto te ayudo.`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

Este nodo es terminal; la ejecución finaliza aquí para mensajes no textuales.

#### Nodo 6: Check Rate Limit (Redis)

- **Tipo**: Redis
- **Operación**: Increment (`INCR`)
- **Key**: `rate_limit:{{ $('Extract Telegram Data').item.json.telegramId }}`
- **Credencial**: `FitAI Redis`

Después del INCR, un segundo nodo Redis establece el TTL si es la primera vez:

#### Nodo 7: Set Rate Limit TTL (Redis)

- **Tipo**: Redis
- **Operación**: Ejecutar comando personalizado
- **Comando**: `EXPIRE`
- **Key**: `rate_limit:{{ $('Extract Telegram Data').item.json.telegramId }}`
- **TTL**: `60` (segundos)
- **Condición de ejecución**: solo se ejecuta si el valor devuelto por INCR es `1` (primera solicitud en la ventana)
- **Credencial**: `FitAI Redis`

#### Nodo 8: Rate Limit Exceeded? (IF)

- **Tipo**: IF
- **Condición**: el valor devuelto por el nodo `Check Rate Limit` es mayor que `10`
- **Rama true (excedido)**: nodo "Rate Limit Message"
- **Rama false (dentro del límite)**: continúa al nodo de verificación de membresía

#### Nodo 9: Rate Limit Message (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Extract Telegram Data').item.json.chatId }}`
- **Texto**: `Estás enviando mensajes muy rápido. Espera un momento antes de continuar.`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

Nodo terminal. La ejecución finaliza aquí si se excede el límite.

#### Nodo 10: Verify Membership (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.id AS user_id, u.telegram_id, u.first_name, u.is_active,
       m.plan_type, m.status AS membership_status, m.expires_at
FROM users u
LEFT JOIN memberships m ON u.id = m.user_id
  AND m.status = 'active'
  AND m.expires_at > NOW()
WHERE u.telegram_id = $1
ORDER BY m.expires_at DESC
LIMIT 1;
```

- **Parámetros**: `[$('Extract Telegram Data').item.json.telegramId]`

**Salida**: fila con datos del usuario y membresía, o fila con `membership_status = null` si no tiene membresía activa, o ninguna fila si el usuario no existe.

#### Nodo 11: User Exists? (IF)

- **Tipo**: IF
- **Condición**: el resultado del query tiene al menos una fila (`{{ $json.user_id }}` no está vacío)
- **Rama true**: continúa al siguiente nodo
- **Rama false**: nodo "Unknown User Response"

#### Nodo 12: Unknown User Response (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Extract Telegram Data').item.json.chatId }}`
- **Texto**:

```
No tienes una cuenta registrada en FitAI.

Contacta al administrador para activar tu acceso:
@fitai_admin
```

- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

Nodo terminal.

#### Nodo 13: Has Active Membership? (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.membership_status }}` es igual a `active` **Y** `{{ $json.is_active }}` es `true`
- **Rama true**: continúa al chequeo de onboarding
- **Rama false**: nodo "No Membership Response"

#### Nodo 14: No Membership Response (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Extract Telegram Data').item.json.chatId }}`
- **Texto**:

```
Tu membresía no está activa o ha expirado.

Para renovar tu suscripción, contacta al administrador:
@fitai_admin

Estaremos encantados de tenerte de vuelta.
```

- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

Nodo terminal.

#### Nodo 15: Check Onboarding Status (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT onboarding_completed
FROM user_profiles
WHERE user_id = $1;
```

- **Parámetros**: `[$json.user_id]`

**Salida**: fila con `onboarding_completed` (boolean) o ninguna fila si el perfil no existe aún.

#### Nodo 16: Onboarding Completed? (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.onboarding_completed }}` es `true`
- **Rama true**: ejecuta sub-workflow `FitAI - Main AI Agent`
- **Rama false**: ejecuta sub-workflow `FitAI - Onboarding Flow`

#### Nodo 17: Execute Main Agent (Execute Sub-Workflow)

- **Tipo**: Execute Sub-Workflow
- **Workflow**: `FitAI - Main AI Agent`
- **Datos de entrada**:

```json
{
  "userId": "{{ $('Verify Membership').item.json.user_id }}",
  "telegramId": "{{ $('Extract Telegram Data').item.json.telegramId }}",
  "chatId": "{{ $('Extract Telegram Data').item.json.chatId }}",
  "firstName": "{{ $('Extract Telegram Data').item.json.firstName }}",
  "text": "{{ $('Extract Telegram Data').item.json.text }}",
  "messageType": "{{ $('Extract Telegram Data').item.json.messageType }}",
  "planType": "{{ $('Verify Membership').item.json.plan_type }}"
}
```

#### Nodo 18: Execute Onboarding (Execute Sub-Workflow)

- **Tipo**: Execute Sub-Workflow
- **Workflow**: `FitAI - Onboarding Flow`
- **Datos de entrada**:

```json
{
  "userId": "{{ $('Verify Membership').item.json.user_id }}",
  "telegramId": "{{ $('Extract Telegram Data').item.json.telegramId }}",
  "chatId": "{{ $('Extract Telegram Data').item.json.chatId }}",
  "firstName": "{{ $('Extract Telegram Data').item.json.firstName }}",
  "text": "{{ $('Extract Telegram Data').item.json.text }}"
}
```

### Lógica de Ramificación

```
Webhook
  → Extract Telegram Data
    → Should Process? (IF)
      ├─ false → FIN
      └─ true → Check Supported Type (IF)
            ├─ false → Unsupported Type Response → FIN
            └─ true → Check Rate Limit (Redis)
                  → Set Rate Limit TTL (Redis, condicional)
                  → Rate Limit Exceeded? (IF)
                      ├─ true → Rate Limit Message → FIN
                      └─ false → Verify Membership (PostgreSQL)
                            → User Exists? (IF)
                                ├─ false → Unknown User Response → FIN
                                └─ true → Has Active Membership? (IF)
                                      ├─ false → No Membership Response → FIN
                                      └─ true → Check Onboarding Status (PostgreSQL)
                                            → Onboarding Completed? (IF)
                                                ├─ true → Execute Main Agent
                                                └─ false → Execute Onboarding
```

### Manejo de Errores

- **Error Workflow**: configurado a nivel global. Si cualquier nodo falla, se ejecuta un flujo de error que:
  1. Registra el error en los logs de n8n.
  2. Envía un mensaje genérico al usuario: `Lo siento, ocurrió un error procesando tu mensaje. Intenta nuevamente en unos minutos.`
  3. Envía una notificación al admin por Telegram con detalles del error (nodo, mensaje, timestamp).
- **Timeout**: el webhook tiene un timeout de 30 segundos. Si el procesamiento tarda más, Telegram recibirá un error 504 pero no reintentará inmediatamente.
- **Redis caído**: si Redis no está disponible, el nodo de rate limiting falla. El Error Workflow captura esto y permite que el mensaje se procese sin rate limiting (fail-open) logueando la incidencia.
- **PostgreSQL caído**: si la base de datos no está disponible, se envía mensaje de error al usuario y se notifica al admin.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram (`BOT_TOKEN`) |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL (host, port, database, user, password) |
| Credencial n8n | `FitAI Redis` | Conexión a Redis (host, port, password) |
| Variable de entorno | `WEBHOOK_URL` | URL base del webhook (ej: `https://fitai.example.com`) |
| Variable de entorno | `ADMIN_TELEGRAM_ID` | ID de Telegram del administrador para notificaciones de error |
| Variable de entorno | `RATE_LIMIT_MAX` | Número máximo de mensajes por minuto (default: `10`) |

---

## 2. FitAI - Main AI Agent

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Main AI Agent` |
| **Trigger** | Sub-workflow (llamado por `FitAI - Telegram Webhook Handler`) |
| **Propósito** | Agente de IA principal que procesa mensajes de usuarios con onboarding completado. Usa GPT-4o con tools para generar respuestas conversacionales, invocar generación de planes, calcular progreso y buscar contexto en RAG. |
| **Activación** | Solo via Execute Sub-Workflow |

### Descripción del Propósito

Este workflow es el cerebro del bot. Recibe el mensaje del usuario junto con sus datos de contexto, carga su perfil completo, recupera contexto relevante de las colecciones RAG (tanto de conocimiento general como personal), construye el prompt del sistema con variables dinámicas, y ejecuta el nodo AI Agent de n8n con GPT-4o. El agente puede invocar herramientas (tools) que se implementan como sub-workflows adicionales o nodos HTTP. Una vez que el agente genera la respuesta final, se envía al usuario por Telegram y se registra la conversación.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada esperados**: `userId`, `telegramId`, `chatId`, `firstName`, `text`, `messageType`, `planType`

#### Nodo 2: Load User Profile (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT up.*, g.goal_type, g.target_weight, g.start_weight, g.start_date, g.target_date
FROM user_profiles up
LEFT JOIN goals g ON up.user_id = g.user_id AND g.is_active = true
WHERE up.user_id = $1;
```

- **Parámetros**: `[$json.userId]`

**Salida**: perfil completo del usuario con su objetivo activo.

#### Nodo 3: Search Knowledge RAG (Qdrant Vector Store)

- **Tipo**: Qdrant Vector Store - Search
- **Credencial**: `FitAI Qdrant`
- **Colección**: `knowledge_rag`
- **Query text**: `{{ $('Sub-Workflow Trigger').item.json.text }}`
- **Top K**: `3`
- **Score Threshold**: `0.7`
- **Filtros**: ninguno (busca en toda la colección de conocimiento general)

**Salida**: hasta 3 documentos de conocimiento general relevantes al mensaje del usuario.

#### Nodo 4: Search User RAG (Qdrant Vector Store)

- **Tipo**: Qdrant Vector Store - Search
- **Credencial**: `FitAI Qdrant`
- **Colección**: `user_rag`
- **Query text**: `{{ $('Sub-Workflow Trigger').item.json.text }}`
- **Top K**: `5`
- **Score Threshold**: `0.65`
- **Filtros**:

```json
{
  "must": [
    { "key": "user_id", "match": { "value": "{{ $('Sub-Workflow Trigger').item.json.userId }}" } }
  ]
}
```

**Salida**: hasta 5 documentos personales del usuario relevantes al mensaje.

#### Nodo 5: Build Context (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: Combinar el perfil del usuario, los resultados de RAG y los datos del trigger en un objeto de contexto unificado para inyectar en el system prompt.

```javascript
const trigger = $('Sub-Workflow Trigger').first().json;
const profile = $('Load User Profile').first().json;
const knowledgeDocs = $('Search Knowledge RAG').all().map(item => item.json.text).join('\n---\n');
const userDocs = $('Search User RAG').all().map(item => item.json.text).join('\n---\n');

const currentDate = new Date().toISOString().split('T')[0];

const userProfile = JSON.stringify({
  gender: profile.gender,
  age: profile.age,
  height_cm: profile.height_cm,
  weight_kg: profile.weight_kg,
  activity_level: profile.activity_level,
  fitness_level: profile.fitness_level,
  goal: profile.goal,
  goal_type: profile.goal_type,
  target_weight: profile.target_weight,
  dietary_restrictions: profile.dietary_restrictions,
  food_allergies: profile.food_allergies,
  disliked_foods: profile.disliked_foods,
  injuries: profile.injuries,
  available_equipment: profile.available_equipment,
  training_days_per_week: profile.training_days_per_week,
  wake_up_time: profile.wake_up_time,
  sleep_time: profile.sleep_time,
  meal_count: profile.meal_count,
  local_culture: profile.local_culture,
  budget: profile.budget_level,
  caloric_target: profile.caloric_target,
  protein_target_g: profile.protein_target_g,
  carb_target_g: profile.carb_target_g,
  fat_target_g: profile.fat_target_g
}, null, 2);

return [{
  json: {
    userName: trigger.firstName,
    userProfile,
    currentDate,
    ragContext: knowledgeDocs,
    userRagContext: userDocs,
    userId: trigger.userId,
    telegramId: trigger.telegramId,
    chatId: trigger.chatId,
    text: trigger.text,
    planType: trigger.planType
  }
}];
```

#### Nodo 6: AI Agent

- **Tipo**: AI Agent (LangChain)
- **Configuración del agente**:
  - **Agent Type**: OpenAI Functions Agent
  - **System Prompt**: cargado desde `prompts/system-prompt.md` con las siguientes variables inyectadas dinámicamente:
    - `{{userName}}` → `{{ $json.userName }}`
    - `{{userProfile}}` → `{{ $json.userProfile }}`
    - `{{currentDate}}` → `{{ $json.currentDate }}`
    - `{{ragContext}}` → `{{ $json.ragContext }}`
    - `{{userRagContext}}` → `{{ $json.userRagContext }}`
  - **Input**: `{{ $json.text }}`
- **Modelo conectado**: OpenAI Chat Model (ver nodo 7)
- **Memoria conectada**: Window Buffer Memory (ver nodo 8)
- **Tools conectados**: nodos 9 a 15

#### Nodo 7: OpenAI Chat Model

- **Tipo**: OpenAI Chat Model (LangChain)
- **Credencial**: `FitAI OpenAI`
- **Modelo**: `gpt-4o`
- **Temperature**: `0.7`
- **Max Tokens**: `1024`
- **Frequency Penalty**: `0.1` (para reducir repeticiones)
- **Presence Penalty**: `0.1`

Conectado al nodo AI Agent como proveedor de modelo.

#### Nodo 8: Window Buffer Memory

- **Tipo**: Window Buffer Memory (LangChain)
- **Session Key**: `fitai_{{ $json.userId }}`
- **Window Size**: `10` (mantiene las últimas 10 interacciones, es decir 20 mensajes: usuario + asistente)
- **Context Window**: almacenado en la base de datos interna de n8n

Conectado al nodo AI Agent como proveedor de memoria.

#### Nodo 9: Tool - generate_meal_plan (Execute Sub-Workflow)

- **Tipo**: Tool - Workflow (LangChain)
- **Nombre de la tool**: `generate_meal_plan`
- **Descripción**: `Genera un plan de comidas semanal personalizado para el usuario basado en su perfil nutricional, restricciones dietéticas, objetivo y preferencias culturales. Usa esta herramienta cuando el usuario pida un nuevo plan de comidas o cambiar su plan actual.`
- **Workflow**: `FitAI - Meal Plan Generator`
- **Datos enviados**: `userId`, `chatId`, `planType`

#### Nodo 10: Tool - generate_workout_plan (Execute Sub-Workflow)

- **Tipo**: Tool - Workflow (LangChain)
- **Nombre de la tool**: `generate_workout_plan`
- **Descripción**: `Genera un plan de entrenamiento semanal personalizado basado en el nivel de fitness del usuario, equipamiento disponible, lesiones y días de entrenamiento por semana. Usa esta herramienta cuando el usuario pida una rutina de ejercicios o cambiar su rutina actual.`
- **Workflow**: `FitAI - Workout Plan Generator`
- **Datos enviados**: `userId`, `chatId`, `planType`

#### Nodo 11: Tool - calculate_progress (Execute Sub-Workflow)

- **Tipo**: Tool - Workflow (LangChain)
- **Nombre de la tool**: `calculate_progress`
- **Descripción**: `Calcula y analiza el progreso del usuario incluyendo cambio de peso, IMC, porcentaje hacia el objetivo, tasa semanal de cambio y detección de mesetas. Usa esta herramienta cuando el usuario pregunte por su progreso o quiera saber cómo va.`
- **Workflow**: `FitAI - Progress Calculator`
- **Datos enviados**: `userId`

#### Nodo 12: Tool - search_knowledge (Qdrant HTTP Request)

- **Tipo**: Tool - HTTP Request (LangChain)
- **Nombre de la tool**: `search_knowledge`
- **Descripción**: `Busca información especializada en la base de conocimiento de nutrición y fitness. Usa esta herramienta cuando necesites datos técnicos sobre nutrición, ejercicios, suplementación o principios de entrenamiento para responder al usuario.`
- **Método**: POST
- **URL**: `http://qdrant:6333/collections/knowledge_rag/points/search`
- **Body**:

```json
{
  "vector": "{{ $fromAI('query_embedding') }}",
  "limit": 5,
  "score_threshold": 0.7,
  "with_payload": true
}
```

**Nota**: el embedding del query se genera previamente con un nodo Embeddings de OpenAI dentro de la tool chain.

#### Nodo 13: Tool - get_user_history (Qdrant HTTP Request)

- **Tipo**: Tool - HTTP Request (LangChain)
- **Nombre de la tool**: `get_user_history`
- **Descripción**: `Busca información personal histórica del usuario como preferencias previas, logros pasados, recetas favoritas y patrones. Usa esta herramienta cuando necesites contexto personal del usuario que no esté en la conversación reciente.`
- **Método**: POST
- **URL**: `http://qdrant:6333/collections/user_rag/points/search`
- **Body**:

```json
{
  "vector": "{{ $fromAI('query_embedding') }}",
  "limit": 5,
  "score_threshold": 0.65,
  "with_payload": true,
  "filter": {
    "must": [
      { "key": "user_id", "match": { "value": "{{ $json.userId }}" } }
    ]
  }
}
```

#### Nodo 14: Tool - log_weight (Code + PostgreSQL)

- **Tipo**: Tool - Code (LangChain)
- **Nombre de la tool**: `log_weight`
- **Descripción**: `Registra el peso actual del usuario. Usa esta herramienta cuando el usuario reporte su peso. El parámetro weight_kg es el peso en kilogramos.`
- **Parámetros de entrada**:
  - `weight_kg` (number, required): peso en kilogramos
  - `notes` (string, optional): notas adicionales
- **Implementación interna**: nodo Code que ejecuta un INSERT y un UPDATE:

```javascript
// Se ejecuta como Code Node dentro del tool
// INSERT en weight_logs
const insertQuery = `
  INSERT INTO weight_logs (user_id, weight_kg, notes, logged_at)
  VALUES ($1, $2, $3, CURRENT_DATE)
  RETURNING id, weight_kg, logged_at;
`;

// UPDATE en user_profiles (actualizar peso actual)
const updateQuery = `
  UPDATE user_profiles
  SET weight_kg = $1, updated_at = NOW()
  WHERE user_id = $2;
`;
```

Después de insertar, recalcula BMR, TDEE y targets calóricos, y actualiza `user_profiles`.

#### Nodo 15: Tool - get_current_plan (PostgreSQL)

- **Tipo**: Tool - Code (LangChain)
- **Nombre de la tool**: `get_current_plan`
- **Descripción**: `Obtiene el plan actual activo del usuario (de comidas o de ejercicio). Usa esta herramienta cuando el usuario pregunte qué debe comer hoy, cuál es su rutina de hoy, o cuando necesites consultar el plan vigente.`
- **Parámetros de entrada**:
  - `plan_type` (string, enum: `meal`, `workout`): tipo de plan a consultar
- **Query (meal)**:

```sql
SELECT plan_json, total_calories, generated_at
FROM meal_plans
WHERE user_id = $1 AND is_active = true
ORDER BY generated_at DESC
LIMIT 1;
```

- **Query (workout)**:

```sql
SELECT plan_json, fitness_level, generated_at
FROM exercise_plans
WHERE user_id = $1 AND is_active = true
ORDER BY generated_at DESC
LIMIT 1;
```

#### Nodo 16: Send Response to Telegram (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Build Context').item.json.chatId }}`
- **Texto**: `{{ $json.output }}` (salida del AI Agent)
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`
- **Opciones adicionales**:
  - Disable Web Page Preview: `true`

#### Nodo 17: Log Conversation (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO conversation_logs (user_id, message_text, response_text, message_type, tokens_used, tools_called, processing_ms)
VALUES ($1, $2, $3, $4, $5, $6, $7);
```

- **Parámetros**:
  - `$1`: `userId`
  - `$2`: texto del mensaje original
  - `$3`: respuesta del agente
  - `$4`: tipo de mensaje
  - `$5`: tokens usados (extraídos de la metadata del AI Agent)
  - `$6`: array de tools invocadas
  - `$7`: tiempo de procesamiento en milisegundos

#### Nodo 18: Trigger RAG Indexer (Execute Sub-Workflow)

- **Tipo**: Execute Sub-Workflow
- **Workflow**: `FitAI - RAG Personal Indexer`
- **Modo**: asíncrono (no espera respuesta, fire-and-forget)
- **Datos enviados**:

```json
{
  "userId": "{{ $json.userId }}",
  "userMessage": "{{ $json.text }}",
  "agentResponse": "{{ $json.output }}",
  "toolsCalled": "{{ $json.toolsCalled }}"
}
```

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Load User Profile (PostgreSQL)
  → Search Knowledge RAG (Qdrant)     ← en paralelo
  → Search User RAG (Qdrant)          ← en paralelo
  → Build Context (Code)
    → AI Agent (con tools conectados)
      ├─ [Si tool call] → Ejecuta sub-workflow correspondiente → regresa al agente
      └─ [Respuesta final] → Send Response to Telegram
            → Log Conversation (PostgreSQL)
            → Trigger RAG Indexer (asíncrono)
```

Los nodos 2, 3 y 4 (Load User Profile, Search Knowledge RAG, Search User RAG) se ejecutan en paralelo para minimizar la latencia. Sus salidas se combinan en Build Context.

### Manejo de Errores

- **OpenAI API Error**: si GPT-4o retorna un error (429 rate limit, 500 server error, timeout), se reintenta 2 veces con backoff exponencial (1s, 3s). Si persiste, se envía al usuario: `Estoy teniendo dificultades técnicas en este momento. Por favor intenta de nuevo en unos minutos.`
- **Tool Execution Error**: si alguna tool falla, el agente recibe el error como resultado de la tool y genera una respuesta adecuada explicando que no pudo completar la acción solicitada.
- **Qdrant Error**: si Qdrant no está disponible, los nodos de búsqueda RAG retornan arrays vacíos. El agente funciona sin contexto RAG (degradación graceful).
- **PostgreSQL Error en Load Profile**: se detiene la ejecución y se envía mensaje de error genérico al usuario.
- **Telegram Send Error**: se registra en los logs pero no se reintenta (Telegram podría haber bloqueado al bot o el chat no existe).

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI OpenAI` | API key de OpenAI para GPT-4o y embeddings |
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Credencial n8n | `FitAI Qdrant` | Conexión a Qdrant (URL + API key si aplica) |
| Variable de entorno | `OPENAI_MODEL` | Modelo de OpenAI (default: `gpt-4o`) |
| Variable de entorno | `AI_TEMPERATURE` | Temperature del modelo (default: `0.7`) |
| Variable de entorno | `AI_MAX_TOKENS` | Max tokens de respuesta (default: `1024`) |
| Variable de entorno | `MEMORY_WINDOW_SIZE` | Tamaño de ventana de memoria (default: `10`) |

---

## 3. FitAI - Onboarding Flow

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Onboarding Flow` |
| **Trigger** | Sub-workflow (llamado por `FitAI - Telegram Webhook Handler`) |
| **Propósito** | Guía conversacional paso a paso para recopilar todos los datos del perfil del usuario nuevo. Gestiona el estado de onboarding en Redis y, al completarse, calcula las métricas base (BMR, TDEE, targets) y genera el primer plan de comidas. |
| **Activación** | Solo via Execute Sub-Workflow |

### Descripción del Propósito

Cuando un usuario tiene membresía activa pero no ha completado el onboarding (`user_profiles.onboarding_completed = false` o no existe registro), este workflow toma el control. Mantiene un estado de conversación en Redis que persiste entre mensajes (cada mensaje del usuario es una nueva ejecución del webhook y por tanto una nueva invocación de este sub-workflow). El flujo es conversacional: se hace una pregunta, se espera la respuesta del usuario, se valida, se guarda el dato parcial, y se avanza al siguiente paso. Al completar todas las preguntas, calcula las métricas metabólicas y guarda el perfil completo en PostgreSQL.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada**: `userId`, `telegramId`, `chatId`, `firstName`, `text`

#### Nodo 2: Get Onboarding State (Redis)

- **Tipo**: Redis - Get
- **Key**: `onboarding:{{ $json.telegramId }}`
- **Credencial**: `FitAI Redis`

**Salida**: objeto JSON con el estado actual del onboarding, o `null` si es la primera interacción.

Estructura del estado en Redis:

```json
{
  "step": 0,
  "data": {},
  "lastUpdated": "2026-03-26T10:00:00Z"
}
```

Los pasos (steps) del onboarding:

| Step | Pregunta | Campo | Validación |
|------|----------|-------|------------|
| 0 | Mensaje de bienvenida + pregunta género | `gender` | `male` o `female` |
| 1 | Edad | `age` | Número entre 14 y 100 |
| 2 | Estatura (cm) | `height_cm` | Número entre 100 y 250 |
| 3 | Peso actual (kg) | `weight_kg` | Número entre 30 y 300 |
| 4 | Nivel de actividad | `activity_level` | Uno de los 5 niveles del enum |
| 5 | Nivel de fitness | `fitness_level` | `beginner`, `intermediate`, `advanced` |
| 6 | Objetivo | `goal` | Uno de los 4 tipos de objetivo |
| 7 | Peso objetivo (si aplica) | `target_weight` | Número válido o "skip" |
| 8 | Restricciones dietéticas | `dietary_restrictions` | Texto libre o "ninguna" |
| 9 | Alergias alimentarias | `food_allergies` | Texto libre o "ninguna" |
| 10 | Alimentos que no le gustan | `disliked_foods` | Texto libre o "ninguna" |
| 11 | Lesiones o limitaciones | `injuries` | Texto libre o "ninguna" |
| 12 | Equipamiento disponible | `available_equipment` | Texto libre o "ninguno" |
| 13 | Días de entrenamiento por semana | `training_days_per_week` | Número entre 1 y 7 |
| 14 | Hora de despertar | `wake_up_time` | Formato HH:MM |
| 15 | Hora de dormir | `sleep_time` | Formato HH:MM |
| 16 | Número de comidas al día | `meal_count` | Número entre 2 y 6 |
| 17 | Presupuesto para ingredientes | `budget_level` | `low` / `medium` / `high` |
| 18 | Confirmación de datos | — | "sí" o "corregir" |

#### Nodo 3: Initialize or Resume? (IF)

- **Tipo**: IF
- **Condición**: el resultado de Redis es `null` o vacío
- **Rama true (primer contacto)**: nodo "Initialize Onboarding"
- **Rama false (continuación)**: nodo "Parse Onboarding State"

#### Nodo 4: Initialize Onboarding (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: crear el estado inicial del onboarding y preparar el mensaje de bienvenida.

```javascript
const state = {
  step: 0,
  data: {},
  lastUpdated: new Date().toISOString()
};

return [{
  json: {
    state,
    responseMessage: `¡Hola ${$json.firstName}! Bienvenido/a a FitAI.

Soy tu asistente personal de nutrición y fitness. Para poder ayudarte de la mejor manera, necesito conocerte un poco.

Vamos a empezar con unas preguntas rápidas (toma unos 3 minutos).

¿Cuál es tu género biológico? Esto me ayuda a calcular tus necesidades calóricas con precisión.

1️⃣ Masculino
2️⃣ Femenino`
  }
}];
```

#### Nodo 5: Parse Onboarding State (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: parsear el estado almacenado en Redis y la respuesta del usuario para determinar qué hacer.

```javascript
const stateStr = $('Get Onboarding State').first().json.value;
const state = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
const userText = $('Sub-Workflow Trigger').first().json.text.trim();

return [{
  json: {
    state,
    userText,
    currentStep: state.step
  }
}];
```

#### Nodo 6: Validate and Process Step (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: validar la respuesta del usuario para el paso actual, guardar el dato si es válido, preparar la siguiente pregunta o un mensaje de error de validación.

Este nodo contiene un switch extenso que valida cada paso según su tipo:

```javascript
const { state, userText } = $json;
const step = state.step;
let isValid = false;
let errorMessage = '';
let fieldName = '';
let fieldValue = null;
let nextQuestion = '';

switch (step) {
  case 0: // gender
    fieldName = 'gender';
    if (['1', 'masculino', 'hombre', 'male'].includes(userText.toLowerCase())) {
      fieldValue = 'male'; isValid = true;
    } else if (['2', 'femenino', 'mujer', 'female'].includes(userText.toLowerCase())) {
      fieldValue = 'female'; isValid = true;
    } else {
      errorMessage = 'Por favor responde con 1 (Masculino) o 2 (Femenino).';
    }
    if (isValid) nextQuestion = '¿Cuántos años tienes?';
    break;

  case 1: // age
    fieldName = 'age';
    const age = parseInt(userText);
    if (!isNaN(age) && age >= 14 && age <= 100) {
      fieldValue = age; isValid = true;
      nextQuestion = '¿Cuánto mides? (en centímetros, ej: 170)';
    } else {
      errorMessage = 'Por favor ingresa una edad válida entre 14 y 100 años.';
    }
    break;

  case 2: // height_cm
    fieldName = 'height_cm';
    const height = parseFloat(userText.replace(',', '.'));
    if (!isNaN(height) && height >= 100 && height <= 250) {
      fieldValue = height; isValid = true;
      nextQuestion = '¿Cuánto pesas actualmente? (en kilogramos, ej: 75.5)';
    } else {
      errorMessage = 'Por favor ingresa una estatura válida entre 100 y 250 cm.';
    }
    break;

  case 3: // weight_kg
    fieldName = 'weight_kg';
    const weight = parseFloat(userText.replace(',', '.'));
    if (!isNaN(weight) && weight >= 30 && weight <= 300) {
      fieldValue = weight; isValid = true;
      nextQuestion = `¿Cuál es tu nivel de actividad física?\n\n1️⃣ Sedentario (trabajo de oficina, poco ejercicio)\n2️⃣ Ligeramente activo (ejercicio 1-3 días/semana)\n3️⃣ Moderadamente activo (ejercicio 3-5 días/semana)\n4️⃣ Muy activo (ejercicio 6-7 días/semana)\n5️⃣ Extra activo (atleta o trabajo muy físico)`;
    } else {
      errorMessage = 'Por favor ingresa un peso válido entre 30 y 300 kg.';
    }
    break;

  case 4: // activity_level
    fieldName = 'activity_level';
    const activityMap = {
      '1': 'sedentary', '2': 'lightly_active', '3': 'moderately_active',
      '4': 'very_active', '5': 'extra_active'
    };
    if (activityMap[userText]) {
      fieldValue = activityMap[userText]; isValid = true;
      nextQuestion = `¿Cuál es tu nivel de experiencia con el ejercicio?\n\n1️⃣ Principiante (menos de 6 meses)\n2️⃣ Intermedio (6 meses a 2 años)\n3️⃣ Avanzado (más de 2 años)`;
    } else {
      errorMessage = 'Por favor responde con un número del 1 al 5.';
    }
    break;

  case 5: // fitness_level
    fieldName = 'fitness_level';
    const fitnessMap = { '1': 'beginner', '2': 'intermediate', '3': 'advanced' };
    if (fitnessMap[userText]) {
      fieldValue = fitnessMap[userText]; isValid = true;
      nextQuestion = `¿Cuál es tu objetivo principal?\n\n1️⃣ Perder peso\n2️⃣ Ganar músculo\n3️⃣ Mantener peso\n4️⃣ Recomposición corporal`;
    } else {
      errorMessage = 'Por favor responde con 1, 2 o 3.';
    }
    break;

  case 6: // goal
    fieldName = 'goal';
    const goalMap = {
      '1': 'lose_weight', '2': 'gain_muscle',
      '3': 'maintain', '4': 'recomposition'
    };
    if (goalMap[userText]) {
      fieldValue = goalMap[userText]; isValid = true;
      if (goalMap[userText] === 'lose_weight' || goalMap[userText] === 'gain_muscle') {
        nextQuestion = '¿Cuál es tu peso objetivo? (en kg, ej: 70)\nSi no tienes un número específico, escribe "no sé".';
      } else {
        nextQuestion = '¿Tienes alguna restricción dietética? (ej: vegetariano, vegano, sin gluten, etc.)\nSi no tienes ninguna, escribe "ninguna".';
        // Skip target_weight step
      }
    } else {
      errorMessage = 'Por favor responde con un número del 1 al 4.';
    }
    break;

  // ... pasos 7-17 con validación similar
  // El patrón continúa para cada campo del perfil
}

if (isValid) {
  state.data[fieldName] = fieldValue;
  state.step = step + 1;
  // Ajuste para saltar step 7 si el objetivo es maintain o recomposition
  if (step === 6 && (fieldValue === 'maintain' || fieldValue === 'recomposition')) {
    state.step = 8; // Saltar target_weight
  }
  state.lastUpdated = new Date().toISOString();
}

return [{
  json: {
    state,
    isValid,
    responseMessage: isValid ? nextQuestion : errorMessage,
    isComplete: state.step > 17
  }
}];
```

#### Nodo 7: Save Onboarding State (Redis)

- **Tipo**: Redis - Set
- **Key**: `onboarding:{{ $('Sub-Workflow Trigger').item.json.telegramId }}`
- **Value**: `{{ JSON.stringify($json.state) }}`
- **TTL**: `86400` (24 horas)
- **Credencial**: `FitAI Redis`

#### Nodo 8: Is Onboarding Complete? (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.isComplete }}` es `true`
- **Rama true**: nodo "Calculate Metrics"
- **Rama false**: nodo "Send Question"

#### Nodo 9: Send Question (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Sub-Workflow Trigger').item.json.chatId }}`
- **Texto**: `{{ $json.responseMessage }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

Nodo terminal para esta ejecución. El usuario responderá con otro mensaje que volverá a activar el webhook y eventualmente este sub-workflow.

#### Nodo 10: Calculate Metrics (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: calcular BMR (tasa metabólica basal), TDEE (gasto energético total diario) y targets de macronutrientes.

```javascript
const data = $json.state.data;

// Mifflin-St Jeor Equation
let bmr;
if (data.gender === 'male') {
  bmr = (10 * data.weight_kg) + (6.25 * data.height_cm) - (5 * data.age) + 5;
} else {
  bmr = (10 * data.weight_kg) + (6.25 * data.height_cm) - (5 * data.age) - 161;
}

// Activity multipliers
const activityMultipliers = {
  'sedentary': 1.2,
  'lightly_active': 1.375,
  'moderately_active': 1.55,
  'very_active': 1.725,
  'extra_active': 1.9
};

const tdee = bmr * activityMultipliers[data.activity_level];

// Caloric target based on goal
let caloricTarget;
switch (data.goal) {
  case 'lose_weight':
    caloricTarget = tdee - 500; // Deficit of 500 kcal
    break;
  case 'gain_muscle':
    caloricTarget = tdee + 300; // Surplus of 300 kcal
    break;
  case 'maintain':
    caloricTarget = tdee;
    break;
  case 'recomposition':
    caloricTarget = tdee - 100; // Slight deficit
    break;
}

// Macronutrient targets
const proteinTarget = data.weight_kg * (data.goal === 'gain_muscle' ? 2.2 : 1.8);
const fatTarget = (caloricTarget * 0.25) / 9;
const carbTarget = (caloricTarget - (proteinTarget * 4) - (fatTarget * 9)) / 4;

return [{
  json: {
    ...data,
    bmr: Math.round(bmr * 100) / 100,
    tdee: Math.round(tdee * 100) / 100,
    caloric_target: Math.round(caloricTarget * 100) / 100,
    protein_target_g: Math.round(proteinTarget * 10) / 10,
    carb_target_g: Math.round(carbTarget * 10) / 10,
    fat_target_g: Math.round(fatTarget * 10) / 10,
    userId: $('Sub-Workflow Trigger').first().json.userId,
    telegramId: $('Sub-Workflow Trigger').first().json.telegramId,
    chatId: $('Sub-Workflow Trigger').first().json.chatId,
    firstName: $('Sub-Workflow Trigger').first().json.firstName
  }
}];
```

#### Nodo 11: Save User Profile (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO user_profiles (
  user_id, gender, age, height_cm, weight_kg,
  activity_level, fitness_level, goal,
  dietary_restrictions, food_allergies, disliked_foods,
  injuries, available_equipment, training_days_per_week,
  wake_up_time, sleep_time, meal_count, local_culture, budget_level,
  onboarding_completed, onboarding_completed_at,
  bmr, tdee, caloric_target,
  protein_target_g, carb_target_g, fat_target_g
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8,
  $9, $10, $11,
  $12, $13, $14,
  $15, $16, $17, 'mexican',
  true, NOW(),
  $18, $19, $20,
  $21, $22, $23
)
ON CONFLICT (user_id)
DO UPDATE SET
  gender = EXCLUDED.gender,
  age = EXCLUDED.age,
  height_cm = EXCLUDED.height_cm,
  weight_kg = EXCLUDED.weight_kg,
  activity_level = EXCLUDED.activity_level,
  fitness_level = EXCLUDED.fitness_level,
  goal = EXCLUDED.goal,
  dietary_restrictions = EXCLUDED.dietary_restrictions,
  food_allergies = EXCLUDED.food_allergies,
  disliked_foods = EXCLUDED.disliked_foods,
  injuries = EXCLUDED.injuries,
  available_equipment = EXCLUDED.available_equipment,
  training_days_per_week = EXCLUDED.training_days_per_week,
  wake_up_time = EXCLUDED.wake_up_time,
  sleep_time = EXCLUDED.sleep_time,
  meal_count = EXCLUDED.meal_count,
  budget_level = EXCLUDED.budget_level,
  onboarding_completed = true,
  onboarding_completed_at = NOW(),
  bmr = EXCLUDED.bmr,
  tdee = EXCLUDED.tdee,
  caloric_target = EXCLUDED.caloric_target,
  protein_target_g = EXCLUDED.protein_target_g,
  carb_target_g = EXCLUDED.carb_target_g,
  fat_target_g = EXCLUDED.fat_target_g;
```

#### Nodo 12: Save Initial Goal (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO goals (user_id, goal_type, target_weight, start_weight, start_date, is_active)
VALUES ($1, $2, $3, $4, CURRENT_DATE, true);
```

- **Parámetros**: `userId`, `goal`, `target_weight` (puede ser null), `weight_kg`

#### Nodo 13: Save Initial Weight Log (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO weight_logs (user_id, weight_kg, notes, logged_at)
VALUES ($1, $2, 'Peso inicial - onboarding', CURRENT_DATE);
```

#### Nodo 14: Delete Onboarding State (Redis)

- **Tipo**: Redis - Delete
- **Key**: `onboarding:{{ $('Sub-Workflow Trigger').item.json.telegramId }}`
- **Credencial**: `FitAI Redis`

Limpia el estado de onboarding de Redis ya que se completó exitosamente.

#### Nodo 15: Generate First Meal Plan (Execute Sub-Workflow)

- **Tipo**: Execute Sub-Workflow
- **Workflow**: `FitAI - Meal Plan Generator`
- **Datos enviados**: `userId`, `chatId`, `planType` (del membership)

#### Nodo 16: Send Completion Message (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.chatId }}`
- **Texto**:

```
¡Perfecto, {{ $json.firstName }}! Tu perfil está completo.

Aquí están tus datos calculados:

- TMB (Tasa Metabólica Basal): {{ $json.bmr }} kcal
- TDEE (Gasto Energético Diario): {{ $json.tdee }} kcal
- Objetivo calórico: {{ $json.caloric_target }} kcal/día
- Proteína: {{ $json.protein_target_g }}g
- Carbohidratos: {{ $json.carb_target_g }}g
- Grasa: {{ $json.fat_target_g }}g

Ya generé tu primer plan de comidas. Puedes pedirme verlo en cualquier momento.

¡Estoy listo para ayudarte a alcanzar tu objetivo! Pregúntame lo que necesites.
```

- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Get Onboarding State (Redis)
    → Initialize or Resume? (IF)
        ├─ true (primer contacto) → Initialize Onboarding
        │     → Save Onboarding State (Redis)
        │     → Send Question (Telegram) → FIN
        └─ false (continuación) → Parse Onboarding State
              → Validate and Process Step (Code)
                → Save Onboarding State (Redis)
                → Is Onboarding Complete? (IF)
                    ├─ false → Send Question (Telegram) → FIN
                    └─ true → Calculate Metrics (Code)
                          → Save User Profile (PostgreSQL)
                          → Save Initial Goal (PostgreSQL)         ← en paralelo
                          → Save Initial Weight Log (PostgreSQL)   ← en paralelo
                          → Delete Onboarding State (Redis)
                          → Generate First Meal Plan (sub-workflow)
                          → Send Completion Message (Telegram) → FIN
```

### Manejo de Errores

- **Redis no disponible al inicio**: si no se puede leer el estado de onboarding, se asume que es un nuevo inicio y se muestra el mensaje de bienvenida (paso 0). Si no se puede escribir en Redis, se notifica al usuario que intente de nuevo.
- **Validación fallida**: no es un error del sistema; simplemente se reenvía la pregunta con un mensaje explicando el formato esperado. El step no avanza.
- **State expirado (TTL)**: si pasaron más de 24 horas sin actividad, el estado de Redis expira. El usuario debe reiniciar el onboarding desde el principio. Se le notifica amigablemente.
- **PostgreSQL error al guardar perfil**: se captura el error, se envía un mensaje al usuario indicando que hubo un problema y que intente de nuevo, y se notifica al admin. El estado de Redis NO se elimina para que el usuario pueda reintentar sin repetir todas las preguntas.
- **Error en cálculo de métricas**: se logea el error y se usan valores por defecto conservadores. Se marca en el perfil para revisión manual.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Credencial n8n | `FitAI Redis` | Conexión a Redis |
| Variable de entorno | `ONBOARDING_TTL` | TTL del estado en Redis en segundos (default: `86400`) |

---

## 4. FitAI - Meal Plan Generator

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Meal Plan Generator` |
| **Trigger** | Tool llamada por el agente principal (o sub-workflow desde Onboarding) |
| **Propósito** | Genera un plan de comidas semanal personalizado usando GPT-4o con el perfil completo del usuario, lo parsea como JSON estructurado y lo guarda en la tabla `meal_plans`. |
| **Activación** | Solo via Tool call del AI Agent o Execute Sub-Workflow |

### Descripción del Propósito

Este workflow recibe el ID del usuario, carga su perfil nutricional completo de PostgreSQL, construye un prompt detallado basado en la plantilla `prompts/meal-plan-generation.md` con todas las variables personalizadas (calorías, macros, restricciones, cultura, preferencias), llama a GPT-4o para generar el plan en formato JSON, valida y parsea la respuesta, desactiva planes anteriores, guarda el nuevo plan en `meal_plans`, y retorna una versión formateada para que el agente la incluya en su respuesta al usuario.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger / Tool Input

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada**: `userId`, `chatId`, `planType`

#### Nodo 2: Load User Profile (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT up.*, g.goal_type, g.target_weight,
       u.first_name, u.language_code
FROM user_profiles up
JOIN users u ON up.user_id = u.id
LEFT JOIN goals g ON up.user_id = g.user_id AND g.is_active = true
WHERE up.user_id = $1;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 3: Get Previous Plans (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT plan_json
FROM meal_plans
WHERE user_id = $1 AND is_active = true
ORDER BY generated_at DESC
LIMIT 1;
```

- **Parámetros**: `[$json.userId]`

**Propósito**: obtener el plan anterior (si existe) para pasarlo al prompt y que GPT-4o genere variedad, evitando repetir las mismas comidas.

#### Nodo 4: Build Meal Plan Prompt (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: construir el prompt completo para la generación del plan usando la plantilla y los datos del usuario.

```javascript
const profile = $('Load User Profile').first().json;
const previousPlan = $('Get Previous Plans').first()?.json?.plan_json || null;

const weekNumber = getWeekNumber(new Date());
const year = new Date().getFullYear();

const prompt = `
Genera un plan de comidas semanal (lunes a domingo) para el siguiente perfil:

PERFIL DEL USUARIO:
- Género: ${profile.gender === 'male' ? 'Masculino' : 'Femenino'}
- Edad: ${profile.age} años
- Peso: ${profile.weight_kg} kg
- Estatura: ${profile.height_cm} cm
- Objetivo: ${translateGoal(profile.goal)}
- Nivel de actividad: ${translateActivity(profile.activity_level)}
- Cultura gastronómica: ${profile.local_culture}
- Presupuesto para ingredientes: ${profile.budget_level === 'low' ? 'Económico' : profile.budget_level === 'high' ? 'Sin restricción' : 'Moderado'}

TARGETS NUTRICIONALES:
- Calorías diarias: ${profile.caloric_target} kcal
- Proteína: ${profile.protein_target_g}g
- Carbohidratos: ${profile.carb_target_g}g
- Grasa: ${profile.fat_target_g}g
- Comidas al día: ${profile.meal_count}

RESTRICCIONES:
- Restricciones dietéticas: ${profile.dietary_restrictions?.join(', ') || 'Ninguna'}
- Alergias: ${profile.food_allergies?.join(', ') || 'Ninguna'}
- Alimentos que no le gustan: ${profile.disliked_foods?.join(', ') || 'Ninguno'}

${previousPlan ? `PLAN ANTERIOR (evita repetir las mismas comidas):
${JSON.stringify(previousPlan).substring(0, 500)}` : ''}

INSTRUCCIONES DE FORMATO:
Responde ÚNICAMENTE con un JSON válido con la siguiente estructura (sin texto adicional):
{
  "days": {
    "monday": { "meals": [...] },
    ...
  },
  "daily_totals": { "calories": N, "protein_g": N, "carb_g": N, "fat_g": N },
  "shopping_list": [...],
  "notes": "..."
}

Cada meal debe tener: name, type (breakfast/lunch/dinner/snack), foods (array con name, quantity, unit, calories, protein_g, carb_g, fat_g), total_calories.
`;

return [{
  json: {
    prompt,
    userId: $json.userId,
    weekNumber,
    year,
    profile
  }
}];

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function translateGoal(goal) {
  const map = { lose_weight: 'Perder peso', gain_muscle: 'Ganar músculo', maintain: 'Mantener peso', recomposition: 'Recomposición corporal' };
  return map[goal] || goal;
}

function translateActivity(level) {
  const map = { sedentary: 'Sedentario', lightly_active: 'Ligeramente activo', moderately_active: 'Moderadamente activo', very_active: 'Muy activo', extra_active: 'Extra activo' };
  return map[level] || level;
}
```

#### Nodo 5: Generate Meal Plan (OpenAI)

- **Tipo**: OpenAI - Chat Completion
- **Credencial**: `FitAI OpenAI`
- **Modelo**: `gpt-4o`
- **Temperature**: `0.8` (ligeramente más creativo para variedad en los planes)
- **Max Tokens**: `4096` (los planes son extensos)
- **System Message**: contenido de `prompts/meal-plan-generation.md`
- **User Message**: `{{ $json.prompt }}`
- **Response Format**: `json_object`

#### Nodo 6: Parse and Validate Plan (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: parsear el JSON retornado por GPT-4o, validar la estructura y calcular totales.

```javascript
const response = $('Generate Meal Plan').first().json.message.content;
let plan;

try {
  plan = JSON.parse(response);
} catch (e) {
  // Intentar extraer JSON de la respuesta si tiene texto adicional
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    plan = JSON.parse(jsonMatch[0]);
  } else {
    throw new Error('No se pudo parsear el plan de comidas generado por OpenAI');
  }
}

// Validar estructura mínima
if (!plan.days || typeof plan.days !== 'object') {
  throw new Error('El plan no contiene la estructura de días esperada');
}

const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
for (const day of dayNames) {
  if (!plan.days[day] || !plan.days[day].meals) {
    throw new Error(`El plan no contiene datos para ${day}`);
  }
}

// Calcular total de calorías promedio
const totalCalories = dayNames.reduce((sum, day) => {
  const dayCalories = plan.days[day].meals.reduce((s, meal) => s + (meal.total_calories || 0), 0);
  return sum + dayCalories;
}, 0) / 7;

return [{
  json: {
    plan,
    totalCalories: Math.round(totalCalories),
    userId: $json.userId,
    weekNumber: $json.weekNumber,
    year: $json.year
  }
}];
```

#### Nodo 7: Deactivate Previous Plans (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
UPDATE meal_plans
SET is_active = false
WHERE user_id = $1 AND is_active = true;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 8: Save New Plan (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO meal_plans (user_id, week_number, year, plan_json, total_calories, is_active, expires_at)
VALUES ($1, $2, $3, $4, $5, true, NOW() + INTERVAL '7 days')
RETURNING id;
```

- **Parámetros**: `userId`, `weekNumber`, `year`, `JSON.stringify(plan)`, `totalCalories`

#### Nodo 9: Format Plan for Response (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: formatear el plan JSON en un texto legible para que el agente lo incluya en su respuesta al usuario.

```javascript
const plan = $json.plan;
let formatted = `Plan de comidas generado (Semana ${$json.weekNumber}, ${$json.year})\n`;
formatted += `Objetivo calórico diario: ~${$json.totalCalories} kcal\n\n`;

const dayTranslations = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles',
  thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo'
};

for (const [day, data] of Object.entries(plan.days)) {
  formatted += `📅 ${dayTranslations[day]}\n`;
  for (const meal of data.meals) {
    formatted += `  🍽 ${meal.name} (${meal.total_calories} kcal)\n`;
    for (const food of meal.foods) {
      formatted += `    - ${food.name}: ${food.quantity} ${food.unit}\n`;
    }
  }
  formatted += '\n';
}

if (plan.shopping_list && plan.shopping_list.length > 0) {
  formatted += '🛒 Lista de compras:\n';
  plan.shopping_list.forEach(item => {
    formatted += `  - ${item}\n`;
  });
}

return [{ json: { formattedPlan: formatted } }];
```

**Salida**: el texto formateado se retorna al agente como resultado de la tool.

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Load User Profile (PostgreSQL)    ← en paralelo
  → Get Previous Plans (PostgreSQL)   ← en paralelo
  → Build Meal Plan Prompt (Code)
    → Generate Meal Plan (OpenAI)
      → Parse and Validate Plan (Code)
        → Deactivate Previous Plans (PostgreSQL)
          → Save New Plan (PostgreSQL)
            → Format Plan for Response (Code)
              → Return to calling workflow
```

Este workflow tiene un flujo lineal sin ramificaciones condicionales. Las únicas bifurcaciones posibles son por errores.

### Manejo de Errores

- **OpenAI retorna JSON inválido**: el nodo Parse and Validate intenta extraer JSON con regex. Si no lo consigue, lanza un error que se captura y se retorna al agente con el mensaje: `No pude generar el plan de comidas en este momento. Por favor intenta de nuevo.`
- **OpenAI retorna plan incompleto**: la validación de estructura detecta días faltantes y lanza un error descriptivo. Se reintenta la generación 1 vez antes de fallar.
- **PostgreSQL error al guardar**: se logea el error, el plan no se persiste, pero se retorna al usuario igualmente el plan formateado (con una nota de que no se pudo guardar y se regenerará después).
- **Timeout de OpenAI**: con 4096 tokens de respuesta, la generación puede tardar 15-30 segundos. El timeout del nodo OpenAI está configurado a 60 segundos.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI OpenAI` | API key de OpenAI |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Variable de entorno | `MEAL_PLAN_MODEL` | Modelo para generación de planes (default: `gpt-4o`) |
| Variable de entorno | `MEAL_PLAN_TEMPERATURE` | Temperature para planes (default: `0.8`) |
| Variable de entorno | `MEAL_PLAN_MAX_TOKENS` | Max tokens para planes (default: `4096`) |

---

## 5. FitAI - Meal Reminder Scheduler

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Meal Reminder Scheduler` |
| **Trigger** | Cron (3 veces al día: 08:00, 13:30, 19:30 hora del servidor) |
| **Propósito** | Envía recordatorios personalizados de comidas a los usuarios activos, indicándoles qué comida corresponde según su plan actual y su hora habitual de despertar. |
| **Activación** | Siempre activo (cron automático) |

### Descripción del Propósito

Este workflow se ejecuta tres veces al día en horarios correspondientes a los bloques típicos de desayuno, comida y cena. Para cada ejecución, consulta la base de datos para obtener a todos los usuarios activos con membresía vigente y plan de comidas activo. Determina qué comida del día corresponde basándose en la hora actual y la `wake_up_time` del usuario (para personalizar los horarios de cada usuario). Extrae la comida correspondiente del `plan_json` del día actual y envía un mensaje de recordatorio personalizado por Telegram.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Configuración**: tres expresiones cron separadas:
  - `0 8 * * *` (08:00 diario)
  - `30 13 * * *` (13:30 diario)
  - `30 19 * * *` (19:30 diario)
- **Timezone**: `America/Mexico_City`

#### Nodo 2: Get Active Users with Plans (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.telegram_id, u.first_name,
       up.wake_up_time, up.meal_count,
       mp.plan_json
FROM users u
JOIN memberships m ON u.id = m.user_id
  AND m.status = 'active'
  AND m.expires_at > NOW()
JOIN user_profiles up ON u.id = up.user_id
  AND up.onboarding_completed = true
JOIN meal_plans mp ON u.id = mp.user_id
  AND mp.is_active = true
WHERE u.is_active = true;
```

**Salida**: lista de todos los usuarios activos con sus planes de comidas activos.

#### Nodo 3: Has Users? (IF)

- **Tipo**: IF
- **Condición**: el resultado tiene al menos una fila
- **Rama true**: continúa
- **Rama false**: FIN (no hay usuarios activos con planes)

#### Nodo 4: Determine Current Meal (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item
- **Propósito**: para cada usuario, determinar qué comida del día corresponde según la hora actual y su hora de despertar.

```javascript
const now = new Date();
const currentHour = now.getHours();
const currentMinute = now.getMinutes();
const currentTime = currentHour * 60 + currentMinute; // minutos desde medianoche

const [wakeHour, wakeMin] = ($json.wake_up_time || '07:00').split(':').map(Number);
const wakeTime = wakeHour * 60 + wakeMin;

// Determinar el tipo de comida basado en la hora relativa al despertar
const minutesSinceWake = currentTime - wakeTime;
let mealType;
if (minutesSinceWake <= 90) {
  mealType = 'breakfast';
} else if (minutesSinceWake <= 330) { // ~5.5 horas después de despertar
  mealType = 'lunch';
} else {
  mealType = 'dinner';
}

// Obtener el día actual en inglés
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const today = dayNames[now.getDay()];

// Extraer la comida del plan
const plan = typeof $json.plan_json === 'string' ? JSON.parse($json.plan_json) : $json.plan_json;
const todayPlan = plan.days?.[today];
const meal = todayPlan?.meals?.find(m => m.type === mealType);

if (!meal) {
  return [{ json: { skip: true } }];
}

// Formatear los alimentos
const foodList = meal.foods.map(f => `- ${f.name}: ${f.quantity} ${f.unit}`).join('\n');

const mealTypeSpanish = { breakfast: 'desayuno', lunch: 'comida', dinner: 'cena', snack: 'snack' };

return [{
  json: {
    skip: false,
    telegramId: $json.telegram_id,
    firstName: $json.first_name,
    mealType: mealTypeSpanish[mealType],
    mealName: meal.name,
    totalCalories: meal.total_calories,
    foodList
  }
}];
```

#### Nodo 5: Should Send? (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.skip }}` es `false`
- **Rama true**: envía recordatorio
- **Rama false**: FIN para este usuario

#### Nodo 6: Send Meal Reminder (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**:

```
¡Hola {{ $json.firstName }}! Es hora de tu {{ $json.mealType }}.

🍽 {{ $json.mealName }} (~{{ $json.totalCalories }} kcal)

{{ $json.foodList }}

¡Buen provecho! Si necesitas algún ajuste o sustitución, solo dime.
```

- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 7: Log Reminder Sent (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: registrar en los logs que se envió el recordatorio (para debugging y métricas).

```javascript
console.log(`Reminder sent to ${$json.telegramId} for ${$json.mealType} at ${new Date().toISOString()}`);
return [$json];
```

### Lógica de Ramificación

```
Cron Trigger (08:00 / 13:30 / 19:30)
  → Get Active Users with Plans (PostgreSQL)
    → Has Users? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Determine Current Meal (Code)
                → Should Send? (IF)
                    ├─ false → FIN (este usuario)
                    └─ true → Send Meal Reminder (Telegram)
                          → Log Reminder Sent (Code)
```

### Manejo de Errores

- **Sin usuarios activos**: el workflow termina silenciosamente sin error.
- **Plan JSON inválido**: si el `plan_json` de un usuario no se puede parsear, se salta ese usuario y se logea el error. Los demás usuarios reciben su recordatorio normalmente.
- **Telegram error al enviar**: si un usuario tiene el bot bloqueado o el chat no existe, Telegram retorna un error 403. Se captura, se logea, y se continúa con los demás usuarios. Se puede considerar desactivar el usuario después de N errores consecutivos.
- **Error de base de datos**: si PostgreSQL no está disponible, el cron falla completamente. Se notifica al admin a través del Error Workflow global.
- **Batching**: si hay muchos usuarios (100+), los mensajes se envían con un delay de 50ms entre cada uno para respetar los rate limits de la API de Telegram (30 mensajes/segundo).

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Variable de entorno | `REMINDER_TIMEZONE` | Timezone para los cron triggers (default: `America/Mexico_City`) |
| Variable de entorno | `TELEGRAM_BATCH_DELAY_MS` | Delay entre mensajes en batch (default: `50`) |

---

## 6. FitAI - Weight Update Requester

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Weight Update Requester` |
| **Trigger** | Cron (semanal, lunes a las 09:00) |
| **Propósito** | Solicita a los usuarios activos que reporten su peso actual. Cuando el usuario responde con su peso en el chat, el agente principal usa la tool `log_weight` para registrarlo. |
| **Activación** | Siempre activo (cron automático semanal) |

### Descripción del Propósito

Cada lunes por la mañana, este workflow envía un mensaje amigable a cada usuario activo solicitándole que reporte su peso actual. El mensaje incluye su último peso registrado para referencia. Cuando el usuario responde con su peso, el mensaje llega al webhook normal y el agente principal lo procesa, usando la tool `log_weight` para registrarlo en `weight_logs` y actualizar `user_profiles`. Este workflow solo se encarga de la solicitud, no del procesamiento de la respuesta.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `0 9 * * 1` (lunes a las 09:00)
- **Timezone**: `America/Mexico_City`

#### Nodo 2: Get Active Users with Last Weight (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.telegram_id, u.first_name,
       up.weight_kg AS profile_weight,
       wl.weight_kg AS last_logged_weight,
       wl.logged_at AS last_logged_date,
       g.target_weight, g.start_weight
FROM users u
JOIN memberships m ON u.id = m.user_id
  AND m.status = 'active'
  AND m.expires_at > NOW()
JOIN user_profiles up ON u.id = up.user_id
  AND up.onboarding_completed = true
LEFT JOIN LATERAL (
  SELECT weight_kg, logged_at
  FROM weight_logs
  WHERE user_id = u.id
  ORDER BY logged_at DESC
  LIMIT 1
) wl ON true
LEFT JOIN goals g ON u.id = g.user_id AND g.is_active = true
WHERE u.is_active = true;
```

**Salida**: lista de usuarios activos con su último peso registrado, fecha del último registro, y peso objetivo.

#### Nodo 3: Has Users? (IF)

- **Tipo**: IF
- **Condición**: resultado tiene al menos una fila
- **Rama true**: continúa
- **Rama false**: FIN

#### Nodo 4: Build Personalized Message (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item
- **Propósito**: construir un mensaje personalizado para cada usuario basado en su progreso.

```javascript
const lastWeight = $json.last_logged_weight || $json.profile_weight;
const lastDate = $json.last_logged_date
  ? new Date($json.last_logged_date).toLocaleDateString('es-MX')
  : 'tu registro inicial';
const targetWeight = $json.target_weight;

let motivationalNote = '';
if (targetWeight && lastWeight) {
  const remaining = Math.abs(lastWeight - targetWeight);
  if (remaining < 1) {
    motivationalNote = '¡Estás muy cerca de tu objetivo!';
  } else if (remaining < 5) {
    motivationalNote = `Te faltan solo ${remaining.toFixed(1)} kg para tu meta. ¡Sigue así!`;
  } else {
    motivationalNote = `Cada semana cuenta. ¡Vamos por esos ${remaining.toFixed(1)} kg que te faltan!`;
  }
}

return [{
  json: {
    telegramId: $json.telegram_id,
    message: `¡Buenos días, ${$json.first_name}! Es lunes de actualización de peso.

Tu último peso registrado: ${lastWeight} kg (${lastDate})
${targetWeight ? `Tu peso objetivo: ${targetWeight} kg` : ''}
${motivationalNote}

¿Cuánto pesas hoy? Solo dime el número en kg (ej: 74.5) y lo registro.`
  }
}];
```

#### Nodo 5: Send Weight Request (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**: `{{ $json.message }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 6: Wait Between Messages (Wait)

- **Tipo**: Wait
- **Duración**: `100` milisegundos
- **Propósito**: respetar los rate limits de Telegram cuando hay muchos usuarios.

### Lógica de Ramificación

```
Cron Trigger (lunes 09:00)
  → Get Active Users with Last Weight (PostgreSQL)
    → Has Users? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Build Personalized Message (Code)
                → Send Weight Request (Telegram)
                  → Wait Between Messages
```

### Manejo de Errores

- **Telegram error 403 (bot bloqueado)**: se logea y se salta al siguiente usuario. No se desactiva automáticamente la cuenta.
- **PostgreSQL caído**: el cron falla y se notifica al admin. Se puede re-ejecutar manualmente.
- **Sin datos de peso previo**: el mensaje se adapta para no mostrar datos de peso anterior si no existen.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Variable de entorno | `WEIGHT_REQUEST_DAY` | Día de la semana para solicitar peso (default: `1` = lunes) |
| Variable de entorno | `WEIGHT_REQUEST_HOUR` | Hora para solicitar peso (default: `09`) |

---

## 7. FitAI - Progress Calculator

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Progress Calculator` |
| **Trigger** | Tool llamada por el agente principal |
| **Propósito** | Calcula todos los indicadores de progreso del usuario (cambio de peso, IMC, porcentaje hacia el objetivo, tasa semanal de cambio, detección de meseta) y genera un reporte estructurado que el agente usa para responder conversacionalmente. |
| **Activación** | Solo via Tool call del AI Agent |

### Descripción del Propósito

Cuando el usuario pregunta por su progreso o el agente determina que es relevante mostrar el avance, invoca esta tool. El workflow consulta el historial de peso del usuario, su perfil, su objetivo activo, y calcula una serie completa de métricas. Detecta si el usuario está en una meseta (sin cambio significativo en 3+ semanas). Retorna un objeto JSON con todas las métricas para que el agente genere una respuesta conversacional y motivacional.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger / Tool Input

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada**: `userId`

#### Nodo 2: Load Weight History (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT weight_kg, body_fat_pct, logged_at, notes
FROM weight_logs
WHERE user_id = $1
ORDER BY logged_at DESC
LIMIT 52;
```

- **Parámetros**: `[$json.userId]`

**Salida**: hasta 52 registros de peso (1 año de datos semanales).

#### Nodo 3: Load User Profile and Goal (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT up.weight_kg AS current_weight, up.height_cm, up.gender, up.age,
       g.goal_type, g.target_weight, g.start_weight, g.start_date, g.target_date
FROM user_profiles up
LEFT JOIN goals g ON up.user_id = g.user_id AND g.is_active = true
WHERE up.user_id = $1;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 4: Calculate Progress Metrics (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: calcular todas las métricas de progreso.

```javascript
const weightHistory = $('Load Weight History').all().map(i => i.json);
const profile = $('Load User Profile and Goal').first().json;

// Peso actual y inicio
const currentWeight = weightHistory[0]?.weight_kg || profile.current_weight;
const startWeight = profile.start_weight || weightHistory[weightHistory.length - 1]?.weight_kg;
const targetWeight = profile.target_weight;
const heightM = profile.height_cm / 100;

// Cambio total de peso
const totalWeightChange = currentWeight - startWeight;
const totalWeightChangePct = ((totalWeightChange / startWeight) * 100);

// IMC actual
const bmi = currentWeight / (heightM * heightM);
let bmiCategory;
if (bmi < 18.5) bmiCategory = 'Bajo peso';
else if (bmi < 25) bmiCategory = 'Peso normal';
else if (bmi < 30) bmiCategory = 'Sobrepeso';
else bmiCategory = 'Obesidad';

// Porcentaje hacia el objetivo
let goalPercentage = null;
if (targetWeight && startWeight) {
  const totalToLose = startWeight - targetWeight;
  const lost = startWeight - currentWeight;
  goalPercentage = totalToLose !== 0 ? Math.min(100, Math.max(0, (lost / totalToLose) * 100)) : 100;
}

// Tasa semanal de cambio (últimas 4 semanas)
let weeklyRate = null;
if (weightHistory.length >= 2) {
  const recentWeeks = weightHistory.slice(0, Math.min(4, weightHistory.length));
  const oldest = recentWeeks[recentWeeks.length - 1];
  const newest = recentWeeks[0];
  const daysDiff = (new Date(newest.logged_at) - new Date(oldest.logged_at)) / (1000 * 60 * 60 * 24);
  if (daysDiff > 0) {
    weeklyRate = ((newest.weight_kg - oldest.weight_kg) / daysDiff) * 7;
  }
}

// Detección de meseta (3+ semanas sin cambio > 0.3 kg)
let isOnPlateau = false;
let plateauWeeks = 0;
if (weightHistory.length >= 3) {
  const recentThree = weightHistory.slice(0, 3);
  const maxWeight = Math.max(...recentThree.map(w => w.weight_kg));
  const minWeight = Math.min(...recentThree.map(w => w.weight_kg));
  if (Math.abs(maxWeight - minWeight) < 0.3) {
    isOnPlateau = true;
    // Contar semanas consecutivas en meseta
    for (let i = 0; i < weightHistory.length - 1; i++) {
      if (Math.abs(weightHistory[i].weight_kg - weightHistory[i + 1].weight_kg) < 0.3) {
        plateauWeeks++;
      } else break;
    }
  }
}

// Días desde inicio
const daysSinceStart = profile.start_date
  ? Math.floor((new Date() - new Date(profile.start_date)) / (1000 * 60 * 60 * 24))
  : null;

// Días para alcanzar objetivo (estimación)
let estimatedDaysToGoal = null;
if (targetWeight && weeklyRate && weeklyRate !== 0) {
  const remaining = currentWeight - targetWeight;
  estimatedDaysToGoal = Math.abs(Math.round((remaining / weeklyRate) * 7));
}

return [{
  json: {
    currentWeight: Math.round(currentWeight * 10) / 10,
    startWeight: Math.round(startWeight * 10) / 10,
    targetWeight,
    totalWeightChange: Math.round(totalWeightChange * 10) / 10,
    totalWeightChangePct: Math.round(totalWeightChangePct * 10) / 10,
    bmi: Math.round(bmi * 10) / 10,
    bmiCategory,
    goalPercentage: goalPercentage !== null ? Math.round(goalPercentage * 10) / 10 : null,
    weeklyRate: weeklyRate !== null ? Math.round(weeklyRate * 100) / 100 : null,
    isOnPlateau,
    plateauWeeks,
    daysSinceStart,
    estimatedDaysToGoal,
    totalWeighIns: weightHistory.length,
    lastWeighIn: weightHistory[0]?.logged_at || null,
    weightHistory: weightHistory.slice(0, 8).map(w => ({
      weight: w.weight_kg,
      date: w.logged_at
    }))
  }
}];
```

#### Nodo 5: Generate Progress Report (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: generar un reporte textual estructurado para que el agente lo use como base de su respuesta.

```javascript
const m = $json; // metrics

let report = `REPORTE DE PROGRESO:\n\n`;
report += `Peso actual: ${m.currentWeight} kg\n`;
report += `Peso inicial: ${m.startWeight} kg\n`;
report += `Cambio total: ${m.totalWeightChange > 0 ? '+' : ''}${m.totalWeightChange} kg (${m.totalWeightChangePct > 0 ? '+' : ''}${m.totalWeightChangePct}%)\n`;
if (m.targetWeight) report += `Peso objetivo: ${m.targetWeight} kg\n`;
report += `\nIMC: ${m.bmi} (${m.bmiCategory})\n`;
if (m.goalPercentage !== null) report += `Progreso hacia objetivo: ${m.goalPercentage}%\n`;
if (m.weeklyRate !== null) report += `Tasa semanal: ${m.weeklyRate > 0 ? '+' : ''}${m.weeklyRate} kg/semana\n`;
if (m.daysSinceStart) report += `Días desde inicio: ${m.daysSinceStart}\n`;
if (m.estimatedDaysToGoal) report += `Estimación para alcanzar objetivo: ~${m.estimatedDaysToGoal} días\n`;
report += `Total de pesajes registrados: ${m.totalWeighIns}\n`;

if (m.isOnPlateau) {
  report += `\n⚠️ MESETA DETECTADA: El peso no ha cambiado significativamente en ${m.plateauWeeks + 1} semanas.\n`;
  report += `Sugerencia: considerar ajuste calórico, cambio de rutina de ejercicio, o evaluación de adherencia al plan.\n`;
}

report += `\nHistorial reciente:\n`;
m.weightHistory.forEach(w => {
  report += `  ${w.date}: ${w.weight} kg\n`;
});

return [{ json: { progressReport: report, metrics: m } }];
```

**Salida**: `progressReport` (texto) y `metrics` (objeto JSON). El agente usa esto para generar una respuesta conversacional y empática.

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Load Weight History (PostgreSQL)            ← en paralelo
  → Load User Profile and Goal (PostgreSQL)     ← en paralelo
  → Calculate Progress Metrics (Code)
    → Generate Progress Report (Code)
      → Return to AI Agent
```

Flujo lineal sin bifurcaciones condicionales.

### Manejo de Errores

- **Sin registros de peso**: si el usuario nunca ha registrado peso, se retorna un reporte indicando que no hay datos suficientes y se sugiere al agente que invite al usuario a registrar su peso.
- **Sin objetivo activo**: se calculan las métricas disponibles (IMC, cambio de peso) y se omiten las que requieren objetivo (porcentaje, estimación de tiempo).
- **Datos inconsistentes**: si algún valor calculado resulta en NaN o Infinity, se reemplaza por `null` y se omite del reporte.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

---

## 8. FitAI - Workout Plan Generator

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Workout Plan Generator` |
| **Trigger** | Tool llamada por el agente principal |
| **Propósito** | Genera un plan de entrenamiento semanal personalizado usando GPT-4o con el perfil de fitness del usuario, lo parsea como JSON estructurado y lo guarda en la tabla `exercise_plans`. |
| **Activación** | Solo via Tool call del AI Agent |

### Descripción del Propósito

Similar al Meal Plan Generator, este workflow carga el perfil del usuario (con énfasis en datos de fitness: nivel, equipamiento, lesiones, días de entrenamiento), construye un prompt detallado usando la plantilla `prompts/workout-plan-generation.md`, llama a GPT-4o para generar la rutina en JSON, la valida, desactiva planes anteriores, y guarda el nuevo en `exercise_plans`. La rutina generada respeta las limitaciones del usuario (lesiones, equipamiento) y se adapta a su nivel de experiencia.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger / Tool Input

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada**: `userId`, `chatId`, `planType`

#### Nodo 2: Load User Fitness Profile (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT up.fitness_level, up.activity_level, up.goal, up.weight_kg, up.height_cm,
       up.gender, up.age, up.injuries, up.available_equipment,
       up.training_days_per_week, up.wake_up_time,
       g.goal_type, g.target_weight,
       u.first_name
FROM user_profiles up
JOIN users u ON up.user_id = u.id
LEFT JOIN goals g ON up.user_id = g.user_id AND g.is_active = true
WHERE up.user_id = $1;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 3: Get Previous Workout Plan (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT plan_json, fitness_level
FROM exercise_plans
WHERE user_id = $1 AND is_active = true
ORDER BY generated_at DESC
LIMIT 1;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 4: Build Workout Prompt (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: construir el prompt completo para la generación de la rutina de ejercicio.

```javascript
const profile = $('Load User Fitness Profile').first().json;
const previousPlan = $('Get Previous Workout Plan').first()?.json?.plan_json || null;

const weekNumber = getWeekNumber(new Date());
const year = new Date().getFullYear();

const prompt = `
Genera un plan de entrenamiento semanal personalizado para el siguiente perfil:

PERFIL DEL USUARIO:
- Género: ${profile.gender === 'male' ? 'Masculino' : 'Femenino'}
- Edad: ${profile.age} años
- Peso: ${profile.weight_kg} kg
- Estatura: ${profile.height_cm} cm
- Nivel de fitness: ${translateFitness(profile.fitness_level)}
- Objetivo: ${translateGoal(profile.goal)}
- Días de entrenamiento por semana: ${profile.training_days_per_week}

EQUIPAMIENTO DISPONIBLE:
${profile.available_equipment?.length > 0 ? profile.available_equipment.join(', ') : 'Sin equipamiento (ejercicios con peso corporal)'}

LESIONES O LIMITACIONES:
${profile.injuries?.length > 0 ? profile.injuries.join(', ') : 'Ninguna'}

${previousPlan ? `PLAN ANTERIOR (varía los ejercicios para progresión):
${JSON.stringify(previousPlan).substring(0, 500)}` : ''}

INSTRUCCIONES:
- Distribuye ${profile.training_days_per_week} días de entrenamiento en la semana
- Los días restantes son de descanso o cardio ligero
- Adapta la intensidad y volumen al nivel ${translateFitness(profile.fitness_level)}
- Si hay lesiones, evita ejercicios que las agraven y sugiere alternativas
- Incluye calentamiento y enfriamiento para cada sesión

FORMATO DE RESPUESTA (JSON):
{
  "days": {
    "monday": {
      "type": "training|rest|active_recovery",
      "focus": "upper_body|lower_body|full_body|push|pull|legs|cardio|rest",
      "warmup": { "duration_min": N, "exercises": [{ "name": "...", "duration": "..." }] },
      "exercises": [
        {
          "name": "...",
          "sets": N,
          "reps": "8-12" | "30s",
          "rest_seconds": N,
          "weight_suggestion": "...",
          "notes": "..."
        }
      ],
      "cooldown": { "duration_min": N, "exercises": [{ "name": "...", "duration": "..." }] },
      "estimated_duration_min": N
    }
  },
  "weekly_notes": "...",
  "progression_notes": "..."
}
`;

return [{
  json: {
    prompt,
    userId: $json.userId,
    weekNumber,
    year,
    fitnessLevel: profile.fitness_level
  }
}];

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function translateGoal(goal) {
  const map = { lose_weight: 'Perder peso', gain_muscle: 'Ganar músculo', maintain: 'Mantener peso', recomposition: 'Recomposición corporal' };
  return map[goal] || goal;
}

function translateFitness(level) {
  const map = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };
  return map[level] || level;
}
```

#### Nodo 5: Generate Workout Plan (OpenAI)

- **Tipo**: OpenAI - Chat Completion
- **Credencial**: `FitAI OpenAI`
- **Modelo**: `gpt-4o`
- **Temperature**: `0.7`
- **Max Tokens**: `4096`
- **System Message**: contenido de `prompts/workout-plan-generation.md`
- **User Message**: `{{ $json.prompt }}`
- **Response Format**: `json_object`

#### Nodo 6: Parse and Validate Workout (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: parsear y validar la estructura del plan de entrenamiento generado.

```javascript
const response = $('Generate Workout Plan').first().json.message.content;
let plan;

try {
  plan = JSON.parse(response);
} catch (e) {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    plan = JSON.parse(jsonMatch[0]);
  } else {
    throw new Error('No se pudo parsear el plan de entrenamiento generado por OpenAI');
  }
}

if (!plan.days || typeof plan.days !== 'object') {
  throw new Error('El plan no contiene la estructura de días esperada');
}

const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
for (const day of dayNames) {
  if (!plan.days[day]) {
    throw new Error(`El plan no contiene datos para ${day}`);
  }
}

return [{
  json: {
    plan,
    userId: $json.userId,
    weekNumber: $json.weekNumber,
    year: $json.year,
    fitnessLevel: $json.fitnessLevel
  }
}];
```

#### Nodo 7: Deactivate Previous Workout Plans (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
UPDATE exercise_plans
SET is_active = false
WHERE user_id = $1 AND is_active = true;
```

#### Nodo 8: Save New Workout Plan (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO exercise_plans (user_id, week_number, year, plan_json, fitness_level, is_active, expires_at)
VALUES ($1, $2, $3, $4, $5, true, NOW() + INTERVAL '7 days')
RETURNING id;
```

- **Parámetros**: `userId`, `weekNumber`, `year`, `JSON.stringify(plan)`, `fitnessLevel`

#### Nodo 9: Format Workout for Response (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: formatear el plan en texto legible para el agente.

```javascript
const plan = $json.plan;
let formatted = `Plan de entrenamiento (Semana ${$json.weekNumber}, ${$json.year})\n\n`;

const dayTranslations = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles',
  thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo'
};

const focusTranslations = {
  upper_body: 'Tren superior', lower_body: 'Tren inferior', full_body: 'Cuerpo completo',
  push: 'Empuje', pull: 'Jalón', legs: 'Piernas', cardio: 'Cardio', rest: 'Descanso'
};

for (const [day, data] of Object.entries(plan.days)) {
  formatted += `📅 ${dayTranslations[day]} — ${data.type === 'rest' ? '🧘 Descanso' : `💪 ${focusTranslations[data.focus] || data.focus}`}\n`;

  if (data.type === 'rest' || data.type === 'active_recovery') {
    formatted += `  Día de ${data.type === 'rest' ? 'descanso completo' : 'recuperación activa'}\n\n`;
    continue;
  }

  if (data.warmup) {
    formatted += `  🔥 Calentamiento (${data.warmup.duration_min} min)\n`;
  }

  if (data.exercises) {
    for (const ex of data.exercises) {
      formatted += `  ▸ ${ex.name}: ${ex.sets}x${ex.reps}`;
      if (ex.rest_seconds) formatted += ` (descanso: ${ex.rest_seconds}s)`;
      if (ex.notes) formatted += ` — ${ex.notes}`;
      formatted += '\n';
    }
  }

  if (data.cooldown) {
    formatted += `  ❄️ Enfriamiento (${data.cooldown.duration_min} min)\n`;
  }

  if (data.estimated_duration_min) {
    formatted += `  ⏱ Duración estimada: ${data.estimated_duration_min} min\n`;
  }

  formatted += '\n';
}

if (plan.weekly_notes) formatted += `Notas: ${plan.weekly_notes}\n`;
if (plan.progression_notes) formatted += `Progresión: ${plan.progression_notes}\n`;

return [{ json: { formattedPlan: formatted } }];
```

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Load User Fitness Profile (PostgreSQL)    ← en paralelo
  → Get Previous Workout Plan (PostgreSQL)    ← en paralelo
  → Build Workout Prompt (Code)
    → Generate Workout Plan (OpenAI)
      → Parse and Validate Workout (Code)
        → Deactivate Previous Workout Plans (PostgreSQL)
          → Save New Workout Plan (PostgreSQL)
            → Format Workout for Response (Code)
              → Return to AI Agent
```

Flujo lineal, misma estructura que Meal Plan Generator.

### Manejo de Errores

- **OpenAI retorna JSON inválido**: se intenta extraer con regex. Si falla, se reintenta 1 vez. Si persiste, se retorna mensaje de error al agente.
- **Plan incompleto**: se valida que todos los 7 días estén presentes. Si faltan, se reintenta.
- **PostgreSQL error al guardar**: se retorna el plan formateado al agente pero se logea que no se persistió.
- **Lesiones no respetadas**: la validación del plan no puede verificar semánticamente que las lesiones se respeten (eso depende de la calidad del prompt y el modelo). Se confía en GPT-4o para esto.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI OpenAI` | API key de OpenAI |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Variable de entorno | `WORKOUT_PLAN_MODEL` | Modelo para generación (default: `gpt-4o`) |
| Variable de entorno | `WORKOUT_PLAN_TEMPERATURE` | Temperature (default: `0.7`) |
| Variable de entorno | `WORKOUT_PLAN_MAX_TOKENS` | Max tokens (default: `4096`) |

---

## 9. FitAI - RAG Personal Indexer

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - RAG Personal Indexer` |
| **Trigger** | Sub-workflow (llamado asíncronamente por `FitAI - Main AI Agent` después de cada conversación significativa) |
| **Propósito** | Extrae información personal relevante de las conversaciones del usuario, genera embeddings con `text-embedding-3-small`, y los almacena en la colección `user_rag` de Qdrant con metadata del usuario. Esto alimenta la memoria a largo plazo del sistema. |
| **Activación** | Solo via Execute Sub-Workflow (fire-and-forget) |

### Descripción del Propósito

Este workflow implementa la parte de escritura del RAG personal. Después de cada conversación entre el usuario y el agente, se analiza si la conversación contiene información personal relevante que debería recordarse a largo plazo (preferencias, alergias descubiertas, logros, estados de ánimo, etc.). Si se encuentra información relevante, se genera un resumen conciso, se crea un embedding con `text-embedding-3-small`, y se almacena en Qdrant con metadata que permite filtrar por `user_id`, `type` de información y `date`. Esto permite al agente recordar información personal del usuario en futuras conversaciones, incluso si ya salió de la ventana de memoria de 10 interacciones.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada**: `userId`, `userMessage`, `agentResponse`, `toolsCalled`

#### Nodo 2: Should Index? (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: determinar si la conversación contiene información que vale la pena indexar. Filtra mensajes triviales (saludos, confirmaciones simples) para no llenar Qdrant con información irrelevante.

```javascript
const userMessage = $json.userMessage?.toLowerCase() || '';
const agentResponse = $json.agentResponse || '';
const toolsCalled = $json.toolsCalled || [];

// No indexar mensajes muy cortos o triviales
const trivialPatterns = [
  /^(hola|hi|hey|ok|sí|si|no|gracias|thanks|bye|adiós)\s*[.!?]*$/i,
  /^[0-9.]+$/, // Solo un número (probablemente peso)
  /^[1-7]$/ // Respuesta numérica de opción
];

const isTrivial = trivialPatterns.some(p => p.test(userMessage.trim()));

// Indexar si: mensaje largo, contiene información personal, o se usaron tools
const shouldIndex = !isTrivial && (
  userMessage.length > 30 ||
  toolsCalled.length > 0 ||
  /prefiero|no me gusta|alergia|lesión|favorito|problema|logré|meta|objetivo/i.test(userMessage)
);

return [{ json: { shouldIndex, ...($input.first().json) } }];
```

#### Nodo 3: Skip? (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.shouldIndex }}` es `true`
- **Rama true**: continúa a extraer información
- **Rama false**: FIN (no indexar)

#### Nodo 4: Extract Relevant Information (OpenAI)

- **Tipo**: OpenAI - Chat Completion
- **Credencial**: `FitAI OpenAI`
- **Modelo**: `gpt-4o`
- **Temperature**: `0.3` (baja, para extracción precisa)
- **Max Tokens**: `512`
- **System Message**:

```
Eres un extractor de información personal. Analiza la siguiente conversación entre un usuario y un asistente de nutrición/fitness.

Extrae SOLO información personal relevante y de largo plazo que sea útil recordar para futuras interacciones. Ignora datos transitorios o ya conocidos del perfil.

Responde con un JSON:
{
  "has_relevant_info": true/false,
  "extractions": [
    {
      "type": "preference|allergy|achievement|emotion|habit|restriction|recipe|feedback",
      "text": "Resumen conciso de la información extraída",
      "importance": "high|medium|low"
    }
  ]
}

Si no hay información relevante, retorna: { "has_relevant_info": false, "extractions": [] }
```

- **User Message**: `Usuario: {{ $json.userMessage }}\n\nAsistente: {{ $json.agentResponse }}`
- **Response Format**: `json_object`

#### Nodo 5: Has Relevant Info? (IF)

- **Tipo**: IF
- **Condición**: el JSON parseado tiene `has_relevant_info === true` y `extractions.length > 0`
- **Rama true**: continúa a generar embeddings
- **Rama false**: FIN

#### Nodo 6: Split Extractions (Split In Batches)

- **Tipo**: Split In Batches
- **Propósito**: procesar cada extracción individualmente para generar su embedding y almacenarlo.
- **Batch Size**: `1`

#### Nodo 7: Generate Embedding (OpenAI - Embeddings)

- **Tipo**: OpenAI - Create Embedding
- **Credencial**: `FitAI OpenAI`
- **Modelo**: `text-embedding-3-small`
- **Input**: `{{ $json.text }}`

**Salida**: vector de 1536 dimensiones.

#### Nodo 8: Store in Qdrant (HTTP Request)

- **Tipo**: HTTP Request
- **Método**: PUT
- **URL**: `http://qdrant:6333/collections/user_rag/points`
- **Body**:

```json
{
  "points": [
    {
      "id": "{{ $randomUUID() }}",
      "vector": {{ $json.embedding }},
      "payload": {
        "user_id": "{{ $('Sub-Workflow Trigger').item.json.userId }}",
        "type": "{{ $json.type }}",
        "text": "{{ $json.text }}",
        "importance": "{{ $json.importance }}",
        "date": "{{ new Date().toISOString().split('T')[0] }}",
        "source_message": "{{ $('Sub-Workflow Trigger').item.json.userMessage.substring(0, 200) }}"
      }
    }
  ]
}
```

- **Headers**: `Content-Type: application/json`
- **Autenticación**: configurada según la instalación de Qdrant (API key si está habilitada)

#### Nodo 9: Log Indexing (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: registrar la indexación para métricas y debugging.

```javascript
console.log(`RAG indexed for user ${$('Sub-Workflow Trigger').first().json.userId}: type=${$json.type}, importance=${$json.importance}`);
return [$json];
```

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Should Index? (Code)
    → Skip? (IF)
        ├─ false → FIN
        └─ true → Extract Relevant Information (OpenAI)
              → Has Relevant Info? (IF)
                  ├─ false → FIN
                  └─ true → Split Extractions
                        → [Para cada extracción]:
                              Generate Embedding (OpenAI)
                                → Store in Qdrant (HTTP)
                                  → Log Indexing
```

### Manejo de Errores

- **OpenAI error en extracción**: se logea y se termina silenciosamente. La indexación es una operación best-effort; su fallo no afecta al usuario.
- **OpenAI error en embedding**: se logea y se salta esa extracción. Si hay múltiples extracciones, las demás se procesan normalmente.
- **Qdrant no disponible**: se logea el error. Las extracciones se pierden (no hay cola de reintentos). El sistema funciona sin RAG personal (degradación graceful).
- **Extracción malformada**: si GPT-4o retorna JSON inválido o con estructura incorrecta, se salta la indexación y se logea.
- **Deduplicación**: no se implementa deduplicación explícita. Qdrant puede contener información similar de diferentes conversaciones. La búsqueda por similaridad naturalmente prioriza los resultados más relevantes. Se puede implementar limpieza periódica en el futuro.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI OpenAI` | API key de OpenAI (GPT-4o para extracción, text-embedding-3-small para embeddings) |
| Credencial n8n | `FitAI Qdrant` | URL de Qdrant y API key (si aplica) |
| Variable de entorno | `QDRANT_URL` | URL base de Qdrant (default: `http://qdrant:6333`) |
| Variable de entorno | `EMBEDDING_MODEL` | Modelo de embeddings (default: `text-embedding-3-small`) |
| Variable de entorno | `RAG_COLLECTION_USER` | Nombre de la colección de RAG personal (default: `user_rag`) |

---

## 10. FitAI - Membership Alert

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Membership Alert` |
| **Trigger** | Cron (diario a las 10:00) |
| **Propósito** | Detecta membresías que expiran dentro de los próximos 3 días, notifica a los usuarios afectados con un mensaje amigable por Telegram, y notifica al administrador con un resumen de las membresías por vencer. |
| **Activación** | Siempre activo (cron automático diario) |

### Descripción del Propósito

Este workflow es parte del sistema de retención de usuarios. Cada día consulta la base de datos en busca de membresías activas cuya fecha de expiración está dentro de los próximos 3 días. Para cada membresía próxima a vencer, envía un mensaje al usuario por Telegram informándole sobre la situación y los pasos para renovar. También genera un resumen para el administrador con la lista completa de membresías por vencer, para que pueda contactar proactivamente a los usuarios y gestionar renovaciones.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `0 10 * * *` (todos los días a las 10:00)
- **Timezone**: `America/Mexico_City`

#### Nodo 2: Get Expiring Memberships (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.id AS user_id, u.telegram_id, u.first_name, u.username,
       m.id AS membership_id, m.plan_type, m.status, m.expires_at,
       EXTRACT(DAY FROM m.expires_at - NOW()) AS days_remaining
FROM users u
JOIN memberships m ON u.id = m.user_id
WHERE m.status = 'active'
  AND m.expires_at > NOW()
  AND m.expires_at <= NOW() + INTERVAL '3 days'
  AND u.is_active = true
ORDER BY m.expires_at ASC;
```

**Salida**: lista de usuarios con membresías que expiran en 0-3 días, ordenadas por urgencia.

#### Nodo 3: Has Expiring Memberships? (IF)

- **Tipo**: IF
- **Condición**: resultado tiene al menos una fila
- **Rama true**: continúa a notificar
- **Rama false**: FIN (no hay membresías por vencer)

#### Nodo 4: Notify Each User (Split In Batches)

- **Tipo**: Split In Batches
- **Batch Size**: `1`
- **Propósito**: procesar cada usuario individualmente para enviar mensajes personalizados.

#### Nodo 5: Build User Notification (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item
- **Propósito**: construir el mensaje de notificación personalizado basado en los días restantes.

```javascript
const daysRemaining = Math.ceil($json.days_remaining);
let urgency = '';
let emoji = '';

if (daysRemaining <= 0) {
  urgency = 'Tu membresía vence hoy.';
  emoji = '🔴';
} else if (daysRemaining === 1) {
  urgency = 'Tu membresía vence mañana.';
  emoji = '🟠';
} else {
  urgency = `Tu membresía vence en ${daysRemaining} días.`;
  emoji = '🟡';
}

const planNames = { basic: 'Básico', pro: 'Pro', premium: 'Premium' };
const planName = planNames[$json.plan_type] || $json.plan_type;

const message = `${emoji} Aviso de membresía — ${$json.first_name}

${urgency}

Plan actual: ${planName}
Fecha de vencimiento: ${new Date($json.expires_at).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Para renovar tu suscripción y seguir disfrutando de FitAI, contacta al administrador:
@fitai_admin

¡No pierdas tu racha de progreso!`;

return [{ json: { telegramId: $json.telegram_id, message, ...($json) } }];
```

#### Nodo 6: Send User Notification (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**: `{{ $json.message }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 7: Wait Between Messages (Wait)

- **Tipo**: Wait
- **Duración**: `100` milisegundos
- **Propósito**: respetar rate limits de Telegram.

#### Nodo 8: Build Admin Summary (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for All Items
- **Propósito**: construir un resumen consolidado para el administrador con todas las membresías por vencer.

```javascript
const items = $('Get Expiring Memberships').all();

if (items.length === 0) {
  return [{ json: { skip: true } }];
}

let summary = `📋 RESUMEN DE MEMBRESÍAS POR VENCER\n`;
summary += `Fecha: ${new Date().toLocaleDateString('es-MX')}\n`;
summary += `Total: ${items.length} membresía(s)\n\n`;

const planNames = { basic: 'Básico', pro: 'Pro', premium: 'Premium' };

items.forEach((item, i) => {
  const d = item.json;
  const daysRemaining = Math.ceil(d.days_remaining);
  const urgencyIcon = daysRemaining <= 0 ? '🔴' : daysRemaining === 1 ? '🟠' : '🟡';

  summary += `${urgencyIcon} ${i + 1}. ${d.first_name}`;
  if (d.username) summary += ` (@${d.username})`;
  summary += `\n`;
  summary += `   Plan: ${planNames[d.plan_type] || d.plan_type}\n`;
  summary += `   Vence: ${new Date(d.expires_at).toLocaleDateString('es-MX')} (${daysRemaining <= 0 ? 'HOY' : `en ${daysRemaining} día(s)`})\n`;
  summary += `   Telegram ID: ${d.telegram_id}\n\n`;
});

summary += `---\nAccede al panel admin para gestionar renovaciones.`;

return [{ json: { skip: false, adminSummary: summary } }];
```

#### Nodo 9: Should Notify Admin? (IF)

- **Tipo**: IF
- **Condición**: `{{ $json.skip }}` es `false`
- **Rama true**: envía notificación al admin
- **Rama false**: FIN

#### Nodo 10: Send Admin Telegram Notification (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $env.ADMIN_TELEGRAM_ID }}`
- **Texto**: `{{ $json.adminSummary }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 11: Send Admin Email Notification (Send Email)

- **Tipo**: Send Email (SMTP)
- **Credencial**: `FitAI SMTP`
- **To**: `{{ $env.ADMIN_EMAIL }}`
- **Subject**: `[FitAI] ${items.length} membresía(s) por vencer — {{ new Date().toLocaleDateString('es-MX') }}`
- **Body (HTML)**:

```html
<h2>Membresías por vencer</h2>
<p>{{ $json.adminSummary.replace(/\n/g, '<br>') }}</p>
<p><a href="{{ $env.ADMIN_PANEL_URL }}">Ir al panel de administración</a></p>
```

Los nodos 10 y 11 se ejecutan en paralelo. Así el admin recibe la notificación tanto por Telegram como por email.

### Lógica de Ramificación

```
Cron Trigger (diario 10:00)
  → Get Expiring Memberships (PostgreSQL)
    → Has Expiring Memberships? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Build User Notification (Code)
                → Send User Notification (Telegram)
                  → Wait Between Messages
              (después de todos los usuarios)
              → Build Admin Summary (Code)
                → Should Notify Admin? (IF)
                    ├─ false → FIN
                    └─ true → Send Admin Telegram Notification    ← en paralelo
                            → Send Admin Email Notification       ← en paralelo
```

### Manejo de Errores

- **Sin membresías por vencer**: el workflow termina silenciosamente. Es el caso más común.
- **Telegram error al notificar usuario**: se logea y se continúa con los demás usuarios. El admin sigue recibiendo su resumen completo.
- **Telegram error al notificar admin**: se intenta enviar por email. Si ambos fallan, se logea como error crítico.
- **Email error**: se logea pero no es bloqueante. La notificación por Telegram al admin es el canal principal.
- **PostgreSQL caído**: el cron falla y se notifica a través del Error Workflow global.
- **Membresía ya notificada**: no hay deduplicación. El usuario recibirá una notificación cada día durante los 3 días antes de la expiración. Esto es intencional para urgencia incremental.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Credencial n8n | `FitAI SMTP` | Configuración SMTP para envío de emails (host, port, user, password) |
| Variable de entorno | `ADMIN_TELEGRAM_ID` | ID de Telegram del administrador |
| Variable de entorno | `ADMIN_EMAIL` | Email del administrador |
| Variable de entorno | `ADMIN_PANEL_URL` | URL del panel de administración |
| Variable de entorno | `MEMBERSHIP_ALERT_DAYS` | Días de anticipación para alertas (default: `3`) |

---

## Resumen de Credenciales Globales

Todas las credenciales se configuran una sola vez en n8n y se referencian por nombre en cada workflow.

| Credencial | Tipo en n8n | Campos | Usada por |
|------------|-------------|--------|-----------|
| `FitAI Telegram Bot` | Telegram API | `botToken` | Workflows 1, 2, 3, 5, 6, 8, 10 |
| `FitAI PostgreSQL` | PostgreSQL | `host`, `port`, `database`, `user`, `password`, `ssl` | Todos los workflows |
| `FitAI Redis` | Redis | `host`, `port`, `password` | Workflows 1, 3 |
| `FitAI OpenAI` | OpenAI API | `apiKey` | Workflows 2, 4, 8, 9 |
| `FitAI Qdrant` | HTTP Header Auth / Custom | `url`, `apiKey` (opcional) | Workflows 2, 9 |
| `FitAI SMTP` | SMTP | `host`, `port`, `user`, `password`, `secure` | Workflow 10 |

## Resumen de Variables de Entorno

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `WEBHOOK_URL` | — | URL base del webhook (requerida) |
| `ADMIN_TELEGRAM_ID` | — | ID de Telegram del admin (requerida) |
| `ADMIN_EMAIL` | — | Email del admin (requerida) |
| `ADMIN_PANEL_URL` | — | URL del panel admin |
| `RATE_LIMIT_MAX` | `10` | Mensajes por minuto por usuario |
| `OPENAI_MODEL` | `gpt-4o` | Modelo de conversación |
| `AI_TEMPERATURE` | `0.7` | Temperature del agente |
| `AI_MAX_TOKENS` | `1024` | Max tokens del agente |
| `MEMORY_WINDOW_SIZE` | `10` | Interacciones en memoria |
| `MEAL_PLAN_MODEL` | `gpt-4o` | Modelo para planes de comida |
| `MEAL_PLAN_TEMPERATURE` | `0.8` | Temperature para planes de comida |
| `MEAL_PLAN_MAX_TOKENS` | `4096` | Max tokens para planes de comida |
| `WORKOUT_PLAN_MODEL` | `gpt-4o` | Modelo para planes de ejercicio |
| `WORKOUT_PLAN_TEMPERATURE` | `0.7` | Temperature para planes de ejercicio |
| `WORKOUT_PLAN_MAX_TOKENS` | `4096` | Max tokens para planes de ejercicio |
| `ONBOARDING_TTL` | `86400` | TTL del estado de onboarding en Redis (segundos) |
| `REMINDER_TIMEZONE` | `America/Mexico_City` | Timezone para cron de recordatorios |
| `TELEGRAM_BATCH_DELAY_MS` | `50` | Delay entre mensajes batch (ms) |
| `QDRANT_URL` | `http://qdrant:6333` | URL de Qdrant |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Modelo de embeddings |
| `RAG_COLLECTION_USER` | `user_rag` | Colección de RAG personal |
| `MEMBERSHIP_ALERT_DAYS` | `3` | Días de anticipación para alertas |
| `WEIGHT_REQUEST_DAY` | `1` | Día para solicitar peso (1=lunes) |
| `WEIGHT_REQUEST_HOUR` | `09` | Hora para solicitar peso |
