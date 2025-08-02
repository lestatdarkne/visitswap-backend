const mongoose = require('mongoose');

const creditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['ganho', 'gasto'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel',
  },
  relatedModel: {
    type: String,
    enum: ['VisitLog', 'Site'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('CreditLog', creditLogSchema);