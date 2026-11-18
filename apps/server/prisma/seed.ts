// 개발·리허설용 시드: 관리자·선생님 계정, 승인된 문제, 편성을 잠근 리허설 대회
// 문제는 계획서 부록 A 예시를 바탕으로 만든 합성 데이터
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import type { QuestionConfig, QuestionType, Round } from '@gb/shared';
import { hashPassword, newToken } from '../src/lib/crypto.ts';
import { type CqSnapshot, resolveTimeLimit } from '../src/game/runtime.ts';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type Seed = {
  round: Round;
  subject: string;
  difficulty: 'EASY' | 'NORMAL' | 'HARD';
  body: string;
  config: QuestionConfig;
  explanation?: string;
};

const QUESTIONS: Seed[] = [
  { round: 'PRELIM', subject: '과학', difficulty: 'EASY', body: '1기압에서 물은 100℃에서 끓는다.', config: { type: 'OX', answer: 'O' }, explanation: '1기압에서 물의 끓는점은 100℃입니다.' },
  { round: 'PRELIM', subject: '사회', difficulty: 'EASY', body: '대한민국의 국회의원 임기는 5년이다.', config: { type: 'OX', answer: 'X' }, explanation: '국회의원 임기는 4년, 대통령 임기가 5년입니다.' },
  { round: 'PRELIM', subject: '과학', difficulty: 'EASY', body: '고래는 아가미로 숨을 쉰다.', config: { type: 'OX', answer: 'X' }, explanation: '고래는 포유류라서 폐로 숨을 쉽니다.' },
  { round: 'MAIN', subject: '역사', difficulty: 'NORMAL', body: '훈민정음을 창제한 왕은?', config: { type: 'CHOICE', choices: ['태조', '태종', '세종', '세조'], answers: [2] }, explanation: '세종이 1443년에 창제했습니다.' },
  { round: 'MAIN', subject: '사회', difficulty: 'EASY', body: '대한민국의 수도는?', config: { type: 'SHORT', answers: ['서울', '서울특별시'] } },
  { round: 'MAIN', subject: '과학', difficulty: 'NORMAL', body: '다음 중 행성이 아닌 것은?', config: { type: 'CHOICE', choices: ['수성', '금성', '달', '화성'], answers: [2] }, explanation: '달은 지구의 위성입니다.' },
  { round: 'REVIVAL', subject: '국어', difficulty: 'EASY', body: '"가는 말이 고와야 오는 말이 ○○" 빈칸에 들어갈 말은?', config: { type: 'SHORT', answers: ['곱다'] } },
  { round: 'MAIN', subject: '국어', difficulty: 'NORMAL', body: '한글을 만든 조선의 왕은?', config: { type: 'INITIAL', answers: ['세종대왕', '세종'], hint: 'ㅅㅈㄷㅇ' } },
  { round: 'MAIN', subject: '역사', difficulty: 'HARD', body: '훈민정음이 반포된 해는?', config: { type: 'NUMBER', answer: 1446, tolerance: 0, unit: '년' } },
  { round: 'MAIN', subject: '수학', difficulty: 'NORMAL', body: '정육면체의 모서리는 모두 몇 개인가?', config: { type: 'NUMBER', answer: 12, unit: '개' } },
  { round: 'FINAL', subject: '과학', difficulty: 'HARD', body: '원소 기호 Au로 나타내는 원소의 이름은?', config: { type: 'SHORT', answers: ['금', '금원소'] }, explanation: 'Au는 라틴어 aurum(금)에서 왔습니다.' },
  { round: 'SPARE', subject: '사회', difficulty: 'NORMAL', body: '우리나라 최초의 고대 국가는?', config: { type: 'SHORT', answers: ['고조선'] } },
  { round: 'SPARE', subject: '과학', difficulty: 'EASY', body: '빛의 삼원색이 아닌 것은?', config: { type: 'CHOICE', choices: ['빨강', '초록', '파랑', '노랑'], answers: [3] } },
];

async function main() {
  const adminPw = process.env.SEED_ADMIN_PASSWORD ?? 'goldenbell-admin';
  const teacherPw = process.env.SEED_TEACHER_PASSWORD ?? 'goldenbell-teacher';

  const admin = await db.user.upsert({
    where: { loginId: 'admin' },
    update: {},
    create: { loginId: 'admin', passwordHash: await hashPassword(adminPw), name: '관리자', role: 'ADMIN', mustChangePw: false },
  });
  const teacher = await db.user.upsert({
    where: { loginId: 'teacher1' },
    update: {},
    create: { loginId: 'teacher1', passwordHash: await hashPassword(teacherPw), name: '김선생', role: 'TEACHER', subject: '과학' },
  });

  const code = process.env.SEED_CODE ?? '261117';
  const title = process.env.SEED_TITLE ?? '제1회 덕영 골든벨 리허설';
  const existing = await db.contest.findUnique({ where: { joinCode: code } });
  if (existing) {
    console.log('이미 시드된 리허설 대회가 있습니다. 건너뜁니다.');
    return;
  }

  const contest = await db.contest.create({
    data: {
      title,
      heldOn: new Date('2026-12-22'),
      joinCode: code,
      stageKey: newToken(),
      rules: {},
      status: 'LOCKED',
      createdBy: admin.id,
      hosts: { create: [{ userId: admin.id }] },
    },
  });

  let order = 0;
  for (const s of QUESTIONS) {
    order += 1;
    const type = s.config.type as QuestionType;
    const { type: _t, ...config } = s.config;
    const q = await db.question.create({
      data: {
        authorId: teacher.id,
        subject: s.subject,
        difficulty: s.difficulty,
        type,
        body: s.body,
        config,
        explanation: s.explanation ?? null,
        status: 'APPROVED',
      },
    });
    const snapshot: CqSnapshot = {
      type,
      body: s.body,
      mediaUrl: null,
      config: s.config,
      explanation: s.explanation ?? null,
      timeLimitSec: resolveTimeLimit(s.round, type, null, null),
    };
    await db.contestQuestion.create({
      data: { contestId: contest.id, questionId: q.id, orderNo: order, round: s.round, snapshot },
    });
  }

  console.log('시드 완료');
  console.log(`  대회    ${contest.title} (코드 ${code})`);
  console.log(`  진행자  /host/${contest.id}`);
  console.log(`  무대    /stage/${contest.id}?key=${contest.stageKey}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
