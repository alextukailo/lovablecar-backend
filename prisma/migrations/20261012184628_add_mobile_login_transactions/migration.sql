-- CreateEnum
CREATE TYPE "MobileLoginStatus" AS ENUM ('PENDING', 'APPROVED', 'CONSUMED');

-- CreateTable
CREATE TABLE "MobileLoginTransaction" (
    "id" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "status" "MobileLoginStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileLoginTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobileLoginTransaction_expiresAt_idx" ON "MobileLoginTransaction"("expiresAt");

-- CreateIndex
CREATE INDEX "MobileLoginTransaction_status_expiresAt_idx" ON "MobileLoginTransaction"("status", "expiresAt");
