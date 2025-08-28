import { test, expect } from '@playwright/test';
import { AuthHelper } from './helpers/auth';
import { GameHelper } from './helpers/game';

test.describe('Gin Rummy Gameplay', () => {
  let authHelper: AuthHelper;
  let gameHelper: GameHelper;

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    gameHelper = new GameHelper(page);
    
    // Login with demo user
    await authHelper.login('demo1@example.com', 'password123');
  });

  test('should complete basic PvE game flow', async ({ page }) => {
    let gameId: string;
    
    await test.step('Create and start PvE game', async () => {
      gameId = await gameHelper.createGame({ vsAI: true });
      await gameHelper.waitForGameToStart();
      
      // Verify initial game state
      await gameHelper.verifyGameState({
        playerCards: 10, // Standard gin rummy hand size
        phase: 'Drawing a card'
      });
    });
    
    await test.step('Handle upcard decision phase', async () => {
      // Check if we're in upcard decision phase
      const upcardDecision = page.getByText('Do you want to take the upcard?');
      
      if (await upcardDecision.isVisible()) {
        // For this test, we'll pass on the upcard
        await gameHelper.passUpcard();
        await gameHelper.waitForTurn();
      }
    });
    
    await test.step('Perform draw and discard actions', async () => {
      // Wait for our turn
      await gameHelper.waitForTurn();
      
      // Draw from stock pile
      await gameHelper.drawFromStock();
      
      // Should now have 11 cards and be in discard phase
      await gameHelper.verifyGameState({
        playerCards: 11,
        phase: 'Choose a card to discard'
      });
      
      // Select first card and discard
      const firstCard = page.locator('[data-testid^="card-"]').first();
      const cardId = await firstCard.getAttribute('data-testid');
      const cleanCardId = cardId?.replace('card-', '') || '';
      
      await gameHelper.selectCard(cleanCardId);
      await gameHelper.discardCard();
      
      // Should be back to 10 cards
      await gameHelper.verifyGameState({
        playerCards: 10
      });
    });
    
    await test.step('Wait for AI turn and continue game', async () => {
      // AI should take its turn
      await gameHelper.waitForOpponentTurn();
      
      // Wait for AI to complete its turn and our turn to come back
      await gameHelper.waitForTurn();
      
      // Game should continue normally
      await expect(page.getByText('Your Turn')).toBeVisible();
    });
  });

  test('should handle drawing from discard pile', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    // Wait for a few turns to build up discard pile
    await test.step('Build discard pile', async () => {
      // Skip upcard decision if present
      if (await page.getByText('Do you want to take the upcard?').isVisible()) {
        await gameHelper.passUpcard();
      }
      
      // Perform a few draw/discard cycles
      for (let i = 0; i < 2; i++) {
        await gameHelper.waitForTurn();
        await gameHelper.drawFromStock();
        
        // Discard a card
        const cards = page.locator('[data-testid^="card-"]');
        const firstCard = cards.first();
        const cardId = await firstCard.getAttribute('data-testid');
        const cleanCardId = cardId?.replace('card-', '') || '';
        
        await gameHelper.selectCard(cleanCardId);
        await gameHelper.discardCard();
        
        // Wait for AI turn
        if (i < 1) { // Don't wait on the last iteration
          await gameHelper.waitForOpponentTurn();
        }
      }
    });
    
    await test.step('Draw from discard pile', async () => {
      await gameHelper.waitForTurn();
      
      // Try to draw from discard pile
      const discardPile = page.locator('[data-testid="discard-pile"]');
      if (await discardPile.isVisible()) {
        await gameHelper.drawFromDiscard();
        
        // Should now have 11 cards
        await gameHelper.verifyGameState({
          playerCards: 11
        });
      }
    });
  });

  test('should handle upcard decision correctly', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    await test.step('Test taking upcard', async () => {
      const upcardDecision = page.getByText('Do you want to take the upcard?');
      
      if (await upcardDecision.isVisible()) {
        await gameHelper.takeUpcard();
        
        // Should move to discard phase with 11 cards
        await gameHelper.verifyGameState({
          playerCards: 11,
          phase: 'Choose a card to discard'
        });
      }
    });
  });

  test('should display game state information correctly', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    await test.step('Verify game UI elements', async () => {
      // Should show player information
      await expect(page.getByText('Your Hand')).toBeVisible();
      await expect(page.getByText('AI Player')).toBeVisible();
      
      // Should show game state info
      await expect(page.getByText(/Stock: \d+/)).toBeVisible();
      await expect(page.getByText(/Score: \d+/)).toBeVisible();
      
      // Should show current phase
      await expect(page.getByText(/Drawing|Discard|Choose/)).toBeVisible();
    });
    
    await test.step('Verify card display', async () => {
      // Should show player cards
      const playerCards = page.locator('[data-testid^="card-"]');
      const cardCount = await playerCards.count();
      expect(cardCount).toBe(10); // Standard starting hand
      
      // Cards should be clickable
      const firstCard = playerCards.first();
      await expect(firstCard).toBeVisible();
      await firstCard.click();
      await expect(firstCard).toHaveClass(/selected/);
    });
  });

  test('should handle game chat functionality', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    await test.step('Send and display chat messages', async () => {
      const testMessage = 'Hello, this is a test message!';
      
      // Send chat message
      await gameHelper.sendChatMessage(testMessage);
      
      // Message should appear in chat
      await expect(page.getByText(testMessage)).toBeVisible();
      
      // Should show sender name
      await expect(page.getByText('demo1:')).toBeVisible();
    });
  });

  test('should show AI thinking states', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    // Skip upcard if present
    if (await page.getByText('Do you want to take the upcard?').isVisible()) {
      await gameHelper.passUpcard();
    }
    
    await test.step('Observe AI thinking indicator', async () => {
      // Wait for our turn, then make a move to trigger AI turn
      await gameHelper.waitForTurn();
      await gameHelper.drawFromStock();
      
      // Select and discard a card
      const firstCard = page.locator('[data-testid^="card-"]').first();
      const cardId = await firstCard.getAttribute('data-testid');
      const cleanCardId = cardId?.replace('card-', '') || '';
      
      await gameHelper.selectCard(cleanCardId);
      await gameHelper.discardCard();
      
      // Should show AI thinking overlay or indicator
      await expect(page.getByText(/AI is thinking|Processing/)).toBeVisible({ timeout: 5000 });
    });
  });

  test('should handle game navigation', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    await test.step('Return to lobby from game', async () => {
      await gameHelper.returnToLobby();
      await expect(page).toHaveURL('/lobby');
      await expect(page.getByText('Available Games')).toBeVisible();
    });
    
    await test.step('Rejoin game from lobby', async () => {
      // Should see the game in "My Games"
      await page.click('button:has-text("My Games")');
      await expect(page.getByText('In Progress')).toBeVisible();
      
      // Click to rejoin the game
      await page.click('button:has-text("Resume")');
      await expect(page).toHaveURL(`/game/${gameId}`);
      await gameHelper.waitForGameToStart();
    });
  });

  test('should handle connection issues gracefully', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    await test.step('Simulate connection loss', async () => {
      // Simulate going offline
      await page.context().setOffline(true);
      
      // Should show connection warning
      await expect(page.getByText(/Disconnected|Connection lost|Offline/)).toBeVisible({ timeout: 10000 });
    });
    
    await test.step('Reconnect and resume game', async () => {
      // Go back online
      await page.context().setOffline(false);
      await page.reload(); // Simulate reconnection
      
      // Should be able to resume game
      await gameHelper.waitForGameToStart();
      await expect(page.getByText('Your Hand')).toBeVisible();
    });
  });

  test('should validate move legality', async ({ page }) => {
    const gameId = await gameHelper.createGame({ vsAI: true });
    await gameHelper.waitForGameToStart();
    
    await test.step('Test invalid move rejection', async () => {
      // Skip upcard decision
      if (await page.getByText('Do you want to take the upcard?').isVisible()) {
        await gameHelper.passUpcard();
      }
      
      await gameHelper.waitForTurn();
      
      // Try to discard without drawing first (should be prevented by UI)
      const discardButton = page.getByText('Discard');
      if (await discardButton.isVisible()) {
        // Button should be disabled when no card is selected or no draw has occurred
        await expect(discardButton).toBeDisabled();
      }
    });
    
    await test.step('Test valid move sequence', async () => {
      // Draw a card first
      await gameHelper.drawFromStock();
      
      // Now should be able to select and discard
      const firstCard = page.locator('[data-testid^="card-"]').first();
      const cardId = await firstCard.getAttribute('data-testid');
      const cleanCardId = cardId?.replace('card-', '') || '';
      
      await gameHelper.selectCard(cleanCardId);
      
      // Discard button should now be enabled
      const discardButton = page.getByText('Discard');
      await expect(discardButton).toBeEnabled();
      
      await gameHelper.discardCard();
      
      // Move should complete successfully
      await expect(page.getByText(/Opponent's Turn|AI is thinking/)).toBeVisible();
    });
  });
});