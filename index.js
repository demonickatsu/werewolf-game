// Room Code System with Socket.IO
// This system allows users to create and join rooms using unique codes

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const path = require('path');

// Track disconnected users temporarily
const disconnectedUsers = new Map();
const DISCONNECT_TIMEOUT = 30000; // 30 seconds

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve landing page as default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active rooms and their participants
const activeRooms = new Map();

// Store user information (players only)
const users = new Map();

// Store moderator information separately
const moderators = new Map(); // moderatorSocketId -> roomCode

// Generate a random room code (4 letters only)
function generateRoomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}

// Create a new room
function createRoom(hostSocket, username) {
  const roomCode = generateRoomCode();
  
  // Store user information
  users.set(hostSocket.id, { username, roomCode });
  
  // Store room information
  activeRooms.set(roomCode, {
    host: hostSocket.id,
    participants: new Set([hostSocket.id]),
    createdAt: new Date()
  });
  
  // Join the room
  hostSocket.join(roomCode);
  
  return roomCode;
}

// Join an existing room
function joinRoom(socket, roomCode, username) {
  if (!activeRooms.has(roomCode)) {
    return { success: false, message: 'Room not found' };
  }
  
  const room = activeRooms.get(roomCode);
  room.participants.add(socket.id);
  
  // Store user information
  users.set(socket.id, { username, roomCode });
  
  socket.join(roomCode);
  
  return { success: true, roomCode, username };
}

