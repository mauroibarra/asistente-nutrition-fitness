# Guia de Migracion: System Prompt v1 → v2

## Resumen de Cambios

El system prompt v2 transforma al asistente de un **bot reactivo** a un **coach proactivo**. Para funcionar correctamente, requiere tres nuevas variables de contexto que deben inyectarse dinamicamente en cada interaccion.

---

## Nuevas Variables de Contexto

### 1. `{{dailyStatus}}` — Estado del dia actual

**Fuente**: tabla `daily_targets` + tabla `daily_intake_logs`
**Se calcula en**: nodo Build Context (Code) del workflow Main AI Agent
**Frecuencia**: en cada interaccion

```javascript
// Query para obtener el estado del dia
const dailyStatusQuery = `
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
`;

// Query para comidas reportadas hoy
const todayMealsQuery = `
  SELECT meal_type, description, estimated_calories, estimated_protein_g, logged_at
  FROM daily_intake_logs
  WHERE user_id = $1 AND log_date = CURRENT_DATE
  ORDER BY logged_at ASC;
`;

// Query para el plan de comidas de hoy
const todayPlanQuery = `
  SELECT plan_json
  FROM meal_plans
  WHERE user_id = $1 AND is_active = true
  AND plan_date = CURRENT_DATE;
`;

// Query para ejercicio de hoy
const todayWorkoutQuery = `
  SELECT plan_json
  FROM exercise_plans
  WHERE user_id = $1 AND is_active = true
  AND plan_date = CURRENT_DATE;
`;
```

**Formato de salida para inyectar en el prompt:**

```json
{
  "fecha": "2026-03-31",
  "calorias": { "consumidas": 1200, "meta": 1800, "restantes": 600 },
  "proteina": { "consumida_g": 85, "meta_g": 135, "restante_g": 50 },
  "carbohidratos": { "consumidos_g": 150, "meta_g": 200, "restante_g": 50 },
  "grasa": { "consumida_g": 35, "meta_g": 55, "restante_g": 20 },
  "comidas_reportadas": [
    { "tipo": "desayuno", "descripcion": "Huevos revueltos con tortillas", "calorias": 450, "proteina_g": 28 },
    { "tipo": "almuerzo", "descripcion": "Arroz con pollo y ensalada", "calorias": 520, "proteina_g": 38 }
  ],
  "comidas_pendientes_del_plan": [
    { "tipo": "cena", "nombre": "Tilapia al limon con verduras", "calorias": 480, "proteina_g": 45, "hora": "20:00" },
    { "tipo": "snack", "nombre": "Yogur griego con almendras", "calorias": 220, "proteina_g": 18, "hora": "17:00" }
  ],
  "ejercicio_hoy": {
    "programado": true,
    "tipo": "Fuerza - Tren superior",
    "completado": false
  }
}
```

**Si no existe registro para hoy (primer mensaje del dia):**

```json
{
  "fecha": "2026-03-31",
  "calorias": { "consumidas": 0, "meta": 1800, "restantes": 1800 },
  "proteina": { "consumida_g": 0, "meta_g": 135, "restante_g": 135 },
  "comidas_reportadas": [],
  "comidas_pendientes_del_plan": [ "... todas las comidas del plan ..." ],
  "ejercicio_hoy": { "..." }
}
```

---

### 2. `{{weeklyTrend}}` — Tendencia semanal

**Fuente**: tablas `weight_logs`, `daily_targets`, `exercise_plans`
**Se calcula en**: nodo Build Context (Code)
**Frecuencia**: en cada interaccion (el calculo es ligero)

```javascript
// Peso actual vs semana pasada
const weightTrendQuery = `
  SELECT weight_kg, logged_at
  FROM weight_logs
  WHERE user_id = $1
  ORDER BY logged_at DESC
  LIMIT 5;
