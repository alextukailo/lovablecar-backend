-- CreateTable
CREATE TABLE "TelegramLoginReplay" (
    "id" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLoginReplay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLoginReplay_payloadHash_key" ON "TelegramLoginReplay"("payloadHash");

-- CreateIndex
CREATE INDEX "TelegramLoginReplay_expiresAt_idx" ON "TelegramLoginReplay"("expiresAt");
