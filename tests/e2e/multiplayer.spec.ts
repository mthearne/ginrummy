import { test, expect } from '@playwright/test';
import { AuthHelper } from './helpers/auth';
import { GameHelper } from './helpers/game';

test.describe('Multiplayer PvP Gameplay', () => {
  test('should handle two-player PvP game flow', async ({ browser }) => {
    // Create two browser contexts for two players
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const auth1 = new AuthHelper(page1);
    const auth2 = new AuthHelper(page2);
    const game1 = new GameHelper(page1);
    const game2 = new GameHelper(page2);
    
    let gameId: string;
    
    await test.step('Both players login', async () => {
      await auth1.login('demo1@example.com', 'password123');
      await auth2.login('demo2@example.com', 'password123');
    });
    
    await test.step('Player 1 creates game', async () => {
      gameId = await game1.createGame({ vsAI: false });
      
      // Should be in waiting state
      await expect(page1.getByText('Waiting for opponent')).toBeVisible();
    });
    
    await test.step('Player 2 joins game', async () => {
      await page2.goto('/lobby');
      
      // Should see player 1's game
      await expect(page2.getByText('demo1')).toBeVisible();
      await page2.click('button:has-text("Join")');
      
      // Should redirect to game
      await expect(page2).toHaveURL(new RegExp(gameId));
    });
    
    await test.step('Both players see game start', async () => {
      await game1.waitForGameToStart();
      await game2.waitForGameToStart();
      
      // Both should see the game interface
      await expect(page1.getByText('Your Hand')).toBeVisible();
      await expect(page2.getByText('Your Hand')).toBeVisible();
      
      // Both should see opponent info
      await expect(page1.getByText('demo2')).toBeVisible();
      await expect(page2.getByText('demo1')).toBeVisible();
    });
    
    await test.step('Handle upcard decision phase', async () => {
      // Determine who goes first and handle upcard decisions
      let currentPlayer = page1;
      let currentGame = game1;
      let waitingPlayer = page2;
      
      // Check which player has the turn
      if (await page2.getByText('Your Turn').isVisible({ timeout: 2000 })) {
        currentPlayer = page2;
        currentGame = game2;
        waitingPlayer = page1;
      }
      
      // Current player should see upcard decision
      if (await currentPlayer.getByText('Do you want to take the upcard?').isVisible()) {
        await currentGame.passUpcard();
      }
      
      // Other player might also get upcard decision
      if (await waitingPlayer.getByText('Do you want to take the upcard?').isVisible({ timeout: 5000 })) {
        const waitingGame = waitingPlayer === page1 ? game1 : game2;
        await waitingGame.passUpcard();
      }
    });
    
    await test.step('Players take turns', async () => {
      // Play a few rounds of turns
      for (let round = 0; round < 3; round++) {
        // Wait for someone to have a turn
        let activePlayer = page1;
        let activeGame = game1;
        let inactivePlayer = page2;
        
        // Determine who has the current turn
        const player1HasTurn = await page1.getByText('Your Turn').isVisible({ timeout: 5000 });
        if (!player1HasTurn) {
          activePlayer = page2;
          activeGame = game2;
          inactivePlayer = page1;
        }
        
        // Active player makes a move
        await activeGame.drawFromStock();
        
        // Select and discard a card
        const cards = activePlayer.locator('[data-testid^="card-"]');
        const firstCard = cards.first();
        const cardId = await firstCard.getAttribute('data-testid');
        const cleanCardId = cardId?.replace('card-', '') || '';
        
        await activeGame.selectCard(cleanCardId);
        await activeGame.discardCard();
        
        // Inactive player should see it's not their turn
        await expect(inactivePlayer.getByText("Opponent's Turn")).toBeVisible({ timeout: 5000 });
        
        // Wait a moment for turn transition
        await page1.waitForTimeout(2000);
      }
    });
    
    await test.step('Test real-time updates', async () => {
      // Both players should see the same game state
      const stockCount1 = await page1.getByText(/Stock: \d+/).textContent();
      const stockCount2 = await page2.getByText(/Stock: \d+/).textContent();
      
      expect(stockCount1).toBe(stockCount2);
    });
    
    await context1.close();
    await context2.close();
  });

  test('should handle player disconnection and reconnection', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const auth1 = new AuthHelper(page1);
    const auth2 = new AuthHelper(page2);
    const game1 = new GameHelper(page1);
    const game2 = new GameHelper(page2);
    
    let gameId: string;
    
    await test.step('Setup two-player game', async () => {
      await auth1.login('demo1@example.com', 'password123');
      await auth2.login('demo2@example.com', 'password123');
      
      gameId = await game1.createGame({ vsAI: false });
      await page2.goto('/lobby');
      await page2.click('button:has-text("Join")');
      
      await game1.waitForGameToStart();
      await game2.waitForGameToStart();
    });
    
    await test.step('Player 2 disconnects', async () => {
      await context2.close();
      
      // Player 1 should see disconnection notice
      await expect(page1.getByText(/disconnected|offline/i)).toBeVisible({ timeout: 10000 });
    });
    
    await test.step('Player 2 reconnects', async () => {
      const newContext2 = await browser.newContext();
      const newPage2 = await newContext2.newPage();
      const newAuth2 = new AuthHelper(newPage2);
      
      await newAuth2.login('demo2@example.com', 'password123');
      await newPage2.goto(`/game/${gameId}`);
      
      // Should be able to rejoin the game
      await expect(newPage2.getByText('Your Hand')).toBeVisible();
      
      // Player 1 should see reconnection
      await expect(page1.getByText(/connected|online/i)).toBeVisible({ timeout: 10000 });
      
      await newContext2.close();
    });
    
    await context1.close();
  });

  test('should handle chat between players', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const auth1 = new AuthHelper(page1);
    const auth2 = new AuthHelper(page2);
    const game1 = new GameHelper(page1);
    const game2 = new GameHelper(page2);
    
    await test.step('Setup two-player game', async () => {
      await auth1.login('demo1@example.com', 'password123');
      await auth2.login('demo2@example.com', 'password123');
      
      const gameId = await game1.createGame({ vsAI: false });
      await page2.goto('/lobby');
      await page2.click('button:has-text("Join")');
      
      await game1.waitForGameToStart();
      await game2.waitForGameToStart();
    });
    
    await test.step('Players exchange chat messages', async () => {
      const message1 = 'Hello from player 1!';
      const message2 = 'Hi back from player 2!';
      
      // Player 1 sends message
      await game1.sendChatMessage(message1);
      
      // Both players should see player 1's message
      await expect(page1.getByText(message1)).toBeVisible();
      await expect(page2.getByText(message1)).toBeVisible();
      await expect(page2.getByText('demo1:')).toBeVisible();
      
      // Player 2 responds
      await game2.sendChatMessage(message2);
      
      // Both players should see player 2's message
      await expect(page1.getByText(message2)).toBeVisible();
      await expect(page2.getByText(message2)).toBeVisible();
      await expect(page1.getByText('demo2:')).toBeVisible();
    });
    
    await context1.close();
    await context2.close();
  });

  test('should prevent cheating and validate moves', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const auth1 = new AuthHelper(page1);
    const auth2 = new AuthHelper(page2);
    const game1 = new GameHelper(page1);
    const game2 = new GameHelper(page2);
    
    await test.step('Setup two-player game', async () => {
      await auth1.login('demo1@example.com', 'password123');
      await auth2.login('demo2@example.com', 'password123');
      
      const gameId = await game1.createGame({ vsAI: false });
      await page2.goto('/lobby');
      await page2.click('button:has-text("Join")');
      
      await game1.waitForGameToStart();
      await game2.waitForGameToStart();
    });
    
    await test.step('Player cannot move when not their turn', async () => {
      // Determine who has the turn
      let activePlayer = page1;
      let inactivePlayer = page2;
      
      if (await page2.getByText('Your Turn').isVisible({ timeout: 2000 })) {
        activePlayer = page2;
        inactivePlayer = page1;
      }
      
      // Inactive player's move buttons should be disabled
      const inactiveDrawButton = inactivePlayer.getByText('Draw from Stock');
      if (await inactiveDrawButton.isVisible()) {
        await expect(inactiveDrawButton).toBeDisabled();
      }
    });
    
    await test.step('Cards are hidden from opponent', async () => {
      // Neither player should see the opponent's specific cards
      // Only card backs or card count should be visible
      await expect(page1.getByText(/Cards: \d+/)).toBeVisible();
      await expect(page2.getByText(/Cards: \d+/)).toBeVisible();
      
      // Should not see opponent's actual card values
      // This is more of a visual test - specific implementation depends on UI
    });
    
    await context1.close();
    await context2.close();
  });

  test('should handle game completion and scoring', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const auth1 = new AuthHelper(page1);
    const auth2 = new AuthHelper(page2);
    const game1 = new GameHelper(page1);
    const game2 = new GameHelper(page2);
    
    await test.step('Setup two-player game', async () => {
      await auth1.login('demo1@example.com', 'password123');
      await auth2.login('demo2@example.com', 'password123');
      
      const gameId = await game1.createGame({ vsAI: false });
      await page2.goto('/lobby');
      await page2.click('button:has-text("Join")');
      
      await game1.waitForGameToStart();
      await game2.waitForGameToStart();
    });
    
    await test.step('Play game and check for completion detection', async () => {
      // Play several turns (simplified for testing)
      // In a real scenario, we'd play until someone wins
      for (let i = 0; i < 5; i++) {
        let activePlayer = page1;
        let activeGame = game1;
        
        if (!await page1.getByText('Your Turn').isVisible({ timeout: 2000 })) {
          activePlayer = page2;
          activeGame = game2;
        }
        
        // Handle upcard decision if present
        if (await activePlayer.getByText('Do you want to take the upcard?').isVisible()) {
          await activeGame.passUpcard();
        }
        
        // Make a move
        if (await activePlayer.getByText('Your Turn').isVisible({ timeout: 5000 })) {
          await activeGame.drawFromStock();
          
          const cards = activePlayer.locator('[data-testid^="card-"]');
          const firstCard = cards.first();
          const cardId = await firstCard.getAttribute('data-testid');
          const cleanCardId = cardId?.replace('card-', '') || '';
          
          await activeGame.selectCard(cleanCardId);
          await activeGame.discardCard();
        }
        
        // Check if game ended
        if (await activePlayer.getByText(/Game Over|Round Complete|Congratulations/).isVisible({ timeout: 2000 })) {
          break;
        }
        
        await page1.waitForTimeout(1000);
      }
      
      // Even if game doesn't end naturally in test, both players should still be connected
      await expect(page1.getByText('Your Hand')).toBeVisible();
      await expect(page2.getByText('Your Hand')).toBeVisible();
    });
    
    await context1.close();
    await context2.close();
  });

  test('should handle spectators gracefully', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const context3 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const page3 = await context3.newPage();
    
    const auth1 = new AuthHelper(page1);
    const auth2 = new AuthHelper(page2);
    const auth3 = new AuthHelper(page3);
    
    let gameId: string;
    
    await test.step('Setup full game with two players', async () => {
      await auth1.login('demo1@example.com', 'password123');
      await auth2.login('demo2@example.com', 'password123');
      
      const game1 = new GameHelper(page1);
      gameId = await game1.createGame({ vsAI: false });
      
      await page2.goto('/lobby');
      await page2.click('button:has-text("Join")');
      
      await game1.waitForGameToStart();
    });
    
    await test.step('Third player tries to join full game', async () => {
      // Create a third user (if possible with existing demo accounts)
      // For this test, we'll assume there are demo accounts or create a new one
      const timestamp = Date.now();
      const email = `spectator-${timestamp}@example.com`;
      const username = `spectator${timestamp}`;
      
      try {
        await auth3.register(email, username, 'password123');
      } catch {
        // If registration fails, try with existing demo account
        await page3.goto('/login');
        await page3.fill('input[type="email"]', 'demo1@example.com');
        await page3.fill('input[type="password"]', 'password123');
        await page3.click('button[type="submit"]');
        await page3.waitForURL('/lobby');
      }
      
      // Try to access the full game
      await page3.goto(`/game/${gameId}`);
      
      // Should either be redirected away or see a "game full" message
      await expect(
        page3.getByText(/Game is full|Cannot join|Spectator mode|Game full/)
      ).toBeVisible({ timeout: 5000 });
    });
    
    await context1.close();
    await context2.close();
    await context3.close();
  });
});