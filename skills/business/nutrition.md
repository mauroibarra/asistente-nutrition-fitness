# Skill: Conocimiento Nutricional — FitAI Assistant

## Fórmulas Fundamentales

### Índice de Masa Corporal (IMC)

```
IMC = peso (kg) / estatura (m)²
```

```javascript
function calculateBMI(weightKg, heightM) {
  return weightKg / (heightM * heightM);
}
```

| Clasificación | IMC |
|--------------|-----|
| Bajo peso | < 18.5 |
| Normal | 18.5 – 24.9 |
| Sobrepeso | 25.0 – 29.9 |
| Obesidad grado I | 30.0 – 34.9 |
| Obesidad grado II | 35.0 – 39.9 |
| Obesidad grado III | ≥ 40.0 |

### Tasa Metabólica Basal (TMB) — Mifflin-St Jeor

La fórmula más precisa para estimar el gasto calórico en reposo:

```
Hombre: TMB = (10 × peso en kg) + (6.25 × estatura en cm) - (5 × edad en años) + 5
Mujer:  TMB = (10 × peso en kg) + (6.25 × estatura en cm) - (5 × edad en años) - 161
```

```javascript
function calculateBMR(weightKg, heightCm, ageYears, gender) {
  const base = (10 * weightKg) + (6.25 * heightCm) - (5 * ageYears);
  return gender === 'male' ? base + 5 : base - 161;
}
```

### Gasto Energético Total Diario (TDEE)

```
TDEE = TMB × Factor de Actividad
```

### Tabla de Factores de Actividad

| Nivel | Factor | Descripción |
|-------|--------|-------------|
| Sedentario | 1.2 | Trabajo de escritorio, sin ejercicio |
| Ligeramente activo | 1.375 | Ejercicio ligero 1-3 días/semana |
| Moderadamente activo | 1.55 | Ejercicio moderado 3-5 días/semana |
| Muy activo | 1.725 | Ejercicio intenso 6-7 días/semana |
| Extra activo | 1.9 | Atleta o trabajo físico muy demandante |

```javascript
const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9
};

function calculateTDEE(bmr, activityLevel) {
  return bmr * ACTIVITY_FACTORS[activityLevel];
}
```

### Déficit/Superávit Calórico según Objetivo

```javascript
function calculateCaloricTarget(tdee, goal) {
  switch (goal) {
    case 'lose_weight':
      // Deficit of 20-25% (moderate, sustainable)
      return Math.round(tdee * 0.80);
    case 'gain_muscle':
      // Surplus of 10-15%
      return Math.round(tdee * 1.10);
    case 'maintain':
      return Math.round(tdee);
    case 'recomposition':
      // Slight deficit of 5-10%
      return Math.round(tdee * 0.95);
    default:
      return Math.round(tdee);
  }
}
```

**Rangos seguros de déficit/superávit**:
- Pérdida de peso: máximo 500-750 kcal de déficit diario (equivale a ~0.5-0.75 kg/semana)
- Ganancia muscular: 200-400 kcal de superávit diario (equivale a ~0.2-0.4 kg/semana)
- Nunca bajar de 1200 kcal/día para mujeres ni 1500 kcal/día para hombres

---

## Distribución de Macronutrientes por Objetivo

### Pérdida de Grasa

| Macronutriente | Rango por kg de peso corporal | % de calorías totales |
|---------------|-------------------------------|----------------------|
| Proteína | 1.8 – 2.2 g/kg | 30-35% |
| Grasa | 0.8 – 1.0 g/kg | 25-30% |
| Carbohidratos | Resto de calorías | 35-45% |

Prioridad: proteína alta para preservar masa muscular durante el déficit.

### Ganancia Muscular

| Macronutriente | Rango por kg de peso corporal | % de calorías totales |
|---------------|-------------------------------|----------------------|
| Proteína | 1.6 – 2.0 g/kg | 25-30% |
| Grasa | 0.8 – 1.2 g/kg | 20-30% |
| Carbohidratos | Resto de calorías | 40-55% |

Prioridad: carbohidratos altos para energía en entrenamientos.

### Mantenimiento

