import { Page, expect } from '@playwright/test';

export class GameHelper {
  constructor(private page: Page) {}

  async createGame(options: { vsAI?: boolean; private?: boolean } = {}) {
    await this.page.goto('/lobby');
    
    // Click create game button
    await this.page.click('button:has-text("Create Game")');
    
    // Configure game options
    if (options.vsAI) {
      await this.page.click('input[type="checkbox"]:near(:text("vs AI"))');
    }
    
    if (options.private) {
      await this.page.click('input[type="checkbox"]:near(:text("Private"))');
    }
    
    // Submit game creation
    await this.page.click('button:has-text("Create")');
    
    // Wait for game to be created and page to redirect
    await this.page.waitForURL('/game/*', { timeout: 10000 });
    
    // Extract game ID from URL
    const url = this.page.url();
    const gameId = url.split('/game/')[1];
    
    return gameId;
  }

  async joinGame(gameId: string) {
    await this.page.goto(`/game/${gameId}`);
    
    // Wait for game to load
    await expect(this.page.getByText('Game')).toBeVisible({ timeout: 5000 });
  }

  async waitForGameToStart() {
    // Wait for game state to show actual game interface (not waiting screen)
    await expect(this.page.getByText('Your Hand')).toBeVisible({ timeout: 15000 });
  }

  async selectCard(cardId: string) {
    await this.page.click(`[data-testid="card-${cardId}"]`);
    
    // Verify card is selected (has selected styling)
    await expect(this.page.locator(`[data-testid="card-${cardId}"]`)).toHaveClass(/selected/);
  }

  async drawFromStock() {
    await this.page.click('button:has-text("Draw from Stock")');
    
    // Wait for draw action to complete
    await this.page.waitForTimeout(1000);
  }

  async drawFromDiscard() {
    await this.page.click('[data-testid="discard-pile"]');
    
    // Wait for draw action to complete
    await this.page.waitForTimeout(1000);
  }

  async discardCard() {
    // Assumes a card is already selected
    await this.page.click('button:has-text("Discard")');
    
    // Wait for discard action to complete
    await this.page.waitForTimeout(1000);
  }

  async takeUpcard() {
    await this.page.click('button:has-text("Take Upcard")');
    
    // Wait for action to complete
    await this.page.waitForTimeout(1000);
  }

  async passUpcard() {
    await this.page.click('button:has-text("Pass")');
    
    // Wait for action to complete
    await this.page.waitForTimeout(1000);
  }

  async knock() {
    await this.page.click('button:has-text("Knock")');
    
    // Wait for knock action to complete
    await this.page.waitForTimeout(2000);
  }

  async waitForTurn() {
    // Wait for "Your Turn" indicator
    await expect(this.page.getByText('Your Turn')).toBeVisible({ timeout: 30000 });
  }

  async waitForOpponentTurn() {
    // Wait for opponent turn indicator
    await expect(this.page.getByText('Opponent\'s Turn')).toBeVisible({ timeout: 30000 });
  }

  async sendChatMessage(message: string) {
    await this.page.fill('[data-testid="chat-input"]', message);
    await this.page.click('[data-testid="chat-send"]');
    
    // Verify message appears in chat
    await expect(this.page.getByText(message)).toBeVisible();
  }

  async verifyGameState(expectedState: {
    phase?: string;
    playerCards?: number;
    opponentCards?: number;
    stockPileCount?: number;
    discardPileVisible?: boolean;
  }) {
    if (expectedState.phase) {
      await expect(this.page.getByText(expectedState.phase)).toBeVisible();
    }
    
    if (expectedState.playerCards !== undefined) {
      await expect(this.page.getByText(`Your Hand (${expectedState.playerCards} cards)`)).toBeVisible();
    }
    
    if (expectedState.opponentCards !== undefined) {
      await expect(this.page.getByText(`Cards: ${expectedState.opponentCards}`)).toBeVisible();
    }
    
    if (expectedState.stockPileCount !== undefined) {
      await expect(this.page.getByText(`Stock: ${expectedState.stockPileCount}`)).toBeVisible();
    }
    
    if (expectedState.discardPileVisible !== undefined) {
      const discardPile = this.page.locator('[data-testid="discard-pile"]');
      if (expectedState.discardPileVisible) {
        await expect(discardPile).toBeVisible();
      } else {
        await expect(discardPile).not.toBeVisible();
      }
    }
  }

  async returnToLobby() {
    await this.page.click('button:has-text("Back to Lobby")');
    await this.page.waitForURL('/lobby', { timeout: 5000 });
  }
}