/*
  Warnings:

  - You are about to drop the `TelegramLinkToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TelegramLinkToken" DROP CONSTRAINT "TelegramLinkToken_userId_fkey";

-- DropTable
DROP TABLE "TelegramLinkToken";

-- CreateTable
CREATE TABLE "MileageReading" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "mileage" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TELEGRAM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MileageReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MileageReminder" (
    "carId" TEXT NOT NULL,
    "nextDueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pendingSince" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "lastSubmittedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),

    CONSTRAINT "MileageReminder_pkey" PRIMARY KEY ("carId")
);

-- CreateIndex
CREATE INDEX "MileageReading_carId_createdAt_idx" ON "MileageReading"("carId", "createdAt");

-- CreateIndex
CREATE INDEX "MileageReminder_nextDueAt_idx" ON "MileageReminder"("nextDueAt");

-- AddForeignKey
ALTER TABLE "MileageReading" ADD CONSTRAINT "MileageReading_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MileageReminder" ADD CONSTRAINT "MileageReminder_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
