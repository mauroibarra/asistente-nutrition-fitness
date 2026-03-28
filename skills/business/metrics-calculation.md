# Skill: Cálculo de Indicadores — FitAI Assistant

## Implementaciones Completas en JavaScript

Todas las funciones son puras, sin dependencias externas, listas para usar en nodos Code de n8n.

### calculateBMI — Índice de Masa Corporal

```javascript
/**
 * Calculates Body Mass Index (BMI).
 * @param {number} weightKg - Weight in kilograms
 * @param {number} heightM - Height in meters
 * @returns {{ value: number, category: string, description: string }}
 */
function calculateBMI(weightKg, heightM) {
  if (weightKg <= 0 || heightM <= 0) {
    throw new Error('Weight and height must be positive numbers');
  }

  const bmi = weightKg / (heightM * heightM);
  const rounded = Math.round(bmi * 10) / 10;

  let category, description;
  if (bmi < 18.5) {
    category = 'underweight';
    description = 'Bajo peso';
  } else if (bmi < 25) {
    category = 'normal';
    description = 'Peso normal';
  } else if (bmi < 30) {
    category = 'overweight';
    description = 'Sobrepeso';
  } else if (bmi < 35) {
    category = 'obese_1';
    description = 'Obesidad grado I';
  } else if (bmi < 40) {
    category = 'obese_2';
    description = 'Obesidad grado II';
  } else {
    category = 'obese_3';
    description = 'Obesidad grado III';
  }

  return { value: rounded, category, description };
}
```

### calculateBMR_MifflinStJeor — Tasa Metabólica Basal

```javascript
/**
 * Calculates Basal Metabolic Rate using Mifflin-St Jeor equation.
 * @param {number} weightKg - Weight in kilograms
 * @param {number} heightCm - Height in centimeters
 * @param {number} ageYears - Age in years
 * @param {'male'|'female'} gender - Biological gender
 * @returns {number} BMR in kcal/day
 */
function calculateBMR_MifflinStJeor(weightKg, heightCm, ageYears, gender) {
  if (weightKg <= 0 || heightCm <= 0 || ageYears <= 0) {
    throw new Error('All parameters must be positive numbers');
  }

  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * ageYears);

  if (gender === 'male') {
    return Math.round(base + 5);
  } else if (gender === 'female') {
    return Math.round(base - 161);
  } else {
    throw new Error('Gender must be "male" or "female"');
  }
}
```

### calculateTDEE — Gasto Energético Total Diario

```javascript
/**
 * Calculates Total Daily Energy Expenditure.
 * @param {number} bmr - Basal Metabolic Rate in kcal/day
 * @param {'sedentary'|'lightly_active'|'moderately_active'|'very_active'|'extra_active'} activityLevel
 * @returns {number} TDEE in kcal/day
 */
function calculateTDEE(bmr, activityLevel) {
  const factors = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extra_active: 1.9
  };

  const factor = factors[activityLevel];
  if (!factor) {
    throw new Error(`Invalid activity level: ${activityLevel}. Must be one of: ${Object.keys(factors).join(', ')}`);
  }

  return Math.round(bmr * factor);
}
```

### calculateCaloricTarget — Objetivo Calórico según Meta

```javascript
/**
 * Calculates daily caloric target based on goal.
 * @param {number} tdee - Total Daily Energy Expenditure in kcal/day
 * @param {'lose_weight'|'gain_muscle'|'maintain'|'recomposition'} goal
 * @returns {{ calories: number, deficit_or_surplus: number, description: string }}
 */
function calculateCaloricTarget(tdee, goal) {
  const MIN_CALORIES_MALE = 1500;
  const MIN_CALORIES_FEMALE = 1200;

  let multiplier, description;

  switch (goal) {
    case 'lose_weight':
      multiplier = 0.80; // 20% deficit
      description = 'Déficit calórico del 20% para pérdida de peso sostenible';
      break;
    case 'gain_muscle':
      multiplier = 1.10; // 10% surplus
      description = 'Superávit calórico del 10% para ganancia muscular limpia';
      break;
    case 'maintain':
      multiplier = 1.0;
      description = 'Mantenimiento calórico';
      break;
    case 'recomposition':
      multiplier = 0.95; // 5% deficit
      description = 'Déficit ligero del 5% para recomposición corporal';
      break;
    default:
      throw new Error(`Invalid goal: ${goal}. Must be one of: lose_weight, gain_muscle, maintain, recomposition`);
  }

  const calories = Math.round(tdee * multiplier);
  const deficitOrSurplus = calories - tdee;

  return {
    calories,
    deficit_or_surplus: deficitOrSurplus,
    description
  };
}
```

