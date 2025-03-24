
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate user with JWT
const authenticate = async (req, res, next) => {
  try {
    // Get token from cookies
    const token = req.cookies.token;
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Function to authenticate socket connection
const authenticateSocket = async (token) => {
  try {
    if (!token) return null;
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) return null;
    
    return user;
  } catch (error) {
    console.error('Socket auth error:', error);
    return null;
  }
};

// Middleware to check if user has admin role in a guild
const isGuildAdmin = async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const userId = req.user._id;
    
    // Find the guild
    const guild = await Guild.findById(guildId);
    
    if (!guild) {
      return res.status(404).json({ message: 'Guild not found' });
    }
    
    // Check if user is the owner
    if (guild.owner.toString() === userId.toString()) {
      return next();
    }
    
    // Check if user has admin role
    const adminRole = guild.roles.find(role => 
      role.permissions.includes('ADMINISTRATOR') && 
      role.members.some(member => member.toString() === userId.toString())
    );
    
    if (!adminRole) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }
    
    next();
  } catch (error) {
    console.error('Guild admin check error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  authenticate,
  authenticateSocket,
  isGuildAdmin
};
