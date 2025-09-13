# Event-Sourced Database Schema Design

## Current Issues with Existing Schema

The current `GameEvent` table (lines 72-83 in schema.prisma) has these limitations:
1. No sequence numbering for event ordering
2. No processed/unprocessed state tracking  
3. No event versioning for schema evolution
4. Missing current player tracking on Game table
5. Game state stored as mutable JSON blob instead of computed from events

## Enhanced Event-Sourced Schema

### Core Tables

#### Enhanced Game Table
```prisma
model Game {
  id               String      @id @default(uuid())
  status           GameStatus  @default(WAITING)
  gameType         GameType    @default(STANDARD)
  player1Id        String      @map("player1_id")
  player2Id        String?     @map("player2_id")
  currentPlayerId  String?     @map("current_player_id")  // NEW: Always accurate current player
  winnerId         String?     @map("winner_id")
  player1Score     Int         @default(0) @map("player1_score")
  player2Score     Int         @default(0) @map("player2_score")
  
  // Configuration
  isPrivate        Boolean     @default(false) @map("is_private")
  vsAI             Boolean     @default(false) @map("vs_ai")
  maxPlayers       Int         @default(2) @map("max_players")
  
  // Timing
  createdAt        DateTime    @default(now()) @map("created_at")
  updatedAt        DateTime    @updatedAt @map("updated_at")
  finishedAt       DateTime?   @map("finished_at")
  
  // Event sourcing metadata  
  eventCount       Int         @default(0) @map("event_count")        // NEW: Total events processed
  lastEventAt      DateTime?   @map("last_event_at")                  // NEW: When last event occurred
  snapshotSequence Int?        @map("snapshot_sequence")              // NEW: Last snapshot sequence number
  
  // REMOVED: gameState Json field - now computed from events
  
  // Relations
  gameEvents       GameEvent[]
  gameSnapshots    GameSnapshot[]  // NEW: Performance snapshots
  player1          User        @relation("Player1", fields: [player1Id], references: [id])
  player2          User?       @relation("Player2", fields: [player2Id], references: [id])
  currentPlayer    User?       @relation("CurrentPlayer", fields: [currentPlayerId], references: [id])  // NEW
  winner           User?       @relation("Winner", fields: [winnerId], references: [id])
  
  @@map("games")
}
```

#### Enhanced GameEvent Table (Event Store)
```prisma
model GameEvent {
  id             String      @id @default(uuid())
  gameId         String      @map("game_id")
  playerId       String?     @map("player_id")                    // Who performed the action
  
  // Event identification
  eventType      EventType                                        // ENUM: DRAW_STOCK, DRAW_DISCARD, DISCARD, KNOCK, etc.
  sequenceNumber Int         @map("sequence_number")              // NEW: Guaranteed ordering (1, 2, 3...)
  eventVersion   Int         @default(1) @map("event_version")    // NEW: Schema evolution support
  
  // Event payload
  eventData      Json        @map("event_data")                   // Action-specific data
  metadata       Json?                                            // Additional context (IP, timestamp, etc.)
  
  // State tracking  
  processed      Boolean     @default(false)                     // NEW: Has this event been applied?
  processedAt    DateTime?   @map("processed_at")                // NEW: When was it processed?
  
  // Timing
  createdAt      DateTime    @default(now()) @map("created_at")
  
  // Relations
  game           Game        @relation(fields: [gameId], references: [id], onDelete: Cascade)
  player         User?       @relation(fields: [playerId], references: [id])
  
  // Constraints
  @@unique([gameId, sequenceNumber])  // NEW: Guarantee sequential ordering
  @@index([gameId, sequenceNumber])   // NEW: Fast event replay
  @@map("game_events")
}
```

#### NEW: GameSnapshot Table (Performance Optimization)
```prisma
model GameSnapshot {
  id             String      @id @default(uuid())
  gameId         String      @map("game_id")
  sequenceNumber Int         @map("sequence_number")              // Last event included in this snapshot
  
  // Computed state at this point
  gameState      Json        @map("game_state")                   // Full computed state
  stateHash      String      @map("state_hash")                   // Verification hash
  
  // Metadata
  createdAt      DateTime    @default(now()) @map("created_at")
  createdBy      String?     @map("created_by")                   // System/manual
  
  // Relations
  game           Game        @relation(fields: [gameId], references: [id], onDelete: Cascade)
  
  // Constraints
  @@unique([gameId, sequenceNumber])
  @@index([gameId, sequenceNumber])
  @@map("game_snapshots")
}
```

#### Enhanced User Table (Add Current Player Relation)
```prisma
model User {
  // ... existing fields ...
  
  // NEW: Current player relation
  currentPlayerGames Game[]    @relation("CurrentPlayer")
  
  // ... existing relations ...
}
```

### New Enums

```prisma
enum GameType {
  STANDARD
  HOLLYWOOD  
  OKLAHOMA
}

enum EventType {
  // Game lifecycle
  GAME_CREATED
  GAME_STARTED
  PLAYER_JOINED
  PLAYER_LEFT
  
  // Turn actions
  DRAW_FROM_STOCK
  DRAW_FROM_DISCARD  
  DISCARD_CARD
  KNOCK
  GIN
  LAY_OFF
  
  // Game ending
  GAME_FINISHED
  GAME_CANCELLED
  
  // AI actions
  AI_THINKING_STARTED
  AI_MOVE_COMPLETED
  
  // System events
  STATE_SNAPSHOT_CREATED
  ERROR_RECOVERED
}
```

## Event Data Structures

### Example Event Payloads

```typescript
// DRAW_FROM_STOCK event
{
  eventType: "DRAW_FROM_STOCK",
  eventData: {
    cardDrawn: { suit: "hearts", rank: "ace" },
    stockSize: 31
  }
}

// DISCARD_CARD event  
{
  eventType: "DISCARD_CARD",
  eventData: {
    card: { suit: "spades", rank: "king" },
    newDiscardPile: [{ suit: "spades", rank: "king" }]
  }
}

// KNOCK event
{
  eventType: "KNOCK", 
  eventData: {
    knockerHand: [/* cards */],
    deadwood: 7,
    layOffs: []
  }
}
```

## Benefits of This Schema

1. **Guaranteed Consistency**: Sequence numbers prevent event ordering issues
2. **Complete Auditability**: Every action is logged with full context  
3. **Perfect Recovery**: Any game state can be rebuilt from events
4. **Performance**: Snapshots avoid replaying thousands of events
5. **Debugging**: Can replay game to any point to diagnose issues
6. **Anti-Cheat**: Complete move history makes cheating detection trivial
7. **Analytics**: Rich data for game balance and user behavior analysis

## Migration Strategy

1. Add new tables alongside existing ones
2. Dual-write to both old and new systems during transition
3. Migrate existing games by converting current state to initial events
4. Switch reads to new system once validated
5. Remove old gameState JSON field after full migration

This schema eliminates every race condition and state inconsistency we've encountered.