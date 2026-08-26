import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, GripVertical, Check, Pencil, Trash2, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { SPECIES, DEFAULT_SPECIES_ID, getSpecies, isSpeciesUnlocked, stageForProgress } from '../species';
import { apiFetch } from '../api';

const DAY_LABELS = [{d:1,l:'L'}, {d:2,l:'M'}, {d:3,l:'X'}, {d:4,l:'J'}, {d:5,l:'V'}, {d:6,l:'S'}, {d:0,l:'D'}];

export default function GardenMode() {
  const [flowers, setFlowers] = useState([]);
  const [selectedFlower, setSelectedFlower] = useState(null);
  // Rutas de imagen desbloqueadas con Semillas Raras (GET /unlocked-images)
  const [unlockedPaths, setUnlockedPaths] = useState([]);

  // Crear flor
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlowerTitle, setNewFlowerTitle] = useState('');
  const [newFlowerSpecies, setNewFlowerSpecies] = useState(DEFAULT_SPECIES_ID);
  const COLORS = ['#4a7c59', '#d8a45e', '#a35050', '#507fa3', '#8550a3', '#a3508f', '#e67c45', '#45e69e'];
  const [newFlowerColor, setNewFlowerColor] = useState(COLORS[0]);

  // Crear/editar recurrente
  const [recurrentModal, setRecurrentModal] = useState(false);
  const [editingRecurrent, setEditingRecurrent] = useState(null);
  const [recForm, setRecForm] = useState({ title: '', duration: 60, checklist: [], parentId: null });
  const [selectedAltIndex, setSelectedAltIndex] = useState({});

  // Drag para objetivos
  const [dragIdx, setDragIdx] = useState(null);

  // Crear objetivo modal
  const [objectiveModalOpen, setObjectiveModalOpen] = useState(false);
  const [newObjectiveTitle, setNewObjectiveTitle] = useState('');
  const [newObjMeasurable, setNewObjMeasurable] = useState(false);
  const [newObjDueDate, setNewObjDueDate] = useState('');

  const loadUnlocked = useCallback(() => {
    apiFetch('/unlocked-images')
      .then(data => {
        if (!Array.isArray(data)) return;
        setUnlockedPaths(data.map(u => u.imagePath));
      })
      .catch(err => console.error('Error cargando desbloqueos:', err));
  }, []);

  const loadFlowers = useCallback(() => {
    apiFetch('/flowers')
      .then(data => {
        if (!Array.isArray(data)) return;
        setFlowers(data);
        // Si tenemos una flor seleccionada, actualizarla
        if (selectedFlower) {
          const updated = data.find(f => f.id === selectedFlower.id);
          if (updated) setSelectedFlower(updated);
        }
      })
      .catch(err => console.error('Error cargando flores:', err));
    // Los desbloqueos se refrescan junto con las flores tras cada acción
    loadUnlocked();
  }, [selectedFlower, loadUnlocked]);

  useEffect(() => { loadFlowers(); }, []);

  // === CREAR FLOR ===
  const createFlower = () => {
    if (!newFlowerTitle.trim()) return;
    apiFetch('/flowers', {
      method: 'POST',
      body: { title: newFlowerTitle, color: newFlowerColor, species: newFlowerSpecies }
    }).then(() => {
      setShowCreateModal(false);
      setNewFlowerTitle('');
      setNewFlowerSpecies(DEFAULT_SPECIES_ID);
      setNewFlowerColor(COLORS[0]);
      loadFlowers();
    }).catch(err => console.error('Error creando flor:', err));
  };

  // === OBJETIVOS ===
  const openObjectiveModal = () => {
    setNewObjectiveTitle('');
    setObjectiveModalOpen(true);
  };

  const saveObjective = () => {
    if (!newObjectiveTitle.trim() || !selectedFlower) return;
    const orderIndex = (selectedFlower.objectives || []).length;
    apiFetch('/objectives', {
      method: 'POST',
      body: {
        flowerId: selectedFlower.id,
        title: newObjectiveTitle,
        orderIndex,
        isMeasurable: newObjMeasurable,
        dueDate: newObjMeasurable ? newObjDueDate : null
      }
    }).then(() => {
      setObjectiveModalOpen(false);
      setNewObjMeasurable(false);
      setNewObjDueDate('');
      loadFlowers();
    }).catch(err => console.error('Error creando objetivo:', err));
  };

  const toggleObjective = (obj) => {
    // Completar el ÚLTIMO objetivo cierra la meta y elimina sus bloques/recurrentes
    // futuros de forma irreversible: se confirma antes (el toggle es un click casual).
    if (!obj.completed && selectedFlower && Array.isArray(selectedFlower.objectives)) {
      const pending = selectedFlower.objectives.filter(o => !o.completed);
      if (pending.length === 1 && pending[0].id === obj.id) {
        const ok = confirm(`¡Este es el último objetivo de "${selectedFlower.title}"! Al completarlo, la meta se dará por cumplida y se eliminarán sus bloques y recurrentes futuros (los de hoy se conservan). ¿Continuar?`);
        if (!ok) return;
      }
    }
    apiFetch(`/objectives/${obj.id}/complete`, {
      method: 'PUT',
      body: { completed: !obj.completed }
    }).then(() => loadFlowers())
      .catch(err => console.error('Error actualizando objetivo:', err));
  };

  const deleteObjective = (obj) => {
    apiFetch(`/objectives/${obj.id}`, { method: 'DELETE' })
      .then(() => loadFlowers())
      .catch(err => console.error('Error eliminando objetivo:', err));
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
    apiFetch('/objectives/reorder', {
      method: 'PUT',
      body: { objectives: reordered }
    }).then(() => loadFlowers())
      .catch(err => console.error('Error reordenando objetivos:', err));
    setDragIdx(null);
  };

  // === RECURRENTES ===
  const openRecurrentCreate = () => {
    setEditingRecurrent(null);
    setRecForm({ title: '', duration: 60, checklist: [], parentId: null });
    setRecurrentModal(true);
  };

  const openAlternativeCreate = (parentId) => {
    setEditingRecurrent(null);
    setRecForm({ title: '', duration: 60, checklist: [], parentId });
    setRecurrentModal(true);
  };

  const openRecurrentEdit = (rec) => {
    setEditingRecurrent(rec);
    setRecForm({
      title: rec.title,
      duration: rec.duration || 60,
      checklist: Array.isArray(rec.checklist) ? rec.checklist : [],
      parentId: rec.parentId || null
    });
    setRecurrentModal(true);
  };

  const saveRecurrent = () => {
    if (!recForm.title.trim() || !selectedFlower) return;
    if (editingRecurrent) {
      apiFetch(`/flower-recurrents/${editingRecurrent.id}`, {
        method: 'PUT',
        body: recForm
      }).then(() => { setRecurrentModal(false); loadFlowers(); })
        .catch(err => console.error('Error guardando recurrente:', err));
    } else {
      apiFetch('/flower-recurrents', {
        method: 'POST',
        body: { ...recForm, flowerId: selectedFlower.id }
      }).then(() => { setRecurrentModal(false); loadFlowers(); })
        .catch(err => console.error('Error creando recurrente:', err));
    }
  };

  const deleteRecurrent = (rec) => {
    if (!window.confirm("¿Eliminar este recurrente y sus bloques futuros?")) return;
    apiFetch(`/flower-recurrents/${rec.id}`, { method: 'DELETE' })
      .then(() => loadFlowers())
      .catch(err => console.error('Error eliminando recurrente:', err));
  };

  const getFlowerStatus = (progress) => {
    if (progress >= 100) return 'Cosechada';
    if (progress >= 75) return 'Casi lista';
    if (progress >= 50) return 'Floreciendo';
    if (progress >= 25) return 'Creciendo';
    if (progress > 0) return 'Brotando';
    return 'Semilla';
  };

  const deleteFlower = () => {
    if (!selectedFlower) return;
    const confirmMsg = "⚠️ ¿Estás seguro de que quieres arrancar esta flor de tu jardín?\n\nPerderás todo el progreso, los objetivos cumplidos, y se eliminarán todos los bloques futuros asociados a ella.\n\nEsta acción es irreversible. ¿Deseas continuar?";
    if (!window.confirm(confirmMsg)) return;
    apiFetch(`/flowers/${selectedFlower.id}`, { method: 'DELETE' }).then(() => {
      setSelectedFlower(null);
      loadFlowers();
    }).catch(err => console.error('Error eliminando flor:', err));
  };


  const getHealthClass = (health) => {
    const h = health !== undefined ? health : 100;
    if (h >= 70) return 'flower-healthy';
    if (h >= 40) return 'flower-thirsty';
    if (h >= 10) return 'flower-wilting';
    return 'flower-dying';
  };

  const getHealthColor = (health) => {
    const h = health !== undefined ? health : 100;
    if (h >= 70) return '#81b29a';
    if (h >= 40) return '#d8a45e';
    if (h >= 10) return '#e07a5f';
    return '#888';
  };

  const rescheduleObjective = (obj) => {
    const newDate = window.prompt('Nueva fecha limite (YYYY-MM-DD):');
    if (!newDate) return;
    const trimmed = newDate.trim();
    const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const isRealDate = isValidFormat && !isNaN(new Date(`${trimmed}T00:00:00`).getTime());
    if (!isValidFormat || !isRealDate) {
      alert('Fecha invalida. Usa el formato YYYY-MM-DD (ej. 2026-09-15) con una fecha real.');
      return;
    }
    apiFetch(`/objectives/${obj.id}/reschedule`, {
      method: 'POST',
      body: { dueDate: trimmed }
    }).then(() => loadFlowers())
      .catch(err => console.error('Error reprogramando objetivo:', err));
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
          const prog = flower.progress || 0;
          const img = stageForProgress(getSpecies(flower.species), prog);

          return (
            <div key={flower.id} className="flower-pot glass" onClick={() => setSelectedFlower(flower)}>
              <div style={{marginBottom: '12px'}}>
                <img src={img} alt={flower.title}
                  className={getHealthClass(flower.health)}
                  style={{width: '80px', height: '80px', borderRadius: '50%', objectFit: 'contain', border: '3px solid var(--primary-color)', transition: 'all 0.5s ease-in-out'}}
                />
              </div>
              <h3 style={{margin: '0 0 10px 0', fontSize: '0.95rem', color: 'var(--text-color)', wordBreak: 'break-word'}}>{flower.title}</h3>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${prog}%` }}></div>
              </div>
              <div className="health-bar-container">
                <div className="health-bar" style={{ width: `${flower.health !== undefined ? flower.health : 100}%`, background: getHealthColor(flower.health) }}></div>
              </div>
              <p className="flower-status">{prog}% - {getFlowerStatus(prog)}</p>
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
              <label>Elige tu especie</label>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px', maxHeight: '280px', overflowY: 'auto', padding: '5px'}}>
                {SPECIES.map(sp => {
                  const unlocked = isSpeciesUnlocked(sp, unlockedPaths);
                  const isSelected = newFlowerSpecies === sp.id;
                  return (
                    <div
                      key={sp.id}
                      onClick={() => { if (unlocked) setNewFlowerSpecies(sp.id); }}
                      title={unlocked ? sp.name : `${sp.name} — Se desbloquea con Semillas Raras al cosechar`}
                      style={{
                        cursor: unlocked ? 'pointer' : 'not-allowed',
                        borderRadius: '12px', padding: '8px', textAlign: 'center',
                        border: isSelected ? '3px solid var(--primary-color)' : '3px solid transparent',
                        boxShadow: isSelected ? '0 0 12px rgba(74,124,89,0.4)' : 'none',
                        background: 'rgba(0,0,0,0.02)',
                        opacity: unlocked ? 1 : 0.45,
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{position: 'relative'}}>
                        <img
                          src={sp.stages[sp.stages.length - 1]}
                          alt={sp.name}
                          style={{width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', borderRadius: '50%', filter: unlocked ? 'none' : 'grayscale(1)'}}
                        />
                        {!unlocked && (
                          <div style={{position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <Lock size={22} style={{color: '#555', background: 'rgba(255,255,255,0.75)', borderRadius: '50%', padding: '4px'}} />
                          </div>
                        )}
                      </div>
                      <div style={{fontSize: '0.75rem', marginTop: '6px', fontWeight: isSelected ? '600' : '400', color: 'var(--text-color)', wordBreak: 'break-word'}}>
                        {sp.name}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{fontSize: '0.8rem', color: '#888', marginTop: '8px', marginBottom: 0}}>
                🔒 Las especies bloqueadas se desbloquean con Semillas Raras al cosechar bloques.
              </p>
            </div>

            <div style={{marginBottom: '30px'}}>
              <label>Color de la Flor</label>
              <div style={{display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap'}}>
                {COLORS.map(c => (
                  <div 
                    key={c}
                    onClick={() => setNewFlowerColor(c)}
                    style={{
                      width: '35px', height: '35px', borderRadius: '50%', backgroundColor: c, cursor: 'pointer',
                      border: newFlowerColor === c ? '3px solid #fff' : '3px solid transparent',
                      outline: newFlowerColor === c ? `2px solid ${c}` : 'none'
                    }}
                  />
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
                src={stageForProgress(getSpecies(selectedFlower.species), selectedFlower.progress)}
                alt={selectedFlower.title}
                style={{width: '60px', height: '60px', borderRadius: '50%', objectFit: 'contain', border: '3px solid var(--primary-color)', flexShrink: 0}}
              />
              <div style={{flex: 1, minWidth: 0}}>
                <h2 style={{ margin: 0, color: 'var(--primary-color)', wordBreak: 'break-word' }}>{selectedFlower.title}</h2>
                <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                  {getFlowerStatus(selectedFlower.progress || 0)}
                  <span style={{ color: '#999', fontSize: '0.8rem' }}> · {getSpecies(selectedFlower.species).name}</span>
                </p>
              </div>
              <button 
                onClick={deleteFlower} 
                style={{background: 'rgba(224,122,95,0.1)', color: 'var(--danger-color)', border: 'none', padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0}}
                title="Eliminar esta flor"
              >
                <Trash2 size={16}/>
                Eliminar
              </button>
            </div>

            {/* Barra de progreso */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                <span style={{fontSize: '0.85rem', color: '#888'}}>Progreso</span>
                <span style={{fontSize: '0.85rem', fontWeight: '600'}}>{selectedFlower.progress || 0}%</span>
              </div>
              <div className="progress-container" style={{ height: '10px' }}>
                <div className="progress-bar" style={{ width: `${selectedFlower.progress || 0}%` }}></div>
              </div>
            </div>

            {/* Barra de salud */}
            <div style={{ marginBottom: '25px' }}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                <span style={{fontSize: '0.85rem', color: '#888'}}>Salud</span>
                <span style={{fontSize: '0.85rem', fontWeight: '600', color: getHealthColor(selectedFlower.health)}}>{selectedFlower.health !== undefined ? selectedFlower.health : 100}%</span>
              </div>
              <div className="health-bar-container" style={{ height: '8px' }}>
                <div className="health-bar" style={{ width: `${selectedFlower.health !== undefined ? selectedFlower.health : 100}%`, background: getHealthColor(selectedFlower.health) }}></div>
              </div>
            </div>

            {/* Dos columnas: Objetivos | Recurrentes */}
            <div className="modal-grid">
              {/* COLUMNA 1: OBJETIVOS */}
              <div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--primary-color)', paddingBottom: '10px', marginBottom: '15px'}}>
                  <h4 style={{margin: 0}}>Objetivos</h4>
                  <button onClick={openObjectiveModal} style={{background: 'var(--primary-color)', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0}}>
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
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 8px',
                        background: obj.completed ? 'rgba(74,124,89,0.06)' : obj.shieldBroken ? 'rgba(224,122,95,0.06)' : 'rgba(0,0,0,0.02)',
                        borderRadius: '8px', marginBottom: '6px', cursor: 'grab',
                        borderLeft: obj.completed ? '3px solid var(--primary-color)' : obj.shieldBroken ? '3px solid var(--danger-color)' : '3px solid transparent'
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
                      <div style={{flex: 1, minWidth: 0}}>
                        <span style={{textDecoration: obj.completed ? 'line-through' : 'none', opacity: obj.completed ? 0.5 : 1, fontSize: '0.9rem'}}>
                          {obj.title}
                        </span>
                        {obj.isMeasurable ? (
                          <div style={{fontSize: '0.75rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                            <span className={obj.shieldBroken ? 'shield-broken' : 'shield-active'}>&#x1F6E1;</span>
                            {obj.shieldBroken ? (
                              <span style={{color: 'var(--danger-color)'}}>
                                Vencido - 
                                <button 
                                  onClick={(e) => { e.stopPropagation(); rescheduleObjective(obj); }}
                                  style={{background: 'transparent', color: 'var(--danger-color)', textDecoration: 'underline', padding: '0 4px', fontSize: '0.75rem', fontWeight: '600'}}
                                >
                                  Reprogramar
                                </button>
                              </span>
                            ) : (
                              <span style={{color: '#507fa3'}}>{obj.dueDate}</span>
                            )}
                          </div>
                        ) : null}
                      </div>
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

                {(() => {
                  const allRecs = selectedFlower.recurrents || [];
                  const mainRecs = allRecs.filter(r => !r.parentId);
                  const altsByParent = {};
                  allRecs.forEach(r => {
                    if (r.parentId) {
                      if (!altsByParent[r.parentId]) altsByParent[r.parentId] = [];
                      altsByParent[r.parentId].push(r);
                    }
                  });

                  if (allRecs.length === 0) {
                    return <p style={{color: '#888', fontSize: '0.85rem'}}>Crea bloques recurrentes que aparezcan en tu Modo Campo.</p>;
                  }

                  return mainRecs.map(mainRec => {
                    const variants = [mainRec, ...(altsByParent[mainRec.id] || [])];
                    if (variants.length === 0) return null;
                    // Clamp: el índice guardado puede quedar fuera de rango si se borró la alternativa visible
                    const selIdx = Math.max(0, Math.min(selectedAltIndex[mainRec.id] || 0, variants.length - 1));
                    const displayRec = variants[selIdx];

                    return (
                      <div key={mainRec.id} style={{background: 'rgba(0,0,0,0.02)', borderRadius: '10px', padding: '12px', marginBottom: '10px', borderLeft: '3px solid var(--accent-color)'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div style={{flex: 1}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                              {variants.length > 1 && (
                                <button onClick={() => setSelectedAltIndex({...selectedAltIndex, [mainRec.id]: (selIdx - 1 + variants.length) % variants.length})} style={{background: 'transparent', padding: 0, color: 'var(--accent-color)'}}>
                                  <ChevronLeft size={16}/>
                                </button>
                              )}
                              <div style={{fontWeight: '600', fontSize: '0.9rem'}}>{displayRec.title}</div>
                              {variants.length > 1 && (
                                <button onClick={() => setSelectedAltIndex({...selectedAltIndex, [mainRec.id]: (selIdx + 1) % variants.length})} style={{background: 'transparent', padding: 0, color: 'var(--accent-color)'}}>
                                  <ChevronRight size={16}/>
                                </button>
                              )}
                            </div>
                            <div style={{fontSize: '0.8rem', color: '#888', marginTop: '3px'}}>
                              {displayRec.duration || 60} min
                              {displayRec.parentId ? ' (Alternativa)' : ''}
                            </div>
                          </div>
                          <div style={{display: 'flex', gap: '5px'}}>
                            <button onClick={() => openRecurrentEdit(displayRec)} style={{background: 'transparent', color: 'var(--primary-color)', padding: '4px'}}><Pencil size={14}/></button>
                            <button onClick={() => deleteRecurrent(displayRec)} style={{background: 'transparent', color: 'var(--danger-color)', padding: '4px'}}><Trash2 size={14}/></button>
                          </div>
                        </div>
                        {(displayRec.checklist || []).length > 0 && (
                          <div style={{fontSize: '0.75rem', color: '#888', marginTop: '6px'}}>{displayRec.checklist.length} sub-tareas</div>
                        )}
                        {/* Dots indicator */}
                        {variants.length > 1 && (
                          <div style={{display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '8px'}}>
                            {variants.map((_, i) => (
                              <div key={i} style={{width: '6px', height: '6px', borderRadius: '50%', background: i === selIdx ? 'var(--accent-color)' : '#ddd'}} />
                            ))}
                          </div>
                        )}
                        {/* Add alternative button */}
                        <div style={{marginTop: '10px', textAlign: 'center'}}>
                          <button onClick={() => openAlternativeCreate(mainRec.id)} style={{background: 'transparent', color: 'var(--accent-color)', fontSize: '0.75rem', padding: '4px', textDecoration: 'underline'}}>
                            + Añadir alternativa
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
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

            <div style={{marginBottom: '15px'}}>
              <label>Duración (minutos)</label>
              <input type="number" min="15" step="15" className="input-field" value={recForm.duration} onChange={e => setRecForm({...recForm, duration: parseInt(e.target.value) || 60})} />
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

      {/* ====== MODAL: CREAR OBJETIVO ====== */}
      {objectiveModalOpen && (
        <div className="modal-overlay" onClick={() => setObjectiveModalOpen(false)} style={{zIndex: 1200}}>
          <div className="modal-content glass" style={{maxWidth: '450px'}} onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setObjectiveModalOpen(false)}><X /></button>
            <h2 style={{marginTop: 0}}>Nuevo Objetivo</h2>
            <div style={{marginBottom: '15px'}}>
              <label>Titulo del objetivo</label>
              <input 
                className="input-field" 
                autoFocus
                value={newObjectiveTitle} 
                onChange={e => setNewObjectiveTitle(e.target.value)} 
                onKeyDown={e => { if (e.key === 'Enter' && !newObjMeasurable) saveObjective(); }}
                placeholder="Ej. Comprar materiales" 
              />
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                <input type="checkbox" checked={newObjMeasurable} onChange={e => setNewObjMeasurable(e.target.checked)} />
                <span style={{fontWeight: '600'}}>Objetivo medible (con fecha limite)</span>
              </label>
            </div>
            {newObjMeasurable && (
              <div style={{marginBottom: '15px', padding: '15px', background: 'rgba(80,127,163,0.08)', borderRadius: '12px', borderLeft: '4px solid #507fa3'}}>
                <label>Fecha limite</label>
                <input type="date" className="input-field" value={newObjDueDate} onChange={e => setNewObjDueDate(e.target.value)} />
                <p style={{fontSize: '0.8rem', color: '#507fa3', marginTop: '8px', marginBottom: 0}}>Este objetivo tendra un escudo. Si la fecha pasa sin completarlo, la flor recibira daño.</p>
              </div>
            )}
            <button className="primary" onClick={saveObjective} style={{width: '100%'}}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}
