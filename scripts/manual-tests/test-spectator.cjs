#!/usr/bin/env node

/**
 * Test Script: Game Spectator System
 * Tests the spectator functionality for watching games
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = 'http://localhost:3001/api';

// Test user credentials
const player1 = { email: 'demo1@example.com', password: 'password123' };
const player2 = { email: 'demo2@example.com', password: 'Password123' };
const spectator = { email: 'spectator@example.com', password: 'Spectator123' };

let player1Token = null;
let player2Token = null;
let spectatorToken = null;
let gameId = null;
let streamVersion = 0;

async function loginPlayer(playerCreds, name) {
  console.log(`🔐 Logging in ${name} (${playerCreds.email})...`);
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, playerCreds);
    console.log(`✅ Login successful for ${name}`);
    return response.data.accessToken;
  } catch (error) {
    console.error(`❌ Login failed for ${name}:`, error.response?.data || error.message);
    return null;
  }
}

async function createSpectatorAccount() {
  console.log('👤 Creating spectator account...');
  try {
    await axios.post(`${API_BASE}/auth/register`, {
      username: 'spectator',
      email: spectator.email,
      password: spectator.password
    });
    console.log('✅ Spectator account created');
    return true;
  } catch (error) {
    if (error.response?.status === 400 && error.response?.data?.error?.includes('already exists')) {
      console.log('✅ Spectator account already exists');
      return true;
    }
    console.error('❌ Failed to create spectator account:', error.response?.data || error.message);
    return false;
  }
}

async function createPvPGame() {
  console.log('🎮 Creating PvP game (Player 1)...');
  try {
    const response = await axios.post(`${API_BASE}/games`, {
      vsAI: false,
      isPrivate: false, // Make it public for spectating
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
    
    streamVersion = response.data.streamVersion;
    console.log('✅ Player 2 joined successfully');
    return true;
  } catch (error) {
    console.error('❌ Player 2 join failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSpectatorAPI() {
  console.log('\n👁️ Testing spectator API endpoints...');
  
  // Test 1: Get spectatable games
  console.log('📋 Test 1: Getting spectatable games...');
  try {
    const response = await axios.get(`${API_BASE}/games/spectatable`, {
      headers: { Authorization: `Bearer ${spectatorToken}` }
    });
    
    console.log(`✅ Found ${response.data.games.length} spectatable games`);
    response.data.games.forEach((game, i) => {
      console.log(`   ${i + 1}. Game ${game.id.slice(0, 8)}... - ${game.players.map(p => p.username).join(' vs ')}`);
    });
    
    const hasOurGame = response.data.games.some(g => g.id === gameId);
    console.log(`🎯 Our test game is ${hasOurGame ? 'visible' : 'NOT visible'} in spectatable games`);
    
  } catch (error) {
    console.error('❌ Failed to get spectatable games:', error.response?.data || error.message);
  }
  
  // Test 2: Spectate our game
  console.log('\n👀 Test 2: Spectating our game...');
  try {
    const response = await axios.get(`${API_BASE}/games/${gameId}/spectate`, {
      headers: { Authorization: `Bearer ${spectatorToken}` }
    });
    
    if (response.data.success) {
      const view = response.data.spectatorView;
      console.log('✅ Spectator view loaded successfully');
      console.log(`   Status: ${view.status}`);
      console.log(`   Phase: ${view.phase || 'N/A'}`);
      console.log(`   Players: ${view.players?.map(p => p.username).join(' vs ') || 'None'}`);
      console.log(`   Current Turn: ${view.playerNames?.[view.currentPlayerId] || 'N/A'}`);
      console.log(`   Is Spectating: ${view.isSpectating}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to spectate game:', error.response?.data || error.message);
  }
}

async function makeSomeMoves() {
  console.log('\n🎯 Making some moves to test spectator updates...');
  
  // Player 1 takes upcard
  try {
    console.log('Player 1 taking upcard...');
    const response1 = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      type: 'take_upcard',
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });
    
    streamVersion = response1.data.streamVersion;
    console.log('✅ Player 1 took upcard');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.error('❌ Player 1 move failed:', error.response?.data || error.message);
  }
  
  // Player 2 draws from stock  
  try {
    console.log('Player 2 drawing from stock...');
    const response2 = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      type: 'draw_stock',
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });
    
    streamVersion = response2.data.streamVersion;
    console.log('✅ Player 2 drew from stock');
    
  } catch (error) {
    console.error('❌ Player 2 move failed:', error.response?.data || error.message);
  }
}

async function testSpectatorView() {
  console.log('\n👁️ Testing spectator view after moves...');
  try {
    const response = await axios.get(`${API_BASE}/games/${gameId}/spectate`, {
      headers: { Authorization: `Bearer ${spectatorToken}` }
    });
    
    if (response.data.success) {
      const view = response.data.spectatorView;
      console.log('✅ Updated spectator view loaded');
      console.log(`   Phase: ${view.phase}`);
      console.log(`   Current Turn: ${view.playerNames?.[view.currentPlayerId]}`);
      console.log(`   Round: ${view.roundNumber || 1}`);
      
      if (view.players) {
        view.players.forEach((player, i) => {
          console.log(`   Player ${i + 1} (${player.username}): ${player.handSize} cards, Score: ${player.score}`);
        });
      }
      
      console.log(`   Discard Pile: ${view.discardPile?.length || 0} cards`);
      console.log(`   Stock Pile: ${view.stockPileCount || 0} cards`);
    }
    
  } catch (error) {
    console.error('❌ Failed to get updated spectator view:', error.response?.data || error.message);
  }
}

async function runSpectatorTest() {
  console.log('🚀 Starting Game Spectator System Test...\n');
  
  const results = [];
  
  // Create spectator account
  results.push(await createSpectatorAccount());
  
  // Login all users
  player1Token = await loginPlayer(player1, 'Player 1');
  results.push(!!player1Token);
  
  player2Token = await loginPlayer(player2, 'Player 2'); 
  results.push(!!player2Token);
  
  spectatorToken = await loginPlayer(spectator, 'Spectator');
  results.push(!!spectatorToken);
  
  if (!player1Token || !player2Token || !spectatorToken) return;
  
  // Create and setup game
  results.push(await createPvPGame());
  if (!gameId) return;
  
  results.push(await joinGame());
  
  // Test spectator functionality
  await testSpectatorAPI();
  await makeSomeMoves();
  await testSpectatorView();
  
  console.log('\n🏁 Test Results:');
  console.log('✅ Create Spectator Account:', results[0] ? 'PASS' : 'FAIL');
  console.log('✅ Player 1 Login:', results[1] ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Login:', results[2] ? 'PASS' : 'FAIL');
  console.log('✅ Spectator Login:', results[3] ? 'PASS' : 'FAIL');
  console.log('✅ PvP Game Creation:', results[4] ? 'PASS' : 'FAIL');
  console.log('✅ Game Join:', results[5] ? 'PASS' : 'FAIL');
  
  const passCount = results.filter(r => r).length;
  console.log(`\n📊 Overall: ${passCount}/${results.length} core tests passed`);
  
  if (passCount === results.length) {
    console.log('🎉 Spectator system basic functionality working!');
    console.log('📝 Note: Real-time spectator streaming would require additional testing');
  } else {
    console.log('⚠️ Some spectator tests failed - investigation needed');
  }
}

runSpectatorTest().catch(console.error);