import { create } from 'zustand';
import { User } from '@gin-rummy/common';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  
  // Computed
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,

  setUser: (user) => set({ user }),
  
  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ accessToken, refreshToken });
  },
  
  setLoading: (isLoading) => set({ isLoading }),
  
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ 
      user: null, 
      accessToken: null, 
      refreshToken: null, 
      isLoading: false 
    });
  },
  
  isAuthenticated: () => {
    const state = get();
    return Boolean(state.user && state.accessToken);
  },
}));