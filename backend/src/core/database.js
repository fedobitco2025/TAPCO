const mongoose = require('mongoose');
require('dotenv').config();

// Disable query buffering globally — queries fail immediately if DB is not connected
mongoose.set('bufferCommands', false);

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    throw err; // Let caller decide what to do
  }
}

module.exports = { connectDatabase };
