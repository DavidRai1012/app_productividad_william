import React, { useState, useEffect } from 'react';
import { X, Calendar, Undo2 } from 'lucide-react';

const API_URL = 'http://localhost:3001/api';

export default function GardenMode() {
  const [selectedFlower, setSelectedFlower] = useState(null);
  const [flowers, setFlowers] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/flowers`)
      .then(res => res.json())
      .then(data => {
        const mappedData = data.map(f => ({
          ...f,
          history: [],
          objectives: []
        }));
        setFlowers(mappedData);
      })
      .catch(err => console.error("Error loading flowers:", err));
  }, []);

  const handleAddFlower = () => {
    const title = 'Nueva Meta ' + (flowers.length + 1);
    fetch(`${API_URL}/flowers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    })
    .then(res => res.json())
    .then(data => {
      setFlowers([...flowers, {
        id: data.id,
        title,
        status: 'Brotando',
        progress: 0,
        history: [],
        objectives: []
      }]);
    });
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>Mi Jardín</h2>
          <p style={{ margin: '5px 0 0 0', color: '#666' }}>El lugar donde tus grandes metas florecen.</p>
        </div>
        <button className="primary" style={{ padding: '12px 24px', fontSize: '1.05rem', borderRadius: '30px' }} onClick={handleAddFlower}>
          + Plantar Nueva Semilla
        </button>
      </div>

      <div className="garden-grid">
        {flowers.length === 0 && <p style={{color: '#888'}}>Tu jardín está vacío. ¡Planta una semilla para comenzar!</p>}
        {flowers.map(flower => (
          <div 
            key={flower.id} 
            className="flower-pot glass" 
            onClick={() => setSelectedFlower(flower)}
          >
            <div className="flower-icon">🌻</div>
            <h3 className="flower-title">{flower.title}</h3>
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${flower.progress || 0}%` }}></div>
            </div>
            <p className="flower-status">{flower.progress || 0}% - {flower.status}</p>
          </div>
        ))}
      </div>

      {selectedFlower && (
        <div className="modal-overlay" onClick={() => setSelectedFlower(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedFlower(null)}><X /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
              <div style={{ fontSize: '3rem' }}>🌻</div>
              <div>
                <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>{selectedFlower.title}</h2>
                <p style={{ margin: 0, color: '#666' }}>Estado: {selectedFlower.status}</p>
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h4 style={{ marginBottom: '10px' }}>Progreso General</h4>
              <div className="progress-container" style={{ height: '12px' }}>
                <div className="progress-bar" style={{ width: `${selectedFlower.progress || 0}%` }}></div>
              </div>
            </div>

            <div className="modal-grid">
              <div>
                <h4 style={{ borderBottom: '2px solid var(--primary-color)', paddingBottom: '10px' }}>Objetivos Intermedios</h4>
                <ul className="objective-list">
                  {selectedFlower.objectives.length > 0 ? selectedFlower.objectives.map((obj, i) => (
                    <li key={i} className={obj.done ? 'done' : ''}>
                      <span className="checkbox">{obj.done ? '✓' : ''}</span>
                      {obj.title}
                    </li>
                  )) : (
                    <p style={{color: '#888', fontSize: '0.9rem'}}>Aún no hay objetivos intermedios.</p>
                  )}
                </ul>
                <button className="primary" style={{ width: '100%', marginTop: '15px', background: 'transparent', color: 'var(--primary-color)', border: '1px dashed var(--primary-color)' }}>
                  + Añadir Objetivo
                </button>
              </div>

              <div>
                <h4 style={{ borderBottom: '2px solid var(--accent-color)', paddingBottom: '10px' }}>Historial de Cosechas</h4>
                <div className="history-list">
                  {selectedFlower.history.length > 0 ? selectedFlower.history.map((hist, i) => (
                    <div key={i} className="history-item">
                      <div className="history-date"><Calendar size={14} /> {hist.date}</div>
                      <div className="history-action">
                        <span>{hist.action}</span>
                        <button className="undo-btn" title="Deshacer (Retroceder progreso)"><Undo2 size={16} /></button>
                      </div>
                    </div>
                  )) : (
                    <p style={{color: '#888', fontSize: '0.9rem'}}>No hay actividad reciente.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
