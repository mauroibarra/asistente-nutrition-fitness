# Template de Generación de Planes de Comidas — FitAI Assistant

## Template Principal: Generar Plan Semanal Completo

### Variables del Template

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{caloricTarget}}` | user_profiles.caloric_target | 1800 |
| `{{proteinTarget}}` | user_profiles.protein_target_g | 135 |
| `{{carbTarget}}` | user_profiles.carb_target_g | 200 |
| `{{fatTarget}}` | user_profiles.fat_target_g | 60 |
| `{{dietaryRestrictions}}` | user_profiles.dietary_restrictions | ["vegetarian"] |
| `{{foodAllergies}}` | user_profiles.food_allergies | ["shrimp"] |
| `{{dislikedFoods}}` | user_profiles.disliked_foods | ["eggplant", "mushrooms"] |
| `{{weekNumber}}` | Calculado | 12 |
| `{{localCulture}}` | user_profiles.local_culture | "mexican" |
| `{{budget}}` | user_profiles.budget_level | "medium" |
| `{{mealCount}}` | user_profiles.meal_count | 4 |
| `{{previousPlanSummary}}` | meal_plans (última semana) | "La semana pasada incluyó: pollo, salmón, tacos..." |

### Prompt del Template

```
Eres un nutriólogo experto creando un plan de comidas personalizado.

PERFIL DEL USUARIO:
- Nombre: {{userName}}
- Objetivo calórico diario: {{caloricTarget}} kcal
- Macros objetivo: {{proteinTarget}}g proteína, {{carbTarget}}g carbohidratos, {{fatTarget}}g grasa
- Restricciones dietarias: {{dietaryRestrictions}}
- Alergias: {{foodAllergies}}
- Alimentos que no le gustan: {{dislikedFoods}}
- Cultura gastronómica: {{localCulture}}
- Presupuesto para ingredientes: {{budget}}
- Número de comidas al día: {{mealCount}}
- Semana número: {{weekNumber}}

