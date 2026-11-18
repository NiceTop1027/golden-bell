-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'NORMAL', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('OX', 'CHOICE', 'SHORT', 'INITIAL', 'NUMBER', 'ORDER');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'LOCKED', 'LIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "Round" AS ENUM ('PRELIM', 'MAIN', 'REVIVAL', 'FINAL', 'SPARE');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ALIVE', 'ELIMINATED');

-- CreateEnum
CREATE TYPE "JudgedBy" AS ENUM ('AUTO', 'HOST');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "subject" TEXT,
    "must_change_pw" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" INTEGER,
    "difficulty" "Difficulty" NOT NULL,
    "type" "QuestionType" NOT NULL,
    "body" TEXT NOT NULL,
    "media_id" UUID,
    "config" JSONB NOT NULL,
    "explanation" TEXT,
    "time_limit_sec" INTEGER,
    "author_note" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contests" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "held_on" DATE NOT NULL,
    "join_code" CHAR(6) NOT NULL,
    "stage_key" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "use_roster" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContestStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_hosts" (
    "contest_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "contest_hosts_pkey" PRIMARY KEY ("contest_id","user_id")
);

-- CreateTable
CREATE TABLE "contest_questions" (
    "id" UUID NOT NULL,
    "contest_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order_no" INTEGER NOT NULL,
    "round" "Round" NOT NULL,
    "time_limit_sec" INTEGER,
    "snapshot" JSONB,
    "voided" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contest_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_entries" (
    "id" UUID NOT NULL,
    "contest_id" UUID NOT NULL,
    "student_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class_name" TEXT,

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "contest_id" UUID NOT NULL,
    "student_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT,
    "token_hash" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ALIVE',
    "eliminated_at" UUID,
    "eliminated_seq" INTEGER,
    "revived_count" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "contest_question_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "answer" JSONB NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "judged_by" "JudgedBy" NOT NULL DEFAULT 'AUTO',
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_runs" (
    "contest_id" UUID NOT NULL,
    "phase" TEXT NOT NULL,
    "current_cq_id" UUID,
    "ends_at" TIMESTAMP(3),
    "paused_remaining_ms" INTEGER,
    "revival_used" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_runs_pkey" PRIMARY KEY ("contest_id")
);

-- CreateTable
CREATE TABLE "host_logs" (
    "id" BIGSERIAL NOT NULL,
    "contest_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "questions_author_id_status_idx" ON "questions"("author_id", "status");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contests_join_code_key" ON "contests"("join_code");

-- CreateIndex
CREATE INDEX "contest_questions_contest_id_order_no_idx" ON "contest_questions"("contest_id", "order_no");

-- CreateIndex
CREATE UNIQUE INDEX "roster_entries_contest_id_student_no_key" ON "roster_entries"("contest_id", "student_no");

-- CreateIndex
CREATE UNIQUE INDEX "participants_contest_id_student_no_key" ON "participants"("contest_id", "student_no");

-- CreateIndex
CREATE INDEX "submissions_contest_question_id_idx" ON "submissions"("contest_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_participant_id_contest_question_id_key" ON "submissions"("participant_id", "contest_question_id");

-- CreateIndex
CREATE INDEX "host_logs_contest_id_created_at_idx" ON "host_logs"("contest_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_hosts" ADD CONSTRAINT "contest_hosts_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_hosts" ADD CONSTRAINT "contest_hosts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_questions" ADD CONSTRAINT "contest_questions_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_questions" ADD CONSTRAINT "contest_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contest_question_id_fkey" FOREIGN KEY ("contest_question_id") REFERENCES "contest_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_runs" ADD CONSTRAINT "contest_runs_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_logs" ADD CONSTRAINT "host_logs_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_logs" ADD CONSTRAINT "host_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
