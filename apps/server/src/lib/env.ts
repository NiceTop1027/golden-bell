export const env = {
  port: Number(process.env.PORT ?? 4310),
  databaseUrl: process.env.DATABASE_URL ?? '',
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:5310',
  isProd: process.env.NODE_ENV === 'production',
  uploadDir: process.env.UPLOAD_DIR ?? new URL('../../uploads', import.meta.url).pathname,
};
if (!env.databaseUrl) throw new Error('DATABASE_URL이 없습니다 (.env 확인)');
