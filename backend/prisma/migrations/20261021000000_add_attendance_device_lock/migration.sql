
CREATE TABLE "AttendanceDeviceLock" (
    "id" UUID NOT NULL,
    "attendanceSessionId" UUID NOT NULL,
    "deviceTokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDeviceLock_pkey"
        PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceDeviceLock_attendanceSessionId_deviceTokenHash_key"
    ON "AttendanceDeviceLock"("attendanceSessionId", "deviceTokenHash");

CREATE INDEX "AttendanceDeviceLock_attendanceSessionId_idx"
    ON "AttendanceDeviceLock"("attendanceSessionId");

ALTER TABLE "AttendanceDeviceLock"
    ADD CONSTRAINT "AttendanceDeviceLock_attendanceSessionId_fkey"
    FOREIGN KEY ("attendanceSessionId")
    REFERENCES "AttendanceSession"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "AttendanceDeviceLock" ENABLE ROW LEVEL SECURITY;
