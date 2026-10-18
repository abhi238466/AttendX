/*
  Warnings:

  - Added the required column `fullName` to the `Admin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "fullName" VARCHAR(120) NOT NULL;
