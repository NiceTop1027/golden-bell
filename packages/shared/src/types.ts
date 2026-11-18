// 계획서 5.3·5.5·5.8·7.3·8.5 기준 공용 타입

export const QUESTION_TYPES = ['OX', 'CHOICE', 'SHORT', 'INITIAL', 'NUMBER', 'ORDER'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ROUNDS = ['PRELIM', 'MAIN', 'REVIVAL', 'FINAL', 'SPARE'] as const;
export type Round = (typeof ROUNDS)[number];

export const PHASES = [
  'LOBBY',
  'READING',
  'ANSWERING',
  'CLOSED',
  'REVEALED',
  'CONFIRMED',
  'PAUSED',
  'FINISHED',
] as const;
export type Phase = (typeof PHASES)[number];

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

/** 유형별 기본 제한시간(초). 골든벨(결승) 문제는 40초 */
export const DEFAULT_TIME_SEC: Record<QuestionType, number> = {
  OX: 10,
  CHOICE: 15,
  SHORT: 30,
  INITIAL: 30,
  NUMBER: 20,
  ORDER: 30,
};
export const FINAL_TIME_SEC = 40;

export const TYPE_LABEL: Record<QuestionType, string> = {
  OX: 'OX',
  CHOICE: '객관식',
  SHORT: '단답',
  INITIAL: '초성',
  NUMBER: '숫자',
  ORDER: '순서',
};

export const ROUND_LABEL: Record<Round, string> = {
  PRELIM: '예선',
  MAIN: '본선',
  REVIVAL: '패자부활',
  FINAL: '골든벨',
  SPARE: '예비',
};

// ── 문제 config (정답 포함, 서버·진행자만) ───────────────────────────
export type OXConfig = { answer: 'O' | 'X' };
export type ChoiceConfig = { choices: string[]; answers: number[]; shuffle?: boolean };
export type ShortConfig = { answers: string[]; showLength?: boolean };
export type InitialConfig = { answers: string[]; hint: string };
export type NumberConfig = { answer: number; tolerance?: number; unit?: string };
export type OrderConfig = { items: { id: string; text: string }[] };

export type QuestionConfig =
  | ({ type: 'OX' } & OXConfig)
  | ({ type: 'CHOICE' } & ChoiceConfig)
  | ({ type: 'SHORT' } & ShortConfig)
  | ({ type: 'INITIAL' } & InitialConfig)
  | ({ type: 'NUMBER' } & NumberConfig)
  | ({ type: 'ORDER' } & OrderConfig);

/** 학생이 제출하는 답. 객관식은 원래 보기 번호(0부터) */
export type Answer = 'O' | 'X' | number | string | string[];

// ── 대회 규칙 (5.5) ───────────────────────────────────────────────
export type Rules = {
  allowEdit: boolean; // 마감 전 답 수정
  timerStart: 'HOST' | 'AUTO';
  readSec: number; // 0–15
  autoClose: boolean; // 0초가 되면 자동 마감
  allEliminated: 'ASK' | 'AUTO_VOID';
  revivalEnabled: boolean;
  revivalMaxCount: number; // 1–3
  revivalMaxPeople: number | null; // null = 제한 없음
  oneLeft: 'SUGGEST_FINAL' | 'CONTINUE';
  exhausted: 'CO_WIN' | 'SUDDEN_DEATH';
  shuffleChoices: boolean;
  showSubmitCount: boolean;
  showAliveNamesAtMost: number;
  lateJoin: 'BEFORE_START' | 'ALWAYS';
  showWrongTop: boolean; // 단답 많이 나온 오답 표시
  showVisibility: boolean; // 화면 이탈 표시 (진행자 참고용, 자동 탈락 아님)
};

export const DEFAULT_RULES: Rules = {
  allowEdit: true,
  timerStart: 'HOST',
  readSec: 5,
  autoClose: true,
  allEliminated: 'ASK',
  revivalEnabled: true,
  revivalMaxCount: 1,
  revivalMaxPeople: null,
  oneLeft: 'SUGGEST_FINAL',
  exhausted: 'CO_WIN',
  shuffleChoices: false,
  showSubmitCount: true,
  showAliveNamesAtMost: 10,
  lateJoin: 'BEFORE_START',
  showWrongTop: true,
  showVisibility: true,
};

/** 서버가 마감 후 인정하는 유예 시간 */
export const SUBMIT_GRACE_MS = 500;

// ── 진행자 명령 ──────────────────────────────────────────────────
export const HOST_COMMANDS = [
  'START',
  'START_TIMER',
  'EXTEND',
  'CLOSE',
  'REVEAL',
  'SET_ANSWER',
  'ACCEPT_SIMILAR',
  'CONFIRM',
  'UNDO',
  'NEXT',
  'START_REVIVAL',
  'VOID',
  'PAUSE',
  'RESUME',
  'REVIVE',
  'ELIMINATE',
  'APPROVE_DEVICE',
  'REJECT_DEVICE',
  'FINISH',
] as const;
export type HostCommandType = (typeof HOST_COMMANDS)[number];

/** 이번 문제가 누구를 대상으로 하는지 */
export type QuestionKind = 'NORMAL' | 'REVIVAL' | 'FINAL' | 'SUDDEN';

// ── 화면별 스냅샷 (8.3, 8.5) ─────────────────────────────────────
export type PublicChoice = { i: number; text: string };

/** 학생·무대에 보내는 문제. 정답 없음 */
export type PublicQuestion = {
  cqId: string;
  type: QuestionType;
  round: Round;
  kind: QuestionKind;
  body: string;
  mediaUrl: string | null;
  choices?: PublicChoice[]; // CHOICE
  numbered?: boolean; // 보기 섞기를 켜면 무대는 번호 없이
  hint?: string; // INITIAL
  unit?: string; // NUMBER
  length?: number; // SHORT showLength
  items?: { id: string; text: string }[]; // ORDER (섞어서)
};

export type TimerView = {
  endsAt: number | null; // 서버 시계 기준
  paused: boolean;
  remainingMs: number | null; // 일시정지 중일 때
  durationMs: number; // 막대 비율 계산용
  readingEndsAt: number | null; // 자동 시작 읽기 시간
};

export type ChoiceStat = { i: number; text: string; count: number; correct: boolean };
export type RevealStats =
  | { type: 'OX'; o: number; x: number; none: number }
  | { type: 'CHOICE'; choices: ChoiceStat[]; none: number }
  | { type: 'TEXT'; correct: number; total: number; wrongTop: { answer: string; count: number }[] }
  | { type: 'NUMBER'; correct: number; total: number };

export type RevealView = {
  answerText: string; // 화면에 크게 띄울 정답
  explanation: string | null;
  stats: RevealStats;
};

export type ProgressView = { submitted: number; targets: number; alive: number; connected: number };

export type ResultCounts = {
  eliminatedNow: number;
  revivedNow: number;
  alive: number;
  /** 한 명 남은 골든벨 문제의 결과. 틀려도 탈락하지 않으므로 화면이 '생존'으로 오해하지 않게 따로 알림 */
  bell?: 'SUCCESS' | 'MISS';
};

export type Winner = { name: string; studentNo: string };

/** 시상: 3위 안 (같은 순위는 함께, 1·2·2·4처럼 건너뜀) */
export type PodiumPlace = { rank: number; people: Winner[] };

export type FinishView = {
  winners: Winner[];
  podium: PodiumPlace[];
  goldenBell: boolean; // 골든벨 문제를 맞혔는지
  bellMissed: boolean; // 골든벨 문제를 틀린 채 끝났는지 (틀려도 우승)
};

type BaseView = {
  contestId: string;
  title: string;
  phase: Phase;
  pausedFrom: Phase | null;
  index: number; // 본 문제 번호 (1부터, 예비·패자부활 제외)
  total: number;
  question: PublicQuestion | null;
  timer: TimerView;
  aliveCount: number;
  joinedCount: number;
  reveal: RevealView | null;
  result: ResultCounts | null;
  finish: FinishView | null;
};

export type MyStatus = 'ALIVE' | 'ELIMINATED';

export type PlayerView = BaseView & {
  me: {
    participantId: string;
    name: string;
    studentNo: string;
    status: MyStatus;
    eligible: boolean; // 이번 문제 대상자인지
    submitted: boolean;
    answer: Answer | null;
    correct: boolean | null; // REVEALED 이후에만
    eliminatedAtIndex: number | null;
    rank: number | null; // FINISHED 이후
  };
};

export type StageView = BaseView & {
  joinCode: string;
  progress: ProgressView;
  aliveNames: string[] | null; // 설정 인원 이하일 때만
  showSubmitCount: boolean;
};

export type HostAlert =
  | { id: string; kind: 'DEVICE'; participantId: string; studentNo: string; name: string }
  | { id: string; kind: 'SIMILAR'; answer: string; normalized: string; count: number }
  | { id: string; kind: 'DISCONNECTED'; count: number }
  | { id: string; kind: 'ONE_LEFT'; name: string };

export type HostParticipant = {
  id: string;
  studentNo: string;
  name: string;
  status: MyStatus;
  connected: boolean;
  submitted: boolean;
  correct: boolean | null;
  answer: Answer | null;
  hidden: boolean; // 학생 화면이 지금 다른 앱·탭으로 벗어나 있음
};

export type HostQuestion = PublicQuestion & {
  config: QuestionConfig;
  explanation: string | null;
  timeLimitSec: number;
  acceptedExtra: string[];
};

export type HostView = Omit<BaseView, 'question'> & {
  joinCode: string;
  stageKey: string;
  rules: Rules;
  question: HostQuestion | null;
  next: { index: number; round: Round; type: QuestionType; body: string; answerText: string } | null;
  progress: ProgressView;
  allowed: HostCommandType[];
  canJumpToFinal: boolean;
  canRevival: boolean;
  sparesLeft: number;
  participants: HostParticipant[];
  alerts: HostAlert[];
  lastAction: string | null;
};

// ── 소켓 이벤트 (8.4) ────────────────────────────────────────────
export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string; message?: string };

