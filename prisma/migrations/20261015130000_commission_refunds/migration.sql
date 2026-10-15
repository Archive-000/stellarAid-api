-- CreateEnum
CREATE TYPE "CommissionRefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "CommissionRefund" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "asset" "Asset" NOT NULL,
    "status" "CommissionRefundStatus" NOT NULL DEFAULT 'PENDING',
    "xdr" TEXT,
    "txHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRefund_commissionId_key" ON "CommissionRefund"("commissionId");

-- CreateIndex
CREATE INDEX "CommissionRefund_status_idx" ON "CommissionRefund"("status");

-- AddForeignKey
ALTER TABLE "CommissionRefund" ADD CONSTRAINT "CommissionRefund_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
