import mongoose from 'mongoose';

export async function connectDB(uri: string) {
  const conn = await mongoose.connect(uri);
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
}

export function dbStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected
    ? 'connected'
    : 'disconnected';
}