export type JoinError = 'NOT_FOUND' | 'NOT_IN_ROSTER' | 'JOIN_CLOSED' | 'DEVICE_CHANGE_PENDING' | 'INVALID';
export type SubmitError = 'CLOSED' | 'LOCKED' | 'NOT_ALIVE' | 'INVALID' | 'NOT_JOINED';

export type JoinAck = Ack<{ participantId: string; contestId: string; token: string; state: PlayerView }>;
export type SubmitAck = Ack<{ receivedAt: number }>;

export interface ClientToServerEvents {
  'time:ping': (p: { t0: number }, ack: (r: { serverNow: number }) => void) => void;
  'player:join': (
    p: { code: string; studentNo: string; name: string; token?: string },
    ack: (r: JoinAck) => void,
  ) => void;
  'player:submit': (p: { cqId: string; answer: Answer }, ack: (r: SubmitAck) => void) => void;
  'player:visibility': (p: { hidden: boolean }) => void;
  'host:attach': (p: { contestId: string }, ack: (r: Ack<{ state: HostView }>) => void) => void;
  'host:command': (
    p: { commandId: string; type: HostCommandType; args?: Record<string, unknown> },
    ack: (r: Ack) => void,
  ) => void;
  'stage:attach': (p: { contestId: string; stageKey: string }, ack: (r: Ack<{ state: StageView }>) => void) => void;
}

