-- Migration: Add contract_title and contract_clauses to companies
-- Run this in the Supabase SQL Editor

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_title'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_title TEXT DEFAULT 'CONFISSÃO DE DÍVIDA';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'contract_clauses'
  ) THEN
    ALTER TABLE companies ADD COLUMN contract_clauses JSONB DEFAULT '[]'::jsonb;
  END IF;
END;
$$;
