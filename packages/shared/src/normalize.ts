// 계획서 5.10 단답 정규화. 미리보기(선생님 화면)와 서버 채점이 같은 함수를 씀

const PUNCT = /[.,!?'"·()\-~‘’“”]/g;

/** 전각(Ａ, １, ！ 등) → 반각 */
function toHalfWidth(s: string): string {
  return s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
}

export function normalizeShort(input: string): string {
  let s = input.normalize('NFC');
  s = toHalfWidth(s);
  s = s.replace(/\s+/g, '');
  s = s.toLowerCase();
  s = s.replace(PUNCT, '');
  return s;
}

/** 숫자 답: 쉼표·공백 제거 후 숫자로. 읽을 수 없으면 null */
export function parseNumberAnswer(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = toHalfWidth(input).replace(/[,\s]/g, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 초성 힌트 자동 생성: "세종대왕" → "ㅅㅈㄷㅇ". 한글 외 글자는 그대로, 공백 유지 */
export function makeInitials(word: string): string {
  let out = '';
  for (const ch of word.normalize('NFC')) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) out += CHOSUNG[Math.floor(code / 588)];
    else out += ch;
  }
  return out;
}

/** 편집 거리 (짧은 문자열용) */
export function editDistance(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  const dp = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (A[i - 1] === B[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[B.length]!;
}

/** 유사 답안: 한두 글자만 다르거나, 정답을 포함하거나 정답에 포함되는 답 (5.10) */
export function isSimilar(normalizedAnswer: string, normalizedCorrect: string[]): boolean {
  if (!normalizedAnswer) return false;
  return normalizedCorrect.some((c) => {
    if (!c) return false;
    if (normalizedAnswer.includes(c) || (normalizedAnswer.length >= 2 && c.includes(normalizedAnswer))) return true;
    const limit = c.length <= 3 ? 1 : 2;
    return editDistance(normalizedAnswer, c) <= limit;
  });
}
