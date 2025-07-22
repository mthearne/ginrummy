import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usersAPI } from '../services/api';
import { UserProfile } from '@gin-rummy/common';
import { formatRelativeTime, getEloColor, getEloRank } from '../utils/helpers';

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (username) {
      loadProfile(username);
    }
  }, [username]);

  const loadProfile = async (username: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await usersAPI.getProfile(username);
      setProfile(response.data);
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Profile Header */}
      <div className="card mb-8">
        <div className="card-body">
          <div className="flex items-center space-x-6">
            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-3xl font-bold text-primary-700">
                {profile.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{profile.username}</h1>
              <div className="flex items-center space-x-4 mt-2">
                <div className={`text-lg font-semibold ${getEloColor(profile.elo)}`}>
                  {profile.elo} ELO
                </div>
                <div className="text-gray-600">
                  {getEloRank(profile.elo)}
                </div>
                <div className="text-gray-600">
                  Joined {new Date(profile.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="card-body text-center">
            <div className="text-2xl font-bold text-gray-900">{profile.gamesPlayed}</div>
            <div className="text-sm text-gray-600">Games Played</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <div className="text-2xl font-bold text-green-600">{profile.gamesWon}</div>
            <div className="text-sm text-gray-600">Games Won</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <div className="text-2xl font-bold text-blue-600">{profile.winRate.toFixed(1)}%</div>
            <div className="text-sm text-gray-600">Win Rate</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <div className={`text-2xl font-bold ${getEloColor(profile.elo)}`}>
              {getEloRank(profile.elo)}
            </div>
            <div className="text-sm text-gray-600">Rank</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* ELO History Chart */}
        <div className="card">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-4">ELO History</h2>
            {profile.eloHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={profile.eloHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    formatter={(value) => [value, 'ELO']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="elo" 
                    stroke="#0ea5e9" 
                    strokeWidth={2}
                    dot={{ fill: '#0ea5e9' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No ELO history available
              </div>
            )}
          </div>
        </div>

        {/* Recent Games */}
        <div className="card">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-4">Recent Games</h2>
            {profile.recentGames.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {profile.recentGames.map((game) => (
                  <div key={game.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        game.result === 'win' ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                      <div>
                        <div className="font-medium">vs {game.opponent}</div>
                        <div className="text-sm text-gray-600">
                          {game.score} - {game.opponentScore} • {game.knockType}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${
                        game.result === 'win' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {game.result === 'win' ? 'WIN' : 'LOSS'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatRelativeTime(game.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No recent games
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}