import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Trash2, Pencil, Check } from 'lucide-react';
import { startOfWeek, addDays, format, isSameDay, addWeeks, subWeeks, isBefore, add } from 'date-fns';
import { es } from 'date-fns/locale';
import RewardAnimation from './RewardAnimation';
import { apiFetch } from '../api';
import { computeCascade, fitInDay, computeLanes } from '../cascade';

const COLORS = ['#4a7c59', '#d8a45e', '#a35050', '#507fa3', '#8550a3', '#a3508f', '#e67c45', '#45e69e'];

// Helpers de tiempo (contrato): endTime '00:00' significa medianoche = minuto 1440
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return (h * 60) + m;
};
const toHHMM = (min) => `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`;
const endMin = (t) => (t === '00:00' ? 1440 : toMin(t));

// 1 hora = 50px. Calcula posicion exacta en px dado "HH:MM"
const getTimeToPixels = (timeStr, startHour) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  let adjustedH = h - startHour;
  if (adjustedH < 0) adjustedH += 24;
  return (adjustedH * 50) + ((m / 60) * 50);
};

// Drag & drop: snap al inicio de la hora (minuto 00)
const getPixelsToHourSnap = (y, startHour) => {
  let adjustedH = Math.floor(y / 50);
  if (adjustedH < 0) adjustedH = 0;
  if (adjustedH > 23) adjustedH = 23;
  let h = (adjustedH + startHour) % 24;
  return `${h.toString().padStart(2, '0')}:00`;
};

