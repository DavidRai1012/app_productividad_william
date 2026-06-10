import React, { useState } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function FieldMode() {
  const [blocks, setBlocks] = useState([
    { id: 'b1', title: 'Revisar correos', type: 'work', startHour: 9, duration: 1, day: 0 },
    { id: 'b2', title: 'Leer libro', type: 'study', startHour: 18, duration: 2, day: 1 },
    { id: 'b3', title: 'Almorzar', type: 'rest', startHour: 13, duration: 1, day: 0 },
  ]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Modo Campo: Rutina Diaria</h2>
        <button className="primary">+ Nuevo Bloque</button>
      </div>

      <div className="glass" style={{ padding: '20px', overflowX: 'auto', overflowY: 'hidden' }}>
        <div className="calendar-grid">
          {/* Time column */}
          <div className="time-column">
            {HOURS.map(h => (
              <div key={h} className="time-slot">{h}:00</div>
            ))}
          </div>

          {/* Days */}
          {DAYS.map((day, idx) => (
            <div key={day} className="day-column">
              <div className="day-header">{day}</div>
              <div className="day-grid-lines"></div>
              {blocks.filter(b => b.day === idx).map(b => (
                <div 
                  key={b.id} 
                  className={`block-card block-type-${b.type}`} 
                  style={{ top: `${b.startHour * 50 + 55}px`, height: `${b.duration * 50 - 5}px` }}
                >
                  <div className="block-title">{b.title}</div>
                  <div className="block-time">{b.startHour}:00 - {b.startHour + b.duration}:00</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