export interface ServerToClientEvents {
  state: (s: PlayerView | StageView | HostView) => void;
  progress: (p: ProgressView) => void;
  kicked: (p: { reason: string }) => void;
  'device:approved': (p: { token: string; participantId: string }) => void;
  'device:rejected': () => void;
}

// ── 문제 출제·검수 ──
/** 과목은 관리자가 고치는 목록(DB). 화면에서는 묶음(group)별로, sortOrder 순서로 보여 줌 */
export type SubjectDTO = { id: string; name: string; group: string; questionCount: number };
export type QuestionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export const STATUS_LABEL: Record<QuestionStatus, string> = {
  DRAFT: '작성중',
  SUBMITTED: '제출됨',
  APPROVED: '승인됨',
  REJECTED: '반려됨',
};
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: '쉬움', NORMAL: '보통', HARD: '어려움' };

export type QuestionDTO = {
  id: string;
  authorId: string;
  authorName: string;
  subject: string;
  grade: number | null;
  difficulty: Difficulty;
  type: QuestionType;
  body: string;
  mediaId: string | null;
  mediaUrl: string | null;
  config: QuestionConfig;
  explanation: string | null;
  timeLimitSec: number | null;
  authorNote: string | null;
  status: QuestionStatus;
  reviewNote: string | null;
  usedInContests: number;
  createdAt: string;
  updatedAt: string;
};

