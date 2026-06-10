import React from 'react';

export default function GardenMode() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Modo Jardín: Metas y Crecimiento</h2>
        <button className="primary">+ Plantar Semilla (Nueva Meta)</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        <div className="glass" style={{ padding: '20px' }}>
          <h3 style={{ marginTop: 0, color: 'var(--primary-color)' }}>🌻 Aprender a tocar piano</h3>
          <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px' }}>Estado: Brotando</p>
          <div style={{ background: 'rgba(0,0,0,0.05)', height: '8px', borderRadius: '4px', margin: '15px 0' }}>
            <div style={{ width: '30%', background: 'var(--success-color)', height: '100%', borderRadius: '4px' }}></div>
          </div>
          <h4 style={{marginBottom: '10px'}}>Objetivos:</h4>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', margin: 0 }}>
            <li style={{ textDecoration: 'line-through', opacity: 0.6, marginBottom: '5px' }}>Aprender notas básicas</li>
            <li style={{ marginBottom: '5px' }}>Aprender Estrellita (2 hojas)</li>
            <li>Practicar escalas</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