| Macronutriente | Rango por kg de peso corporal | % de calorías totales |
|---------------|-------------------------------|----------------------|
| Proteína | 1.4 – 1.8 g/kg | 20-25% |
| Grasa | 0.8 – 1.2 g/kg | 25-35% |
| Carbohidratos | Resto de calorías | 40-55% |

### Recomposición Corporal

| Macronutriente | Rango por kg de peso corporal | % de calorías totales |
|---------------|-------------------------------|----------------------|
| Proteína | 2.0 – 2.4 g/kg | 30-35% |
| Grasa | 0.8 – 1.0 g/kg | 25-30% |
| Carbohidratos | Resto de calorías | 35-45% |

Prioridad: proteína máxima para construir músculo mientras se pierde grasa.

```javascript
function calculateMacros(caloricTarget, weightKg, goal) {
  let proteinPerKg, fatPerKg;

  switch (goal) {
    case 'lose_weight':
      proteinPerKg = 2.0;
      fatPerKg = 0.9;
      break;
    case 'gain_muscle':
      proteinPerKg = 1.8;
      fatPerKg = 1.0;
      break;
    case 'maintain':
      proteinPerKg = 1.6;
      fatPerKg = 1.0;
      break;
    case 'recomposition':
      proteinPerKg = 2.2;
      fatPerKg = 0.9;
      break;
  }

  const proteinG = Math.round(proteinPerKg * weightKg);
  const fatG = Math.round(fatPerKg * weightKg);
  const proteinCal = proteinG * 4;
  const fatCal = fatG * 9;
  const carbCal = caloricTarget - proteinCal - fatCal;
  const carbG = Math.round(carbCal / 4);

  return { protein_g: proteinG, carb_g: carbG, fat_g: fatG };
}
```

---

## Macros de Referencia de Alimentos Comunes

### Proteínas

| Alimento | Porción | Calorías | Proteína (g) | Carbs (g) | Grasa (g) |
|----------|---------|----------|-------------|-----------|-----------|
| Pechuga de pollo (cocida) | 100g | 165 | 31 | 0 | 3.6 |
| Huevo entero | 1 pieza (50g) | 72 | 6.3 | 0.4 | 4.8 |
| Clara de huevo | 1 pieza (33g) | 17 | 3.6 | 0.2 | 0.1 |
| Salmón (cocido) | 100g | 208 | 20 | 0 | 13 |
| Tilapia (cocida) | 100g | 128 | 26 | 0 | 2.7 |
| Atún en agua | 100g | 116 | 26 | 0 | 0.8 |
| Carne molida (90/10) | 100g | 176 | 20 | 0 | 10 |
| Queso panela | 100g | 206 | 18 | 3 | 14 |
| Queso cottage | 100g | 98 | 11 | 3.4 | 4.3 |
| Yogur griego natural | 100g | 59 | 10 | 3.6 | 0.7 |
| Proteína whey | 1 scoop (30g) | 120 | 24 | 3 | 1.5 |
| Jamón de pavo | 100g | 104 | 17 | 3.5 | 2.5 |

### Carbohidratos

| Alimento | Porción | Calorías | Proteína (g) | Carbs (g) | Grasa (g) |
|----------|---------|----------|-------------|-----------|-----------|
| Arroz integral (cocido) | 100g | 123 | 2.7 | 26 | 1.0 |
| Arroz blanco (cocido) | 100g | 130 | 2.7 | 28 | 0.3 |
| Tortilla de maíz | 1 pieza (30g) | 63 | 1.5 | 13 | 0.7 |
| Tortilla de harina integral | 1 pieza (50g) | 130 | 4 | 22 | 3 |
| Avena en hojuelas | 100g (cruda) | 389 | 17 | 66 | 7 |
| Camote (cocido) | 100g | 90 | 2 | 21 | 0.1 |
| Papa (cocida) | 100g | 77 | 2 | 17 | 0.1 |
| Pan integral | 1 rebanada (35g) | 81 | 4 | 14 | 1.1 |
| Frijoles negros (cocidos) | 100g | 132 | 8.9 | 24 | 0.5 |
| Plátano | 1 pieza (100g) | 89 | 1.1 | 23 | 0.3 |

### Grasas Saludables