// Leave a room
function leaveRoom(socket) {
  // Find which room the socket is in
  for (const [roomCode, room] of activeRooms) {
    if (room.participants.has(socket.id)) {
      room.participants.delete(socket.id);
      socket.leave(roomCode);
      
      // Keep room alive permanently - never delete automatically
      // Rooms are only deleted when moderator explicitly leaves or server restarts
      
      return roomCode;
    }
  }
  return null;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Set username (for players) - with callback support
  socket.on('setUsername', (username, callback) => {
    if (username && username.length <= 12) {
      // Force capitalize and allow alphanumeric characters + spaces
      const cleanedUsername = username.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
      
      if (cleanedUsername.length === 0) {
        socket.emit('error', { message: 'Username must contain alphanumeric characters' });
        if (callback) callback({ error: 'Username must contain alphanumeric characters' });
        return;
      }
      
      const userInfo = users.get(socket.id) || {};
      userInfo.username = cleanedUsername;
      users.set(socket.id, userInfo);
      socket.emit('usernameSet', { username: cleanedUsername });
      if (callback) callback({ username: cleanedUsername });
    } else {
      socket.emit('error', { message: 'Username must be 12 characters or less' });
      if (callback) callback({ error: 'Username must be 12 characters or less' });
    }
  });
  
  // Create a moderator room (moderators don't join as players)
  socket.on('createModeratorRoom', () => {
    const roomCode = generateRoomCode();
    
    // Store moderator-room mapping
    moderators.set(socket.id, roomCode);
    
    // Create the room (but don't add moderator as participant)
    activeRooms.set(roomCode, {
      host: socket.id,
      participants: new Set(),
      createdAt: new Date(),
      hasModerator: true
    });
    
    socket.join(roomCode);
    socket.emit('moderatorRoomCreated', { roomCode });
    console.log(`Moderator room created: ${roomCode} by ${socket.id}`);
  });
  
  // Moderator requests player list
  socket.on('getPlayerList', (roomCode) => {
    const room = activeRooms.get(roomCode);
    if (room && moderators.get(socket.id) === roomCode) {
      const playerList = Array.from(room.participants).map(userId => {
        const userInfo = users.get(userId);
        return {
          userId,
          username: userInfo?.username || 'Unknown'
        };
      });
      socket.emit('playerList', { roomCode, players: playerList });
    }
  });
  
  // Moderator saves game configuration
  socket.on('saveGameConfig', (data) => {
    const room = activeRooms.get(data.roomCode);
    if (room && moderators.get(socket.id) === data.roomCode) {
      // Store configuration with the room
      room.configuration = data.config;
      socket.emit('configSaved', { success: true });
      console.log(`Game configuration saved for room ${data.roomCode}:`, data.config);
    } else {
      socket.emit('configSaved', { success: false, message: 'Invalid room or permissions' });
    }
  });
  
  // Moderator starts the game
  socket.on('startGame', (data) => {
    const room = activeRooms.get(data.roomCode);
    if (room && moderators.get(socket.id) === data.roomCode) {
      if (room.participants.size < 3) {
        socket.emit('gameError', { message: 'Need at least 3 players to start the game' });
        return;
      }
      
      if (!room.configuration) {
        socket.emit('gameError', { message: 'Game configuration not set' });
        return;
      }
      
      // Convert participants to array for role assignment
      const players = Array.from(room.participants);
      const playerRoles = {};
      
      // Assign werewolves
      const werewolfCount = Math.min(room.configuration.werewolfCount, players.length - 1);
      for (let i = 0; i < werewolfCount; i++) {
        const randomIndex = Math.floor(Math.random() * players.length);
        const playerId = players[randomIndex];
        playerRoles[playerId] = 'Werewolf';
        players.splice(randomIndex, 1); // Remove from available players
      }
      
      // Assign special roles (one per role if enabled and players available)
      const specialRoles = [
        { name: 'Seer', enabled: room.configuration.enableSeer, count: 1 },
        { name: 'Doctor', enabled: room.configuration.enableDoctor, count: 1 },
        { name: 'Witch', enabled: room.configuration.enableWitch, count: 1 },
        { name: 'Hunter', enabled: room.configuration.enableHunter, count: 1 },
        { name: 'Masons', enabled: room.configuration.enableMasons, count: 2 }
      ];
      
      specialRoles.forEach(role => {
        if (role.enabled && players.length >= role.count) {
          for (let i = 0; i < role.count; i++) {
            const randomIndex = Math.floor(Math.random() * players.length);
            const playerId = players[randomIndex];
            playerRoles[playerId] = role.name;
            players.splice(randomIndex, 1);
          }
        }
      });
      
      // Assign villagers to remaining players
      players.forEach(playerId => {
        playerRoles[playerId] = 'Villager';
      });
      
      // Store roles in the room
      room.roles = playerRoles;
      room.gameStarted = true;
      
      // Notify moderator
      socket.emit('gameStarted', {
        success: true,
        roles: playerRoles,
        players: Array.from(room.participants).map(playerId => ({
          playerId,
          username: users.get(playerId)?.username || 'Unknown',
          role: playerRoles[playerId]
        }))
      });
      
      // Notify each player individually with their specific role
      room.participants.forEach(playerId => {
        io.to(playerId).emit('showRole', { 
          role: playerRoles[playerId] || 'Villager'
        });
      });
      
      console.log(`Game started in room ${data.roomCode} with roles:`, playerRoles);
    } else {
      socket.emit('gameError', { message: 'Invalid room or permissions' });
    }
  });
  
  // Moderator ends the game
  socket.on('endGame', (data) => {
    const room = activeRooms.get(data.roomCode);
    if (room && moderators.get(socket.id) === data.roomCode) {
      // Reset game state but keep everything else intact
      room.gameStarted = false;
      room.roles = {};
      
      // Notify moderator to reset overlay
      socket.emit('gameEnded', { success: true });
      
      // Notify all players to reset overlay (but stay in room)
      io.to(data.roomCode).emit('resetGameOverlay');
      
      console.log(`Game ended in room ${data.roomCode}, ready for next game`);
    } else {
      socket.emit('gameError', { message: 'Invalid room or permissions' });
    }
  });
  
  // Create a new room (for players)
  socket.on('createRoom', () => {
    const userInfo = users.get(socket.id);
    if (!userInfo || !userInfo.username) {
      socket.emit('error', { message: 'Please set a username first' });
      return;
    }
    
    const roomCode = createRoom(socket, userInfo.username);
    socket.emit('roomCreated', { roomCode, username: userInfo.username });
    console.log(`Room created: ${roomCode} by ${userInfo.username} (${socket.id})`);
  });
  
  // Join an existing room (for players)
  socket.on('joinRoom', (roomCode) => {
    const userInfo = users.get(socket.id);
    if (!userInfo || !userInfo.username) {
      socket.emit('error', { message: 'Please set a username first' });
      return;
    }
    
    const room = activeRooms.get(roomCode);
    if (room && room.gameStarted) {
      socket.emit('joinError', { message: 'Cannot join: Game is already in progress. Please wait for the next game.' });
      return;
    }
    
    const result = joinRoom(socket, roomCode, userInfo.username);
    if (result.success) {
      socket.emit('roomJoined', { roomCode: result.roomCode, username: result.username });
      socket.to(result.roomCode).emit('userJoined', { 
        userId: socket.id, 
        username: result.username 
      });
      console.log(`User ${userInfo.username} (${socket.id}) joined room ${result.roomCode}`);
    } else {
      socket.emit('joinError', { message: result.message });
    }
  });
  
  // Request user list for room
  socket.on('getUserList', (roomCode) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      const userList = Array.from(room.participants).map(userId => {
        const userInfo = users.get(userId);
        return {
          userId,
          username: userInfo?.username || 'Unknown',
          isModerator: moderators.has(userId)
        };
      });
      
      // Filter out moderators if the requester is a player
      const requestingUser = users.get(socket.id);
      const isRequesterModerator = moderators.has(socket.id);
      
      const filteredUserList = isRequesterModerator 
        ? userList 
        : userList.filter(user => !user.isModerator);
      
      socket.emit('userList', { roomCode, users: filteredUserList });
    }
  });
  
  // Handle disconnection with temporary protection
  socket.on('disconnect', () => {
    // Check if this was a player
    const userInfo = users.get(socket.id);
    if (userInfo && userInfo.roomCode) {
      // Store disconnected user temporarily instead of removing immediately
      disconnectedUsers.set(socket.id, {
        userInfo,
        timestamp: Date.now(),
        roomCode: userInfo.roomCode
      });
      
      // Set timeout to clean up if they don't reconnect
      setTimeout(() => {
        if (disconnectedUsers.has(socket.id)) {
          const disconnectedUser = disconnectedUsers.get(socket.id);
          socket.to(disconnectedUser.roomCode).emit('userLeft', { 
            userId: socket.id,
            username: disconnectedUser.userInfo.username
          });
          console.log(`Player ${disconnectedUser.userInfo.username} (${socket.id}) left room ${disconnectedUser.roomCode} (timeout)`);
          
          // Clean up - just remove participant, keep room alive
          const room = activeRooms.get(disconnectedUser.roomCode);
          if (room) {
            room.participants.delete(socket.id);
            // Room stays alive permanently
          }
          
          disconnectedUsers.delete(socket.id);
          users.delete(socket.id);
        }
      }, DISCONNECT_TIMEOUT);
      
      console.log(`Player ${userInfo.username} (${socket.id}) disconnected from room ${userInfo.roomCode} (temporary)`);
    }
    
    // Check if this was a moderator
    const moderatorRoom = moderators.get(socket.id);
    if (moderatorRoom) {
      const room = activeRooms.get(moderatorRoom);
      if (room) {
        room.hasModerator = false;
        // Keep room alive even if empty - only delete when moderator explicitly ends it
        // room.participants.size check removed to preserve room permanently
      }
      console.log(`Moderator (${socket.id}) left room ${moderatorRoom}`);
      moderators.delete(socket.id);
    }
    
    console.log('Client disconnected:', socket.id);
  });
  
  // Handle reconnection
  socket.on('reconnect', () => {
    if (disconnectedUsers.has(socket.id)) {
      const disconnectedUser = disconnectedUsers.get(socket.id);
      
      // Restore user to room
      users.set(socket.id, disconnectedUser.userInfo);
      const room = activeRooms.get(disconnectedUser.roomCode);
      if (room) {
        room.participants.add(socket.id);
        socket.join(disconnectedUser.roomCode);
        
        // Notify room that user reconnected
        socket.to(disconnectedUser.roomCode).emit('userReconnected', { 
          userId: socket.id,
          username: disconnectedUser.userInfo.username
        });
        
        console.log(`Player ${disconnectedUser.userInfo.username} (${socket.id}) reconnected to room ${disconnectedUser.roomCode}`);
      }
      
      disconnectedUsers.delete(socket.id);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

// Export for testing or integration
module.exports = { 
  generateRoomCode, 
  createRoom, 
  joinRoom, 
  leaveRoom, 
  activeRooms 
};