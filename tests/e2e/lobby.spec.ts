import { test, expect } from '@playwright/test';
import { AuthHelper } from './helpers/auth';
import { GameHelper } from './helpers/game';

test.describe('Lobby Functionality', () => {
  let authHelper: AuthHelper;
  let gameHelper: GameHelper;

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    gameHelper = new GameHelper(page);
    
    // Login with demo user
    await authHelper.login('demo1@example.com', 'password123');
  });

  test('should display lobby interface correctly', async ({ page }) => {
    await page.goto('/lobby');
    
    await test.step('Display main lobby elements', async () => {
      // Check for main lobby sections
      await expect(page.getByText('Available Games')).toBeVisible();
      await expect(page.getByText('Create Game')).toBeVisible();
      await expect(page.getByText('Online Users')).toBeVisible();
      
      // Check for game filtering options
      await expect(page.getByText('All Games')).toBeVisible();
      await expect(page.getByText('PvP')).toBeVisible();
      await expect(page.getByText('PvE')).toBeVisible();
    });
    
    await test.step('Display user info', async () => {
      // Should show welcome message with username
      await expect(page.getByText('Welcome')).toBeVisible();
      await expect(page.getByText('demo1')).toBeVisible();
      
      // Should show user stats
      await expect(page.getByText('ELO')).toBeVisible();
      await expect(page.getByText('Games Played')).toBeVisible();
    });
  });

  test('should create and display PvE game', async ({ page }) => {
    await page.goto('/lobby');
    
    await test.step('Create PvE game', async () => {
      // Click create game
      await page.click('button:has-text("Create Game")');
      
      // Select vs AI option
      await page.click('input[type="checkbox"]:near(:text("vs AI"))');
      
      // Submit
      await page.click('button:has-text("Create")');
      
      // Should redirect to game page
      await expect(page).toHaveURL(/\/game\/[a-z0-9-]+/);
    });
    
    await test.step('Verify game starts automatically', async () => {
      // PvE games should start immediately
      await gameHelper.waitForGameToStart();
      await expect(page.getByText('Your Hand')).toBeVisible();
      await expect(page.getByText('AI Player')).toBeVisible();
    });
  });

  test('should create and list PvP game in lobby', async ({ page }) => {
    await page.goto('/lobby');
    
    let gameId: string;
    
    await test.step('Create PvP game', async () => {
      // Create PvP game (default settings)
      gameId = await gameHelper.createGame({ vsAI: false });
      expect(gameId).toBeTruthy();
    });
    
    await test.step('Return to lobby and verify game is listed', async () => {
      await page.goto('/lobby');
      
      // Should see the created game in the list
      await expect(page.getByText('Waiting for opponent')).toBeVisible();
      await expect(page.getByText('1/2 players')).toBeVisible();
      await expect(page.getByText('demo1')).toBeVisible(); // Creator name
    });
  });

  test('should filter games correctly', async ({ page }) => {
    await page.goto('/lobby');
    
    // Create both PvP and PvE games for filtering test
    await test.step('Create test games', async () => {
      // Create PvP game
      await gameHelper.createGame({ vsAI: false });
      await page.goto('/lobby');
      
      // Create PvE game
      await gameHelper.createGame({ vsAI: true });
      await page.goto('/lobby');
    });
    
    await test.step('Filter by All Games', async () => {
      await page.click('button:has-text("All Games")');
      // Should see both types of games
      await expect(page.getByText('vs AI')).toBeVisible();
      await expect(page.getByText('PvP')).toBeVisible();
    });
    
    await test.step('Filter by PvP only', async () => {
      await page.click('button:has-text("PvP")');
      // Should only see PvP games
      await expect(page.getByText('PvP')).toBeVisible();
      await expect(page.getByText('vs AI')).not.toBeVisible();
    });
    
    await test.step('Filter by PvE only', async () => {
      await page.click('button:has-text("PvE")');
      // Should only see PvE games
      await expect(page.getByText('vs AI')).toBeVisible();
      await expect(page.getByText('PvP')).not.toBeVisible();
    });
  });

  test('should switch between available games and my games', async ({ page }) => {
    await page.goto('/lobby');
    
    // Create a game to have something in "My Games"
    await gameHelper.createGame({ vsAI: false });
    await page.goto('/lobby');
    
    await test.step('View Available Games', async () => {
      await page.click('button:has-text("Available Games")');
      await expect(page.getByText('Available Games')).toHaveClass(/active/);
    });
    
    await test.step('Switch to My Games', async () => {
      await page.click('button:has-text("My Games")');
      await expect(page.getByText('My Games')).toHaveClass(/active/);
      
      // Should show our created game
      await expect(page.getByText('Waiting for opponent')).toBeVisible();
    });
  });

  test('should join existing PvP game', async ({ page, context }) => {
    // Create a second browser context for the second player
    const secondContext = await context.browser()?.newContext();
    const secondPage = await secondContext!.newPage();
    const secondAuthHelper = new AuthHelper(secondPage);
    
    let gameId: string;
    
    await test.step('First player creates game', async () => {
      gameId = await gameHelper.createGame({ vsAI: false });
      await page.goto('/lobby'); // Return to lobby
    });
    
    await test.step('Second player joins game', async () => {
      // Login as second user
      await secondAuthHelper.login('demo2@example.com', 'password123');
      await secondPage.goto('/lobby');
      
      // Find and join the game
      await expect(secondPage.getByText('demo1')).toBeVisible(); // Creator
      await secondPage.click(`button:has-text("Join"):near(:text("demo1"))`);
      
      // Should redirect to game
      await expect(secondPage).toHaveURL(new RegExp(gameId));
    });
    
    await test.step('Verify both players can see the game', async () => {
      // First player should also be in the game now
      await page.goto(`/game/${gameId}`);
      await gameHelper.waitForGameToStart();
      
      // Both players should see the game interface
      await expect(page.getByText('Your Hand')).toBeVisible();
      await expect(secondPage.getByText('Your Hand')).toBeVisible();
    });
    
    await secondContext!.close();
  });

  test('should display online user count', async ({ page }) => {
    await page.goto('/lobby');
    
    // Should show online users count
    await expect(page.getByText(/Online Users: \d+/)).toBeVisible();
    
    // Should show at least 1 (current user)
    const onlineText = await page.getByText(/Online Users: \d+/).textContent();
    const count = parseInt(onlineText?.match(/\d+/)?.[0] || '0');
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should handle empty game list', async ({ page }) => {
    await page.goto('/lobby');
    
    // If no games available, should show appropriate message
    const gamesList = page.locator('[data-testid="games-list"]');
    
    // Check if games list is empty
    const gamesCount = await gamesList.locator('.game-item').count();
    
    if (gamesCount === 0) {
      await expect(page.getByText('No games available')).toBeVisible();
    }
  });

  test('should refresh game list automatically', async ({ page }) => {
    await page.goto('/lobby');
    
    // Wait for automatic refresh (should happen periodically)
    await page.waitForTimeout(5000);
    
    // The games list should still be visible and functional
    await expect(page.getByText('Available Games')).toBeVisible();
    
    // Create a game in another tab to test real-time updates would require WebSocket testing
    // For now, just verify the refresh mechanism doesn't break the UI
    await page.reload();
    await expect(page.getByText('Available Games')).toBeVisible();
  });

  test('should show loading states', async ({ page }) => {
    await page.goto('/lobby');
    
    // Check for loading indicators when appropriate
    await expect(page.getByText('Loading')).not.toBeVisible(); // Should not be loading after page load
    
    // Create game and check for loading state
    await page.click('button:has-text("Create Game")');
    
    // Submit and check for loading state on button
    const createButton = page.getByText('Create');
    await createButton.click();
    
    // Button should show loading state or be disabled
    await expect(createButton).toBeDisabled();
  });
});