#!/usr/bin/env node

/**
 * Phase 1 Testing Script
 * Tests the new multiplayer infrastructure with existing AI games
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = 'http://localhost:3001/api';

// Test user credentials (assuming demo users exist)
const testUser = {
  email: 'demo1@example.com',
  password: 'password123'
};

let authToken = null;
let gameId = null;
let streamVersion = 0;

async function login() {
  console.log('🔐 Logging in...');
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, testUser);
    authToken = response.data.accessToken;
    console.log('✅ Login successful');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function createAIGame() {
  console.log('🎮 Creating AI game...');
  try {
    const response = await axios.post(`${API_BASE}/games`, {
      vsAI: true,
      isPrivate: false,
      maxPlayers: 2
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    gameId = response.data.gameId;
    streamVersion = response.data.streamVersion;
    console.log('✅ Game created:', { gameId, streamVersion });
    console.log('📊 Response version:', response.data.version);
    return true;
  } catch (error) {
    console.error('❌ Game creation failed:', error.response?.data || error.message);
    return false;
  }
}

async function loadGameState() {
  console.log('📊 Loading game state...');
  try {
    const response = await axios.get(`${API_BASE}/games/${gameId}/state`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const data = response.data;
    streamVersion = data.streamVersion;
    console.log('✅ Game state loaded:', {
      gameId: data.gameId,
      streamVersion: data.streamVersion,
      phase: data.state.phase,
      players: data.state.players.length,
      currentPlayer: data.state.currentPlayerId
    });
    return true;
  } catch (error) {
    console.error('❌ State loading failed:', error.response?.data || error.message);
    return false;
  }
}

async function makeTestMove() {
  console.log('🎯 Making test move with concurrency control...');
  try {
    const requestId = uuidv4();
    const moveData = {
      type: 'draw_stock',
      gameId: gameId
    };

    console.log('📋 Move data:', { requestId, expectedVersion: streamVersion, moveData });

    const response = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      ...moveData,
      requestId,
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    const data = response.data;
    streamVersion = data.streamVersion;
    console.log('✅ Move successful:', {
      newStreamVersion: data.streamVersion,
      phase: data.gameState.phase,
      currentPlayer: data.gameState.currentPlayerId,
      aiTriggered: data.metadata.aiTriggered,
      version: data.metadata.version
    });
    return true;
  } catch (error) {
    console.error('❌ Move failed:', error.response?.data || error.message);
    return false;
  }
}

async function testDuplicateMove() {
  console.log('🔄 Testing duplicate move detection...');
  try {
    const requestId = uuidv4();
    const moveData = {
      type: 'draw_stock',
      gameId: gameId
    };

    // Make the same move twice with same requestId
    console.log('📋 First move...');
    await axios.post(`${API_BASE}/games/${gameId}/move`, {
      ...moveData,
      requestId,
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('📋 Duplicate move (same requestId)...');
    const duplicateResponse = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      ...moveData,
      requestId, // Same requestId should be caught
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Duplicate handled properly:', duplicateResponse.status);
    return true;
  } catch (error) {
    if (error.response?.data?.code === 'DUPLICATE_REQUEST') {
      console.log('✅ Duplicate request properly detected and handled');
      return true;
    }
    console.error('❌ Duplicate test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testVersionConflict() {
  console.log('⚡ Testing version conflict handling...');
  try {
    const requestId = uuidv4();
    const moveData = {
      type: 'draw_stock',
      gameId: gameId
    };

    // Use wrong expectedVersion to trigger conflict
    const wrongVersion = Math.max(0, streamVersion - 1);
    console.log('📋 Using wrong version:', wrongVersion, 'instead of', streamVersion);

    await axios.post(`${API_BASE}/games/${gameId}/move`, {
      ...moveData,
      requestId,
      expectedVersion: wrongVersion
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('❌ Version conflict not detected - this is bad!');
    return false;
  } catch (error) {
    if (error.response?.data?.code === 'STATE_VERSION_MISMATCH') {
      console.log('✅ Version conflict properly detected:', {
        serverVersion: error.response.data.serverVersion,
        expectedVersion: wrongVersion
      });
      return true;
    }
    console.error('❌ Version conflict test failed:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Phase 1 Testing...\n');
  
  const results = [];
  
  results.push(await login());
  if (!results[0]) return;
  
  results.push(await createAIGame());
  if (!results[1]) return;
  
  results.push(await loadGameState());
  if (!results[2]) return;
  
  results.push(await makeTestMove());
  results.push(await testDuplicateMove());
  results.push(await testVersionConflict());
  
  console.log('\n🏁 Test Results:');
  console.log('✅ Login:', results[0] ? 'PASS' : 'FAIL');
  console.log('✅ Game Creation:', results[1] ? 'PASS' : 'FAIL');
  console.log('✅ State Loading:', results[2] ? 'PASS' : 'FAIL');
  console.log('✅ Move Processing:', results[3] ? 'PASS' : 'FAIL');
  console.log('✅ Duplicate Detection:', results[4] ? 'PASS' : 'FAIL');
  console.log('✅ Version Conflicts:', results[5] ? 'PASS' : 'FAIL');
  
  const passCount = results.filter(r => r).length;
  console.log(`\n📊 Overall: ${passCount}/${results.length} tests passed`);
  
  if (passCount === results.length) {
    console.log('🎉 Phase 1 implementation working correctly!');
  } else {
    console.log('⚠️ Some tests failed - investigation needed');
  }
}

runTests().catch(console.error);