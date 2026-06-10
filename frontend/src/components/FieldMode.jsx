import React, { useState, useEffect } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const API_URL = 'http://localhost:3001/api';

export default function FieldMode() {
  const [view, setView] = useState('week');
  const [blocks, setBlocks] = useState([]);
  
  // En el futuro estas semillas vendrán del backend (Modo Jardín)
  const [unplantedSeeds, setUnplantedSeeds] = useState([
    { id: 's1', title: 'Practicar Piano (Meta)', type: 'garden' },
    { id: 's2', title: 'Leer Documentación', type: 'work' },
    { id: 's3', title: 'Hacer Ejercicio', type: 'rest' }
  ]);

  const [draggedItem, setDraggedItem] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/blocks`)
      .then(res => res.json())
      .then(data => setBlocks(data))
      .catch(err => console.error("Error cargando bloques:", err));
  }, []);

  const handleDragStart = (e, item, source) => {
    setDraggedItem({ ...item, source });
    setTimeout(() => { e.target.style.opacity = '0.5'; }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e, dayIdx) => {
    e.preventDefault();
    if (!draggedItem) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let dropHour = Math.floor((y - 50) / 50);
    if (dropHour < 0) dropHour = 0;
    if (dropHour > 23) dropHour = 23;

    if (draggedItem.source === 'seed') {
      const newBlock = {
        title: draggedItem.title,
        type: draggedItem.type || 'work',
        startHour: dropHour,
        duration: 1,
        day: dayIdx,
        isRecurring: false
      };
      
      fetch(`${API_URL}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBlock)
      })
      .then(res => res.json())
      .then(data => {
        setBlocks([...blocks, { id: data.id, ...newBlock }]);
        setUnplantedSeeds(unplantedSeeds.filter(s => s.id !== draggedItem.id));
      });

    } else if (draggedItem.source === 'calendar') {
      const updatedBlock = { ...draggedItem, day: dayIdx, startHour: dropHour };
      
      fetch(`${API_URL}/blocks/${draggedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBlock)
      }).then(() => {
        setBlocks(blocks.map(b => b.id === draggedItem.id ? updatedBlock : b));
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
           <h2 style={{ margin: 0, marginBottom: '10px' }}>Modo Campo: Rutina Diaria</h2>
           <div style={{ display: 'flex', gap: '10px' }}>
              <button className={view === 'day' ? 'primary' : 'glass'} onClick={() => setView('day')}>Día</button>
              <button className={view === 'week' ? 'primary' : 'glass'} onClick={() => setView('week')}>Semana</button>
              <button className={view === 'month' ? 'primary' : 'glass'} onClick={() => setView('month')}>Mes</button>
           </div>
        </div>
        <button className="primary">+ Nuevo Bloque</button>
      </div>

      <div className="glass" style={{ padding: '15px', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', background: 'rgba(255,255,255,0.85)' }}>
        <h4 style={{ margin: 0, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>🌱 Semillas sin plantar:</h4>
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px' }}>
          {unplantedSeeds.length === 0 ? (
             <span style={{color: '#888', fontSize: '0.9rem'}}>Todas las semillas han sido plantadas. ¡Excelente trabajo!</span>
          ) : (
             unplantedSeeds.map(seed => (
               <div 
                 key={seed.id} 
                 className="seed-badge"
                 draggable
                 onDragStart={(e) => handleDragStart(e, seed, 'seed')}
                 onDragEnd={handleDragEnd}
               >
                 {seed.title}
               </div>
             ))
          )}
        </div>
      </div>

      <div className="glass" style={{ padding: '20px', overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: '0' }}>
        {view === 'month' ? (
           <div style={{ textAlign: 'center', padding: '50px', color: '#666' }}>Vista mensual en construcción...</div>
        ) : (
          <div className="calendar-grid" style={{ minWidth: '800px' }}>
            <div className="time-column">
              {HOURS.map(h => (
                <div key={h} className="time-slot">{h}:00</div>
              ))}
            </div>

            {DAYS.map((day, idx) => {
              if (view === 'day' && idx !== 0) return null;

              return (
                <div 
                  key={day} 
                  className="day-column"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, idx)}
                >
                  <div className="day-header">{day}</div>
                  <div className="day-grid-lines"></div>
                  {blocks.filter(b => b.day === idx).map(b => (
                    <div 
                      key={b.id} 
                      className={`block-card block-type-${b.type}`} 
                      style={{ top: `${b.startHour * 50 + 55}px`, height: `${(b.duration || 1) * 50 - 5}px` }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, b, 'calendar')}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="block-title">{b.title}</div>
                      <div className="block-time">{b.startHour}:00 - {b.startHour + (b.duration || 1)}:00</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
}