export type QuestionListDTO = {
  items: QuestionDTO[];
  counts: Record<QuestionStatus, number>;
  approvedBySubject: Record<string, number>;
};

export type TeacherDTO = {
  id: string;
  loginId: string;
  name: string;
  subject: string | null;
  isActive: boolean;
  mustChangePw: boolean;
  questionCount: number;
  createdAt: string;
};

// ── 대회 준비·결과 ──────────────────────────────────────────────
export type ContestStatus = 'DRAFT' | 'LOCKED' | 'LIVE' | 'FINISHED';
export const CONTEST_STATUS_LABEL: Record<ContestStatus, string> = {
  DRAFT: '편성 중',
  LOCKED: '준비 완료',
  LIVE: '진행 중',
  FINISHED: '끝남',
};

export type ContestSummaryDTO = {
  id: string;
  title: string;
  heldOn: string;
  status: ContestStatus;
  joinCode: string;
  stageKey: string | null; // 관리자·진행 권한자에게만
  participants: number;
  questions: number;
  canManage: boolean;
};

export type LineupItemDTO = {
  questionId: string;
  round: Round;
  timeLimitSec: number | null; // 편성에서 덮어쓴 값
  question: QuestionDTO;
  /** 잠글 때 복사한 내용 (잠근 뒤 원본이 바뀌어도 대회는 이것으로 진행) */
  locked: { body: string; config: QuestionConfig; mediaUrl: string | null; explanation: string | null; timeLimitSec: number } | null;
};

export type ContestDetailDTO = ContestSummaryDTO & {
  useRoster: boolean;
  rules: Rules;
  hostIds: string[];
  lineup: LineupItemDTO[];
  rosterCount: number;
  started: boolean;
};

export type RosterEntryDTO = { studentNo: string; name: string; className: string | null };

export type RankingRow = {
  rank: number;
  studentNo: string;
  name: string;
  status: 'ALIVE' | 'ELIMINATED';
  eliminatedAtIndex: number | null; // 화면 표시 번호
  revivedCount: number;
  correctCount: number;
  answeredCount: number;
};

export type QuestionStatRow = {
  cqId: string;
  orderNo: number;
  index: number | null; // 화면 번호 (예비·패자부활은 null)
  round: Round;
  type: QuestionType;
  body: string;
  answerText: string;
  voided: boolean;
  asked: boolean;
  targets: number;
  submitted: number;
  correct: number;
  avgResponseMs: number | null;
  choiceCounts: number[] | null;
  wrongTop: { answer: string; count: number }[];
};

export type ResultDTO = {
  contest: { id: string; title: string; heldOn: string; status: ContestStatus };
  ranking: RankingRow[];
  questions: QuestionStatRow[];
  logs: { at: string; action: string; log: string; actor: string | null }[];
};
