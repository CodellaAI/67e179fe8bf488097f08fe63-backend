
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get all users
router.get('/', authenticate, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ username: 1 });
    
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json(req.user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update current user
router.put(
  '/me', 
  authenticate,
  upload.single('avatar'),
  [
    body('username')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 32 })
      .withMessage('Username must be between 3 and 32 characters'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .optional()
      .isString()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('bio')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('Bio must be less than 1000 characters')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password, bio, status } = req.body;
      const userId = req.user._id;

      // Check if username is already taken
      if (username && username !== req.user.username) {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
      }

      // Check if email is already taken
      if (email && email !== req.user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: 'Email is already taken' });
        }
      }

      // Update user fields
      const updateData = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (bio) updateData.bio = bio;
      if (status) updateData.status = status;
      if (req.file) updateData.avatar = `/${req.file.path}`;

      // If password is provided, update it
      let user = await User.findById(userId);
      if (password) {
        user.password = password;
        await user.save();
      }

      // Update other fields
      user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select('-password');

      res.json(user);
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get user by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
