// 학생 참가 정보: 새로고침·재접속 시 자동 복귀용 (계획서 8.2: gb:{contestId}:token)
export type PlayerSession = { contestId: string; code: string; studentNo: string; name: string; token: string };

const read = <T,>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 사생활 보호 모드 등 */
  }
};

export const loadSession = (contestId: string) => read<PlayerSession>(`gb:${contestId}:session`);
export const saveSession = (s: PlayerSession) => {
  write(`gb:${s.contestId}:session`, s);
  write(`gb:${s.contestId}:token`, s.token);
  write('gb:last', { code: s.code, studentNo: s.studentNo, name: s.name });
};
export const lastJoin = () => read<{ code: string; studentNo: string; name: string }>('gb:last');
export const findSessionByCode = (code: string, studentNo: string): PlayerSession | null => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.endsWith(':session')) continue;
      const s = read<PlayerSession>(k);
      if (s && s.code === code && s.studentNo === studentNo) return s;
    }
  } catch {
    /* 무시 */
  }
  return null;
};
