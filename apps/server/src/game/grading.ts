// 계획서 5.10: 채점은 서버에서만
import {
  type Answer,
  type QuestionConfig,
  type QuestionType,
  normalizeShort,
  parseNumberAnswer,
} from '@gb/shared';

/** 제출 답 형식 검사. 형식이 틀리면 false (INVALID 오류) */
export function isValidAnswer(cfg: QuestionConfig, answer: Answer): boolean {
  switch (cfg.type) {
    case 'OX':
      return answer === 'O' || answer === 'X';
    case 'CHOICE':
      return typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < cfg.choices.length;
    case 'SHORT':
    case 'INITIAL':
      return typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 30;
    case 'NUMBER':
      return (typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 30) || typeof answer === 'number';
    case 'ORDER': {
      if (!Array.isArray(answer) || answer.length !== cfg.items.length) return false;
      const ids = new Set(cfg.items.map((i) => i.id));
      return new Set(answer).size === answer.length && answer.every((a) => ids.has(a));
    }
  }
}

export function grade(cfg: QuestionConfig, acceptedExtra: string[], answer: Answer): boolean {
  switch (cfg.type) {
    case 'OX':
      return answer === cfg.answer;
    case 'CHOICE':
      return typeof answer === 'number' && cfg.answers.includes(answer);
    case 'SHORT':
    case 'INITIAL': {
      if (typeof answer !== 'string') return false;
      const n = normalizeShort(answer);
      if (!n) return false;
      return cfg.answers.some((a) => normalizeShort(a) === n) || acceptedExtra.includes(n);
    }
    case 'NUMBER': {
      const n = parseNumberAnswer(answer as string | number);
      if (n === null) return false;
      return Math.abs(n - cfg.answer) <= (cfg.tolerance ?? 0) + 1e-9;
    }
    case 'ORDER':
      return Array.isArray(answer) && answer.join('|') === cfg.items.map((i) => i.id).join('|');
  }
}

/** 화면에 크게 띄울 정답 문구 */
export function answerText(cfg: QuestionConfig, numbered = true): string {
  switch (cfg.type) {
    case 'OX':
      return cfg.answer;
    case 'CHOICE':
      return cfg.answers.map((i) => (numbered ? `${i + 1}. ${cfg.choices[i]}` : cfg.choices[i])).join(' · ');
    case 'SHORT':
    case 'INITIAL':
      return cfg.answers[0] ?? '';
    case 'NUMBER': {
      const tol = cfg.tolerance ? ` (±${cfg.tolerance})` : '';
      return `${cfg.answer.toLocaleString('ko-KR')}${cfg.unit ?? ''}${tol}`;
    }
    case 'ORDER':
      return cfg.items.map((i) => i.text).join(' → ');
  }
}

/** 진행자의 정답 수정 인자를 검증해 새 config를 만듦. 형식이 틀리면 null */
export function applyAnswerChange(cfg: QuestionConfig, args: Record<string, unknown>): QuestionConfig | null {
  switch (cfg.type) {
    case 'OX':
      return args.answer === 'O' || args.answer === 'X' ? { ...cfg, answer: args.answer } : null;
    case 'CHOICE': {
      const a = args.answers;
      if (!Array.isArray(a) || a.length === 0) return null;
      if (!a.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < cfg.choices.length)) return null;
      return { ...cfg, answers: [...new Set(a as number[])].sort() };
    }
    case 'SHORT':
    case 'INITIAL': {
      const a = args.answers;
      if (!Array.isArray(a) || a.length === 0 || !a.every((x) => typeof x === 'string' && x.trim())) return null;
      return { ...cfg, answers: (a as string[]).map((x) => x.trim()) };
    }
    case 'NUMBER': {
      const n = typeof args.answer === 'number' ? args.answer : NaN;
      const tol = args.tolerance === undefined ? cfg.tolerance : Number(args.tolerance);
      if (!Number.isFinite(n) || (tol !== undefined && !(tol >= 0))) return null;
      return { ...cfg, answer: n, tolerance: tol };
    }
    case 'ORDER':
      return null;
  }
}

export const isTextType = (t: QuestionType) => t === 'SHORT' || t === 'INITIAL';
