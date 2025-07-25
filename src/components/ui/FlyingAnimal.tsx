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
  const [position, setPosition] = useState({ x: -200, y: 50 });
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
  const [selectedAnimal, setSelectedAnimal] = useState<CelebrationAnimal>('unicorn');

  useEffect(() => {
    const updateWindowSize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };

    updateWindowSize();
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  useEffect(() => {
    if (!active) {
      setPosition({ x: -200, y: 50 });
      return;
    }

    // Set the animal to use
    setSelectedAnimal(animal || getRandomAnimal());

    // Calculate animal size (1/3 of screen height)
    const animalSize = Math.max(windowHeight / 3, 200); // At least 200px
    
    // Random vertical position, accounting for larger animal size
    const randomY = Math.random() * (windowHeight - animalSize - 100) + 50;
    setPosition({ x: -animalSize, y: randomY });

    const startTime = Date.now();
    const endX = windowWidth + animalSize;
    const totalDistance = endX - (-animalSize);

    const animateAnimal = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth movement
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      const currentX = -animalSize + (totalDistance * easeProgress);
      
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
  }, [active, duration, windowWidth, windowHeight, animal]);

  if (!active) return null;

  // Calculate animal size (1/3 of screen height, minimum 200px)
  const animalSize = Math.max(windowHeight / 3, 200);

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
          size={animalSize}
          className="drop-shadow-xl"
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