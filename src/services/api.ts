import axios from 'axios';
import { useAuthStore } from '../store/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (
  typeof window !== 'undefined' 
    ? '/api'  // Use relative API routes for Next.js
    : '/api'  // Use relative API routes for SSR too
);

// Create axios instance
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    console.log('API Request:', config.url, 'Token present:', !!token);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Added auth header for:', config.url);
    } else {
      console.warn('No access token found for:', config.url);
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data;
        localStorage.setItem('accessToken', accessToken);
        
        // Update the token in the auth store too
        const authStore = useAuthStore.getState();
        if (authStore.refreshToken) {
          authStore.setTokens(accessToken, authStore.refreshToken);
        }

        // Retry the original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        console.warn('Token refresh failed, logging out user:', refreshError.message);
        const authStore = useAuthStore.getState();
        authStore.logout();
        
        // Force page reload to ensure clean state
        console.log('Redirecting to login after token refresh failure');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// API methods
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  
  register: (email: string, username: string, password: string) =>
    api.post('/auth/register', { email, username, password }),
  
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  
  getProfile: () =>
    api.get('/auth/me'),
};

export const gamesAPI = {
  createGame: (data: { vsAI?: boolean; isPrivate?: boolean; maxPlayers?: number }) =>
    api.post('/games', data),
  
  listGames: (params?: { status?: string; limit?: number; offset?: number }) =>
    api.get('/games', { params }),

  getMyGames: () =>
    api.get('/games/my-games'),
  
  getGame: (gameId: string) =>
    api.get(`/games/${gameId}`),
  
  joinGame: (gameId: string) =>
    api.post(`/games/${gameId}/join`),
  
  leaveGame: (gameId: string) =>
    api.post(`/games/${gameId}/leave`),
  
  resignGame: (gameId: string) =>
    api.post(`/games/${gameId}/leave`),
  
  getReplay: (gameId: string) =>
    api.get(`/games/${gameId}/replay`),
};

export const usersAPI = {
  getProfile: (username: string, params?: { includeHistory?: boolean; historyLimit?: number }) =>
    api.get(`/users/profile/${username}`, { params }),
  
  updateProfile: (data: { username?: string }) =>
    api.patch('/users/profile', data),
  
  getLeaderboard: (params?: { limit?: number; offset?: number }) =>
    api.get('/users/leaderboard', { params }),
  
  getStats: () =>
    api.get('/users/stats'),
};

export default api;