-- CreateEnum
CREATE TYPE "CustomNotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "CustomNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "CustomNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "telegramMessageId" INTEGER,
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomNotification_userId_scheduledAt_idx" ON "CustomNotification"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "CustomNotification_status_scheduledAt_idx" ON "CustomNotification"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "CustomNotification" ADD CONSTRAINT "CustomNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
