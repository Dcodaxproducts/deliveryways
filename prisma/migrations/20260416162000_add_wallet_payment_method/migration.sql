-- Add wallet as a supported payment method for orders and payment transactions
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'WALLET';
