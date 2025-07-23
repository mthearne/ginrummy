import React, { useEffect, useState } from 'react';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  shape: 'square' | 'circle' | 'triangle';
}

interface ConfettiProps {
  active: boolean;
  duration?: number;
  pieceCount?: number;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

const createConfettiPiece = (id: number, windowWidth: number): ConfettiPiece => ({
  id,
  x: Math.random() * windowWidth,
  y: -10,
  vx: (Math.random() - 0.5) * 4,
  vy: Math.random() * 3 + 2,
  rotation: Math.random() * 360,
  rotationSpeed: (Math.random() - 0.5) * 10,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  size: Math.random() * 8 + 4,
  shape: ['square', 'circle', 'triangle'][Math.floor(Math.random() * 3)] as 'square' | 'circle' | 'triangle'
});

const Confetti: React.FC<ConfettiProps> = ({ 
  active, 
  duration = 3000, 
  pieceCount = 100 
}) => {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateWindowSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateWindowSize();
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  useEffect(() => {
    if (!active) {
      setPieces([]);
      return;
    }

    // Initialize confetti pieces
    const initialPieces = Array.from({ length: pieceCount }, (_, i) => 
      createConfettiPiece(i, windowSize.width)
    );
    setPieces(initialPieces);

    const animationInterval = setInterval(() => {
      setPieces(currentPieces => 
        currentPieces
          .map(piece => ({
            ...piece,
            x: piece.x + piece.vx,
            y: piece.y + piece.vy,
            rotation: piece.rotation + piece.rotationSpeed,
            vy: piece.vy + 0.1 // gravity
          }))
          .filter(piece => piece.y < windowSize.height + 50) // Remove pieces that fall off screen
      );
    }, 16); // ~60fps

    const cleanup = setTimeout(() => {
      clearInterval(animationInterval);
      setPieces([]);
    }, duration);

    return () => {
      clearInterval(animationInterval);
      clearTimeout(cleanup);
    };
  }, [active, duration, pieceCount, windowSize]);

  if (!active || pieces.length === 0) return null;

  const renderShape = (piece: ConfettiPiece) => {
    const style = {
      position: 'absolute' as const,
      left: piece.x,
      top: piece.y,
      width: piece.size,
      height: piece.size,
      backgroundColor: piece.color,
      transform: `rotate(${piece.rotation}deg)`,
      pointerEvents: 'none' as const
    };

    switch (piece.shape) {
      case 'circle':
        return (
          <div
            key={piece.id}
            style={{
              ...style,
              borderRadius: '50%'
            }}
          />
        );
      case 'triangle':
        return (
          <div
            key={piece.id}
            style={{
              ...style,
              width: 0,
              height: 0,
              backgroundColor: 'transparent',
              borderLeft: `${piece.size / 2}px solid transparent`,
              borderRight: `${piece.size / 2}px solid transparent`,
              borderBottom: `${piece.size}px solid ${piece.color}`
            }}
          />
        );
      default: // square
        return (
          <div
            key={piece.id}
            style={style}
          />
        );
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    >
      {pieces.map(renderShape)}
    </div>
  );
};

export default Confetti;