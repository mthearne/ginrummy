import React, { useEffect, useState } from 'react';
import { CelebrationAnimal as AnimalComponent, CelebrationAnimal, getRandomAnimal } from './CelebrationAnimals';

interface FlyingAnimalProps {
  active: boolean;
  duration?: number;
  animal?: CelebrationAnimal;
}

const FlyingAnimal: React.FC<FlyingAnimalProps> = ({ 
  active, 
  duration = 3000,
  animal
}) => {
  const [position, setPosition] = useState({ x: -150, y: 50 });
  const [windowWidth, setWindowWidth] = useState(0);
  const [selectedAnimal, setSelectedAnimal] = useState<CelebrationAnimal>('unicorn');

  useEffect(() => {
    const updateWindowSize = () => {
      setWindowWidth(window.innerWidth);
    };

    updateWindowSize();
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  useEffect(() => {
    if (!active) {
      setPosition({ x: -150, y: 50 });
      return;
    }

    // Set the animal to use
    setSelectedAnimal(animal || getRandomAnimal());

    // Random vertical position
    const randomY = Math.random() * 200 + 50; // Between 50px and 250px from top
    setPosition({ x: -150, y: randomY });

    const startTime = Date.now();
    const endX = windowWidth + 150;
    const totalDistance = endX - (-150);

    const animateAnimal = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth movement
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const currentX = -150 + (totalDistance * easeProgress);
      
      // Add slight vertical bobbing motion
      const bobbing = Math.sin(elapsed * 0.01) * 10;
      
      setPosition({ x: currentX, y: randomY + bobbing });

      if (progress < 1) {
        requestAnimationFrame(animateAnimal);
      }
    };

    const animationFrame = requestAnimationFrame(animateAnimal);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [active, duration, windowWidth, animal]);

  if (!active) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9998,
        pointerEvents: 'none',
        transform: 'translateZ(0)', // Force hardware acceleration
        transition: 'none'
      }}
    >
      <div
        style={{
          animation: 'flyingAnimalFloat 2s ease-in-out infinite alternate',
          transformOrigin: 'center'
        }}
      >
        <AnimalComponent 
          animal={selectedAnimal} 
          size={120}
          className="drop-shadow-lg"
        />
      </div>
      
      <style jsx>{`
        @keyframes flyingAnimalFloat {
          0% {
            transform: translateY(0px) rotate(-2deg);
          }
          100% {
            transform: translateY(-10px) rotate(2deg);
          }
        }
      `}</style>
    </div>
  );
};

export default FlyingAnimal;