### calculateNavyBodyFat — Porcentaje de Grasa Corporal (Método Navy)

```javascript
/**
 * Calculates body fat percentage using the U.S. Navy method.
 * @param {'male'|'female'} gender
 * @param {number} waistCm - Waist circumference in cm (at navel for men, narrowest point for women)
 * @param {number} neckCm - Neck circumference in cm
 * @param {number} heightCm - Height in cm
 * @param {number} [hipCm] - Hip circumference in cm (required for women)
 * @returns {{ value: number, category: string, description: string }}
 */
function calculateNavyBodyFat(gender, waistCm, neckCm, heightCm, hipCm) {
  if (gender === 'female' && !hipCm) {
    throw new Error('Hip circumference is required for women');
  }

  let bodyFat;

  if (gender === 'male') {
    bodyFat = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    bodyFat = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.22100 * Math.log10(heightCm)) - 450;
  }

  const rounded = Math.round(bodyFat * 10) / 10;

  let category, description;

  if (gender === 'male') {
    if (bodyFat < 6) { category = 'essential'; description = 'Grasa esencial (muy bajo)'; }
    else if (bodyFat < 14) { category = 'athletic'; description = 'Atlético'; }
    else if (bodyFat < 18) { category = 'fitness'; description = 'Fitness'; }
    else if (bodyFat < 25) { category = 'average'; description = 'Promedio'; }
    else { category = 'above_average'; description = 'Por encima del promedio'; }
  } else {
    if (bodyFat < 14) { category = 'essential'; description = 'Grasa esencial (muy bajo)'; }
    else if (bodyFat < 21) { category = 'athletic'; description = 'Atlético'; }
    else if (bodyFat < 25) { category = 'fitness'; description = 'Fitness'; }
    else if (bodyFat < 32) { category = 'average'; description = 'Promedio'; }
    else { category = 'above_average'; description = 'Por encima del promedio'; }
  }

  return { value: rounded, category, description };
}
```

### calculateProgressPercentage — Porcentaje de Progreso hacia la Meta

```javascript
/**
 * Calculates progress percentage toward a goal.
 * Works for both weight loss (start > target) and weight gain (start < target).
 * @param {number} startValue - Starting value (e.g., initial weight)
 * @param {number} currentValue - Current value
 * @param {number} targetValue - Target value
 * @returns {{ percentage: number, remaining: number, direction: string }}
 */
function calculateProgressPercentage(startValue, currentValue, targetValue) {
  const totalChange = Math.abs(targetValue - startValue);

  if (totalChange === 0) {
    return { percentage: 100, remaining: 0, direction: 'maintain' };
  }

  const currentChange = Math.abs(currentValue - startValue);
  const isCorrectDirection = (targetValue < startValue)
    ? (currentValue <= startValue)  // losing
    : (currentValue >= startValue); // gaining

  let percentage;
  if (!isCorrectDirection) {
    // Moving in the wrong direction
    percentage = -Math.round((currentChange / totalChange) * 100);
  } else {
    percentage = Math.min(100, Math.round((currentChange / totalChange) * 100));
  }

  const remaining = Math.round(Math.abs(targetValue - currentValue) * 10) / 10;
  const direction = targetValue < startValue ? 'losing' : targetValue > startValue ? 'gaining' : 'maintain';

  return { percentage, remaining, direction };
}
```

