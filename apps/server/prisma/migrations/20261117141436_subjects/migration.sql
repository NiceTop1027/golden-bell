-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE INDEX "subjects_sort_order_idx" ON "subjects"("sort_order");

-- 기본 과목 (특성화고: 보통 교과 + IT·컴퓨터)
INSERT INTO "subjects" ("id", "name", "group_name", "sort_order") VALUES
  (gen_random_uuid(), '국어', '보통 교과', 0),
  (gen_random_uuid(), '수학', '보통 교과', 1),
  (gen_random_uuid(), '영어', '보통 교과', 2),
  (gen_random_uuid(), '사회', '보통 교과', 3),
  (gen_random_uuid(), '역사', '보통 교과', 4),
  (gen_random_uuid(), '과학', '보통 교과', 5),
  (gen_random_uuid(), '기술·가정', '보통 교과', 6),
  (gen_random_uuid(), '정보', '보통 교과', 7),
  (gen_random_uuid(), '도덕', '보통 교과', 8),
  (gen_random_uuid(), '음악', '보통 교과', 9),
  (gen_random_uuid(), '미술', '보통 교과', 10),
  (gen_random_uuid(), '체육', '보통 교과', 11),
  (gen_random_uuid(), '컴퓨터 일반', 'IT·컴퓨터', 12),
  (gen_random_uuid(), '프로그래밍', 'IT·컴퓨터', 13),
  (gen_random_uuid(), '네트워크', 'IT·컴퓨터', 14),
  (gen_random_uuid(), '데이터베이스', 'IT·컴퓨터', 15),
  (gen_random_uuid(), '정보보안', 'IT·컴퓨터', 16),
  (gen_random_uuid(), '모의해킹', 'IT·컴퓨터', 17),
  (gen_random_uuid(), '웹', 'IT·컴퓨터', 18),
  (gen_random_uuid(), '인공지능', 'IT·컴퓨터', 19),
  (gen_random_uuid(), '상식', '기타', 20);

-- 이미 문제에 쓰인 과목 중 목록에 없는 것은 '기타'로
INSERT INTO "subjects" ("id", "name", "group_name", "sort_order")
SELECT gen_random_uuid(), q.subject, '기타', 1000 + ROW_NUMBER() OVER (ORDER BY q.subject)
FROM (SELECT DISTINCT subject FROM "questions") q
WHERE q.subject NOT IN (SELECT name FROM "subjects");
