
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Guild = require('../models/Guild');
const Conversation = require('../models/Conversation');
const { authenticate } = require('../middleware/auth');

// Get message by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id)
      .populate('author', 'username avatar')
      .populate('channel', 'name guild');
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Check if user has access to the message
    if (message.channel) {
      // Guild message
      const channel = message.channel;
      const guild = await Guild.findById(channel.guild);
      
      if (!guild.members.includes(req.user._id)) {
        return res.status(403).json({ message: 'You do not have access to this message' });
      }
    } else if (message.conversationId) {
      // DM message
      const conversation = await Conversation.findById(message.conversationId);
      
      if (!conversation.participants.includes(req.user._id)) {
        return res.status(403).json({ message: 'You do not have access to this message' });
      }
    } else {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    res.json(message);
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update message
router.put(
  '/:id',
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
      const messageId = req.params.id;
      const userId = req.user._id;

      // Find the message
      let message = await Message.findById(messageId);
      
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }
      
      // Check if user is the author of the message
      if (message.author.toString() !== userId.toString()) {
        return res.status(403).json({ message: 'You can only edit your own messages' });
      }

      // Update message
      message = await Message.findByIdAndUpdate(
        messageId,
        { 
          $set: { 
            content,
            updatedAt: Date.now()
          } 
        },
        { new: true, runValidators: true }
      ).populate('author', 'username avatar');

      // Notify clients about the update
      const io = req.app.get('io');
      if (message.channel) {
        io.to(`channel:${message.channel}`).emit('messageUpdate', message);
      } else if (message.conversationId) {
        io.to(`conversation:${message.conversationId}`).emit('messageUpdate', message);
      }

      res.json(message);
    } catch (error) {
      console.error('Update message error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete message
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id;

    // Find the message
    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Check if user is the author of the message
    const isAuthor = message.author.toString() === userId.toString();
    
    // If not author, check if user has permission to delete messages
    let hasPermission = isAuthor;
    
    if (!isAuthor && message.channel) {
      const channel = await Channel.findById(message.channel);
      const guild = await Guild.findById(channel.guild);
      
      const isAdmin = guild.owner.toString() === userId.toString() ||
                     guild.roles.some(role => 
                       role.permissions.includes('ADMINISTRATOR') && 
                       role.members.includes(userId)
                     );
      
      const canManageMessages = isAdmin || guild.roles.some(role => 
        role.permissions.includes('MANAGE_MESSAGES') && 
        role.members.includes(userId)
      );
      
      hasPermission = canManageMessages;
    }
    
    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to delete this message' });
    }

    // Delete the message
    await Message.findByIdAndDelete(messageId);

    // Notify clients about the deletion
    const io = req.app.get('io');
    if (message.channel) {
      io.to(`channel:${message.channel}`).emit('messageDelete', { _id: messageId, channel: message.channel });
    } else if (message.conversationId) {
      io.to(`conversation:${message.conversationId}`).emit('messageDelete', { _id: messageId, conversationId: message.conversationId });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
