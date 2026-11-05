CREATE TABLE "GeofenceZone" (
    "id" UUID NOT NULL,
    "areaName" VARCHAR(120) NOT NULL,
    "zoneName" VARCHAR(120) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeofenceZone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeofenceZone_isActive_idx"
ON "GeofenceZone"("isActive");

CREATE INDEX "GeofenceZone_areaName_idx"
ON "GeofenceZone"("areaName");