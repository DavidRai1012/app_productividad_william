import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FieldMode from './components/FieldMode';
import GardenMode from './components/GardenMode';
import WorkshopMode from './components/WorkshopMode';
import { X } from 'lucide-react';

const DEFAULT_SETTINGS = { timeFormat: '12h', startHour: 4, collisionMode: 'cascade' };

function loadSettings() {
  try {
    const saved = localStorage.getItem('agro_settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch { /* JSON corrupto: volver a defaults */ }
  return DEFAULT_SETTINGS;
}

function App() {
  const [currentMode, setCurrentMode] = useState('field');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    localStorage.setItem('agro_settings', JSON.stringify(settings));
  }, [settings]);

  return (
    <div className="layout-container">
      <Sidebar 
        currentMode={currentMode} 
        setCurrentMode={setCurrentMode} 
        openSettings={() => setIsSettingsOpen(true)} 
      />
      <main className="main-content">
        {currentMode === 'field' && <FieldMode settings={settings} />}
        {currentMode === 'garden' && <GardenMode />}
        {currentMode === 'workshop' && <WorkshopMode settings={settings} />}
      </main>

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <button className="close-btn" onClick={() => setIsSettingsOpen(false)}><X /></button>
            <h2 style={{ marginTop: 0 }}>Configuraciones</h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Formato de Hora</label>
              <select 
                className="input-field"
                value={settings.timeFormat} 
                onChange={e => setSettings({...settings, timeFormat: e.target.value})}
              >
                <option value="12h">Modo A.M. / P.M. (12 horas)</option>
                <option value="24h">Modo 24 Horas</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Hora de inicio del tablón</label>
              <select 
                className="input-field"
                value={settings.startHour} 
                onChange={e => setSettings({...settings, startHour: parseInt(e.target.value, 10)})}
              >
                {Array.from({ length: 24 }, (_, i) => {
                  let label = `${i}:00`;
                  if (settings.timeFormat === '12h') {
                    const period = i >= 12 ? 'PM' : 'AM';
                    let h12 = i % 12;
                    if (h12 === 0) h12 = 12;
                    label = `${h12}:00 ${period}`;
                  }
                  return <option key={i} value={i}>{label}</option>;
                })}
              </select>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Al soltar un bloque en una hora ocupada</label>
              <select
                className="input-field"
                value={settings.collisionMode}
                onChange={e => setSettings({...settings, collisionMode: e.target.value})}
              >
                <option value="cascade">Corrimiento en cascada (los demás bloques se corren)</option>
                <option value="fusion">Fusionar (los bloques comparten la hora, lado a lado)</option>
              </select>
              <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '6px', marginBottom: 0 }}>
                Aplica en Modo Campo y Modo Taller. Los bloques ya fusionados se mueven juntos: la cascada nunca rompe una fusión.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="primary" onClick={() => setIsSettingsOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
