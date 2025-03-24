
const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String,
    default: '#99AAB5'
  },
  permissions: {
    type: [String],
    default: []
  },
  position: {
    type: Number,
    default: 0
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
});

const guildSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  icon: {
    type: String,
    default: null
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  roles: [roleSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Create default roles when a guild is created
guildSchema.pre('save', function(next) {
  if (this.isNew) {
    // Everyone role (default role)
    this.roles.push({
      name: '@everyone',
      color: '#99AAB5',
      permissions: ['VIEW_CHANNELS', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'],
      position: 0,
      members: [...this.members]
    });
    
    // Admin role for the owner
    this.roles.push({
      name: 'Admin',
      color: '#F04747',
      permissions: ['ADMINISTRATOR'],
      position: 1,
      members: [this.owner]
    });
  }
  next();
});

const Guild = mongoose.model('Guild', guildSchema);

module.exports = Guild;
