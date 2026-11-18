import { useEffect, useState } from 'react';
import type { SubjectDTO } from '@gb/shared/types';
import { api } from './api.ts';

// 과목 목록은 관리자가 고치므로 서버에서 받아 한 번만 들고 있고, 과목 관리에서 바꾸면 다시 받음
let cache: Promise<SubjectDTO[]> | null = null;
const listeners = new Set<(s: SubjectDTO[]) => void>();

export function loadSubjects(force = false) {
  if (!cache || force) {
    const p = api<SubjectDTO[]>('/api/subjects');
    cache = p;
    p.then((s) => listeners.forEach((l) => l(s))).catch(() => {
      if (cache === p) cache = null;
    });
  }
  return cache;
}

export function useSubjects() {
  const [subjects, setSubjects] = useState<SubjectDTO[] | null>(null);
  useEffect(() => {
    listeners.add(setSubjects);
    void loadSubjects()
      .then(setSubjects)
      .catch(() => {});
    return () => {
      listeners.delete(setSubjects);
    };
  }, []);
  return subjects;
}

/** 묶음(처음 나온 순서) → 그 안의 과목(목록 순서) */
export function groupSubjects(list: SubjectDTO[]) {
  const groups: { label: string; items: SubjectDTO[] }[] = [];
  for (const s of list) {
    let g = groups.find((x) => x.label === s.group);
    if (!g) groups.push((g = { label: s.group, items: [] }));
    g.items.push(s);
  }
  return groups;
}
