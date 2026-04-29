// ─── DATABASE CONNECTION ─────────────────────────────────────────────────────
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI ?? '';

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set in environment variables!');
  process.exit(1);
}

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI, {
      // Mongoose 8 nie potrzebuje już useNewUrlParser / useUnifiedTopology
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB Atlas connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  }
}

// Eventy połączenia
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected — reconnecting...');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

export default mongoose;
