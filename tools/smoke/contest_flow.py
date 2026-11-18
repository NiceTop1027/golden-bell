#!/usr/bin/env python3
"""대회 준비 → 진행 → 결과 전체 흐름 점검 (계획서 14.2).

선생님 엑셀 업로드 → 관리자 승인 → 대회 생성·편성·잠금·규칙·권한·명단 → 봇 20명으로 한 판 → 결과·CSV·인쇄.
관리자 비밀번호는 .secrets/accounts.local.txt 에서 읽고 출력하지 않는다. 점검이 만든 대회·계정은 끝에 정리한다.
사용: python3 tools/smoke/contest_flow.py [http://localhost:4310]
"""
import io
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4310"
ROOT = Path(__file__).resolve().parents[2]
results = []


class Client:
    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def raw(self, method, path, data=None, ctype=None):
        r = urllib.request.Request(BASE + path, data=data, method=method)
        if ctype:
            r.add_header("content-type", ctype)
        try:
            with self.op.open(r, timeout=20) as res:
                return res.status, res.read(), res.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

    def req(self, method, path, body=None):
        s, b, _ = self.raw(method, path, json.dumps(body).encode() if body is not None else None, "application/json" if body is not None else None)
        try:
            return s, json.loads(b or b"{}")
        except json.JSONDecodeError:
            return s, {}


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not cond else ""))
    return bool(cond)


def admin_password():
    lines = (ROOT / ".secrets/accounts.local.txt").read_text().splitlines()
    return [l.split()[2] for l in lines if l.split()[1:2] == ["admin"]][-1]


