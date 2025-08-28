import { Page, expect } from '@playwright/test';

export class AuthHelper {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto('/login');
    
    // Fill login form
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    
    // Submit form
    await this.page.click('button[type="submit"]');
    
    // Wait for successful login (redirect to lobby)
    await this.page.waitForURL('/lobby', { timeout: 10000 });
    
    // Verify we're logged in by checking for user elements
    await expect(this.page.getByText('Welcome')).toBeVisible({ timeout: 5000 });
  }

  async register(email: string, username: string, password: string) {
    await this.page.goto('/register');
    
    // Fill registration form
    await this.page.fill('input[name="email"]', email);
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    
    // Submit form
    await this.page.click('button[type="submit"]');
    
    // Wait for successful registration (redirect to lobby)
    await this.page.waitForURL('/lobby', { timeout: 10000 });
  }

  async logout() {
    // Click user menu or logout button
    await this.page.click('[data-testid="user-menu"]');
    await this.page.click('text=Logout');
    
    // Wait for redirect to home/login
    await this.page.waitForURL(/\/(login)?$/, { timeout: 5000 });
  }

  async ensureLoggedOut() {
    // Go to login page and verify we're not already logged in
    await this.page.goto('/login');
    
    // If we get redirected to lobby, we need to logout first
    if (this.page.url().includes('/lobby')) {
      await this.logout();
    }
  }
}