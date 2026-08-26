import React, { useEffect } from 'react';
import { Check, Leaf, Sparkles, Gift } from 'lucide-react';
import { speciesByUnlockPath } from '../species';

const REWARDS = {
  none: { icon: Check, title: 'Bloque Cosechado', subtitle: 'Buen trabajo, sigue asi.', color: '#81b29a', particleClass: '' },
  fertilizer: { icon: Leaf, title: 'Fertilizante', subtitle: '+5 de salud para tu flor', color: '#4a7c59', particleClass: 'particle-leaf' },
  golden_rain: { icon: Sparkles, title: 'Lluvia Dorada', subtitle: '+10 de salud para tu flor', color: '#d8a45e', particleClass: 'particle-gold' },
  rare_seed: { icon: Gift, title: 'Semilla Rara', subtitle: 'Nueva imagen de flor desbloqueada', color: '#ff69b4', particleClass: 'particle-rare' },
};

// rewardType admite dos formas (retrocompatible):
//  - string: 'none' | 'fertilizer' | 'golden_rain' | 'rare_seed'
//  - objeto: { type, imagePath } — imagePath solo llega con rare_seed y permite
//    mostrar la especie desbloqueada con su imagen.
export default function RewardAnimation({ rewardType, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const isObj = rewardType !== null && typeof rewardType === 'object';
  const type = isObj ? (rewardType.type || 'none') : (rewardType || 'none');
  const imagePath = isObj ? (rewardType.imagePath || null) : null;

  const reward = REWARDS[type] || REWARDS.none;
  const IconComponent = reward.icon;

  // Semilla rara con imagen: nombrar la especie desbloqueada y mostrar su flor.
  // Sin imagePath (o ruta desconocida) se conserva el texto genérico de siempre.
  const species = type === 'rare_seed' && imagePath ? speciesByUnlockPath(imagePath) : null;
  const subtitle = species ? `¡Nueva especie desbloqueada: ${species.name}!` : reward.subtitle;
  const showImage = type === 'rare_seed' && imagePath;

  const particles = Array.from({ length: 20 }, (_, i) => ({
    left: Math.random() * 100 + '%',
    top: Math.random() * 100 + '%',
    animationDelay: (Math.random() * 2) + 's',
    width: (8 + Math.random() * 12) + 'px',
    height: (8 + Math.random() * 12) + 'px',
  }));

  return (
    <div className="reward-overlay" onClick={onClose}>
      {reward.particleClass && (
        <div className="reward-particles">
          {particles.map((style, i) => (
            <div key={i} className={'particle ' + reward.particleClass} style={style} />
          ))}
        </div>
      )}
      <div className="reward-icon" style={{ color: reward.color }}>
        {showImage ? (
          <img
            src={imagePath}
            alt={species ? species.name : 'Flor desbloqueada'}
            style={{ width: '80px', height: '80px', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }}
          />
        ) : (
          <IconComponent size={80} />
        )}
      </div>
      <div className="reward-title">{reward.title}</div>
      <div className="reward-subtitle">{subtitle}</div>
    </div>
  );
}
