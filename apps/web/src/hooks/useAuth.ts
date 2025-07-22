import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { authAPI } from '../services/api';
import { socketService } from '../services/socket';

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  username: string;
  password: string;
}

export const useAuth = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const { setUser, setTokens, logout: storeLogout } = useAuthStore();

  const login = async (data: LoginData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authAPI.login(data.email, data.password);
      const { user, accessToken, refreshToken } = response.data;

      setUser(user);
      setTokens(accessToken, refreshToken);
      
      // Connect to socket
      socketService.connect(accessToken);
      
      navigate('/lobby');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authAPI.register(data.email, data.username, data.password);
      const { user, accessToken, refreshToken } = response.data;

      setUser(user);
      setTokens(accessToken, refreshToken);
      
      // Connect to socket
      socketService.connect(accessToken);
      
      navigate('/lobby');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);

    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await authAPI.logout(refreshToken);
      }
    } catch (err) {
      console.error('Logout error:', err);
    }

    // Disconnect socket
    socketService.disconnect();
    
    // Clear store
    storeLogout();
    
    navigate('/');
    setLoading(false);
  };

  const clearError = () => setError(null);

  return {
    loading,
    error,
    login,
    register,
    logout,
    clearError,
  };
};