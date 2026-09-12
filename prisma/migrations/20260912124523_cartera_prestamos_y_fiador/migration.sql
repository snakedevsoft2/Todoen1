-- CreateEnum
CREATE TYPE "LoanFrequency" AS ENUM ('DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL');

-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'CARTERA';

-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "frequency" "LoanFrequency",
ADD COLUMN     "guarantorAddress" TEXT,
ADD COLUMN     "guarantorId" TEXT,
ADD COLUMN     "guarantorName" TEXT,
ADD COLUMN     "guarantorPhone" TEXT,
ADD COLUMN     "installments" INTEGER,
ADD COLUMN     "interestPct" INTEGER,
ADD COLUMN     "principal" INTEGER;
