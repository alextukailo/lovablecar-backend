-- CreateTable
CREATE TABLE "ServiceAttachment" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CustomNotificationToServiceAttachment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CustomNotificationToServiceAttachment_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAttachment_storageKey_key" ON "ServiceAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "ServiceAttachment_serviceId_idx" ON "ServiceAttachment"("serviceId");

-- CreateIndex
CREATE INDEX "_CustomNotificationToServiceAttachment_B_index" ON "_CustomNotificationToServiceAttachment"("B");

-- AddForeignKey
ALTER TABLE "ServiceAttachment" ADD CONSTRAINT "ServiceAttachment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomNotificationToServiceAttachment" ADD CONSTRAINT "_CustomNotificationToServiceAttachment_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomNotificationToServiceAttachment" ADD CONSTRAINT "_CustomNotificationToServiceAttachment_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