| Alimento | Porción | Calorías | Proteína (g) | Carbs (g) | Grasa (g) |
|----------|---------|----------|-------------|-----------|-----------|
| Aguacate | 100g | 160 | 2 | 9 | 15 |
| Almendras | 100g | 579 | 21 | 22 | 50 |
| Nueces | 100g | 654 | 15 | 14 | 65 |
| Crema de cacahuate natural | 1 cda (16g) | 96 | 4 | 3.5 | 8 |
| Aceite de oliva | 1 cda (14g) | 119 | 0 | 0 | 14 |

### Verduras (bajo aporte calórico)

| Alimento | Porción | Calorías | Proteína (g) | Carbs (g) | Grasa (g) |
|----------|---------|----------|-------------|-----------|-----------|
| Brócoli | 100g | 34 | 2.8 | 7 | 0.4 |
| Espinacas | 100g | 23 | 2.9 | 3.6 | 0.4 |
| Nopal | 100g | 16 | 1.3 | 3.3 | 0.1 |
| Pepino | 100g | 15 | 0.7 | 3.6 | 0.1 |
| Tomate | 100g | 18 | 0.9 | 3.9 | 0.2 |
| Lechuga | 100g | 15 | 1.4 | 2.9 | 0.2 |
| Champiñones | 100g | 22 | 3.1 | 3.3 | 0.3 |
| Calabaza | 100g | 16 | 1.2 | 3.4 | 0.2 |
| Zanahoria | 100g | 41 | 0.9 | 10 | 0.2 |
| Jícama | 100g | 38 | 0.7 | 9 | 0.1 |

---

## Distribución Calórica entre Comidas

### Principios Generales

La distribución calórica depende del número de comidas y del horario del usuario. Los principios base:

1. **Desayuno**: 25-30% de las calorías diarias — romper el ayuno con proteína y carbohidratos complejos
2. **Comida (almuerzo)**: 30-35% — la comida más grande del día, combinación completa de macros
3. **Cena**: 25-30% — moderada, evitar exceso de carbohidratos simples
4. **Colación(es)**: 10-15% — preferir proteína + fibra para saciedad

### Para 3 comidas (sin colación)

| Comida | % Calorías | Enfoque |
|--------|-----------|---------|
| Desayuno | 30% | Proteína + carbohidratos complejos |
| Comida | 40% | Comida completa, todos los macros |
| Cena | 30% | Proteína + verduras, carbohidratos moderados |

### Para 3 comidas + 1 colación

| Comida | % Calorías | Enfoque |
|--------|-----------|---------|
| Desayuno | 25% | Proteína + carbohidratos |
| Comida | 35% | Comida completa |
| Colación | 10% | Proteína + fibra |
| Cena | 30% | Proteína + verduras |

### Para 3 comidas + 2 colaciones

| Comida | % Calorías | Enfoque |
|--------|-----------|---------|
| Desayuno | 25% | Proteína + carbohidratos |
| Colación AM | 10% | Fruta + proteína |
| Comida | 30% | Comida completa |
| Colación PM | 10% | Proteína + grasa saludable |
| Cena | 25% | Proteína + verduras |

### Principio de Timing Nutricional

- **Pre-entrenamiento** (1-2 horas antes): carbohidratos complejos + proteína moderada
- **Post-entrenamiento** (dentro de 2 horas): proteína alta + carbohidratos para recuperación
- **Antes de dormir**: evitar comidas grandes; si hay hambre, proteína de absorción lenta (caseína, cottage)

---

## Restricciones Dietarias

### Vegetariano

**Fuentes de proteína alternativas**:
- Huevos y claras de huevo
- Yogur griego y queso cottage
- Leguminosas (frijoles, lentejas, garbanzos)
- Tofu y tempeh
- Quinoa
- Proteína whey (si consume lácteos)

**Consideraciones**: Combinar leguminosas con cereales para obtener aminoácidos esenciales completos (ej: frijoles con arroz). Suplementar vitamina B12 si no consume huevo ni lácteo con frecuencia.

### Vegano

**Fuentes de proteína alternativas**:
- Tofu, tempeh, edamame
- Leguminosas (frijoles, lentejas, garbanzos, chícharos)
- Quinoa y amaranto
- Proteína de soya o guisante
- Frutos secos y semillas

