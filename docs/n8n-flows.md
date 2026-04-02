# Flujos n8n — FitAI Assistant

Este documento describe en detalle los 16 workflows de n8n que componen la lógica de negocio completa del bot FitAI Assistant. Cada workflow se documenta con su trigger, nodos en orden, lógica de ramificación, manejo de errores y credenciales requeridas.

---

## Tabla de Contenidos

1. [FitAI - Telegram Webhook Handler](#1-fitai---telegram-webhook-handler)
   - [1.1 FitAI - Process text message (subprocess)](#11-fitai---process-text-message-subprocess)
2. [FitAI - Main AI Agent](#2-fitai---main-ai-agent)
3. [FitAI - Onboarding Flow](#3-fitai---onboarding-flow)
4. [FitAI - Meal Plan Generator](#4-fitai---meal-plan-generator)
5. [FitAI - Meal Reminder Scheduler](#5-fitai---meal-reminder-scheduler)
6. [FitAI - Weight Update Requester](#6-fitai---weight-update-requester)
7. [FitAI - Progress Calculator](#7-fitai---progress-calculator)
8. [FitAI - Workout Plan Generator](#8-fitai---workout-plan-generator)
9. [FitAI - RAG Personal Indexer](#9-fitai---rag-personal-indexer)
10. [FitAI - Membership Alert](#10-fitai---membership-alert)
11. [FitAI - Log Food Intake (tool log_food_intake)](#11-fitai---log-food-intake-tool-log_food_intake)
12. [FitAI - Get Daily Status (tool get_daily_status)](#12-fitai---get-daily-status-tool-get_daily_status)
13. [FitAI - Morning Briefing](#13-fitai---morning-briefing)
14. [FitAI - Evening Check-in](#14-fitai---evening-check-in)
15. [FitAI - Weekly Report](#15-fitai---weekly-report)
16. [FitAI - Silence Detector](#16-fitai---silence-detector)

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

## 1.1. FitAI - Process text message (subprocess)

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Process text message` |
| **ID** | `CCkMv75zwDDoj513` |
| **Trigger** | `executeWorkflowTrigger` — llamado por `FitAI - Telegram Webhook Handler` |
| **Propósito** | Debounce de mensajes multi-parte: acumula texto de mensajes en ráfaga, espera 2s y solo el último escritor continúa el flujo. |
| **Activación** | Activo |

### Descripción del Propósito

Cuando un usuario envía varios mensajes en ráfaga (ej: "hola" → "me puedes ayudar" → "con mi dieta" en 3 segundos), el handler crea múltiples ejecuciones del subprocess. Este subprocess usa PostgreSQL como estado compartido para:
1. Acumular el texto concatenado en `message_buffer`
2. Registrar el timestamp del último mensaje recibido (`last_ts`)
3. Después de 2 segundos (debounce), solo la ejecución cuyo `ts` coincide con el `last_ts` en DB "gana" y continúa — el resto se detiene limpiamente.

### Nodos en Orden

#### Nodo 1: Start (executeWorkflowTrigger)
Recibe el payload del handler: `{message: {...}, callback_query: {...}}`

#### Nodo 2: Extract Message (Code)
Extrae `chatId`, `text` y genera `ts = Date.now()`:
```javascript
const trigger = $('Start').item.json;
const chatId = String(trigger.message?.chat?.id || trigger.callback_query?.message?.chat?.id || '');
const text = String(trigger.message?.text || trigger.callback_query?.data || '');
const ts = Date.now();
return [{ json: { chatId, text, ts } }];
```

#### Nodo 3: Buffer Write (Postgres)
INSERT atómico con concatenación y `GREATEST(last_ts)`:
```sql
INSERT INTO message_buffer (chat_id, text, last_ts)
VALUES ($1, $2, $3)
ON CONFLICT (chat_id) DO UPDATE SET
  text = CASE
    WHEN NOW() - to_timestamp(message_buffer.last_ts / 1000.0) > INTERVAL '30 seconds'
    THEN EXCLUDED.text
    ELSE message_buffer.text || E'\n' || EXCLUDED.text
  END,
  last_ts = GREATEST(message_buffer.last_ts, EXCLUDED.last_ts)
RETURNING chat_id, last_ts
```
RETURNING devuelve `chat_id` y el `last_ts` ganador.

#### Nodo 4: Debounce Wait (Wait)
Pausa la ejecución 2 segundos. Permite que mensajes adicionales en ráfaga se registren en `message_buffer`.

#### Nodo 5: Flush Check (Postgres)
DELETE atómico — solo tiene éxito si `last_ts` en DB aún coincide con el ts de esta ejecución:
```sql
WITH deleted AS (
  DELETE FROM message_buffer
  WHERE chat_id = $1 AND last_ts = $2
  RETURNING text
)
SELECT text FROM deleted
```
- Último escritor: DELETE exitoso → retorna `{text: 'mensaje concatenado'}`
- No es el último escritor: 0 filas → n8n retorna `{success: 'True'}`

#### Nodo 6: Is Last Writer? (IF, typeVersion 2)
Condición: `$json.text notEmpty`
- `true` → continuar (esta ejecución procesa el texto)
- `false` → stop limpio (sin error, sin procesamiento)

#### Nodo 7: Set Text from Message (Set)
Estructura el output para el handler:
- `message.text` = `$json.text`
- `chatId`, `telegramId`, `firstName` = desde `$('Start').item.json`

### Lógica de Ramificación

```
Start → Extract Message → Buffer Write → Debounce Wait → Flush Check
      → Is Last Writer?
            ├─ true  → Set Text from Message → (retorna al handler)
            └─ false → FIN LIMPIO (status: success, sin error)
```

### Tabla de migración de estado (message_buffer)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `chat_id` | BIGINT PK | ID del chat de Telegram |
| `text` | TEXT | Mensajes acumulados (separados por `\n`) |
| `last_ts` | BIGINT | Timestamp ms del último escritor |

Migración: `migrations/005_message_buffer.sql`

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

#### Nodos 5a–5e: Carga de datos diarios (PostgreSQL) — en paralelo con nodos 2–4

Estos 5 nodos se ejecutan en paralelo con `Load User Profile`, `Search Knowledge RAG` y `Search User RAG`. Sus resultados se consumen en `Build Context`.

**Nodo 5a: Load Daily Status (PostgreSQL)**

- **Tipo**: PostgreSQL - Execute Query
- **Query**:

```sql
SELECT
  dt.caloric_target,
  dt.protein_target_g,
  dt.carb_target_g,
  dt.fat_target_g,
  COALESCE(dt.calories_consumed, 0) AS calories_consumed,
  COALESCE(dt.protein_consumed_g, 0) AS protein_consumed,
  COALESCE(dt.carbs_consumed_g, 0) AS carbs_consumed,
  COALESCE(dt.fat_consumed_g, 0) AS fat_consumed,
  COALESCE(dt.meals_logged, 0) AS meals_logged,
  dt.plan_adherence_pct
FROM daily_targets dt
WHERE dt.user_id = $1 AND dt.target_date = CURRENT_DATE;
```

- **Parámetros**: `[$json.userId]`
- **alwaysOutputData**: `true` (el primer mensaje del día no tiene fila aún)

**Nodo 5b: Load Today Meals (PostgreSQL)**

- **Tipo**: PostgreSQL - Execute Query
- **Query**:

```sql
SELECT meal_type, description, estimated_calories, estimated_protein_g, logged_at
FROM daily_intake_logs
WHERE user_id = $1 AND log_date = CURRENT_DATE
ORDER BY logged_at ASC;
```

- **Parámetros**: `[$json.userId]`
- **alwaysOutputData**: `true`

**Nodo 5c: Load Today Plan (PostgreSQL)**

- **Tipo**: PostgreSQL - Execute Query
- **Query**:

```sql
SELECT plan_json
FROM meal_plans
WHERE user_id = $1 AND is_active = true
AND plan_date = CURRENT_DATE;
```

- **Parámetros**: `[$json.userId]`
- **alwaysOutputData**: `true`

**Nodo 5d: Load Weight Trend (PostgreSQL)**

- **Tipo**: PostgreSQL - Execute Query
- **Query**:

```sql
SELECT weight_kg, logged_at
FROM weight_logs
WHERE user_id = $1
ORDER BY logged_at DESC
LIMIT 5;
```

- **Parámetros**: `[$json.userId]`
- **alwaysOutputData**: `true`

**Nodo 5e: Load Weekly Average (PostgreSQL)**

- **Tipo**: PostgreSQL - Execute Query
- **Query**:

```sql
SELECT
  AVG(calories_consumed) AS avg_calories,
  AVG(protein_consumed_g) AS avg_protein,
  COUNT(CASE WHEN meals_logged >= meal_count THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 AS adherence_pct
FROM daily_targets dt
JOIN user_profiles up ON dt.user_id = up.user_id
WHERE dt.user_id = $1
AND dt.target_date >= date_trunc('week', CURRENT_DATE)
AND dt.target_date <= CURRENT_DATE;
```

- **Parámetros**: `[$json.userId]`
- **alwaysOutputData**: `true`

#### Nodo 6: Build Context (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: Combinar perfil, RAG, estado del día y tendencia semanal en un objeto de contexto unificado para inyectar las variables del system prompt v2.

```javascript
const trigger = $('Sub-Workflow Trigger').first().json;
const profile = $('Load User Profile').first().json;
const knowledgeDocs = $('Search Knowledge RAG').all().map(item => item.json.text).join('\n---\n');
const userDocs = $('Search User RAG').all().map(item => item.json.text).join('\n---\n');

// Datos del día y tendencia semanal
const dailyTargets = $('Load Daily Status').first()?.json || null;
const todayMeals = $('Load Today Meals').all().map(item => item.json);
const todayPlan = $('Load Today Plan').first()?.json || null;
const weightHistory = $('Load Weight Trend').all().map(item => item.json);
const weeklyAvg = $('Load Weekly Average').first()?.json || null;

const currentDate = new Date().toISOString();
const currentHour = new Date().getHours();

// --- userProfile (igual que v1, con campos adicionales de metas) ---
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
  fat_target_g: profile.fat_target_g,
  bmr: profile.bmr,
  tdee: profile.tdee
}, null, 2);

// --- NUEVO: dailyStatus ---
const caloriesConsumed = dailyTargets?.calories_consumed || 0;
const proteinConsumed = dailyTargets?.protein_consumed || 0;
const carbsConsumed = dailyTargets?.carbs_consumed || 0;
const fatConsumed = dailyTargets?.fat_consumed || 0;

const dailyStatus = JSON.stringify({
  fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
  calorias: {
    consumidas: caloriesConsumed,
    meta: profile.caloric_target,
    restantes: profile.caloric_target - caloriesConsumed
  },
  proteina: {
    consumida_g: proteinConsumed,
    meta_g: profile.protein_target_g,
    restante_g: profile.protein_target_g - proteinConsumed
  },
  comidas_reportadas: todayMeals.map(m => ({
    tipo: m.meal_type,
    descripcion: m.description,
    calorias: m.estimated_calories,
    proteina_g: m.estimated_protein_g
  })),
  comidas_pendientes_del_plan: todayPlan ? parsePendingMeals(todayPlan.plan_json, todayMeals) : []
}, null, 2);

// --- NUEVO: weeklyTrend ---
const currentWeight = weightHistory[0]?.weight_kg || profile.weight_kg;
const previousWeight = weightHistory[1]?.weight_kg || null;
const startWeight = profile.start_weight || weightHistory[weightHistory.length - 1]?.weight_kg || profile.weight_kg;

const weeklyTrend = JSON.stringify({
  peso_actual: currentWeight,
  peso_semana_pasada: previousWeight,
  cambio_semanal_kg: previousWeight ? Math.round((currentWeight - previousWeight) * 10) / 10 : null,
  promedio_calorico_diario: weeklyAvg?.avg_calories ? Math.round(weeklyAvg.avg_calories) : null,
  promedio_proteina_diaria_g: weeklyAvg?.avg_protein ? Math.round(weeklyAvg.avg_protein) : null,
  adherencia_plan_pct: weeklyAvg?.adherence_pct ? Math.round(weeklyAvg.adherence_pct) : null,
  tendencia: !previousWeight ? 'inicio' : (currentWeight < previousWeight ? 'bajando' : currentWeight > previousWeight ? 'subiendo' : 'estable'),
  peso_inicio: startWeight,
  cambio_total_kg: Math.round((currentWeight - startWeight) * 10) / 10
}, null, 2);

// --- NUEVO: nextAction ---
const nextAction = JSON.stringify(determineNextAction(dailyTargets, todayMeals, todayPlan, currentHour, profile), null, 2);

return [{
  json: {
    userName: trigger.firstName,
    userProfile,
    dailyStatus,
    weeklyTrend,
    nextAction,
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

// --- Helpers ---
function parsePendingMeals(planJson, reportedMeals) {
  const plan = typeof planJson === 'string' ? JSON.parse(planJson) : planJson;
  const reportedTypes = reportedMeals.map(m => m.meal_type);
  return (plan.meals || [])
    .filter(m => !reportedTypes.includes(m.meal_type))
    .map(m => ({ tipo: m.meal_type, nombre: m.name, calorias: m.calories, proteina_g: m.protein_g, hora: m.time }));
}

function determineNextAction(dailyTargets, todayMeals, todayPlan, currentHour, profile) {
  if (todayMeals.length === 0 && currentHour >= parseInt(profile.wake_up_time || '7')) {
    return { tipo: 'reportar_comida', descripcion: 'Preguntarle que desayuno' };
  }
  const plan = todayPlan ? (typeof todayPlan.plan_json === 'string' ? JSON.parse(todayPlan.plan_json) : todayPlan.plan_json) : null;
  if (plan?.meals) {
    const reportedTypes = todayMeals.map(m => m.meal_type);
    const next = plan.meals.find(m => !reportedTypes.includes(m.meal_type));
    if (next) {
      return {
        tipo: 'proxima_comida',
        descripcion: `Su proxima comida es ${next.name} a las ${next.time}`,
        comida: { tipo: next.meal_type, nombre: next.name, calorias: next.calories, proteina_g: next.protein_g, hora: next.time }
      };
    }
  }
  return { tipo: 'check_in', descripcion: 'Dia casi completo, preguntar como le fue' };
}
```

#### Nodo 7: AI Agent

- **Tipo**: AI Agent (LangChain)
- **Configuración del agente**:
  - **Agent Type**: OpenAI Functions Agent
  - **System Prompt**: cargado desde `prompts/system-prompt.md` (v2) con las siguientes variables inyectadas dinámicamente:
    - `{{userName}}` → `{{ $json.userName }}`
    - `{{userProfile}}` → `{{ $json.userProfile }}`
    - `{{currentDate}}` → `{{ $json.currentDate }}`
    - `{{dailyStatus}}` → `{{ $json.dailyStatus }}` ← **NUEVO v2**
    - `{{weeklyTrend}}` → `{{ $json.weeklyTrend }}` ← **NUEVO v2**
    - `{{nextAction}}` → `{{ $json.nextAction }}` ← **NUEVO v2**
    - `{{ragContext}}` → `{{ $json.ragContext }}`
    - `{{userRagContext}}` → `{{ $json.userRagContext }}`
  - **Input**: `{{ $json.text }}`
- **Modelo conectado**: OpenAI Chat Model (ver nodo 7)
- **Memoria conectada**: Window Buffer Memory (ver nodo 8)
- **Tools conectados**: nodos 9 a 17

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

#### Nodo 16: Tool - log_food_intake (toolWorkflow)

- **Tipo**: `@n8n/n8n-nodes-langchain.toolWorkflow`
- **typeVersion**: `1.3`
- **Nombre de la tool**: `log_food_intake`
- **Descripción**: `Registra lo que el usuario comio. Usa esta herramienta SIEMPRE que el usuario reporte haber comido algo (desayuno, almuerzo, snack, cena, o cualquier alimento). Estima los macros y registra el consumo en el balance del dia.`
- **Workflow**: `FitAI - Log Food Intake` (sección 11)
- **fields.values**:

```json
[
  {
    "name": "userId",
    "type": "numberValue",
    "numberValue": "={{ $('Check User & Membership').item.json.user_id }}"
  },
  {
    "name": "chatId",
    "type": "numberValue",
    "numberValue": "={{ $('Telegram Trigger').item.json.message.chat.id }}"
  },
  {
    "name": "meal_type",
    "type": "stringValue",
    "stringValue": "={{ $fromAI('meal_type', 'Tipo de comida: breakfast, lunch, snack o dinner', 'string') }}"
  },
  {
    "name": "description",
    "type": "stringValue",
    "stringValue": "={{ $fromAI('description', 'Descripcion de lo que comio el usuario, tal como lo reporto', 'string') }}"
  },
  {
    "name": "estimated_calories",
    "type": "numberValue",
    "numberValue": "={{ $fromAI('estimated_calories', 'Calorias estimadas de la comida reportada', 'number') }}"
  },
  {
    "name": "estimated_protein_g",
    "type": "numberValue",
    "numberValue": "={{ $fromAI('estimated_protein_g', 'Proteina estimada en gramos', 'number') }}"
  },
  {
    "name": "estimated_carbs_g",
    "type": "numberValue",
    "numberValue": "={{ $fromAI('estimated_carbs_g', 'Carbohidratos estimados en gramos', 'number') }}"
  },
  {
    "name": "estimated_fat_g",
    "type": "numberValue",
    "numberValue": "={{ $fromAI('estimated_fat_g', 'Grasa estimada en gramos', 'number') }}"
  }
]
```

**Nota**: `userId` y `chatId` son fijos del contexto del developer. Los 5 campos de nutrición los decide el LLM basándose en la conversación y el conocimiento nutricional del system prompt.

#### Nodo 17: Tool - get_daily_status (toolWorkflow)

- **Tipo**: `@n8n/n8n-nodes-langchain.toolWorkflow`
- **typeVersion**: `1.3`
- **Nombre de la tool**: `get_daily_status`
- **Descripción**: `Obtiene el estado completo del dia actual: calorias y macros consumidos vs meta, comidas reportadas hasta ahora, y comidas pendientes del plan de hoy. Usa esta herramienta cuando el usuario pregunte cuanto ha comido hoy, cuanto le falta, como va el dia, o cuando necesites el balance actualizado antes de responder.`
- **Workflow**: `FitAI - Get Daily Status` (sección 12)
- **fields.values**:

```json
[
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
```

**Nota**: no tiene parámetros `$fromAI()`. El estado del día es siempre el del usuario actual — el LLM no necesita especificar ningún parámetro.

#### Nodo 18: Send Response to Telegram (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Build Context').item.json.chatId }}`
- **Texto**: `{{ $json.output }}` (salida del AI Agent)
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`
- **Opciones adicionales**:
  - Disable Web Page Preview: `true`

#### Nodo 19: Log Conversation (PostgreSQL)

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

#### Nodo 20: Trigger RAG Indexer (Execute Sub-Workflow)

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
  → Load User Profile (PostgreSQL)         ← en paralelo
  → Search Knowledge RAG (Qdrant)          ← en paralelo
  → Search User RAG (Qdrant)               ← en paralelo
  → Load Daily Status (PostgreSQL)         ← en paralelo (NUEVO v2)
  → Load Today Meals (PostgreSQL)          ← en paralelo (NUEVO v2)
  → Load Today Plan (PostgreSQL)           ← en paralelo (NUEVO v2)
  → Load Weight Trend (PostgreSQL)         ← en paralelo (NUEVO v2)
  → Load Weekly Average (PostgreSQL)       ← en paralelo (NUEVO v2)
  → Build Context (Code)                   ← actualizado con dailyStatus, weeklyTrend, nextAction
    → AI Agent (20 nodos, 9 tools)
      │
      ├─ Tool: generate_meal_plan      → FitAI - Meal Plan Generator
      ├─ Tool: generate_workout_plan   → FitAI - Workout Plan Generator
      ├─ Tool: calculate_progress      → FitAI - Progress Calculator
      ├─ Tool: search_knowledge        → Qdrant knowledge_rag
      ├─ Tool: get_user_history        → Qdrant user_rag
      ├─ Tool: log_weight              → PostgreSQL weight_logs
      ├─ Tool: get_current_plan        → PostgreSQL meal_plans / exercise_plans
      ├─ Tool: log_food_intake         → FitAI - Log Food Intake      ← NUEVO v2
      ├─ Tool: get_daily_status        → FitAI - Get Daily Status      ← NUEVO v2
      │
      └─ [Respuesta final] → Send Response to Telegram (nodo 18)
            → Log Conversation (nodo 19, PostgreSQL)
            → Trigger RAG Indexer (nodo 20, asíncrono)
```

Los 8 nodos de carga (Load User Profile, Search Knowledge RAG, Search User RAG, Load Daily Status, Load Today Meals, Load Today Plan, Load Weight Trend, Load Weekly Average) se ejecutan en paralelo para minimizar la latencia. Todos tienen `alwaysOutputData: true` para no detener el flujo cuando no hay datos del día (primer mensaje del día, primer día del usuario).

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
| **Propósito** | Onboarding conversacional por bloques temáticos para recopilar el perfil completo del usuario nuevo. Gestiona estado en Redis (TTL 48h), organiza 17 campos en 5 bloques, no muestra confirmaciones intermedias, y al completarse: calcula métricas, guarda perfil, crea targets del día siguiente, genera el primer plan de comidas e indexa el resumen en RAG personal. |
| **Activación** | Solo via Execute Sub-Workflow |
| **Versión** | v2 — Conversacional por Bloques |

### Descripción del Propósito

Cuando un usuario tiene membresía activa pero no ha completado el onboarding (`user_profiles.onboarding_completed = false` o no existe registro), este workflow toma el control. Mantiene un estado de conversación en Redis que persiste entre mensajes (cada mensaje del usuario es una nueva ejecución del webhook y por tanto una nueva invocación de este sub-workflow).

**Filosofía v2**: el flujo se organiza en 5 bloques temáticos (Identidad/Cuerpo, Objetivo, Alimentación, Ejercicio, Estilo de vida). Dentro de cada bloque las preguntas fluyen sin confirmaciones intermedias — el acuse de recibo es la pregunta siguiente. La transición al coaching es automática: al completarse el bot presenta métricas de forma conversacional, genera el plan del primer día y programa el morning briefing. No hay lista de comandos ni "pregúntame lo que necesites".

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada**: `userId`, `telegramId`, `chatId`, `firstName`, `text`

#### Nodo 2: Get Onboarding State (Redis)

- **Tipo**: Redis - Get
- **Key**: `onboarding:{{ $json.telegramId }}`
- **Credencial**: `FitAI Redis`

**Salida**: objeto JSON con el estado actual del onboarding, o `null` si es la primera interacción.

Estructura del estado en Redis (v2):

```json
{
  "telegram_id": 123456789,
  "step": "ask_name",
  "block": 1,
  "started_at": "2026-03-26T10:00:00Z",
  "updated_at": "2026-03-26T10:01:30Z",
  "data": {
    "first_name": null,
    "gender": null,
    "age": null,
    "height_cm": null,
    "weight_kg": null,
    "goal_type": null,
    "target_weight": null,
    "dietary_restrictions": [],
    "food_allergies": [],
    "disliked_foods": [],
    "budget_level": null,
    "meals_per_day": null,
    "fitness_level": null,
    "equipment": null,
    "training_days_per_week": null,
    "injuries": null,
    "wake_up_time": null,
    "activity_level": null
  },
  "temp": {}
}
```

Steps válidos del onboarding v2 (21 total):

| Step | Bloque | Campo | Tipo | Validación |
|------|--------|-------|------|------------|
| `ask_name` | 1 | `first_name` | Texto libre | 2-40 caracteres, letras/espacios/guiones |
| `ask_gender` | 1 | `gender` | Inline keyboard | `male` / `female` |
| `ask_age` | 1 | `age` | Número | Entero 14-100 |
| `ask_height` | 1 | `height_cm` | Número | 100-250, 1 decimal |
| `ask_weight` | 1 | `weight_kg` | Número | 30-300, 1 decimal |
| `ask_goal` | 2 | `goal_type` | Inline keyboard | `lose_fat` / `gain_muscle` / `maintain` / `recomposition` |
| `ask_target_weight` | 2 | `target_weight` | Número (condicional) | Solo si `lose_fat` o `gain_muscle` |
| `ask_dietary_restrictions_known` | 3 | — | Inline keyboard | `yes` / `no` |
| `ask_dietary_input` | 3 | `dietary_restrictions`, `food_allergies` | Texto libre (condicional) | Solo si respondió "Si" |
| `ask_disliked_foods` | 3 | `disliked_foods` | Texto libre | 1-300 caracteres, "no" → `[]` |
| `ask_budget` | 3 | `budget_level` | Inline keyboard | `low` / `medium` / `high` |
| `ask_meals` | 3 | `meals_per_day` | Inline keyboard | 3 / 4 / 5 |
| `ask_fitness_level` | 4 | `fitness_level` | Inline keyboard | `beginner` / `intermediate` / `advanced` |
| `ask_equipment` | 4 | `equipment` | Inline keyboard | `bodyweight` / `home_basic` / `full_gym` |
| `ask_training_days` | 4 | `training_days_per_week` | Inline keyboard | 2-6 |
| `ask_injuries` | 4 | — | Inline keyboard | `yes` / `no` |
| `ask_injuries_input` | 4 | `injuries` | Texto libre (condicional) | 3-500 caracteres, Solo si respondió "Si" |
| `ask_wake_time` | 5 | `wake_up_time` | Inline keyboard | HH:00 o "Otra" |
| `ask_wake_time_custom` | 5 | `wake_up_time` | Texto libre (condicional) | Formato HH:MM, Solo si "Otra" |
| `ask_activity_level` | 5 | `activity_level` | Inline keyboard | `sedentary` / `lightly_active` / `moderately_active` / `very_active` |
| `confirm_profile` | — | — | Inline keyboard | `confirm` / `correct` |
| `correct_block` | — | — | Inline keyboard | Bloque 1-5 |
| `calculate_and_complete` | — | — | — | Trigger de finalización |

#### Nodo 3: Initialize or Resume? (IF)

- **Tipo**: IF (typeVersion 2)
- **Condición**: el resultado de Redis es `null` o vacío (`{{ $json.value === null || $json.value === '' }}`)
- **Rama true (primer contacto)**: nodo "Initialize Onboarding"
- **Rama false (continuación)**: nodo "Parse Onboarding State"

#### Nodo 4: Initialize Onboarding (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: crear el estado inicial del onboarding v2 y preparar el mensaje de bienvenida conversacional. La primera pregunta va integrada en el saludo.

```javascript
const telegramId = $('Sub-Workflow Trigger').first().json.telegramId;
const now = new Date().toISOString();

const state = {
  telegram_id: telegramId,
  step: 'ask_name',
  block: 1,
  started_at: now,
  updated_at: now,
  data: {
    first_name: null, gender: null, age: null,
    height_cm: null, weight_kg: null,
    goal_type: null, target_weight: null,
    dietary_restrictions: [], food_allergies: [],
    disliked_foods: [], budget_level: null, meals_per_day: null,
    fitness_level: null, equipment: null,
    training_days_per_week: null, injuries: null,
    wake_up_time: null, activity_level: null
  },
  temp: {}
};

return [{
  json: {
    state,
    isNewUser: true,
    responseMessage: `Hola! Soy tu coach de nutricion y fitness. Voy a acompanarte en todo el proceso para que llegues a tu meta.\n\nAntes de armar tu plan necesito conocerte. Son unas preguntas rapidas, como 3 minutos.\n\nComo te llamo?`
  }
}];
```

#### Nodo 5: Parse Onboarding State (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: parsear el estado almacenado en Redis (string JSON) y la respuesta del usuario para pasarlos al nodo de validación.

```javascript
const stateStr = $('Get Onboarding State').first().json.value;
const state = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
const userText = ($('Sub-Workflow Trigger').first().json.text || '').trim();
const callbackData = $('Sub-Workflow Trigger').first().json.callbackData || null;

return [{
  json: {
    state,
    userText,
    callbackData,
    currentStep: state.step,
    currentBlock: state.block
  }
}];
```

#### Nodo 6: Validate and Process Step (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: validar la respuesta del usuario según el step actual, actualizar `state.data`, avanzar al siguiente step y preparar el mensaje de respuesta (siguiente pregunta o error de validación).

Este nodo implementa la lógica de bloques conversacionales v2. No hay confirmaciones intermedias — el acuse de recibo es la siguiente pregunta:

```javascript
const { state, userText, callbackData } = $json;
const input = callbackData || userText;
const step = state.step;
let isValid = false;
let errorMessage = '';
let nextStep = step;
let nextBlock = state.block;
let responseMessage = '';
let replyMarkup = null; // inline_keyboard si aplica

// Helper: next step en flujo normal
const STEP_FLOW = [
  'ask_name','ask_gender','ask_age','ask_height','ask_weight',
  'ask_goal',
  // ask_target_weight es condicional
  'ask_dietary_restrictions_known',
  // ask_dietary_input es condicional
  'ask_disliked_foods','ask_budget','ask_meals',
  'ask_fitness_level','ask_equipment','ask_training_days',
  'ask_injuries',
  // ask_injuries_input es condicional
  'ask_wake_time',
  // ask_wake_time_custom es condicional
  'ask_activity_level','confirm_profile'
];

switch (step) {
  case 'ask_name': {
    const name = input.trim();
    if (/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-]{2,40}$/.test(name)) {
      state.data.first_name = name;
      nextStep = 'ask_gender'; nextBlock = 1; isValid = true;
      responseMessage = `${name}, mucho gusto. Necesito unos datos fisicos basicos para calcular tus requerimientos. Empezamos:\n\nGenero biologico?`;
      replyMarkup = { inline_keyboard: [[{ text: 'Hombre', callback_data: 'male' }, { text: 'Mujer', callback_data: 'female' }]] };
    } else {
      errorMessage = 'Solo necesito tu nombre (letras, entre 2 y 40 caracteres).';
    }
    break;
  }

  case 'ask_gender': {
    if (['male','female'].includes(input)) {
      state.data.gender = input;
      nextStep = 'ask_age'; isValid = true;
      responseMessage = 'Edad?';
    } else {
      errorMessage = 'Usa los botones para seleccionar tu genero.';
    }
    break;
  }

  case 'ask_age': {
    const age = parseInt(input);
    if (!isNaN(age) && age >= 14 && age <= 100) {
      state.data.age = age;
      nextStep = 'ask_height'; isValid = true;
      responseMessage = 'Estatura en cm? (ej: 170)';
    } else {
      errorMessage = 'Necesito un numero entre 14 y 100.';
    }
    break;
  }

  case 'ask_height': {
    const h = parseFloat(input.replace(',', '.'));
    if (!isNaN(h) && h >= 100 && h <= 250) {
      state.data.height_cm = h;
      nextStep = 'ask_weight'; isValid = true;
      responseMessage = 'Y peso actual en kg? (ej: 80)';
    } else {
      errorMessage = 'Necesito la estatura en centimetros (entre 100 y 250). Ej: 170';
    }
    break;
  }

  case 'ask_weight': {
    const w = parseFloat(input.replace(',', '.'));
    if (!isNaN(w) && w >= 30 && w <= 300) {
      state.data.weight_kg = w;
      nextStep = 'ask_goal'; nextBlock = 2; isValid = true;
      responseMessage = 'Listo, ahora lo mas importante: que quieres lograr?';
      replyMarkup = { inline_keyboard: [
        [{ text: 'Perder grasa', callback_data: 'lose_fat' }, { text: 'Ganar musculo', callback_data: 'gain_muscle' }],
        [{ text: 'Mantener peso', callback_data: 'maintain' }, { text: 'Recomposicion corporal', callback_data: 'recomposition' }]
      ]};
    } else {
      errorMessage = 'Necesito el peso en kilos (entre 30 y 300). Ej: 75';
    }
    break;
  }

  case 'ask_goal': {
    const validGoals = ['lose_fat','gain_muscle','maintain','recomposition'];
    if (validGoals.includes(input)) {
      state.data.goal_type = input;
      isValid = true;
      if (input === 'lose_fat' || input === 'gain_muscle') {
        nextStep = 'ask_target_weight';
        responseMessage = 'A cuanto quieres llegar? (peso meta en kg)';
      } else {
        state.data.target_weight = null;
        nextStep = 'ask_dietary_restrictions_known'; nextBlock = 3;
        responseMessage = 'Va. Ahora unas preguntas sobre como comes.\n\nTienes alguna restriccion dietaria o alergia alimentaria?';
        replyMarkup = { inline_keyboard: [[{ text: 'Si, tengo', callback_data: 'yes' }, { text: 'No, ninguna', callback_data: 'no' }]] };
      }
    } else {
      errorMessage = 'Usa los botones para seleccionar tu objetivo.';
    }
    break;
  }

  case 'ask_target_weight': {
    const tw = parseFloat(input.replace(',', '.'));
    const currentW = state.data.weight_kg;
    const isLoseFat = state.data.goal_type === 'lose_fat';
    const isGainMuscle = state.data.goal_type === 'gain_muscle';
    if (!isNaN(tw) && tw >= 30 && tw <= 300 &&
        (!isLoseFat || tw < currentW) && (!isGainMuscle || tw > currentW)) {
      state.data.target_weight = tw;
      nextStep = 'ask_dietary_restrictions_known'; nextBlock = 3; isValid = true;
      responseMessage = 'Va. Ahora unas preguntas sobre como comes.\n\nTienes alguna restriccion dietaria o alergia alimentaria?';
      replyMarkup = { inline_keyboard: [[{ text: 'Si, tengo', callback_data: 'yes' }, { text: 'No, ninguna', callback_data: 'no' }]] };
    } else {
      errorMessage = isLoseFat
        ? `El peso meta debe ser menor a tu peso actual (${currentW} kg).`
        : `El peso meta debe ser mayor a tu peso actual (${currentW} kg).`;
    }
    break;
  }

  case 'ask_dietary_restrictions_known': {
    if (input === 'no') {
      state.data.dietary_restrictions = [];
      state.data.food_allergies = [];
      nextStep = 'ask_disliked_foods'; isValid = true;
      responseMessage = 'Hay alimentos que no te gusten? Escribelos o pon "no" si comes de todo.';
    } else if (input === 'yes') {
      nextStep = 'ask_dietary_input'; isValid = true;
      responseMessage = 'Escribe todo junto: restricciones (vegetariano, vegano, sin gluten, etc.) y alergias (mani, mariscos, etc.) separadas por comas.';
    } else {
      errorMessage = 'Usa los botones para responder.';
    }
    break;
  }

  case 'ask_dietary_input': {
    if (input.length >= 2 && input.length <= 500) {
      // Clasificacion automatica: restriction keywords vs allergies
      const RESTRICTIONS = ['vegetariano','vegano','vegan','vegetarian','sin gluten','gluten','sin lactosa','lactosa','kosher','halal','celiac'];
      const items = input.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const restrictions = items.filter(i => RESTRICTIONS.some(r => i.includes(r)));
      const allergies = items.filter(i => !RESTRICTIONS.some(r => i.includes(r)));
      state.data.dietary_restrictions = restrictions;
      state.data.food_allergies = allergies;
      nextStep = 'ask_disliked_foods'; isValid = true;
      responseMessage = 'Hay alimentos que no te gusten? Escribelos o pon "no" si comes de todo.';
    } else {
      errorMessage = 'Escribe tus restricciones y/o alergias separadas por comas.';
    }
    break;
  }

  case 'ask_disliked_foods': {
    const noFoods = ['no','ninguno','nada','ninguna','nope'];
    state.data.disliked_foods = noFoods.includes(input.toLowerCase()) ? [] : input.split(',').map(s => s.trim()).filter(Boolean);
    nextStep = 'ask_budget'; isValid = true;
    responseMessage = 'Ok. Y tu presupuesto para ingredientes?';
    replyMarkup = { inline_keyboard: [[
      { text: 'Economico', callback_data: 'low' },
      { text: 'Moderado', callback_data: 'medium' },
      { text: 'Sin limite', callback_data: 'high' }
    ]]};
    break;
  }

  case 'ask_budget': {
    if (['low','medium','high'].includes(input)) {
      state.data.budget_level = input;
      nextStep = 'ask_meals'; isValid = true;
      responseMessage = 'Cuantas comidas al dia prefieres?';
      replyMarkup = { inline_keyboard: [[
        { text: '3', callback_data: '3' },
        { text: '4', callback_data: '4' },
        { text: '5', callback_data: '5' }
      ]]};
    } else {
      errorMessage = 'Usa los botones para seleccionar tu presupuesto.';
    }
    break;
  }

  case 'ask_meals': {
    const meals = parseInt(input);
    if ([3,4,5].includes(meals)) {
      state.data.meals_per_day = meals;
      nextStep = 'ask_fitness_level'; nextBlock = 4; isValid = true;
      responseMessage = 'Bien, ahora el tema del ejercicio.\n\nComo describirias tu experiencia entrenando?';
      replyMarkup = { inline_keyboard: [
        [{ text: 'Principiante (< 6 meses)', callback_data: 'beginner' }],
        [{ text: 'Intermedio (6 meses - 2 anos)', callback_data: 'intermediate' }],
        [{ text: 'Avanzado (2+ anos)', callback_data: 'advanced' }]
      ]};
    } else {
      errorMessage = 'Usa los botones para seleccionar el numero de comidas.';
    }
    break;
  }

  case 'ask_fitness_level': {
    if (['beginner','intermediate','advanced'].includes(input)) {
      state.data.fitness_level = input;
      nextStep = 'ask_equipment'; isValid = true;
      responseMessage = 'Donde entrenas o planeas entrenar?';
      replyMarkup = { inline_keyboard: [
        [{ text: 'Casa sin equipo', callback_data: 'bodyweight' }],
        [{ text: 'Casa con mancuernas/bandas', callback_data: 'home_basic' }],
        [{ text: 'Gimnasio', callback_data: 'full_gym' }]
      ]};
    } else {
      errorMessage = 'Usa los botones para seleccionar tu nivel.';
    }
    break;
  }

  case 'ask_equipment': {
    if (['bodyweight','home_basic','full_gym'].includes(input)) {
      state.data.equipment = input;
      nextStep = 'ask_training_days'; isValid = true;
      responseMessage = 'Cuantos dias a la semana puedes entrenar?';
      replyMarkup = { inline_keyboard: [[
        { text: '2', callback_data: '2' },
        { text: '3', callback_data: '3' },
        { text: '4', callback_data: '4' },
        { text: '5', callback_data: '5' },
        { text: '6', callback_data: '6' }
      ]]};
    } else {
      errorMessage = 'Usa los botones para seleccionar donde entrenas.';
    }
    break;
  }

  case 'ask_training_days': {
    const days = parseInt(input);
    if (days >= 2 && days <= 6) {
      state.data.training_days_per_week = days;
      nextStep = 'ask_injuries'; isValid = true;
      responseMessage = 'Alguna lesion o condicion fisica que deba saber?';
      replyMarkup = { inline_keyboard: [[
        { text: 'No, estoy bien', callback_data: 'no' },
        { text: 'Si, tengo', callback_data: 'yes' }
      ]]};
    } else {
      errorMessage = 'Usa los botones para seleccionar los dias.';
    }
    break;
  }

  case 'ask_injuries': {
    if (input === 'no') {
      state.data.injuries = null;
      nextStep = 'ask_wake_time'; nextBlock = 5; isValid = true;
      responseMessage = 'Casi terminamos. Solo necesito saber tus horarios.\n\nA que hora te despiertas normalmente?';
      replyMarkup = { inline_keyboard: [[
        { text: '5:00', callback_data: '05:00' },
        { text: '6:00', callback_data: '06:00' },
        { text: '7:00', callback_data: '07:00' },
        { text: '8:00', callback_data: '08:00' },
        { text: '9:00', callback_data: '09:00' },
        { text: 'Otra', callback_data: 'custom' }
      ]]};
    } else if (input === 'yes') {
      nextStep = 'ask_injuries_input'; isValid = true;
      responseMessage = 'Describela brevemente.';
    } else {
      errorMessage = 'Usa los botones para responder.';
    }
    break;
  }

  case 'ask_injuries_input': {
    if (input.length >= 3 && input.length <= 500) {
      state.data.injuries = input;
      nextStep = 'ask_wake_time'; nextBlock = 5; isValid = true;
      responseMessage = 'Casi terminamos. Solo necesito saber tus horarios.\n\nA que hora te despiertas normalmente?';
      replyMarkup = { inline_keyboard: [[
        { text: '5:00', callback_data: '05:00' },
        { text: '6:00', callback_data: '06:00' },
        { text: '7:00', callback_data: '07:00' },
        { text: '8:00', callback_data: '08:00' },
        { text: '9:00', callback_data: '09:00' },
        { text: 'Otra', callback_data: 'custom' }
      ]]};
    } else {
      errorMessage = 'Describela brevemente (minimo 3 caracteres).';
    }
    break;
  }

  case 'ask_wake_time': {
    if (input === 'custom') {
      nextStep = 'ask_wake_time_custom'; isValid = true;
      responseMessage = 'Escribe la hora en formato HH:MM (ej: 06:30)';
    } else if (/^\d{2}:\d{2}$/.test(input)) {
      state.data.wake_up_time = input;
      nextStep = 'ask_activity_level'; isValid = true;
      responseMessage = 'Fuera del ejercicio, como es tu dia a dia?';
      replyMarkup = { inline_keyboard: [
        [{ text: 'Sentado casi todo el dia', callback_data: 'sedentary' }],
        [{ text: 'Camino algo, tareas ligeras', callback_data: 'lightly_active' }],
        [{ text: 'De pie bastante, camino mucho', callback_data: 'moderately_active' }],
        [{ text: 'Trabajo fisico pesado', callback_data: 'very_active' }]
      ]};
    } else {
      errorMessage = 'Usa los botones para seleccionar la hora.';
    }
    break;
  }

  case 'ask_wake_time_custom': {
    if (/^\d{1,2}:\d{2}$/.test(input)) {
      state.data.wake_up_time = input.padStart(5, '0');
      nextStep = 'ask_activity_level'; isValid = true;
      responseMessage = 'Fuera del ejercicio, como es tu dia a dia?';
      replyMarkup = { inline_keyboard: [
        [{ text: 'Sentado casi todo el dia', callback_data: 'sedentary' }],
        [{ text: 'Camino algo, tareas ligeras', callback_data: 'lightly_active' }],
        [{ text: 'De pie bastante, camino mucho', callback_data: 'moderately_active' }],
        [{ text: 'Trabajo fisico pesado', callback_data: 'very_active' }]
      ]};
    } else {
      errorMessage = 'Escribe la hora en formato HH:MM (ej: 06:30)';
    }
    break;
  }

  case 'ask_activity_level': {
    const validLevels = ['sedentary','lightly_active','moderately_active','very_active'];
    if (validLevels.includes(input)) {
      state.data.activity_level = input;
      nextStep = 'confirm_profile'; nextBlock = null; isValid = true;
      // Build brief confirmation summary
      const d = state.data;
      const goalDisplay = { lose_fat: 'Perder grasa', gain_muscle: 'Ganar musculo', maintain: 'Mantener peso', recomposition: 'Recomposicion' }[d.goal_type];
      const targetLine = d.target_weight ? ` → meta: ${d.target_weight} kg` : '';
      responseMessage = `Listo, ${d.first_name}. Confirmo los datos clave:\n\n${d.age} anos, ${d.height_cm} cm, ${d.weight_kg} kg\nObjetivo: ${goalDisplay}${targetLine}\n${d.training_days_per_week} dias de ejercicio, ${d.meals_per_day} comidas al dia\n\nTodo bien o quieres corregir algo?`;
      replyMarkup = { inline_keyboard: [[
        { text: 'Todo bien, dale', callback_data: 'confirm' },
        { text: 'Quiero corregir algo', callback_data: 'correct' }
      ]]};
    } else {
      errorMessage = 'Usa los botones para seleccionar tu nivel de actividad.';
    }
    break;
  }

  case 'confirm_profile': {
    if (input === 'confirm') {
      nextStep = 'calculate_and_complete'; isValid = true;
      responseMessage = ''; // handled by completion flow
    } else if (input === 'correct') {
      nextStep = 'correct_block'; isValid = true;
      responseMessage = 'Que quieres cambiar?';
      replyMarkup = { inline_keyboard: [
        [{ text: 'Datos fisicos', callback_data: 'block_1' }, { text: 'Objetivo', callback_data: 'block_2' }],
        [{ text: 'Alimentacion', callback_data: 'block_3' }, { text: 'Ejercicio', callback_data: 'block_4' }],
        [{ text: 'Horarios', callback_data: 'block_5' }]
      ]};
    } else {
      errorMessage = 'Usa los botones para confirmar o corregir.';
    }
    break;
  }

  case 'correct_block': {
    const blockMap = { block_1: 'ask_gender', block_2: 'ask_goal', block_3: 'ask_dietary_restrictions_known', block_4: 'ask_fitness_level', block_5: 'ask_wake_time' };
    const blockNum = { block_1: 1, block_2: 2, block_3: 3, block_4: 4, block_5: 5 };
    if (blockMap[input]) {
      nextStep = blockMap[input]; nextBlock = blockNum[input]; isValid = true;
      // Re-ask first question of the selected block
      const blockMessages = {
        block_1: { msg: 'Genero biologico?', kb: [[{ text: 'Hombre', callback_data: 'male' }, { text: 'Mujer', callback_data: 'female' }]] },
        block_2: { msg: 'Que quieres lograr?', kb: [[{ text: 'Perder grasa', callback_data: 'lose_fat' }, { text: 'Ganar musculo', callback_data: 'gain_muscle' }],[{ text: 'Mantener peso', callback_data: 'maintain' }, { text: 'Recomposicion corporal', callback_data: 'recomposition' }]] },
        block_3: { msg: 'Tienes alguna restriccion dietaria o alergia alimentaria?', kb: [[{ text: 'Si, tengo', callback_data: 'yes' }, { text: 'No, ninguna', callback_data: 'no' }]] },
        block_4: { msg: 'Como describirias tu experiencia entrenando?', kb: [[{ text: 'Principiante', callback_data: 'beginner' }],[{ text: 'Intermedio', callback_data: 'intermediate' }],[{ text: 'Avanzado', callback_data: 'advanced' }]] },
        block_5: { msg: 'A que hora te despiertas normalmente?', kb: [[{ text: '5:00', callback_data: '05:00' },{ text: '6:00', callback_data: '06:00' },{ text: '7:00', callback_data: '07:00' },{ text: '8:00', callback_data: '08:00' },{ text: '9:00', callback_data: '09:00' },{ text: 'Otra', callback_data: 'custom' }]] }
      };
      responseMessage = blockMessages[input].msg;
      replyMarkup = { inline_keyboard: blockMessages[input].kb };
    } else {
      errorMessage = 'Usa los botones para seleccionar el bloque.';
    }
    break;
  }
}

if (isValid) {
  state.step = nextStep;
  state.block = nextBlock || state.block;
  state.updated_at = new Date().toISOString();
}

const isComplete = nextStep === 'calculate_and_complete';

return [{
  json: {
    state,
    isValid,
    isComplete,
    responseMessage: isValid ? responseMessage : errorMessage,
    replyMarkup
  }
}];
```

#### Nodo 7: Save Onboarding State (Redis)

- **Tipo**: Redis - Set
- **Key**: `onboarding:{{ $('Sub-Workflow Trigger').item.json.telegramId }}`
- **Value**: `{{ JSON.stringify($json.state) }}`
- **TTL**: `172800` (48 horas — se renueva con cada interacción)
- **Credencial**: `FitAI Redis`

#### Nodo 8: Is Onboarding Complete? (IF)

- **Tipo**: IF (typeVersion 2)
- **Condición**: `{{ $json.isComplete }}` string equals `"true"`
- **Rama true**: nodo "Calculate Metrics"
- **Rama false**: nodo "Send Question"

#### Nodo 9: Send Question (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Sub-Workflow Trigger').item.json.chatId }}`
- **Texto**: `{{ $json.responseMessage }}`
- **Parse Mode**: Markdown
- **Reply Markup**: `{{ $json.replyMarkup ? JSON.stringify($json.replyMarkup) : undefined }}` (inline keyboard cuando aplica)
- **Credencial**: `FitAI Telegram Bot`

Nodo terminal para esta ejecución. El usuario responderá con otro mensaje (texto o callback de botón) que volverá a activar el webhook e invocar este sub-workflow.

#### Nodo 10: Calculate Metrics (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: calcular BMI, BMR (Mifflin-St Jeor), TDEE y targets de macronutrientes con las fórmulas v2.

```javascript
const data = $json.state.data;

// BMI
const bmi = data.weight_kg / Math.pow(data.height_cm / 100, 2);
const bmiCategory = bmi < 18.5 ? 'bajo peso' : bmi < 25 ? 'peso normal' : bmi < 30 ? 'sobrepeso' : 'obesidad';

// BMR — Mifflin-St Jeor
const bmr = data.gender === 'male'
  ? (10 * data.weight_kg) + (6.25 * data.height_cm) - (5 * data.age) + 5
  : (10 * data.weight_kg) + (6.25 * data.height_cm) - (5 * data.age) - 161;

// TDEE — activity multipliers (v2: 4 niveles, sin extra_active)
const activityMultipliers = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725
};
const tdee = bmr * activityMultipliers[data.activity_level];

// Caloric target — v2 formulas (% of TDEE, not fixed offsets)
const caloricTargetRaw = {
  lose_fat: tdee * 0.80,
  gain_muscle: tdee * 1.10,
  maintain: tdee * 1.0,
  recomposition: tdee * 0.95
}[data.goal_type];

// Absolute minimums
const minCalories = data.gender === 'female' ? 1200 : 1500;
const caloricTarget = Math.max(Math.round(caloricTargetRaw), minCalories);

// Macronutrients
const proteinMultiplier = data.goal_type === 'gain_muscle' ? 2.2 : data.goal_type === 'recomposition' ? 2.0 : 1.8;
const proteinTarget = Math.round(data.weight_kg * proteinMultiplier);
const fatTarget = Math.round((caloricTarget * 0.25) / 9);
const carbTarget = Math.round((caloricTarget - (proteinTarget * 4) - (fatTarget * 9)) / 4);

// Deficit/surplus for messaging
const deficit = data.goal_type === 'lose_fat' ? Math.round(tdee - caloricTarget) : null;
const surplus = data.goal_type === 'gain_muscle' ? Math.round(caloricTarget - tdee) : null;

// Estimated weeks to goal
let estimatedWeeks = null;
if (data.target_weight) {
  const weightDiff = Math.abs(data.weight_kg - data.target_weight);
  const weeklyRateKg = data.goal_type === 'lose_fat' ? 0.5 : 0.25;
  estimatedWeeks = Math.ceil(weightDiff / weeklyRateKg);
}

const goalDisplay = { lose_fat: 'Perder grasa', gain_muscle: 'Ganar musculo', maintain: 'Mantener peso', recomposition: 'Recomposicion corporal' }[data.goal_type];

return [{
  json: {
    ...data,
    bmi: Math.round(bmi * 10) / 10,
    bmi_category: bmiCategory,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    caloric_target: caloricTarget,
    protein_target_g: proteinTarget,
    carb_target_g: carbTarget,
    fat_target_g: fatTarget,
    deficit,
    surplus,
    estimated_weeks: estimatedWeeks,
    goal_display: goalDisplay,
    userId: $('Sub-Workflow Trigger').first().json.userId,
    telegramId: $('Sub-Workflow Trigger').first().json.telegramId,
    chatId: $('Sub-Workflow Trigger').first().json.chatId
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
  wake_up_time, meals_per_day, budget_level,
  onboarding_completed, onboarding_completed_at,
  bmr, tdee, caloric_target,
  protein_target_g, carb_target_g, fat_target_g
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8,
  $9, $10, $11,
  $12, $13, $14,
  $15, $16, $17,
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
  meals_per_day = EXCLUDED.meals_per_day,
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

**Nota v2**: eliminados `sleep_time` y `meal_count` (obsoletos). Renombrado `meal_count` → `meals_per_day`, `available_equipment` → `equipment`.

#### Nodo 12: Save Initial Goal (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO goals (user_id, goal_type, target_weight, start_weight, start_date, is_active)
VALUES ($1, $2, $3, $4, CURRENT_DATE, true)
ON CONFLICT (user_id) DO UPDATE SET
  goal_type = EXCLUDED.goal_type,
  target_weight = EXCLUDED.target_weight,
  start_weight = EXCLUDED.start_weight,
  start_date = EXCLUDED.start_date,
  is_active = true;
```

- **Parámetros**: `userId`, `goal_type`, `target_weight` (puede ser null), `weight_kg`

#### Nodo 13: Save Initial Weight Log (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO weight_logs (user_id, weight_kg, notes, logged_at)
VALUES ($1, $2, 'Peso inicial - onboarding', CURRENT_DATE)
ON CONFLICT DO NOTHING;
```

#### Nodo 14: Create Tomorrow Daily Targets (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: crear el registro de `daily_targets` para mañana con los valores calculados durante el onboarding. Esto permite que el morning briefing del día siguiente tenga los targets listos.

```sql
INSERT INTO daily_targets (
  user_id, target_date,
  caloric_target, protein_target_g, carb_target_g, fat_target_g,
  calories_consumed, protein_consumed_g, carbs_consumed_g, fat_consumed_g
) VALUES (
  $1,
  (CURRENT_DATE AT TIME ZONE 'America/Bogota') + INTERVAL '1 day',
  $2, $3, $4, $5,
  0, 0, 0, 0
)
ON CONFLICT (user_id, target_date) DO NOTHING;
```

- **Parámetros**: `userId`, `caloric_target`, `protein_target_g`, `carb_target_g`, `fat_target_g`

#### Nodo 15: Generate First Meal Plan (Execute Sub-Workflow)

- **Tipo**: Execute Sub-Workflow
- **Workflow**: `FitAI - Meal Plan Generator`
- **Datos enviados**: `userId`, `chatId`, `plan_date` (mañana en timezone Colombia)

```javascript
// En el nodo Set antes de llamar al sub-workflow:
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const planDate = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
// → "2026-03-27"
```

#### Nodo 16: Delete Onboarding State (Redis)

- **Tipo**: Redis - Delete
- **Key**: `onboarding:{{ $('Sub-Workflow Trigger').item.json.telegramId }}`
- **Credencial**: `FitAI Redis`

Se ejecuta **después** de guardar perfil y goals exitosamente. Si el guardado falla, el estado de Redis NO se elimina para que el usuario pueda reintentar.

#### Nodo 17: Index Onboarding Summary (Execute Sub-Workflow)

- **Tipo**: Execute Sub-Workflow
- **Workflow**: `FitAI - RAG Personal Indexer`
- **Propósito**: indexar un resumen del perfil del usuario en `user_rag` (Qdrant) para que el AI Agent tenga contexto del usuario disponible via RAG desde el primer mensaje.
- **Datos enviados**: `userId`, `contentType: 'onboarding_summary'`, texto con perfil completo en lenguaje natural

Ejemplo de texto indexado:

```
Mauro, hombre, 28 años, 180cm, 82kg. Objetivo: perder grasa, meta 75kg.
Alimentación: sin restricciones, presupuesto moderado, 3 comidas al día.
Ejercicio: nivel intermedio, gimnasio, 4 días/semana.
Horario: se despierta a las 6:00. Actividad diaria: trabajo sedentario.
Métricas: TDEE 2580 kcal, objetivo 2064 kcal/día, proteína 148g/día.
Onboarding completado: 2026-03-31.
```

#### Nodo 18: Send Metrics Message (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Sub-Workflow Trigger').item.json.chatId }}`
- **Parse Mode**: Markdown
- **Texto**: mensaje conversacional de métricas (v2 — no lista técnica)

```
{{ $('Calculate Metrics').item.json.first_name }}, ya tengo todo.

Tu cuerpo gasta unas *{{ $('Calculate Metrics').item.json.tdee }} kcal* al dia.

[Línea contextual según goal_type — ver prompts/onboarding.md sección 5]

Tu IMC hoy: *{{ $('Calculate Metrics').item.json.bmi }}* ({{ $('Calculate Metrics').item.json.bmi_category }}).
```

> **Nota de implementación**: el texto exacto varía por `goal_type` (4 variantes). Ver [`prompts/onboarding.md`](../prompts/onboarding.md) sección 5 "Mensaje de métricas contextuales" para los templates completos con variables `{{deficit}}`, `{{surplus}}`, `{{protein_g}}`, `{{estimated_weeks}}`.

#### Nodo 19: Send Welcome to Service Message (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $('Sub-Workflow Trigger').item.json.chatId }}`
- **Parse Mode**: Markdown
- **Texto**:

```
Ya te prepare tu plan de comidas para manana. Te lo mando temprano junto con tu meta del dia.

Asi va a funcionar: cada manana te envio tu plan con las comidas y calorias. Durante el dia me vas contando que comiste y yo llevo la cuenta de como vas. En la noche hacemos un check rapido. Y cada semana te mando tu resumen de progreso con numeros reales.

Descansa bien, que manana arrancamos 💪
```

Se envía como **segundo mensaje**, inmediatamente después del mensaje de métricas. No incluye lista de comandos — el coaching toma la iniciativa.

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Get Onboarding State (Redis)
    → Initialize or Resume? (IF)
        ├─ true (primer contacto)
        │     → Initialize Onboarding (Code)
        │     → Save Onboarding State (Redis, TTL 172800)
        │     → Send Question (Telegram: bienvenida + "Como te llamo?") → FIN
        └─ false (continuación)
              → Parse Onboarding State (Code)
                → Validate and Process Step (Code)
                  → Save Onboarding State (Redis, TTL 172800)
                  → Is Onboarding Complete? (IF)
                      ├─ false → Send Question (Telegram: siguiente pregunta + inline keyboard) → FIN
                      └─ true
                            → Calculate Metrics (Code)
                                [en paralelo]
                                ├─ Save User Profile (PostgreSQL)
                                ├─ Save Initial Goal (PostgreSQL)
                                ├─ Save Initial Weight Log (PostgreSQL)
                                └─ Create Tomorrow Daily Targets (PostgreSQL)
                            → Generate First Meal Plan (sub-workflow: plan_date = tomorrow)
                            → Delete Onboarding State (Redis)
                            → Index Onboarding Summary (sub-workflow: RAG Personal Indexer)
                            → Send Metrics Message (Telegram) → Send Welcome Message (Telegram) → FIN
```

**Flujo de corrección** (dentro del loop de preguntas):

```
... → ask_activity_level → confirm_profile
        ├─ "Todo bien, dale" → calculate_and_complete → [completion flow]
        └─ "Quiero corregir algo" → correct_block
              → selección de bloque → re-ask primer pregunta del bloque
              → ... respuestas del bloque ...
              → confirm_profile (vuelve a mostrar resumen breve)
```

### Manejo de Errores

- **Redis no disponible al inicio**: se asume primer contacto y se muestra el mensaje de bienvenida. Si no se puede escribir en Redis, se notifica al usuario que intente de nuevo.
- **Validación fallida**: se repite la pregunta actual SIN confirmaciones largas. Solo: `No entendi eso. [pregunta original]` o el mensaje de error específico del campo. El step no avanza.
- **State expirado (TTL 48h)**: mensaje de retoma amigable: `Ey, parece que no terminamos tu registro. Quieres retomar donde lo dejamos o empezar de nuevo?` con botones `[ Retomar ]  [ Empezar de nuevo ]`. Si elige "Empezar de nuevo", se borra el estado Redis y se reinicia.
- **Comando /cancelar**: `Cancelado. Cuando quieras retomar solo escribeme.` (sin mencionar /start).
- **PostgreSQL error al guardar perfil**: se captura el error, se envía mensaje al usuario indicando el problema, se notifica al admin. El estado de Redis NO se elimina — el usuario puede reintentar sin repetir todas las preguntas.
- **Error en cálculo de métricas**: se logea el error y se usan valores conservadores por defecto. Se marca el perfil para revisión manual.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Credencial n8n | `FitAI Redis` | Conexión a Redis |
| Variable de entorno | `ONBOARDING_TTL` | TTL del estado en Redis en segundos (default: `172800`) |

---

## 4. FitAI - Meal Plan Generator

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Meal Plan Generator` |
| **Trigger** | Tool llamada por el agente principal, sub-workflow desde Onboarding, o cron nocturno |
| **Propósito** | Genera el plan de comidas de UN DÍA específico (`plan_date`) usando GPT-4o. Considera los últimos 3 días de comidas (variedad), el intake real de ayer (ajuste calórico), el promedio semanal y si el usuario tiene entrenamiento ese día. |
| **Activación** | Execute Sub-Workflow o Tool call del AI Agent |
| **Versión** | v2 — Plan diario (no semanal) |

### Descripción del Propósito

Este workflow recibe `userId` y `planDate` (por defecto mañana), carga el perfil del usuario y 4 fuentes de contexto en paralelo, construye el prompt diario con todas las variables de adaptación (intake real, variedad, workout), llama a GPT-4o para generar el plan de un solo día en JSON, valida la estructura, desactiva planes anteriores del mismo `plan_date`, guarda el nuevo plan con `plan_date` y retorna el plan formateado para el morning briefing o para la respuesta del agente.

**Cambio clave v1→v2**: el plan es **diario**, no semanal. `week_number` y `year` quedan deprecated. El campo principal es `plan_date`. Se generan planes individuales cada noche para el día siguiente, con contexto del intake real y variedad respecto a los últimos 3 días.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger

- **Tipo**: Execute Sub-Workflow Trigger
- **Datos de entrada**: `userId`, `planDate` (fecha ISO YYYY-MM-DD, default: mañana en Colombia), `chatId` (opcional)

#### Nodo 2: Load User Profile (PostgreSQL) — en paralelo

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT up.*, g.goal_type, g.target_weight, u.first_name
FROM user_profiles up
JOIN users u ON up.user_id = u.id
LEFT JOIN goals g ON up.user_id = g.user_id AND g.is_active = true
WHERE up.user_id = $1;
```

- **Parámetros**: `userId`

#### Nodo 3: Get Recent Meals (PostgreSQL) — en paralelo

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: obtener los planes de los últimos 3 días para evitar repetición de platos.
- **Query**:

```sql
SELECT mp.plan_date, mp.plan_json
FROM meal_plans mp
WHERE mp.user_id = $1
  AND mp.plan_date >= ($2::date - INTERVAL '3 days')
  AND mp.plan_date < $2::date
ORDER BY mp.plan_date DESC;
```

- **Parámetros**: `userId`, `planDate`
- **`alwaysOutputData: true`** — un usuario nuevo no tiene planes previos.

#### Nodo 4: Get Yesterday Intake (PostgreSQL) — en paralelo

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: obtener el intake real de ayer para ajustar el plan de hoy (si se excedió en calorías o quedó bajo en proteína).
- **Query**:

```sql
SELECT
  dt.calories_consumed,
  dt.protein_consumed_g,
  dt.carbs_consumed_g,
  dt.fat_consumed_g,
  dt.meals_logged
FROM daily_targets dt
WHERE dt.user_id = $1
  AND dt.target_date = ($2::date - INTERVAL '1 day');
```

- **Parámetros**: `userId`, `planDate`
- **`alwaysOutputData: true`** — puede no existir para usuarios nuevos.

#### Nodo 5: Get Weekly Average (PostgreSQL) — en paralelo

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: calcular el promedio calórico semanal actual para ajuste fino del plan.
- **Query**:

```sql
SELECT
  AVG(calories_consumed) AS avg_calories,
  AVG(protein_consumed_g) AS avg_protein
FROM daily_targets
WHERE user_id = $1
  AND target_date >= date_trunc('week', $2::date)
  AND target_date < $2::date
  AND meals_logged > 0;
```

- **Parámetros**: `userId`, `planDate`
- **`alwaysOutputData: true`**

#### Nodo 6: Check Workout Day (PostgreSQL) — en paralelo

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: determinar si el usuario tiene entrenamiento el día del plan (para incluir snack pre/post workout si aplica).
- **Query**:

```sql
SELECT EXISTS(
  SELECT 1 FROM exercise_plans
  WHERE user_id = $1
    AND is_active = true
    AND plan_json::jsonb @> jsonb_build_object('day_of_week', to_char($2::date, 'FMDay'))
) AS has_workout;
```

- **Parámetros**: `userId`, `planDate`

#### Nodo 7: Build Daily Meal Plan Prompt (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: consolidar todas las fuentes de contexto y construir el prompt diario usando el template de `prompts/meal-plan-generation.md`.

```javascript
const profile = $('Load User Profile').first().json;
const recentPlans = $('Get Recent Meals').all().map(i => i.json);
const yesterdayRaw = $('Get Yesterday Intake').first()?.json || null;
const weeklyAvgRaw = $('Get Weekly Average').first()?.json || null;
const hasWorkout = $('Check Workout Day').first()?.json?.has_workout || false;
const planDate = $('Sub-Workflow Trigger').first().json.planDate;

// Resumen de comidas recientes para evitar repetición
let recentMeals = '';
for (const plan of recentPlans) {
  if (!plan.plan_json) continue;
  const p = typeof plan.plan_json === 'string' ? JSON.parse(plan.plan_json) : plan.plan_json;
  const mealNames = (p.meals || []).map(m => m.name).join(', ');
  recentMeals += `${plan.plan_date}: ${mealNames}\n`;
}

// Día de la semana y fin de semana
const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const dateObj = new Date(planDate + 'T12:00:00');
const dayOfWeek = dayNames[dateObj.getDay()];
const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

// Contexto de intake de ayer (solo si el usuario logueó comidas)
const yesterdayIntake = (yesterdayRaw?.meals_logged > 0) ? {
  calories: yesterdayRaw.calories_consumed,
  protein: yesterdayRaw.protein_consumed_g
} : null;

// Promedio semanal (solo si hay datos)
const weeklyAvg = weeklyAvgRaw?.avg_calories ? {
  avg_calories: Math.round(weeklyAvgRaw.avg_calories),
  avg_protein: Math.round(weeklyAvgRaw.avg_protein)
} : null;

// Construir prompt con template diario (ver prompts/meal-plan-generation.md)
const prompt = buildDailyPrompt({
  userName: profile.first_name,
  planDate,
  dayOfWeek,
  caloricTarget: profile.caloric_target,
  proteinTarget: profile.protein_target_g,
  carbTarget: profile.carb_target_g,
  fatTarget: profile.fat_target_g,
  mealCount: profile.meals_per_day || profile.meal_count || 3,
  dietaryRestrictions: profile.dietary_restrictions || [],
  foodAllergies: profile.food_allergies || [],
  dislikedFoods: profile.disliked_foods || [],
  localCulture: profile.local_culture || 'colombian',
  budget: profile.budget_level || 'medium',
  wakeUpTime: profile.wake_up_time || '07:00',
  recentMeals: recentMeals || null,
  yesterdayIntake,
  weeklyAvg,
  isWeekend,
  hasWorkout
});

return [{ json: { prompt, userId: $json.userId, planDate, dayOfWeek } }];

function buildDailyPrompt(vars) {
  // Template completo en prompts/meal-plan-generation.md sección "Template Principal"
  // Esta función construye el string del prompt interpolando las variables
  let p = `Eres un nutriologo experto creando el plan de comidas de UN DIA para un usuario.\n\n`;
  p += `PERFIL DEL USUARIO:\n`;
  p += `- Nombre: ${vars.userName}\n`;
  p += `- Objetivo calorico diario: ${vars.caloricTarget} kcal\n`;
  p += `- Macros objetivo: ${vars.proteinTarget}g proteina, ${vars.carbTarget}g carbohidratos, ${vars.fatTarget}g grasa\n`;
  p += `- Restricciones dietarias: ${vars.dietaryRestrictions.length ? vars.dietaryRestrictions.join(', ') : 'ninguna'}\n`;
  p += `- Alergias: ${vars.foodAllergies.length ? vars.foodAllergies.join(', ') : 'ninguna'}\n`;
  p += `- Alimentos que no le gustan: ${vars.dislikedFoods.length ? vars.dislikedFoods.join(', ') : 'ninguno'}\n`;
  p += `- Cultura gastronomica: ${vars.localCulture}\n`;
  p += `- Presupuesto: ${vars.budget}\n`;
  p += `- Numero de comidas: ${vars.mealCount}\n`;
  p += `- Hora de despertar: ${vars.wakeUpTime}\n`;
  p += `- Dia: ${vars.dayOfWeek} (${vars.planDate})\n`;
  p += `- Es fin de semana: ${vars.isWeekend}\n`;
  p += `- Tiene entrenamiento programado: ${vars.hasWorkout}\n\n`;

  if (vars.recentMeals) {
    p += `COMIDAS DE LOS ULTIMOS 3 DIAS (no repitas estos platos):\n${vars.recentMeals}\n`;
  }
  if (vars.yesterdayIntake) {
    p += `INTAKE REAL DE AYER:\n`;
    p += `- Calorias consumidas: ${vars.yesterdayIntake.calories} kcal (meta: ${vars.caloricTarget})\n`;
    p += `- Proteina consumida: ${vars.yesterdayIntake.protein}g (meta: ${vars.proteinTarget})\n`;
    if (vars.yesterdayIntake.calories > vars.caloricTarget + 200) {
      p += `NOTA: Ayer se excedio en calorias. Ajusta ligeramente el plan de hoy hacia la parte baja del rango (${vars.caloricTarget} - 100).\n`;
    }
    if (vars.yesterdayIntake.protein < vars.proteinTarget * 0.8) {
      p += `NOTA: Ayer quedo bajo en proteina. Prioriza fuentes de proteina en las comidas de hoy.\n`;
    }
    p += '\n';
  }
  if (vars.weeklyAvg) {
    p += `PROMEDIO SEMANAL ACTUAL:\n`;
    p += `- Calorias promedio: ${vars.weeklyAvg.avg_calories} kcal/dia\n`;
    p += `- Proteina promedio: ${vars.weeklyAvg.avg_protein}g/dia\n`;
    if (vars.weeklyAvg.avg_calories > vars.caloricTarget + 100) {
      p += `NOTA: El promedio semanal esta por encima de la meta. Apunta al limite bajo del rango calorico hoy.\n`;
    }
    p += '\n';
  }

  p += `INSTRUCCIONES:\n1. Genera exactamente ${vars.mealCount} comidas para este dia.\n`;
  p += `2. Las calorias totales del dia deben estar entre ${vars.caloricTarget} - 50 y ${vars.caloricTarget} + 50.\n`;
  p += `3. Los macros deben acercarse a los objetivos (±10%).\n`;
  p += `4. NUNCA incluyas alimentos de las restricciones, alergias o disgustos.\n`;
  p += `5. Usa ingredientes comunes en la cultura ${vars.localCulture}.\n`;
  p += `6. Adapta al presupuesto: low=proteinas economicas (huevo, pollo, atun, leguminosas); medium=pechuga, carne molida, tilapia; high=sin restriccion.\n`;
  p += `7. Distribuye las comidas desde ${vars.wakeUpTime} con intervalos de 3-4 horas.\n`;
  p += `8. Preparacion: maximo 25 minutos${vars.isWeekend ? ' (fin de semana, puede ser mas elaborada)' : ''}.\n`;
  p += `9. NO repitas platos de los ultimos 3 dias.\n`;
  p += `10. Varia el tipo de proteina entre comidas del mismo dia.\n`;
  if (vars.hasWorkout) {
    p += `11. El usuario tiene entrenamiento hoy. Incluye snack pre o post-entrenamiento si el numero de comidas lo permite.\n`;
  }

  p += `\nFORMATO DE SALIDA — responde EXCLUSIVAMENTE con JSON valido:\n`;
  p += `{"plan_date":"${vars.planDate}","day_of_week":"${vars.dayOfWeek}","total_calories":<n>,"total_protein_g":<n>,"total_carbs_g":<n>,"total_fat_g":<n>,"meals":[{"meal_type":"breakfast|lunch|snack|dinner","meal_label":"Desayuno|Almuerzo|Snack|Cena","time":"HH:MM","name":"<nombre en espanol>","calories":<n>,"protein_g":<n>,"carbs_g":<n>,"fat_g":<n>,"ingredients":[{"name":"<ingrediente>","quantity":"<cantidad>","grams":<n>}],"preparation_notes":"<instrucciones breves>"}]}`;

  return p;
}
```

#### Nodo 8: Generate Meal Plan (OpenAI)

- **Tipo**: OpenAI - Chat Completion
- **Credencial**: `FitAI OpenAI`
- **Modelo**: `gpt-4o`
- **Temperature**: `0.85` (ligeramente más alto que v1 para variedad día a día)
- **Max Tokens**: `2048` (un día necesita menos tokens que 7 días)
- **System Message**: `"Eres un nutriologo experto. Responde SOLO con JSON valido, sin texto adicional."`
- **User Message**: `{{ $json.prompt }}`
- **Response Format**: `json_object`

#### Nodo 9: Parse and Validate Plan (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: parsear y validar la respuesta JSON de un plan de un solo día.

```javascript
const response = $('Generate Meal Plan').first().json.message.content;
let plan;

try {
  plan = JSON.parse(response);
} catch (e) {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    plan = JSON.parse(jsonMatch[0]);
  } else {
    throw new Error('No se pudo parsear el plan diario generado por OpenAI');
  }
}

// Validar estructura de plan diario (v2)
if (!plan.meals || !Array.isArray(plan.meals)) {
  throw new Error('El plan no contiene la estructura de meals esperada');
}
if (plan.meals.length < 3) {
  throw new Error('El plan tiene menos de 3 comidas');
}

// Asegurar campos requeridos
plan.plan_date = $json.planDate;
plan.day_of_week = $json.dayOfWeek;

const totalCalories = plan.total_calories ||
  plan.meals.reduce((sum, m) => sum + (m.calories || 0), 0);
const totalProtein = plan.total_protein_g ||
  plan.meals.reduce((sum, m) => sum + (m.protein_g || 0), 0);

return [{
  json: {
    plan,
    totalCalories: Math.round(totalCalories),
    totalProtein: Math.round(totalProtein),
    userId: $json.userId,
    planDate: $json.planDate
  }
}];
```

#### Nodo 10: Deactivate Previous Plan for Same Date (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: desactivar solo el plan del mismo `plan_date` (no todos los planes activos del usuario).
- **Query**:

```sql
UPDATE meal_plans
SET is_active = false
WHERE user_id = $1
  AND plan_date = $2::date
  AND is_active = true;
```

- **Parámetros**: `userId`, `planDate`

#### Nodo 11: Save New Daily Plan (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO meal_plans (user_id, plan_date, plan_json, total_calories, is_active, generated_at)
VALUES ($1, $2::date, $3, $4, true, NOW())
RETURNING id;
```

- **Parámetros**: `userId`, `planDate`, `JSON.stringify(plan)`, `totalCalories`

**Nota**: no se usan `week_number`, `year` ni `expires_at` en v2. `plan_date` es el campo principal.

#### Nodo 12: Return Plan to Caller (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: formatear el plan del día de forma concisa para el morning briefing o para la respuesta del agente al usuario.

```javascript
const plan = $('Parse and Validate Plan').first().json.plan;
const meals = plan.meals || [];

// Formato conciso — una línea por comida
let formatted = `Plan de comidas para ${plan.day_of_week} (${plan.plan_date}):\n\n`;
for (const meal of meals) {
  formatted += `${meal.meal_label} (${meal.time}): ${meal.name} — *${meal.calories} kcal*, ${meal.protein_g}g proteina\n`;
}
formatted += `\nTotal del dia: *${plan.total_calories} kcal* | *${plan.total_protein_g}g* proteina`;

return [{
  json: {
    formattedPlan: formatted,
    plan,
    totalCalories: plan.total_calories,
    totalProtein: plan.total_protein_g,
    planDate: plan.plan_date
  }
}];
```

### Lógica de Ramificación

```
Sub-Workflow Trigger
  ├─ Load User Profile (PostgreSQL)        ← en paralelo
  ├─ Get Recent Meals (PostgreSQL)         ← en paralelo
  ├─ Get Yesterday Intake (PostgreSQL)     ← en paralelo
  ├─ Get Weekly Average (PostgreSQL)       ← en paralelo
  └─ Check Workout Day (PostgreSQL)        ← en paralelo
       ↓ (todos convergen)
  Build Daily Meal Plan Prompt (Code)
    → Generate Meal Plan (OpenAI)
      → Parse and Validate Plan (Code)
        → Deactivate Previous Plan for Same Date (PostgreSQL)
          → Save New Daily Plan (PostgreSQL)
            → Return Plan to Caller (Code)
```

Flujo lineal sin ramificaciones condicionales. Los 5 nodos de contexto corren en paralelo; el resto es secuencial.

### Manejo de Errores

- **OpenAI retorna JSON inválido**: reintento 1 vez con prompt reforzado. Si falla, retorna error al agente: `No pude generar el plan de comidas. Por favor intenta de nuevo.`
- **Plan incompleto (< 3 comidas)**: reintento 1 vez antes de fallar.
- **PostgreSQL error al guardar**: el plan se retorna igualmente al usuario con nota interna de que no se persistió.
- **Timeout OpenAI**: 45 segundos (un día es más rápido que 7 días con 2048 tokens).
- **Sin perfil de usuario**: error crítico — log + notificación al admin.
- **Nodos de contexto sin resultados** (`Get Recent Meals`, `Get Yesterday Intake`, `Get Weekly Average`): todos tienen `alwaysOutputData: true` — el prompt se construye igualmente sin esas variables (usuario nuevo o sin datos).

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI OpenAI` | API key de OpenAI |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Variable de entorno | `MEAL_PLAN_MODEL` | Modelo para generación de planes (default: `gpt-4o`) |
| Variable de entorno | `MEAL_PLAN_TEMPERATURE` | Temperature para planes (default: `0.85`) |
| Variable de entorno | `MEAL_PLAN_MAX_TOKENS` | Max tokens para planes diarios (default: `2048`) |

---

## 4.1. FitAI - Daily Plan Generator Cron

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Daily Plan Generator Cron` |
| **Trigger** | Cron: `0 21 * * *` (9:00 pm hora Colombia) |
| **Propósito** | Genera automáticamente el plan de comidas del día siguiente para todos los usuarios activos que aún no tienen plan. También crea el registro `daily_targets` de mañana para cada usuario. |
| **Activación** | Automática cada noche a las 9pm |

### Descripción del Propósito

Cada noche a las 9pm, este workflow consulta todos los usuarios con membresía activa y onboarding completado que **no tienen** plan de comidas activo para mañana. Por cada usuario faltante, invoca el sub-workflow `FitAI - Meal Plan Generator` con `planDate = mañana` y crea su registro en `daily_targets`. Cada generación tiene una pausa de 1 segundo para respetar los rate limits de la API de OpenAI. Los errores por usuario son capturados individualmente y no detienen el batch.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `0 21 * * *` (diario a las 21:00 hora `America/Bogota`)

#### Nodo 2: Get Active Users Without Tomorrow Plan (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: obtener usuarios activos sin plan para mañana (evita regenerar si ya existe).
- **Query**:

```sql
SELECT
  u.id AS user_id,
  u.telegram_id,
  u.first_name,
  up.wake_up_time,
  up.caloric_target,
  up.protein_target_g,
  up.carb_target_g,
  up.fat_target_g
FROM users u
JOIN memberships m
  ON u.id = m.user_id
  AND m.status = 'active'
  AND m.expires_at > NOW()
JOIN user_profiles up
  ON u.id = up.user_id
  AND up.onboarding_completed = true
LEFT JOIN meal_plans mp
  ON u.id = mp.user_id
  AND mp.plan_date = CURRENT_DATE + 1
  AND mp.is_active = true
WHERE mp.id IS NULL
ORDER BY u.id;
```

**`alwaysOutputData: true`** — puede no haber usuarios si todos ya tienen plan.

#### Nodo 3: Loop Over Users (SplitInBatches)

- **Tipo**: SplitInBatches
- **Batch size**: `1` (procesar de uno en uno con pausa)
- **Propósito**: iterar sobre cada usuario y llamar el sub-workflow de generación.

#### Nodo 4: Generate Plan for User (Execute Sub-Workflow)

- **Tipo**: Execute Sub-Workflow
- **Workflow**: `FitAI - Meal Plan Generator`
- **Datos enviados**:

```javascript
// Nodo Set antes del Execute Sub-Workflow
{
  userId: "={{ $json.user_id }}",
  planDate: "={{ (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); })() }}"
}
```

**Manejo de error**: el nodo tiene `continueOnFail: true` — si un usuario falla (sin perfil, error de OpenAI), el loop continúa con el siguiente.

#### Nodo 5: Create Tomorrow Daily Targets (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Propósito**: crear el registro `daily_targets` de mañana para que el morning briefing tenga los targets disponibles.
- **Query**:

```sql
INSERT INTO daily_targets (
  user_id, target_date,
  caloric_target, protein_target_g, carb_target_g, fat_target_g,
  calories_consumed, protein_consumed_g, carbs_consumed_g, fat_consumed_g
)
SELECT
  up.user_id,
  (CURRENT_DATE AT TIME ZONE 'America/Bogota') + INTERVAL '1 day',
  up.caloric_target, up.protein_target_g, up.carb_target_g, up.fat_target_g,
  0, 0, 0, 0
FROM user_profiles up
WHERE up.user_id = $1
ON CONFLICT (user_id, target_date) DO NOTHING;
```

- **Parámetros**: `user_id` del usuario actual en el loop

#### Nodo 6: Wait 1 Second

- **Tipo**: Wait
- **Duración**: `1000ms`
- **Propósito**: respetar el rate limit de la API de OpenAI entre generaciones consecutivas.

#### Nodo 7: Log Completion (Code)

- **Tipo**: Code (JavaScript)
- **Propósito**: registrar cuántos planes se generaron exitosamente y cuántos fallaron en el batch.

```javascript
// Este nodo corre al finalizar el loop (rama "done" del SplitInBatches)
const totalProcessed = $input.all().length;
const now = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const planDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
})();

return [{ json: {
  message: `Daily Plan Generator Cron completado`,
  date: now,
  planDate,
  plansAttempted: totalProcessed
}}];
```

### Lógica de Ramificación

```
Cron Trigger (9pm diario)
  → Get Active Users Without Tomorrow Plan (PostgreSQL)
    → Loop Over Users (SplitInBatches, batch=1)
        ├─ [cada usuario]
        │     → Generate Plan for User (Execute Sub-Workflow: Meal Plan Generator)
        │           continueOnFail=true
        │     → Create Tomorrow Daily Targets (PostgreSQL)
        │     → Wait 1 Second
        │     → [siguiente usuario]
        └─ [done]
              → Log Completion (Code)
```

### Manejo de Errores

- **Usuario sin perfil completo**: el sub-workflow `Meal Plan Generator` lanza error → capturado por `continueOnFail: true` → loop continúa con el siguiente usuario.
- **Error de OpenAI (rate limit, timeout)**: capturado por `continueOnFail: true`. El usuario quedará sin plan para ese día — el agente puede generarlo on-demand si el usuario lo solicita en el morning.
- **PostgreSQL error en `daily_targets`**: `ON CONFLICT DO NOTHING` previene duplicados; errores se loguean pero no detienen el flujo.
- **Todos los usuarios ya tienen plan**: `Get Active Users` retorna 0 filas → `alwaysOutputData: true` previene que el flujo se detenga → `Log Completion` registra 0 planes generados.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |
| Credencial n8n | `FitAI OpenAI` | API key (via sub-workflow Meal Plan Generator) |

---

## 5. FitAI - Meal Reminder Scheduler

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Meal Reminder Scheduler` |
| **Trigger** | Cron: `*/15 7-21 * * *` (cada 15 min de 7am a 9pm) |
| **Propósito** | Recordar al usuario su próxima comida del plan diario cuando se acerca la hora, incluyendo el balance actual del día. Versión v2 — reemplaza el cron fijo de 3 veces al día. |
| **Activación** | Siempre activo (cron automático) |

### Descripción del Propósito

En lugar de dispararse 3 veces fijas al día (8am, 1:30pm, 7:30pm), el v2 verifica cada 15 minutos si algún usuario tiene una comida programada en los próximos 15 minutos que aún no ha recibido recordatorio. Esto personaliza los recordatorios según el horario de cada comida en el plan diario de cada usuario. Usa `jsonb_array_elements` para descomponer el JSON del plan y `conversation_logs` para deduplicación.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `*/15 7-21 * * *`
- **Timezone**: `America/Bogota`

#### Nodo 2: Get Users with Upcoming Meal (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
WITH user_meals AS (
  SELECT u.id AS user_id, u.telegram_id, u.first_name,
         up.caloric_target, up.protein_target_g,
         mp.plan_json,
         dt.calories_consumed, dt.protein_consumed_g, dt.meals_logged,
         m.meal_type, m.meal_name, m.meal_time, m.meal_calories, m.meal_protein
  FROM users u
  JOIN memberships mb ON u.id = mb.user_id AND mb.status = 'active' AND mb.expires_at > NOW()
  JOIN user_profiles up ON u.id = up.user_id AND up.onboarding_completed = true
  JOIN meal_plans mp ON u.id = mp.user_id AND mp.plan_date = CURRENT_DATE AND mp.is_active = true
  LEFT JOIN daily_targets dt ON u.id = dt.user_id AND dt.target_date = CURRENT_DATE
  CROSS JOIN LATERAL jsonb_array_elements(mp.plan_json::jsonb -> 'meals') AS meal_item
  CROSS JOIN LATERAL (
    SELECT
      meal_item ->> 'meal_type' AS meal_type,
      meal_item ->> 'name' AS meal_name,
      (meal_item ->> 'time')::time AS meal_time,
      (meal_item ->> 'calories')::int AS meal_calories,
      (meal_item ->> 'protein_g')::int AS meal_protein
  ) m
  WHERE u.is_active = true
    -- Comida en los próximos 15 minutos
    AND m.meal_time BETWEEN LOCALTIME AND LOCALTIME + INTERVAL '15 minutes'
    -- No se ha enviado recordatorio para esta comida hoy
    AND NOT EXISTS (
      SELECT 1 FROM conversation_logs cl
      WHERE cl.user_id = u.id
        AND cl.message_type = 'meal_reminder'
        AND cl.assistant_response LIKE '%' || m.meal_name || '%'
        AND cl.created_at::date = CURRENT_DATE
    )
)
SELECT * FROM user_meals;
```

**Nota**: La query descompone el JSON del plan con `jsonb_array_elements`. Si el rendimiento es un problema con muchos usuarios, se puede precalcular en una tabla auxiliar.

#### Nodo 3: Has Users? (IF)

- **Tipo**: IF
- **Condición**: el resultado tiene al menos una fila
- **Rama true**: continúa
- **Rama false**: FIN (nadie tiene comida en los próximos 15 min)

#### Nodo 4: Build Reminder Message (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item

```javascript
const caloriesConsumed = $json.calories_consumed || 0;
const proteinConsumed = $json.protein_consumed_g || 0;
const caloriesRemaining = $json.caloric_target - caloriesConsumed;
const proteinRemaining = $json.protein_target_g - proteinConsumed;
const mealsLogged = $json.meals_logged || 0;

const mealLabels = {
  breakfast: 'desayuno', lunch: 'almuerzo', snack: 'snack', dinner: 'cena'
};
const mealLabel = mealLabels[$json.meal_type] || $json.meal_type;

let balanceText = '';
if (mealsLogged > 0) {
  balanceText = `\nLlevas *${caloriesConsumed} de ${$json.caloric_target} kcal* y *${proteinConsumed} de ${$json.protein_target_g}g proteína*.`;
}

const message = `${$json.first_name}, es hora de tu ${mealLabel}: *${$json.meal_name}* — *${$json.meal_calories} kcal*, ${$json.meal_protein}g proteína.${balanceText}

Cuando termines de comer, dime qué comiste y llevo la cuenta.`;

return [{
  json: {
    telegramId: $json.telegram_id,
    userId: $json.user_id,
    mealName: $json.meal_name,
    message
  }
}];
```

#### Nodo 5: Send Reminder (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**: `{{ $json.message }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 6: Log Reminder Sent (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO conversation_logs (user_id, message_type, assistant_response, created_at)
VALUES ($1, 'meal_reminder', $2, NOW());
```

- **Parámetros**: `$1` = `userId`, `$2` = `message`

### Lógica de Ramificación

```
Cron (cada 15 min, 7am-9pm)
  → Get Users with Upcoming Meal (PostgreSQL)
    → Has Users? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Build Reminder Message (Code)
                → Send Reminder (Telegram)
                  → Log Reminder Sent (PostgreSQL)
```

### Manejo de Errores

- **Query vacía** (nadie tiene comida en los próximos 15 min): termina silenciosamente.
- **Plan JSON inválido**: `CROSS JOIN LATERAL jsonb_array_elements` falla si el campo es NULL o inválido. Activar `continueOnFail: true` en nodo 2 para que otros usuarios sigan procesándose.
- **Telegram 403** (bot bloqueado): log + continúa con siguientes. `continueOnFail: true` en nodo 5.
- **Rate limiting**: 50ms entre mensajes en batch.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

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

---

## 11. FitAI - Log Food Intake (tool `log_food_intake`)

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Log Food Intake` |
| **Trigger** | Tool Workflow (llamado por el AI Agent via `toolWorkflow` typeVersion 1.3) |
| **Propósito** | Registra una comida reportada por el usuario: inserta en `daily_intake_logs`, actualiza el acumulado en `daily_targets`, y retorna el balance actualizado del día. |
| **Cuándo se invoca** | Cada vez que el usuario reporta haber comido algo. El AI Agent estima los macros y llama esta tool antes de responder. |

### Parámetros de Entrada (desde el AI Agent)

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `meal_type` | string (enum) | Sí | `breakfast`, `lunch`, `snack`, `dinner` |
| `description` | string | Sí | Descripción libre de lo que comió el usuario |
| `estimated_calories` | number | Sí | Calorías estimadas por el AI |
| `estimated_protein_g` | number | Sí | Proteína estimada en gramos |
| `estimated_carbs_g` | number | Sí | Carbohidratos estimados en gramos |
| `estimated_fat_g` | number | Sí | Grasa estimada en gramos |

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger

- **Datos de entrada**: `userId`, `chatId`, `meal_type`, `description`, `estimated_calories`, `estimated_protein_g`, `estimated_carbs_g`, `estimated_fat_g`

#### Nodo 2: Insert Food Log (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Query**:

```sql
INSERT INTO daily_intake_logs (
  user_id, log_date, meal_type, description,
  estimated_calories, estimated_protein_g, estimated_carbs_g, estimated_fat_g
)
VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
RETURNING id, log_date, meal_type, estimated_calories, estimated_protein_g;
```

- **Parámetros**: `[userId, meal_type, description, estimated_calories, estimated_protein_g, estimated_carbs_g, estimated_fat_g]`

#### Nodo 3: Upsert Daily Targets (PostgreSQL)

Crea el registro del día si no existe, o actualiza los acumulados si ya existe. Las metas se copian de `user_profiles` en la inserción inicial.

- **Tipo**: PostgreSQL - Execute Query
- **Query**:

```sql
INSERT INTO daily_targets (
  user_id, target_date,
  caloric_target, protein_target_g, carb_target_g, fat_target_g,
  calories_consumed, protein_consumed_g, carbs_consumed_g, fat_consumed_g,
  meals_logged
)
SELECT
  $1, CURRENT_DATE,
  up.caloric_target, up.protein_target_g, up.carb_target_g, up.fat_target_g,
  $2, $3, $4, $5,
  1
FROM user_profiles up
WHERE up.user_id = $1
ON CONFLICT (user_id, target_date) DO UPDATE SET
  calories_consumed  = daily_targets.calories_consumed  + EXCLUDED.calories_consumed,
  protein_consumed_g = daily_targets.protein_consumed_g + EXCLUDED.protein_consumed_g,
  carbs_consumed_g   = daily_targets.carbs_consumed_g   + EXCLUDED.carbs_consumed_g,
  fat_consumed_g     = daily_targets.fat_consumed_g     + EXCLUDED.fat_consumed_g,
  meals_logged       = daily_targets.meals_logged + 1,
  updated_at         = NOW()
RETURNING
  calories_consumed, protein_consumed_g,
  caloric_target, protein_target_g;
```

- **Parámetros**: `[userId, estimated_calories, estimated_protein_g, estimated_carbs_g, estimated_fat_g]`

#### Nodo 4: Build Response (Code)

Formatea el balance actualizado del día para retornarlo al AI Agent.

```javascript
const targets = $('Upsert Daily Targets').first().json;
const log = $('Insert Food Log').first().json;

return [{
  json: {
    success: true,
    registro: {
      meal_type: log.meal_type,
      calorias: log.estimated_calories,
      proteina_g: log.estimated_protein_g,
      fecha: log.log_date
    },
    balance_dia: {
      calorias_consumidas: targets.calories_consumed,
      calorias_meta: targets.caloric_target,
      calorias_restantes: targets.caloric_target - targets.calories_consumed,
      proteina_consumida_g: targets.protein_consumed_g,
      proteina_meta_g: targets.protein_target_g,
      proteina_restante_g: targets.protein_target_g - targets.protein_consumed_g
    }
  }
}];
```

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Insert Food Log (PostgreSQL)
  → Upsert Daily Targets (PostgreSQL)   ← INSERT ... ON CONFLICT DO UPDATE (atómico)
  → Build Response (Code)
  → [retorna balance al AI Agent]
```

### Manejo de Errores

- **INSERT falla** (usuario no existe): el AI Agent recibe el error y responde sin mostrar detalles técnicos.
- **UPSERT falla** (perfil sin metas): si `caloric_target` es NULL en `user_profiles`, el INSERT falla. El AI Agent debe generar el perfil primero (caso de usuario recién onboarded sin metas calculadas).

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

---

## 12. FitAI - Get Daily Status (tool `get_daily_status`)

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Get Daily Status` |
| **Trigger** | Tool Workflow (llamado por el AI Agent via `toolWorkflow` typeVersion 1.3) |
| **Propósito** | Obtiene el estado completo del día actual: calorías y macros consumidos vs meta, comidas reportadas, comidas pendientes del plan, y ejercicio programado. |
| **Cuándo se invoca** | Cuando el AI Agent necesita contexto actualizado del día antes de responder. Útil si `{{dailyStatus}}` en el system prompt está desactualizado (el usuario reportó algo en otra sesión). |

### Parámetros de Entrada

Ninguno. El `userId` viene del contexto del `fields.values` del nodo toolWorkflow.

### Nodos en Orden

#### Nodo 1: Sub-Workflow Trigger

- **Datos de entrada**: `userId`

#### Nodo 2: Get Daily Targets (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **alwaysOutputData**: `true`
- **Query**:

```sql
SELECT
  dt.caloric_target,
  dt.protein_target_g,
  dt.carb_target_g,
  dt.fat_target_g,
  COALESCE(dt.calories_consumed, 0) AS calories_consumed,
  COALESCE(dt.protein_consumed_g, 0) AS protein_consumed,
  COALESCE(dt.carbs_consumed_g, 0) AS carbs_consumed,
  COALESCE(dt.fat_consumed_g, 0) AS fat_consumed,
  COALESCE(dt.meals_logged, 0) AS meals_logged,
  dt.plan_adherence_pct
FROM daily_targets dt
WHERE dt.user_id = $1 AND dt.target_date = CURRENT_DATE;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 3: Get Today Meals (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **alwaysOutputData**: `true`
- **Query**:

```sql
SELECT meal_type, description, estimated_calories, estimated_protein_g, logged_at
FROM daily_intake_logs
WHERE user_id = $1 AND log_date = CURRENT_DATE
ORDER BY logged_at ASC;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 4: Get Today Plan (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **alwaysOutputData**: `true`
- **Query**:

```sql
SELECT plan_json
FROM meal_plans
WHERE user_id = $1 AND is_active = true
AND plan_date = CURRENT_DATE;
```

- **Parámetros**: `[$json.userId]`

#### Nodo 5: Build Status Response (Code)

Combina los tres resultados en un objeto de estado completo del día.

```javascript
const targets = $('Get Daily Targets').first()?.json || null;
const meals = $('Get Today Meals').all().map(item => item.json);
const planRow = $('Get Today Plan').first()?.json || null;

const plan = planRow?.plan_json
  ? (typeof planRow.plan_json === 'string' ? JSON.parse(planRow.plan_json) : planRow.plan_json)
  : null;

const reportedTypes = meals.map(m => m.meal_type);
const pendingMeals = plan?.meals
  ? plan.meals.filter(m => !reportedTypes.includes(m.meal_type))
      .map(m => ({ tipo: m.meal_type, nombre: m.name, calorias: m.calories, proteina_g: m.protein_g, hora: m.time }))
  : [];

return [{
  json: {
    fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
    calorias: {
      consumidas: targets?.calories_consumed || 0,
      meta: targets?.caloric_target || null,
      restantes: targets ? targets.caloric_target - targets.calories_consumed : null
    },
    proteina: {
      consumida_g: targets?.protein_consumed || 0,
      meta_g: targets?.protein_target_g || null,
      restante_g: targets ? targets.protein_target_g - targets.protein_consumed : null
    },
    comidas_reportadas: meals.map(m => ({
      tipo: m.meal_type,
      descripcion: m.description,
      calorias: m.estimated_calories,
      proteina_g: m.estimated_protein_g
    })),
    comidas_pendientes_del_plan: pendingMeals
  }
}];
```

### Lógica de Ramificación

```
Sub-Workflow Trigger
  → Get Daily Targets (PostgreSQL)   ← alwaysOutputData: true
  → Get Today Meals (PostgreSQL)     ← alwaysOutputData: true, en paralelo
  → Get Today Plan (PostgreSQL)      ← alwaysOutputData: true, en paralelo
  → Build Status Response (Code)
  → [retorna estado completo al AI Agent]
```

### Manejo de Errores

- **Sin registro en `daily_targets`** (primer mensaje del día): el nodo retorna `{}` (alwaysOutputData). El código maneja `null` y retorna 0 en todos los acumulados.
- **Sin plan activo para hoy**: `comidas_pendientes_del_plan` retorna array vacío.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

---

## 13. FitAI - Morning Briefing

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Morning Briefing` |
| **Trigger** | Cron: `*/30 5-9 * * *` (cada 30 min de 5am a 9:30am) |
| **Propósito** | Enviar al usuario su plan del día, meta calórica y un mensaje motivacional contextual. Es la primera interacción del día. |
| **Activación** | Siempre activo (cron automático) |

### Descripción del Propósito

Este workflow se ejecuta cada 30 minutos durante la ventana típica de despertar (5am–9:30am). En cada ejecución, busca usuarios cuyo `wake_up_time` coincide con la ventana actual (±15 min) y que aún no han recibido su briefing de hoy. Les envía su plan de comidas del día con la meta calórica y de proteína. Usa `conversation_logs.message_type = 'morning_briefing'` para deduplicación.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `*/30 5-9 * * *`
- **Timezone**: `America/Bogota`

#### Nodo 2: Get Users for Current Window (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.id AS user_id, u.telegram_id, u.first_name,
       up.wake_up_time, up.caloric_target, up.protein_target_g,
       mp.plan_json, mp.total_calories,
       g.target_weight, g.start_weight,
       wl.weight_kg AS current_weight
FROM users u
JOIN memberships m ON u.id = m.user_id
  AND m.status = 'active' AND m.expires_at > NOW()
JOIN user_profiles up ON u.id = up.user_id
  AND up.onboarding_completed = true
LEFT JOIN meal_plans mp ON u.id = mp.user_id
  AND mp.plan_date = CURRENT_DATE AND mp.is_active = true
LEFT JOIN goals g ON u.id = g.user_id AND g.is_active = true
LEFT JOIN LATERAL (
  SELECT weight_kg FROM weight_logs
  WHERE user_id = u.id ORDER BY logged_at DESC LIMIT 1
) wl ON true
WHERE u.is_active = true
  -- Ventana de wake_up_time: hora actual ± 15 min
  AND ABS(
    EXTRACT(EPOCH FROM (up.wake_up_time::time - LOCALTIME)) / 60
  ) <= 15
  -- No ha recibido briefing hoy
  AND NOT EXISTS (
    SELECT 1 FROM conversation_logs cl
    WHERE cl.user_id = u.id
      AND cl.message_type = 'morning_briefing'
      AND cl.created_at::date = CURRENT_DATE
  );
```

#### Nodo 3: Has Users? (IF)

- **Tipo**: IF
- **Condición**: el resultado tiene al menos una fila
- **Rama false**: FIN

#### Nodo 4: Build Briefing Message (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item

```javascript
const plan = $json.plan_json
  ? (typeof $json.plan_json === 'string' ? JSON.parse($json.plan_json) : $json.plan_json)
  : null;

const firstName = $json.first_name;
const caloricTarget = $json.caloric_target;
const proteinTarget = $json.protein_target_g;

// Formatear comidas del día
let mealsText = '';
if (plan?.meals) {
  for (const meal of plan.meals) {
    mealsText += `${meal.meal_label} (${meal.time}): ${meal.name} — *${meal.calories} kcal*\n`;
  }
}

// Mensaje motivacional contextual
const currentWeight = $json.current_weight;
const targetWeight = $json.target_weight;
const startWeight = $json.start_weight;
let motivation = '';

if (currentWeight && targetWeight && startWeight) {
  const totalToChange = Math.abs(startWeight - targetWeight);
  const changed = Math.abs(startWeight - currentWeight);
  const pct = totalToChange > 0 ? Math.round((changed / totalToChange) * 100) : 0;

  if (pct >= 75) motivation = 'Ya llevas más del 75% de tu meta. ¡La recta final!';
  else if (pct >= 50) motivation = 'Más de la mitad del camino recorrido. Sigue así.';
  else if (pct >= 25) motivation = 'Un cuarto de tu meta completado. Cada día cuenta.';
}

// Saludo variado
const greetings = [
  `Buenos días, ${firstName}!`,
  `Buen día, ${firstName}!`,
  `Hey ${firstName}, ¡arrancamos el día!`,
  `${firstName}, aquí está tu plan de hoy:`,
  `¡Buenos días! ¿Listo para hoy, ${firstName}?`
];
const greeting = greetings[Math.floor(Math.random() * greetings.length)];

let message = `${greeting}\n\n`;

if (mealsText) {
  message += `${mealsText}\nMeta del día: *${caloricTarget} kcal* | *${proteinTarget}g proteína*`;
} else {
  message += `Hoy no tienes plan de comidas generado. Escríbeme y te armo uno rápido.`;
}

if (motivation) {
  message += `\n\n${motivation}`;
}

return [{
  json: {
    telegramId: $json.telegram_id,
    userId: $json.user_id,
    message
  }
}];
```

#### Nodo 5: Send Briefing (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**: `{{ $json.message }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 6: Log Briefing Sent (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO conversation_logs (user_id, message_type, assistant_response, created_at)
VALUES ($1, 'morning_briefing', $2, NOW());
```

- **Parámetros**: `$1` = `userId`, `$2` = `message`

### Lógica de Ramificación

```
Cron (cada 30 min, 5am-9:30am)
  → Get Users for Current Window (PostgreSQL)
    → Has Users? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Build Briefing Message (Code)
                → Send Briefing (Telegram)
                  → Log Briefing Sent (PostgreSQL)
```

### Manejo de Errores

- **Sin plan para hoy** (`LEFT JOIN mp = NULL`): el mensaje le dice al usuario que no tiene plan y le sugiere escribir.
- **Telegram 403** (bot bloqueado): log + continúa con siguientes. `continueOnFail: true` en nodo 5.
- **Batching**: 50ms entre mensajes.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

---

## 14. FitAI - Evening Check-in

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Evening Check-in` |
| **Trigger** | Cron: `0 20-22 * * *` (cada hora de 8pm a 10pm) |
| **Propósito** | Cerrar el día con el usuario: resumir lo que comió, mostrar balance final, preguntar cómo le fue. |
| **Activación** | Siempre activo (cron automático) |

### Descripción del Propósito

Al final del día, el asistente le escribe al usuario para hacer un cierre. Muestra el resumen de lo que comió, cuántas calorías/proteína consumió vs la meta, y le pregunta cómo le fue. Si el usuario no reportó nada en el día, le pregunta amablemente qué pasó. La hora exacta de envío (8pm, 9pm o 10pm) se determina según el `wake_up_time` del usuario.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `0 20-22 * * *`
- **Timezone**: `America/Bogota`
- Se ejecuta a las 8pm, 9pm y 10pm. Cada ejecución busca usuarios cuya ventana de check-in coincide.

#### Nodo 2: Get Users for Check-in (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.id AS user_id, u.telegram_id, u.first_name,
       up.caloric_target, up.protein_target_g, up.wake_up_time,
       dt.calories_consumed, dt.protein_consumed_g, dt.meals_logged,
       dt.plan_adherence_pct
FROM users u
JOIN memberships m ON u.id = m.user_id
  AND m.status = 'active' AND m.expires_at > NOW()
JOIN user_profiles up ON u.id = up.user_id
  AND up.onboarding_completed = true
LEFT JOIN daily_targets dt ON u.id = dt.user_id
  AND dt.target_date = CURRENT_DATE
WHERE u.is_active = true
  -- Ventana de check-in: 2 horas antes de dormir estimado
  AND EXTRACT(HOUR FROM LOCALTIME) =
    CASE
      WHEN EXTRACT(HOUR FROM up.wake_up_time::time) <= 6 THEN 20  -- madrugador → 8pm
      WHEN EXTRACT(HOUR FROM up.wake_up_time::time) <= 8 THEN 21  -- normal → 9pm
      ELSE 22  -- tardío → 10pm
    END
  -- No ha recibido check-in hoy
  AND NOT EXISTS (
    SELECT 1 FROM conversation_logs cl
    WHERE cl.user_id = u.id
      AND cl.message_type = 'evening_checkin'
      AND cl.created_at::date = CURRENT_DATE
  );
```

#### Nodo 3: Has Users? (IF)

- **Tipo**: IF
- **Condición**: el resultado tiene al menos una fila
- **Rama false**: FIN

#### Nodo 4: Build Check-in Message (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item

```javascript
const firstName = $json.first_name;
const caloriesConsumed = $json.calories_consumed || 0;
const proteinConsumed = $json.protein_consumed_g || 0;
const caloricTarget = $json.caloric_target;
const proteinTarget = $json.protein_target_g;
const mealsLogged = $json.meals_logged || 0;

let message = '';

if (mealsLogged === 0) {
  const phrases = [
    `Oye ${firstName}, ¿cómo te fue hoy? No me reportaste nada y quería saber si todo está bien.`,
    `${firstName}, ¿qué tal tu día? No alcanzo a ver qué comiste hoy. Si se te complicó el plan, no pasa nada — mañana retomamos.`,
    `Hey ${firstName}, ¿cómo estuvo el día? Si comiste fuera de plan o se te fue el tiempo, está bien. Solo cuéntame cómo te fue.`
  ];
  message = phrases[Math.floor(Math.random() * phrases.length)];
} else {
  const caloriePct = Math.round((caloriesConsumed / caloricTarget) * 100);
  const proteinPct = Math.round((proteinConsumed / proteinTarget) * 100);

  let assessment = '';
  if (caloriePct >= 85 && caloriePct <= 115 && proteinPct >= 80) {
    assessment = 'Día sólido, cumpliste la meta.';
  } else if (caloriePct < 85) {
    assessment = 'Te faltaron calorías hoy. Intenta no saltarte comidas mañana.';
  } else if (caloriePct > 115) {
    assessment = 'Hoy te pasaste un poco de calorías. No pasa nada, mañana compensamos ligeramente.';
  } else if (proteinPct < 80) {
    assessment = 'Te faltó proteína hoy. Intenta incluir más pollo, huevos o legumbres mañana.';
  }

  message = `${firstName}, resumen del día:

Calorías: *${caloriesConsumed} de ${caloricTarget} kcal* (${caloriePct}%)
Proteína: *${proteinConsumed} de ${proteinTarget}g* (${proteinPct}%)
Comidas reportadas: ${mealsLogged}

${assessment} Descansa bien, mañana te mando el plan temprano.`;
}

return [{
  json: {
    telegramId: $json.telegram_id,
    userId: $json.user_id,
    message
  }
}];
```

#### Nodo 5: Send Check-in (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**: `{{ $json.message }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 6: Log Check-in (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO conversation_logs (user_id, message_type, assistant_response, created_at)
VALUES ($1, 'evening_checkin', $2, NOW());
```

- **Parámetros**: `$1` = `userId`, `$2` = `message`

### Lógica de Ramificación

```
Cron (8pm, 9pm, 10pm)
  → Get Users for Check-in (PostgreSQL)
    → Has Users? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Build Check-in Message (Code)
                → Send Check-in (Telegram)
                  → Log Check-in (PostgreSQL)
```

### Manejo de Errores

- **Sin datos de `daily_targets`** (`LEFT JOIN dt = NULL`): `mealsLogged = 0`, se envía el mensaje de "no reportaste nada hoy".
- **Telegram 403**: log + continúa. `continueOnFail: true` en nodo 5.
- **Batching**: 50ms entre mensajes.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

---

## 15. FitAI - Weekly Report

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Weekly Report` |
| **Trigger** | Cron: `0 10 * * 0` (domingos a las 10am) |
| **Propósito** | Enviar un resumen semanal completo con métricas de peso, calorías, proteína, adherencia y proyección de meta. |
| **Activación** | Siempre activo (cron automático) |

### Descripción del Propósito

Cada domingo a las 10am, este workflow genera y envía a cada usuario activo un informe semanal completo. Incluye: cambio de peso vs semana anterior, progreso hacia la meta con proyección de semanas restantes, promedios semanales de calorías/proteína, días de tracking, y sesiones de ejercicio completadas. Los datos se obtienen con `LATERAL JOINs` para minimizar queries.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `0 10 * * 0` (domingo 10am)
- **Timezone**: `America/Bogota`

#### Nodo 2: Get Active Users with Weekly Data (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.id AS user_id, u.telegram_id, u.first_name,
       up.caloric_target, up.protein_target_g, up.height_cm, up.gender, up.age,
       g.goal_type, g.target_weight, g.start_weight, g.start_date,
       w_current.weight_kg AS current_weight,
       w_current.logged_at AS current_weight_date,
       w_prev.weight_kg AS previous_weight,
       weekly.avg_calories, weekly.avg_protein, weekly.days_tracked,
       weekly.avg_adherence,
       workouts.completed AS workouts_completed,
       up.training_days_per_week
FROM users u
JOIN memberships m ON u.id = m.user_id AND m.status = 'active' AND m.expires_at > NOW()
JOIN user_profiles up ON u.id = up.user_id AND up.onboarding_completed = true
LEFT JOIN goals g ON u.id = g.user_id AND g.is_active = true
-- Peso más reciente
LEFT JOIN LATERAL (
  SELECT weight_kg, logged_at FROM weight_logs
  WHERE user_id = u.id ORDER BY logged_at DESC LIMIT 1
) w_current ON true
-- Peso de hace ~1 semana
LEFT JOIN LATERAL (
  SELECT weight_kg FROM weight_logs
  WHERE user_id = u.id AND logged_at < CURRENT_DATE - INTERVAL '5 days'
  ORDER BY logged_at DESC LIMIT 1
) w_prev ON true
-- Promedios semanales de daily_targets
LEFT JOIN LATERAL (
  SELECT
    ROUND(AVG(calories_consumed)) AS avg_calories,
    ROUND(AVG(protein_consumed_g)) AS avg_protein,
    COUNT(*) FILTER (WHERE meals_logged > 0) AS days_tracked,
    ROUND(AVG(plan_adherence_pct)) AS avg_adherence
  FROM daily_targets
  WHERE user_id = u.id
    AND target_date >= CURRENT_DATE - INTERVAL '7 days'
    AND target_date < CURRENT_DATE
) weekly ON true
-- Ejercicios completados (via conversation_logs)
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS completed FROM conversation_logs
  WHERE user_id = u.id
    AND message_type = 'workout_completed'
    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
) workouts ON true
WHERE u.is_active = true;
```

#### Nodo 3: Has Users? (IF)

- **Tipo**: IF
- **Condición**: el resultado tiene al menos una fila
- **Rama false**: FIN

#### Nodo 4: Build Weekly Report (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item

```javascript
const d = $json;
const firstName = d.first_name;

const currentWeight = d.current_weight;
const previousWeight = d.previous_weight;
const startWeight = d.start_weight;
const targetWeight = d.target_weight;

let weightSection = '';
if (currentWeight && previousWeight) {
  const weeklyChange = Math.round((currentWeight - previousWeight) * 10) / 10;
  const direction = weeklyChange < 0 ? 'bajaste' : weeklyChange > 0 ? 'subiste' : 'te mantuviste en';
  const changeAbs = Math.abs(weeklyChange);
  weightSection = `Peso: *${currentWeight} kg* (${direction} *${changeAbs} kg* esta semana)`;

  if (startWeight) {
    const totalChange = Math.round((currentWeight - startWeight) * 10) / 10;
    weightSection += `\nDesde el inicio: *${totalChange > 0 ? '+' : ''}${totalChange} kg*`;
  }
} else if (currentWeight) {
  weightSection = `Peso actual: *${currentWeight} kg* (no tengo dato de la semana pasada)`;
} else {
  weightSection = `No me reportaste peso esta semana. ¡Pésate mañana en ayunas!`;
}

let goalSection = '';
if (currentWeight && targetWeight && startWeight) {
  const totalToChange = Math.abs(startWeight - targetWeight);
  const changed = Math.abs(startWeight - currentWeight);
  const pct = totalToChange > 0 ? Math.round((changed / totalToChange) * 100) : 0;
  const remaining = Math.round(Math.abs(currentWeight - targetWeight) * 10) / 10;

  goalSection = `Meta: *${pct}% completada* (faltan *${remaining} kg*)`;

  if (previousWeight && currentWeight !== previousWeight) {
    const weeklyRate = Math.abs(currentWeight - previousWeight);
    if (weeklyRate > 0.1) {
      const weeksRemaining = Math.ceil(remaining / weeklyRate);
      goalSection += ` — a este ritmo, ~*${weeksRemaining} semanas* más`;
    }
  }
}

let nutritionSection = '';
if (d.avg_calories && d.days_tracked > 0) {
  nutritionSection = `Calorías promedio: *${d.avg_calories} kcal/día* (meta: ${d.caloric_target})`;
  nutritionSection += `\nProteína promedio: *${d.avg_protein}g/día* (meta: ${d.protein_target_g})`;
  nutritionSection += `\nDías registrados: ${d.days_tracked} de 7`;
  if (d.avg_adherence) {
    nutritionSection += `\nAdherencia: *${d.avg_adherence}%*`;
  }
} else {
  nutritionSection = `No tengo datos de nutrición de esta semana. Recuerda reportarme lo que comes cada día.`;
}

let exerciseSection = '';
const workoutsTarget = d.training_days_per_week || 0;
const workoutsCompleted = d.workouts_completed || 0;
if (workoutsTarget > 0) {
  exerciseSection = `Ejercicio: *${workoutsCompleted} de ${workoutsTarget} sesiones*`;
}

let bmiSection = '';
if (currentWeight && d.height_cm) {
  const heightM = d.height_cm / 100;
  const bmi = Math.round((currentWeight / (heightM * heightM)) * 10) / 10;
  bmiSection = `IMC: *${bmi}*`;
}

let message = `${firstName}, tu resumen de la semana:\n\n`;
message += weightSection + '\n';
if (goalSection) message += goalSection + '\n';
message += '\n' + nutritionSection + '\n';
if (exerciseSection) message += '\n' + exerciseSection + '\n';
if (bmiSection) message += bmiSection + '\n';

if (d.avg_calories && Math.abs(d.avg_calories - d.caloric_target) <= 100 && currentWeight && previousWeight) {
  const goingRight = (d.goal_type === 'lose_fat' && currentWeight <= previousWeight) ||
                     (d.goal_type === 'gain_muscle' && currentWeight >= previousWeight);
  if (goingRight) {
    message += '\nBuena semana. Los números dicen que vas en la dirección correcta.';
  }
}

message += '\n\nEsta semana vamos por más. Tu plan de mañana te lo mando temprano.';

return [{
  json: {
    telegramId: d.telegram_id,
    userId: d.user_id,
    message
  }
}];
```

#### Nodo 5: Send Report (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**: `{{ $json.message }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 6: Log Report (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO conversation_logs (user_id, message_type, assistant_response, created_at)
VALUES ($1, 'weekly_report', $2, NOW());
```

- **Parámetros**: `$1` = `userId`, `$2` = `message`

### Lógica de Ramificación

```
Cron (domingo 10am)
  → Get Active Users with Weekly Data (PostgreSQL)  ← LATERAL JOINs para w_current, w_prev, weekly, workouts
    → Has Users? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Build Weekly Report (Code)
                → Send Report (Telegram)
                  → Log Report (PostgreSQL)
```

### Manejo de Errores

- **Sin datos de peso**: `w_current` y `w_prev` son `LEFT JOIN LATERAL` → retornan `NULL`. El código maneja el caso.
- **Sin tracking semanal**: `weekly` retorna `NULL` → mensaje alternativo.
- **Telegram 403**: log + continúa. `continueOnFail: true` en nodo 5.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

---

## 16. FitAI - Silence Detector

### Información General

| Campo | Valor |
|-------|-------|
| **Nombre en n8n** | `FitAI - Silence Detector` |
| **Trigger** | Cron: `0 18 * * *` (6pm diario) |
| **Propósito** | Detectar usuarios que llevan 24+ horas sin interactuar y enviarles un mensaje casual para reactivarlos. |
| **Activación** | Siempre activo (cron automático) |

### Descripción del Propósito

Si un usuario no ha enviado ningún mensaje ni reportado comida en 24+ horas, es señal de que puede estar perdiendo adherencia. El asistente le escribe un mensaje breve y casual — no un recordatorio formal, sino un "oye, ¿cómo andas?". Solo se actúa en la ventana 24h–72h; después de 72h de silencio, se deja de insistir.

### Nodos en Orden

#### Nodo 1: Cron Trigger

- **Tipo**: Cron
- **Expresión**: `0 18 * * *`
- **Timezone**: `America/Bogota`

#### Nodo 2: Get Silent Users (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
SELECT u.id AS user_id, u.telegram_id, u.first_name,
       last_interaction.last_at,
       EXTRACT(EPOCH FROM (NOW() - last_interaction.last_at)) / 3600 AS hours_silent
FROM users u
JOIN memberships m ON u.id = m.user_id AND m.status = 'active' AND m.expires_at > NOW()
JOIN user_profiles up ON u.id = up.user_id AND up.onboarding_completed = true
CROSS JOIN LATERAL (
  SELECT MAX(created_at) AS last_at
  FROM conversation_logs
  WHERE user_id = u.id
) last_interaction
WHERE u.is_active = true
  -- 24+ horas sin interacción
  AND last_interaction.last_at < NOW() - INTERVAL '24 hours'
  -- Pero no más de 72 horas
  AND last_interaction.last_at > NOW() - INTERVAL '72 hours'
  -- No se le envió silence_check hoy
  AND NOT EXISTS (
    SELECT 1 FROM conversation_logs cl
    WHERE cl.user_id = u.id
      AND cl.message_type = 'silence_check'
      AND cl.created_at::date = CURRENT_DATE
  );
```

**Lógica**: solo usuarios entre 24h y 72h de silencio. Si llevan más de 72h, no insistir.

#### Nodo 3: Has Users? (IF)

- **Tipo**: IF
- **Condición**: el resultado tiene al menos una fila
- **Rama false**: FIN

#### Nodo 4: Build Silence Message (Code)

- **Tipo**: Code (JavaScript)
- **Modo**: Run Once for Each Item

```javascript
const firstName = $json.first_name;
const hoursSilent = Math.round($json.hours_silent);

const messages = [
  `Oye ${firstName}, ¿todo bien? Llevas un rato sin reportar y quería ver cómo vas.`,
  `${firstName}, ¿cómo andas? Si se te complicó el plan ayer no pasa nada, pero cuéntame para ajustar.`,
  `Hey ${firstName}, solo quería saber cómo estás. Si necesitas cambiar algo del plan, dime.`,
  `${firstName}, aquí estoy pendiente. Cualquier cosa que necesites, escríbeme.`
];

const message = messages[Math.floor(Math.random() * messages.length)];

return [{
  json: {
    telegramId: $json.telegram_id,
    userId: $json.user_id,
    message
  }
}];
```

#### Nodo 5: Send Message (Telegram)

- **Tipo**: Telegram - Send Message
- **Chat ID**: `{{ $json.telegramId }}`
- **Texto**: `{{ $json.message }}`
- **Parse Mode**: Markdown
- **Credencial**: `FitAI Telegram Bot`

#### Nodo 6: Log Silence Check (PostgreSQL)

- **Tipo**: PostgreSQL - Execute Query
- **Credencial**: `FitAI PostgreSQL`
- **Query**:

```sql
INSERT INTO conversation_logs (user_id, message_type, assistant_response, created_at)
VALUES ($1, 'silence_check', $2, NOW());
```

- **Parámetros**: `$1` = `userId`, `$2` = `message`

### Lógica de Ramificación

```
Cron (6pm diario)
  → Get Silent Users (24-72h sin interacción) (PostgreSQL)
    → Has Users? (IF)
        ├─ false → FIN
        └─ true → [Para cada usuario]:
              Build Silence Message (Code)
                → Send Message (Telegram)
                  → Log Silence Check (PostgreSQL)
```

### Manejo de Errores

- **Solo 1 silence check por usuario por día**: dedup via `conversation_logs.message_type = 'silence_check'`.
- **Máximo 1 por período de silencio**: ventana 24h–72h garantiza que no se insiste después.
- **Telegram 403**: log + continúa. `continueOnFail: true` en nodo 5.

### Variables de Entorno y Credenciales

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Credencial n8n | `FitAI Telegram Bot` | Token del bot de Telegram |
| Credencial n8n | `FitAI PostgreSQL` | Conexión a PostgreSQL |

---

## Cronología de un Día Típico

```
05:00-09:30  Morning Briefing (cron cada 30 min — envía según wake_up_time)
07:00-21:00  Meal Reminder v2 (cron cada 15 min — envía según horario del plan)
18:00        Silence Detector (detecta usuarios 24-72h sin actividad)
20:00-22:00  Evening Check-in (cron cada hora — envía según wake_up_time)
21:00        Daily Plan Generator Cron (genera plan de mañana)

Domingo adicional:
10:00        Weekly Report
```

### Deduplicación via `conversation_logs.message_type`

Todos los workflows proactivos usan `conversation_logs.message_type` para evitar duplicados:

| `message_type` | Workflow |
|---|---|
| `morning_briefing` | FitAI - Morning Briefing |
| `meal_reminder` | FitAI - Meal Reminder Scheduler |
| `evening_checkin` | FitAI - Evening Check-in |
| `weekly_report` | FitAI - Weekly Report |
| `silence_check` | FitAI - Silence Detector |
| `workout_completed` | Usado por AI Agent al confirmar sesión de ejercicio |
