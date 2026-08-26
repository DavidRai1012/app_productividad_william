import React, { useState, useEffect } from 'react';
import { Trash2, Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '../api';
import { toMin, toHHMM, endMinOf, computeCascade, fitInDay, computeLanes } from '../cascade';

const DAY_LABELS = [
  { d: 1, l: 'Lunes' }, { d: 2, l: 'Martes' }, { d: 3, l: 'Miércoles' },
  { d: 4, l: 'Jueves' }, { d: 5, l: 'Viernes' }, { d: 6, l: 'Sábado' }, { d: 0, l: 'Domingo' }
];

const COLORS = ['#4a7c59', '#d8a45e', '#a35050', '#507fa3', '#8550a3', '#a3508f', '#e67c45', '#45e69e'];

// Alto del tablón: 24 horas x 50px.
const GRID_HEIGHT = 24 * 50;

// Adapta los templates al contrato compartido de computeCascade (day = dayOfWeek 0-6)
// y devuelve los updates listos para PUT /api/schedule-templates/batch.
// inserted: {id?, day, startMin, endMin} del bloque ya colocado en su posición final.
function computeTemplateUpdates(templates, inserted) {
  const items = templates.map(t => ({
    id: t.id,
    day: t.dayOfWeek,
    startMin: toMin(t.startTime),
    endMin: endMinOf(t.endTime)
  }));
  return computeCascade(items, inserted, d => (d + 1) % 7).map(u => ({
    id: u.id,
    dayOfWeek: u.day,
    startTime: toHHMM(u.startMin),
    endTime: u.endMin >= 1440 ? '00:00' : toHHMM(u.endMin)
  }));
}

export default function WorkshopMode({ settings }) {
  const startHour = settings?.startHour ?? 4;
  const timeFormat = settings?.timeFormat || '12h';
  // 'cascade' (default): los bloques que estorban se corren; 'fusion': conviven solapados.
  const collisionMode = settings?.collisionMode || 'cascade';
  const HOURS = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);

  const [schedules, setSchedules] = useState([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState(null);

  const [scheduleName, setScheduleName] = useState('Nuevo Horario');
  const [templates, setTemplates] = useState([]);
  const [presets, setPresets] = useState([]);
  const [flowers, setFlowers] = useState([]);
  const [selectedAltIndex, setSelectedAltIndex] = useState({});

  const [draggedPreset, setDraggedPreset] = useState(null);

  // Modal para Presets
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetForm, setPresetForm] = useState({
    title: '', type: 'work', color: COLORS[0], duration: 120, checklist: []
  });

  useEffect(() => {
    loadSchedules();
    loadPresets();
    loadFlowers();
  }, []);

  useEffect(() => {
    if (selectedScheduleId) {
      const s = schedules.find(x => x.id === selectedScheduleId);
      if (s) setScheduleName(s.name);
      loadTemplates(selectedScheduleId);
    } else {
      setScheduleName('Nuevo Horario');
      setTemplates([]);
    }
  }, [selectedScheduleId, schedules]);

  const loadSchedules = () => {
    apiFetch('/schedules')
      .then(data => { if (Array.isArray(data)) setSchedules(data); })
      .catch(err => console.error('Error cargando horarios:', err));
  };

  const loadPresets = () => {
    apiFetch('/workshop-presets')
      .then(data => {
        if (!Array.isArray(data)) return;
        // El backend ya devuelve checklist parseada y normalizada ({task, done}).
        setPresets(data.map(p => ({
          ...p,
          checklist: Array.isArray(p.checklist) ? p.checklist : []
        })));
      })
      .catch(err => console.error('Error cargando bloques:', err));
  };

  const loadFlowers = () => {
    apiFetch('/flowers')
      .then(data => { if (Array.isArray(data)) setFlowers(data); })
      .catch(err => console.error('Error cargando flores:', err));
  };

  const loadTemplates = (id) => {
    apiFetch(`/schedules/${id}/templates`)
      .then(data => {
        if (!Array.isArray(data)) return;
        setTemplates(data.map(t => ({
          ...t,
          checklist: Array.isArray(t.checklist) ? t.checklist : []
        })));
      })
      .catch(err => console.error('Error cargando templates:', err));
  };

  const openCreatePreset = () => {
    setPresetForm({ title: '', type: 'work', color: COLORS[0], duration: 120, checklist: [] });
    setShowPresetModal(true);
  };

  const savePreset = () => {
    if (!presetForm.title.trim()) return;
    // Duración saneada: positiva y de máximo un día (un valor negativo o cero
    // generaría bloques degenerados al soltarlos en el calendario).
    const duration = Math.min(Math.max(parseInt(presetForm.duration, 10) || 60, 5), 1440);
    apiFetch('/workshop-presets', { method: 'POST', body: { ...presetForm, duration } })
      .then(() => {
        setShowPresetModal(false);
        loadPresets();
      })
      .catch(err => console.error('Error guardando bloque:', err));
  };

  const deletePreset = (id) => {
    apiFetch(`/workshop-presets/${id}`, { method: 'DELETE' })
      .then(loadPresets)
      .catch(err => console.error('Error eliminando bloque:', err));
  };

  const saveSchedule = () => {
    if (!scheduleName || !scheduleName.trim()) {
      alert('Ponle un nombre al horario antes de guardarlo.');
      return;
    }
    if (selectedScheduleId) {
      apiFetch(`/schedules/${selectedScheduleId}`, { method: 'PUT', body: { name: scheduleName } })
        .then(loadSchedules)
        .catch(err => console.error('Error guardando horario:', err));
    } else {
      apiFetch('/schedules', { method: 'POST', body: { name: scheduleName } })
        .then(data => {
          loadSchedules();
          if (data && data.id != null) setSelectedScheduleId(data.id);
        })
        .catch(err => console.error('Error creando horario:', err));
    }
  };

  const deleteSchedule = () => {
    if (!selectedScheduleId) return;
    if (confirm('¿Eliminar este horario completo?')) {
      apiFetch(`/schedules/${selectedScheduleId}`, { method: 'DELETE' })
        .then(() => {
          setSelectedScheduleId(null);
          loadSchedules();
        })
        .catch(err => console.error('Error eliminando horario:', err));
    }
  };

  const applySchedule = () => {
    if (!selectedScheduleId) return;
    if (confirm('¿Aplicar este horario desde hoy en adelante? (Sobrescribirá los bloques futuros de este horario)')) {
      apiFetch(`/schedules/${selectedScheduleId}/apply`, { method: 'POST' })
        .then(() => {
          alert('Horario aplicado con éxito');
        })
        .catch(err => console.error('Error aplicando horario:', err));
    }
  };

  const deleteTemplate = (id) => {
    apiFetch(`/schedule-templates/${id}`, { method: 'DELETE' })
      .then(() => loadTemplates(selectedScheduleId))
      .catch(err => console.error('Error eliminando template:', err));
  };

  const getTimeToPixels = (timeStr) => {
    if (!timeStr) return 0;
    let [h, m] = timeStr.split(':').map(Number);
    let shifted = h - startHour;
    if (shifted < 0) shifted += 24;
    return (shifted * 50) + (m / 60) * 50;
  };

  const getPixelsToHourSnap = (pixels) => {
    const totalHours = pixels / 50;
    let adjustedH = Math.floor(totalHours);
    let m = (totalHours - adjustedH) >= 0.5 ? 30 : 0;
    if (adjustedH < 0) { adjustedH = 0; m = 0; }
    if (adjustedH > 23) { adjustedH = 23; m = 30; }
    let h = (adjustedH + startHour) % 24;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const handleDragStartPreset = (e, preset) => {
    e.dataTransfer.effectAllowed = 'copy';
    setDraggedPreset({ ...preset, source: 'preset' });
  };

  const handleDragStartTemplate = (e, template) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedPreset({ ...template, source: 'template' });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Estado FRESCO de templates para calcular la cascada: el estado del closure
  // puede estar obsoleto si hay otro drop en vuelo (dos drops muy seguidos).
  const freshTemplates = () =>
    apiFetch(`/schedules/${selectedScheduleId}/templates`)
      .then(data => (Array.isArray(data) ? data : []));

  // Soltar un preset nuevo. La cascada se calcula sobre el estado fresco ANTES
  // del POST: el bloque nuevo aún no existe en el servidor, así que {id: null}
  // funciona como insertado sin colisionar con ningún id real.
  // En modo fusión los solapados simplemente conviven. Luego recarga.
  const dropNewPreset = async (preset, dayOfWeek, rawStartMins) => {
    const duration = preset.duration || 60;
    const { startMin, endMin } = fitInDay(rawStartMins, duration);
    try {
      let updates = [];
      if (collisionMode === 'cascade') {
        updates = computeTemplateUpdates(await freshTemplates(), {
          id: null, day: dayOfWeek, startMin, endMin
        });
      }
      await apiFetch('/schedule-templates', {
        method: 'POST',
        body: {
          scheduleId: selectedScheduleId,
          title: preset.title,
          type: preset.type,
          dayOfWeek: dayOfWeek,
          startTime: toHHMM(startMin),
          endTime: toHHMM(endMin),
          color: preset.color,
          checklist: Array.isArray(preset.checklist) ? preset.checklist : [],
          // Vínculo flor↔taller: presente cuando el preset viene de un recurrente de jardín.
          flowerId: preset.flowerId ?? null,
          recurrentId: preset.recurrentId ?? null
        }
      });
      if (updates.length > 0) {
        await apiFetch('/schedule-templates/batch', { method: 'PUT', body: { updates } });
      }
      loadTemplates(selectedScheduleId);
    } catch (err) {
      console.error('Error al colocar el bloque:', err);
      loadTemplates(selectedScheduleId);
    }
  };

  // Mover un template existente: cascada sobre estado fresco (el propio bloque
  // se excluye por id), luego PUT del bloque, batch y recarga.
  // En modo fusión los solapados simplemente conviven.
  const moveExistingTemplate = async (tpl, dayOfWeek, rawStartMins) => {
    let duration = endMinOf(tpl.endTime) - toMin(tpl.startTime);
    if (duration < 0) duration += 1440; // dato legacy que cruzaba medianoche
    // (duración cero o inválida cae al default de fitInDay)
    const { startMin, endMin } = fitInDay(rawStartMins, duration);
    try {
      let updates = [];
      if (collisionMode === 'cascade') {
        updates = computeTemplateUpdates(await freshTemplates(), {
          id: tpl.id, day: dayOfWeek, startMin, endMin
        });
      }
      await apiFetch(`/schedule-templates/${tpl.id}`, {
        method: 'PUT',
        body: { dayOfWeek: dayOfWeek, startTime: toHHMM(startMin), endTime: toHHMM(endMin) }
      });
      if (updates.length > 0) {
        await apiFetch('/schedule-templates/batch', { method: 'PUT', body: { updates } });
      }
      loadTemplates(selectedScheduleId);
    } catch (err) {
      console.error('Error al mover el bloque:', err);
      loadTemplates(selectedScheduleId);
    }
  };

  const handleDrop = (e, dayOfWeek) => {
    e.preventDefault();
    if (!draggedPreset || !selectedScheduleId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const newStartTime = getPixelsToHourSnap(y);
    const startMins = toMin(newStartTime);

    if (draggedPreset.source === 'preset') {
      dropNewPreset(draggedPreset, dayOfWeek, startMins);
    } else if (draggedPreset.source === 'template') {
      moveExistingTemplate(draggedPreset, dayOfWeek, startMins);
    }
    setDraggedPreset(null);
  };

  return (
    <div style={{ display: 'flex', height: '100%', gap: '20px' }}>
      {/* LEFT MENU */}
      <div className="glass" style={{ width: '250px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 15px 0', color: 'var(--primary-color)' }}>Horarios</h3>
        <select
          className="input-field"
          style={{ marginBottom: '15px' }}
          value={selectedScheduleId || ''}
          onChange={e => setSelectedScheduleId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">-- Nuevo Horario --</option>
          {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Recurrentes de Flores */}
        {flowers.some(f => Array.isArray(f.recurrents) && f.recurrents.length > 0) && (
          <>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--accent-color)', fontSize: '1rem' }}>De mi Jardín</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {flowers.map(f => {
                const allRecs = Array.isArray(f.recurrents) ? f.recurrents : [];
                const mainRecs = allRecs.filter(r => !r.parentId);
                const altsByParent = {};
                allRecs.forEach(r => {
                  if (r.parentId) {
                    if (!altsByParent[r.parentId]) altsByParent[r.parentId] = [];
                    altsByParent[r.parentId].push(r);
                  }
                });

                return mainRecs.map(mainRec => {
                  const variants = [mainRec, ...(altsByParent[mainRec.id] || [])];
                  const selIdx = selectedAltIndex[mainRec.id] || 0;
                  const displayRec = variants[selIdx];

                  const h = (displayRec.duration || 60) * (50 / 60);
                  // El vínculo flor↔taller viaja con el preset: flowerId de la flor y
                  // recurrentId del recurrente mostrado, para que 'Aplicar Horario'
                  // genere bloques ligados a la flor.
                  const presetObj = {
                    source: 'preset',
                    title: displayRec.title,
                    type: 'garden',
                    duration: displayRec.duration || 60,
                    checklist: Array.isArray(displayRec.checklist) ? displayRec.checklist : [],
                    color: f.color,
                    flowerId: f.id,
                    recurrentId: displayRec.id
                  };

                  return (
                    <div
                      key={`rec-${mainRec.id}`}
                      className="block-card block-type-garden"
                      style={{ position: 'relative', height: `${Math.max(h, 40)}px`, minHeight: '40px', padding: '10px', cursor: 'grab', background: f.color ? `linear-gradient(to right, ${f.color}66 100%, transparent 100%)` : undefined, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                      draggable
                      onDragStart={() => setDraggedPreset(presetObj)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {variants.length > 1 ? (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setSelectedAltIndex({...selectedAltIndex, [mainRec.id]: (selIdx - 1 + variants.length) % variants.length}); }}
                            style={{background: 'transparent', padding: 0, color: 'var(--text-color)', opacity: 0.7, cursor: 'pointer'}}
                          >
                            <ChevronLeft size={16}/>
                          </button>
                        ) : <div style={{width: '16px'}} />}

                        <div style={{ textAlign: 'center', flex: 1, minWidth: 0, padding: '0 4px' }}>
                          <div style={{ fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayRec.title}</div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{displayRec.duration || 60} min</div>
                        </div>

                        {variants.length > 1 ? (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setSelectedAltIndex({...selectedAltIndex, [mainRec.id]: (selIdx + 1) % variants.length}); }}
                            style={{background: 'transparent', padding: 0, color: 'var(--text-color)', opacity: 0.7, cursor: 'pointer'}}
                          >
                            <ChevronRight size={16}/>
                          </button>
                        ) : <div style={{width: '16px'}} />}
                      </div>

                      {variants.length > 1 && (
                        <div style={{display: 'flex', justifyContent: 'center', gap: '3px', position: 'absolute', bottom: '4px', width: '100%', left: 0}}>
                          {variants.map((_, i) => (
                            <div key={i} style={{width: '4px', height: '4px', borderRadius: '50%', background: i === selIdx ? 'var(--text-color)' : 'rgba(0,0,0,0.2)'}} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, color: 'var(--primary-color)' }}>Mis Bloques</h3>
          <button className="primary" style={{ padding: '5px 10px' }} onClick={openCreatePreset}>+</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {presets.map(p => {
            const h = (p.duration || 60) * (50 / 60);
            return (
              <div
                key={p.id}
                className={`block-card block-type-${p.type}`}
                style={{ position: 'relative', height: `${Math.max(h, 40)}px`, minHeight: '40px', padding: '10px', cursor: 'grab', background: p.color ? `linear-gradient(to right, ${p.color}66 100%, transparent 100%)` : undefined }}
                draggable
                onDragStart={(e) => handleDragStartPreset(e, p)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>{p.title}</span>
                  <button onClick={() => deletePreset(p.id)} style={{ background: 'none', border: 'none', color: '#111', cursor: 'pointer', padding: 0 }}><Trash2 size={14}/></button>
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{(p.duration || 60)} min</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MAIN VIEW */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              className="input-field"
              style={{ fontSize: '1.2rem', fontWeight: 'bold', width: '250px' }}
              value={scheduleName}
              onChange={e => setScheduleName(e.target.value)}
            />
            <button className="primary" onClick={saveSchedule}><Save size={16} style={{marginRight: '5px'}}/> Guardar</button>
          </div>
          {selectedScheduleId && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="primary" style={{ background: 'var(--accent-color)' }} onClick={applySchedule}>
                Aplicar Horario al Calendario
              </button>
              <button className="glass" style={{ color: 'red' }} onClick={deleteSchedule}>
                <Trash2 size={16}/> Borrar
              </button>
            </div>
          )}
        </div>

        {!selectedScheduleId ? (
          <div className="glass" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <p style={{ color: '#888' }}>Guarda el horario primero para empezar a arrastrar bloques.</p>
          </div>
        ) : (
          <div className="calendar-container glass">
            {/* CORRECCIÓN: Usar calendar-header-row para que los días se alineen en columnas */}
            <div className="calendar-header-row">
              <div className="time-column-header"></div>
              {DAY_LABELS.map((day) => (
                <div key={day.d} className="day-header">{day.l}</div>
              ))}
            </div>

            <div className="calendar-grid">
              <div className="time-column">
                {HOURS.map(h => {
                   let label = `${h.toString().padStart(2,'0')}:00`;
                   if (timeFormat === '12h') {
                     const period = h >= 12 ? 'PM' : 'AM';
                     let h12 = h % 12;
                     if (h12 === 0) h12 = 12;
                     label = `${h12.toString().padStart(2, '0')}:00 ${period}`;
                   }
                   return <div key={h} className="time-slot">{label}</div>
                })}
              </div>

              {DAY_LABELS.map((day) => {
                const dayTemplates = templates.filter(t => t.dayOfWeek === day.d);
                // Carriles: los bloques del día que se solapan (fusionados) se ven
                // lado a lado compartiendo el ancho de la columna.
                const laneMap = computeLanes(dayTemplates.map(t => ({
                  id: t.id,
                  startMin: toMin(t.startTime),
                  endMin: endMinOf(t.endTime)
                })));
                return (
                  <div
                    key={day.d} className="day-column"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day.d)}
                  >
                    <div className="day-grid-lines"></div>
                    {dayTemplates.map(t => {
                      // Partición en el borde visual, decidida en MINUTOS (no en píxeles):
                      // comparar píxeles relativos a startHour confundía la duración cero
                      // y los datos legacy con un cruce real del borde del tablón. Mismo
                      // criterio que computeCascade/computeLanes: legacy con fin anterior
                      // al inicio = fin de día; duración cero = astilla mínima.
                      const sMin = toMin(t.startTime);
                      let eMin = endMinOf(t.endTime);
                      if (eMin < sMin) eMin = 1440;
                      const visStart = (sMin - startHour * 60 + 1440) % 1440;
                      const visEnd = visStart + (eMin - sMin);
                      const px = (m) => (m / 60) * 50;
                      // Si el rango visual pasa del fondo del tablón, DOS segmentos:
                      // [inicio, fondo] y [tope, resto]; el segundo lleva '↪'.
                      const segments = [];
                      if (visEnd > 1440) {
                        if (GRID_HEIGHT - px(visStart) > 0) segments.push({ top: px(visStart), height: GRID_HEIGHT - px(visStart), cont: false });
                        if (px(visEnd - 1440) > 0) segments.push({ top: 0, height: px(visEnd - 1440), cont: true });
                      } else {
                        segments.push({ top: px(visStart), height: Math.max(px(visEnd - visStart), 20), cont: false });
                      }

                      const { lane, lanes } = laneMap.get(t.id) || { lane: 0, lanes: 1 };
                      // Con lanes=1 no se toca el estilo (left/right 5px del CSS, como hoy);
                      // con más carriles cada bloque toma su fracción del ancho de la columna.
                      const laneStyle = lanes > 1 ? {
                        left: `calc(${(lane * 100) / lanes}% + 5px)`,
                        width: `calc(${100 / lanes}% - 10px)`,
                        right: 'auto'
                      } : {};

                      return segments.map((seg, i) => (
                        <div
                          key={`${t.id}-${i}`}
                          className={`block-card block-type-${t.type}`}
                          style={{ top: `${seg.top}px`, height: `${seg.height}px`, cursor: 'grab', background: t.color ? `linear-gradient(to right, ${t.color}66 100%, transparent 100%)` : undefined, ...laneStyle }}
                          draggable
                          onDragStart={(e) => handleDragStartTemplate(e, t)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span className="block-title">{seg.cont ? `↪ ${t.title}` : t.title}</span>
                            <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', color: '#111', cursor: 'pointer', padding: 0 }}><Trash2 size={12}/></button>
                          </div>
                          <div className="block-time">{t.startTime} - {t.endTime}</div>
                        </div>
                      ));
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* MODAL CREAR PRESET */}
      {showPresetModal && (
        <div className="modal-overlay" onClick={() => setShowPresetModal(false)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className="close-btn" onClick={() => setShowPresetModal(false)}><X /></button>
            <h2>Crear Bloque</h2>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Nombre</label>
            <input
              className="input-field"
              value={presetForm.title}
              onChange={e => setPresetForm({...presetForm, title: e.target.value})}
              style={{ marginBottom: '15px' }}
            />

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Duración (minutos)</label>
            <input
              type="number"
              className="input-field"
              value={presetForm.duration}
              onChange={e => setPresetForm({...presetForm, duration: parseInt(e.target.value) || 0})}
              style={{ marginBottom: '15px' }}
            />

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Color</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
              {COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => setPresetForm({...presetForm, color: c})}
                  style={{
                    width: '35px', height: '35px', borderRadius: '50%', backgroundColor: c, cursor: 'pointer',
                    border: presetForm.color === c ? '3px solid #fff' : '3px solid transparent',
                    outline: presetForm.color === c ? `2px solid ${c}` : 'none'
                  }}
                />
              ))}
            </div>

            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Lista de Tareas</label>
            <div style={{ marginBottom: '20px' }}>
              {presetForm.checklist.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
                  <input className="input-field" style={{ margin: 0 }} value={item.task || ''} onChange={e => {
                    const newCheck = [...presetForm.checklist];
                    newCheck[idx] = { ...newCheck[idx], task: e.target.value };
                    setPresetForm({...presetForm, checklist: newCheck});
                  }} />
                  <button className="glass" style={{ padding: '0 10px', color: 'red' }} onClick={() => {
                    const newCheck = presetForm.checklist.filter((_, i) => i !== idx);
                    setPresetForm({...presetForm, checklist: newCheck});
                  }}><Trash2 size={16}/></button>
                </div>
              ))}
              <button className="glass" style={{ width: '100%', padding: '8px' }} onClick={() => {
                setPresetForm({...presetForm, checklist: [...presetForm.checklist, {task: '', done: false}]});
              }}>+ Añadir Tarea</button>
            </div>

            <button className="primary" style={{ width: '100%' }} onClick={savePreset}>Guardar Bloque</button>
          </div>
        </div>
      )}
    </div>
  );
}
