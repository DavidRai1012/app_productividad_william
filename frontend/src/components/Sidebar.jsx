import React from 'react';
import { CalendarDays, Flower2, Settings } from 'lucide-react';

export default function Sidebar({ currentMode, setCurrentMode, openSettings }) {
  return (
    <aside className="sidebar glass">
      <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>AgroProductividad</h2>
      </div>
      
      <button 
        className={`primary ${currentMode !== 'field' ? 'glass' : ''}`}
        style={currentMode !== 'field' ? { background: 'transparent', color: 'var(--text-color)', border: '1px solid transparent', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px'} : { textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}
        onClick={() => setCurrentMode('field')}
      >
        <CalendarDays size={20} />
        Modo Campo
      </button>

      <button 
        className={`primary ${currentMode !== 'garden' ? 'glass' : ''}`}
        style={currentMode !== 'garden' ? { background: 'transparent', color: 'var(--text-color)', border: '1px solid transparent', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'} : { textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}
        onClick={() => setCurrentMode('garden')}
      >
        <Flower2 size={20} />
        Modo Jardín
      </button>

      <button 
        className={`primary ${currentMode !== 'workshop' ? 'glass' : ''}`}
        style={currentMode !== 'workshop' ? { background: 'transparent', color: 'var(--text-color)', border: '1px solid transparent', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px'} : { textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}
        onClick={() => setCurrentMode('workshop')}
      >
        <Settings size={20} />
        Modo Taller
      </button>

      <div style={{ marginTop: 'auto' }}>
        <button 
          className="glass"
          style={{ width: '100%', background: 'transparent', color: 'var(--text-color)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', border: 'none' }}
          onClick={openSettings}
        >
          <Settings size={20} />
          Configuraciones
        </button>
      </div>
    </aside>
  );
}
