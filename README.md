# Gin Rummy - Real-time Multiplayer Web Game

A comprehensive real-time multiplayer Gin Rummy implementation supporting PvP, PvE, and persistent user profiles.

## Features

- **Real-time multiplayer** with Socket.io
- **PvP** - Two human players matched through lobby
- **PvE** - Human vs server-side AI opponent
- **Persistent accounts** with game history and ELO ratings
- **Mobile-responsive** design
- **Comprehensive test coverage**

## Tech Stack

- **Backend:** Node 18 + TypeScript, Express, Socket.io
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT (access + refresh) + bcrypt
- **Frontend:** React 18 + Vite + TypeScript + TailwindCSS
- **State:** Zustand
- **Routing:** React Router DOM
- **Monorepo:** PNPM workspaces

## Quick Start

### Prerequisites
- Node.js 18+
- PNPM
- Docker & Docker Compose

### Installation & Setup

```bash
# Clone and install dependencies
git clone <repo-url>
cd ginrummy
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start all services
docker-compose up
```

The application will be available at:
- **Web App:** http://localhost:3000
- **API:** http://localhost:3001
- **PostgreSQL:** localhost:5432

### Development

```bash
# Start development servers separately
pnpm dev:api    # API server with hot reload
pnpm dev:web    # Vite dev server
pnpm dev        # Both simultaneously

# Run tests
pnpm test              # All tests
pnpm test:game-engine  # Game logic tests only
pnpm test:e2e          # Playwright tests

# Database operations
pnpm db:generate  # Generate Prisma client
pnpm db:migrate   # Run migrations
pnpm db:seed      # Seed demo data
pnpm db:studio    # Open Prisma Studio

# Linting & formatting
pnpm lint
pnpm format
pnpm type-check
```

## Game Rules

Full Gin Rummy implementation with:
- 10 cards per player
- Draw from stock or discard pile
- Meld runs and sets
- Knock at ≤10 deadwood
- Gin bonus scoring
- Undercut protection

## API Documentation

REST endpoints and Socket.io events are documented in the Postman collection at `/postman/gin-rummy-api.json`.

### Key Endpoints

- `POST /auth/register` - Create account
- `POST /auth/login` - Authenticate
- `GET /games` - List open games
- `POST /games` - Create new game
- `GET /profile/:username` - User profile & history

### Socket Events

- `join_game` - Join game room
- `play_move` - Make game move
- `game_state` - Receive game updates
- `chat_message` - In-game chat

## Architecture

### Monorepo Structure
- `/packages/common` - Shared types, utilities, and game engine
- `/apps/api` - Express server with Socket.io
- `/apps/web` - React frontend

### Security
- Server-authoritative game state
- JWT authentication with refresh tokens
- Opponent cards never transmitted to client
- Input validation and sanitization

### Database Schema
- `users` - Account information and ELO
- `games` - Game metadata and results
- `game_events` - Turn-by-turn action log for replays

## Demo Users

After running `pnpm db:seed`:
- **Username:** demo1, **Password:** password123
- **Username:** demo2, **Password:** password123

## Contributing

1. Follow existing code style and conventions
2. Write tests for new features
3. Run `pnpm lint` and `pnpm type-check` before committing
4. Ensure all tests pass

## License

MIT