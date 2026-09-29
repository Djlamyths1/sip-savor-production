/*
# Fix: Stop auto-creating expenses from stock-in purchases

## Problem
The `log_stock_in` RPC function automatically created an expense record every time
raw materials were purchased. This is incorrect — raw material purchases are
inventory costs, not operating expenses. They should flow through inventory →
production cost → COGS, never through the expenses table.

## Changes
1. Replace `log_stock_in` function to ONLY:
   - Create the raw_material_transaction (stock-in record)
   - Update raw_materials.current_qty and unit_cost
   - Return the transaction ID (not an expense ID)
2. Remove the `linked_expense_id` update from the transaction
3. Delete existing expense records that were auto-created from stock-in
   (identified by having a non-null `linked_transaction_id`)

## Important
- Does NOT delete manually created operating expenses
- Does NOT touch raw_material_transactions (preserves stock history)
- The `linked_transaction_id` column on expenses is kept for backward
  compatibility but will no longer be populated by new stock-ins
*/

-- Replace log_stock_in to NOT create an expense
CREATE OR REPLACE FUNCTION log_stock_in(
  p_material_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_expense_date date DEFAULT NULL,
  p_vendor text DEFAULT NULL,
  p_payment_method text DEFAULT 'Cash',
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id uuid;
  v_date date := COALESCE(p_expense_date, CURRENT_DATE);
BEGIN
  -- Validate material exists
  IF NOT EXISTS (SELECT 1 FROM raw_materials WHERE id = p_material_id) THEN
    RAISE EXCEPTION 'Raw material not found';
  END IF;

  -- Create the raw material transaction (stock-in record only)
  INSERT INTO raw_material_transactions (material_id, type, qty, date)
  VALUES (p_material_id, 'stock-in', p_qty, v_date)
  RETURNING id INTO v_txn_id;

  -- Update the raw material stock and unit cost
  UPDATE raw_materials
  SET current_qty = current_qty + p_qty,
      unit_cost = p_unit_cost,
      updated_at = now()
  WHERE id = p_material_id;

  RETURN v_txn_id;
END;
$$;

-- Delete expense records that were auto-created from stock-in transactions
-- These have a non-null linked_transaction_id pointing to raw_material_transactions
DELETE FROM expenses WHERE linked_transaction_id IS NOT NULL;

-- Clear the linked_expense_id back-references on raw_material_transactions
-- (the expense rows they pointed to have been deleted)
UPDATE raw_material_transactions SET linked_expense_id = NULL WHERE linked_expense_id IS NOT NULL;