export default function FieldMode({ settings }) {
  const startHour = settings?.startHour ?? 4;
  const timeFormat = settings?.timeFormat || '12h';
  const HOURS = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [blocks, setBlocks] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [nextObjectives, setNextObjectives] = useState({});
  const [selectedSeedId, setSelectedSeedId] = useState(null);
  const [showReward, setShowReward] = useState(null);
  
  const [schedules, setSchedules] = useState([]);
  const [currentScheduleId, setCurrentScheduleId] = useState('null'); // 'null' string represents default
  
  // Modal: dos modos - "view" (ver checklist y datos) y "edit" (editar)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'view' | 'edit'
  const [editingBlock, setEditingBlock] = useState(null);
  const [formData, setFormData] = useState({
    title: '', type: 'work', startTime: '09:00', endTime: '10:00', date: format(new Date(), 'yyyy-MM-dd'), 
    isRecurring: false, recurrenceEndDate: '', recurrenceForever: true, 
    recurrenceDays: [new Date().getDay()], checklist: [], color: COLORS[0], flowerId: null, recurrentId: null
  });
  const [newChecklistText, setNewChecklistText] = useState('');
  const [selectedRecurrentId, setSelectedRecurrentId] = useState('');

  // Semillas = flores del jardín sin bloques en el calendario esta semana
  const [gardenFlowers, setGardenFlowers] = useState([]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  const loadBlocks = () => {
    const start = format(currentWeekStart, 'yyyy-MM-dd');
    const end = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd');
    apiFetch(`/blocks?start=${start}&end=${end}&scheduleId=${currentScheduleId}`)
      .then(data => {
        if (Array.isArray(data)) setBlocks(data);
      })
      .catch(err => console.error('Error cargando bloques:', err));
  };

  // Ref con la última versión de loadBlocks para que el interval no capture
  // una versión vieja (semana/horario del primer render)
  const loadBlocksRef = useRef(loadBlocks);
  useEffect(() => {
    loadBlocksRef.current = loadBlocks;
  });

  const loadSchedules = () => {
    apiFetch('/schedules')
      .then(data => {
        if (Array.isArray(data)) setSchedules(data);
      })
      .catch(err => console.error('Error cargando horarios:', err));
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadFlowers = () => {
    apiFetch('/flowers')
      .then(data => {
        if (!Array.isArray(data)) return;
        setGardenFlowers(data);
        // Cargar el próximo objetivo para cada flor
        const objMap = {};
        data.forEach(f => {
          const nextObj = (f.objectives || []).find(o => !o.completed);
          if (nextObj) objMap[f.id] = nextObj;
        });
        setNextObjectives(objMap);
      })
      .catch(err => console.error('Error cargando flores:', err));
  };

  useEffect(() => {
    loadBlocks();
    loadFlowers();
  }, [currentWeekStart, currentScheduleId]);

  // Check expired blocks on mount and every 5 min
  useEffect(() => {
    const checkExpired = () => {
      apiFetch('/blocks/check-expired', { method: 'POST' })
        .then(() => loadBlocksRef.current())
        .catch(err => console.error('Error revisando bloques vencidos:', err));
    };
    checkExpired();
    const interval = setInterval(checkExpired, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const prevWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const nextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // --- Cascada (corrimiento de bloques) ---
  // Día siguiente en fecha LOCAL (parsear con T00:00:00 y formatear con date-fns;
  // jamás toISOString, que cambiaría de día según la zona horaria).
  const nextDayStr = (day) => format(addDays(new Date(day + 'T00:00:00'), 1), 'yyyy-MM-dd');

  // Items para computeCascade pidiendo el estado FRESCO al servidor (el estado
  // 'blocks' del closure puede estar obsoleto si hay otra operación en vuelo,
  // p.ej. dos drops muy seguidos — cascar sobre datos viejos movería fantasmas).
  // OJO: la cascada solo ve la semana visible (ya filtrada por horario actual);
  // un desborde hacia una fecha fuera de la semana se coloca a las 00:00 de ese
  // día sin cascar allí (aceptable). Los bloques cosechados (completed) o
  // marchitos (failed) son historia: ni empujan ni se empujan — si quedan
  // solapados se ven lado a lado por lanes.
  const freshCascadeItems = () => {
    const start = format(currentWeekStart, 'yyyy-MM-dd');
    const end = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd');
    return apiFetch(`/blocks?start=${start}&end=${end}&scheduleId=${currentScheduleId}`)
      .then(data => (Array.isArray(data) ? data : [])
        .filter(b => !b.completed && !b.failed)
        .map(b => ({ id: b.id, day: b.date, startMin: toMin(b.startTime), endMin: endMin(b.endTime) })));
  };

  // Persiste los corrimientos en UNA llamada batch transaccional. Sin cambios, no llama.
  const persistCascade = (changed) => {
    if (!changed.length) return Promise.resolve();
    return apiFetch('/blocks/batch', {
      method: 'PUT',
      body: {
        updates: changed.map(u => ({
          id: u.id,
          date: u.day,
          startTime: toHHMM(u.startMin),
          endTime: u.endMin >= 1440 ? '00:00' : toHHMM(u.endMin)
        }))
      }
    });
  };

  // --- Drag & Drop ---
  const handleDragStart = (e, item, source) => {
    setDraggedItem({ ...item, source });
    setTimeout(() => { e.target.style.opacity = '0.5'; }, 0);
  };
  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
  };
  const handleDragOver = (e) => e.preventDefault();

  const handleDropToCalendar = (e, targetDate) => {
    e.preventDefault();
    if (!draggedItem) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    // Snap al inicio de la hora
    let newStartTime = getPixelsToHourSnap(y, startHour);
    
    let [h] = newStartTime.split(':').map(Number);
    let newEndTime = h >= 23 ? '00:00' : `${(h+1).toString().padStart(2, '0')}:00`;

    if (draggedItem.source === 'seed') {
      // Abrir modal de creación para la semilla
      openCreateModal({
        title: draggedItem.title || '',
        type: 'garden',
        startTime: newStartTime,
        endTime: newEndTime,
        date: format(targetDate, 'yyyy-MM-dd'),
        flowerId: draggedItem.id,
        scheduleId: currentScheduleId === 'null' ? null : currentScheduleId
      });
    } else if (draggedItem.source === 'calendar') {
      // Mover bloque existente - mantener la misma duración en minutos.
      // endTime '00:00' = medianoche (minuto 1440), nunca duración negativa.
      let durationMins = endMin(draggedItem.endTime) - toMin(draggedItem.startTime);
      if (durationMins <= 0) durationMins = 60; // dato legacy inválido: 1h por defecto

      // fitInDay: si no cabe desde el punto del drop, retrasa el inicio para
      // terminar exacto a medianoche SIN recortar la duración.
      const fitted = fitInDay(toMin(newStartTime), durationMins);
      const movedStartTime = toHHMM(fitted.startMin);
      const movedEndTime = fitted.endMin >= 1440 ? '00:00' : toHHMM(fitted.endMin);

      const updatedDate = format(targetDate, 'yyyy-MM-dd');
      const collisionMode = settings?.collisionMode || 'cascade';
      // En modo 'fusion' los solapados conviven (se ven por lanes). Un bloque
      // cosechado/marchito tampoco empuja al reacomodarlo: es historia.
      const doCascade = collisionMode === 'cascade' && !draggedItem.completed && !draggedItem.failed;

      (doCascade ? freshCascadeItems() : Promise.resolve(null))
        .then(items => {
          const changed = items
            ? computeCascade(
                items,
                { id: draggedItem.id, day: updatedDate, startMin: fitted.startMin, endMin: fitted.endMin },
                nextDayStr
              )
            : [];
          return apiFetch(`/blocks/${draggedItem.id}`, {
            method: 'PUT',
            body: { date: updatedDate, startTime: movedStartTime, endTime: movedEndTime }
          }).then(() => persistCascade(changed));
        })
        .then(() => loadBlocks())
        .catch(err => {
          console.error('Error moviendo bloque:', err);
          // Recargar igual: la BD puede haber cambiado a medias y la UI no debe quedar obsoleta
          loadBlocks();
        });
    }
  };

  const handleDropToSeeds = (e) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.source !== 'calendar') return;
    apiFetch(`/blocks/${draggedItem.id}`, { method: 'DELETE' })
      .then(() => loadBlocks())
      .catch(err => console.error('Error eliminando bloque:', err));
  };

  // Click en espacio vacío del calendario -> crear bloque
  const handleClickEmptySpace = (e, targetDate) => {
    // Solo reaccionar si se hizo click directo en la columna del día (no en un bloque)
    if (e.target !== e.currentTarget && !e.target.classList.contains('day-grid-lines')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let clickedTime = getPixelsToHourSnap(y, startHour);
    let [h] = clickedTime.split(':').map(Number);
    let endTime = h >= 23 ? '00:00' : `${(h+1).toString().padStart(2, '0')}:00`;

    openCreateModal({
      title: '',
      type: 'work',
      startTime: clickedTime,
      endTime: endTime,
      date: format(targetDate, 'yyyy-MM-dd')
    });
  };

  // --- Modales ---
  const openCreateModal = (defaults = {}) => {
    setEditingBlock(null);
    setModalMode('create');
    setSelectedRecurrentId('');
    setFormData({
      title: defaults.title || '',
      type: defaults.type || 'work',
      startTime: defaults.startTime || '09:00',
      endTime: defaults.endTime || '10:00',
      date: defaults.date || format(new Date(), 'yyyy-MM-dd'),
      isRecurring: false,
      recurrenceEndDate: '',
      recurrenceForever: true,
      // Parsear con T00:00:00 para que getDay() sea local (sin off-by-one UTC)
      recurrenceDays: [defaults.date ? new Date(defaults.date + 'T00:00:00').getDay() : new Date().getDay()],
      checklist: [],
      flowerId: defaults.flowerId || null,
      recurrentId: defaults.recurrentId || null,
      color: defaults.color || COLORS[0]
    });
    setModalOpen(true);
  };

  const openViewModal = (block) => {
    setEditingBlock(block);
    setModalMode('view');
    setSelectedRecurrentId('');
    setFormData({
      title: block.title || '',
      type: block.type || 'work',
      startTime: block.startTime || '09:00',
      endTime: block.endTime || '10:00',
      date: block.date || format(new Date(), 'yyyy-MM-dd'),
      isRecurring: block.isRecurring || false,
      recurrenceEndDate: '',
      recurrenceForever: true,
      recurrenceDays: [],
      checklist: Array.isArray(block.checklist) ? block.checklist : [],
      flowerId: block.flowerId || null,
      recurrentId: block.recurrentId || null,
      color: block.color || COLORS[0]
    });
    setModalOpen(true);
  };

  const switchToEditMode = () => {
    setModalMode('edit');
  };

  const handleSaveBlock = () => {
    // El backend rechaza bloques sin título (400); avisar aquí en vez de fallar en silencio.
    if (!formData.title || !formData.title.trim()) {
      alert('Ponle un título al bloque antes de guardarlo.');
      return;
    }
    // Horas coherentes: fin posterior al inicio ('00:00' cuenta como medianoche).
    // Un bloque de duración cero o invertido rompería la cascada y el render.
    if (endMin(formData.endTime) <= toMin(formData.startTime)) {
      alert('La hora de fin debe ser posterior a la de inicio (usa 00:00 para terminar a medianoche).');
      return;
    }
    // MODO EDICIÓN: PUT parcial con date SINGULAR (nunca 'dates')
    if (modalMode === 'edit') {
      if (!editingBlock) return;
      const payload = {
        title: formData.title,
        type: formData.type,
        startTime: formData.startTime,
        endTime: formData.endTime,
        date: formData.date,
        color: formData.color,
        checklist: formData.checklist,
        flowerId: formData.flowerId || null,
        recurrentId: formData.recurrentId || null,
        scheduleId: currentScheduleId === 'null' ? null : currentScheduleId,
        isRecurring: editingBlock.isRecurring || false,
        recurrenceId: editingBlock.recurrenceId || null
      };
      // Cascada SOLO si la posición cambió de verdad: editar el título de un bloque
      // fusionado no debe re-insertarlo ni empujar a sus vecinos. Un bloque
      // cosechado/marchito tampoco empuja (es historia).
      const positionChanged = formData.date !== editingBlock.date ||
        formData.startTime !== editingBlock.startTime ||
        formData.endTime !== editingBlock.endTime;
      const doCascade = (settings?.collisionMode || 'cascade') === 'cascade' &&
        positionChanged && !editingBlock.completed && !editingBlock.failed;

      (doCascade ? freshCascadeItems() : Promise.resolve(null))
        .then(items => {
          const changed = items
            ? computeCascade(
                items,
                { id: editingBlock.id, day: formData.date, startMin: toMin(formData.startTime), endMin: endMin(formData.endTime) },
                nextDayStr
              )
            : [];
          return apiFetch(`/blocks/${editingBlock.id}`, { method: 'PUT', body: payload })
            .then(() => persistCascade(changed));
        })
        .then(() => {
          setModalOpen(false);
          loadBlocks();
        })
        .catch(err => {
          console.error('Error guardando bloque:', err);
          loadBlocks(); // la BD pudo cambiar a medias: no dejar la UI obsoleta
        });
      return;
    }

    // MODO CREACIÓN: POST con dates (array, una fila por fecha)
    let datesToInsert = [];
    const recurrenceId = 'rec_' + Date.now();

    if (formData.isRecurring) {
      let currentDate = new Date(formData.date + 'T00:00:00');
      let limitDate;
      if (formData.recurrenceEndDate && !formData.recurrenceForever) {
         limitDate = new Date(formData.recurrenceEndDate + 'T00:00:00');
      } else {
         // 'Por siempre' (o sin fecha fin): un año DESDE LA FECHA DE INICIO del bloque,
         // no desde hoy — un inicio a meses vista generaría cero ocurrencias.
         limitDate = new Date(formData.date + 'T00:00:00');
         limitDate.setFullYear(limitDate.getFullYear() + 1);
      }

      while (currentDate <= limitDate) {
         if (formData.recurrenceDays.includes(currentDate.getDay())) {
             datesToInsert.push(format(currentDate, 'yyyy-MM-dd'));
         }
         currentDate.setDate(currentDate.getDate() + 1);
      }
      if (datesToInsert.length === 0) datesToInsert.push(formData.date);
    } else {
       datesToInsert = [formData.date];
    }

    const payload = {
      title: formData.title,
      type: formData.type,
      startTime: formData.startTime,
      endTime: formData.endTime,
      color: formData.color,
      dates: datesToInsert,
      isRecurring: formData.isRecurring,
      recurrenceId: formData.isRecurring ? recurrenceId : null,
      checklist: formData.checklist,
      flowerId: formData.flowerId || null,
      recurrentId: formData.recurrentId || null,
      scheduleId: currentScheduleId === 'null' ? null : currentScheduleId
    };

    // Cascada solo al crear en UN día. En recurrentes multi-fecha NO se aplica:
    // solo está cargada la semana visible, y cascar las demás fechas sería
    // mover bloques "a ciegas" sin ver lo que hay en esas semanas.
    const doCascade = !formData.isRecurring && (settings?.collisionMode || 'cascade') === 'cascade';

    // Los items frescos se piden ANTES del POST: así el bloque recién creado (que
    // aún no tiene id) no aparece en el estado y {id: null} funciona como insertado.
    (doCascade ? freshCascadeItems() : Promise.resolve(null))
      .then(items => {
        const changed = items
          ? computeCascade(
              items,
              { id: null, day: formData.date, startMin: toMin(formData.startTime), endMin: endMin(formData.endTime) },
              nextDayStr
            )
          : [];
        return apiFetch('/blocks', { method: 'POST', body: payload })
          .then(() => {
            // Cerrar el modal apenas el POST tiene éxito: si el batch de cascada
            // fallara, reintentar "Guardar" desde el modal duplicaría el bloque.
            setModalOpen(false);
            return persistCascade(changed);
          });
      })
      .then(() => loadBlocks())
      .catch(err => {
        console.error('Error creando bloque:', err);
        loadBlocks(); // la BD pudo cambiar a medias: no dejar la UI obsoleta
      });
  };

  const deleteBlock = (deleteFollowing = false) => {
    let path = `/blocks/${editingBlock.id}`;
    if (deleteFollowing && editingBlock.recurrenceId) {
      path += `?deleteFollowing=true&recurrenceId=${editingBlock.recurrenceId}&date=${editingBlock.date}`;
    }
    apiFetch(path, { method: 'DELETE' })
      .then(() => {
        setModalOpen(false);
        loadBlocks();
      })
      .catch(err => console.error('Error eliminando bloque:', err));
  };

  // Cosechar un bloque. Si el backend responde 409 (ya cosechado), solo recargar sin alert.
  const harvestBlock = (blockId) => {
    apiFetch(`/blocks/${blockId}/harvest`, { method: 'PUT' })
      .then(data => {
        // imagePath solo viene con rare_seed: la animación nombra la especie desbloqueada
        setShowReward({ type: data.rewardType || 'none', imagePath: data.imagePath || null });
        setModalOpen(false);
        loadBlocks();
        loadFlowers();
      })
      .catch(err => {
        if (err.status === 409) {
          setModalOpen(false);
          loadBlocks();
        } else {
          console.error('Error al cosechar:', err);
        }
      });
  };

  const toggleChecklistItem = (index) => {
    if (modalMode !== 'view') return;
    const newChecklist = [...formData.checklist];
    newChecklist[index] = { ...newChecklist[index], done: !newChecklist[index].done };
    setFormData({...formData, checklist: newChecklist});

    if (editingBlock) {
      apiFetch(`/blocks/${editingBlock.id}`, {
        method: 'PUT',
        body: { checklist: newChecklist }
      })
        .then(() => {
          // Auto-cosecha: si todas las tareas estan completas (un bloque failed puede completarse tarde)
          const allDone = newChecklist.length > 0 && newChecklist.every(item => item.done);
          if (allDone && !editingBlock.completed) {
            harvestBlock(editingBlock.id);
          } else {
            loadBlocks();
          }
        })
        .catch(err => console.error('Error actualizando checklist:', err));
    }
  };

  const addChecklistItemImmediate = () => {
    if (!newChecklistText.trim()) return;
    const newChecklist = [...formData.checklist, { task: newChecklistText.trim(), done: false }];
    setFormData({...formData, checklist: newChecklist});
    setNewChecklistText('');

    if (editingBlock) {
      apiFetch(`/blocks/${editingBlock.id}`, {
        method: 'PUT',
        body: { checklist: newChecklist }
      })
        .then(() => loadBlocks())
        .catch(err => console.error('Error actualizando checklist:', err));
    }
  };

  const updateChecklist = (index, value) => {
    const newChecklist = [...formData.checklist];
    newChecklist[index].task = value;
    setFormData({...formData, checklist: newChecklist});
  };

  const removeChecklistItem = (index) => {
    const newChecklist = formData.checklist.filter((_, i) => i !== index);
    setFormData({...formData, checklist: newChecklist});
  };

  const handleCompleteObjective = (flowerId, objId) => {
    // Completar el ÚLTIMO objetivo cierra la meta y limpia sus bloques/recurrentes futuros:
    // es irreversible, así que se confirma antes.
    const flower = gardenFlowers.find(f => f.id === flowerId);
    const pending = (flower && Array.isArray(flower.objectives))
      ? flower.objectives.filter(o => !o.completed)
      : [];
    if (pending.length === 1 && pending[0].id === objId) {
      const ok = confirm(`¡Este es el último objetivo de "${flower.title}"! Al completarlo, la meta se dará por cumplida y se eliminarán sus bloques y recurrentes futuros (los de hoy se conservan). ¿Continuar?`);
      if (!ok) return;
    }
    apiFetch(`/objectives/${objId}/complete`, {
      method: 'PUT',
      body: { completed: true }
    })
      .then(() => apiFetch(`/blocks/${editingBlock.id}`, {
        method: 'PUT',
        body: { completed: true }
      }))
      .then(() => { setModalOpen(false); loadBlocks(); loadFlowers(); })
      .catch(err => console.error('Error completando objetivo:', err));
  };

  // Semillas = flores que existen en el jardín
  const seeds = gardenFlowers.map(f => ({
    id: f.id,
    title: f.title,
    type: 'garden'
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
             <h2 style={{ margin: 0 }}>Modo Campo: Rutina Diaria</h2>
             <select 
               className="input-field" 
               style={{ width: '200px', padding: '5px' }}
               value={currentScheduleId}
               onChange={(e) => setCurrentScheduleId(e.target.value)}
             >
               <option value="null">Horario Default</option>
               {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
             </select>
           </div>
           <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="glass" onClick={prevWeek} style={{padding: '5px'}}><ChevronLeft size={20}/></button>
              <button className="primary" onClick={goToday}>Hoy</button>
              <button className="glass" onClick={nextWeek} style={{padding: '5px'}}><ChevronRight size={20}/></button>
              <span style={{marginLeft: '10px', fontWeight: 'bold'}}>
                {format(currentWeekStart, "MMMM yyyy", { locale: es })}
              </span>
           </div>
        </div>
        <button className="primary" onClick={() => openCreateModal()}>+ Nuevo Bloque</button>
      </div>

      {/* Semillas = Flores del Jardín (zona de drop para eliminar) */}
      <div 
        className="glass" 
        style={{ padding: '15px', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', background: 'rgba(255,255,255,0.85)' }}
        onDragOver={handleDragOver}
        onDrop={handleDropToSeeds}
      >
        <h4 style={{ margin: 0, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>Semillas (Metas del Jardín):</h4>
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px', flex: 1 }}>
          {seeds.length === 0 ? (
             <span style={{color: '#888', fontSize: '0.9rem'}}>Ve al Modo Jardín para crear metas. También puedes arrastrar bloques aquí para eliminarlos.</span>
          ) : (
             seeds.map(seed => (
               <div 
                 key={seed.id} className="seed-badge" draggable
                 onClick={() => setSelectedSeedId(selectedSeedId === seed.id ? null : seed.id)}
                 onDragStart={(e) => handleDragStart(e, seed, 'seed')} onDragEnd={handleDragEnd}
                 style={{ border: selectedSeedId === seed.id ? '2px solid var(--text-color)' : '2px solid transparent' }}
               >
                 {seed.title}
               </div>
             ))
          )}
        </div>
      </div>

      {/* Calendario */}
      <div className="glass" style={{ padding: '20px', overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: '0' }}>
        <div style={{ minWidth: '800px' }}>
          
          <div className="calendar-header-row">
             <div></div>
             {weekDays.map(dateObj => {
                const isToday = isSameDay(dateObj, new Date());
                return (
                  <div key={format(dateObj, 'yyyy-MM-dd')} className="day-header">
                    <div style={{textTransform: 'capitalize'}}>{format(dateObj, 'EEEE', { locale: es })}</div>
                    <div className={`day-number ${isToday ? 'today-circle' : ''}`}>
                      {format(dateObj, 'd')}
                    </div>
                  </div>
                )
             })}
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

            {weekDays.map((dateObj) => {
              const dateStr = format(dateObj, 'yyyy-MM-dd');

              return (
                <div 
                  key={dateStr} className="day-column"
                  onDragOver={handleDragOver} 
                  onDrop={(e) => handleDropToCalendar(e, dateObj)}
                  onClick={(e) => handleClickEmptySpace(e, dateObj)}
                >
                  <div className="day-grid-lines"></div>
                  {(() => {
                    const dayBlocks = blocks.filter(b => b.date === dateStr);
                    // Carriles: los bloques del día que se solapan (fusionados) se
                    // renderizan lado a lado compartiendo el ancho de la columna.
                    const lanesMap = computeLanes(dayBlocks.map(b => ({
                      id: b.id, startMin: toMin(b.startTime), endMin: endMin(b.endTime)
                    })));
                    const GRID_PX = 24 * 50; // alto total del tablón (24h a 50px/hora)

                    return dayBlocks.flatMap(b => {
                    // Partición en el borde visual, decidida en MINUTOS (no en píxeles):
                    // comparar píxeles relativos a startHour confundía la duración cero
                    // y los datos legacy con un cruce real del borde del tablón.
                    // Mismo criterio que computeCascade/computeLanes: legacy con fin
                    // anterior al inicio = fin de día; duración cero = astilla mínima.
                    const sMin = toMin(b.startTime);
                    let eMin = endMin(b.endTime);
                    if (eMin < sMin) eMin = 1440;
                    // Posición visual en minutos relativa al inicio del tablón.
                    const visStart = (sMin - startHour * 60 + 1440) % 1440;
                    const visEnd = visStart + (eMin - sMin);
                    const px = (m) => (m / 60) * 50;
                    // Si el rango visual pasa del fondo del tablón, se parte en DOS
                    // segmentos: [inicio, fondo] y [tope, resto], omitiendo los de
                    // altura 0; el segundo lleva marca de continuación '↪'. Ambos
                    // comparten el mismo onClick/drag del bloque.
                    let segments;
                    if (visEnd > 1440) {
                      segments = [
                        { top: px(visStart), height: GRID_PX - px(visStart), continued: false },
                        { top: 0, height: px(visEnd - 1440), continued: true },
                      ].filter(s => s.height > 0);
                    } else {
                      segments = [{ top: px(visStart), height: Math.max(px(visEnd - visStart), 20), continued: false }];
                    }

                    const checklistArr = Array.isArray(b.checklist) ? b.checklist : [];
                    const doneCount = checklistArr.filter(c => c.done).length;

                    const nextObj = b.flowerId ? nextObjectives[b.flowerId] : null;

                    const isDimmed = selectedSeedId !== null && b.flowerId !== selectedSeedId;
                    const progress = b.flowerId ? (gardenFlowers.find(f => f.id === b.flowerId)?.progress || 0) : 0;

                    let customStyle = { opacity: isDimmed ? 0.3 : 1 };

                    if (selectedSeedId !== null && b.flowerId === selectedSeedId) {
                       customStyle.boxShadow = '0 0 12px var(--accent-color)';
                       customStyle.border = '2px solid var(--accent-color)';
                       customStyle.zIndex = 10;
                    }

                    if (b.type === 'garden') {
                       if (b.completed) {
                          customStyle.background = 'var(--accent-color)';
                          customStyle.color = '#fff';
                       } else {
                          const flowerColor = b.flowerId ? (gardenFlowers.find(f => f.id === b.flowerId)?.color || '#4a7c59') : '#4a7c59';
                          customStyle.background = `linear-gradient(to right, ${flowerColor}66 ${progress}%, rgba(255,255,255,0.9) ${progress}%)`;
                       }
                    } else if (b.color) {
                       customStyle.background = `linear-gradient(to right, ${b.color}66 100%, transparent 100%)`;
                    }

                    // Carril del bloque: con lanes=1 no se ajusta nada (se ve EXACTO a
                    // como hoy, con el left/right 5px del CSS); con más carriles cada
                    // bloque toma su franja del ancho, conservando los 5px de margen.
                    const { lane, lanes } = lanesMap.get(b.id) || { lane: 0, lanes: 1 };
                    const laneStyle = lanes > 1 ? {
                      left: `calc(${(lane * 100) / lanes}% + 5px)`,
                      width: `calc(${100 / lanes}% - 10px)`,
                      right: 'auto'
                    } : {};

                    return segments.map((seg, segIdx) => (
                      <div
                        key={`${b.id}-${segIdx}`}
                        className={`block-card block-type-${b.type}${b.completed ? ' block-harvested' : ''}${b.failed ? ' block-withered' : ''}`}
                        style={{ ...customStyle, ...laneStyle, top: `${seg.top}px`, height: `${seg.height}px` }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, b, 'calendar')}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => { e.stopPropagation(); openViewModal(b); }}
                      >
                        <div className="block-title">{seg.continued ? '↪ ' : ''}{b.title}</div>
                        <div className="block-time">{b.startTime} - {b.endTime}</div>
                        {checklistArr.length > 0 && (
                          <div style={{fontSize: '0.7rem', marginTop: '2px', opacity: 0.8}}>
                            {doneCount}/{checklistArr.length} tareas
                          </div>
                        )}
                        {nextObj && seg.height > 40 && (
                          <div style={{fontSize: '0.65rem', marginTop: '2px', color: 'var(--primary-color)', fontWeight: '600', opacity: 0.9}}>
                            Meta: {nextObj.title}
                          </div>
                        )}
                      </div>
                    ));
                  });
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ====== MODAL ====== */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
             <button className="close-btn" onClick={() => setModalOpen(false)}><X /></button>

             {/* === VIEW MODE === */}
             {modalMode === 'view' && editingBlock && (
               <div>
                 <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                   <div>
                     <h2 style={{marginTop: 0, marginBottom: '5px'}}>{editingBlock.title}</h2>
                     <p style={{margin: 0, color: '#888', fontSize: '0.9rem'}}>
                       {editingBlock.startTime} - {editingBlock.endTime} | {editingBlock.date}
                       {editingBlock.isRecurring ? ' | Recurrente' : ''}
                     </p>
                   </div>
                   <button className="primary" onClick={switchToEditMode} style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                     <Pencil size={16}/> Editar
                   </button>
                 </div>

                 <div style={{margin: '25px 0', padding: '15px', background: `var(--block-${editingBlock.type}, #eee)`, borderRadius: '12px'}}>
                   <span style={{fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', opacity: 0.7}}>
                     Tipo: {editingBlock.type}
                   </span>
                 </div>

                 {/* Objetivo próximo para bloques de jardín */}
                 {editingBlock.flowerId && nextObjectives[editingBlock.flowerId] && !editingBlock.completed && (
                   <div style={{background: 'rgba(74,124,89,0.06)', padding: '15px', borderRadius: '12px', marginBottom: '20px', borderLeft: '4px solid var(--primary-color)'}}>
                     <div style={{fontSize: '0.8rem', color: '#888', marginBottom: '5px'}}>Objetivo próximo de esta meta:</div>
                     <div style={{fontWeight: '600', color: 'var(--primary-color)', marginBottom: '10px'}}>{nextObjectives[editingBlock.flowerId].title}</div>
                     <button className="primary" style={{background: 'var(--accent-color)', width: '100%'}} onClick={() => handleCompleteObjective(editingBlock.flowerId, nextObjectives[editingBlock.flowerId].id)}>
                        Completar Objetivo
                     </button>
                   </div>
                 )}
                 {editingBlock.completed && (
                   <div style={{background: 'rgba(216,164,94,0.1)', padding: '15px', borderRadius: '12px', marginBottom: '20px', borderLeft: '4px solid var(--accent-color)', color: 'var(--accent-color)', fontWeight: 'bold'}}>
                     ¡Objetivo completado en este bloque!
                   </div>
                 )}

                 {/* Checklist interactiva */}
                 <div>
                   <h4 style={{marginBottom: '10px'}}>Checklist</h4>
                   {formData.checklist.length === 0 ? (
                     <p style={{color: '#888', fontSize: '0.9rem'}}>Este bloque no tiene sub-tareas.</p>
                   ) : (
                     formData.checklist.map((item, i) => (
                       <div 
                         key={i} 
                         onClick={() => toggleChecklistItem(i)}
                         style={{
                           display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', 
                           background: item.done ? 'rgba(74, 124, 89, 0.08)' : 'rgba(0,0,0,0.02)',
                           borderRadius: '8px', marginBottom: '6px', cursor: 'pointer',
                           transition: 'all 0.2s'
                         }}
                       >
                         <div style={{
                           width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                           border: item.done ? 'none' : '2px solid var(--primary-color)',
                           background: item.done ? 'var(--primary-color)' : 'transparent',
                           display: 'flex', justifyContent: 'center', alignItems: 'center',
                           color: 'white', fontSize: '14px'
                         }}>
                           {item.done && <Check size={14}/>}
                         </div>
                         <span style={{textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.6 : 1}}>
                           {item.task}
                         </span>
                       </div>
                     ))
                   )}
                   <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                     <input 
                       className="input-field" 
                       style={{flex: 1}} 
                       placeholder="Añadir nueva tarea..." 
                       value={newChecklistText} 
                       onChange={e => setNewChecklistText(e.target.value)} 
                       onKeyDown={e => e.key === 'Enter' && addChecklistItemImmediate()}
                     />
                     <button className="primary" onClick={addChecklistItemImmediate}>+ Añadir</button>
                   </div>
                 </div>

                  {/* Boton Cosechar (un bloque failed puede cosecharse = completar tarde) */}
                  {!editingBlock.completed && (
                    <div style={{marginTop: '15px'}}>
                      <button
                        className="primary"
                        style={{width: '100%', background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))', padding: '14px', fontSize: '1.05rem', borderRadius: '12px'}}
                        onClick={() => harvestBlock(editingBlock.id)}
                      >
                        {editingBlock.failed ? 'Cosechar Bloque (completar tarde)' : 'Cosechar Bloque'}
                      </button>
                    </div>
                  )}

                 {/* Botones de eliminación */}
                 <div style={{display: 'flex', gap: '10px', marginTop: '25px', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '20px'}}>
                   <button className="primary" style={{background: 'var(--danger-color)'}} onClick={() => deleteBlock(false)}>
                     <Trash2 size={16} style={{marginRight: '5px'}}/> Eliminar
                   </button>
                   {editingBlock.recurrenceId && (
                     <button className="primary" style={{background: 'var(--danger-color)', fontSize: '0.8rem'}} onClick={() => deleteBlock(true)}>
                       Eliminar este y siguientes
                     </button>
                   )}
                 </div>
               </div>
             )}

             {/* === CREATE / EDIT MODE === */}
             {(modalMode === 'create' || modalMode === 'edit') && (
               <div>
                 <h2 style={{marginTop: 0}}>{modalMode === 'edit' ? 'Editar Bloque' : 'Nuevo Bloque'}</h2>
                 
                 <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px'}}>
                    <div>
                      <label>Cargar desde Recurrente (Opcional)</label>
                      <select className="input-field" value={selectedRecurrentId} onChange={e => {
                        const recId = e.target.value;
                        setSelectedRecurrentId(recId);
                        if (recId) {
                           // Find the recurrent in gardenFlowers
                           let foundRec = null;
                           let fId = null;
                           let fColor = COLORS[0];
                           gardenFlowers.forEach(f => {
                             const rec = (f.recurrents || []).find(r => r.id === Number(recId));
                             if (rec) { foundRec = rec; fId = f.id; fColor = f.color; }
                           });
                           if (foundRec) {
                             // Fin = inicio + duración, dentro del día: si pasa de 1440 clamp a '00:00' (medianoche)
                             let emins = toMin(formData.startTime) + (foundRec.duration || 60);
                             if (emins > 1440) emins = 1440;
                             let calculatedEndTime = emins === 1440 ? '00:00' : toHHMM(emins);
                             setFormData({
                               ...formData, 
                               title: foundRec.title,
                               type: 'garden',
                               checklist: foundRec.checklist || [],
                               color: fColor,
                               flowerId: fId,
                               recurrentId: foundRec.id,
                               endTime: calculatedEndTime
                             });
                           }
                        } else {
                           setFormData({...formData, flowerId: null, recurrentId: null});
                        }
                      }}>
                        <option value="">-- No --</option>
                        {gardenFlowers.map(f => (
                          <optgroup key={f.id} label={f.title}>
                            {(() => {
                              const mainRecs = (f.recurrents || []).filter(r => !r.parentId);
                              return mainRecs.map(mainRec => {
                                const alts = (f.recurrents || []).filter(r => r.parentId === mainRec.id);
                                return (
                                  <React.Fragment key={mainRec.id}>
                                    <option value={mainRec.id}>{mainRec.title}</option>
                                    {alts.map(alt => (
                                      <option key={alt.id} value={alt.id}>{mainRec.title} - {alt.title}</option>
                                    ))}
                                  </React.Fragment>
                                );
                              });
                            })()}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Título</label>
                      <input className="input-field" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ej: Almuerzo, Estudiar..." />
                    </div>
                    <div>
                      <label>Tipo</label>
                      <select className="input-field" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                        <option value="work">Trabajo</option>
                        <option value="study">Estudio</option>
                        <option value="rest">Descanso</option>
                        <option value="family">Familia</option>
                        <option value="garden">Jardín (Meta)</option>
                      </select>
                    </div>
                 </div>

                 {modalMode !== 'view' && (
                   <div style={{marginBottom: '20px'}}>
                     <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Color</label>
                     <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                       {COLORS.map(c => (
                         <div 
                           key={c}
                           onClick={() => setFormData({...formData, color: c})}
                           style={{
                             width: '35px', height: '35px', borderRadius: '50%', backgroundColor: c, cursor: 'pointer',
                             border: formData.color === c ? '3px solid #fff' : '3px solid transparent',
                             outline: formData.color === c ? `2px solid ${c}` : 'none'
                           }}
                         />
                       ))}
                     </div>
                   </div>
                 )}

                 <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px'}}>
                    <div>
                      <label>Fecha</label>
                      <input type="date" className="input-field" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                    </div>
                    <div></div>
                    <div>
                      <label>Hora de Inicio</label>
                      <input type="time" className="input-field" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} />
                    </div>
                    <div>
                      <label>Hora de Fin</label>
                      <input type="time" className="input-field" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} />
                    </div>
                 </div>

                 {/* Recurrencia SOLO en creación */}
                 {modalMode === 'create' && (
                   <div style={{background: 'rgba(0,0,0,0.03)', padding: '15px', borderRadius: '12px', marginBottom: '20px'}}>
                      <label style={{display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold'}}>
                        <input type="checkbox" checked={formData.isRecurring} onChange={e => setFormData({...formData, isRecurring: e.target.checked})} />
                        Bloque recurrente
                      </label>
                      
                      {formData.isRecurring && (
                        <div style={{marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px'}}>
                          <div>
                            <label style={{fontSize: '0.9rem', color: '#666'}}>Se repite los días:</label>
                            <div style={{display: 'flex', gap: '5px', marginTop: '5px'}}>
                              {[{d:1,l:'L'}, {d:2,l:'M'}, {d:3,l:'X'}, {d:4,l:'J'}, {d:5,l:'V'}, {d:6,l:'S'}, {d:0,l:'D'}].map(day => (
                                <button 
                                  key={day.d}
                                  type="button"
                                  style={{
                                    width: '38px', height: '38px', borderRadius: '50%', fontSize: '0.85rem', fontWeight: '600',
                                    border: formData.recurrenceDays.includes(day.d) ? 'none' : '2px solid #ccc',
                                    background: formData.recurrenceDays.includes(day.d) ? 'var(--primary-color)' : 'transparent',
                                    color: formData.recurrenceDays.includes(day.d) ? 'white' : '#666'
                                  }}
                                  onClick={() => {
                                     const newDays = formData.recurrenceDays.includes(day.d) 
                                       ? formData.recurrenceDays.filter(x => x !== day.d)
                                       : [...formData.recurrenceDays, day.d];
                                     setFormData({...formData, recurrenceDays: newDays});
                                  }}
                                >
                                  {day.l}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                             <label style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                               <input type="checkbox" checked={formData.recurrenceForever} onChange={e => setFormData({...formData, recurrenceForever: e.target.checked})} />
                               Repetir por siempre
                             </label>
                             {!formData.recurrenceForever && (
                               <input type="date" className="input-field" style={{marginTop: 0, width: 'auto'}} value={formData.recurrenceEndDate} onChange={e => setFormData({...formData, recurrenceEndDate: e.target.value})} />
                             )}
                          </div>
                        </div>
                      )}
                   </div>
                 )}

                 {/* Checklist editable */}
                 <div style={{marginBottom: '30px'}}>
                   <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                     <h4 style={{margin: '0 0 10px 0'}}>Checklist (Sub-tareas)</h4>
                     <button type="button" onClick={() => setFormData({...formData, checklist: [...formData.checklist, { task: '', done: false }]})} style={{background: 'transparent', color: 'var(--primary-color)', fontWeight: 'bold'}}>+ Añadir Tarea</button>
                   </div>
                   {formData.checklist.map((item, i) => (
                     <div key={i} style={{display: 'flex', gap: '10px', marginBottom: '6px', alignItems: 'center'}}>
                        <input className="input-field" style={{flex: 1}} value={item.task} onChange={e => updateChecklist(i, e.target.value)} placeholder="Ej. 10 ejercicios de álgebra" />
                        <button type="button" onClick={() => removeChecklistItem(i)} style={{background: 'transparent', color: 'var(--danger-color)', padding: '5px', flexShrink: 0}}>
                          <X size={18}/>
                        </button>
                     </div>
                   ))}
                   {formData.checklist.length === 0 && <p style={{fontSize: '0.85rem', color: '#888'}}>No hay sub-tareas.</p>}
                 </div>

                 <div style={{display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '20px'}}>
                    <button className="primary" onClick={handleSaveBlock}>Guardar Bloque</button>
                 </div>
               </div>
             )}
          </div>
        </div>
      )}
      {showReward && <RewardAnimation rewardType={showReward} onClose={() => setShowReward(null)} />}
    </div>
  );
}
