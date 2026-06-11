import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Trash2, Pencil, Check } from 'lucide-react';
import { startOfWeek, addDays, format, isSameDay, addWeeks, subWeeks, isBefore, add } from 'date-fns';
import { es } from 'date-fns/locale';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const API_URL = 'http://localhost:3001/api';

// 1 hora = 50px. Calcula posicion exacta en px dado "HH:MM"
const timeToPixels = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h * 50) + ((m / 60) * 50);
};

// Drag & drop: snap al inicio de la hora (minuto 00)
const pixelsToHourSnap = (y) => {
  let h = Math.floor(y / 50);
  if (h < 0) h = 0;
  if (h > 23) h = 23;
  return `${h.toString().padStart(2, '0')}:00`;
};

export default function FieldMode() {
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [blocks, setBlocks] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [nextObjectives, setNextObjectives] = useState({});
  
  // Modal: dos modos - "view" (ver checklist y datos) y "edit" (editar)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'view' | 'edit'
  const [editingBlock, setEditingBlock] = useState(null);
  const [formData, setFormData] = useState({
    title: '', type: 'work', startTime: '09:00', endTime: '10:00', date: format(new Date(), 'yyyy-MM-dd'), 
    isRecurring: false, recurrenceEndDate: '', recurrenceForever: true, 
    recurrenceDays: [new Date().getDay()], checklist: []
  });

  // Semillas = flores del jardín sin bloques en el calendario esta semana
  const [gardenFlowers, setGardenFlowers] = useState([]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  const loadBlocks = () => {
    const start = format(currentWeekStart, 'yyyy-MM-dd');
    const end = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd');
    fetch(`${API_URL}/blocks?start=${start}&end=${end}`)
      .then(res => res.json())
      .then(data => setBlocks(data))
      .catch(err => console.error(err));
  };

  const loadFlowers = () => {
    fetch(`${API_URL}/flowers`)
      .then(res => res.json())
      .then(data => {
        setGardenFlowers(data);
        // Cargar el próximo objetivo para cada flor
        const objMap = {};
        data.forEach(f => {
          const nextObj = (f.objectives || []).find(o => !o.completed);
          if (nextObj) objMap[f.id] = nextObj;
        });
        setNextObjectives(objMap);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    loadBlocks();
    loadFlowers();
  }, [currentWeekStart]);

  const prevWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const nextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

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
    let newStartTime = pixelsToHourSnap(y);
    
    let [h] = newStartTime.split(':').map(Number);
    let newEndTime = `${(h+1).toString().padStart(2, '0')}:00`;
    if (h >= 23) newEndTime = '23:59';

    if (draggedItem.source === 'seed') {
      // Abrir modal de creación para la semilla
      openCreateModal({
        title: draggedItem.title || '',
        type: 'garden',
        startTime: newStartTime,
        endTime: newEndTime,
        date: format(targetDate, 'yyyy-MM-dd'),
        flowerId: draggedItem.id
      });
    } else if (draggedItem.source === 'calendar') {
      // Mover bloque existente - snap al inicio de la hora
      const oldStartPx = timeToPixels(draggedItem.startTime);
      const oldEndPx = timeToPixels(draggedItem.endTime);
      const durationPx = oldEndPx - oldStartPx;
      const newStartPx = timeToPixels(newStartTime);
      const newEndPx = newStartPx + durationPx;
      let calculatedEndTime;
      if (newEndPx > 24 * 50) {
        calculatedEndTime = '23:59';
      } else {
        const endH = Math.floor(newEndPx / 50);
        const endM = Math.round(((newEndPx / 50) - endH) * 60);
        calculatedEndTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      }

      const updatedDate = format(targetDate, 'yyyy-MM-dd');
      fetch(`${API_URL}/blocks/${draggedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draggedItem, date: updatedDate, startTime: newStartTime, endTime: calculatedEndTime })
      }).then(() => loadBlocks());
    }
  };

  const handleDropToSeeds = (e) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.source !== 'calendar') return;
    fetch(`${API_URL}/blocks/${draggedItem.id}`, { method: 'DELETE' }).then(() => loadBlocks());
  };

  // Click en espacio vacío del calendario -> crear bloque
  const handleClickEmptySpace = (e, targetDate) => {
    // Solo reaccionar si se hizo click directo en la columna del día (no en un bloque)
    if (e.target !== e.currentTarget && !e.target.classList.contains('day-grid-lines')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let clickedTime = pixelsToHourSnap(y);
    let [h] = clickedTime.split(':').map(Number);
    let endTime = `${(h+1).toString().padStart(2, '0')}:00`;
    if (h >= 23) endTime = '23:59';

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
    setFormData({
      title: defaults.title || '',
      type: defaults.type || 'work',
      startTime: defaults.startTime || '09:00',
      endTime: defaults.endTime || '10:00',
      date: defaults.date || format(new Date(), 'yyyy-MM-dd'),
      isRecurring: false,
      recurrenceEndDate: '',
      recurrenceForever: true,
      recurrenceDays: [new Date(defaults.date || Date.now()).getDay()],
      checklist: [],
      flowerId: defaults.flowerId || null
    });
    setModalOpen(true);
  };

  const openViewModal = (block) => {
    setEditingBlock(block);
    setModalMode('view');
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
      checklist: block.checklist || []
    });
    setModalOpen(true);
  };

  const switchToEditMode = () => {
    setModalMode('edit');
  };

  const saveBlock = () => {
    let datesToInsert = [];
    const recurrenceId = 'rec_' + Date.now();

    if (modalMode === 'create' && formData.isRecurring) {
      let currentDate = new Date(formData.date + 'T00:00:00');
      let limitDate;
      if (formData.recurrenceForever) {
         limitDate = add(currentDate, { years: 1 });
      } else if (formData.recurrenceEndDate) {
         limitDate = new Date(formData.recurrenceEndDate + 'T00:00:00');
      } else {
         limitDate = add(currentDate, { years: 1 });
      }
      
      while (isBefore(currentDate, limitDate) || isSameDay(currentDate, limitDate)) {
         if (formData.recurrenceDays.includes(currentDate.getDay())) {
             datesToInsert.push(format(currentDate, 'yyyy-MM-dd'));
         }
         currentDate = addDays(currentDate, 1);
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
      dates: datesToInsert,
      isRecurring: modalMode === 'create' ? formData.isRecurring : (editingBlock && editingBlock.isRecurring),
      recurrenceId: (modalMode === 'create' && formData.isRecurring) ? recurrenceId : (editingBlock && editingBlock.recurrenceId),
      checklist: formData.checklist,
      flowerId: formData.flowerId || null
    };

    if (modalMode === 'edit' && editingBlock) {
      // Edición de bloque existente (solo este bloque individual)
      fetch(`${API_URL}/blocks/${editingBlock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(() => {
        setModalOpen(false);
        loadBlocks();
      });
    } else {
      // Creación nueva
      fetch(`${API_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(() => {
        setModalOpen(false);
        loadBlocks();
      });
    }
  };

  const deleteBlock = (deleteFollowing = false) => {
    let url = `${API_URL}/blocks/${editingBlock.id}`;
    if (deleteFollowing && editingBlock.recurrenceId) {
      url += `?deleteFollowing=true&recurrenceId=${editingBlock.recurrenceId}&date=${editingBlock.date}`;
    }
    fetch(url, { method: 'DELETE' }).then(() => {
      setModalOpen(false);
      loadBlocks();
    });
  };

  const toggleChecklistItem = (index) => {
    if (modalMode !== 'view') return;
    const newChecklist = [...formData.checklist];
    newChecklist[index] = { ...newChecklist[index], done: !newChecklist[index].done };
    setFormData({...formData, checklist: newChecklist});
    
    // Guardar el cambio en la BD inmediatamente
    if (editingBlock) {
      fetch(`${API_URL}/blocks/${editingBlock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingBlock, checklist: newChecklist })
      }).then(() => loadBlocks());
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
           <h2 style={{ margin: 0, marginBottom: '10px' }}>Modo Campo: Rutina Diaria</h2>
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
                 onDragStart={(e) => handleDragStart(e, seed, 'seed')} onDragEnd={handleDragEnd}
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
              {HOURS.map(h => <div key={h} className="time-slot">{h.toString().padStart(2,'0')}:00</div>)}
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
                  {blocks.filter(b => b.date === dateStr).map(b => {
                    const startPx = timeToPixels(b.startTime);
                    const endPx = timeToPixels(b.endTime);
                    const heightPx = Math.max(endPx - startPx, 20);
                    const checklistArr = Array.isArray(b.checklist) ? b.checklist : [];
                    const doneCount = checklistArr.filter(c => c.done).length;

                    const nextObj = b.flowerId ? nextObjectives[b.flowerId] : null;

                    return (
                      <div 
                        key={b.id} 
                        className={`block-card block-type-${b.type}`} 
                        style={{ top: `${startPx}px`, height: `${heightPx}px` }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, b, 'calendar')} 
                        onDragEnd={handleDragEnd}
                        onClick={(e) => { e.stopPropagation(); openViewModal(b); }}
                      >
                        <div className="block-title">{b.title}</div>
                        <div className="block-time">{b.startTime} - {b.endTime}</div>
                        {checklistArr.length > 0 && (
                          <div style={{fontSize: '0.7rem', marginTop: '2px', opacity: 0.8}}>
                            {doneCount}/{checklistArr.length} tareas
                          </div>
                        )}
                        {nextObj && heightPx > 40 && (
                          <div style={{fontSize: '0.65rem', marginTop: '2px', color: 'var(--primary-color)', fontWeight: '600', opacity: 0.9}}>
                            Meta: {nextObj.title}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                 {editingBlock.flowerId && nextObjectives[editingBlock.flowerId] && (
                   <div style={{background: 'rgba(74,124,89,0.06)', padding: '15px', borderRadius: '12px', marginBottom: '20px', borderLeft: '4px solid var(--primary-color)'}}>
                     <div style={{fontSize: '0.8rem', color: '#888', marginBottom: '5px'}}>Objetivo próximo de esta meta:</div>
                     <div style={{fontWeight: '600', color: 'var(--primary-color)'}}>{nextObjectives[editingBlock.flowerId].title}</div>
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
                 </div>

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
                      <label>Título</label>
                      <input className="input-field" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ej: Almuerzo, Estudiar Álgebra..." />
                    </div>
                    <div>
                      <label>Tipo (Color)</label>
                      <select className="input-field" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                        <option value="work">Trabajo</option>
                        <option value="study">Estudio</option>
                        <option value="rest">Descanso</option>
                        <option value="family">Familia</option>
                        <option value="garden">Jardín (Meta)</option>
                      </select>
                    </div>
                 </div>

                 <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px'}}>
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
                    <button className="primary" onClick={saveBlock}>Guardar Bloque</button>
                 </div>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
}
