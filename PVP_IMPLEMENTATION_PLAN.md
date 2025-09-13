# PvP Implementation Plan for Gin Rummy

## Overview
Evolving the existing AI-focused system to support Player vs Player games using event sourcing with optimistic concurrency control.

## Phase 1: Core Multiplayer Infrastructure ⚡ **START HERE**

### 1.1 Database Schema Extensions
**Extend existing GameEvent table:**
```sql
-- Add to existing GameEvent model in schema.prisma
sequence   Int      @map("sequence_number")  // Stream version (1..N), strictly increasing per game  
requestId  String?  @map("request_id")       // UUID v4 for idempotency (optional for legacy events)

-- Add constraints:
@@unique([gameId, sequence])     // Ensure no gaps in sequence
@@unique([gameId, requestId])    // Prevent duplicate requests  
@@index([gameId, sequence])      // Performance for event replay
```

**Create GameParticipant table:**
```sql
model GameParticipant {
  id             String   @id @default(uuid())
  gameId         String   @map("game_id")
  userId         String   @map("user_id") 
  seat           Int      // 0 or 1 for 2-player games
  role           String   @default("PLAYER") // PLAYER, SPECTATOR
  joinedAt       DateTime @default(now()) @map("joined_at")
  
  game           Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([gameId, userId])  // One participation per user per game
  @@unique([gameId, seat])    // One player per seat
  @@index([userId])
  @@map("game_participants")
}
```

**Modify existing Game model:**
```sql
-- Add to existing Game model:
participants   GameParticipant[]
streamVersion  Int      @default(0) @map("stream_version")  // Cache of latest sequence
isPrivate      Boolean  @default(true) @map("is_private")   // PvP: private vs public
joinCode       String?  @unique @map("join_code")           // For code-based joining

-- Add index:
@@index([status, isPrivate])  // For game discovery
```

### 1.2 Event Store Service
**Create `src/services/eventStore.ts`:**
```typescript
export interface EventAppendResult {
  success: boolean;
  sequence: number;
  error?: { code: string; serverVersion?: number };
}

export interface EventStoreService {
  getCurrentVersion(gameId: string): Promise<number>;
  
  appendEvent(
    gameId: string,
    requestId: string | null,
    expectedVersion: number,
    eventType: string,
    eventData: any,
    userId?: string
  ): Promise<EventAppendResult>;
  
  getEventsSince(gameId: string, fromVersion: number): Promise<GameEvent[]>;
}
```

**Key Features:**
- ✅ Optimistic concurrency control via `expectedVersion`
- ✅ Idempotency via `requestId` 
- ✅ Advisory locks using `SELECT pg_advisory_xact_lock()`
- ✅ Atomic sequence number generation
- ✅ Error handling for version conflicts

### 1.3 Extend Existing Event Sourcing Engine
**Modify `packages/common/src/game-engine/event-sourcing.ts`:**
- Keep existing event application logic
- Add support for sequence numbers in event replay
- Add validation for event ordering
- Integrate with new EventStore service

### 1.4 Update API Routes
**Modify `app/api/games/[gameId]/state/route.ts`:**
```typescript
// Add streamVersion to response
{
  success: true,
  state: { /* player-filtered */ },
  streamVersion: number,  // ← NEW
  gameId: string,
  serverClock: string
}
```

**Modify `app/api/games/[gameId]/move/route.ts`:**
```typescript
// Add to request body
{
  requestId: string,        // ← NEW: UUID v4 for idempotency
  expectedVersion: number,  // ← NEW: Client's last seen streamVersion
  type: string,
  playerId: string,
  // ...existing move data
}

// Error responses:
// 409 { code: "STATE_VERSION_MISMATCH", serverVersion: number }
// 400 { code: "OUT_OF_TURN" }
```

### 1.5 Frontend State Management
**Update `src/store/game.ts`:**
```typescript
interface GameStore {
  streamVersion: number;        // ← NEW: Track last seen version
  inFlightRequests: Set<string>; // ← NEW: Prevent double-clicks
  
  // Version gating - reject stale updates
  applyGameState(incoming: { streamVersion: number, gameId: string, state: any }): void;
}
```

**Update `src/services/socket.ts`:**
```typescript
// Add to all move requests
const requestId = crypto.randomUUID();
const expectedVersion = gameStore.streamVersion;

// Handle version conflicts
if (response.error?.code === 'STATE_VERSION_MISMATCH') {
  // Force resync
  await fetchGameState();
}
```

## Phase 2: PvP Game Lifecycle

### 2.1 Game Creation & Joining
- **Create Game API:** `POST /api/games` with visibility options
- **Join Game API:** `POST /api/games/[gameId]/join` with atomic seat claiming
- **Game Discovery:** `GET /api/games/available` for public games

### 2.2 Invitation System (Simplified)
- **Invitation Table:** Basic invite model with expiration
- **Send Invites:** `POST /api/invitations` 
- **Accept/Decline:** `PUT /api/invitations/[id]`

### 2.3 Turn Management & Security
- **Server Authority:** All moves validated server-side
- **Turn Enforcement:** Reject out-of-turn moves
- **Hidden Information:** Filter opponent's cards from responses

### 2.4 Human Layoff Interface
- **Layoff UI:** Interactive card selection for layoffs
- **Time Management:** Optional turn timers
- **Validation:** Server-side layoff move validation

## Phase 3: Advanced Features

### 3.1 Performance Optimizations
- **Snapshot System:** `GameSnapshot` table for periodic state caching
- **Efficient Replay:** Load from latest snapshot + tail events

### 3.2 Enhanced User Experience  
- **Matchmaking:** `MatchmakingQueue` table for public games
- **Presence System:** Track online/offline status
- **Notifications:** Real-time game event notifications

### 3.3 Polish Features
- **Rematch System:** Seamless game continuation
- **Spectator Mode:** Watch games in progress
- **Chat System:** In-game messaging

## Critical Design Decisions

### ✅ Adopted from ChatGPT's Approach:
- Stream versioning with optimistic concurrency
- Idempotency via requestId
- Advisory locks for critical sections
- Server-authoritative state
- Event sourcing as single source of truth

### 🔄 Adapted for Existing Codebase:
- Evolve existing schema instead of replacing
- Extend existing event sourcing engine
- Keep performance optimizations where beneficial
- Gradual migration from AI-focused to PvP-capable

### 🚫 Avoided Complexities:
- Complete cache removal (keep smart caching)
- Serializable isolation everywhere (use advisory locks)
- Heavyweight presence system initially

## Implementation Success Criteria

### Phase 1 Success Metrics:
- ✅ Stream version increments by exactly 1 per accepted move
- ✅ Duplicate requestId never creates duplicate events
- ✅ Out-of-turn moves consistently rejected
- ✅ Page refresh reconstructs correct game state
- ✅ Version conflicts properly handled with 409 responses

### Testing Requirements:
- **Unit Tests:** Event store concurrency, idempotency, replay correctness
- **Integration Tests:** API version conflicts, turn enforcement
- **E2E Tests:** Multi-client game flows, race conditions

## Migration Strategy
1. **Backward Compatibility:** Existing AI games continue working
2. **Gradual Rollout:** Phase 1 → Phase 2 → Phase 3
3. **Feature Flags:** Toggle PvP features during development
4. **Data Migration:** Backfill sequence numbers for existing events

---

**Next Step:** Begin Phase 1.1 - Database Schema Extensions