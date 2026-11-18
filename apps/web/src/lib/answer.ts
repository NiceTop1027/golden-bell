import type { QuestionConfig } from '@gb/shared/types';

/** 정답을 한 줄로 */
export function answerSummary(cfg: QuestionConfig): string {
  switch (cfg.type) {
    case 'OX':
      return cfg.answer === 'O' ? 'O (맞아요)' : 'X (틀려요)';
    case 'CHOICE':
      return cfg.answers.map((i) => `${i + 1}. ${cfg.choices[i]}`).join(' · ');
    case 'SHORT':
    case 'INITIAL':
      return cfg.answers.join(' / ');
    case 'NUMBER':
      return `${cfg.answer.toLocaleString('ko-KR')}${cfg.unit ?? ''}${cfg.tolerance ? ` (±${cfg.tolerance})` : ''}`;
    case 'ORDER':
      return cfg.items.map((i) => i.text).join(' → ');
  }
}
