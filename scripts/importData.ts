// ─── IMPORT SCRIPT ───────────────────────────────────────────────────────────
// Importuje dane z plików JSON do MongoDB Atlas
// Użycie: npm run import -- --dir ./backup/2024-01-01T12-00-00
//         npm run import -- --dir ./backup/2024-01-01T12-00-00 --reset  (czyści kolekcje przed importem)

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

// Parsuj argumenty CLI
const args  = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const INPUT_DIR = dirIdx >= 0 ? args[dirIdx + 1] : path.join(process.cwd(), 'data');
const RESET     = args.includes('--reset');

const FILE_TO_MODEL: Record<string, unknown> = {
  'workouts.json':           Workout,
  'activities.json':         Activity,
  'enrichedActivities.json': EnrichedActivity,
  'unifiedWorkouts.json':    UnifiedWorkout,
  'users.json':              User,
  'posts.json':              Post,
  'clubs.json':              Club,
  'notifications.json':      Notification,
  'personalRecords.json':    PersonalRecord,
};

// ID field per collection (dla upsert)
const ID_FIELD: Record<string, string> = {
  'workouts.json':           'workoutId',
  'activities.json':         'activityId',
  'enrichedActivities.json': 'activityId',
  'unifiedWorkouts.json':    'workoutId',
  'users.json':              'userId',
  'posts.json':              'postId',
  'clubs.json':              'clubId',
  'notifications.json':      'notifId',
  'personalRecords.json':    'userId',
};

async function importData(): Promise<void> {
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`❌ Directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  await connectDB();

  for (const [filename, Model] of Object.entries(FILE_TO_MODEL)) {
    const filepath = path.join(INPUT_DIR, filename);
    if (!fs.existsSync(filepath)) {
      console.log(`⏭  Skipping ${filename} (not found)`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as Record<string, unknown>[];
    if (!data.length) {
      console.log(`⏭  Skipping ${filename} (empty)`);
      continue;
    }

    const m = Model as {
      deleteMany: () => Promise<void>;
      bulkWrite: (ops: unknown[]) => Promise<{ upsertedCount: number; modifiedCount: number }>;
    };

    if (RESET) {
      await m.deleteMany();
      console.log(`🗑  Cleared ${filename}`);
    }

    const idField = ID_FIELD[filename] ?? 'id';

    const ops = data.map(item => {
      // Usuń pola Mongoose _id żeby nie było konfliktów
      const { _id, __v, ...clean } = item as Record<string, unknown>;
      void _id; void __v;
      return {
        updateOne: {
          filter: { [idField]: clean[idField] ?? clean.id },
          update: { $set: clean },
          upsert: true,
        },
      };
    });

    const result = await m.bulkWrite(ops);
    console.log(`✅ Imported ${filename}: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
  }

  console.log('\n✅ Import complete');
  await mongoose.disconnect();
}

importData().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