**Consideraciones**: Suplementar B12 obligatoriamente. Considerar suplemento de hierro, zinc y omega-3 (DHA/EPA de algas). La proteína debe combinarse estratégicamente para completar el perfil de aminoácidos.

### Sin Gluten

**Alimentos a evitar**: Trigo, cebada, centeno, avena (a menos que sea certificada sin gluten), pan, pasta, tortilla de harina.

**Sustituciones**:
- Tortilla de maíz en lugar de harina
- Arroz, quinoa, papa, camote como fuentes de carbohidratos
- Avena certificada sin gluten
- Verificar salsas y aderezos (muchos contienen gluten oculto)

### Sin Lactosa

**Alimentos a evitar**: Leche, queso fresco, crema, yogur regular, helado.

**Sustituciones**:
- Leche deslactosada o vegetal (almendra, soya, avena)
- Yogur deslactosado o de coco
- Quesos maduros (parmesano, manchego) que tienen menos lactosa
- Proteína whey isolate (tiene menos lactosa que el concentrado)

### Alergias Comunes

| Alergia | Alimentos a evitar | Alternativas |
|---------|-------------------|-------------|
| Cacahuate | Cacahuates, crema de cacahuate | Almendras, nueces, semillas de girasol |
| Frutos secos | Almendras, nueces, pistaches | Semillas (girasol, calabaza, chía) |
| Mariscos | Camarón, langosta, cangrejo | Pescado (si no tiene alergia cruzada) |
| Soya | Tofu, tempeh, leche de soya | Otras leguminosas, leche de almendra |
| Huevo | Huevo, productos con huevo | Tofu, chia como sustituto en cocina |

---

## Señales de Alerta que el Agente Debe Detectar

### Restricción Calórica Extrema

**Señales en el texto del usuario**:
- Menciona comer menos de 800-1000 kcal/día
- Expresa deseo de "no comer" o "ayunar muchos días"
- Celebra haber "aguantado sin comer"
- Pide planes de menos de 1200 kcal (mujeres) o 1500 kcal (hombres)

**Respuesta del agente**: Expresar preocupación genuina, explicar riesgos de restricción extrema (pérdida muscular, metabolismo lento, deficiencias nutricionales), ofrecer un déficit moderado y sostenible. Si el patrón persiste, recomendar consultar con un profesional de la salud.

### Patrones de Alimentación Desordenada

**Señales en el texto del usuario**:
- Ciclos de restricción extrema seguidos de atracones
- Uso de laxantes o vómito mencionados como método de control de peso
- Obsesión con "alimentos prohibidos" o "alimentos malos"
- Culpa extrema después de comer
- Conteo obsesivo de cada caloría al punto de ansiedad

**Respuesta del agente**: No juzgar, validar la dificultad que siente el usuario, explicar que el agente no está capacitado para ayudar con trastornos de la conducta alimentaria y recomendar buscar ayuda profesional (psicólogo, nutriólogo clínico).

### Relación Poco Saludable con la Comida

**Señales en el texto del usuario**:
- "Me siento terrible por haber comido eso"
- "Soy un fracaso, no puedo controlarme"
- "Necesito compensar lo que comí"
- "¿Cuánto ejercicio necesito para quemar esta comida?"
- Clasificar alimentos como "buenos" o "malos"

**Respuesta del agente**: Normalizar, explicar que no existen alimentos prohibidos en una dieta equilibrada, que un día no define el progreso, y redirigir hacia una relación sana con la comida. Usar lenguaje de coaching positivo.

### Cuándo Derivar a un Profesional

El agente DEBE recomendar consultar un profesional si:
- El usuario reporta síntomas médicos (mareos, desmayos, dolor persistente)
- Describe patrones de trastorno alimentario (anorexia, bulimia, atracón compulsivo)
- Tiene condiciones crónicas que afectan la nutrición (diabetes, enfermedad renal, tiroides)
- Está embarazada o en período de lactancia
- Toma medicamentos que afectan el metabolismo o apetito
- Es menor de 16 años

**Frase modelo**: "Entiendo tu preocupación y quiero ayudarte. Sin embargo, lo que describes es algo que un profesional de la salud puede atender mucho mejor que yo. Te recomiendo mucho que consultes con un médico o nutriólogo certificado. Mientras tanto, puedo seguir ayudándote con tu plan general de alimentación."
