/*
  Warnings:

  - A unique constraint covering the columns `[legacyLocalId]` on the table `ServiceRecord` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ServiceRecord" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PLN',
ADD COLUMN     "legacyLocalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecord_legacyLocalId_key" ON "ServiceRecord"("legacyLocalId");
