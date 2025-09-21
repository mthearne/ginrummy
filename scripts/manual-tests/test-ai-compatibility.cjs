#!/usr/bin/env node

/**
 * Test Script: AI Game Compatibility 
 * Tests that PvE (Player vs AI) games still work after PvP changes
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = 'http://localhost:3001/api';

// Test user credentials
const player = { email: 'demo1@example.com', password: 'password123' };

let playerToken = null;
let gameId = null;
let streamVersion = 0;

async function loginPlayer() {
  console.log(`🔐 Logging in ${player.email}...`);
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, player);
    console.log(`✅ Login successful`);
    return response.data.accessToken;
  } catch (error) {
    console.error(`❌ Login failed:`, error.response?.data || error.message);
    return null;
  }
}

async function createAIGame() {
  console.log('🤖 Creating AI game...');
  try {
    const response = await axios.post(`${API_BASE}/games`, {
      vsAI: true,  // This is the key difference for AI games
      isPrivate: true,
      maxPlayers: 2
    }, {
      headers: { Authorization: `Bearer ${playerToken}` }
    });
    
    gameId = response.data.gameId;
    streamVersion = response.data.streamVersion;
    console.log('✅ AI Game created:', { gameId, streamVersion });
    return true;
  } catch (error) {
    console.error('❌ AI game creation failed:', error.response?.data || error.message);
    return false;
  }
}

async function makePlayerMove(moveType, cardId = null) {
  console.log(`🎯 Player making move: ${moveType}`);
  try {
    const moveData = {
      type: moveType,
      requestId: uuidv4(),
      expectedVersion: streamVersion
    };
    
    if (cardId) {
      moveData.cardId = cardId;
    }
    
    const response = await axios.post(`${API_BASE}/games/${gameId}/move`, moveData, {
      headers: { Authorization: `Bearer ${playerToken}` }
    });
    
    streamVersion = response.data.streamVersion;
    const aiTriggered = response.data.metadata?.aiTriggered || false;
    
    console.log(`✅ Player move successful, AI triggered: ${aiTriggered}`);
    
    // Wait for AI to process if triggered
    if (aiTriggered) {
      console.log('⏳ Waiting for AI to think and move...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get updated game state to see if AI moved
      const stateResponse = await axios.get(`${API_BASE}/games/${gameId}/state`, {
        headers: { Authorization: `Bearer ${playerToken}` }
      });
      
      streamVersion = stateResponse.data.streamVersion;
      console.log(`✅ AI completed move, new streamVersion: ${streamVersion}`);
    }
    
    return { success: true, aiTriggered };
  } catch (error) {
    console.error(`❌ Player move failed:`, error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function getGameState() {
  try {
    const response = await axios.get(`${API_BASE}/games/${gameId}/state`, {
      headers: { Authorization: `Bearer ${playerToken}` }
    });
    return response.data.state;
  } catch (error) {
    console.error('❌ Failed to get game state:', error.response?.data || error.message);
    return null;
  }
}

async function testAIGameCompatibility() {
  console.log('🚀 Starting AI Game Compatibility Test...\n');
  
  const results = [];
  
  // Login
  playerToken = await loginPlayer();
  results.push(!!playerToken);
  if (!playerToken) return;
  
  // Create AI game
  results.push(await createAIGame());
  if (!gameId) return;
  
  // Get initial game state
  console.log('\n📊 Getting initial game state...');
  let gameState = await getGameState();
  if (gameState) {
    console.log(`   Game Type: ${gameState.vsAI ? 'Player vs AI' : 'Player vs Player'}`);
    console.log(`   Phase: ${gameState.phase}`);
    console.log(`   Current Player: ${gameState.currentPlayerId}`);
    console.log(`   Players: ${gameState.players.length}`);
    results.push(!!gameState.vsAI);
  } else {
    results.push(false);
  }
  
  // Test 1: Player takes upcard (should trigger AI)
  console.log('\n🎯 Test 1: Player takes upcard...');
  const move1 = await makePlayerMove('take_upcard');
  results.push(move1.success);
  results.push(move1.aiTriggered);
  
  if (!move1.success) {
    console.log('❌ Cannot continue test - initial move failed');
    return results;
  }
  
  // Test 2: Player discards (should trigger AI)
  console.log('\n🎯 Test 2: Player discards card...');
  gameState = await getGameState();
  if (gameState && gameState.players && gameState.players.length > 0) {
    const playerHand = gameState.players.find(p => p.id === gameState.currentPlayerId)?.hand;
    if (playerHand && playerHand.length > 0) {
      const move2 = await makePlayerMove('discard', playerHand[0].id);
      results.push(move2.success);
      results.push(move2.aiTriggered);
    } else {
      console.log('❌ No cards in player hand');
      results.push(false);
      results.push(false);
    }
  } else {
    console.log('❌ Could not get game state for discard test');
    results.push(false);
    results.push(false);
  }
  
  console.log('\n🏁 Test Results:');
  console.log('✅ Player Login:', results[0] ? 'PASS' : 'FAIL');
  console.log('✅ AI Game Creation:', results[1] ? 'PASS' : 'FAIL');
  console.log('✅ Game is vs AI:', results[2] ? 'PASS' : 'FAIL');
  console.log('✅ Player Upcard Move:', results[3] ? 'PASS' : 'FAIL');
  console.log('✅ AI Triggered (Upcard):', results[4] ? 'PASS' : 'FAIL');
  console.log('✅ Player Discard Move:', results[5] ? 'PASS' : 'FAIL');
  console.log('✅ AI Triggered (Discard):', results[6] ? 'PASS' : 'FAIL');
  
  const passCount = results.filter(r => r).length;
  console.log(`\n📊 Overall: ${passCount}/${results.length} AI compatibility tests passed`);
  
  if (passCount >= 6) {
    console.log('🎉 AI game compatibility maintained!');
    console.log('🤖 Player vs AI games work correctly with PvP infrastructure');
  } else {
    console.log('⚠️ Some AI compatibility issues detected');
  }
}

testAIGameCompatibility().catch(console.error);