import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/auth';
import { useSocket } from './hooks/useSocket';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Profile from './pages/Profile';
import { api } from './services/api';

function App() {
  const { user, setUser, setTokens, logout } = useAuthStore();
  
  // Initialize socket connection when authenticated
  useSocket();

  useEffect(() => {
    // Check for stored auth tokens on app start
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (accessToken && refreshToken) {
      // Verify token and get user info
      api.get('/auth/me')
        .then(response => {
          setUser(response.data);
          setTokens(accessToken, refreshToken);
        })
        .catch(() => {
          // Token invalid, clear storage
          logout();
        });
    }
  }, [setUser, setTokens, logout]);

  return (
    <div className="App">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={
          user ? <Navigate to="/lobby" replace /> : <Login />
        } />
        <Route path="/register" element={
          user ? <Navigate to="/lobby" replace /> : <Register />
        } />
        
        {/* Protected routes */}
        <Route path="/" element={<Layout />}>
          <Route index element={
            user ? <Navigate to="/lobby" replace /> : <Home />
          } />
          <Route path="lobby" element={
            user ? <Lobby /> : <Navigate to="/login" replace />
          } />
          <Route path="game/:gameId" element={
            user ? <Game /> : <Navigate to="/login" replace />
          } />
          <Route path="profile/:username" element={<Profile />} />
        </Route>
        
        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;