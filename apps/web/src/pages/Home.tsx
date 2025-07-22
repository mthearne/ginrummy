import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          {/* Hero Section */}
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Play Gin Rummy
            <span className="block text-primary-600">Anytime, Anywhere</span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Experience the classic card game in real-time multiplayer mode. Play against friends 
            or challenge our AI opponents. Track your progress and climb the leaderboard!
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              to="/register"
              className="btn btn-primary text-lg px-8 py-3"
            >
              Start Playing
            </Link>
            <Link
              to="/login"
              className="btn btn-secondary text-lg px-8 py-3"
            >
              Sign In
            </Link>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="card">
              <div className="card-body text-center">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Real-time Multiplayer</h3>
                <p className="text-gray-600">
                  Play against other players in real-time with instant updates and seamless gameplay.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-body text-center">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Smart AI Opponents</h3>
                <p className="text-gray-600">
                  Practice against our intelligent AI with different difficulty levels and strategies.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-body text-center">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Rankings & Stats</h3>
                <p className="text-gray-600">
                  Track your progress with ELO ratings, match history, and detailed statistics.
                </p>
              </div>
            </div>
          </div>

          {/* Game Rules */}
          <div className="mt-16 text-left max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8">How to Play</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-4">Basic Rules</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Each player receives 10 cards</li>
                  <li>• Form sets (same rank) or runs (consecutive cards of same suit)</li>
                  <li>• Draw from stock pile or discard pile</li>
                  <li>• Discard one card each turn</li>
                  <li>• Knock when deadwood ≤ 10 points</li>
                  <li>• Gin when all cards are melded</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">Scoring</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Aces = 1 point</li>
                  <li>• Face cards = 10 points</li>
                  <li>• Number cards = face value</li>
                  <li>• Gin bonus = 25 points</li>
                  <li>• Undercut bonus = 25 points</li>
                  <li>• First to 100 points wins</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}