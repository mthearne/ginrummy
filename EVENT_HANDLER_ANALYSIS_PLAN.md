# Event Handler Analysis Plan

## Overview
This document provides a systematic plan to analyze all event handlers in the EventSourcingEngine to understand their current implementation, identify issues, and plan improvements.

## Analysis Scope

### Current Handler Implementation Status
- **18 Implemented Handlers** - Need detailed analysis
- **12 Missing Handlers** - Need implementation planning  
- **1 Critical Gap** - ROUND_ENDED handler missing despite full event definition

## Missing Event Handlers (Complete List)

### ❌ **CRITICAL MISSING**: Core Game Flow
1. **ROUND_ENDED** 
   - **Status**: Event type defined, full data interface exists, **NO HANDLER**
   - **Impact**: CRITICAL - Round completion logic scattered across other handlers
   - **Event Data**: `RoundEndedEventData` interface complete
   - **Priority**: HIGH - Central to round end flow

### ❌ **Turn Actions Missing** 
2. **LAY_OFF**
   - **Status**: Event type defined, **NO HANDLER**
   - **Impact**: LOW - System uses bulk `LAYOFF_COMPLETED` instead
   - **Current Workaround**: Individual layoffs processed as batch via `LAYOFF_COMPLETED`
   - **Priority**: LOW - Working alternative exists

### ❌ **Round Management Missing**
3. **LAYOFF_PHASE_STARTED**
   - **Status**: Event type defined, **NO HANDLER** 
   - **Impact**: MEDIUM - Layoff phase transitions happen in other handlers
   - **Event Data**: `LayoffPhaseStartedEventData` interface exists
   - **Priority**: MEDIUM - Affects round flow clarity

### ❌ **Game Lifecycle Missing**
4. **PLAYER_LEFT**
   - **Status**: Event type defined, **NO HANDLER**
   - **Impact**: MEDIUM - Player disconnections/quits not event-sourced
   - **Event Data**: `PlayerLeftEventData` interface exists
   - **Priority**: MEDIUM - Important for PvP games

### ❌ **Game Ending Missing**
5. **GAME_CANCELLED**
   - **Status**: Event type defined, **NO HANDLER**
   - **Impact**: LOW - Game cancellations handled outside event system
   - **Event Data**: `GameCancelledEventData` interface exists  
   - **Priority**: LOW - Edge case handling

### ❌ **AI Events Missing** (2 handlers)
6. **AI_THINKING_STARTED**
   - **Status**: Event type defined, **NO HANDLER**
   - **Impact**: LOW - AI thinking states handled in frontend
   - **Event Data**: `AIThinkingStartedEventData` interface exists
   - **Priority**: LOW - UI enhancement only

7. **AI_MOVE_COMPLETED**
   - **Status**: Event type defined, **NO HANDLER** 
   - **Impact**: LOW - AI moves create regular move events instead
   - **Event Data**: `AIMoveCompletedEventData` interface exists
   - **Priority**: LOW - Wrapped by regular events

### ❌ **System Events Missing** (2 handlers)
8. **STATE_SNAPSHOT_CREATED**
   - **Status**: Event type defined, **NO HANDLER**
   - **Impact**: LOW - Snapshots not currently used
   - **Event Data**: `StateSnapshotCreatedEventData` interface exists
   - **Priority**: LOW - Performance optimization feature

9. **ERROR_RECOVERED**
   - **Status**: Event type defined, **NO HANDLER**
   - **Impact**: LOW - Error recovery handled by existing validation
   - **Event Data**: `ErrorRecoveredEventData` interface exists
   - **Priority**: LOW - System resilience feature

### **Handler Gap Analysis**
- **Total Event Types Defined**: 30 events
- **Handlers Implemented**: 18 events (60%)
- **Handlers Missing**: 12 events (40%)
- **Critical Missing**: 1 event (ROUND_ENDED)
- **Working Without**: 11 events (alternative mechanisms exist)

## Analysis Framework

### For Each Implemented Handler, Analyze:

#### 1. **Functional Correctness**
- Does the handler correctly apply the event to game state?
- Are all required state transitions handled?
- Does it maintain game state consistency?
- Are edge cases properly handled?

#### 2. **State Management**
- What specific game state properties are modified?
- Are player states updated correctly?
- Is game phase management consistent?
- Are computed properties (deadwood, melds) recalculated when needed?

#### 3. **Business Logic Compliance**
- Does the handler follow Gin Rummy rules correctly?
- Are scoring calculations accurate?
- Are game flow transitions logical?
- Does it handle both PvP and PvE scenarios?

#### 4. **Error Handling**
- What validation is performed on event data?
- How are missing or invalid players handled?
- Are malformed events handled gracefully?
- Is there proper logging for debugging?

#### 5. **Performance & Efficiency**
- Are expensive operations (meld calculation) optimized?
- Is unnecessary work avoided?
- Are state updates minimal and targeted?

#### 6. **Integration Issues**
- How does it interact with other handlers?
- Are dependencies between events handled correctly?
- Does it prepare state properly for subsequent events?

## Detailed Analysis Plan by Handler Category

### Category 1: Game Lifecycle Handlers (4 handlers)

#### 1.1 GAME_CREATED Handler Analysis
**Purpose**: Initialize game state from game creation event
**Key Areas to Examine**:
- Player state initialization (especially PvP vs AI handling)
- Game settings application (isPrivate, vsAI, maxPlayers)
- Placeholder player handling for PvP games
- Username handling and player identification

**Specific Questions**:
- How are waiting-for-player placeholders handled?
- Is AI player creation consistent?
- Are player IDs properly validated?

#### 1.2 GAME_STARTED Handler Analysis  
**Purpose**: Apply initial card deal and start gameplay
**Key Areas to Examine**:
- Card distribution to players
- Stock pile and discard pile initialization
- Starting player assignment
- Phase transition to UpcardDecision
- Meld/deadwood calculation trigger

**Specific Questions**:
- Is card dealing deterministic and consistent?
- Are all 52 cards properly distributed?
- Is starting player selection fair?

#### 1.3 PLAYER_JOINED Handler Analysis
**Purpose**: Handle player joining PvP games
**Key Areas to Examine**:
- Placeholder replacement logic
- Game state preservation during join
- Username and ID assignment
- Ready state management

**Specific Questions**:
- What happens if multiple players try to join simultaneously?
- How are existing game states preserved?
- Is there protection against duplicate joins?

#### 1.4 PLAYER_READY Handler Analysis
**Purpose**: Track player readiness for game start
**Key Areas to Examine**:
- Ready state tracking per player
- Game start condition checking
- Integration with GAME_STARTED event
- PvP vs AI readiness handling

**Specific Questions**:
- Does this trigger automatic game start?
- How are AI players handled for readiness?
- What if a player disconnects while ready?

### Category 2: Turn Action Handlers (7 handlers)

#### 2.1 TAKE_UPCARD Handler Analysis
**Purpose**: Player takes top card from discard pile
**Key Areas to Examine**:
- Hand size management (should go to 11, then discard to 10)
- Discard pile state updates
- Phase transition to Discard
- Meld recalculation after card addition
- Last drawn card tracking

#### 2.2 PASS_UPCARD Handler Analysis  
**Purpose**: Player passes on upcard (first turn only)
**Key Areas to Examine**:
- Turn rotation logic
- Phase transition after both players pass
- Starting player assignment for draw phase
- Game flow control

#### 2.3 DRAW_FROM_STOCK Handler Analysis
**Purpose**: Player draws from stock pile  
**Key Areas to Examine**:
- Stock pile depletion tracking
- Hand size management
- Card distribution integrity
- Phase transition logic

#### 2.4 DRAW_FROM_DISCARD Handler Analysis
**Purpose**: Player draws from discard pile
**Key Areas to Examine**:
- Discard pile state management
- Hand size management
- Meld recalculation
- Phase transition consistency

