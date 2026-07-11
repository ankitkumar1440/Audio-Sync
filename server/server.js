const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const server = http.createServer(app);

// Configure Socket.io with permissive CORS for WebRTC signaling
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory store for rooms
// Key: roomCode (string) -> Value: { hostId: socket.id, clients: Set<socket.id> }
const rooms = new Map();

// Map to look up which room a socket belongs to and their role
// Key: socket.id -> Value: { roomCode, role: 'host' | 'client' }
const socketRegistry = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Host creates a room
  socket.on('create-room', (callback) => {
    try {
      const roomCode = generateRoomCode();
      rooms.set(roomCode, {
        hostId: socket.id,
        clients: new Set()
      });
      
      socketRegistry.set(socket.id, { roomCode, role: 'host' });
      socket.join(roomCode);
      
      console.log(`Room created: ${roomCode} by host: ${socket.id}`);
      callback({ success: true, roomCode });
    } catch (error) {
      console.error('Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  // 2. Client joins a room
  socket.on('join-room', ({ roomCode }, callback) => {
    try {
      const room = rooms.get(roomCode);
      if (!room) {
        console.log(`Join failed: Room ${roomCode} not found`);
        return callback({ success: false, error: 'Room not found' });
      }

      room.clients.add(socket.id);
      socketRegistry.set(socket.id, { roomCode, role: 'client' });
      socket.join(roomCode);

      console.log(`Client ${socket.id} joined room ${roomCode}`);
      
      // Notify host that a peer joined
      io.to(room.hostId).emit('peer-joined', { peerId: socket.id });

      callback({ success: true, hostId: room.hostId });
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room' });
    }
  });

  // 3. WebRTC signaling relay
  // Message payload: { targetId, data }
  socket.on('signal', ({ targetId, data }) => {
    // Relay signaling message directly to the target socket
    io.to(targetId).emit('signal', {
      senderId: socket.id,
      data
    });
  });

  // 4. Client manual disconnect / leave room
  socket.on('leave-room', () => {
    handleCleanup(socket);
  });

  // 5. Connection disconnected
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    handleCleanup(socket);
  });
});

function handleCleanup(socket) {
  const registration = socketRegistry.get(socket.id);
  if (!registration) return;

  const { roomCode, role } = registration;
  const room = rooms.get(roomCode);

  if (room) {
    if (role === 'host') {
      console.log(`Host disconnected. Tearing down room ${roomCode}`);
      // Notify all clients in the room that the host left
      socket.to(roomCode).emit('host-disconnected');
      
      // Remove clients from registry
      room.clients.forEach(clientId => {
        socketRegistry.delete(clientId);
      });
      
      // Delete the room
      rooms.delete(roomCode);
    } else {
      console.log(`Client disconnected. Removing from room ${roomCode}`);
      room.clients.delete(socket.id);
      
      // Notify the host that this client disconnected
      io.to(room.hostId).emit('peer-disconnected', { peerId: socket.id });
    }
  }

  socketRegistry.delete(socket.id);
  socket.leave(roomCode);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