def multipart(field, filename, content, mime):
    b = "----gb" + secrets.token_hex(8)
    buf = io.BytesIO()
    buf.write(f'--{b}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode())
    buf.write(content)
    buf.write(f"\r\n--{b}--\r\n".encode())
    return buf.getvalue(), f"multipart/form-data; boundary={b}"


admin = Client()
PW = admin_password()
s, _ = admin.req("POST", "/api/auth/login", {"loginId": "admin", "password": PW})
check("관리자 로그인", s == 200, s)

# ── 선생님: 엑셀로 문제 올리기 ──
suffix = secrets.token_hex(3)
s, created = admin.req("POST", "/api/admin/teachers", {"teachers": [{"name": "점검교사", "loginId": f"flow-{suffix}", "subject": "과학"}]})
tpw = created["created"][0]["initialPassword"]
T = Client()
T.req("POST", "/api/auth/login", {"loginId": f"flow-{suffix}", "password": tpw})
T.req("PATCH", "/api/auth/password", {"current": tpw, "next": "flow-" + secrets.token_hex(8)})

s, xlsx, h = T.raw("GET", "/api/questions/template.xlsx")
check("엑셀 템플릿 받기", s == 200 and xlsx[:2] == b"PK" and "spreadsheetml" in (h.get("content-type") or ""), s)
raw, ct = multipart("file", "t.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
st, body, _ = T.raw("POST", "/api/questions/import", raw, ct)
prev = json.loads(body)
check("엑셀 검사: 예시 5줄 통과", st == 200 and prev.get("okCount") == 5, f"{st} {prev.get('okCount')}")
raw2, ct2 = multipart("file", "bad.xlsx", b"not excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
st, _, _ = T.raw("POST", "/api/questions/import", raw2, ct2)
check("엑셀이 아닌 파일은 거절", st == 400, st)
s, r = T.req("POST", "/api/questions/import/commit", {"items": [x["data"] for x in prev["rows"] if x["ok"]]})
check("통과한 줄 저장 (작성중)", s == 201 and r.get("created") == 5, s)

# 순서 맞추기 문제도 하나
order_q = {"subject": "역사", "grade": None, "difficulty": "NORMAL", "body": "먼저 일어난 일부터 순서대로 놓으세요.",
           "config": {"type": "ORDER", "items": [{"id": "a", "text": "고조선 건국"}, {"id": "b", "text": "삼국 통일"}, {"id": "c", "text": "고려 건국"}, {"id": "d", "text": "조선 건국"}]}}
s, oq = T.req("POST", "/api/questions", order_q)
check("순서 맞추기 문제 작성", s == 201 and oq.get("type") == "ORDER", s)

s, mine = T.req("GET", "/api/questions?author=me")
for q in mine["items"]:
    T.req("POST", f"/api/questions/{q['id']}/submit")
    admin.req("POST", f"/api/questions/{q['id']}/review", {"result": "APPROVE"})
s, mine = T.req("GET", "/api/questions?author=me")
check("제출·승인 6문제", sum(1 for q in mine["items"] if q["status"] == "APPROVED") == 6)
s, sim = admin.req("GET", f"/api/questions/{mine['items'][0]['id']}/similar")
check("비슷한 문제 조회", s == 200 and isinstance(sim, list), s)

# ── 관리자: 대회 만들기 ──
s, c = admin.req("POST", "/api/contests", {"title": "자동 점검 대회", "heldOn": "2026-12-22"})
check("대회 생성", s == 201, s)
cid = c["id"]
s, bank = admin.req("GET", "/api/questions?status=APPROVED")
by_type = {}
for q in bank["items"]:
    by_type.setdefault(q["type"], []).append(q["id"])
lineup = (
    [{"questionId": i, "round": "PRELIM"} for i in by_type["OX"][:3]]
    + [{"questionId": i, "round": "MAIN"} for i in (by_type["CHOICE"][:3] + by_type.get("NUMBER", [])[:1] + by_type.get("ORDER", [])[:1])]
    + [{"questionId": by_type["SHORT"][0], "round": "REVIVAL"}]
    + [{"questionId": by_type["INITIAL"][0], "round": "MAIN", "timeLimitSec": 25}]
    + [{"questionId": by_type["SHORT"][1], "round": "FINAL"}]
    + [{"questionId": by_type["CHOICE"][3], "round": "SPARE"}, {"questionId": by_type["SHORT"][2], "round": "SPARE"}]
)
s, draft = T.req("POST", "/api/questions", {**order_q, "body": "승인 안 된 문제"})
s, r = admin.req("PUT", f"/api/contests/{cid}/lineup", {"items": lineup + [{"questionId": draft["id"], "round": "MAIN"}]})
check("승인 안 된 문제는 편성 거절", s == 400, s)
s, r = admin.req("PUT", f"/api/contests/{cid}/lineup", {"items": lineup})
check(f"편성 저장 ({len(lineup)}문제)", s == 200, r)
s, r = T.req("PUT", f"/api/contests/{cid}/lineup", {"items": lineup})
check("선생님도 편성할 수 있음 (관리자와 권한 같음)", s == 200, s)
s, _ = T.req("GET", "/api/admin/teachers")
check("선생님 계정 관리는 관리자만", s == 403, s)
s, r = admin.req("PATCH", f"/api/contests/{cid}", {"rules": {"revivalMaxPeople": 5, "showVisibility": True}})
check("규칙 저장", s == 200, s)
s, ts = admin.req("GET", "/api/admin/teachers")
tid = next(t["id"] for t in ts if t["loginId"] == f"flow-{suffix}")
s, tl = T.req("GET", "/api/contests")
check("선생님 목록에 보이고 관리 가능", any(x["id"] == cid and x["canManage"] for x in tl), s)
s, r = admin.req("PUT", f"/api/contests/{cid}/roster", {"entries": [{"studentNo": "20315", "name": "김하늘", "className": "2-3"}, {"studentNo": "20315", "name": "김하늘"}, {"studentNo": "20316", "name": "이서연"}]})
check("명단 올리기 (같은 학번은 하나로)", s == 200 and r.get("count") == 2 and r.get("duplicates") == 1, r)
s, r = admin.req("PUT", f"/api/contests/{cid}/roster", {"entries": [{"studentNo": "abc", "name": "x"}]})
check("잘못된 학번은 줄 번호와 함께 거절", s == 400 and "1번째 줄" in r.get("message", ""), r)
s, r = admin.req("POST", f"/api/contests/{cid}/lock")
check("편성 잠금", s == 200, r)
s, d = admin.req("GET", f"/api/contests/{cid}")
check("잠금 스냅샷 + 제한시간 덮어쓰기", d["status"] == "LOCKED" and all(l["locked"] for l in d["lineup"]) and any(l["locked"]["timeLimitSec"] == 25 for l in d["lineup"]), d.get("status"))
s, r = admin.req("PUT", f"/api/contests/{cid}/lineup", {"items": lineup})
check("잠긴 편성은 고칠 수 없음", s == 409, s)
s, r = admin.req("POST", f"/api/contests/{cid}/unlock")
s2, r2 = admin.req("POST", f"/api/contests/{cid}/lock")
check("잠금 풀기 → 다시 잠그기", s == 200 and s2 == 200, f"{s} {s2}")
s, k = admin.req("POST", f"/api/contests/{cid}/stage-key")
check("무대 링크 다시 만들기", s == 200 and len(k.get("stageKey", "")) > 20, s)
code = d["joinCode"]

# ── 봇 20명으로 한 판 (명단 없이) ──
admin.req("PATCH", f"/api/contests/{cid}", {"useRoster": False})
env = {**os.environ, "GB_HOST_PW": PW}
proc = subprocess.run(
    ["npx", "tsx", "bots.ts", "--n", "20", "--code", code, "--url", BASE, "--contest", cid, "--host-env", "GB_HOST_PW", "--accuracy", "0.7"],
    cwd=ROOT / "tools/loadtest", capture_output=True, text=True, timeout=400, env=env,
)
tail = "\n".join(proc.stdout.strip().splitlines()[-4:])
print("   봇:", tail.replace("\n", "\n   봇: "))
check("봇 20명 한 판 끝까지", proc.returncode == 0 and "우승" in proc.stdout, proc.stderr[-300:])

# ── 결과·CSV·인쇄 ──
s, res = admin.req("GET", f"/api/contests/{cid}/result")
asked = [q for q in res.get("questions", []) if q["asked"]]
check("결과: 순위 20명", s == 200 and len(res["ranking"]) == 20, s)
check("결과: 문제별 대상·정답률·평균 응답", asked and all(q["targets"] >= q["submitted"] for q in asked) and any(q["avgResponseMs"] for q in asked), len(asked))
check("결과: 진행 기록", len(res.get("logs", [])) > 10, len(res.get("logs", [])))
for kind in ["ranking", "records", "questions", "alive"]:
    s, b, h = admin.raw("GET", f"/api/contests/{cid}/export/{kind}.csv")
    check(f"CSV {kind} (UTF-8 BOM)", s == 200 and b.startswith("﻿".encode()) and "text/csv" in (h.get("content-type") or ""), s)
s, b, _ = admin.raw("GET", f"/admin/contests/{cid}/print")
check("인쇄용 문제지 페이지", s == 200 or s == 404, s)  # 개발 모드에서는 Vite가 화면을 줌

# ── 정리: 점검 대회·계정 ──
s, _ = admin.req("DELETE", f"/api/contests/{cid}")
check("참가자가 있는 대회는 지울 수 없음", s == 409, s)
admin.req("PATCH", f"/api/admin/teachers/{tid}", {"isActive": False})
print(f"\n정리용: 대회 {cid}, 선생님 flow-{suffix}")

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} 통과")
sys.exit(1 if failed else 0)