### projectGoalDate — Proyección de Fecha de Meta

```javascript
/**
 * Projects the date when the user will reach their goal weight,
 * based on their current rate of change.
 * @param {number} currentWeight - Current weight in kg
 * @param {number} targetWeight - Target weight in kg
 * @param {number} weeklyRateKg - Average weekly rate of change in kg (positive = losing, negative = gaining)
 * @returns {{ estimatedWeeks: number, estimatedDate: string, isRealistic: boolean, message: string }}
 */
function projectGoalDate(currentWeight, targetWeight, weeklyRateKg) {
  const diff = Math.abs(currentWeight - targetWeight);

  if (diff < 0.5) {
    return {
      estimatedWeeks: 0,
      estimatedDate: new Date().toISOString().split('T')[0],
      isRealistic: true,
      message: 'Ya estás muy cerca de tu meta. ¡Prácticamente la alcanzaste!'
    };
  }

  if (Math.abs(weeklyRateKg) < 0.05) {
    return {
      estimatedWeeks: -1,
      estimatedDate: null,
      isRealistic: false,
      message: 'Tu ritmo actual es muy lento para hacer una proyección confiable. Puede que necesitemos ajustar tu plan.'
    };
  }

  const weeksNeeded = Math.ceil(diff / Math.abs(weeklyRateKg));
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + (weeksNeeded * 7));

  const isRealistic = weeksNeeded <= 52; // Within 1 year
  const dateStr = estimatedDate.toISOString().split('T')[0];

  let message;
  if (weeksNeeded <= 4) {
    message = `¡Estás muy cerca! A tu ritmo actual, alcanzarías tu meta en aproximadamente ${weeksNeeded} semanas (${dateStr}).`;
  } else if (weeksNeeded <= 12) {
    message = `A tu ritmo actual de ${Math.abs(weeklyRateKg).toFixed(1)} kg/semana, alcanzarías tu meta en aproximadamente ${weeksNeeded} semanas (${dateStr}). ¡Vas muy bien!`;
  } else if (weeksNeeded <= 26) {
    message = `A tu ritmo actual, la proyección es de ${weeksNeeded} semanas (${dateStr}). Es un camino largo pero sostenible. Recuerda: los cambios duraderos toman tiempo.`;
  } else if (isRealistic) {
    message = `La proyección indica ${weeksNeeded} semanas (${dateStr}). Es un objetivo ambicioso. Recuerda que lo importante es construir hábitos sostenibles, no la velocidad.`;
  } else {
    message = `La proyección supera 1 año. Te sugiero que fijemos metas intermedias más alcanzables para mantener la motivación.`;
  }

  return { estimatedWeeks: weeksNeeded, estimatedDate: dateStr, isRealistic, message };
}
```

### detectPlateau — Detección de Meseta