#### 2.5 DISCARD_CARD Handler Analysis
**Purpose**: Player discards a card to end turn
**Key Areas to Examine**:
- Hand size validation (should return to 10)
- Turn rotation to next player
- Discard pile updates
- Phase transition to opponent's Draw phase
- Meld recalculation after discard

#### 2.6 KNOCK Handler Analysis ⚠️ **CRITICAL**
**Purpose**: Player knocks to end round
**Key Areas to Examine**:
- Deadwood validation (≤ 10 points)
- Meld validation and storage
- Opponent hand exposure
- Score calculation and storage
- Game end detection (≥ 100 points)
- Phase transition (Layoff vs GameOver)
- Layoff preparation

**Known Issues to Investigate**:
- Does it properly handle score calculation?
- Is game end detection accurate?
- Are layoffs properly set up?
- Is opponent hand handling secure?

#### 2.7 GIN Handler Analysis ⚠️ **CRITICAL** 
**Purpose**: Player goes gin (no deadwood)
**Key Areas to Examine**:
- Zero deadwood validation
- All cards in melds validation
- Score calculation (gin bonus)
- Game end detection
- Phase transition (should skip layoffs)
- Opponent hand exposure

### Category 3: Round Management Handlers (5 handlers)

#### 3.1 START_NEW_ROUND Handler Analysis
**Purpose**: Begin a new round after previous round completion
**Key Areas to Examine**:
- Player state reset (hands, melds, flags)
- New card dealing
- Turn order management
- Round number tracking
- Backward compatibility with old events

#### 3.2 AI_LAYOFF_DECISION Handler Analysis
**Purpose**: Apply AI's layoff decisions after knock
**Key Areas to Examine**:
- Layoff validation and application
- Score adjustment calculation
- Game end detection after layoffs
- Phase transition logic
- AI decision logging

#### 3.3 LAYOFF_COMPLETED Handler Analysis ⚠️ **CRITICAL**
**Purpose**: Finalize layoff phase and apply final scores
**Key Areas to Examine**:
- Final score calculation and application
- Player total score updates  
- Round score storage for display
- Game end detection
- Phase transition (RoundOver vs GameOver)

**Known Issues to Investigate**:
- Is score application consistent with KNOCK handler?
- Are final scores calculated correctly?
- Is game end detection synchronized?

#### 3.4 PLAYER_READY_NEXT_ROUND Handler Analysis
**Purpose**: Track player readiness for next round
**Key Areas to Examine**:
- Ready state management
- Integration with round starting logic
- Player state validation
- Logging and debugging

#### 3.5 ROUND_STARTED Handler Analysis  
**Purpose**: Actually start a new round (different from START_NEW_ROUND)
**Key Areas to Examine**:
- Relationship to START_NEW_ROUND event
- Player state reset
- Card dealing logic
- Phase and turn management

### Category 4: Game Ending Handlers (1 handler)

#### 4.1 GAME_FINISHED Handler Analysis
**Purpose**: Apply final game completion state
**Key Areas to Examine**:
- Winner determination
- Final status and phase setting
- Game over flag management
- Integration with game end triggers from other handlers

## Critical Issues to Investigate

### Issue 1: Score Calculation Inconsistencies
**Problem**: KNOCK/GIN handlers do score calculations, but LAYOFF_COMPLETED also does score calculations
**Investigation Areas**:
- Are scores being double-counted?
- Which handler is authoritative for final scores?
- How are initial vs final scores managed?

### Issue 2: Game End Detection Duplication
**Problem**: Multiple handlers (KNOCK, GIN, AI_LAYOFF_DECISION, LAYOFF_COMPLETED) all check for game end
**Investigation Areas**:
- Is game end detection consistent across handlers?
- Can race conditions occur?
- Which handler should be authoritative?

### Issue 3: Phase Transition Logic
**Problem**: Complex phase transitions happen in multiple handlers
**Investigation Areas**:
- Are phase transitions consistent?
- Can invalid phase states occur?
- Is the phase flow documented and validated?

### Issue 4: Missing ROUND_ENDED Handler Impact
**Problem**: ROUND_ENDED events are defined but not processed
**Investigation Areas**:
- What happens when ROUND_ENDED events are created?
- Is round completion logic scattered across other handlers?
- How does this affect event replay consistency?

