# Template de Generacion de Planes de Comidas v2 — FitAI Assistant

> v2: Plan DIARIO (no semanal). Cada noche se genera el plan del dia siguiente
> considerando lo que el usuario realmente comio, sus macros acumulados de la semana,
> y la variedad respecto a dias anteriores.

---

## Cambio fundamental: de semanal a diario

### Por que diario

El plan semanal tiene 3 problemas:
1. **Rigidez**: si el usuario no sigue el lunes, el martes ya esta desalineado
2. **Sin adaptacion**: no considera lo que realmente comio — solo lo que "deberia" comer
3. **Abrumador**: 7 dias de comidas de golpe es mucha informacion

El plan diario resuelve esto:
- Se genera cada noche para el dia siguiente
- Considera el intake real del dia actual (si se excedio en calorias hoy, manana se ajusta ligeramente)
- Considera los platos de los ultimos 3 dias para no repetir
- Se presenta al usuario en el morning briefing de forma simple

### Cuando se genera

| Trigger | Contexto |
|---|---|
| **Cron nocturno** (9-10pm hora usuario) | Generacion automatica del plan del dia siguiente para todos los usuarios activos |
| **Post-onboarding** | Primer plan: se genera para el dia siguiente al completar onboarding |
| **Solicitud del usuario** | "Quiero cambiar mi plan de hoy" / "Generame un nuevo plan" |
| **Ajuste por intake** | Si el agente detecta que las comidas restantes necesitan rebalanceo, regenera las pendientes |

---

## Template Principal: Generar Plan Diario

### Variables del Template

| Variable | Fuente | Ejemplo |
|---|---|---|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{planDate}}` | Calculado (CURRENT_DATE + 1) | "2026-04-01" |
| `{{dayOfWeek}}` | Calculado | "martes" |
| `{{caloricTarget}}` | user_profiles.caloric_target | 1800 |
| `{{proteinTarget}}` | user_profiles.protein_target_g | 135 |
| `{{carbTarget}}` | user_profiles.carb_target_g | 200 |
| `{{fatTarget}}` | user_profiles.fat_target_g | 60 |
| `{{mealCount}}` | user_profiles.meals_per_day | 4 |
| `{{dietaryRestrictions}}` | user_profiles.dietary_restrictions | ["vegetarian"] |
| `{{foodAllergies}}` | user_profiles.food_allergies | ["shrimp"] |
| `{{dislikedFoods}}` | user_profiles.disliked_foods | ["eggplant"] |
| `{{localCulture}}` | user_profiles.local_culture | "colombian" |
| `{{budget}}` | user_profiles.budget_level | "medium" |
| `{{wakeUpTime}}` | user_profiles.wake_up_time | "07:00" |
| `{{recentMeals}}` | meal_plans ultimos 3 dias | "Ayer: pollo con arroz, huevos con arepa. Anteayer: pasta con carne, ensalada de atun" |
| `{{yesterdayIntake}}` | daily_targets dia anterior | null o { calories: 1650, protein: 120 } |
| `{{weeklyAvg}}` | Promedio semanal actual | null o { avg_calories: 1780, avg_protein: 130 } |
| `{{isWeekend}}` | Calculado | true/false |
| `{{hasWorkout}}` | exercise_plans | true/false — si tiene entrenamiento programado ese dia |

### Prompt del Template

```
Eres un nutriologo experto creando el plan de comidas de UN DIA para un usuario.

PERFIL DEL USUARIO:
- Nombre: {{userName}}
- Objetivo calorico diario: {{caloricTarget}} kcal
- Macros objetivo: {{proteinTarget}}g proteina, {{carbTarget}}g carbohidratos, {{fatTarget}}g grasa
- Restricciones dietarias: {{dietaryRestrictions}}
- Alergias: {{foodAllergies}}
- Alimentos que no le gustan: {{dislikedFoods}}
- Cultura gastronomica: {{localCulture}}
- Presupuesto: {{budget}}
- Numero de comidas: {{mealCount}}
- Hora de despertar: {{wakeUpTime}}
- Dia: {{dayOfWeek}} ({{planDate}})
- Es fin de semana: {{isWeekend}}
- Tiene entrenamiento programado: {{hasWorkout}}

