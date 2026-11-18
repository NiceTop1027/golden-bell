#!/usr/bin/env python3
"""문제 출제·검수 API 점검 (계획서 14.1 권한·상태 흐름).

관리자 비밀번호는 .secrets/accounts.local.txt 에서 읽고 화면에 출력하지 않는다.
점검용 선생님 계정 2개를 만들고, 끝나면 비활성화한다.
사용: python3 tools/smoke/questions_api.py [http://localhost:4310]
"""
import io
import json
import secrets
import struct
import sys
import urllib.error
import urllib.request
import zlib
from http.cookiejar import CookieJar
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4310"
ROOT = Path(__file__).resolve().parents[2]
results = []


class Client:
    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def req(self, method, path, body=None, raw=None, ctype=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        r = urllib.request.Request(BASE + path, data=data, method=method)
        if body is not None:
            r.add_header("content-type", "application/json")
        if ctype:
            r.add_header("content-type", ctype)
        try:
            with self.op.open(r, timeout=10) as res:
                return res.status, json.loads(res.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not cond else ""))


def admin_password():
    lines = (ROOT / ".secrets/accounts.local.txt").read_text().splitlines()
    return [l.split()[2] for l in lines if l.split()[1:2] == ["admin"]][-1]


def png_bytes():
    # 2x2 빨간 PNG
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * 2 for _ in range(2))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def multipart(field, filename, content, mime):
    b = "----gb" + secrets.token_hex(8)
    body = io.BytesIO()
    body.write(f'--{b}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode())
    body.write(content)
    body.write(f"\r\n--{b}--\r\n".encode())
    return body.getvalue(), f"multipart/form-data; boundary={b}"


admin = Client()
s, _ = admin.req("POST", "/api/auth/login", {"loginId": "admin", "password": admin_password()})
check("관리자 로그인", s == 200, s)

suffix = secrets.token_hex(3)
s, created = admin.req("POST", "/api/admin/teachers", {"teachers": [
    {"name": "점검A", "loginId": f"smoke-a-{suffix}", "subject": "과학"},
    {"name": "점검B", "loginId": f"smoke-b-{suffix}", "subject": "역사"},
]})
check("선생님 계정 일괄 생성", s == 201 and len(created.get("created", [])) == 2, s)
acc = {c["loginId"]: c["initialPassword"] for c in created.get("created", [])}
s, _ = admin.req("POST", "/api/admin/teachers", {"teachers": [{"name": "중복", "loginId": f"smoke-a-{suffix}"}]})
check("이미 있는 아이디는 거절", s == 409, s)


def teacher(login):
    c = Client()
    c.req("POST", "/api/auth/login", {"loginId": login, "password": acc[login]})
    s, b = c.req("GET", "/api/questions")
    check(f"{login[:7]}: 첫 로그인은 비밀번호 변경 전 차단", s == 403 and b.get("error") == "MUST_CHANGE_PW", s)
    s, _ = c.req("PATCH", "/api/auth/password", {"current": acc[login], "next": "smoke-" + secrets.token_hex(8)})
    check(f"{login[:7]}: 비밀번호 변경", s == 200, s)
    return c


A = teacher(f"smoke-a-{suffix}")
B = teacher(f"smoke-b-{suffix}")

q = {"subject": "과학", "grade": 1, "difficulty": "EASY", "body": "물의 화학식은?", "config": {"type": "SHORT", "answers": ["H2O"]}, "explanation": "수소 2, 산소 1"}
s, bad = A.req("POST", "/api/questions", {**q, "config": {"type": "CHOICE", "choices": ["a", "b"], "answers": [4]}})
check("정답 번호가 보기보다 크면 거절", s == 400, s)

raw, ctype = multipart("file", "a.png", png_bytes(), "image/png")
s, media = A.req("POST", "/api/media", raw=raw, ctype=ctype)
check("이미지 업로드 (webp로 다시 저장)", s == 201 and media.get("url", "").endswith(".webp"), s)
raw2, ctype2 = multipart("file", "a.txt", b"not an image", "text/plain")
s, _ = A.req("POST", "/api/media", raw=raw2, ctype=ctype2)
check("이미지가 아닌 파일은 거절", s == 400, s)

s, qa = A.req("POST", "/api/questions", {**q, "mediaId": media.get("id")})
check("A 문제 작성 (작성중)", s == 201 and qa.get("status") == "DRAFT", s)
qid = qa.get("id")
s, _ = B.req("GET", f"/api/questions/{qid}")
check("B는 A의 문제를 볼 수 없음", s == 404, s)
s, _ = B.req("PATCH", f"/api/questions/{qid}", q)
check("B는 A의 문제를 고칠 수 없음", s == 404, s)
s, lst = B.req("GET", "/api/questions")
check("B의 목록에 A 문제 없음", s == 200 and all(i["id"] != qid for i in lst["items"]), s)

s, r = A.req("POST", f"/api/questions/{qid}/submit")
check("제출 → 제출됨", s == 200 and r.get("status") == "SUBMITTED", s)
s, _ = A.req("PATCH", f"/api/questions/{qid}", q)
check("검수 중에도 고칠 수 있음 (선생님=관리자 권한)", s == 200, s)
s, _ = A.req("GET", "/api/admin/teachers")
check("선생님 계정 관리는 관리자만", s == 403, s)
s, r = A.req("POST", f"/api/questions/{qid}/withdraw")
check("회수 → 작성중", s == 200 and r.get("status") == "DRAFT", s)
A.req("POST", f"/api/questions/{qid}/submit")
s, _ = admin.req("POST", f"/api/questions/{qid}/review", {"result": "REJECT", "note": ""})
check("반려는 사유 필수", s == 400, s)
s, r = admin.req("POST", f"/api/questions/{qid}/review", {"result": "REJECT", "note": "정답에 H₂O도 넣어 주세요"})
check("반려 → 반려됨 + 사유", s == 200 and r.get("status") == "REJECTED" and r.get("reviewNote"), s)
s, r = A.req("PATCH", f"/api/questions/{qid}", {**q, "config": {"type": "SHORT", "answers": ["H2O", "H₂O"]}})
check("반려된 문제 수정", s == 200, s)
A.req("POST", f"/api/questions/{qid}/submit")
s, r = admin.req("POST", f"/api/questions/{qid}/review", {"result": "APPROVE"})
check("승인 → 승인됨", s == 200 and r.get("status") == "APPROVED", s)
s, r = A.req("PATCH", f"/api/questions/{qid}", {**q, "body": "물의 화학식은 무엇인가?"})
check("승인된 문제를 선생님이 고치면 재검수", s == 200 and r.get("status") == "SUBMITTED", r.get("status"))
s, _ = A.req("DELETE", f"/api/questions/{qid}")
check("제출된 문제는 지울 수 없음", s == 409, s)
s, lst = admin.req("GET", "/api/questions?status=SUBMITTED")
check("관리자 검수 목록에 보임", s == 200 and any(i["id"] == qid for i in lst["items"]), s)
s, d = A.req("POST", "/api/questions", q)
s2, _ = A.req("DELETE", f"/api/questions/{d.get('id')}")
check("작성중 문제 삭제", s2 == 200, s2)

anon = Client()
s, _ = anon.req("GET", "/api/questions")
check("로그인 없이는 목록 불가", s == 401, s)

# 정리: 점검 계정 비활성화 (문제는 기록으로 남김)
s, ts = admin.req("GET", "/api/admin/teachers")
for t in ts if isinstance(ts, list) else []:
    if t["loginId"].endswith(suffix):
        admin.req("PATCH", f"/api/admin/teachers/{t['id']}", {"isActive": False})
s, _ = A.req("GET", "/api/questions")
check("비활성화하면 세션이 끊김", s == 401, s)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} 통과")
sys.exit(1 if failed else 0)
