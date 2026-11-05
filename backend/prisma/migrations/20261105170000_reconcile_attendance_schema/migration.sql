
-- Add missing session closure timestamp.
ALTER TABLE "AttendanceSession"
ADD COLUMN "closedAt" TIMESTAMP(3);

-- Add an individual expiry timestamp for each student's symbol attempt.
ALTER TABLE "SymbolChallengeAttempt"
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Create session-specific symbol violation tracking.
CREATE TABLE "SymbolChallengeViolation" (
    "id" UUID NOT NULL,
    "attendanceSessionId" UUID NOT NULL,
    "deviceTokenHash" VARCHAR(64) NOT NULL,
    "normalizedUniversityRollNumber" VARCHAR(80) NOT NULL,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "lastViolationAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SymbolChallengeViolation_pkey" PRIMARY KEY ("id")
);

-- Create unique incident tracking for idempotent violation requests.
CREATE TABLE "SymbolChallengeViolationEvent" (
    "id" UUID NOT NULL,
    "attendanceSessionId" UUID NOT NULL,
    "deviceTokenHash" VARCHAR(64) NOT NULL,
    "incidentId" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymbolChallengeViolationEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes for violation tracking.
CREATE INDEX "SymbolChallengeViolation_attendanceSessionId_lockedAt_idx"
ON "SymbolChallengeViolation"("attendanceSessionId", "lockedAt");

CREATE INDEX "SymbolChallengeViolation_normalizedUniversityRollNumber_idx"
ON "SymbolChallengeViolation"("normalizedUniversityRollNumber");

CREATE UNIQUE INDEX "SymbolChallengeViolation_attendanceSessionId_deviceTokenHas_key"
ON "SymbolChallengeViolation"("attendanceSessionId", "deviceTokenHash");

CREATE INDEX "SymbolChallengeViolationEvent_attendanceSessionId_deviceTok_idx"
ON "SymbolChallengeViolationEvent"("attendanceSessionId", "deviceTokenHash", "createdAt");

CREATE UNIQUE INDEX "SymbolChallengeViolationEvent_attendanceSessionId_deviceTok_key"
ON "SymbolChallengeViolationEvent"("attendanceSessionId", "deviceTokenHash", "incidentId");

-- Preserve the indexes declared in the current Prisma schema.
CREATE INDEX "Teacher_fullName_idx"
ON "Teacher"("fullName");

CREATE INDEX "Teacher_phone_idx"
ON "Teacher"("phone");

CREATE INDEX "Teacher_email_idx"
ON "Teacher"("email");

-- Foreign keys for session-specific violation records.
ALTER TABLE "SymbolChallengeViolation"
ADD CONSTRAINT "SymbolChallengeViolation_attendanceSessionId_fkey"
FOREIGN KEY ("attendanceSessionId")
REFERENCES "AttendanceSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SymbolChallengeViolationEvent"
ADD CONSTRAINT "SymbolChallengeViolationEvent_attendanceSessionId_fkey"
FOREIGN KEY ("attendanceSessionId")
REFERENCES "AttendanceSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
