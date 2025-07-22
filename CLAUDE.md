# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A comprehensive real-time multiplayer Gin Rummy web game built with Node.js, TypeScript, React, and PostgreSQL. Supports both PvP and PvE gameplay with persistent user accounts, ELO ratings, and game history.

## Repository Structure

```
ginrummy/
├── apps/
│   ├── api/           # Express + Socket.io backend
│   └── web/           # React + Vite frontend
├── packages/
│   └── common/        # Shared types, utilities, and game engine
└── postman/           # API documentation
```

## Development Commands

### Setup
```bash
pnpm install                    # Install all dependencies
cp .env.example .env           # Set up environment variables
docker-compose up postgres     # Start PostgreSQL
pnpm db:migrate                # Run database migrations
pnpm db:seed                   # Seed demo data
```

### Development
```bash
pnpm dev                       # Start both API and web servers
pnpm dev:api                   # Start API server only
pnpm dev:web                   # Start web server only
```

### Database
```bash
pnpm db:generate              # Generate Prisma client
pnpm db:migrate               # Run migrations
pnpm db:seed                  # Seed demo data
pnpm db:studio                # Open Prisma Studio
```

### Testing & Quality
```bash
pnpm test                     # Run all tests
pnpm test:game-engine         # Test game logic only
pnpm lint                     # Lint all packages
pnpm type-check               # TypeScript type checking
```

### Docker
```bash
docker-compose up             # Start all services
docker-compose up -d          # Start in background
docker-compose down           # Stop all services
```

## Architecture

### Tech Stack
- **Backend:** Node.js 18, TypeScript, Express, Socket.io, Prisma, PostgreSQL
- **Frontend:** React 18, Vite, TypeScript, TailwindCSS, Zustand
- **Shared:** PNPM workspaces for monorepo structure

### Key Components
- **Game Engine** (`packages/common/src/game-engine/`): Server-authoritative Gin Rummy logic
- **Socket Handlers** (`apps/api/src/socket/`): Real-time game communication
- **Auth System** (`apps/api/src/routes/auth.ts`): JWT-based authentication
- **Game Store** (`apps/web/src/store/game.ts`): Client-side game state management

### Database Schema
- `users` - User accounts with ELO ratings
- `games` - Game metadata and results
- `game_events` - Turn-by-turn action log for replays
- `elo_history` - ELO rating changes over time

## Security Considerations
- Server-authoritative game state (opponent cards never sent to client)
- JWT access tokens (15min) + refresh tokens (7 days)
- Input validation with Zod schemas
- Rate limiting and CORS protection

## Demo Accounts
After running `pnpm db:seed`:
- Username: `demo1`, Password: `password123`
- Username: `demo2`, Password: `password123`

## Common Development Tasks

### Adding New API Endpoints
1. Add route handler in `apps/api/src/routes/`
2. Update Zod validation schemas
3. Add to Postman collection
4. Update frontend API service

### Modifying Game Rules
1. Update game engine in `packages/common/src/game-engine/`
2. Add/update tests in `packages/common/tests/`
3. Update frontend game components if needed

### Database Changes
1. Modify `apps/api/prisma/schema.prisma`
2. Run `pnpm db:migrate` to create migration
3. Update seed script if needed
4. Regenerate Prisma client with `pnpm db:generate`