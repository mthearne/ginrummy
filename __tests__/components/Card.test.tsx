import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card } from '../ui/Card';
import { Suit, Rank } from '@gin-rummy/common';

// Mock the helpers module
vi.mock('../../utils/helpers', () => ({
  formatCard: vi.fn((card) => ({
    display: card.rank === 'A' ? 'A' : card.rank === 'K' ? 'K' : card.rank === 'Q' ? 'Q' : card.rank === 'J' ? 'J' : card.rank,
    symbol: card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠',
    color: ['hearts', 'diamonds'].includes(card.suit) ? 'text-red-600' : 'text-black'
  })),
  clsx: vi.fn((...args) => args.filter(Boolean).join(' '))
}));

describe('Card Component', () => {
  const sampleCard = {
    id: 'card-1',
    suit: Suit.Hearts,
    rank: Rank.Seven
  };

  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render card with correct display and symbol', () => {
      render(<Card card={sampleCard} />);
      
      // Should show the rank/display
      expect(screen.getAllByText('7')).toHaveLength(2); // Corner displays
      // Should show the suit symbol
      expect(screen.getAllByText('♥')).toHaveLength(3); // Two corners + center
    });

    it('should apply correct color class for red suits', () => {
      const redCard = { ...sampleCard, suit: Suit.Diamonds };
      const { container } = render(<Card card={redCard} />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('text-red-600');
    });

    it('should apply correct color class for black suits', () => {
      const blackCard = { ...sampleCard, suit: Suit.Spades };
      const { container } = render(<Card card={blackCard} />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('text-black');
    });

    it('should apply custom className', () => {
      const { container } = render(<Card card={sampleCard} className="custom-class w-28 h-36" />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('custom-class', 'w-28', 'h-36');
    });
  });

  describe('Interactive Behavior', () => {
    it('should call onClick when card is clicked', async () => {
      const handleClick = vi.fn();
      const { container } = render(<Card card={sampleCard} onClick={handleClick} />);
      
      const cardElement = container.querySelector('.playing-card')!;
      await user.click(cardElement);
      
      expect(handleClick).toHaveBeenCalledOnce();
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const { container } = render(<Card card={sampleCard} onClick={handleClick} disabled />);
      
      const cardElement = container.querySelector('.playing-card')!;
      await user.click(cardElement);
      
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should apply hover styles when clickable and not disabled', () => {
      const { container } = render(<Card card={sampleCard} onClick={vi.fn()} />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('cursor-pointer', 'hover:shadow-md');
    });

    it('should show disabled styles when disabled', () => {
      const { container } = render(<Card card={sampleCard} disabled />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('opacity-50', 'cursor-not-allowed');
    });
  });

  describe('Selection State', () => {
    it('should apply selected class when selected', () => {
      const { container } = render(<Card card={sampleCard} selected />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('selected');
    });

    it('should not apply selected class by default', () => {
      const { container } = render(<Card card={sampleCard} />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).not.toHaveClass('selected');
    });
  });

  describe('Meld Indicators', () => {
    it('should show run meld indicator', () => {
      const { container } = render(<Card card={sampleCard} isInMeld meldType="run" />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('ring-2', 'ring-blue-400');
      
      const indicator = screen.getByText('R');
      expect(indicator).toBeInTheDocument();
      expect(indicator.closest('div')).toHaveClass('bg-blue-500');
    });

    it('should show set meld indicator', () => {
      const { container } = render(<Card card={sampleCard} isInMeld meldType="set" />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('ring-2', 'ring-green-400');
      
      const indicator = screen.getByText('S');
      expect(indicator).toBeInTheDocument();
      expect(indicator.closest('div')).toHaveClass('bg-green-500');
    });

    it('should not show meld indicator when not in meld', () => {
      render(<Card card={sampleCard} />);
      
      expect(screen.queryByText('R')).not.toBeInTheDocument();
      expect(screen.queryByText('S')).not.toBeInTheDocument();
    });
  });

  describe('Special States', () => {
    it('should show newly drawn indicator', () => {
      const { container } = render(<Card card={sampleCard} isNewlyDrawn />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('ring-2', 'ring-yellow-400', 'animate-pulse');
    });

    it('should show drag over state', () => {
      const { container } = render(<Card card={sampleCard} isDragOver />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveClass('ring-2', 'ring-purple-400', 'transform', 'scale-105');
    });
  });

  describe('Drag and Drop', () => {
    it('should be draggable when draggable prop is true', () => {
      const { container } = render(<Card card={sampleCard} draggable />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveAttribute('draggable', 'true');
      expect(cardElement).toHaveClass('cursor-grab', 'active:cursor-grabbing');
    });

    it('should not be draggable when disabled', () => {
      const { container } = render(<Card card={sampleCard} draggable disabled />);
      
      const cardElement = container.querySelector('.playing-card');
      expect(cardElement).toHaveAttribute('draggable', 'false');
    });

    it('should call onDragStart when drag starts', () => {
      const handleDragStart = vi.fn();
      const { container } = render(<Card card={sampleCard} draggable onDragStart={handleDragStart} />);
      
      const cardElement = container.querySelector('.playing-card')!;
      fireEvent.dragStart(cardElement);
      
      expect(handleDragStart).toHaveBeenCalledOnce();
    });

    it('should call onDragEnd when drag ends', () => {
      const handleDragEnd = vi.fn();
      const { container } = render(<Card card={sampleCard} draggable onDragEnd={handleDragEnd} />);
      
      const cardElement = container.querySelector('.playing-card')!;
      fireEvent.dragEnd(cardElement);
      
      expect(handleDragEnd).toHaveBeenCalledOnce();
    });

    it('should call onDragOver when dragged over', () => {
      const handleDragOver = vi.fn();
      const { container } = render(<Card card={sampleCard} onDragOver={handleDragOver} />);
      
      const cardElement = container.querySelector('.playing-card')!;
      fireEvent.dragOver(cardElement);
      
      expect(handleDragOver).toHaveBeenCalledOnce();
    });

    it('should call onDrop when dropped on', () => {
      const handleDrop = vi.fn();
      const { container } = render(<Card card={sampleCard} onDrop={handleDrop} />);
      
      const cardElement = container.querySelector('.playing-card')!;
      fireEvent.drop(cardElement);
      
      expect(handleDrop).toHaveBeenCalledOnce();
    });
  });

  describe('Click vs Drag Differentiation', () => {
    it('should trigger onClick for quick clicks', async () => {
      const handleClick = vi.fn();
      const { container } = render(<Card card={sampleCard} onClick={handleClick} />);
      
      const cardElement = container.querySelector('.playing-card')!;
      
      // Simulate quick mouse down/up (click)
      fireEvent.mouseDown(cardElement);
      await waitFor(() => {
        fireEvent.click(cardElement);
      }, { timeout: 50 });
      
      expect(handleClick).toHaveBeenCalled();
    });

    it('should not trigger onClick for long press (drag)', async () => {
      const handleClick = vi.fn();
      const { container } = render(<Card card={sampleCard} onClick={handleClick} />);
      
      const cardElement = container.querySelector('.playing-card')!;
      
      // Simulate long mouse down (drag start)
      fireEvent.mouseDown(cardElement);
      
      // Wait longer than the drag threshold
      await new Promise(resolve => setTimeout(resolve, 250));
      
      fireEvent.click(cardElement);
      
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Responsive Sizing', () => {
    it('should apply large symbol sizes for large cards', () => {
      const { container } = render(<Card card={sampleCard} className="w-28 h-36" />);
      
      // Check corner elements have text-lg class
      const cornerDivs = container.querySelectorAll('.absolute.top-1, .absolute.bottom-1');
      cornerDivs.forEach(div => {
        expect(div).toHaveClass('text-lg');
      });
      
      // Check center element has text-6xl class
      const centerDiv = container.querySelector('.absolute.inset-0');
      expect(centerDiv).toHaveClass('text-6xl');
    });

    it('should apply medium symbol sizes for medium cards', () => {
      const { container } = render(<Card card={sampleCard} className="w-20 h-28" />);
      
      // Check corner elements have text-sm class
      const cornerDivs = container.querySelectorAll('.absolute.top-1, .absolute.bottom-1');
      cornerDivs.forEach(div => {
        expect(div).toHaveClass('text-sm');
      });
      
      // Check center element has text-4xl class
      const centerDiv = container.querySelector('.absolute.inset-0');
      expect(centerDiv).toHaveClass('text-4xl');
    });

    it('should apply small symbol sizes for small cards', () => {
      const { container } = render(<Card card={sampleCard} className="w-16 h-20" />);
      
      // Check corner elements have text-xs class
      const cornerDivs = container.querySelectorAll('.absolute.top-1, .absolute.bottom-1');
      cornerDivs.forEach(div => {
        expect(div).toHaveClass('text-xs');
      });
      
      // Check center element has text-2xl class
      const centerDiv = container.querySelector('.absolute.inset-0');
      expect(centerDiv).toHaveClass('text-2xl');
    });

    it('should apply very small symbol sizes for very small cards', () => {
      const { container } = render(<Card card={sampleCard} className="w-12 h-16" />);
      
      // Check corner elements have text-[8px] class
      const cornerDivs = container.querySelectorAll('.absolute.top-1, .absolute.bottom-1');
      cornerDivs.forEach(div => {
        expect(div).toHaveClass('text-[8px]');
      });
      
      // Check center element has text-lg class
      const centerDiv = container.querySelector('.absolute.inset-0');
      expect(centerDiv).toHaveClass('text-lg');
    });
  });

  describe('Face Cards', () => {
    it('should render face cards correctly', () => {
      const faceCards = [
        { ...sampleCard, rank: Rank.Jack },
        { ...sampleCard, rank: Rank.Queen },
        { ...sampleCard, rank: Rank.King },
        { ...sampleCard, rank: Rank.Ace }
      ];

      faceCards.forEach(card => {
        const { unmount } = render(<Card card={card} />);
        
        const expectedDisplay = card.rank === 'A' ? 'A' : 
                              card.rank === 'K' ? 'K' : 
                              card.rank === 'Q' ? 'Q' : 
                              card.rank === 'J' ? 'J' : 
                              card.rank;
        
        expect(screen.getAllByText(expectedDisplay)).toHaveLength(2);
        unmount();
      });
    });
  });
});