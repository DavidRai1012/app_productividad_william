import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, GripVertical, Check, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getFlowerImage } from '../flowerImages';
import FLOWER_IMAGES from '../flowerImages';

const API_URL = 'http://localhost:3001/api';
const DAY_LABELS = [{d:1,l:'L'}, {d:2,l:'M'}, {d:3,l:'X'}, {d:4,l:'J'}, {d:5,l:'V'}, {d:6,l:'S'}, {d:0,l:'D'}];

export default function GardenMode() {
  const [flowers, setFlowers] = useState([]);
  const [selectedFlower, setSelectedFlower] = useState(null);
  
  // Crear flor
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlowerTitle, setNewFlowerTitle] = useState('');
  const [newFlowerImage, setNewFlowerImage] = useState(0);

  // Crear/editar recurrente
  const [recurrentModal, setRecurrentModal] = useState(false);
  const [editingRecurrent, setEditingRecurrent] = useState(null);
  const [recForm, setRecForm] = useState({ title: '', startTime: '09:00', endTime: '10:00', days: [], checklist: [] });

  // Drag para objetivos
  const [dragIdx, setDragIdx] = useState(null);

  const loadFlowers = useCallback(() => {
    fetch(`${API_URL}/flowers`)
      .then(r => r.json())
      .then(data => {
        setFlowers(data);
        // Si tenemos una flor seleccionada, actualizarla
        if (selectedFlower) {
          const updated = data.find(f => f.id === selectedFlower.id);
          if (updated) setSelectedFlower(updated);
        }
      })
      .catch(err => console.error(err));
  }, [selectedFlower]);

  useEffect(() => { loadFlowers(); }, []);

  // === CREAR FLOR ===
  const createFlower = () => {
    if (!newFlowerTitle.trim()) return;
    fetch(`${API_URL}/flowers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newFlowerTitle, imageIndex: newFlowerImage })
    }).then(() => {
      setShowCreateModal(false);
      setNewFlowerTitle('');
      setNewFlowerImage(0);
      loadFlowers();
    });
  };

  // === OBJETIVOS ===
  const addObjective = () => {
    const title = prompt("Nombre del objetivo:");
    if (!title || !selectedFlower) return;
    const orderIndex = (selectedFlower.objectives || []).length;
    fetch(`${API_URL}/objectives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowerId: selectedFlower.id, title, orderIndex })
    }).then(() => loadFlowers());
  };

  const toggleObjective = (obj) => {
    fetch(`${API_URL}/objectives/${obj.id}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !obj.completed })
    }).then(() => loadFlowers());
  };

  const deleteObjective = (obj) => {
    fetch(`${API_URL}/objectives/${obj.id}`, { method: 'DELETE' }).then(() => loadFlowers());
  };

  // Drag & drop para reordenar objetivos
  const handleObjDragStart = (i) => setDragIdx(i);
  const handleObjDragOver = (e) => e.preventDefault();
  const handleObjDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx || !selectedFlower) return;
    const objs = [...selectedFlower.objectives];
    const [moved] = objs.splice(dragIdx, 1);
    objs.splice(targetIdx, 0, moved);
    const reordered = objs.map((o, i) => ({ id: o.id, orderIndex: i }));
    fetch(`${API_URL}/objectives/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectives: reordered })
    }).then(() => loadFlowers());
    setDragIdx(null);
  };

  // === RECURRENTES ===
  const openRecurrentCreate = () => {
    setEditingRecurrent(null);
    setRecForm({ title: '', startTime: '09:00', endTime: '10:00', days: [], checklist: [] });
    setRecurrentModal(true);
  };

  const openRecurrentEdit = (rec) => {
    setEditingRecurrent(rec);
    setRecForm({
      title: rec.title,
      startTime: rec.startTime,
      endTime: rec.endTime,
      days: rec.days || [],
      checklist: rec.checklist || []
    });
    setRecurrentModal(true);
  };

  const saveRecurrent = () => {
    if (!recForm.title.trim() || !selectedFlower) return;
    if (editingRecurrent) {
      fetch(`${API_URL}/flower-recurrents/${editingRecurrent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recForm)
      }).then(() => { setRecurrentModal(false); loadFlowers(); });
    } else {
      fetch(`${API_URL}/flower-recurrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recForm, flowerId: selectedFlower.id })
      }).then(() => { setRecurrentModal(false); loadFlowers(); });
    }
  };

  const deleteRecurrent = (rec) => {
    if (!window.confirm("¿Eliminar este recurrente y sus bloques futuros?")) return;
    fetch(`${API_URL}/flower-recurrents/${rec.id}`, { method: 'DELETE' }).then(() => loadFlowers());
  };

  const getFlowerStatus = (progress) => {
    if (progress >= 100) return 'Cosechada';
    if (progress >= 75) return 'Casi lista';
    if (progress >= 50) return 'Floreciendo';
    if (progress >= 25) return 'Creciendo';
    if (progress > 0) return 'Brotando';
    return 'Semilla';
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>Mi Jardín</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666' }}>El lugar donde tus grandes metas florecen.</p>
        </div>
        <button className="primary" style={{ padding: '12px 24px', fontSize: '1.05rem', borderRadius: '30px' }} onClick={() => setShowCreateModal(true)}>
          + Plantar Nueva Semilla
        </button>
      </div>

      {/* Grid de flores */}
      <div className="garden-grid">
        {flowers.length === 0 && <p style={{color: '#888'}}>Tu jardín está vacío. Planta una semilla para comenzar.</p>}
        {flowers.map(flower => {
          const img = getFlowerImage(flower.imageIndex !== undefined ? flower.imageIndex + 1 : flower.id);
          return (
            <div key={flower.id} className="flower-pot glass" onClick={() => setSelectedFlower(flower)}>
              <div style={{marginBottom: '12px'}}>
                <img src={img} alt={flower.title}
                  style={{width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-color)'}}
                />
              </div>
              <h3 style={{margin: '0 0 10px 0', fontSize: '0.95rem', color: 'var(--text-color)', wordBreak: 'break-word'}}>{flower.title}</h3>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${flower.progress || 0}%` }}></div>
              </div>
              <p className="flower-status">{flower.progress || 0}% - {getFlowerStatus(flower.progress || 0)}</p>
            </div>
          );
        })}
      </div>

      {/* ====== MODAL: CREAR FLOR (con selector de imagen) ====== */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content glass" style={{maxWidth: '600px'}} onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowCreateModal(false)}><X /></button>
            <h2 style={{marginTop: 0}}>Plantar Nueva Semilla</h2>
            
            <div style={{marginBottom: '20px'}}>
              <label>Nombre de tu meta</label>
              <input className="input-field" value={newFlowerTitle} onChange={e => setNewFlowerTitle(e.target.value)} placeholder="Ej: Aprender Piano, Correr 5K..." />
            </div>

            <div style={{marginBottom: '20px'}}>
              <label>Elige tu flor</label>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px', marginTop: '10px', maxHeight: '250px', overflowY: 'auto', padding: '5px'}}>
                {Array.from({length: 30}, (_, i) => (
                  <div 
                    key={i}
                    onClick={() => setNewFlowerImage(i)}
                    style={{
                      cursor: 'pointer', borderRadius: '50%', overflow: 'hidden',
                      border: newFlowerImage === i ? '3px solid var(--primary-color)' : '3px solid transparent',
                      boxShadow: newFlowerImage === i ? '0 0 12px rgba(74,124,89,0.4)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    <img src={getFlowerImage(i + 1)} alt="" style={{width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block'}} />
                  </div>
                ))}
              </div>
            </div>

            <button className="primary" onClick={createFlower} style={{width: '100%'}}>Plantar</button>
          </div>
        </div>
      )}

      {/* ====== MODAL: DETALLE DE FLOR (Objetivos + Recurrentes) ====== */}
      {selectedFlower && !showCreateModal && (
        <div className="modal-overlay" onClick={() => setSelectedFlower(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedFlower(null)}><X /></button>
            
            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
              <img 
                src={getFlowerImage(selectedFlower.imageIndex !== undefined ? selectedFlower.imageIndex + 1 : selectedFlower.id)} 
                alt={selectedFlower.title}
                style={{width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-color)', flexShrink: 0}}
              />
              <div style={{flex: 1, minWidth: 0}}>
                <h2 style={{ margin: 0, color: 'var(--primary-color)', wordBreak: 'break-word' }}>{selectedFlower.title}</h2>
                <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>{getFlowerStatus(selectedFlower.progress || 0)}</p>
              </div>
            </div>

            {/* Barra de progreso */}
            <div style={{ marginBottom: '25px' }}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                <span style={{fontSize: '0.85rem', color: '#888'}}>Progreso</span>
                <span style={{fontSize: '0.85rem', fontWeight: '600'}}>{selectedFlower.progress || 0}%</span>
              </div>
              <div className="progress-container" style={{ height: '10px' }}>
                <div className="progress-bar" style={{ width: `${selectedFlower.progress || 0}%` }}></div>
              </div>
            </div>

            {/* Dos columnas: Objetivos | Recurrentes */}
            <div className="modal-grid">
              {/* COLUMNA 1: OBJETIVOS */}
              <div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--primary-color)', paddingBottom: '10px', marginBottom: '15px'}}>
                  <h4 style={{margin: 0}}>Objetivos</h4>
                  <button onClick={addObjective} style={{background: 'var(--primary-color)', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0}}>
                    <Plus size={16}/>
                  </button>
                </div>

                {(selectedFlower.objectives || []).length === 0 && (
                  <p style={{color: '#888', fontSize: '0.85rem'}}>Agrega objetivos para medir el progreso de esta meta.</p>
                )}

                <div>
                  {(selectedFlower.objectives || []).map((obj, i) => (
                    <div
                      key={obj.id}
                      draggable
                      onDragStart={() => handleObjDragStart(i)}
                      onDragOver={handleObjDragOver}
                      onDrop={() => handleObjDrop(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 8px',
                        background: obj.completed ? 'rgba(74,124,89,0.06)' : 'rgba(0,0,0,0.02)',
                        borderRadius: '8px', marginBottom: '6px', cursor: 'grab',
                        borderLeft: obj.completed ? '3px solid var(--primary-color)' : '3px solid transparent'
                      }}
                    >
                      <GripVertical size={14} style={{color: '#ccc', flexShrink: 0, cursor: 'grab'}} />
                      <span style={{color: '#aaa', fontSize: '0.75rem', flexShrink: 0, width: '20px'}}>{i+1}.</span>
                      <div
                        onClick={() => toggleObjective(obj)}
                        style={{
                          width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0, cursor: 'pointer',
                          border: obj.completed ? 'none' : '2px solid var(--primary-color)',
                          background: obj.completed ? 'var(--primary-color)' : 'transparent',
                          display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white'
                        }}
                      >
                        {obj.completed && <Check size={12}/>}
                      </div>
                      <span style={{flex: 1, textDecoration: obj.completed ? 'line-through' : 'none', opacity: obj.completed ? 0.5 : 1, fontSize: '0.9rem'}}>
                        {obj.title}
                      </span>
                      <button onClick={() => deleteObjective(obj)} style={{background: 'transparent', color: '#ccc', padding: '3px'}}>
                        <X size={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* COLUMNA 2: RECURRENTES */}
              <div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--accent-color)', paddingBottom: '10px', marginBottom: '15px'}}>
                  <h4 style={{margin: 0}}>Recurrentes</h4>
                  <button onClick={openRecurrentCreate} style={{background: 'var(--accent-color)', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0}}>
                    <Plus size={16}/>
                  </button>
                </div>

                {(selectedFlower.recurrents || []).length === 0 && (
                  <p style={{color: '#888', fontSize: '0.85rem'}}>Crea bloques recurrentes que aparezcan en tu Modo Campo.</p>
                )}

                {(selectedFlower.recurrents || []).map(rec => (
                  <div key={rec.id} style={{background: 'rgba(0,0,0,0.02)', borderRadius: '10px', padding: '12px', marginBottom: '10px', borderLeft: '3px solid var(--accent-color)'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div>
                        <div style={{fontWeight: '600', fontSize: '0.9rem'}}>{rec.title}</div>
                        <div style={{fontSize: '0.8rem', color: '#888', marginTop: '3px'}}>
                          {rec.startTime} - {rec.endTime}
                        </div>
                      </div>
                      <div style={{display: 'flex', gap: '5px'}}>
                        <button onClick={() => openRecurrentEdit(rec)} style={{background: 'transparent', color: 'var(--primary-color)', padding: '4px'}}><Pencil size={14}/></button>
                        <button onClick={() => deleteRecurrent(rec)} style={{background: 'transparent', color: 'var(--danger-color)', padding: '4px'}}><Trash2 size={14}/></button>
                      </div>
                    </div>
                    <div style={{display: 'flex', gap: '4px', marginTop: '8px'}}>
                      {DAY_LABELS.map(day => (
                        <span key={day.d} style={{
                          width: '24px', height: '24px', borderRadius: '50%', fontSize: '0.7rem', fontWeight: '600',
                          display: 'flex', justifyContent: 'center', alignItems: 'center',
                          background: (rec.days || []).includes(day.d) ? 'var(--accent-color)' : 'rgba(0,0,0,0.05)',
                          color: (rec.days || []).includes(day.d) ? 'white' : '#aaa'
                        }}>
                          {day.l}
                        </span>
                      ))}
                    </div>
                    {(rec.checklist || []).length > 0 && (
                      <div style={{fontSize: '0.75rem', color: '#888', marginTop: '6px'}}>{rec.checklist.length} sub-tareas</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODAL: CREAR/EDITAR RECURRENTE ====== */}
      {recurrentModal && (
        <div className="modal-overlay" onClick={() => setRecurrentModal(false)} style={{zIndex: 1100}}>
          <div className="modal-content glass" style={{maxWidth: '550px'}} onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setRecurrentModal(false)}><X /></button>
            <h2 style={{marginTop: 0}}>{editingRecurrent ? 'Editar Recurrente' : 'Nuevo Recurrente'}</h2>

            <div style={{marginBottom: '15px'}}>
              <label>Título</label>
              <input className="input-field" value={recForm.title} onChange={e => setRecForm({...recForm, title: e.target.value})} placeholder="Ej: Practicar escalas" />
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px'}}>
              <div>
                <label>Hora de Inicio</label>
                <input type="time" className="input-field" value={recForm.startTime} onChange={e => setRecForm({...recForm, startTime: e.target.value})} />
              </div>
              <div>
                <label>Hora de Fin</label>
                <input type="time" className="input-field" value={recForm.endTime} onChange={e => setRecForm({...recForm, endTime: e.target.value})} />
              </div>
            </div>

            <div style={{marginBottom: '15px'}}>
              <label>Se repite los días:</label>
              <div style={{display: 'flex', gap: '5px', marginTop: '8px'}}>
                {DAY_LABELS.map(day => (
                  <button
                    key={day.d} type="button"
                    style={{
                      width: '38px', height: '38px', borderRadius: '50%', fontSize: '0.85rem', fontWeight: '600',
                      border: recForm.days.includes(day.d) ? 'none' : '2px solid #ccc',
                      background: recForm.days.includes(day.d) ? 'var(--accent-color)' : 'transparent',
                      color: recForm.days.includes(day.d) ? 'white' : '#666'
                    }}
                    onClick={() => {
                      const newDays = recForm.days.includes(day.d)
                        ? recForm.days.filter(x => x !== day.d)
                        : [...recForm.days, day.d];
                      setRecForm({...recForm, days: newDays});
                    }}
                  >
                    {day.l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom: '20px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                <label>Checklist</label>
                <button type="button" onClick={() => setRecForm({...recForm, checklist: [...recForm.checklist, {task: '', done: false}]})} style={{background: 'transparent', color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '0.85rem'}}>+ Tarea</button>
              </div>
              {recForm.checklist.map((item, i) => (
                <div key={i} style={{display: 'flex', gap: '8px', marginBottom: '5px', alignItems: 'center'}}>
                  <input className="input-field" style={{flex: 1}} value={item.task} onChange={e => {
                    const c = [...recForm.checklist]; c[i] = {...c[i], task: e.target.value}; setRecForm({...recForm, checklist: c});
                  }} placeholder="Sub-tarea..." />
                  <button type="button" onClick={() => {
                    setRecForm({...recForm, checklist: recForm.checklist.filter((_,j) => j !== i)});
                  }} style={{background: 'transparent', color: 'var(--danger-color)', padding: '4px'}}><X size={16}/></button>
                </div>
              ))}
              {recForm.checklist.length === 0 && <p style={{fontSize: '0.8rem', color: '#888'}}>Sin sub-tareas.</p>}
            </div>

            <button className="primary" onClick={saveRecurrent} style={{width: '100%'}}>
              {editingRecurrent ? 'Guardar Cambios' : 'Crear Recurrente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
