
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const inviteSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    default: () => nanoid(6)
  },
  guild: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guild',
    required: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uses: {
    type: Number,
    default: 0
  },
  maxUses: {
    type: Number,
    default: 0 // 0 means unlimited
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Check if invite is expired
inviteSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return this.expiresAt < new Date();
};

// Check if invite has reached max uses
inviteSchema.methods.isMaxUsesReached = function() {
  if (this.maxUses === 0) return false;
  return this.uses >= this.maxUses;
};

const Invite = mongoose.model('Invite', inviteSchema);

module.exports = Invite;
