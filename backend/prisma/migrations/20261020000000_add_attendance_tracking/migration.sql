
-- Add token type support for QR and text-code attendance.
CREATE TYPE "AttendanceTokenType" AS ENUM ('QR', 'TEXT_CODE');

CREATE TYPE "AttendanceAttemptOutcome" AS ENUM (
    'ACCEPTED',
    'INVALID_CODE',
    'EXPIRED_CODE',
    'SESSION_CLOSED',
    'OUTSIDE_RADIUS',
    'INACCURATE_LOCATION',
    'DUPLICATE',
    'INVALID_DETAILS',
    'RATE_LIMITED',
    'SUSPICIOUS'
);

ALTER TABLE "AttendanceSession"
    ADD COLUMN "attendanceWindowEndsAt" TIMESTAMP(3),
    ADD COLUMN "roomName" VARCHAR(100),
    ADD COLUMN "scheduledEndsAt" TIMESTAMP(3),
    ADD COLUMN "scheduledStartsAt" TIMESTAMP(3),
    ADD COLUMN "subjectName" VARCHAR(150);

ALTER TABLE "QrCodeToken"
    ADD COLUMN "tokenType" "AttendanceTokenType" NOT NULL DEFAULT 'QR';

CREATE TABLE "AttendanceAttempt" (
    "id" UUID NOT NULL,
    "attendanceSessionId" UUID NOT NULL,
    "normalizedUniversityRollNumber" VARCHAR(80),
    "outcome" "AttendanceAttemptOutcome" NOT NULL,
    "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationAccuracyMeters" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceAttempt_attendanceSessionId_createdAt_idx"
    ON "AttendanceAttempt"("attendanceSessionId", "createdAt");

CREATE INDEX "AttendanceAttempt_attendanceSessionId_normalizedUniversityR_idx"
    ON "AttendanceAttempt"("attendanceSessionId", "normalizedUniversityRollNumber", "createdAt");

CREATE INDEX "AttendanceAttempt_outcome_createdAt_idx"
    ON "AttendanceAttempt"("outcome", "createdAt");

CREATE INDEX "AttendanceRecord_attendanceSessionId_section_status_idx"
    ON "AttendanceRecord"("attendanceSessionId", "section", "status");

CREATE INDEX "AttendanceRecord_attendanceSessionId_submittedAt_idx"
    ON "AttendanceRecord"("attendanceSessionId", "submittedAt");

CREATE INDEX "AttendanceSession_teacherId_startsAt_idx"
    ON "AttendanceSession"("teacherId", "startsAt");

CREATE INDEX "QrCodeToken_attendanceSessionId_tokenType_expiresAt_idx"
    ON "QrCodeToken"("attendanceSessionId", "tokenType", "expiresAt");



ALTER TABLE "AttendanceAttempt"
    ADD CONSTRAINT "AttendanceAttempt_attendanceSessionId_fkey"
    FOREIGN KEY ("attendanceSessionId")
    REFERENCES "AttendanceSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
