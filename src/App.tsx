import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { useSocket } from './hooks/useSocket';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Profile from './pages/Profile';

function App() {
  const { user } = useAuthStore();
  
  // Initialize socket connection when authenticated
  useSocket();

  // Auth initialization is now handled by AuthProvider

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