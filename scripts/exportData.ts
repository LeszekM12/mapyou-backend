// ─── EXPORT SCRIPT ───────────────────────────────────────────────────────────
// Eksportuje wszystkie kolekcje z MongoDB do plików JSON (backup)
// Użycie: npm run export

import 'dotenv/config';
import fs   from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB }       from '../db.js';
import { Workout }         from '../models/Workout.js';
import { Activity }        from '../models/Activity.js';
import { EnrichedActivity } from '../models/EnrichedActivity.js';
import { UnifiedWorkout }  from '../models/UnifiedWorkout.js';
import { User }            from '../models/User.js';
import { Post }            from '../models/Post.js';
import { Club }            from '../models/Club.js';
import { Notification }    from '../models/Notification.js';
import { PersonalRecord }  from '../models/PersonalRecord.js';

const OUTPUT_DIR = path.join(process.cwd(), 'backup');

async function exportData(): Promise<void> {
  await connectDB();

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(OUTPUT_DIR, timestamp);
  fs.mkdirSync(dir);

  const collections = [
    { name: 'workouts',           model: Workout },
    { name: 'activities',         model: Activity },
    { name: 'enrichedActivities', model: EnrichedActivity },
    { name: 'unifiedWorkouts',    model: UnifiedWorkout },
    { name: 'users',              model: User },
    { name: 'posts',              model: Post },
    { name: 'clubs',              model: Club },
    { name: 'notifications',      model: Notification },
    { name: 'personalRecords',    model: PersonalRecord },
  ];

  for (const { name, model } of collections) {
    const data  = await (model as unknown as { find: () => { lean: () => Promise<unknown[]> } }).find().lean();
    const file  = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`✅ Exported ${data.length} ${name} → ${file}`);
  }

  console.log(`\n📦 Backup saved to: ${dir}`);
  await mongoose.disconnect();
}

exportData().catch(err => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
