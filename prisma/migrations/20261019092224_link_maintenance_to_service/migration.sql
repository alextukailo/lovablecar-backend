-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

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
    "telegramMessageId" INTEGER,

    CONSTRAINT "MileageReminder_pkey" PRIMARY KEY ("carId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_userId_idx" ON "TelegramLinkToken"("userId");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_expiresAt_idx" ON "TelegramLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "MileageReading_carId_createdAt_idx" ON "MileageReading"("carId", "createdAt");

-- CreateIndex
CREATE INDEX "MileageReminder_nextDueAt_idx" ON "MileageReminder"("nextDueAt");

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MileageReading" ADD CONSTRAINT "MileageReading_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MileageReminder" ADD CONSTRAINT "MileageReminder_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;
