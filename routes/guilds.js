
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Guild = require('../models/Guild');
const Channel = require('../models/Channel');
const User = require('../models/User');
const { authenticate, isGuildAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get all guilds for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const guilds = await Guild.find({
      members: req.user._id
    }).populate('owner', 'username avatar');
    
    res.json(guilds);
  } catch (error) {
    console.error('Get guilds error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new guild
router.post(
  '/',
  authenticate,
  upload.single('icon'),
  [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Guild name must be between 2 and 100 characters')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name } = req.body;
      const userId = req.user._id;

      // Create new guild
      const guild = new Guild({
        name,
        owner: userId,
        members: [userId],
        icon: req.file ? `/${req.file.path}` : null
      });

      await guild.save();

      // Create default text channel
      const generalChannel = new Channel({
        name: 'general',
        guild: guild._id,
        category: 'Text Channels'
      });

      await generalChannel.save();

      // Get the guild with populated owner
      const populatedGuild = await Guild.findById(guild._id).populate('owner', 'username avatar');

      res.status(201).json(populatedGuild);
    } catch (error) {
      console.error('Create guild error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get guild by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const guild = await Guild.findById(req.params.id)
      .populate('owner', 'username avatar')
      .populate('members', 'username avatar status');
    
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found' });
    }
    
    // Check if user is a member of the guild
    if (!guild.members.some(member => member._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'You are not a member of this guild' });
    }
    
    res.json(guild);
  } catch (error) {
    console.error('Get guild error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update guild
router.put(
  '/:id',
  authenticate,
  upload.single('icon'),
  [
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Guild name must be between 2 and 100 characters')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name } = req.body;
      const guildId = req.params.id;

      // Find the guild
      let guild = await Guild.findById(guildId);
      
      if (!guild) {
        return res.status(404).json({ message: 'Guild not found' });
      }
      
      // Check if user is the owner
      if (guild.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Only the guild owner can update the guild' });
      }

      // Update guild fields
      const updateData = {};
      if (name) updateData.name = name;
      if (req.file) updateData.icon = `/${req.file.path}`;

      guild = await Guild.findByIdAndUpdate(
        guildId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).populate('owner', 'username avatar');

      // Notify clients about the update
      const io = req.app.get('io');
      io.to(`guild:${guildId}`).emit('guildUpdate', guild);

      res.json(guild);
    } catch (error) {
      console.error('Update guild error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete guild
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const guildId = req.params.id;

    // Find the guild
    const guild = await Guild.findById(guildId);
    
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found' });
    }
    
    // Check if user is the owner
    if (guild.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the guild owner can delete the guild' });
    }

    // Delete all channels in the guild
    await Channel.deleteMany({ guild: guildId });

    // Delete the guild
    await Guild.findByIdAndDelete(guildId);

    // Notify clients about the deletion
    const io = req.app.get('io');
    io.to(`guild:${guildId}`).emit('guildDelete', { _id: guildId });

    res.json({ message: 'Guild deleted successfully' });
  } catch (error) {
    console.error('Delete guild error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all channels in a guild
router.get('/:id/channels', authenticate, async (req, res) => {
  try {
    const guildId = req.params.id;

    // Find the guild
    const guild = await Guild.findById(guildId);
    
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found' });
    }
    
    // Check if user is a member of the guild
    if (!guild.members.includes(req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this guild' });
    }

    // Get all channels
    const channels = await Channel.find({ guild: guildId }).sort({ category: 1, name: 1 });
    
    res.json(channels);
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new channel in a guild
router.post(
  '/:id/channels',
  authenticate,
  [
    body('name')
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
    body('type')
      .optional()
      .isIn(['text', 'voice'])
      .withMessage('Channel type must be either text or voice'),
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

      const { name, topic, type = 'text', category = 'general' } = req.body;
      const guildId = req.params.id;

      // Find the guild
      const guild = await Guild.findById(guildId);
      
      if (!guild) {
        return res.status(404).json({ message: 'Guild not found' });
      }
      
      // Check if user has permission to create channels
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
        return res.status(403).json({ message: 'You do not have permission to create channels' });
      }

      // Create new channel
      const channel = new Channel({
        name,
        topic,
        type,
        category,
        guild: guildId
      });

      await channel.save();

      // Notify clients about the new channel
      const io = req.app.get('io');
      io.to(`guild:${guildId}`).emit('newChannel', channel);

      res.status(201).json(channel);
    } catch (error) {
      console.error('Create channel error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get all members in a guild
router.get('/:id/members', authenticate, async (req, res) => {
  try {
    const guildId = req.params.id;

    // Find the guild
    const guild = await Guild.findById(guildId).populate('members', 'username avatar status');
    
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found' });
    }
    
    // Check if user is a member of the guild
    if (!guild.members.some(member => member._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'You are not a member of this guild' });
    }
    
    res.json(guild.members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove a member from a guild
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const { id: guildId, userId } = req.params;

    // Find the guild
    const guild = await Guild.findById(guildId);
    
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found' });
    }
    
    // Check if user has permission to kick members
    const isAdmin = guild.owner.toString() === req.user._id.toString() ||
                   guild.roles.some(role => 
                     role.permissions.includes('ADMINISTRATOR') && 
                     role.members.includes(req.user._id)
                   );
    
    const canKickMembers = isAdmin || guild.roles.some(role => 
      role.permissions.includes('KICK_MEMBERS') && 
      role.members.includes(req.user._id)
    );
    
    if (!canKickMembers) {
      return res.status(403).json({ message: 'You do not have permission to kick members' });
    }
    
    // Cannot kick the owner
    if (guild.owner.toString() === userId) {
      return res.status(403).json({ message: 'Cannot remove the guild owner' });
    }

    // Remove member from guild
    await Guild.findByIdAndUpdate(guildId, {
      $pull: { members: userId }
    });

    // Remove member from all roles
    await Guild.updateMany(
      { _id: guildId, 'roles.members': userId },
      { $pull: { 'roles.$[].members': userId } }
    );

    // Notify clients about the member removal
    const io = req.app.get('io');
    io.to(`guild:${guildId}`).emit('memberRemove', { guildId, userId });
    io.to(`user:${userId}`).emit('kickedFromGuild', { guildId, name: guild.name });

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a role in a guild
router.post(
  '/:id/roles',
  authenticate,
  [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Role name must be between 1 and 100 characters'),
    body('color')
      .optional()
      .isString()
      .matches(/^#[0-9A-F]{6}$/i)
      .withMessage('Color must be a valid hex color'),
    body('permissions')
      .optional()
      .isArray()
      .withMessage('Permissions must be an array')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, color, permissions = [] } = req.body;
      const guildId = req.params.id;

      // Find the guild
      const guild = await Guild.findById(guildId);
      
      if (!guild) {
        return res.status(404).json({ message: 'Guild not found' });
      }
      
      // Check if user has permission to manage roles
      const isAdmin = guild.owner.toString() === req.user._id.toString() ||
                     guild.roles.some(role => 
                       role.permissions.includes('ADMINISTRATOR') && 
                       role.members.includes(req.user._id)
                     );
      
      const canManageRoles = isAdmin || guild.roles.some(role => 
        role.permissions.includes('MANAGE_ROLES') && 
        role.members.includes(req.user._id)
      );
      
      if (!canManageRoles) {
        return res.status(403).json({ message: 'You do not have permission to manage roles' });
      }

      // Create new role
      const newRole = {
        name,
        color: color || '#99AAB5',
        permissions,
        position: guild.roles.length,
        members: []
      };

      guild.roles.push(newRole);
      await guild.save();

      // Get the newly created role
      const role = guild.roles[guild.roles.length - 1];

      // Notify clients about the new role
      const io = req.app.get('io');
      io.to(`guild:${guildId}`).emit('newRole', { guildId, role });

      res.status(201).json(role);
    } catch (error) {
      console.error('Create role error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
