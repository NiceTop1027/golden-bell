import { groupSubjects, useSubjects } from '../lib/subjects.ts';

/** 과목 고르기 목록: 관리자가 정한 묶음별로. 고른 값이 목록에 없으면(불러오는 중 등) 그대로 보여 줌 */
export function SubjectOptions({ current }: { current?: string }) {
  const subjects = useSubjects();
  const known = !current || (subjects ?? []).some((s) => s.name === current);
  return (
    <>
      {!known && <option value={current}>{current}</option>}
      {groupSubjects(subjects ?? []).map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
