import { Card as CardType } from '@gin-rummy/common';
import { formatCard, clsx } from '../../utils/helpers';

interface CardProps {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  isInMeld?: boolean;
  meldType?: 'run' | 'set';
  isNewlyDrawn?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  isDragOver?: boolean;
}

export function Card({ 
  card, 
  selected = false, 
  onClick, 
  className, 
  disabled = false, 
  isInMeld = false, 
  meldType, 
  isNewlyDrawn = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragOver = false
}: CardProps) {
  const { display, symbol, color } = formatCard(card);

  // Determine font sizes based on card size
  const getSymbolSizes = () => {
    if (className?.includes('w-28 h-36')) {
      // Large cards (player hand) - current sizes
      return {
        corner: 'text-lg',
        center: 'text-6xl'
      };
    } else if (className?.includes('w-20 h-28')) {
      // Medium cards (upcard) 
      return {
        corner: 'text-sm',
        center: 'text-4xl'
      };
    } else if (className?.includes('w-16 h-20')) {
      // Small cards (discard pile, stock)
      return {
        corner: 'text-xs',
        center: 'text-2xl'
      };
    } else if (className?.includes('w-12 h-16')) {
      // Very small cards (opponent hand)
      return {
        corner: 'text-[8px]',
        center: 'text-lg'
      };
    } else {
      // Default sizes
      return {
        corner: 'text-xs',
        center: 'text-2xl'
      };
    }
  };

  const symbolSizes = getSymbolSizes();

  const handleMouseDown = (e: React.MouseEvent) => {
    // Start a timer to differentiate between click and drag
    e.currentTarget.setAttribute('data-mouse-down-time', Date.now().toString());
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!disabled && onClick) {
      const mouseDownTime = e.currentTarget.getAttribute('data-mouse-down-time');
      const timeDiff = mouseDownTime ? Date.now() - parseInt(mouseDownTime) : 0;
      
      // Only trigger click if it was a quick action (not a drag)
      if (timeDiff < 200) {
        onClick();
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDragOver) {
      onDragOver(e);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDrop) {
      onDrop(e);
    }
  };

  return (
    <div
      className={clsx(
        'playing-card relative select-none',
        color,
        selected && 'selected',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && onClick && 'cursor-pointer hover:shadow-md',
        draggable && !disabled && 'cursor-grab active:cursor-grabbing',
        isInMeld && 'ring-2',
        isInMeld && meldType === 'run' && 'ring-blue-400',
        isInMeld && meldType === 'set' && 'ring-green-400',
        isNewlyDrawn && 'ring-2 ring-yellow-400 animate-pulse',
        isDragOver && 'ring-2 ring-purple-400 transform scale-105',
        className
      )}
      draggable={draggable && !disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {isInMeld && (
        <div className={clsx(
          'absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center text-white',
          meldType === 'run' ? 'bg-blue-500' : 'bg-green-500'
        )}>
          {meldType === 'run' ? 'R' : 'S'}
        </div>
      )}
      <div className={`absolute top-1 left-1 ${symbolSizes.corner} font-bold leading-none`}>
        <div>{display}</div>
        <div>{symbol}</div>
      </div>
      <div className={`absolute bottom-1 right-1 ${symbolSizes.corner} font-bold leading-none transform rotate-180`}>
        <div>{display}</div>
        <div>{symbol}</div>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center ${symbolSizes.center}`}>
        {symbol}
      </div>
    </div>
  );
}