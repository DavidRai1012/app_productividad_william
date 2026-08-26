// Registro de ESPECIES de flores del jardín.
//
// Cada especie tiene 10 etapas de crecimiento; la etapa visible se elige según el
// % de progreso de la meta (objetivos completados). Hay dos tipos:
//  - Especies "completas": una carpeta con sus 10 etapas propias (como /flores).
//  - Especies "raras": crecen con las etapas genéricas (SVG de /growth_stages) y
//    FLORECEN con su imagen única de /flowers. Se desbloquean con Semillas Raras
//    al cosechar bloques (el backend las registra en unlocked_images por imagePath).
//
// PARA AÑADIR UNA ESPECIE NUEVA: crea una carpeta en frontend/public con sus 10
// etapas y añade una entrada aquí con sus rutas. Nada más.

const GENERIC_STAGES = Array.from({ length: 9 }, (_, i) => `/growth_stages/stage_${i}.svg`);

const rareSpecies = (n, name) => {
  const num = String(n).padStart(2, '0');
  const bloom = `/flowers/flower_${num}.png`;
  return {
    id: `flor_${num}`,
    name,
    // Coincide con el imagePath que guarda el backend al desbloquear (unlocked_images)
    unlockPath: bloom,
    alwaysUnlocked: n === 1, // se empieza con la clásica + esta
    stages: [...GENERIC_STAGES, bloom],
  };
};

export const SPECIES = [
  {
    id: 'jardin_clasico',
    name: 'Flor del Huerto',
    alwaysUnlocked: true,
    stages: [
      '/flores/paso_1.png', '/flores/paso_2.png', '/flores/paso_3.jpg',
      '/flores/paso_4.jpg', '/flores/paso_5.jpg', '/flores/paso_6.jpg',
      '/flores/paso_7.jpg', '/flores/paso_8.jpg', '/flores/paso_9.jpg',
      '/flores/paso_10.jpg',
    ],
  },
  rareSpecies(1, 'Amapola'),
  rareSpecies(2, 'Lavanda'),
  rareSpecies(3, 'Tulipán'),
  rareSpecies(4, 'Girasol'),
  rareSpecies(5, 'Orquídea'),
  rareSpecies(6, 'Dalia'),
  rareSpecies(7, 'Cerezo'),
  rareSpecies(8, 'Loto'),
  rareSpecies(9, 'Jazmín'),
  rareSpecies(10, 'Rosa Dorada'),
];

export const DEFAULT_SPECIES_ID = 'jardin_clasico';

export function getSpecies(id) {
  return SPECIES.find(s => s.id === id) || SPECIES[0];
}

// Especie desbloqueada por una ruta de imagen (la que devuelve harvest en imagePath).
export function speciesByUnlockPath(imagePath) {
  return SPECIES.find(s => s.unlockPath === imagePath) || null;
}

// unlockedPaths: array de imagePath de GET /api/unlocked-images.
export function isSpeciesUnlocked(species, unlockedPaths) {
  if (species.alwaysUnlocked) return true;
  return Array.isArray(unlockedPaths) && unlockedPaths.includes(species.unlockPath);
}

// Etapa según % de progreso: 0% -> etapa 0, 100% -> última etapa (florecida).
export function stageForProgress(species, progress) {
  const p = Math.max(0, Math.min(100, Number(progress) || 0));
  const idx = p >= 100
    ? species.stages.length - 1
    : Math.min(species.stages.length - 2, Math.floor((p / 100) * (species.stages.length - 1)));
  return species.stages[idx];
}
