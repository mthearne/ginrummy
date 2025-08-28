import React from 'react';
import { test, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { performance } from 'perf_hooks';
import { MemoryRouter } from 'react-router-dom';
import { Card } from '../../src/components/ui/Card';
import { Header } from '../../src/components/layout/Header';
import { Login } from '../../src/pages/Login';
import { createDeck, shuffleDeck } from '@gin-rummy/common';

// Mock the auth store
const mockAuthStore = {
  user: {
    id: 'test-user',
    username: 'testuser',
    email: 'test@example.com',
    elo: 1200
  },
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: () => true,
  isLoading: false
};

vi.mock('../../src/store/auth', () => ({
  useAuthStore: () => mockAuthStore
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuthStore
}));

describe('Frontend Performance Tests', () => {
  // Performance thresholds (in milliseconds)
  const PERFORMANCE_THRESHOLDS = {
    COMPONENT_RENDER: 50,      // Initial component render
    COMPONENT_UPDATE: 30,      // Component re-render/update
    LARGE_LIST_RENDER: 200,    // Rendering large lists
    INTERACTION_RESPONSE: 16,  // User interaction response (60fps = 16.67ms)
    STATE_UPDATE: 10,          // State updates
    DOM_MANIPULATION: 20,      // DOM updates
    MEMORY_USAGE: 50 * 1024 * 1024 // 50MB memory usage limit
  };

  // Helper function to measure rendering performance
  function measureRender<T>(
    renderFn: () => T,
    threshold: number,
    description: string
  ): { result: T; renderTime: number } {
    const startTime = performance.now();
    const result = renderFn();
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    console.log(`${description}: ${renderTime.toFixed(2)}ms`);
    expect(renderTime).toBeLessThan(threshold);
    
    return { result, renderTime };
  }

  // Helper to measure interaction performance
  async function measureInteraction(
    interactionFn: () => void | Promise<void>,
    threshold: number,
    description: string
  ): Promise<number> {
    const startTime = performance.now();
    await interactionFn();
    const endTime = performance.now();
    const interactionTime = endTime - startTime;
    
    console.log(`${description}: ${interactionTime.toFixed(2)}ms`);
    expect(interactionTime).toBeLessThan(threshold);
    
    return interactionTime;
  }

  test('Card component render performance', () => {
    measureRender(
      () => render(
        <Card 
          card={{ suit: 'hearts', rank: 'A', id: 'test-card' }}
          size="normal"
          onClick={() => {}}
        />
      ),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Single Card render'
    );
  });

  test('Multiple cards render performance', () => {
    const cards = createDeck();
    
    measureRender(
      () => render(
        <div>
          {cards.slice(0, 13).map((card, index) => (
            <Card 
              key={index}
              card={card}
              size="normal"
              onClick={() => {}}
            />
          ))}
        </div>
      ),
      PERFORMANCE_THRESHOLDS.LARGE_LIST_RENDER,
      '13 Cards render (full hand)'
    );
  });

  test('Card interaction performance', async () => {
    const handleClick = vi.fn();
    
    const { result } = measureRender(
      () => render(
        <Card 
          card={{ suit: 'spades', rank: 'K' }}
          size="normal"
          onClick={handleClick}
        />
      ),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Card render for interaction test'
    );

    const card = screen.getByTestId('card-K-spades');
    
    await measureInteraction(
      () => fireEvent.click(card),
      PERFORMANCE_THRESHOLDS.INTERACTION_RESPONSE,
      'Card click interaction'
    );

    expect(handleClick).toHaveBeenCalled();
  });

  test('Card selection state change performance', async () => {
    const TestCardWithState = () => {
      const [selected, setSelected] = React.useState(false);
      
      return (
        <Card 
          card={{ suit: 'diamonds', rank: '7' }}
          size="normal"
          selected={selected}
          onClick={() => setSelected(!selected)}
        />
      );
    };

    measureRender(
      () => render(<TestCardWithState />),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Card with state render'
    );

    const card = screen.getByTestId('card-7-diamonds');
    
    // Test multiple rapid state changes
    for (let i = 0; i < 5; i++) {
      await measureInteraction(
        () => fireEvent.click(card),
        PERFORMANCE_THRESHOLDS.INTERACTION_RESPONSE,
        `Card selection toggle ${i + 1}`
      );
    }
  });

  test('Header component render performance', () => {
    measureRender(
      () => render(
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      ),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Header component render'
    );
  });

  test('Login form render performance', () => {
    measureRender(
      () => render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      ),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Login form render'
    );
  });

  test('Form input performance', async () => {
    const { result } = measureRender(
      () => render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      ),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Login form for input test'
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    // Test rapid typing simulation
    const testEmail = 'test@example.com';
    const testPassword = 'password123';

    await measureInteraction(
      async () => {
        fireEvent.change(emailInput, { target: { value: testEmail } });
        await waitFor(() => {
          expect(emailInput.value).toBe(testEmail);
        });
      },
      PERFORMANCE_THRESHOLDS.INTERACTION_RESPONSE,
      'Email input change'
    );

    await measureInteraction(
      async () => {
        fireEvent.change(passwordInput, { target: { value: testPassword } });
        await waitFor(() => {
          expect(passwordInput.value).toBe(testPassword);
        });
      },
      PERFORMANCE_THRESHOLDS.INTERACTION_RESPONSE,
      'Password input change'
    );
  });

  test('Large game state render performance', () => {
    const LargeGameState = () => {
      const cards = createDeck();
      const shuffledDeck = shuffleDeck([...cards]);
      
      return (
        <div>
          <div data-testid="player-hand">
            {shuffledDeck.slice(0, 10).map((card, index) => (
              <Card 
                key={`player-${index}`}
                card={card}
                size="normal"
                onClick={() => {}}
              />
            ))}
          </div>
          <div data-testid="opponent-info">
            <span>Opponent: 10 cards</span>
            <span>Score: 0</span>
            <span>ELO: 1200</span>
          </div>
          <div data-testid="discard-pile">
            {shuffledDeck.slice(10, 13).map((card, index) => (
              <Card 
                key={`discard-${index}`}
                card={card}
                size="small"
                onClick={() => {}}
              />
            ))}
          </div>
          <div data-testid="game-controls">
            <button>Draw from Stock</button>
            <button>Draw from Discard</button>
            <button>Discard Card</button>
            <button>Knock</button>
          </div>
        </div>
      );
    };

    measureRender(
      () => render(<LargeGameState />),
      PERFORMANCE_THRESHOLDS.LARGE_LIST_RENDER,
      'Large game state render'
    );
  });

  test('Component update performance', async () => {
    const DynamicComponent = () => {
      const [count, setCount] = React.useState(0);
      const [cards, setCards] = React.useState(createDeck().slice(0, 5));
      
      React.useEffect(() => {
        if (count > 0) {
          const newCards = shuffleDeck([...createDeck()]).slice(0, 5);
          setCards(newCards);
        }
      }, [count]);
      
      return (
        <div>
          <button onClick={() => setCount(c => c + 1)}>
            Update Cards ({count})
          </button>
          <div>
            {cards.map((card, index) => (
              <Card 
                key={`${card.suit}-${card.rank}-${index}`}
                card={card}
                size="normal"
                onClick={() => {}}
              />
            ))}
          </div>
        </div>
      );
    };

    const { result } = measureRender(
      () => render(<DynamicComponent />),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Dynamic component initial render'
    );

    const updateButton = screen.getByText(/Update Cards/);

    // Test multiple updates
    for (let i = 0; i < 3; i++) {
      await measureInteraction(
        async () => {
          fireEvent.click(updateButton);
          await waitFor(() => {
            expect(screen.getByText(`Update Cards (${i + 1})`)).toBeInTheDocument();
          });
        },
        PERFORMANCE_THRESHOLDS.COMPONENT_UPDATE,
        `Component update ${i + 1}`
      );
    }
  });

  test('Memory usage during rendering', () => {
    const initialMemory = process.memoryUsage();
    
    // Render multiple components
    const components = [];
    for (let i = 0; i < 20; i++) {
      const cards = createDeck().slice(0, 10);
      components.push(render(
        <div key={i}>
          {cards.map((card, index) => (
            <Card 
              key={`${i}-${index}`}
              card={card}
              size="normal"
              onClick={() => {}}
            />
          ))}
        </div>
      ));
    }
    
    const afterRenderMemory = process.memoryUsage();
    
    // Unmount components
    components.forEach(component => component.unmount());
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    
    const memoryGrowth = afterRenderMemory.heapUsed - initialMemory.heapUsed;
    const memoryRecovered = afterRenderMemory.heapUsed - finalMemory.heapUsed;
    
    console.log(`Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`After render: ${(afterRenderMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Final memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Memory recovered: ${(memoryRecovered / 1024 / 1024).toFixed(2)}MB`);
    
    // Memory growth should be reasonable
    expect(memoryGrowth).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_USAGE);
  });

  test('Event handler performance', async () => {
    const eventCounts = { click: 0, hover: 0 };
    
    const EventTestComponent = () => {
      const handleClick = () => { eventCounts.click++; };
      const handleMouseOver = () => { eventCounts.hover++; };
      
      return (
        <div>
          {Array.from({ length: 20 }, (_, index) => (
            <Card 
              key={index}
              card={{ suit: 'hearts', rank: 'A' }}
              size="normal"
              onClick={handleClick}
              onMouseOver={handleMouseOver}
            />
          ))}
        </div>
      );
    };

    measureRender(
      () => render(<EventTestComponent />),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Event handler component render'
    );

    const cards = screen.getAllByTestId('card-A-hearts');

    // Test rapid event firing
    const startTime = performance.now();
    
    for (const card of cards) {
      fireEvent.mouseOver(card);
      fireEvent.click(card);
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    console.log(`20 events fired in ${totalTime.toFixed(2)}ms`);
    expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.INTERACTION_RESPONSE * 20);
    expect(eventCounts.click).toBe(20);
    expect(eventCounts.hover).toBe(20);
  });

  test('CSS transition performance', async () => {
    const TransitionComponent = () => {
      const [animate, setAnimate] = React.useState(false);
      
      return (
        <div>
          <button onClick={() => setAnimate(!animate)}>
            Toggle Animation
          </button>
          <div 
            data-testid="animated-element"
            style={{
              transform: animate ? 'translateX(100px)' : 'translateX(0px)',
              transition: 'transform 0.3s ease',
              opacity: animate ? 0.5 : 1
            }}
          >
            Animated Element
          </div>
        </div>
      );
    };

    measureRender(
      () => render(<TransitionComponent />),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'Transition component render'
    );

    const toggleButton = screen.getByText('Toggle Animation');

    await measureInteraction(
      () => fireEvent.click(toggleButton),
      PERFORMANCE_THRESHOLDS.INTERACTION_RESPONSE,
      'CSS transition trigger'
    );
  });

  test('Virtual scrolling performance simulation', () => {
    const VirtualScrollComponent = () => {
      const [visibleItems, setVisibleItems] = React.useState(
        Array.from({ length: 20 }, (_, i) => i)
      );
      
      const cards = createDeck();
      
      return (
        <div style={{ height: '400px', overflow: 'auto' }}>
          {visibleItems.map(index => (
            <div key={index} style={{ height: '60px', padding: '8px' }}>
              <Card 
                card={cards[index % cards.length]}
                size="small"
                onClick={() => {}}
              />
              <span>Item {index}</span>
            </div>
          ))}
        </div>
      );
    };

    measureRender(
      () => render(<VirtualScrollComponent />),
      PERFORMANCE_THRESHOLDS.LARGE_LIST_RENDER,
      'Virtual scroll simulation'
    );
  });

  test('State management performance', async () => {
    const StateManagementTest = () => {
      const [gameState, setGameState] = React.useState({
        phase: 'waiting',
        players: [],
        cards: [],
        score: 0
      });
      
      const updateGameState = (updates: Partial<typeof gameState>) => {
        setGameState(prev => ({ ...prev, ...updates }));
      };
      
      return (
        <div>
          <button onClick={() => updateGameState({ phase: 'playing' })}>
            Start Game
          </button>
          <button onClick={() => updateGameState({ score: Math.random() * 100 })}>
            Update Score
          </button>
          <button onClick={() => updateGameState({ 
            cards: shuffleDeck(createDeck()).slice(0, 10)
          })}>
            Shuffle Cards
          </button>
          <div data-testid="game-phase">{gameState.phase}</div>
          <div data-testid="game-score">{gameState.score}</div>
          <div data-testid="card-count">{gameState.cards.length}</div>
        </div>
      );
    };

    measureRender(
      () => render(<StateManagementTest />),
      PERFORMANCE_THRESHOLDS.COMPONENT_RENDER,
      'State management component'
    );

    const startButton = screen.getByText('Start Game');
    const scoreButton = screen.getByText('Update Score');
    const cardButton = screen.getByText('Shuffle Cards');

    // Test rapid state updates
    await measureInteraction(
      () => fireEvent.click(startButton),
      PERFORMANCE_THRESHOLDS.STATE_UPDATE,
      'Phase state update'
    );

    await measureInteraction(
      () => fireEvent.click(scoreButton),
      PERFORMANCE_THRESHOLDS.STATE_UPDATE,
      'Score state update'
    );

    await measureInteraction(
      () => fireEvent.click(cardButton),
      PERFORMANCE_THRESHOLDS.STATE_UPDATE,
      'Cards state update'
    );
  });
});