
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Invite = require('../models/Invite');
const Guild = require('../models/Guild');
const { authenticate } = require('../middleware/auth');

// Create a new invite for a guild
router.post(
  '/guilds/:guildId',
  authenticate,
  async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const userId = req.user._id;

      // Find the guild
      const guild = await Guild.findById(guildId);
      
      if (!guild) {
        return res.status(404).json({ message: 'Guild not found' });
      }
      
      // Check if user is a member of the guild
      if (!guild.members.includes(userId)) {
        return res.status(403).json({ message: 'You are not a member of this guild' });
      }
      
      // Check if user has permission to create invites
      const isAdmin = guild.owner.toString() === userId.toString() ||
                     guild.roles.some(role => 
                       role.permissions.includes('ADMINISTRATOR') && 
                       role.members.includes(userId)
                     );
      
      const canCreateInvites = isAdmin || guild.roles.some(role => 
        role.permissions.includes('CREATE_INVITE') && 
        role.members.includes(userId)
      );
      
      if (!canCreateInvites) {
        return res.status(403).json({ message: 'You do not have permission to create invites' });
      }

      // Create new invite
      const invite = new Invite({
        guild: guildId,
        creator: userId
      });

      await invite.save();
      
      res.status(201).json(invite);
    } catch (error) {
      console.error('Create invite error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get all invites for a guild
router.get('/guilds/:guildId', authenticate, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const userId = req.user._id;

    // Find the guild
    const guild = await Guild.findById(guildId);
    
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found' });
    }
    
    // Check if user is a member of the guild
    if (!guild.members.includes(userId)) {
      return res.status(403).json({ message: 'You are not a member of this guild' });
    }
    
    // Check if user has permission to view invites
    const isAdmin = guild.owner.toString() === userId.toString() ||
                   guild.roles.some(role => 
                     role.permissions.includes('ADMINISTRATOR') && 
                     role.members.includes(userId)
                   );
    
    const canManageGuild = isAdmin || guild.roles.some(role => 
      role.permissions.includes('MANAGE_GUILD') && 
      role.members.includes(userId)
    );
    
    if (!canManageGuild) {
      return res.status(403).json({ message: 'You do not have permission to view invites' });
    }

    // Get all invites for the guild
    const invites = await Invite.find({ guild: guildId })
      .populate('creator', 'username avatar');
    
    res.json(invites);
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join a guild with an invite code
router.post(
  '/join',
  authenticate,
  [
    body('inviteCode')
      .isString()
      .trim()
      .withMessage('Invite code is required')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { inviteCode } = req.body;
      const userId = req.user._id;

      // Find the invite
      const invite = await Invite.findOne({ code: inviteCode });
      
      if (!invite) {
        return res.status(404).json({ message: 'Invalid invite code' });
      }
      
      // Check if invite is expired
      if (invite.isExpired()) {
        return res.status(400).json({ message: 'Invite has expired' });
      }
      
      // Check if invite has reached max uses
      if (invite.isMaxUsesReached()) {
        return res.status(400).json({ message: 'Invite has reached maximum uses' });
      }

      // Find the guild
      const guild = await Guild.findById(invite.guild);
      
      if (!guild) {
        return res.status(404).json({ message: 'Guild not found' });
      }
      
      // Check if user is already a member
      if (guild.members.includes(userId)) {
        return res.status(400).json({ message: 'You are already a member of this guild' });
      }

      // Add user to guild
      guild.members.push(userId);
      
      // Add user to @everyone role
      const everyoneRole = guild.roles.find(role => role.name === '@everyone');
      if (everyoneRole) {
        everyoneRole.members.push(userId);
      }
      
      await guild.save();

      // Increment invite uses
      invite.uses += 1;
      await invite.save();

      // Notify guild members about the new member
      const io = req.app.get('io');
      io.to(`guild:${guild._id}`).emit('memberJoin', { 
        guildId: guild._id, 
        user: req.user 
      });

      // Return guild data
      const populatedGuild = await Guild.findById(guild._id)
        .populate('owner', 'username avatar');
      
      res.json(populatedGuild);
    } catch (error) {
      console.error('Join guild error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete an invite
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const inviteId = req.params.id;
    const userId = req.user._id;

    // Find the invite
    const invite = await Invite.findById(inviteId);
    
    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    // Find the guild
    const guild = await Guild.findById(invite.guild);
    
    // Check if user has permission to delete invites
    const isAdmin = guild.owner.toString() === userId.toString() ||
                   guild.roles.some(role => 
                     role.permissions.includes('ADMINISTRATOR') && 
                     role.members.includes(userId)
                   );
    
    const canManageGuild = isAdmin || guild.roles.some(role => 
      role.permissions.includes('MANAGE_GUILD') && 
      role.members.includes(userId)
    );
    
    const isCreator = invite.creator.toString() === userId.toString();
    
    if (!canManageGuild && !isCreator) {
      return res.status(403).json({ message: 'You do not have permission to delete this invite' });
    }

    // Delete the invite
    await Invite.findByIdAndDelete(inviteId);

    res.json({ message: 'Invite deleted successfully' });
  } catch (error) {
    console.error('Delete invite error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
