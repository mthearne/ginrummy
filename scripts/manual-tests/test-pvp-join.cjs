#!/usr/bin/env node

/**
 * Test Script: PvP Game Join
 * Tests the complete PvP game join flow
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = 'http://localhost:3001/api';

// Test user credentials
const player1 = { email: 'demo1@example.com', password: 'password123' };
const player2 = { email: 'demo2@example.com', password: 'Password123' };

let player1Token = null;
let player2Token = null;
let gameId = null;
let streamVersion = 0;

async function loginPlayer(playerCreds) {
  console.log(`🔐 Logging in ${playerCreds.email}...`);
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, playerCreds);
    console.log(`✅ Login successful for ${playerCreds.email}`);
    return response.data.accessToken;
  } catch (error) {
    console.error(`❌ Login failed for ${playerCreds.email}:`, error.response?.data || error.message);
    return null;
  }
}

async function createPvPGame() {
  console.log('🎮 Creating PvP game (Player 1)...');
  try {
    const response = await axios.post(`${API_BASE}/games`, {
      vsAI: false,
      isPrivate: false,
      maxPlayers: 2
    }, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });
    
    gameId = response.data.gameId;
    streamVersion = response.data.streamVersion;
    console.log('✅ PvP Game created:', { gameId, streamVersion });
    return true;
  } catch (error) {
    console.error('❌ Game creation failed:', error.response?.data || error.message);
    return false;
  }
}

async function joinGame() {
  console.log('🤝 Player 2 joining game...');
  try {
    const response = await axios.post(`${API_BASE}/games/${gameId}/join`, {
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });
    
    console.log('✅ Player 2 joined successfully:', {
      streamVersion: response.data.streamVersion,
      phase: response.data.gameState?.phase,
      players: response.data.gameState?.players?.length || 'unknown',
      status: response.data.gameState?.status
    });
    console.log('📋 Full response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Game join failed:', error.response?.data || error.message);
    return false;
  }
}

async function loadGameState(token, playerId) {
  console.log(`📊 Loading game state for player ${playerId}...`);
  try {
    const response = await axios.get(`${API_BASE}/games/${gameId}/state`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Game state loaded:', {
      gameId: response.data.gameId,
      streamVersion: response.data.streamVersion,
      phase: response.data.state.phase,
      status: response.data.state.status,
      players: response.data.state.players.length,
      currentPlayer: response.data.state.currentPlayerId
    });
    return true;
  } catch (error) {
    console.error('❌ State loading failed:', error.response?.data || error.message);
    return false;
  }
}

async function runPvPJoinTest() {
  console.log('🚀 Starting PvP Join Test...\n');
  
  const results = [];
  
  // Login both players
  player1Token = await loginPlayer(player1);
  results.push(!!player1Token);
  if (!player1Token) return;
  
  player2Token = await loginPlayer(player2);
  results.push(!!player2Token);
  if (!player2Token) return;
  
  // Create PvP game
  results.push(await createPvPGame());
  if (!results[2]) return;
  
  // Join game
  results.push(await joinGame());
  
  // Load final state for both players
  results.push(await loadGameState(player1Token, 'Player 1'));
  results.push(await loadGameState(player2Token, 'Player 2'));
  
  console.log('\n🏁 Test Results:');
  console.log('✅ Player 1 Login:', results[0] ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Login:', results[1] ? 'PASS' : 'FAIL');
  console.log('✅ PvP Game Creation:', results[2] ? 'PASS' : 'FAIL');
  console.log('✅ Player Join:', results[3] ? 'PASS' : 'FAIL');
  console.log('✅ Player 1 State Load:', results[4] ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 State Load:', results[5] ? 'PASS' : 'FAIL');
  
  const passCount = results.filter(r => r).length;
  console.log(`\n📊 Overall: ${passCount}/${results.length} tests passed`);
  
  if (passCount === results.length) {
    console.log('🎉 PvP Join functionality working correctly!');
  } else {
    console.log('⚠️ Some tests failed - investigation needed');
  }
}

runPvPJoinTest().catch(console.error);