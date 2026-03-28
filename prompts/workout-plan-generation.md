# Template de Generación de Planes de Ejercicio — FitAI Assistant

## Template Principal: Generar Plan Semanal Completo

### Variables del Template

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{fitnessLevel}}` | user_profiles.fitness_level | "beginner" |
| `{{goal}}` | user_profiles.goal | "lose_weight" |
| `{{availableDays}}` | user_profiles.training_days_per_week | 4 |
| `{{equipment}}` | user_profiles.available_equipment | ["gym_full"] |
| `{{injuries}}` | user_profiles.injuries | ["left_knee"] |
| `{{weekNumber}}` | Calculado | 12 |
| `{{previousPlanSummary}}` | exercise_plans (última semana) | "Semana anterior: Upper/Lower split, peso moderado" |
| `{{age}}` | user_profiles.age | 30 |
| `{{gender}}` | user_profiles.gender | "male" |

### Prompt del Template

```
Eres un entrenador personal certificado creando un plan de ejercicio personalizado.

PERFIL DEL USUARIO:
- Nombre: {{userName}}
- Edad: {{age}} años
- Género: {{gender}}
- Nivel de fitness: {{fitnessLevel}}
- Objetivo: {{goal}}
- Días disponibles para entrenar: {{availableDays}}
- Equipo disponible: {{equipment}}
- Lesiones o limitaciones: {{injuries}}
- Semana número: {{weekNumber}}