## Analysis Tools and Methods

### Code Analysis Tools
- Static analysis of each handler method
- Event flow tracing through handler sequences
- State transition validation
- Integration testing scenarios

### Test Scenarios for Each Handler
- Happy path event processing
- Edge case handling (invalid data, missing players)
- State consistency before/after event application
- Integration with other handlers

### Documentation Requirements
For each handler analysis, create:
- Handler specification document
- State transition diagram
- Test case coverage matrix  
- Issue identification and remediation plan

## Success Criteria

### Analysis Completion Criteria
- ✅ All 18 implemented handlers analyzed
- ✅ All critical issues identified and documented
- ✅ Handler interaction dependencies mapped
- ✅ Test coverage gaps identified
- ✅ Performance bottlenecks identified

### Quality Standards
- Each handler analysis includes concrete examples
- All identified issues have severity ratings
- Remediation plans are actionable and prioritized
- Documentation is complete and maintainable

## Implementation Priority

### Phase 1: Critical Handler Analysis (High Priority)
Focus on handlers with known issues or complex logic:
1. KNOCK Handler - Score calculation and game end logic
2. LAYOFF_COMPLETED Handler - Final score application  
3. GIN Handler - Game end and score bonus logic
4. GAME_STARTED Handler - Card dealing and initialization

### Phase 2: Integration Analysis (Medium Priority)
Focus on handler interaction and flow:
5. Round management handlers interaction
6. Turn action sequence validation
7. Player state lifecycle management

### Phase 3: Optimization Analysis (Low Priority)  
Focus on performance and edge cases:
8. Remaining turn action handlers
9. System and lifecycle handlers
10. Error handling and recovery patterns

## Deliverables

1. **Individual Handler Analysis Reports** (18 documents)
2. **Handler Interaction Map** (visual diagram)
3. **Critical Issues Summary** (prioritized list)
4. **Test Coverage Analysis** (gap identification)
5. **Remediation Roadmap** (implementation plan)

## Timeline Estimate

- **Phase 1**: 2-3 days (critical handlers)  
- **Phase 2**: 1-2 days (integration analysis)
- **Phase 3**: 1-2 days (optimization analysis)
- **Documentation**: 1 day (consolidation and review)

**Total Estimated Time**: 5-8 days for comprehensive analysis

---

## Quick Reference: Missing Handlers

### HIGH PRIORITY (Fix Immediately)
- ❌ **ROUND_ENDED** - Critical gap in round completion flow

### MEDIUM PRIORITY (Consider Implementation)  
- ❌ **LAYOFF_PHASE_STARTED** - Round flow clarity
- ❌ **PLAYER_LEFT** - PvP game lifecycle management

### LOW PRIORITY (Working Alternatives Exist)
- ❌ **LAY_OFF** (has LAYOFF_COMPLETED)
- ❌ **GAME_CANCELLED** (handled outside events)
- ❌ **AI_THINKING_STARTED** (frontend handled)
- ❌ **AI_MOVE_COMPLETED** (regular events used)
- ❌ **STATE_SNAPSHOT_CREATED** (not used)
- ❌ **ERROR_RECOVERED** (validation handles)

### HANDLERS WITH IMPLEMENTATIONS ✅ (18 total)
**Game Lifecycle**: GAME_CREATED, GAME_STARTED, PLAYER_JOINED, PLAYER_READY  
**Turn Actions**: TAKE_UPCARD, PASS_UPCARD, DRAW_FROM_STOCK, DRAW_FROM_DISCARD, DISCARD_CARD, KNOCK, GIN  
**Round Management**: START_NEW_ROUND, AI_LAYOFF_DECISION, LAYOFF_COMPLETED, PLAYER_READY_NEXT_ROUND, ROUND_STARTED  
**Game Ending**: GAME_FINISHED

---

*This analysis plan will provide the foundation for understanding the current event system implementation and planning systematic improvements to achieve a robust, consistent event-sourced game engine.*