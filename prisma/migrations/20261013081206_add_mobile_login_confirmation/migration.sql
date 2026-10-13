-- AlterTable
ALTER TABLE "MobileLoginTransaction" ADD COLUMN     "confirmationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "confirmationCodeHash" TEXT;
