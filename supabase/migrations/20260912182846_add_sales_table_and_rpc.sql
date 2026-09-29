/*
# Add Sales Tracking Table and RPC

## Overview
Creates a dedicated sales table to track sales transactions with revenue,
customer info, and payment method. Adds an RPC function to log a sale that
atomically creates a finished_goods_transactions record + a sales record.

## New Tables
1. **sales** — Sales transaction records
   - product_id (FK to products), qty, unit_price, total_amount,
     customer_name (optional), payment_method, date, notes,
     linked_transaction_id (FK to finished_goods_transactions), created_at

## New RPC Functions
1. **log_sale(product_uuid, qty, unit_price, sale_date, customer_name, payment_method, notes)**
   - Validates sufficient stock
   - Creates a finished_goods_transactions 'sale' record (deducts stock)
   - Creates a linked sales record with revenue
   - Returns the sales record id

## Security
- RLS enabled on sales table
- TO anon, authenticated (single-tenant, no sign-in)
- Full CRUD access
*/

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  customer_name text,
  payment_method text NOT NULL DEFAULT 'Cash',
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  linked_transaction_id uuid REFERENCES finished_goods_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sales" ON sales;
CREATE POLICY "anon_select_sales" ON sales FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sales" ON sales;
CREATE POLICY "anon_insert_sales" ON sales FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sales" ON sales;
CREATE POLICY "anon_update_sales" ON sales FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sales" ON sales;
CREATE POLICY "anon_delete_sales" ON sales FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);

-- ============================================================
-- RPC: log_sale
-- Records a sale: deducts finished goods stock + creates sales record
-- ============================================================
CREATE OR REPLACE FUNCTION log_sale(
  p_product_id uuid,
  p_qty numeric,
  p_unit_price numeric,
  p_sale_date date DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_payment_method text DEFAULT 'Cash',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_txn_id uuid;
  v_sale_id uuid;
  v_current_stock numeric(12,2);
  v_total_amount numeric(12,2);
  v_date date := COALESCE(p_sale_date, CURRENT_DATE);
BEGIN
  -- Check current stock
  SELECT COALESCE(SUM(CASE WHEN type = 'production' THEN qty ELSE -qty END), 0)
  INTO v_current_stock
  FROM finished_goods_transactions
  WHERE product_id = p_product_id;

  IF v_current_stock < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock (have %, need %)', v_current_stock, p_qty;
  END IF;

  v_total_amount := p_qty * p_unit_price;

  -- Create the finished goods transaction (deducts stock)
  INSERT INTO finished_goods_transactions (product_id, type, qty, reason, date)
  VALUES (p_product_id, 'sale', -p_qty, 'Sale: ' || p_qty || ' x ' || v_total_amount, v_date)
  RETURNING id INTO v_txn_id;

  -- Create the sales record
  INSERT INTO sales (product_id, qty, unit_price, total_amount, customer_name, payment_method, date, notes, linked_transaction_id)
  VALUES (p_product_id, p_qty, p_unit_price, v_total_amount, p_customer_name, p_payment_method, v_date, p_notes, v_txn_id)
  RETURNING id INTO v_sale_id;

  RETURN v_sale_id;
END;
$$;
