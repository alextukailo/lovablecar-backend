/*
  Warnings:

  - A unique constraint covering the columns `[browserStateHash]` on the table `MobileLoginTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MobileLoginTransaction" ADD COLUMN     "browserStateHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MobileLoginTransaction_browserStateHash_key" ON "MobileLoginTransaction"("browserStateHash");