{{#if previousPlanSummary}}
PLAN DE LA SEMANA ANTERIOR (evita repetir las mismas comidas):
{{previousPlanSummary}}
{{/if}}

INSTRUCCIONES:
1. Genera un plan de comidas para 7 días completos (lunes a domingo).
2. Cada día debe incluir {{mealCount}} comidas distribuidas a lo largo del día.
3. Los macronutrientes de cada día deben acercarse lo más posible a los objetivos (±5%).
4. Las calorías diarias deben estar entre {{caloricTarget}} - 50 y {{caloricTarget}} + 50.
5. NUNCA incluyas alimentos que el usuario no puede comer (restricciones, alergias, disgustos).
6. Usa ingredientes accesibles y comunes en la cultura {{localCulture}}.
7. Adapta la selección de ingredientes al presupuesto del usuario ({{budget}}):
   - "low" (Económico): prioriza cortes de carne económicos (pollo entero, carne molida, atún enlatado, huevo, sardina), leguminosas (frijoles, lentejas), granos básicos (arroz, avena, tortilla de maíz) y verduras de temporada. Evita salmón, proteínas en polvo, frutos secos premium, aceites especiales y productos importados.
   - "medium" (Moderado): incluye pechuga de pollo, carne molida magra, tilapia, atún fresco, queso panela, yogur griego. Puede incluir aguacate, almendras en porciones moderadas. Balance entre nutrición óptima y costo.
   - "high" (Sin restricción): puede incluir salmón, atún sushi grade, carne de res de cortes premium, proteína whey de calidad, frutos secos variados, superalimentos (chia, quinoa, espirulina), aceite de oliva extra virgen, ingredientes orgánicos.
8. Las preparaciones deben ser realistas: máximo 30 minutos de preparación para comidas de entre semana.
9. Incluye variedad: no repitas la misma proteína más de 2 veces por semana.
10. Los fines de semana pueden incluir preparaciones más elaboradas.
11. Si la semana anterior tuvo ciertos platos, varía para evitar monotonía.

FORMATO DE SALIDA:
Responde EXCLUSIVAMENTE con un JSON válido siguiendo esta estructura exacta:

{
  "metadata": {
    "user_id": <int>,
    "week_number": <int>,
    "year": <int>,
    "caloric_target": <number>,
    "protein_target_g": <number>,
    "carb_target_g": <number>,
    "fat_target_g": <number>,
    "dietary_restrictions": [<string>],
    "local_culture": "<string>",
    "budget": "<low|medium|high>"
  },
  "days": [
    {
      "day": "monday",
      "day_label": "Lunes",
      "total_calories": <number>,
      "total_protein_g": <number>,
      "total_carbs_g": <number>,
      "total_fat_g": <number>,
      "meals": [
        {
          "meal_type": "breakfast|lunch|snack|dinner",
          "meal_label": "Desayuno|Comida|Colación|Cena",
          "time": "HH:MM",
          "name": "<nombre del platillo en español>",
          "calories": <number>,
          "protein_g": <number>,
          "carbs_g": <number>,
          "fat_g": <number>,
          "ingredients": [
            {
              "name": "<nombre del ingrediente>",
              "quantity": "<cantidad legible>",
              "grams": <number>
            }
          ],
          "preparation_notes": "<instrucciones breves de preparación>"
        }
      ]
    }
  ]
}

Asegúrate de que:
- Los macros de cada comida sumen aproximadamente los totales del día
- Los totales del día se acerquen a los objetivos
- Cada ingrediente tenga nombre, cantidad legible y gramos
- Los nombres de los platillos estén en español
- Las notas de preparación sean concisas pero útiles
```

---

## Template: Recordar una Comida Específica

Cuando el usuario reporta lo que comió y quiere saber cómo se compara con su plan.

### Variables

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{reportedMeal}}` | Mensaje del usuario | "Comí 2 tacos de pastor con piña y una coca" |
| `{{mealType}}` | Inferido del horario | "lunch" |
| `{{plannedMeal}}` | meal_plans.plan_json | JSON de la comida planeada |
| `{{remainingCalories}}` | Calculado | 1200 |
| `{{remainingProtein}}` | Calculado | 90 |

### Prompt

```
El usuario {{userName}} reportó lo siguiente que comió:
"{{reportedMeal}}"

Esta comida corresponde a su {{mealType}}.

La comida que tenía planeada era:
{{plannedMeal}}

Calorías restantes del día: {{remainingCalories}} kcal
Proteína restante del día: {{remainingProtein}}g

INSTRUCCIONES:
1. Estima las calorías y macros de lo que reportó el usuario (lo mejor posible con la información dada).
2. Compara con lo que tenía planeado.
3. Calcula cuántas calorías y macros le quedan para el resto del día.
4. Si se excedió, sugiere ajustes para las comidas restantes del día (sin culpa ni juicio).
5. Si fue cercano al plan, felicita y continúa.

FORMATO: Responde en texto natural en español, como un coach amigable hablando por Telegram. Máximo 3 párrafos.

NO uses tablas ni formato complejo. Mantén un tono positivo y práctico.
```

---

## Template: Reemplazar una Comida Específica

Cuando el usuario pide cambiar una comida del plan por otra.

### Variables

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{currentMeal}}` | meal_plans.plan_json | JSON de la comida actual |
| `{{reason}}` | Mensaje del usuario | "No tengo salmón" |
| `{{mealType}}` | Parámetro | "lunch" |
| `{{dayOfWeek}}` | Parámetro | "tuesday" |
| `{{caloricTarget}}` | user_profiles.caloric_target | 1800 |
| `{{dietaryRestrictions}}` | user_profiles.dietary_restrictions | [] |
| `{{dislikedFoods}}` | user_profiles.disliked_foods | [] |

### Prompt

```
El usuario {{userName}} necesita reemplazar la siguiente comida de su plan:

Comida actual ({{mealType}} del {{dayOfWeek}}):
{{currentMeal}}

Razón del cambio: "{{reason}}"

Restricciones: {{dietaryRestrictions}}
Alimentos que no le gustan: {{dislikedFoods}}

INSTRUCCIONES:
1. Genera una comida alternativa que:
   - Tenga calorías y macros similares (±10%) a la comida original
   - Sea diferente a la comida que se reemplaza
   - Respete las restricciones y disgustos del usuario
   - Considere la razón del cambio (si no tiene un ingrediente, no uses ese ingrediente)
   - Sea práctica de preparar
2. Presenta la alternativa en formato conversacional amigable
3. Incluye los ingredientes y una preparación breve

FORMATO: Responde como JSON con la misma estructura de una comida individual:
{
  "meal_type": "<string>",
  "meal_label": "<string>",
  "time": "HH:MM",
  "name": "<nombre en español>",
  "calories": <number>,
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>,
  "ingredients": [...],
  "preparation_notes": "<instrucciones>"
}
```

---

## Template: Solicitar Receta Detallada

Cuando el usuario quiere los pasos detallados de preparación de una comida del plan.

### Variables

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{mealName}}` | meal_plans.plan_json | "Salmón al horno con camote y brócoli" |
| `{{ingredients}}` | meal_plans.plan_json | Lista de ingredientes |
| `{{servings}}` | Parámetro (default 1) | 1 |

### Prompt

```
El usuario {{userName}} quiere la receta detallada de:
"{{mealName}}"

Ingredientes base (para {{servings}} porción(es)):
{{ingredients}}

INSTRUCCIONES:
1. Genera una receta paso a paso detallada y fácil de seguir.
2. Incluye:
   - Lista de ingredientes con cantidades exactas
   - Pasos numerados de preparación
   - Tiempos de cocción específicos
   - Tips de preparación útiles
3. El tono debe ser amigable, como un amigo que te enseña a cocinar.
4. Incluye alternativas si algún paso puede simplificarse.

FORMATO: Texto natural en español, con pasos numerados. Máximo 400 palabras.
```

---

## Template: Ajustar Plan por Comida Reportada

Cuando el usuario comió algo diferente al plan y necesita rebalancear el resto del día.

### Variables

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{userName}}` | users.first_name | "Carlos" |
| `{{consumedCalories}}` | Estimado | 650 |
| `{{consumedProtein}}` | Estimado | 25 |
| `{{consumedCarbs}}` | Estimado | 80 |
| `{{consumedFat}}` | Estimado | 28 |
| `{{remainingMeals}}` | meal_plans.plan_json | JSON de comidas restantes del día |
| `{{dailyCaloricTarget}}` | user_profiles.caloric_target | 1800 |
| `{{dailyProteinTarget}}` | user_profiles.protein_target_g | 135 |

### Prompt

```
El usuario {{userName}} ya consumió:
- Calorías: {{consumedCalories}} kcal
- Proteína: {{consumedProtein}}g
- Carbohidratos: {{consumedCarbs}}g
- Grasa: {{consumedFat}}g

