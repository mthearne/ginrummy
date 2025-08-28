import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from '../auth';
import { User } from '@gin-rummy/common';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('Auth Store', () => {
  const mockUser: User = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    elo: 1200,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  const mockAccessToken = 'mock-access-token';
  const mockRefreshToken = 'mock-refresh-token';

  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false
    });

    // Clear localStorage mock calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset store to initial state
    useAuthStore.getState().logout();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState();
      
      expect(state.user).toBe(null);
      expect(state.accessToken).toBe(null);
      expect(state.refreshToken).toBe(null);
      expect(state.isLoading).toBe(false);
    });

    it('should not be authenticated initially', () => {
      const state = useAuthStore.getState();
      
      expect(state.isAuthenticated()).toBe(false);
    });
  });

  describe('setUser', () => {
    it('should set user correctly', () => {
      const state = useAuthStore.getState();
      
      state.setUser(mockUser);
      
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it('should clear user when set to null', () => {
      const state = useAuthStore.getState();
      
      // First set a user
      state.setUser(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
      
      // Then clear it
      state.setUser(null);
      expect(useAuthStore.getState().user).toBe(null);
    });
  });

  describe('setTokens', () => {
    it('should set tokens and store in localStorage', () => {
      const state = useAuthStore.getState();
      
      state.setTokens(mockAccessToken, mockRefreshToken);
      
      const newState = useAuthStore.getState();
      expect(newState.accessToken).toBe(mockAccessToken);
      expect(newState.refreshToken).toBe(mockRefreshToken);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', mockAccessToken);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', mockRefreshToken);
    });

    it('should update tokens when called multiple times', () => {
      const state = useAuthStore.getState();
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';
      
      // Set initial tokens
      state.setTokens(mockAccessToken, mockRefreshToken);
      
      // Update tokens
      state.setTokens(newAccessToken, newRefreshToken);
      
      const newState = useAuthStore.getState();
      expect(newState.accessToken).toBe(newAccessToken);
      expect(newState.refreshToken).toBe(newRefreshToken);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', newAccessToken);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', newRefreshToken);
    });
  });

  describe('setLoading', () => {
    it('should set loading state to true', () => {
      const state = useAuthStore.getState();
      
      state.setLoading(true);
      
      expect(useAuthStore.getState().isLoading).toBe(true);
    });

    it('should set loading state to false', () => {
      const state = useAuthStore.getState();
      
      // First set to true
      state.setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
      
      // Then set to false
      state.setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should toggle loading state multiple times', () => {
      const state = useAuthStore.getState();
      
      expect(useAuthStore.getState().isLoading).toBe(false);
      
      state.setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
      
      state.setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
      
      state.setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
    });
  });

  describe('logout', () => {
    it('should clear all state and localStorage', () => {
      const state = useAuthStore.getState();
      
      // Set up authenticated state
      state.setUser(mockUser);
      state.setTokens(mockAccessToken, mockRefreshToken);
      state.setLoading(true);
      
      // Verify state is set
      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().accessToken).toBe(mockAccessToken);
      expect(useAuthStore.getState().refreshToken).toBe(mockRefreshToken);
      expect(useAuthStore.getState().isLoading).toBe(true);
      
      // Logout
      state.logout();
      
      // Verify state is cleared
      const newState = useAuthStore.getState();
      expect(newState.user).toBe(null);
      expect(newState.accessToken).toBe(null);
      expect(newState.refreshToken).toBe(null);
      expect(newState.isLoading).toBe(false);
      
      // Verify localStorage is cleared
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
    });

    it('should work when called multiple times', () => {
      const state = useAuthStore.getState();
      
      // Set up state
      state.setUser(mockUser);
      state.setTokens(mockAccessToken, mockRefreshToken);
      
      // Logout multiple times
      state.logout();
      state.logout();
      
      // Should still be in clean state
      const newState = useAuthStore.getState();
      expect(newState.user).toBe(null);
      expect(newState.accessToken).toBe(null);
      expect(newState.refreshToken).toBe(null);
      expect(newState.isLoading).toBe(false);
    });

    it('should work when called on clean state', () => {
      const state = useAuthStore.getState();
      
      // Logout when already logged out
      expect(() => state.logout()).not.toThrow();
      
      const newState = useAuthStore.getState();
      expect(newState.user).toBe(null);
      expect(newState.accessToken).toBe(null);
      expect(newState.refreshToken).toBe(null);
      expect(newState.isLoading).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no user', () => {
      const state = useAuthStore.getState();
      
      state.setTokens(mockAccessToken, mockRefreshToken);
      
      expect(state.isAuthenticated()).toBe(false);
    });

    it('should return false when no access token', () => {
      const state = useAuthStore.getState();
      
      state.setUser(mockUser);
      
      expect(state.isAuthenticated()).toBe(false);
    });

    it('should return true when both user and access token are present', () => {
      const state = useAuthStore.getState();
      
      state.setUser(mockUser);
      state.setTokens(mockAccessToken, mockRefreshToken);
      
      expect(state.isAuthenticated()).toBe(true);
    });

    it('should return false after logout', () => {
      const state = useAuthStore.getState();
      
      // Set authenticated state
      state.setUser(mockUser);
      state.setTokens(mockAccessToken, mockRefreshToken);
      expect(state.isAuthenticated()).toBe(true);
      
      // Logout
      state.logout();
      expect(state.isAuthenticated()).toBe(false);
    });

    it('should handle user being cleared separately', () => {
      const state = useAuthStore.getState();
      
      // Set authenticated state
      state.setUser(mockUser);
      state.setTokens(mockAccessToken, mockRefreshToken);
      expect(state.isAuthenticated()).toBe(true);
      
      // Clear just the user
      state.setUser(null);
      expect(state.isAuthenticated()).toBe(false);
    });
  });

  describe('Store Integration', () => {
    it('should handle complete authentication flow', () => {
      const state = useAuthStore.getState();
      
      // Start loading
      state.setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
      expect(useAuthStore.getState().isAuthenticated()).toBe(false);
      
      // Set tokens
      state.setTokens(mockAccessToken, mockRefreshToken);
      expect(useAuthStore.getState().accessToken).toBe(mockAccessToken);
      expect(useAuthStore.getState().refreshToken).toBe(mockRefreshToken);
      expect(useAuthStore.getState().isAuthenticated()).toBe(false); // Still no user
      
      // Set user
      state.setUser(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().isAuthenticated()).toBe(true);
      
      // Stop loading
      state.setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().isAuthenticated()).toBe(true);
      
      // Logout
      state.logout();
      expect(useAuthStore.getState().isAuthenticated()).toBe(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().user).toBe(null);
      expect(useAuthStore.getState().accessToken).toBe(null);
      expect(useAuthStore.getState().refreshToken).toBe(null);
    });

    it('should maintain state consistency across multiple operations', () => {
      const state = useAuthStore.getState();
      
      // Perform multiple operations
      state.setLoading(true);
      state.setUser(mockUser);
      state.setLoading(false);
      state.setTokens(mockAccessToken, mockRefreshToken);
      state.setLoading(true);
      state.setLoading(false);
      
      const finalState = useAuthStore.getState();
      expect(finalState.user).toEqual(mockUser);
      expect(finalState.accessToken).toBe(mockAccessToken);
      expect(finalState.refreshToken).toBe(mockRefreshToken);
      expect(finalState.isLoading).toBe(false);
      expect(finalState.isAuthenticated()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined user', () => {
      const state = useAuthStore.getState();
      
      expect(() => state.setUser(undefined as any)).not.toThrow();
      expect(useAuthStore.getState().user).toBe(undefined);
    });

    it('should handle empty string tokens', () => {
      const state = useAuthStore.getState();
      
      state.setTokens('', '');
      
      const newState = useAuthStore.getState();
      expect(newState.accessToken).toBe('');
      expect(newState.refreshToken).toBe('');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', '');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', '');
    });

    it('should handle localStorage errors gracefully', () => {
      const state = useAuthStore.getState();
      
      // Mock localStorage to throw error
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });
      
      // Should throw when localStorage fails
      expect(() => state.setTokens(mockAccessToken, mockRefreshToken)).toThrow('localStorage error');
      
      // State should remain unchanged when localStorage fails
      const newState = useAuthStore.getState();
      expect(newState.accessToken).toBe(null);
      expect(newState.refreshToken).toBe(null);
    });
  });
});