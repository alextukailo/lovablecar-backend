-- CreateEnum
CREATE TYPE "EngineType" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL', 'AUTOMATIC', 'CVT', 'DCT', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DrivetrainType" AS ENUM ('FWD', 'RWD', 'AWD', 'FOUR_WD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TimingSystemType" AS ENUM ('BELT', 'CHAIN', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('ENGINE_OIL', 'ENGINE_AIR_FILTER', 'CABIN_FILTER', 'FUEL_FILTER', 'SPARK_PLUGS', 'TRANSMISSION_OIL', 'TIMING_BELT', 'TIMING_CHAIN_INSPECTION', 'BRAKE_FLUID', 'COOLANT', 'HALDEX_OIL', 'HALDEX_FILTER', 'FRONT_DIFFERENTIAL_OIL', 'REAR_DIFFERENTIAL_OIL', 'TRANSFER_CASE_OIL', 'AUXILIARY_BELT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MaintenanceNotificationType" AS ENUM ('UPCOMING', 'DUE', 'OVERDUE');

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "drivetrainType" "DrivetrainType",
ADD COLUMN     "engineType" "EngineType",
ADD COLUMN     "timingSystemType" "TimingSystemType",
ADD COLUMN     "transmissionType" "TransmissionType";

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "customTitle" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalKm" INTEGER,
    "intervalMonths" INTEGER,
    "lastServiceMileage" INTEGER,
    "lastServiceDate" TIMESTAMP(3),
    "nextDueMileage" INTEGER,
    "nextDueDate" TIMESTAMP(3),
    "warningKm" INTEGER NOT NULL DEFAULT 1000,
    "warningDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceCompletion" (
    "id" TEXT NOT NULL,
    "maintenanceScheduleId" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceNotification" (
    "id" TEXT NOT NULL,
    "maintenanceScheduleId" TEXT NOT NULL,
    "type" "MaintenanceNotificationType" NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_carId_enabled_idx" ON "MaintenanceSchedule"("carId", "enabled");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_nextDueDate_idx" ON "MaintenanceSchedule"("nextDueDate");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_nextDueMileage_idx" ON "MaintenanceSchedule"("nextDueMileage");

-- CreateIndex
CREATE INDEX "MaintenanceCompletion_serviceRecordId_idx" ON "MaintenanceCompletion"("serviceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceCompletion_maintenanceScheduleId_serviceRecordId_key" ON "MaintenanceCompletion"("maintenanceScheduleId", "serviceRecordId");

-- CreateIndex
CREATE INDEX "MaintenanceNotification_sentAt_idx" ON "MaintenanceNotification"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceNotification_maintenanceScheduleId_cycleKey_type_key" ON "MaintenanceNotification"("maintenanceScheduleId", "cycleKey", "type");

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCompletion" ADD CONSTRAINT "MaintenanceCompletion_maintenanceScheduleId_fkey" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCompletion" ADD CONSTRAINT "MaintenanceCompletion_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceNotification" ADD CONSTRAINT "MaintenanceNotification_maintenanceScheduleId_fkey" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
