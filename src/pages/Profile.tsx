import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { usersAPI } from '../services/api';
import { UserProfile } from '@gin-rummy/common';
import { formatRelativeTime, getEloColor, getEloRank } from '../utils/helpers';
import { useAuthStore } from '../store/auth';

interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number;
  currentElo: number;
  peakElo: number;
  currentRank: number;
  eloHistory: { elo: number; change: number; date: string }[];
  gameTypes: {
    gin: { wins: number; losses: number };
    knock: { wins: number; losses: number };
    undercut: { wins: number; losses: number };
  };
  averageScore: number;
  averageOpponentScore: number;
  averageDuration: number;
  recentPerformance: {
    games: number;
    wins: number;
    winRate: number;
  };
}

export default function Profile() {
  const params = useParams<{ username: string }>();
  const username = params?.username;
  const { user: currentUser } = useAuthStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    if (username) {
      loadProfile(username);
    }
  }, [username]);

  const loadProfile = async (username: string) => {
    setLoading(true);
    setError(null);
    try {
      // Load profile with history
      const profileResponse = await usersAPI.getProfile(username, { includeHistory: true, historyLimit: 20 });
      setProfile(profileResponse.data);
      
      // Load detailed stats if it's the current user's profile
      const isOwn = currentUser?.username === username;
      if (isOwn) {
        try {
          const statsResponse = await usersAPI.getStats();
          setStats(statsResponse.data);
        } catch (statsErr) {
          console.warn('Failed to load detailed stats:', statsErr);
          // Continue without detailed stats
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="loading mx-auto mb-4" style={{ width: '32px', height: '32px' }} />
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.996-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-gray-600">{error || 'Profile not found'}</p>
        </div>
      </div>
    );
  }

  // Chart colors
  const chartColors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  
  // Game type data for charts
  const gameTypeData = stats ? [
    { name: 'Gin', wins: stats.gameTypes.gin.wins, losses: stats.gameTypes.gin.losses, total: stats.gameTypes.gin.wins + stats.gameTypes.gin.losses },
    { name: 'Knock', wins: stats.gameTypes.knock.wins, losses: stats.gameTypes.knock.losses, total: stats.gameTypes.knock.wins + stats.gameTypes.knock.losses },
    { name: 'Undercut', wins: stats.gameTypes.undercut.wins, losses: stats.gameTypes.undercut.losses, total: stats.gameTypes.undercut.wins + stats.gameTypes.undercut.losses }
  ].filter(item => item.total > 0) : [];

  const winLossData = profile ? [
    { name: 'Wins', value: profile.gamesWon, color: '#10b981' },
    { name: 'Losses', value: profile.gamesPlayed - profile.gamesWon, color: '#ef4444' }
  ] : [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Profile Header */}
      <div className="card mb-8">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="w-24 h-24 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-4xl font-bold text-primary-700">
                  {profile.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <h1 className="text-4xl font-bold text-gray-900">{profile.username}</h1>
                  {isOwnProfile && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                      You
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-6 mt-3">
                  <div className={`text-2xl font-bold ${getEloColor(profile.elo)}`}>
                    {profile.elo} ELO
                  </div>
                  <div className="text-lg text-gray-600 font-medium">
                    {getEloRank(profile.elo)}
                  </div>
                  {stats && (
                    <div className="text-gray-600">
                      Rank #{stats.currentRank}
                    </div>
                  )}
                  <div className="text-gray-500">
                    Joined {new Date(profile.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="card-body text-center">
            <div className="text-3xl font-bold text-gray-900">{profile.gamesPlayed}</div>
            <div className="text-sm text-gray-600 font-medium">Games Played</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <div className="text-3xl font-bold text-green-600">{profile.gamesWon}</div>
            <div className="text-sm text-gray-600 font-medium">Games Won</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <div className="text-3xl font-bold text-blue-600">{profile.winRate.toFixed(1)}%</div>
            <div className="text-sm text-gray-600 font-medium">Win Rate</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <div className={`text-3xl font-bold ${getEloColor(profile.elo)}`}>
              {stats?.peakElo || profile.elo}
            </div>
            <div className="text-sm text-gray-600 font-medium">
              {stats ? 'Peak ELO' : 'Current ELO'}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics (Enhanced Stats for Own Profile) */}
      {stats && isOwnProfile && (
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Win/Loss Breakdown */}
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                Win/Loss Breakdown
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Games</span>
                  <span className="font-semibold">{stats.gamesPlayed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-green-600">Wins</span>
                  <span className="font-semibold text-green-600">{stats.gamesWon}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-red-600">Losses</span>
                  <span className="font-semibold text-red-600">{stats.gamesLost}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Recent Form (Last 10)</span>
                    <span className={`font-semibold ${stats.recentPerformance.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                      {stats.recentPerformance.wins}/{stats.recentPerformance.games} ({stats.recentPerformance.winRate.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Game Types */}
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                Game Types
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Gin</span>
                  <span className="font-semibold">
                    {stats.gameTypes.gin.wins}W / {stats.gameTypes.gin.losses}L
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Knock</span>
                  <span className="font-semibold">
                    {stats.gameTypes.knock.wins}W / {stats.gameTypes.knock.losses}L
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Undercut</span>
                  <span className="font-semibold">
                    {stats.gameTypes.undercut.wins}W / {stats.gameTypes.undercut.losses}L
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                Performance
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Avg Score</span>
                  <span className="font-semibold">{stats.averageScore}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Avg Opponent</span>
                  <span className="font-semibold">{stats.averageOpponentScore}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Avg Duration</span>
                  <span className="font-semibold">
                    {Math.floor(stats.averageDuration / 60)}m {stats.averageDuration % 60}s
                  </span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Current Rank</span>
                    <span className="font-semibold">#{stats.currentRank}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        {/* ELO History Chart */}
        <div className="card">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
              ELO History
            </h2>
            {profile.eloHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={profile.eloHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString()}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    formatter={(value) => [value, 'ELO']}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="elo" 
                    stroke="#0ea5e9" 
                    strokeWidth={3}
                    dot={{ fill: '#0ea5e9', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#0ea5e9' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📈</div>
                <p>No ELO history available</p>
                <p className="text-sm">Play some games to see your progression!</p>
              </div>
            )}
          </div>
        </div>

        {/* Win/Loss Pie Chart or Game Type Breakdown */}
        <div className="card">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              {profile.gamesPlayed > 0 ? 'Win/Loss Distribution' : 'Performance Overview'}
            </h2>
            {profile.gamesPlayed > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={winLossData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {winLossData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name) => [value, name]}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🎯</div>
                <p>No games played yet</p>
                <p className="text-sm">Start playing to see your performance!</p>
              </div>
            )}
            {profile.gamesPlayed > 0 && (
              <div className="flex justify-center space-x-6 mt-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm">Wins ({profile.gamesWon})</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                  <span className="text-sm">Losses ({profile.gamesPlayed - profile.gamesWon})</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Games */}
      <div className="card">
        <div className="card-body">
          <h2 className="text-xl font-semibold mb-6 flex items-center">
            <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
            Recent Games
            {profile.recentGames.length > 0 && (
              <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                {profile.recentGames.length}
              </span>
            )}
          </h2>
          {profile.recentGames.length > 0 ? (
            <div className="space-y-4">
              {profile.recentGames.map((game, index) => (
                <div key={game.id} className={`p-4 rounded-lg border-l-4 ${
                  game.result === 'win' 
                    ? 'bg-green-50 border-green-400' 
                    : 'bg-red-50 border-red-400'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                        game.result === 'win' ? 'bg-green-500' : 'bg-red-500'
                      }`}>
                        {game.result === 'win' ? 'W' : 'L'}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">vs {game.opponent}</div>
                        <div className="text-sm text-gray-600">
                          Score: {game.score} - {game.opponentScore} • 
                          <span className="capitalize ml-1">{game.knockType}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-lg ${
                        game.result === 'win' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {game.result === 'win' ? 'WIN' : 'LOSS'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatRelativeTime(game.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="text-6xl mb-4">🎮</div>
              <h3 className="text-lg font-medium mb-2">No games played yet</h3>
              <p className="text-sm">Start playing to build your game history!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}