`;

// Promedio calorico de la semana actual
const weeklyCaloriesQuery = `
  SELECT
    AVG(calories_consumed) AS avg_calories,
    AVG(protein_consumed_g) AS avg_protein,
    COUNT(CASE WHEN meals_logged >= meal_count THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 AS adherence_pct
  FROM daily_targets dt
  JOIN user_profiles up ON dt.user_id = up.user_id
  WHERE dt.user_id = $1
  AND dt.target_date >= date_trunc('week', CURRENT_DATE)
  AND dt.target_date <= CURRENT_DATE;
`;

// Dias de ejercicio completados esta semana
const weeklyWorkoutsQuery = `
  SELECT COUNT(*) AS completed
  FROM workout_logs
  WHERE user_id = $1
  AND completed_at >= date_trunc('week', CURRENT_DATE);
`;
```

**Formato de salida:**

```json
{
  "peso_actual": 82.1,
  "peso_semana_pasada": 82.7,
  "cambio_semanal_kg": -0.6,
  "promedio_calorico_diario": 1750,
  "promedio_proteina_diaria_g": 128,
  "adherencia_plan_pct": 85,
  "dias_ejercicio_completados": 3,
  "dias_ejercicio_programados": 4,
  "tendencia": "bajando",
  "dias_en_programa": 42,
  "peso_inicio": 86.0,
  "cambio_total_kg": -3.9,
  "porcentaje_meta_completado": 35.5
}
```

**Si es la primera semana (datos insuficientes):**

```json
{
  "peso_actual": 86.0,
  "peso_semana_pasada": null,
  "cambio_semanal_kg": null,
  "promedio_calorico_diario": null,
  "adherencia_plan_pct": null,
  "tendencia": "inicio",
  "dias_en_programa": 1,
  "cambio_total_kg": 0,
  "porcentaje_meta_completado": 0
}
```

---

### 3. `{{nextAction}}` — Proxima accion pendiente

**Fuente**: logica derivada de `dailyStatus` + hora actual + plan activo
**Se calcula en**: nodo Build Context (Code)

```javascript
function determineNextAction(dailyStatus, currentHour, profile) {
  // Si no ha reportado desayuno y ya es hora
  if (dailyStatus.meals_logged === 0 && currentHour >= parseInt(profile.wake_up_time)) {
    return {
      tipo: "reportar_comida",
      descripcion: "Preguntarle que desayuno",
      comida_sugerida: dailyStatus.comidas_pendientes_del_plan[0] || null
    };
  }

  // Si tiene ejercicio programado y no lo ha hecho
  if (dailyStatus.ejercicio_hoy?.programado && !dailyStatus.ejercicio_hoy?.completado) {
    return {
      tipo: "ejercicio",
      descripcion: "Recordar su rutina de hoy",
      rutina: dailyStatus.ejercicio_hoy.tipo
    };
  }

  // Si es la hora de la proxima comida del plan
  const nextMeal = dailyStatus.comidas_pendientes_del_plan[0];
  if (nextMeal) {
    return {
      tipo: "proxima_comida",
      descripcion: `Su proxima comida es ${nextMeal.nombre} a las ${nextMeal.hora}`,
      comida: nextMeal
    };
  }

  // Si no se ha pesado en 7+ dias
  if (profile.days_since_last_weigh_in >= 7) {
    return {
      tipo: "pesarse",
      descripcion: "Pedirle que se pese manana en ayunas"
    };
  }

  // Default: check-in del dia
  return {
    tipo: "check_in",
    descripcion: "Preguntar como le va el dia"
  };
}
```

**Formato de salida:**

```json
{
  "tipo": "proxima_comida",
  "descripcion": "Su proxima comida es Tilapia al limon con verduras a las 20:00",
  "comida": {
    "tipo": "cena",
    "nombre": "Tilapia al limon con verduras",
    "calorias": 480,
    "proteina_g": 45,
    "hora": "20:00"
  }
}
```

---

## Cambios en el Nodo Build Context

El nodo Build Context actual (en el workflow Main AI Agent) necesita expandirse para incluir estas 3 queries adicionales. Aqui esta el codigo actualizado:

```javascript
const trigger = $('Sub-Workflow Trigger').first().json;
const profile = $('Load User Profile').first().json;
const knowledgeDocs = $('Search Knowledge RAG').all().map(item => item.json.text).join('\n---\n');
const userDocs = $('Search User RAG').all().map(item => item.json.text).join('\n---\n');

// NUEVOS: datos del dia y tendencia
const dailyTargets = $('Load Daily Status').first()?.json || null;
const todayMeals = $('Load Today Meals').all().map(item => item.json);
const todayPlan = $('Load Today Plan').first()?.json || null;
const weightHistory = $('Load Weight Trend').all().map(item => item.json);
const weeklyAvg = $('Load Weekly Average').first()?.json || null;

const currentDate = new Date().toISOString();
const currentHour = new Date().getHours();

// --- Construir userProfile (igual que antes) ---
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

// --- NUEVO: Construir dailyStatus ---
const caloriesConsumed = dailyTargets?.calories_consumed || 0;
const proteinConsumed = dailyTargets?.protein_consumed_g || 0;
const carbsConsumed = dailyTargets?.carbs_consumed_g || 0;
const fatConsumed = dailyTargets?.fat_consumed_g || 0;

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

// --- NUEVO: Construir weeklyTrend ---
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

// --- NUEVO: Construir nextAction ---
const nextAction = determineNextAction(dailyTargets, todayMeals, todayPlan, currentHour, profile);

return [{
  json: {
    userName: trigger.firstName,
    userProfile,
    dailyStatus,
    weeklyTrend,
    nextAction: JSON.stringify(nextAction, null, 2),
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

// --- Helper functions ---

function parsePendingMeals(planJson, reportedMeals) {
  const plan = typeof planJson === 'string' ? JSON.parse(planJson) : planJson;
  const reportedTypes = reportedMeals.map(m => m.meal_type);
  return (plan.meals || [])
    .filter(m => !reportedTypes.includes(m.meal_type))
    .map(m => ({
      tipo: m.meal_type,
      nombre: m.name,
      calorias: m.calories,
      proteina_g: m.protein_g,
      hora: m.time
    }));
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

---

## Nuevas Tablas SQL Requeridas

```sql
-- Migracion: 006_daily_tracking.sql

-- Registro diario de metas y consumo
CREATE TABLE daily_targets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  target_date DATE NOT NULL,
  caloric_target INTEGER NOT NULL,
  protein_target_g INTEGER NOT NULL,
  carb_target_g INTEGER NOT NULL,
  fat_target_g INTEGER NOT NULL,
  calories_consumed INTEGER DEFAULT 0,
  protein_consumed_g INTEGER DEFAULT 0,
  carbs_consumed_g INTEGER DEFAULT 0,
  fat_consumed_g INTEGER DEFAULT 0,
  meals_logged INTEGER DEFAULT 0,
  plan_adherence_pct NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, target_date)
);

