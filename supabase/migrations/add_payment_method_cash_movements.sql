-- Migration: Add payment_method to cash_movements
-- Run this in the Supabase SQL Editor

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_movements' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE cash_movements ADD COLUMN payment_method TEXT DEFAULT '';
  END IF;
END;
$$;