```javascript
/**
 * Detects if the user is in a weight plateau.
 * A plateau is defined as less than 0.5 kg total change over 3+ weeks.
 * @param {Array<{weight_kg: number, logged_at: string}>} weightLogs - Weight log entries, ordered by date DESC
 * @returns {{ isPlateau: boolean, weeksDuration: number, avgWeight: number, message: string }}
 */
function detectPlateau(weightLogs) {
  if (weightLogs.length < 3) {
    return {
      isPlateau: false,
      weeksDuration: 0,
      avgWeight: 0,
      message: 'No hay suficientes datos aún para detectar una meseta. Necesitamos al menos 3 registros de peso.'
    };
  }

  // Get logs from last 3 weeks
  const threeWeeksAgo = new Date();
  threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

  const recentLogs = weightLogs.filter(log => new Date(log.logged_at) >= threeWeeksAgo);

  if (recentLogs.length < 3) {
    return {
      isPlateau: false,
      weeksDuration: 0,
      avgWeight: 0,
      message: 'No hay suficientes registros en las últimas 3 semanas. Intenta pesarte al menos una vez por semana.'
    };
  }

  const weights = recentLogs.map(log => log.weight_kg);
  const maxWeight = Math.max(...weights);
  const minWeight = Math.min(...weights);
  const totalVariation = maxWeight - minWeight;
  const avgWeight = Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10;

  // Calculate duration
  const firstDate = new Date(recentLogs[recentLogs.length - 1].logged_at);
  const lastDate = new Date(recentLogs[0].logged_at);
  const weeksDuration = Math.round((lastDate - firstDate) / (7 * 24 * 60 * 60 * 1000));

  const isPlateau = totalVariation < 0.5 && weeksDuration >= 2;

  let message;
  if (isPlateau) {
    message = `Parece que estás en una meseta: tu peso se ha mantenido alrededor de ${avgWeight} kg durante las últimas ${weeksDuration} semanas. Esto es completamente normal y le pasa a todos. Es momento de hacer algunos ajustes inteligentes.`;
  } else {
    message = `Tu peso ha variado ${totalVariation.toFixed(1)} kg en las últimas semanas. No parece una meseta — hay movimiento.`;
  }

  return { isPlateau, weeksDuration, avgWeight, message };
}
```

### calculateWeeklyRate — Ritmo Semanal Promedio

```javascript
/**
 * Calculates the average weekly rate of weight change.
 * @param {Array<{weight_kg: number, logged_at: string}>} weightLogs - Ordered by date DESC
 * @returns {{ rateKgPerWeek: number, direction: string, isSafe: boolean, message: string }}
 */
function calculateWeeklyRate(weightLogs) {
  if (weightLogs.length < 2) {
    return {
      rateKgPerWeek: 0,
      direction: 'unknown',
      isSafe: true,
      message: 'Necesitamos al menos 2 registros de peso para calcular tu ritmo.'
    };
  }

  // Use first (most recent) and last entries
  const mostRecent = weightLogs[0];
  const oldest = weightLogs[weightLogs.length - 1];

  const weightDiff = oldest.weight_kg - mostRecent.weight_kg; // Positive = losing weight
  const daysDiff = (new Date(mostRecent.logged_at) - new Date(oldest.logged_at)) / (24 * 60 * 60 * 1000);

  if (daysDiff < 7) {
    return {
      rateKgPerWeek: 0,
      direction: 'unknown',
      isSafe: true,
      message: 'Necesitamos datos de al menos 1 semana para un cálculo confiable.'
    };
  }

  const weeksDiff = daysDiff / 7;
  const ratePerWeek = Math.round((weightDiff / weeksDiff) * 100) / 100;

  let direction;
  if (Math.abs(ratePerWeek) < 0.1) {
    direction = 'stable';
  } else if (ratePerWeek > 0) {
    direction = 'losing';
  } else {
    direction = 'gaining';
  }

  // Safety check
  const absRate = Math.abs(ratePerWeek);
  let isSafe = true;
  let message;

  if (direction === 'losing') {
    if (absRate > 1.0) {
      isSafe = false;
      message = `Estás perdiendo ${absRate.toFixed(1)} kg por semana, lo cual es bastante rápido. Un ritmo de 0.5-0.75 kg/semana es más sostenible y te ayuda a preservar masa muscular. Considera aumentar ligeramente las calorías.`;
    } else if (absRate >= 0.5) {
      message = `Estás perdiendo ${absRate.toFixed(1)} kg por semana. Es un ritmo excelente y sostenible. ¡Sigue así!`;
    } else if (absRate >= 0.2) {
      message = `Estás perdiendo ${absRate.toFixed(1)} kg por semana. Es un ritmo moderado pero constante. Si quieres acelerar un poco, podemos ajustar tu plan.`;
    } else {
      message = `Estás perdiendo ${absRate.toFixed(1)} kg por semana. Es un ritmo lento — puede que necesitemos ajustar tu déficit calórico.`;
    }
  } else if (direction === 'gaining') {
    if (absRate > 0.5) {
      isSafe = false;
      message = `Estás ganando ${absRate.toFixed(1)} kg por semana. Para ganancia muscular limpia, 0.2-0.4 kg/semana es ideal. Un ritmo más rápido probablemente incluya grasa innecesaria.`;
    } else if (absRate >= 0.2) {
      message = `Estás ganando ${absRate.toFixed(1)} kg por semana. Es un ritmo ideal para ganancia muscular limpia.`;
    } else {
      message = `Estás ganando ${absRate.toFixed(1)} kg por semana. Si tu objetivo es ganar músculo, podríamos aumentar ligeramente las calorías.`;
    }
  } else {
    message = `Tu peso se ha mantenido estable (${absRate.toFixed(1)} kg/semana de variación). Si tu objetivo es mantenimiento, ¡perfecto! Si buscas un cambio, necesitamos ajustar tu plan.`;
  }

  return { rateKgPerWeek: ratePerWeek, direction, isSafe, message };
}
```

