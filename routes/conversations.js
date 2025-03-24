
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Get all conversations for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find conversations where the user is a participant
    const conversations = await Conversation.find({
      participants: userId
    })
      .populate('participants', 'username avatar status')
      .populate('creator', 'username avatar')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });
    
    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new conversation
router.post(
  '/',
  authenticate,
  [
    body('recipient')
      .isMongoId()
      .withMessage('Invalid recipient ID')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { recipient } = req.body;
      const userId = req.user._id;

      // Check if recipient exists
      const recipientUser = await User.findById(recipient);
      
      if (!recipientUser) {
        return res.status(404).json({ message: 'Recipient not found' });
      }
      
      // Check if conversation already exists
      const existingConversation = await Conversation.findOne({
        participants: { $all: [userId, recipient] }
      })
        .populate('participants', 'username avatar status')
        .populate('creator', 'username avatar')
        .populate('lastMessage');
      
      if (existingConversation) {
        return res.json(existingConversation);
      }

      // Create new conversation
      const conversation = new Conversation({
        participants: [userId, recipient],
        creator: userId
      });

      await conversation.save();

      // Populate fields
      await conversation.populate('participants', 'username avatar status');
      await conversation.populate('creator', 'username avatar');

      // Notify recipient about the new conversation
      const io = req.app.get('io');
      io.to(`user:${recipient}`).emit('newConversation', conversation);

      res.status(201).json(conversation);
    } catch (error) {
      console.error('Create conversation error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get conversation by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user._id;

    // Find the conversation
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'username avatar status')
      .populate('creator', 'username avatar')
      .populate('lastMessage');
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    // Check if user is a participant
    if (!conversation.participants.some(p => p._id.toString() === userId.toString())) {
      return res.status(403).json({ message: 'You are not a participant in this conversation' });
    }
    
    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages in a conversation
router.get('/:id/messages', authenticate, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;

    // Find the conversation
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    // Check if user is a participant
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'You are not a participant in this conversation' });
    }

    // Build query
    let query = { conversationId };
    if (before) {
      query._id = { $lt: before };
    }

    // Get messages
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'username avatar')
      .sort({ createdAt: 1 });
    
    res.json(messages);
  } catch (error) {
    console.error('Get conversation messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a message in a conversation
router.post(
  '/:id/messages',
  authenticate,
  [
    body('content')
      .isString()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message content must be between 1 and 2000 characters')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { content } = req.body;
      const conversationId = req.params.id;
      const userId = req.user._id;

      // Find the conversation
      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Check if user is a participant
      if (!conversation.participants.includes(userId)) {
        return res.status(403).json({ message: 'You are not a participant in this conversation' });
      }

      // Create new message
      const message = new Message({
        content,
        author: userId,
        conversationId
      });

      await message.save();

      // Update conversation with last message
      conversation.lastMessage = message._id;
      await conversation.save();

      // Populate author
      await message.populate('author', 'username avatar');

      // Notify participants about the new message
      const io = req.app.get('io');
      conversation.participants.forEach(participantId => {
        io.to(`user:${participantId}`).emit('newMessage', message);
      });
      io.to(`conversation:${conversationId}`).emit('newMessage', message);

      res.status(201).json(message);
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
