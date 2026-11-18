// 계정 비밀번호를 무작위로 바꾸고 .secrets/accounts.local.txt 에만 기록 (화면·로그에 출력하지 않음)
// 사용: pnpm --filter @gb/server reset-password admin teacher1
import { appendFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/db.ts';
import { hashPassword } from '../src/lib/crypto.ts';

const out = fileURLToPath(new URL('../../../.secrets/accounts.local.txt', import.meta.url));
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('사용법: reset-password <아이디> [아이디...]');
  process.exit(1);
}
for (const loginId of ids) {
  const pw = randomBytes(12).toString('base64url');
  const r = await db.user.updateMany({ where: { loginId }, data: { passwordHash: await hashPassword(pw) } });
  if (r.count === 0) {
    console.error(`${loginId}: 없는 아이디`);
    continue;
  }
  await db.session.deleteMany({ where: { user: { loginId } } });
  appendFileSync(out, `${new Date().toISOString()}  ${loginId}  ${pw}\n`, { mode: 0o600 });
  chmodSync(out, 0o600);
  console.log(`${loginId}: 비밀번호를 바꿨어요 (.secrets/accounts.local.txt)`);
}
await db.$disconnect();
