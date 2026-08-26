// Corrimiento en cascada compartido entre Modo Campo (day = fecha 'YYYY-MM-DD')
// y Modo Taller (day = día de semana 0-6). Reglas:
//
// - Al insertar un bloque, los que estorban se corren hacia abajo conservando duración.
// - Los bloques que se SOLAPAN entre sí forman un grupo fusionado y se mueven como
//   UNA unidad rígida (la cascada nunca rompe una fusión existente).
// - Un grupo cuyo fin supera la medianoche (minuto 1440) pasa ENTERO al día siguiente
//   (nextDay), conservando sus distancias internas y el orden cronológico, y allí
//   vuelve a cascar con lo que haya (recursivo, profundidad máx 7).
// - Los bloques/grupos que no colisionan con la cadena insertada NO se tocan,
//   aunque tuvieran solapes preexistentes aguas abajo.
//
// Convención de horas: minutos 0..1440; endTime '00:00' significa medianoche (1440).

export const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

export const toHHMM = (min) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const endMinOf = (end) => (end === '00:00' ? 1440 : toMin(end));

const MAX_DEPTH = 7;

// Agrupa items de UN día (ordenados por startMin) en grupos de solape transitivo.
function buildClusters(dayItems) {
  const clusters = [];
  let cur = null;
  for (const t of dayItems) {
    if (cur && t.startMin < cur.maxEnd) {
      cur.members.push(t);
      cur.maxEnd = Math.max(cur.maxEnd, t.endMin);
    } else {
      cur = { members: [t], minStart: t.startMin, maxEnd: t.endMin };
      clusters.push(cur);
    }
  }
  return clusters;
}

function cascadeEnvelope(state, day, insStart, insEnd, changed, nextDay, depth, excludeIds) {
  const dayItems = state
    .filter(t => t.day === day && !excludeIds.has(t.id))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const clusters = buildClusters(dayItems);
  const overflowed = [];
  // El puntero solo avanza con el insertado y los grupos MOVIDOS.
  let pointer = insEnd;

  for (const c of clusters) {
    // Grupos que terminan antes o exactamente en el inicio del insertado no estorban.
    if (c.maxEnd <= insStart) continue;
    if (c.minStart < pointer) {
      const delta = pointer - c.minStart;
      c.members.forEach(m => {
        m.startMin += delta;
        m.endMin += delta;
        changed.add(m.id);
      });
      pointer = c.maxEnd + delta;
      if (pointer > 1440) overflowed.push(c);
    }
  }

  let nextStart = 0;
  for (const c of overflowed) {
    const minS = Math.min(...c.members.map(m => m.startMin));
    const maxE = Math.max(...c.members.map(m => m.endMin));
    const span = maxE - minS;
    if (depth + 1 >= MAX_DEPTH) {
      // Ciclo patológico (7+ días consecutivos llenos): en vez de seguir saltando
      // de día, retraer el grupo para que termine exactamente a medianoche. En ese
      // escenario degenerado puede quedar solapado con lo que ya ocupe el final del
      // día — se acepta: es preferible a un corrimiento infinito, y el solape se ve
      // lado a lado por lanes.
      const shift = 1440 - maxE;
      c.members.forEach(m => { m.startMin += shift; m.endMin += shift; });
      continue;
    }
    const nd = nextDay(day);
    const delta = nextStart - minS;
    c.members.forEach(m => {
      m.day = nd;
      m.startMin += delta;
      m.endMin += delta;
      changed.add(m.id);
    });
    // El grupo movido actúa como "insertado" en el día siguiente: se excluye a sí
    // mismo de esa cascada para no empujarse a sí mismo.
    const movedIds = new Set(c.members.map(m => m.id));
    cascadeEnvelope(state, nd, nextStart, nextStart + span, changed, nextDay, depth + 1, movedIds);
    nextStart = nextStart + span;
  }
}

// items: [{id, day, startMin, endMin}, ...] — el estado actual SIN normalizar.
// inserted: {id?, day, startMin, endMin} — el bloque ya colocado en su posición final.
// nextDay: (day) => día siguiente (p.ej. d => (d + 1) % 7, o fecha + 1 día).
// Devuelve SOLO los items que cambiaron, con sus nuevos {id, day, startMin, endMin}.
export function computeCascade(items, inserted, nextDay) {
  const state = items
    .filter(t => t.id !== inserted.id)
    .map(t => {
      const startMin = t.startMin;
      let endMin = t.endMin;
      // Dato legacy que cruzaba medianoche (ej. 22:00-02:00): tratarlo como fin de día.
      // OJO: solo con '<' — un bloque de duración cero (start === end) NO debe
      // inflarse a 24h (quedaría como obstáculo de día completo).
      if (endMin < startMin) endMin = 1440;
      return { id: t.id, day: t.day, startMin, endMin };
    });
  const changed = new Set();
  cascadeEnvelope(state, inserted.day, inserted.startMin, inserted.endMin, changed, nextDay, 0, new Set());
  return state.filter(t => changed.has(t.id));
}

// Si un bloque no cabe desde el punto del drop, se retrasa el inicio para que termine
// exactamente a medianoche SIN perder duración (pensado para bloques largos al final
// del día, como el sueño).
export function fitInDay(startMin, duration) {
  // Duración inválida (cero, negativa o no numérica) cae al default de 60 min;
  // por arriba se capa a un día completo.
  const safe = Number(duration) > 0 ? Number(duration) : 60;
  const dur = Math.min(safe, 1440);
  const start = startMin + dur > 1440 ? Math.max(0, 1440 - dur) : startMin;
  return { startMin: start, endMin: start + dur };
}

// Carriles para renderizar bloques fusionados lado a lado (estilo calendario):
// items de UN MISMO día [{id, startMin, endMin}] -> Map(id -> {lane, lanes}).
// Los bloques que se solapan comparten el ancho de la columna en partes iguales.
export function computeLanes(items) {
  const result = new Map();
  const sorted = items
    .map(t => {
      const startMin = t.startMin;
      let endMin = t.endMin;
      // Mismo criterio que computeCascade: solo '<' (duración cero no se infla).
      if (endMin < startMin) endMin = 1440;
      return { id: t.id, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  for (const cluster of buildClusters(sorted)) {
    const laneEnds = []; // fin del último bloque de cada carril
    const assigned = [];
    for (const m of cluster.members) {
      let lane = laneEnds.findIndex(end => end <= m.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(m.endMin);
      } else {
        laneEnds[lane] = m.endMin;
      }
      assigned.push({ id: m.id, lane });
    }
    assigned.forEach(a => result.set(a.id, { lane: a.lane, lanes: laneEnds.length }));
  }
  return result;
}
