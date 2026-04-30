// ─── RECOVERY ROUTER ─────────────────────────────────────────────────────────
// POST /recover/generate  — generuje 6-cyfrowy kod i przypisuje do userId
// POST /recover/restore   — przyjmuje kod, zwraca userId
// GET  /recover/code/:userId — pobiera istniejący kod dla userId

import { Router, Request, Response } from 'express';
import mongoose, { Schema, model, Document } from 'mongoose';

export const recoverRouter = Router();

// ── Model ─────────────────────────────────────────────────────────────────────

interface IRecoveryCode extends Document {
  userId:    string;
  code:      string;   // 6-cyfrowy kod
  createdAt: Date;
}

const RecoveryCodeSchema = new Schema<IRecoveryCode>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    code:   { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

const RecoveryCode = mongoose.models.RecoveryCode ??
  model<IRecoveryCode>('RecoveryCode', RecoveryCodeSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCode(): string {
  // 6-cyfrowy kod — padding żeby zawsze było 6 cyfr
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function uniqueCode(): Promise<string> {
  let code = generateCode();
  // Upewnij się że kod jest unikalny
  while (await RecoveryCode.exists({ code })) {
    code = generateCode();
  }
  return code;
}

// ── POST /recover/generate ────────────────────────────────────────────────────
// Body: { userId: string }
// Zwraca: { code: "847291" }
// Idempotentny — jeśli kod już istnieje dla userId, zwraca istniejący

recoverRouter.post('/generate', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return void res.status(400).json({ status: 'error', message: 'userId required' });
  }

  try {
    // Sprawdź czy kod już istnieje
    const existing = await RecoveryCode.findOne({ userId });
    if (existing) {
      console.log(`[Recovery] Existing code for userId=${userId}: ${existing.code}`);
      return void res.json({ status: 'ok', code: existing.code });
    }

    // Wygeneruj nowy unikalny kod
    const code = await uniqueCode();
    await RecoveryCode.create({ userId, code });
    console.log(`[Recovery] Generated code ${code} for userId=${userId}`);
    res.json({ status: 'ok', code });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// ── POST /recover/restore ─────────────────────────────────────────────────────
// Body: { code: string }
// Zwraca: { userId: string }

recoverRouter.post('/restore', async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    return void res.status(400).json({ status: 'error', message: 'code required' });
  }

  const clean = code.trim().replace(/\s/g, '');
  const record = await RecoveryCode.findOne({ code: clean });

  if (!record) {
    return void res.status(404).json({ status: 'error', message: 'Kod nieprawidłowy lub nieistniejący' });
  }

  console.log(`[Recovery] Restored userId=${record.userId} via code=${clean}`);
  res.json({ status: 'ok', userId: record.userId });
});

// ── GET /recover/code/:userId ─────────────────────────────────────────────────
// Pobiera istniejący kod dla userId (do wyświetlenia w Settings)

recoverRouter.get('/code/:userId', async (req: Request, res: Response) => {
  const record = await RecoveryCode.findOne({ userId: req.params.userId });
  if (!record) {
    return void res.status(404).json({ status: 'error', message: 'No recovery code found' });
  }
  res.json({ status: 'ok', code: record.code });
});
