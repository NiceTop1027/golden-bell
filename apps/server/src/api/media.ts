// 계획서 5.3 첨부: jpg·png·webp, 최대 5MB. 서버에서 크기를 줄여 다시 저장 (10.3: 다시 인코딩)
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { db } from '../lib/db.ts';
import { requireUser } from '../lib/auth.ts';
import { env } from '../lib/env.ts';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_UPLOAD = 5 * 1024 * 1024;

export async function mediaRoutes(app: FastifyInstance) {
  mkdirSync(env.uploadDir, { recursive: true });

  app.post('/api/media', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const file = await req.file({ limits: { fileSize: MAX_UPLOAD, files: 1 } }).catch(() => undefined);
    if (!file) return reply.code(400).send({ error: 'INVALID', message: '이미지 파일을 골라 주세요' });
    if (!ALLOWED.has(file.mimetype)) return reply.code(400).send({ error: 'INVALID', message: 'jpg, png, webp 이미지만 올릴 수 있어요' });
    const buf = await file.toBuffer().catch(() => null);
    if (!buf || file.file.truncated) return reply.code(413).send({ error: 'TOO_LARGE', message: '5MB까지 올릴 수 있어요' });
    let out: Buffer;
    try {
      // 실제 이미지인지 디코딩으로 확인하고, 1600px 안으로 줄여 webp로 다시 저장 (메타데이터 제거)
      out = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch {
      return reply.code(400).send({ error: 'INVALID', message: '이미지를 읽을 수 없어요. 다른 파일로 해 주세요' });
    }
    const name = `${randomUUID()}.webp`;
    await writeFile(join(env.uploadDir, name), out);
    const m = await db.media.create({ data: { uploaderId: user.id, kind: 'IMAGE', path: name, mime: 'image/webp', size: out.length } });
    return reply.code(201).send({ id: m.id, url: `/media/${name}` });
  });
}
