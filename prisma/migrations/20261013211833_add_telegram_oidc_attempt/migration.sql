-- CreateTable
CREATE TABLE "TelegramOidcAttempt" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramOidcAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramOidcAttempt_stateHash_key" ON "TelegramOidcAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "TelegramOidcAttempt_transactionId_idx" ON "TelegramOidcAttempt"("transactionId");

-- CreateIndex
CREATE INDEX "TelegramOidcAttempt_expiresAt_idx" ON "TelegramOidcAttempt"("expiresAt");

-- AddForeignKey
ALTER TABLE "TelegramOidcAttempt" ADD CONSTRAINT "TelegramOidcAttempt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MobileLoginTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
