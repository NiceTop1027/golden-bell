import { useEffect, useRef, useState } from 'react';
import { DEFAULT_TIME_SEC, type PublicQuestion, type QuestionConfig, type StageView } from '@gb/shared/types';
import { PhonePreview } from '../pages/Play.tsx';
import { QuestionScreen } from '../pages/Stage.tsx';
import { Segmented } from './Shell.tsx';

/** 출제 화면 상태로 실제 학생·무대 화면에 넣을 공개용 문제를 만듦 (정답 없음) */
export function toPublicQuestion(cfg: QuestionConfig, body: string, mediaUrl: string | null): PublicQuestion {
  const q: PublicQuestion = { cqId: 'preview', type: cfg.type, round: 'MAIN', kind: 'NORMAL', body: body || '문제를 입력하면 여기에 보여요', mediaUrl };
  if (cfg.type === 'CHOICE') {
    q.choices = cfg.choices.map((text, i) => ({ i, text }));
    q.numbered = true;
  }
  if (cfg.type === 'INITIAL') q.hint = cfg.hint;
  if (cfg.type === 'SHORT' && cfg.showLength) q.length = [...(cfg.answers[0] ?? '')].length;
  if (cfg.type === 'NUMBER' && cfg.unit) q.unit = cfg.unit;
  // 학생에게는 섞어서 보여 주므로 미리보기도 맞는 순서가 드러나지 않게 돌려서
  if (cfg.type === 'ORDER') q.items = cfg.items.length > 1 ? [...cfg.items.slice(1), cfg.items[0]!].reverse() : cfg.items;
  return q;
}

function stageViewFor(seconds: number): StageView {
  return {
    contestId: 'preview',
    title: '미리보기',
    phase: 'READING',
    pausedFrom: null,
    index: 1,
    total: 30,
    question: null,
    timer: { endsAt: null, paused: false, remainingMs: null, durationMs: seconds * 1000, readingEndsAt: null },
    aliveCount: 87,
    joinedCount: 87,
    reveal: null,
    result: null,
    finish: null,
    joinCode: '000000',
    progress: { submitted: 0, targets: 87, alive: 87, connected: 87 },
    aliveNames: null,
    showSubmitCount: true,
  };
}

/** 고정 크기 화면을 주어진 폭에 맞게 축소 */
function Scaled({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e!.contentRect.width / w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className="relative w-full overflow-hidden" style={{ height: h * scale }}>
      <div className="pointer-events-none absolute top-0 left-0 origin-top-left select-none" style={{ width: w, height: h, transform: `scale(${scale})` }} inert>
        {children}
      </div>
    </div>
  );
}

export function QuestionPreview({ cfg, body, mediaUrl, timeLimitSec }: { cfg: QuestionConfig; body: string; mediaUrl: string | null; timeLimitSec: number | null }) {
  const [tab, setTab] = useState<'phone' | 'stage'>('phone');
  const q = toPublicQuestion(cfg, body, mediaUrl);
  const seconds = timeLimitSec ?? DEFAULT_TIME_SEC[cfg.type];
  const stageLong = body.length > 40;
  const longChoice = cfg.type === 'CHOICE' && cfg.choices.some((c) => [...c].length > 12);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-bold text-grey-700">미리보기</h2>
        <Segmented
          label="미리보기 화면"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'phone', label: '학생 폰' },
            { value: 'stage', label: '무대 화면' },
          ]}
        />
      </div>
      {tab === 'phone' ? (
        <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[32px] border-[6px] border-grey-900 bg-grey-100">
          <Scaled w={390} h={720}>
            <PhonePreview q={q} seconds={seconds} />
          </Scaled>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-grey-200 bg-grey-100">
          <Scaled w={1920} h={1080}>
            <div className="h-full w-full bg-grey-100">
              <QuestionScreen view={stageViewFor(seconds)} q={q} />
            </div>
          </Scaled>
        </div>
      )}
      {(stageLong || longChoice) && (
        <ul className="flex flex-col gap-1.5 text-sm font-semibold text-grey-800">
          {stageLong && <li className="rounded-[10px] bg-amber-50 px-3 py-2">문제가 40자를 넘어 무대에서 글씨가 조금 작아져요.</li>}
          {longChoice && <li className="rounded-[10px] bg-amber-50 px-3 py-2">12자가 넘는 보기는 무대에서 두 줄이 될 수 있어요.</li>}
        </ul>
      )}
    </div>
  );
}
