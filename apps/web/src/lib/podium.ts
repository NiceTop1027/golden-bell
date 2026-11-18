import type { PodiumPlace, Winner } from '@gb/shared/types';

/** 1위는 골든벨 노랑, 2위 회색, 3위 흰 바탕+테두리 (메달 색을 새로 들이지 않음, 회색 칸 위에서도 보이게) */
export const podiumTone = (rank: number) => (rank === 1 ? 'bg-amber text-grey-900' : rank === 2 ? 'bg-grey-200 text-grey-900' : 'bg-white text-grey-800 shadow-[inset_0_0_0_1.5px_var(--color-grey-300)]');

export const podiumLabel = (pl: PodiumPlace) => (pl.people.length > 1 ? `공동 ${pl.rank}위` : `${pl.rank}위`);

/** 이름을 max명까지, 넘으면 "외 N명". withNo면 학번을 괄호로 (진행자 화면만) */
export function namesOf(people: Winner[], max: number, withNo = false) {
  const shown = people.slice(0, max).map((p) => (withNo && p.studentNo ? `${p.name}(${p.studentNo})` : p.name));
  return people.length > max ? `${shown.join(', ')} 외 ${people.length - max}명` : shown.join(', ');
}
