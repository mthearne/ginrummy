import { test, expect } from '@playwright/test';
import { AuthHelper } from './helpers/auth';

test.describe('Authentication Flow', () => {
  let authHelper: AuthHelper;

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    await authHelper.ensureLoggedOut();
  });

  test('should allow user registration and login', async ({ page }) => {
    const timestamp = Date.now();
    const email = `test-user-${timestamp}@example.com`;
    const username = `testuser${timestamp}`;
    const password = 'testpass123';

    // Test registration
    await test.step('Register new user', async () => {
      await authHelper.register(email, username, password);
      
      // Verify we're in the lobby after registration
      await expect(page).toHaveURL('/lobby');
      await expect(page.getByText('Welcome')).toBeVisible();
    });

    // Test logout
    await test.step('Logout user', async () => {
      await authHelper.logout();
      await expect(page).toHaveURL('/login');
    });

    // Test login with registered credentials
    await test.step('Login with registered credentials', async () => {
      await authHelper.login(email, password);
      await expect(page).toHaveURL('/lobby');
      await expect(page.getByText('Welcome')).toBeVisible();
    });
  });

  test('should show validation errors for invalid registration', async ({ page }) => {
    await page.goto('/register');

    // Test empty fields
    await test.step('Show errors for empty fields', async () => {
      await page.click('button[type="submit"]');
      await expect(page.getByText('Email is required')).toBeVisible();
      await expect(page.getByText('Username is required')).toBeVisible();
      await expect(page.getByText('Password is required')).toBeVisible();
    });

    // Test invalid email
    await test.step('Show error for invalid email', async () => {
      await page.fill('input[name="email"]', 'invalid-email');
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');
      
      await expect(page.getByText('Invalid email format')).toBeVisible();
    });

    // Test short password
    await test.step('Show error for short password', async () => {
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', '123');
      await page.click('button[type="submit"]');
      
      await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
    });
  });

  test('should show validation errors for invalid login', async ({ page }) => {
    await page.goto('/login');

    // Test empty fields
    await test.step('Show errors for empty fields', async () => {
      await page.click('button[type="submit"]');
      await expect(page.getByText('Email is required')).toBeVisible();
      await expect(page.getByText('Password is required')).toBeVisible();
    });

    // Test invalid credentials
    await test.step('Show error for invalid credentials', async () => {
      await page.fill('input[type="email"]', 'nonexistent@example.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      await expect(page.getByText('Invalid credentials')).toBeVisible();
    });
  });

  test('should redirect authenticated users away from auth pages', async ({ page }) => {
    // First login
    const timestamp = Date.now();
    const email = `redirect-test-${timestamp}@example.com`;
    const username = `redirecttest${timestamp}`;
    const password = 'testpass123';
    
    await authHelper.register(email, username, password);
    
    // Try to access login page while authenticated
    await test.step('Redirect from login page when authenticated', async () => {
      await page.goto('/login');
      await expect(page).toHaveURL('/lobby');
    });
    
    // Try to access register page while authenticated
    await test.step('Redirect from register page when authenticated', async () => {
      await page.goto('/register');
      await expect(page).toHaveURL('/lobby');
    });
  });

  test('should persist login across page refreshes', async ({ page }) => {
    const timestamp = Date.now();
    const email = `persist-test-${timestamp}@example.com`;
    const username = `persisttest${timestamp}`;
    const password = 'testpass123';
    
    // Register and login
    await authHelper.register(email, username, password);
    
    // Refresh the page
    await page.reload();
    
    // Should still be logged in
    await expect(page).toHaveURL('/lobby');
    await expect(page.getByText('Welcome')).toBeVisible();
  });

  test('should handle session expiration gracefully', async ({ page }) => {
    const timestamp = Date.now();
    const email = `expire-test-${timestamp}@example.com`;
    const username = `expiretest${timestamp}`;
    const password = 'testpass123';
    
    await authHelper.register(email, username, password);
    
    // Simulate session expiration by clearing localStorage/cookies
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Try to access protected route
    await page.goto('/lobby');
    
    // Should be redirected to login
    await expect(page).toHaveURL('/login');
  });

  test('should show loading states during authentication', async ({ page }) => {
    await page.goto('/login');
    
    // Fill valid credentials
    await page.fill('input[type="email"]', 'demo1@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    // Click submit and immediately check for loading state
    const submitButton = page.getByRole('button', { name: 'Sign In' });
    await submitButton.click();
    
    // Should show loading state (button disabled or loading text)
    await expect(submitButton).toBeDisabled();
  });
});