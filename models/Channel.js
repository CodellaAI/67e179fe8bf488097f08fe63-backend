
const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 32
  },
  topic: {
    type: String,
    default: '',
    maxlength: 1024
  },
  guild: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guild',
    required: true
  },
  category: {
    type: String,
    default: 'general'
  },
  type: {
    type: String,
    enum: ['text', 'voice'],
    default: 'text'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const Channel = mongoose.model('Channel', channelSchema);

module.exports = Channel;
