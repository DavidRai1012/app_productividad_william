import { useState } from 'react';
import Sidebar from './components/Sidebar';
import FieldMode from './components/FieldMode';
import GardenMode from './components/GardenMode';

function App() {
  const [currentMode, setCurrentMode] = useState('field');

  return (
    <div className="layout-container">
      <Sidebar currentMode={currentMode} setCurrentMode={setCurrentMode} />
      <main className="main-content">
        {currentMode === 'field' && <FieldMode />}
        {currentMode === 'garden' && <GardenMode />}
      </main>
    </div>
  );
}

export default App;
