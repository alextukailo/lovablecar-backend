-- AlterTable
ALTER TABLE "TelegramOidcAttempt" ADD COLUMN     "browserStateEncrypted" TEXT,
ADD COLUMN     "confirmationCodeEncrypted" TEXT;