Sus objetivos diarios son:
- Calorías: {{dailyCaloricTarget}} kcal
- Proteína: {{dailyProteinTarget}}g

Comidas restantes planeadas para hoy:
{{remainingMeals}}

INSTRUCCIONES:
1. Calcula cuántas calorías y macros le quedan para el día.
2. Evalúa si las comidas restantes del plan original se ajustan o necesitan modificación.
3. Si se excedió en calorías: sugiere versiones más ligeras de las comidas restantes.
4. Si le faltan macros (especialmente proteína): sugiere ajustes para alcanzar los objetivos.
5. Si está bien encaminado: confirma que puede seguir con el plan.

FORMATO: Texto conversacional en español. Máximo 3 párrafos. Tono positivo, sin culpa.
```

---

## Instrucciones de Integración en n8n

### Flujo del Workflow `FitAI - Meal Plan Generator`

1. **Recibir parámetros** del AI Agent (user_id, tipo de solicitud)
2. **Obtener perfil** del usuario de PostgreSQL (user_profiles)
3. **Obtener plan anterior** si existe (meal_plans WHERE is_active = true)
4. **Construir prompt** usando el template correspondiente con las variables del usuario
5. **Llamar a OpenAI** (gpt-4o, temperature: 0.8, max_tokens: 4096 para plan completo)
6. **Parsear respuesta** JSON
7. **Validar** que los macros totales se acercan a los objetivos (±10%)
8. **Desactivar plan anterior** (UPDATE meal_plans SET is_active = false WHERE user_id = $1 AND is_active = true)
9. **Guardar nuevo plan** en meal_plans con plan_json
10. **Retornar** el plan formateado al agente

### Formato de Respuesta al Usuario (via Telegram)

El agente debe formatear el plan para Telegram de forma legible:

```
Tu plan de comidas para esta semana:

*Lunes*
- Desayuno (8:00): Huevos revueltos con nopales y frijoles — 420 kcal
- Comida (14:00): Pechuga de pollo a la plancha con arroz — 580 kcal
- Colación (17:00): Yogur griego con almendras — 220 kcal
- Cena (20:00): Quesadillas de champiñones — 570 kcal
Total: 1790 kcal | 137g proteína

*Martes*
...

¿Quieres ver la receta de algún platillo? Solo dime cuál.
```