---

## Rangos de Referencia por Indicador

### IMC Saludable

| Rango | Clasificación | Acción del agente |
|-------|-------------|-------------------|
| < 18.5 | Bajo peso | Recomendar consultar médico antes de iniciar plan. No crear déficit calórico. |
| 18.5 – 24.9 | Normal | Objetivo de mantenimiento o recomposición. |
| 25.0 – 29.9 | Sobrepeso | Déficit moderado (20%). Sin alarma. |
| 30.0 – 34.9 | Obesidad I | Déficit moderado. Recomendar supervisión médica. |
| 35.0+ | Obesidad II/III | Insistir en supervisión médica. Enfoque en cambios graduales. |

### Ritmo Seguro de Pérdida de Peso

| Ritmo | Evaluación |
|-------|-----------|
| 0.2 – 0.5 kg/semana | Lento pero sostenible. Ideal para recomposición. |
| 0.5 – 0.75 kg/semana | Óptimo. Maximiza pérdida de grasa, minimiza pérdida muscular. |
| 0.75 – 1.0 kg/semana | Agresivo pero aceptable para personas con sobrepeso significativo. |
| > 1.0 kg/semana | Demasiado rápido. Riesgo de pérdida muscular, deficiencias, efecto rebote. |

### Ritmo Seguro de Ganancia de Peso

| Ritmo | Evaluación |
|-------|-----------|
| 0.1 – 0.2 kg/semana | Lean bulk. Mínima ganancia de grasa. |
| 0.2 – 0.4 kg/semana | Óptimo para principiantes. Buen balance músculo/grasa. |
| 0.4 – 0.5 kg/semana | Aceptable para principiantes con buena genética. |
| > 0.5 kg/semana | Probablemente ganando más grasa que músculo. Reducir superávit. |

---

## Cuándo y Cómo Comunicar una Meseta

### Reglas de Decisión

