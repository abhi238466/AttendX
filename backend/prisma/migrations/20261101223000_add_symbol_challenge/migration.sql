CREATE TYPE "SymbolChallengeAttemptStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'LOCKED'
);

CREATE TABLE "SymbolChallenge" (
    "id" UUID NOT NULL,
    "attendanceSessionId" UUID NOT NULL,
    "symbols" JSONB NOT NULL,
    "correctAnswers" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SymbolChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SymbolChallengeAttempt" (
    "id" UUID NOT NULL,
    "symbolChallengeId" UUID NOT NULL,
    "deviceTokenHash" VARCHAR(64) NOT NULL,
    "normalizedUniversityRollNumber" VARCHAR(80) NOT NULL,
    "wrongAttempts" INTEGER NOT NULL DEFAULT 0,
    "status" "SymbolChallengeAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "attendanceRecordId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SymbolChallengeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SymbolChallenge_attendanceSessionId_key"
ON "SymbolChallenge"("attendanceSessionId");

CREATE INDEX "SymbolChallenge_expiresAt_idx"
ON "SymbolChallenge"("expiresAt");

CREATE UNIQUE INDEX "SymbolChallengeAttempt_attendanceRecordId_key"
ON "SymbolChallengeAttempt"("attendanceRecordId");

CREATE INDEX "SymbolChallengeAttempt_symbolChallengeId_status_idx"
ON "SymbolChallengeAttempt"("symbolChallengeId", "status");

CREATE INDEX "SymbolChallengeAttempt_normalizedUniversityRollNumber_idx"
ON "SymbolChallengeAttempt"("normalizedUniversityRollNumber");

CREATE UNIQUE INDEX "SymbolChallengeAttempt_symbolChallengeId_deviceTokenHash_key"
ON "SymbolChallengeAttempt"("symbolChallengeId", "deviceTokenHash");

ALTER TABLE "SymbolChallenge"
ADD CONSTRAINT "SymbolChallenge_attendanceSessionId_fkey"
FOREIGN KEY ("attendanceSessionId")
REFERENCES "AttendanceSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SymbolChallengeAttempt"
ADD CONSTRAINT "SymbolChallengeAttempt_symbolChallengeId_fkey"
FOREIGN KEY ("symbolChallengeId")
REFERENCES "SymbolChallenge"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SymbolChallengeAttempt"
ADD CONSTRAINT "SymbolChallengeAttempt_attendanceRecordId_fkey"
FOREIGN KEY ("attendanceRecordId")
REFERENCES "AttendanceRecord"("id")
ON DELETE SET NULL ON UPDATE CASCADE;