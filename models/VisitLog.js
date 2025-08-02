const mongoose = require('mongoose');

const visitLogSchema = new mongoose.Schema({
  visitorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true,
  },
  visitedAt: {
    type: Date,
    default: Date.now,
  },
  ip: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
  },
  duration: {
    type: Number,
    default: 40,
  },
});

module.exports = mongoose.model('VisitLog', visitLogSchema);