-- Registro detallado de lo que el usuario come
CREATE TABLE daily_intake_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type VARCHAR(20) NOT NULL, -- breakfast, lunch, snack, dinner
  description TEXT NOT NULL,
  estimated_calories INTEGER,
  estimated_protein_g INTEGER,
  estimated_carbs_g INTEGER,
  estimated_fat_g INTEGER,
  was_from_plan BOOLEAN DEFAULT false,
  logged_at TIMESTAMP DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_daily_targets_user_date ON daily_targets(user_id, target_date);
CREATE INDEX idx_daily_intake_user_date ON daily_intake_logs(user_id, log_date);

-- Modificar meal_plans: agregar campo plan_date para planes diarios
ALTER TABLE meal_plans ADD COLUMN plan_date DATE;
CREATE INDEX idx_meal_plans_user_date ON meal_plans(user_id, plan_date);
```

---

## Nuevas Tools del Agente

### Tool: `log_food_intake`

```
Nombre: log_food_intake
Descripcion: Registra lo que el usuario comio. Estima los macronutrientes basandose en
la descripcion y actualiza el balance diario. Usa esta herramienta SIEMPRE que el usuario
reporte haber comido algo.
Parametros:
  - meal_type (string, enum: breakfast, lunch, snack, dinner): tipo de comida
  - description (string): descripcion de lo que comio
  - estimated_calories (number): calorias estimadas
  - estimated_protein_g (number): proteina estimada en gramos
  - estimated_carbs_g (number): carbohidratos estimados en gramos
  - estimated_fat_g (number): grasa estimada en gramos
```

**Logica del workflow:**
1. INSERT en `daily_intake_logs`
2. UPDATE `daily_targets` SET calories_consumed = calories_consumed + X, protein_consumed_g = protein_consumed_g + X, etc.
3. Si no existe registro en `daily_targets` para hoy, crearlo con las metas del perfil
4. Retornar el balance actualizado del dia

### Tool: `get_daily_status`

```
Nombre: get_daily_status
Descripcion: Obtiene el estado completo del dia actual del usuario: calorias y macros
consumidos vs meta, comidas reportadas, comidas pendientes del plan, y ejercicio
programado. Usa esta herramienta para tener contexto del dia antes de responder.
Parametros: ninguno (usa el user_id del contexto)
```

**Logica del workflow:**
1. SELECT de `daily_targets` WHERE target_date = CURRENT_DATE
2. SELECT de `daily_intake_logs` WHERE log_date = CURRENT_DATE
3. SELECT de `meal_plans` WHERE plan_date = CURRENT_DATE AND is_active = true
4. Combinar y retornar

---

## Nodos Adicionales en el Workflow Main AI Agent

El workflow Main AI Agent necesita 4 nodos adicionales que corran en paralelo con los existentes:

```
Sub-Workflow Trigger
  → Load User Profile (PostgreSQL)         ← existente
  → Search Knowledge RAG (Qdrant)          ← existente, en paralelo
  → Search User RAG (Qdrant)               ← existente, en paralelo
  → Load Daily Status (PostgreSQL)         ← NUEVO, en paralelo
  → Load Today Meals (PostgreSQL)          ← NUEVO, en paralelo
  → Load Today Plan (PostgreSQL)           ← NUEVO, en paralelo
  → Load Weight Trend (PostgreSQL)         ← NUEVO, en paralelo
  → Load Weekly Average (PostgreSQL)       ← NUEVO, en paralelo
  → Build Context (Code)                   ← actualizado con nuevas variables
    → AI Agent (con tools actualizados)
      → Send Response to Telegram
        → Log Conversation
        → Trigger RAG Indexer
```

---

## Checklist de Implementacion

- [ ] Ejecutar migracion SQL `006_daily_tracking.sql`
- [ ] Agregar columna `plan_date` a `meal_plans`
- [ ] Crear nodos Load Daily Status, Load Today Meals, Load Today Plan, Load Weight Trend, Load Weekly Average en Main AI Agent
- [ ] Actualizar nodo Build Context con el codigo de esta guia
- [ ] Actualizar System Prompt en n8n con la version v2
- [ ] Crear tool workflow `log_food_intake`
- [ ] Crear tool workflow `get_daily_status`
- [ ] Modificar Meal Plan Generator para generar planes diarios en vez de semanales
- [ ] Actualizar la inyeccion del system prompt en el AI Agent node para incluir las nuevas variables
- [ ] Testear flujo completo: mensaje → build context → agente con dailyStatus