{{#if previousPlanSummary}}
PLAN DE LA SEMANA ANTERIOR (mantén progresión o varía estímulos):
{{previousPlanSummary}}
{{/if}}

INSTRUCCIONES:
1. Genera un plan de ejercicio para 7 días (lunes a domingo).
2. Distribuye {{availableDays}} días de entrenamiento activo y el resto como descanso o descanso activo.
3. Adapta COMPLETAMENTE al equipo disponible del usuario:
   - "home_no_equipment": solo peso corporal
   - "home_basic": peso corporal + bandas elásticas + mancuernas ligeras
   - "gym_full": acceso completo a gimnasio
4. NUNCA incluyas ejercicios que agraven las lesiones reportadas ({{injuries}}).
5. Para lesiones, ofrece alternativas seguras para ese grupo muscular.
6. Incluye calentamiento (5 min) y enfriamiento (5 min) en cada día de entrenamiento.
7. La duración total de cada sesión no debe exceder:
   - Principiante: 45-50 minutos
   - Intermedio: 50-60 minutos
   - Avanzado: 60-75 minutos
8. Incluye notas de forma detalladas para CADA ejercicio.
9. Las sugerencias de peso deben ser apropiadas para el nivel de fitness.

ESTRUCTURA SEGÚN NIVEL:
- Principiante (3 días): Full body cada día de entrenamiento
- Principiante (4 días): Full body o Upper/Lower split
- Intermedio (4 días): Upper/Lower split
- Intermedio (5 días): Push/Pull/Legs + Upper/Lower
- Avanzado (5-6 días): Push/Pull/Legs × 2

ESTRUCTURA SEGÚN OBJETIVO:
- lose_weight: Incluir 2-3 sesiones de cardio (HIIT o LISS), priorizar ejercicios compuestos
- gain_muscle: Priorizar ejercicios compuestos pesados, volumen alto, cardio mínimo
- maintain: Balance entre fuerza y cardio, volumen moderado
- recomposition: Priorizar fuerza con déficit ligero, cardio LISS

FORMATO DE SALIDA:
Responde EXCLUSIVAMENTE con un JSON válido siguiendo esta estructura exacta:

{
  "metadata": {
    "user_id": <int>,
    "week_number": <int>,
    "year": <int>,
    "fitness_level": "<string>",
    "goal": "<string>",
    "available_days": <int>,
    "equipment": [<string>],
    "injuries": [<string>]
  },
  "days": [
    {
      "day": "monday",
      "day_label": "Lunes",
      "type": "strength|cardio|hiit|rest|active_rest",
      "focus": "<descripción del enfoque del día>",
      "duration_minutes": <number>,
      "estimated_calories_burned": <number>,
      "warmup": {
        "duration_minutes": 5,
        "exercises": [
          { "name": "<nombre>", "duration": "<duración>" | "reps": <number> }
        ]
      },
      "exercises": [
        {
          "name": "<nombre del ejercicio en español>",
          "muscle_group": "<grupo muscular principal>",
          "sets": <number>,
          "reps": "<reps o duración>",
          "rest_seconds": <number>,
          "weight_suggestion": "<sugerencia de peso apropiada al nivel>",
          "form_notes": "<notas detalladas de forma y técnica en español>"
        }
      ],
      "cooldown": {
        "duration_minutes": 5,
        "exercises": [
          { "name": "<nombre>", "duration": "<duración>" }
        ]
      },
      "notes": "<notas opcionales del día>"
    }
  ]
}

Asegúrate de que:
- Cada ejercicio tiene notas de forma claras y útiles
- Las sugerencias de peso son realistas para el nivel del usuario
- Los días de descanso tienen indicaciones claras
- El volumen total semanal por grupo muscular está en el rango apropiado
- Los ejercicios son seguros y no agravan las lesiones reportadas
```

---

## Template: Adaptar Plan por Lesión o Fatiga Reportada

Cuando el usuario reporta una lesión nueva, dolor o fatiga excesiva que requiere modificar el plan.

### Variables

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{currentPlan}}` | exercise_plans.plan_json | JSON del plan actual |
| `{{issue}}` | Mensaje del usuario | "Me duele la rodilla izquierda desde ayer" |
| `{{issueType}}` | Inferido | "injury" o "fatigue" |
| `{{affectedArea}}` | Inferido | "left_knee" |
| `{{fitnessLevel}}` | user_profiles.fitness_level | "beginner" |
| `{{remainingDays}}` | Calculado | Días restantes de la semana |

### Prompt

```
El usuario {{userName}} reportó lo siguiente:
"{{issue}}"

Tipo de problema: {{issueType}}
Área afectada: {{affectedArea}}

Plan actual de la semana:
{{currentPlan}}

Días restantes de la semana: {{remainingDays}}

INSTRUCCIONES:

{{#if issueType === 'injury'}}
LESIÓN REPORTADA:
1. NUNCA sugieras que el usuario ignore el dolor o "se aguante".
2. Si el dolor es agudo, intenso o persistente, PRIMERO recomienda consultar un médico/fisioterapeuta.
3. Para los días restantes de la semana, modifica el plan:
   - Elimina todos los ejercicios que involucren el área afectada bajo carga
   - Reemplaza con alternativas que NO estresen la zona lesionada
   - Reduce la intensidad general un 20-30%
   - Si la lesión es en tren inferior: enfoca en tren superior y core
   - Si la lesión es en tren superior: enfoca en tren inferior y core
   - Agrega ejercicios de movilidad suave para la zona afectada (si no hay dolor al hacerlos)
4. Incluye nota recordando que si el dolor persiste o empeora, debe ver a un profesional.
{{/if}}

{{#if issueType === 'fatigue'}}
FATIGA REPORTADA:
1. Reduce la intensidad del próximo entrenamiento un 30-40%.
2. Si lleva más de 1 semana con fatiga:
   - Sugiere una semana de deload (50% del volumen normal)
   - Evalúa si el volumen semanal es demasiado alto
   - Pregunta por calidad de sueño y alimentación
3. Si es fatiga de un día normal:
   - Ofrece versión simplificada del entrenamiento del día
   - "¿Qué tal si hoy solo haces el calentamiento y los 2 ejercicios principales? Si te sientes bien, sigues."
{{/if}}

FORMATO: Responde con el plan modificado en el mismo formato JSON de exercise_plans.plan_json, pero solo incluyendo los días que fueron modificados. Agrega un campo "modification_reason" a cada día modificado.
```

---

## Template: Generar Entrenamiento Rápido

Cuando el usuario no tiene tiempo para el entrenamiento completo pero quiere hacer algo.

### Variables

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{availableMinutes}}` | Mensaje del usuario | 15 |
| `{{equipment}}` | user_profiles.available_equipment | ["home_no_equipment"] |
| `{{todaysFocus}}` | exercise_plans (hoy) | "Tren superior" |
| `{{goal}}` | user_profiles.goal | "lose_weight" |

### Prompt

```
El usuario {{userName}} solo tiene {{availableMinutes}} minutos hoy.

Equipo disponible: {{equipment}}
Enfoque del día según su plan: {{todaysFocus}}
Objetivo: {{goal}}

INSTRUCCIONES:
1. Genera un entrenamiento condensado que se pueda completar en {{availableMinutes}} minutos.
2. Prioriza ejercicios compuestos que trabajen múltiples músculos.
3. Si son 10-15 minutos: circuito de 3-4 ejercicios, 3 rondas
4. Si son 20-30 minutos: versión abreviada del entrenamiento completo (ejercicios principales, menos series)
5. Incluye 1 minuto de calentamiento y 1 de estiramiento.
6. El tono debe ser motivador: "algo es infinitamente mejor que nada".

FORMATO: Texto conversacional en español para Telegram. Lista numerada de ejercicios con series, repeticiones y notas breves de forma. Máximo 200 palabras.
```

---

## Instrucciones de Integración en n8n

### Flujo del Workflow `FitAI - Workout Plan Generator`

1. **Recibir parámetros** del AI Agent (user_id, tipo de solicitud)
2. **Obtener perfil** del usuario de PostgreSQL (user_profiles)
3. **Obtener plan anterior** si existe (exercise_plans WHERE is_active = true)
4. **Construir prompt** usando el template correspondiente
5. **Llamar a OpenAI** (gpt-4o, temperature: 0.7, max_tokens: 4096)
6. **Parsear respuesta** JSON
7. **Validar** estructura y coherencia del plan
8. **Desactivar plan anterior** (UPDATE exercise_plans SET is_active = false WHERE user_id = $1 AND is_active = true)
9. **Guardar nuevo plan** en exercise_plans con plan_json
10. **Retornar** el plan formateado al agente

### Formato de Respuesta al Usuario (via Telegram)

```
Tu rutina de esta semana:

*Lunes — Tren superior (empuje)*
1. Bench press — 3×10-12 (90s descanso)
2. Press militar mancuernas — 3×10-12 (90s)
3. Aperturas inclinadas — 3×12-15 (60s)
4. Elevaciones laterales — 3×12-15 (60s)
5. Fondos asistidos — 3×10-12 (60s)
6. Extensión tríceps polea — 3×12-15 (60s)
Duración: ~50 min

*Martes — Cardio + Core*
...

*Miércoles — Descanso activo*
Caminata suave 30 min + estiramientos

¿Quieres que te explique la forma de algún ejercicio?
```

### Lógica de Progresión Semanal

El plan debe progresar cada semana:

| Semana | Progresión |
|--------|-----------|
| 1-2 | Aprender forma, peso conservador |
| 3-4 | Mantener forma, subir reps al tope del rango |
| 5-6 | Subir peso 5-10%, reps al fondo del rango |
| 7 | Deload: 50% del peso, mismas reps |
| 8+ | Repetir ciclo con nuevo baseline |

El campo `weekNumber` en las variables permite al modelo ajustar la intensidad según la fase del ciclo.
