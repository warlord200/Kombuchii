-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "totalVolumeL" REAL NOT NULL,
    "starterVolumeL" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "targetPh" REAL NOT NULL DEFAULT 3.0,
    "roomOffsetC" REAL NOT NULL DEFAULT 3.0,
    "lat" REAL,
    "lon" REAL,
    "locationName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL,
    "days" JSONB NOT NULL,
    "scenarios" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prediction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_batchId_key" ON "Prediction"("batchId");
