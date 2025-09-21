#!/usr/bin/env node

/**
 * Test Script: PvP Notifications
 * Tests the real-time notification system for PvP games
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

async function joinGameAndCheckNotifications() {
  console.log('🤝 Player 2 joining game and checking notifications...');
  try {
    // Join the game
    const joinResponse = await axios.post(`${API_BASE}/games/${gameId}/join`, {
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });
    
    streamVersion = joinResponse.data.streamVersion;
    console.log('✅ Player 2 joined successfully');

    // Wait a bit for notifications to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check Player 1's notifications (should have PLAYER_JOINED)
    const player1NotificationsResponse = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });

    // Check Player 2's notifications (should have GAME_STARTED)
    const player2NotificationsResponse = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });

    console.log('📬 Player 1 notifications:');
    player1NotificationsResponse.data.notifications.forEach((n, i) => {
      console.log(`   ${i + 1}. [${n.type}] ${n.title}: ${n.message} (read: ${n.read})`);
    });

    console.log('📬 Player 2 notifications:');
    player2NotificationsResponse.data.notifications.forEach((n, i) => {
      console.log(`   ${i + 1}. [${n.type}] ${n.title}: ${n.message} (read: ${n.read})`);
    });

    // Verify expected notifications exist
    const player1HasPlayerJoined = player1NotificationsResponse.data.notifications.some(n => n.type === 'PLAYER_JOINED');
    const player2HasGameStarted = player2NotificationsResponse.data.notifications.some(n => n.type === 'GAME_STARTED');

    return {
      player1HasPlayerJoined,
      player2HasGameStarted,
      player1NotificationCount: player1NotificationsResponse.data.notifications.length,
      player2NotificationCount: player2NotificationsResponse.data.notifications.length
    };
  } catch (error) {
    console.error('❌ Join/notification check failed:', error.response?.data || error.message);
    return null;
  }
}

async function makeMoveAndCheckNotifications() {
  console.log('🎯 Player 1 making a move and checking opponent notifications...');
  try {
    // Player 1 takes the upcard
    const moveResponse = await axios.post(`${API_BASE}/games/${gameId}/move`, {
      type: 'take_upcard',
      requestId: uuidv4(),
      expectedVersion: streamVersion
    }, {
      headers: { Authorization: `Bearer ${player1Token}` }
    });

    streamVersion = moveResponse.data.streamVersion;
    console.log('✅ Player 1 made move successfully');

    // Wait a bit for notifications to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check Player 2's notifications for the move notification
    const player2NotificationsResponse = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });

    console.log('📬 Player 2 notifications after move:');
    player2NotificationsResponse.data.notifications.forEach((n, i) => {
      console.log(`   ${i + 1}. [${n.type}] ${n.title}: ${n.message} (read: ${n.read})`);
    });

    // Check if there's an OPPONENT_MOVE notification
    const hasOpponentMoveNotification = player2NotificationsResponse.data.notifications.some(n => n.type === 'OPPONENT_MOVE');

    return {
      hasOpponentMoveNotification,
      totalNotifications: player2NotificationsResponse.data.notifications.length
    };
  } catch (error) {
    console.error('❌ Move/notification check failed:', error.response?.data || error.message);
    return null;
  }
}

async function testMarkAsRead() {
  console.log('✅ Testing mark notification as read...');
  try {
    // Get Player 2's notifications
    const notificationsResponse = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });

    const unreadNotifications = notificationsResponse.data.notifications.filter(n => !n.read);
    
    if (unreadNotifications.length === 0) {
      console.log('⚠️ No unread notifications to mark as read');
      return true;
    }

    const firstUnread = unreadNotifications[0];
    console.log(`📖 Marking notification "${firstUnread.title}" as read...`);

    // Mark as read
    await axios.patch(`${API_BASE}/notifications`, {
      notificationId: firstUnread.id
    }, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });

    // Verify it was marked as read
    const updatedNotificationsResponse = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${player2Token}` }
    });

    const markedNotification = updatedNotificationsResponse.data.notifications.find(n => n.id === firstUnread.id);
    const wasMarkedRead = markedNotification ? markedNotification.read : false;

    console.log(`✅ Notification marked as read: ${wasMarkedRead}`);
    console.log(`   Debug - Notification found: ${!!markedNotification}, Read status: ${markedNotification?.read}`);
    return !!wasMarkedRead; // Ensure boolean return
  } catch (error) {
    console.error('❌ Mark as read failed:', error.response?.data || error.message);
    return false;
  }
}

async function runPvPNotificationTest() {
  console.log('🚀 Starting PvP Notification System Test...\\n');
  
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
  
  // Join game and check join notifications
  const joinResult = await joinGameAndCheckNotifications();
  results.push(!!joinResult);
  results.push(joinResult?.player1HasPlayerJoined || false);
  results.push(joinResult?.player2HasGameStarted || false);
  
  // Make move and check move notifications
  const moveResult = await makeMoveAndCheckNotifications();
  results.push(!!moveResult);
  results.push(moveResult?.hasOpponentMoveNotification || false);
  
  // Test mark as read functionality
  results.push(await testMarkAsRead());
  
  console.log('\\n🏁 Test Results:');
  console.log('✅ Player 1 Login:', results[0] ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Login:', results[1] ? 'PASS' : 'FAIL');
  console.log('✅ PvP Game Creation:', results[2] ? 'PASS' : 'FAIL');
  console.log('✅ Join & Notification API:', results[3] ? 'PASS' : 'FAIL');
  console.log('✅ Player 1 Got PLAYER_JOINED:', results[4] ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Got GAME_STARTED:', results[5] ? 'PASS' : 'FAIL');
  console.log('✅ Move & Notification API:', results[6] ? 'PASS' : 'FAIL');
  console.log('✅ Player 2 Got OPPONENT_MOVE:', results[7] ? 'PASS' : 'FAIL');
  console.log('✅ Mark as Read:', results[8] ? 'PASS' : 'FAIL');
  
  const passCount = results.filter(r => r).length;
  console.log(`\\n📊 Overall: ${passCount}/${results.length} tests passed`);
  
  if (passCount === results.length) {
    console.log('🎉 PvP Notification system working correctly!');
  } else {
    console.log('⚠️ Some notification tests failed - investigation needed');
  }
}

runPvPNotificationTest().catch(console.error);