{{#if recentMeals}}
COMIDAS DE LOS ULTIMOS 3 DIAS (no repitas estos platos):
{{recentMeals}}
{{/if}}

{{#if yesterdayIntake}}
INTAKE REAL DE AYER:
- Calorias consumidas: {{yesterdayIntake.calories}} kcal (meta: {{caloricTarget}})
- Proteina consumida: {{yesterdayIntake.protein}}g (meta: {{proteinTarget}})
{{#if yesterdayIntake.calories > caloricTarget + 200}}
NOTA: Ayer se excedio en calorias. Ajusta ligeramente el plan de hoy hacia la parte baja del rango calorico ({{caloricTarget}} - 100), sin bajar de los minimos seguros.
{{/if}}
{{#if yesterdayIntake.protein < proteinTarget * 0.8}}
NOTA: Ayer quedo bajo en proteina. Prioriza fuentes de proteina en las comidas de hoy.
{{/if}}
{{/if}}

{{#if weeklyAvg}}
PROMEDIO SEMANAL ACTUAL:
- Calorias promedio: {{weeklyAvg.avg_calories}} kcal/dia
- Proteina promedio: {{weeklyAvg.avg_protein}}g/dia
{{#if weeklyAvg.avg_calories > caloricTarget + 100}}
NOTA: El promedio semanal esta por encima de la meta. Apunta al limite bajo del rango calorico hoy.
{{/if}}
{{/if}}

INSTRUCCIONES:
1. Genera exactamente {{mealCount}} comidas para este dia.
2. Las calorias totales del dia deben estar entre {{caloricTarget}} - 50 y {{caloricTarget}} + 50.
3. Los macros deben acercarse a los objetivos (±10%).
4. NUNCA incluyas alimentos de las restricciones, alergias o disgustos.
5. Usa ingredientes comunes en la cultura {{localCulture}}.
6. Adapta al presupuesto del usuario:
   - "low": proteinas economicas (huevo, pollo entero, atun enlatado, leguminosas), granos basicos, verduras de temporada. Sin salmon, proteina en polvo, frutos secos premium.
   - "medium": pechuga de pollo, carne molida magra, tilapia, queso panela, yogur griego. Aguacate y almendras en porciones moderadas.
   - "high": sin restriccion de ingredientes.
7. Distribuye las comidas desde la hora de despertar ({{wakeUpTime}}) con intervalos de 3-4 horas.
8. Preparacion: maximo 25 minutos entre semana{{#if isWeekend}}, puede ser mas elaborada hoy (fin de semana){{/if}}.
9. NO repitas platos de los ultimos 3 dias.
10. Varía el tipo de proteina entre comidas del mismo dia.
{{#if hasWorkout}}
11. El usuario tiene entrenamiento hoy. Incluye un snack pre o post-entrenamiento si el numero de comidas lo permite.
{{/if}}

FORMATO DE SALIDA:
Responde EXCLUSIVAMENTE con un JSON valido:

{
  "plan_date": "{{planDate}}",
  "day_of_week": "{{dayOfWeek}}",
  "total_calories": <number>,
  "total_protein_g": <number>,
  "total_carbs_g": <number>,
  "total_fat_g": <number>,
  "meals": [
    {
      "meal_type": "breakfast|lunch|snack|dinner",
      "meal_label": "Desayuno|Almuerzo|Snack|Cena",
      "time": "HH:MM",
      "name": "<nombre del platillo en espanol>",
      "calories": <number>,
      "protein_g": <number>,
      "carbs_g": <number>,
      "fat_g": <number>,
      "ingredients": [
        {
          "name": "<ingrediente>",
          "quantity": "<cantidad legible>",
          "grams": <number>
        }
      ],
      "preparation_notes": "<instrucciones breves>"
    }
  ]
}

Asegurate de que:
- Los macros de cada comida sumen los totales del dia
- Las horas esten espaciadas 3-4 horas desde {{wakeUpTime}}
- Los nombres esten en espanol
- Las notas de preparacion sean concisas
```

---

## Template: Estimar Macros de Comida Reportada

Cuando el usuario dice que comio algo, el agente necesita estimar macros para actualizar el balance diario. Este template NO se usa como sub-workflow separado — es logica que el agente ejecuta inline al invocar la tool `log_food_intake`.

### Variables

| Variable | Fuente | Ejemplo |
|---|---|---|
| `{{reportedFood}}` | Mensaje del usuario | "2 huevos revueltos con arepa y cafe con leche" |
| `{{mealType}}` | Inferido por hora o contexto | "breakfast" |

### Guia de estimacion (incluida en el system prompt como conocimiento)

El agente debe estimar macros razonablemente usando su conocimiento nutricional. No necesita ser exacto al gramo — una estimacion con ±15% es aceptable. Guia para las estimaciones mas comunes:

```
PORCIONES ESTANDAR PARA ESTIMACION:
- 1 huevo: 75 kcal, 6g proteina, 0.5g carbs, 5g grasa
- 1 arepa mediana: 200 kcal, 4g proteina, 30g carbs, 7g grasa
- 1 tortilla de maiz: 60 kcal, 1.5g proteina, 12g carbs, 1g grasa
- 1 taza de arroz cocido: 200 kcal, 4g proteina, 45g carbs, 0.5g grasa
- 100g pechuga de pollo: 165 kcal, 31g proteina, 0g carbs, 3.5g grasa
- 100g carne molida (90/10): 170 kcal, 26g proteina, 0g carbs, 7g grasa
- 1 platano: 105 kcal, 1g proteina, 27g carbs, 0.4g grasa
- 1 taza de frijoles cocidos: 230 kcal, 15g proteina, 40g carbs, 1g grasa
- 1 vaso de leche entera: 150 kcal, 8g proteina, 12g carbs, 8g grasa
- 1 cafe con leche: 70 kcal, 3g proteina, 6g carbs, 3.5g grasa
- 1 pan/arepa con queso: 280 kcal, 10g proteina, 30g carbs, 12g grasa
- 1 porcion de ensalada (sin aderezo): 30 kcal, 2g proteina, 5g carbs, 0.5g grasa
- 1 cucharada de aceite: 120 kcal, 0g proteina, 0g carbs, 14g grasa
- 100g de pasta cocida: 160 kcal, 6g proteina, 32g carbs, 1g grasa
- 1 rebanada de pizza: 280 kcal, 12g proteina, 33g carbs, 10g grasa
- 1 hamburguesa sencilla: 350 kcal, 20g proteina, 30g carbs, 15g grasa
- 1 empanada: 250 kcal, 8g proteina, 25g carbs, 13g grasa
```

Cuando el usuario reporta comida, el agente:
1. Estima calorias y macros usando esta guia como base
2. Invoca `log_food_intake` con los valores estimados
3. Muestra el balance actualizado del dia

---

## Template: Reemplazar una Comida del Plan Diario

Cuando el usuario pide cambiar una comida que aun no ha comido.

### Variables

| Variable | Fuente | Ejemplo |
|---|---|---|
| `{{currentMeal}}` | meal_plans.plan_json | JSON de la comida a reemplazar |
| `{{reason}}` | Mensaje del usuario | "No tengo pollo" |
| `{{remainingCalories}}` | daily_targets | 800 |
| `{{remainingProtein}}` | daily_targets | 60 |
| `{{dietaryRestrictions}}` | user_profiles | [] |
| `{{dislikedFoods}}` | user_profiles | [] |

### Prompt

```
El usuario necesita reemplazar esta comida de su plan de hoy:

Comida actual:
{{currentMeal}}

Razon del cambio: "{{reason}}"

Calorias restantes del dia: {{remainingCalories}} kcal
Proteina restante del dia: {{remainingProtein}}g

Restricciones: {{dietaryRestrictions}}
Alimentos que no le gustan: {{dislikedFoods}}

INSTRUCCIONES:
1. Genera una comida alternativa con calorias y macros similares (±15%)
2. Que considere la razon del cambio (si no tiene un ingrediente, no lo uses)
3. Que respete restricciones y disgustos
4. Preparacion maxima 25 minutos

FORMATO: JSON con la misma estructura de una comida individual:
{
  "meal_type": "<string>",
  "meal_label": "<string>",
  "time": "HH:MM",
  "name": "<nombre en espanol>",
  "calories": <number>,
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>,
  "ingredients": [...],
  "preparation_notes": "<instrucciones>"
}
```

---

## Template: Receta Detallada

Sin cambios significativos respecto a v1. Se mantiene igual.

### Prompt

```
El usuario quiere la receta detallada de: "{{mealName}}"

Ingredientes base:
{{ingredients}}

INSTRUCCIONES:
1. Receta paso a paso, facil de seguir
2. Cantidades exactas
3. Tiempos de coccion
4. Tips utiles
5. Tono de amigo que ensena a cocinar

FORMATO: Texto natural en espanol, pasos numerados. Maximo 350 palabras.
```

---

## Integracion en n8n: Workflow Actualizado

### Workflow: `FitAI - Meal Plan Generator` (v2 — diario)

El workflow cambia significativamente al pasar de semanal a diario.

#### Nodo 1: Sub-Workflow Trigger

- **Datos de entrada**: `userId`, `planDate` (default: tomorrow), `chatId` (opcional, para respuestas directas)

#### Nodo 2: Load User Profile (PostgreSQL)

```sql
SELECT up.*, g.goal_type, g.target_weight, u.first_name
FROM user_profiles up
JOIN users u ON up.user_id = u.id
LEFT JOIN goals g ON up.user_id = g.user_id AND g.is_active = true
WHERE up.user_id = $1;
```

#### Nodo 3: Get Recent Meals (PostgreSQL) — NUEVO

```sql
SELECT mp.plan_date, mp.plan_json
FROM meal_plans mp
WHERE mp.user_id = $1
  AND mp.plan_date >= ($2::date - INTERVAL '3 days')
  AND mp.plan_date < $2::date
ORDER BY mp.plan_date DESC;
```

Parametros: `userId`, `planDate`

Obtiene los planes de los ultimos 3 dias para evitar repeticion.

#### Nodo 4: Get Yesterday Intake (PostgreSQL) — NUEVO

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

Parametros: `userId`, `planDate`

#### Nodo 5: Get Weekly Average (PostgreSQL) — NUEVO

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

Parametros: `userId`, `planDate`

#### Nodo 6: Check Workout Day (PostgreSQL) — NUEVO

```sql
SELECT EXISTS(
  SELECT 1 FROM exercise_plans
  WHERE user_id = $1
    AND is_active = true
    AND plan_json::jsonb @> jsonb_build_object('day_of_week', to_char($2::date, 'FMDay'))
) AS has_workout;
```

Parametros: `userId`, `planDate`

#### Nodo 7: Build Daily Meal Plan Prompt (Code)

```javascript
const profile = $('Load User Profile').first().json;
const recentPlans = $('Get Recent Meals').all().map(i => i.json);
const yesterdayIntake = $('Get Yesterday Intake').first()?.json || null;
const weeklyAvg = $('Get Weekly Average').first()?.json || null;
const hasWorkout = $('Check Workout Day').first()?.json?.has_workout || false;
const planDate = $('Sub-Workflow Trigger').first().json.planDate;

// Construir resumen de comidas recientes
let recentMeals = '';
for (const plan of recentPlans) {
  const p = typeof plan.plan_json === 'string' ? JSON.parse(plan.plan_json) : plan.plan_json;
  const mealNames = (p.meals || []).map(m => m.name).join(', ');
  recentMeals += `${plan.plan_date}: ${mealNames}\n`;
}

// Dia de la semana
const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const dateObj = new Date(planDate + 'T12:00:00');
const dayOfWeek = dayNames[dateObj.getDay()];
const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

// Construir prompt usando el template diario con todas las variables
const prompt = buildDailyPrompt({
  userName: profile.first_name,
  planDate,
  dayOfWeek,
  caloricTarget: profile.caloric_target,
  proteinTarget: profile.protein_target_g,
  carbTarget: profile.carb_target_g,
  fatTarget: profile.fat_target_g,
  mealCount: profile.meals_per_day || profile.meal_count,
  dietaryRestrictions: profile.dietary_restrictions,
  foodAllergies: profile.food_allergies,
  dislikedFoods: profile.disliked_foods,
  localCulture: profile.local_culture || 'colombian',
  budget: profile.budget_level,
  wakeUpTime: profile.wake_up_time || '07:00',
  recentMeals: recentMeals || null,
  yesterdayIntake: yesterdayIntake?.meals_logged > 0 ? {
    calories: yesterdayIntake.calories_consumed,
    protein: yesterdayIntake.protein_consumed_g
  } : null,
  weeklyAvg: weeklyAvg?.avg_calories ? {
    avg_calories: Math.round(weeklyAvg.avg_calories),
    avg_protein: Math.round(weeklyAvg.avg_protein)
  } : null,
  isWeekend,
  hasWorkout
});

return [{ json: { prompt, userId: $json.userId, planDate, dayOfWeek } }];
```

#### Nodo 8: Generate Meal Plan (OpenAI)

- **Modelo**: `gpt-4o`
- **Temperature**: `0.85` (ligeramente mas alta que v1 para mas variedad dia a dia)
- **Max Tokens**: `2048` (un solo dia necesita menos tokens que 7 dias)
- **System Message**: "Eres un nutriologo experto. Responde SOLO con JSON valido, sin texto adicional."
- **Input**: `{{ $json.prompt }}`

#### Nodo 9: Parse and Validate Plan (Code)

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

// Validar estructura
if (!plan.meals || !Array.isArray(plan.meals)) {
  throw new Error('El plan no contiene la estructura de meals esperada');
}

if (plan.meals.length < 3) {
  throw new Error('El plan tiene menos de 3 comidas');
}

// Calcular total de calorias
const totalCalories = plan.meals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
const totalProtein = plan.meals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0);

// Asegurar que plan_date este presente
plan.plan_date = $json.planDate;
plan.day_of_week = $json.dayOfWeek;

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

```sql
UPDATE meal_plans
SET is_active = false
WHERE user_id = $1
  AND plan_date = $2::date
  AND is_active = true;
```

Parametros: `userId`, `planDate`

Nota: solo desactiva planes del mismo dia, no todos los planes activos.

#### Nodo 11: Save New Daily Plan (PostgreSQL)

```sql
INSERT INTO meal_plans (user_id, plan_date, plan_json, total_calories, is_active, generated_at)
VALUES ($1, $2::date, $3, $4, true, NOW())
RETURNING id;
```

Parametros: `userId`, `planDate`, `JSON.stringify(plan)`, `totalCalories`

#### Nodo 12: Return Plan to Caller (Code)

```javascript
const plan = $('Parse and Validate Plan').first().json.plan;
const meals = plan.meals || [];

// Formato conciso para el agente o para el morning briefing
let formatted = `Plan de comidas para hoy (${plan.day_of_week}):\n\n`;
for (const meal of meals) {
  formatted += `${meal.meal_label} (${meal.time}): ${meal.name} — *${meal.calories} kcal*, ${meal.protein_g}g proteina\n`;
}
formatted += `\nTotal del dia: *${plan.total_calories} kcal* | *${plan.total_protein_g}g* proteina`;

return [{
  json: {
    formattedPlan: formatted,
    plan: plan,
    totalCalories: plan.total_calories,
    totalProtein: plan.total_protein_g,
    planDate: plan.plan_date
  }
}];
```

### Logica de ramificacion

```
Sub-Workflow Trigger
  → Load User Profile (PostgreSQL)         ← paralelo
  → Get Recent Meals (PostgreSQL)          ← paralelo
  → Get Yesterday Intake (PostgreSQL)      ← paralelo
  → Get Weekly Average (PostgreSQL)        ← paralelo
  → Check Workout Day (PostgreSQL)         ← paralelo
  → Build Daily Meal Plan Prompt (Code)
    → Generate Meal Plan (OpenAI)
      → Parse and Validate Plan (Code)
        → Deactivate Previous Plan (PostgreSQL)
          → Save New Daily Plan (PostgreSQL)
            → Return Plan to Caller (Code)
```

### Manejo de Errores

- **OpenAI retorna JSON invalido**: reintento 1 vez. Si falla, retorna error al agente.
- **Plan incompleto**: si tiene < 3 comidas, reintento 1 vez con prompt reforzado.
- **PostgreSQL error al guardar**: plan se retorna igual al usuario pero con nota interna de que no se persisto.
- **Timeout OpenAI**: 45 segundos (un dia es mas rapido que 7 dias).
- **No hay perfil de usuario**: error critico, log + notificacion al admin.

---

## Workflow Nuevo: `FitAI - Daily Plan Generator Cron`

Cron que genera planes diarios para todos los usuarios activos cada noche.

### Informacion General

| Campo | Valor |
|---|---|
| **Nombre** | `FitAI - Daily Plan Generator Cron` |
| **Trigger** | Cron: `0 21 * * *` (9pm hora local) |
| **Proposito** | Genera el plan de comidas del dia siguiente para cada usuario activo que no tiene plan generado aun |

### Nodos

#### Nodo 1: Cron Trigger (21:00 diario)

#### Nodo 2: Get Active Users Without Tomorrow Plan (PostgreSQL)

```sql
SELECT u.id AS user_id, u.telegram_id, up.wake_up_time
FROM users u
JOIN memberships m ON u.id = m.user_id AND m.status = 'active' AND m.expires_at > NOW()
JOIN user_profiles up ON u.id = up.user_id AND up.onboarding_completed = true
LEFT JOIN meal_plans mp ON u.id = mp.user_id AND mp.plan_date = CURRENT_DATE + 1 AND mp.is_active = true
WHERE mp.id IS NULL;
```

Solo obtiene usuarios que NO tienen plan activo para manana.

#### Nodo 3: Loop — For Each User

Para cada usuario, ejecuta el sub-workflow Meal Plan Generator con `planDate = CURRENT_DATE + 1`.

#### Nodo 4: Execute Meal Plan Generator (Sub-Workflow)

```json
{
  "userId": "{{ $json.user_id }}",
  "planDate": "{{ new Date(Date.now() + 86400000).toISOString().split('T')[0] }}"
}
```

#### Nodo 5: Create Tomorrow Daily Targets (PostgreSQL)

```sql
INSERT INTO daily_targets (user_id, target_date, caloric_target, protein_target_g, carb_target_g, fat_target_g)
SELECT up.user_id, CURRENT_DATE + 1, up.caloric_target, up.protein_target_g, up.carb_target_g, up.fat_target_g
FROM user_profiles up
WHERE up.user_id = $1
ON CONFLICT (user_id, target_date) DO NOTHING;
```

#### Nodo 6: Log Completion

Registra cuantos planes se generaron, cuantos fallaron, y tiempo total.

### Manejo de Errores

- Si un usuario falla, continua con el siguiente (no detiene el batch)
- Usuarios con error se logean para revision manual
- Rate limit de OpenAI: 1 segundo de pausa entre generaciones

---

## Formato de Presentacion al Usuario (via Telegram)

### Morning Briefing (plan del dia)

```
Buenos dias, {{userName}}! Tu plan de hoy ({{dayOfWeek}}):

Desayuno (7:30): Huevos revueltos con arepa y cafe — *420 kcal*
Almuerzo (12:30): Pollo a la plancha con arroz y ensalada — *550 kcal*
Snack (16:00): Yogur griego con fruta — *180 kcal*
Cena (19:30): Crema de lentejas con pan integral — *450 kcal*

Meta del dia: *1,600 kcal* | *130g proteina*

Buen dia!
```

### Cuando el usuario pregunta "que como hoy" (mid-day, con intake parcial)

```
Tu proxima comida es el almuerzo (12:30): pollo a la plancha con arroz y ensalada — *550 kcal, 42g proteina*.

Llevas *420 de 1,600 kcal* y *28 de 130g proteina*. Vas bien para la manana.
```

### Cuando pide ver el plan completo

```
Tu plan de hoy:

- Desayuno (7:30): Huevos revueltos con arepa — *420 kcal* ✓ (ya comiste)
- Almuerzo (12:30): Pollo con arroz y ensalada — *550 kcal*
- Snack (16:00): Yogur griego con fruta — *180 kcal*
- Cena (19:30): Crema de lentejas — *450 kcal*

Llevas *420 de 1,600 kcal*. Te faltan 3 comidas.
```