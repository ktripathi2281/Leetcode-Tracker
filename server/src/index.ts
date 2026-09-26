import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

if (!env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Add it to server/.env.');
  process.exit(1);
}

await connectDB(env.MONGODB_URI);

createApp().listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
