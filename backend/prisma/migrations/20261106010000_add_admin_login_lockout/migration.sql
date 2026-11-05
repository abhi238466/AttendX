CREATE TABLE "AdminLoginLockout" (
    "email" VARCHAR(254) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminLoginLockout_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "AdminLoginLockout_lockedUntil_idx"
ON "AdminLoginLockout"("lockedUntil");