/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `MaintenanceCompletion` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MaintenanceCompletion" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceCompletion_idempotencyKey_key" ON "MaintenanceCompletion"("idempotencyKey");
