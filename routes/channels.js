
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Channel = require('../models/Channel');
const Guild = require('../models/Guild');
const Message = require('../models/Message');
const { authenticate } = require('../middleware/auth');

// Get channel by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid channel ID format' });
    }
    
    const channel = await Channel.findById(req.params.id).populate('guild', 'name icon');
    
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    // Find the guild to check membership
    const guild = await Guild.findById(channel.guild._id);
    
    // Check if user is a member of the guild
    if (!guild.members.includes(req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this guild' });
    }
    
    res.json(channel);
  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update channel
router.put(
  '/:id',
  authenticate,
  [
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2, max: 32 })
      .withMessage('Channel name must be between 2 and 32 characters')
      .matches(/^[a-z0-9-]+$/)
      .withMessage('Channel name can only contain lowercase letters, numbers, and hyphens'),
    body('topic')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1024 })
      .withMessage('Channel topic must be less than 1024 characters'),
    body('category')
      .optional()
      .isString()
      .trim()
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, topic, category } = req.body;
      const channelId = req.params.id;

      // Validate if id is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return res.status(400).json({ message: 'Invalid channel ID format' });
      }

      // Find the channel
      let channel = await Channel.findById(channelId);
      
      if (!channel) {
        return res.status(404).json({ message: 'Channel not found' });
      }
      
      // Find the guild to check permissions
      const guild = await Guild.findById(channel.guild);
      
      // Check if user has permission to manage channels
      const isAdmin = guild.owner.toString() === req.user._id.toString() ||
                     guild.roles.some(role => 
                       role.permissions.includes('ADMINISTRATOR') && 
                       role.members.includes(req.user._id)
                     );
      
      const canManageChannels = isAdmin || guild.roles.some(role => 
        role.permissions.includes('MANAGE_CHANNELS') && 
        role.members.includes(req.user._id)
      );
      
      if (!canManageChannels) {
        return res.status(403).json({ message: 'You do not have permission to manage channels' });
      }

      // Update channel fields
      const updateData = {};
      if (name) updateData.name = name;
      if (topic !== undefined) updateData.topic = topic;
      if (category) updateData.category = category;

      channel = await Channel.findByIdAndUpdate(
        channelId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      // Notify clients about the update
      const io = req.app.get('io');
      io.to(`channel:${channelId}`).emit('channelUpdate', channel);
      io.to(`guild:${channel.guild}`).emit('channelUpdate', channel);

      res.json(channel);
    } catch (error) {
      console.error('Update channel error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete channel
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const channelId = req.params.id;

    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID format' });
    }

    // Find the channel
    const channel = await Channel.findById(channelId);
    
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    // Find the guild to check permissions
    const guild = await Guild.findById(channel.guild);
    
    // Check if user has permission to manage channels
    const isAdmin = guild.owner.toString() === req.user._id.toString() ||
                   guild.roles.some(role => 
                     role.permissions.includes('ADMINISTRATOR') && 
                     role.members.includes(req.user._id)
                   );
    
    const canManageChannels = isAdmin || guild.roles.some(role => 
      role.permissions.includes('MANAGE_CHANNELS') && 
      role.members.includes(req.user._id)
    );
    
    if (!canManageChannels) {
      return res.status(403).json({ message: 'You do not have permission to manage channels' });
    }
    
    // Check if it's the last channel in the guild
    const channelCount = await Channel.countDocuments({ guild: channel.guild });
    if (channelCount <= 1) {
      return res.status(400).json({ message: 'Cannot delete the last channel in a guild' });
    }

    // Delete all messages in the channel
    await Message.deleteMany({ channel: channelId });

    // Delete the channel
    await Channel.findByIdAndDelete(channelId);

    // Notify clients about the deletion
    const io = req.app.get('io');
    io.to(`channel:${channelId}`).emit('channelDelete', channel);
    io.to(`guild:${channel.guild}`).emit('channelDelete', channel);

    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages in a channel
router.get('/:id/messages', authenticate, async (req, res) => {
  try {
    const channelId = req.params.id;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;

    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID format' });
    }

    // Validate if before is a valid ObjectId if provided
    if (before && !mongoose.Types.ObjectId.isValid(before)) {
      return res.status(400).json({ message: 'Invalid message ID format in before parameter' });
    }

    // Find the channel
    const channel = await Channel.findById(channelId);
    
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    // Find the guild to check membership
    const guild = await Guild.findById(channel.guild);
    
    // Check if user is a member of the guild
    if (!guild.members.includes(req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this guild' });
    }

    // Build query
    let query = { channel: channelId };
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
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a message in a channel
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
      const channelId = req.params.id;
      const userId = req.user._id;

      // Validate if id is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return res.status(400).json({ message: 'Invalid channel ID format' });
      }

      // Find the channel
      const channel = await Channel.findById(channelId);
      
      if (!channel) {
        return res.status(404).json({ message: 'Channel not found' });
      }
      
      // Find the guild to check membership and permissions
      const guild = await Guild.findById(channel.guild);
      
      // Check if user is a member of the guild
      if (!guild.members.includes(userId)) {
        return res.status(403).json({ message: 'You are not a member of this guild' });
      }
      
      // Check if user has permission to send messages
      const canSendMessages = guild.roles.some(role => 
        role.members.includes(userId) && 
        role.permissions.includes('SEND_MESSAGES')
      );
      
      if (!canSendMessages) {
        return res.status(403).json({ message: 'You do not have permission to send messages in this channel' });
      }

      // Create new message
      const message = new Message({
        content,
        author: userId,
        channel: channelId
      });

      await message.save();

      // Populate author
      await message.populate('author', 'username avatar');

      // Notify clients about the new message
      const io = req.app.get('io');
      io.to(`channel:${channelId}`).emit('newMessage', message);

      res.status(201).json(message);
    } catch (error) {
      console.error('Create message error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
