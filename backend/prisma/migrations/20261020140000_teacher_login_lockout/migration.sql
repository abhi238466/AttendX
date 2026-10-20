
CREATE TABLE "TeacherLoginLockout" (
    "email" VARCHAR(254) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherLoginLockout_pkey" PRIMARY KEY ("email")
);