```javascript
/**
 * Decides what action to take based on plateau detection and context.
 * @param {boolean} isPlateau
 * @param {number} weeksDuration - Weeks in plateau
 * @param {string} goal - User's goal
 * @param {number} currentCalories - Current caloric target
 * @param {number} tdee - Current TDEE
 * @returns {{ action: string, suggestion: string }}
 */
function decidePlateauAction(isPlateau, weeksDuration, goal, currentCalories, tdee) {
  if (!isPlateau) {
    return { action: 'none', suggestion: '' };
  }

  if (goal === 'lose_weight') {
    if (weeksDuration <= 2) {
      return {
        action: 'monitor',
        suggestion: 'Aún es pronto. Vamos a darle una semana más antes de hacer cambios.'
      };
    }

    // Check if deficit is already aggressive
    const deficitPct = ((tdee - currentCalories) / tdee) * 100;

    if (deficitPct >= 25) {
      return {
        action: 'refeed',
        suggestion: 'Tu déficit ya es agresivo. Te sugiero 2 días comiendo a nivel de mantenimiento esta semana para restablecer tus hormonas. Luego retomamos.'
      };
    }

    if (weeksDuration <= 3) {
      return {
        action: 'add_activity',
        suggestion: 'Vamos a agregar 2 sesiones de caminata de 30 minutos esta semana en lugar de reducir calorías. A veces un poco más de movimiento rompe la meseta.'
      };
    }

    return {
      action: 'recalculate',
      suggestion: 'Han pasado más de 3 semanas. Vamos a recalcular tu TDEE con tu peso actual y ajustar las calorías. Tu cuerpo se adaptó al nivel actual.'
    };
  }

  if (goal === 'gain_muscle') {
    return {
      action: 'increase_surplus',
      suggestion: 'Si tu peso no sube, probablemente necesitas más calorías. Vamos a agregar 150-200 kcal a tu plan, principalmente en carbohidratos alrededor del entrenamiento.'
    };
  }

  return {
    action: 'review',
    suggestion: 'Vamos a revisar tu plan juntos para identificar qué podemos ajustar.'
  };
}
```

---

## Cuándo Ajustar Calorías y Macros

### Reglas de Decisión para Ajustes

| Condición | Ajuste |
|-----------|--------|
| Perdió 5+ kg desde el último cálculo | Recalcular TDEE con peso actual (el TDEE baja ~50 kcal por cada 5 kg perdidos) |
| Meseta de 3+ semanas con buena adherencia | Reducir 100-150 kcal o agregar cardio |
| Ritmo de pérdida > 1 kg/semana | Subir 100-200 kcal para frenar pérdida excesiva |
| Ritmo de ganancia > 0.5 kg/semana | Bajar 100-200 kcal para reducir ganancia de grasa |
| Cambio de nivel de actividad | Recalcular TDEE con nuevo factor de actividad |
| Cambio de objetivo | Recalcular todo: calorías, macros y plan |
| Usuario reporta hambre extrema constante | Subir 100-150 kcal, aumentar proteína y fibra |
| Usuario reporta falta de energía en entrenamientos | Aumentar carbohidratos pre-entrenamiento (+20-30g) |

### Ejemplo de Recálculo Post Pérdida de Peso

```javascript
/**
 * Recalculates targets after significant weight change.
 * @param {object} profile - User profile
 * @param {number} newWeightKg - New current weight
 * @returns {object} Updated targets
 */
function recalculateTargets(profile, newWeightKg) {
  const bmr = calculateBMR_MifflinStJeor(
    newWeightKg,
    profile.height_cm,
    profile.age,
    profile.gender
  );

  const tdee = calculateTDEE(bmr, profile.activity_level);
  const { calories } = calculateCaloricTarget(tdee, profile.goal);
  const macros = calculateMacros(calories, newWeightKg, profile.goal);

  return {
    weight_kg: newWeightKg,
    bmr,
    tdee,
    caloric_target: calories,
    protein_target_g: macros.protein_g,
    carb_target_g: macros.carb_g,
    fat_target_g: macros.fat_g
  };
}

// Helper function (same as in nutrition.md)
function calculateMacros(caloricTarget, weightKg, goal) {
  let proteinPerKg, fatPerKg;
  switch (goal) {
    case 'lose_weight': proteinPerKg = 2.0; fatPerKg = 0.9; break;
    case 'gain_muscle': proteinPerKg = 1.8; fatPerKg = 1.0; break;
    case 'maintain': proteinPerKg = 1.6; fatPerKg = 1.0; break;
    case 'recomposition': proteinPerKg = 2.2; fatPerKg = 0.9; break;
  }
  const proteinG = Math.round(proteinPerKg * weightKg);
  const fatG = Math.round(fatPerKg * weightKg);
  const carbG = Math.round((caloricTarget - (proteinG * 4) - (fatG * 9)) / 4);
  return { protein_g: proteinG, carb_g: carbG, fat_g: fatG };
}
```
