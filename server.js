
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const guildRoutes = require('./routes/guilds');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const conversationRoutes = require('./routes/conversations');
const inviteRoutes = require('./routes/invites');

// Import middleware
const { authenticateSocket } = require('./middleware/auth');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/guilds', guildRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/invites', inviteRoutes);

// Socket.io middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || 
                 socket.handshake.headers.cookie?.split(';')
                   .find(c => c.trim().startsWith('token='))
                   ?.split('=')[1];
    
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    const user = await authenticateSocket(token);
    if (!user) {
      return next(new Error('Authentication error'));
    }
    
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user?._id}`);
  
  // Join user's rooms (guilds, channels, conversations)
  socket.join(`user:${socket.user._id}`);
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user?._id}`);
  });
  
  // Join a guild room
  socket.on('joinGuild', (guildId) => {
    socket.join(`guild:${guildId}`);
  });
  
  // Leave a guild room
  socket.on('leaveGuild', (guildId) => {
    socket.leave(`guild:${guildId}`);
  });
  
  // Join a channel room
  socket.on('joinChannel', (channelId) => {
    socket.join(`channel:${channelId}`);
  });
  
  // Leave a channel room
  socket.on('leaveChannel', (channelId) => {
    socket.leave(`channel:${channelId}`);
  });
  
  // Join a conversation room
  socket.on('joinConversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
  });
  
  // Leave a conversation room
  socket.on('leaveConversation', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });
});

// Export socket.io instance to be used in route handlers
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
