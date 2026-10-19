/*
  Warnings:

  - You are about to drop the `MileageReading` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MileageReminder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TelegramLinkToken` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[sourceServiceRecordId]` on the table `MaintenanceSchedule` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "MileageReading" DROP CONSTRAINT "MileageReading_carId_fkey";

-- DropForeignKey
ALTER TABLE "MileageReminder" DROP CONSTRAINT "MileageReminder_carId_fkey";

-- DropForeignKey
ALTER TABLE "TelegramLinkToken" DROP CONSTRAINT "TelegramLinkToken_userId_fkey";

-- AlterTable
ALTER TABLE "MaintenanceSchedule" ADD COLUMN     "sourceServiceRecordId" TEXT;

-- DropTable
DROP TABLE "MileageReading";

-- DropTable
DROP TABLE "MileageReminder";

-- DropTable
DROP TABLE "TelegramLinkToken";

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceSchedule_sourceServiceRecordId_key" ON "MaintenanceSchedule"("sourceServiceRecordId");

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_sourceServiceRecordId_fkey" FOREIGN KEY ("sourceServiceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
