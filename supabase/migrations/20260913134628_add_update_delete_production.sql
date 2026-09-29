/*
# Add Update and Delete for Production Runs

## Overview
Adds the ability to update or delete a production run. Deleting a production run
reverses its effects: restores raw material quantities, removes the deduction
transactions, and removes the finished goods transaction. Updating a production
run deletes the old one and logs a new one with the updated values.

## Changes

### 1. Add linked_production_id to raw_material_transactions
- Optional FK to finished_goods_transactions so we can find which deduction
  transactions belong to a given production run.

### 2. Update log_production RPC to set linked_production_id
- The deduction transactions now reference the finished_goods_transactions row.

### 3. Add reverse_production RPC
- Given a finished_goods_transactions id (type = 'production'), reverses:
  - Restores raw material quantities for linked deduction transactions
  - Deletes the linked raw_material_transactions rows
  - Deletes the finished_goods_transactions row
- Validates ownership via auth.uid()

### 4. Add update_production RPC
- Reverses the old production run, then logs a new one with updated qty/date.
*/

-- Step 1: Add linked_production_id column to raw_material_transactions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'raw_material_transactions' AND column_name = 'linked_production_id'
  ) THEN
    ALTER TABLE raw_material_transactions ADD COLUMN linked_production_id uuid;
  END IF;
END $$;

-- Step 2: Update log_production to set linked_production_id
CREATE OR REPLACE FUNCTION log_production(
  p_product_id uuid,
  p_qty_produced numeric,
  p_production_date date DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_date date := COALESCE(p_production_date, CURRENT_DATE);
  v_recipe record;
  v_product_name text;
  v_fgt_id uuid;
BEGIN
  SELECT name INTO v_product_name FROM products WHERE id = p_product_id AND user_id = auth.uid();
  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT false, 'Product not found'::text;
    RETURN;
  END IF;

  FOR v_recipe IN
    SELECT ri.material_id, ri.qty_required, rm.current_qty, rm.name
    FROM recipe_items ri
    JOIN raw_materials rm ON rm.id = ri.material_id AND rm.user_id = auth.uid()
    WHERE ri.product_id = p_product_id AND ri.user_id = auth.uid()
  LOOP
    IF v_recipe.current_qty < (v_recipe.qty_required * p_qty_produced) THEN
      RETURN QUERY SELECT false, 'Insufficient stock of ' || v_recipe.name || ' (need ' || (v_recipe.qty_required * p_qty_produced) || ', have ' || v_recipe.current_qty || ')'::text;
      RETURN;
    END IF;
  END LOOP;

  -- Add to finished goods stock first so we can link deductions to it
  INSERT INTO finished_goods_transactions (product_id, type, qty, date)
  VALUES (p_product_id, 'production', p_qty_produced, v_date)
  RETURNING id INTO v_fgt_id;

  FOR v_recipe IN
    SELECT ri.material_id, ri.qty_required
    FROM recipe_items ri
    WHERE ri.product_id = p_product_id AND ri.user_id = auth.uid()
  LOOP
    INSERT INTO raw_material_transactions (material_id, type, qty, reason, date, linked_production_id)
    VALUES (v_recipe.material_id, 'production-deduction', -(v_recipe.qty_required * p_qty_produced), 'Production: ' || p_qty_produced || ' x ' || v_product_name, v_date, v_fgt_id);

    UPDATE raw_materials
    SET current_qty = current_qty - (v_recipe.qty_required * p_qty_produced),
        updated_at = now()
    WHERE id = v_recipe.material_id AND user_id = auth.uid();
  END LOOP;

  RETURN QUERY SELECT true, 'Production logged: ' || p_qty_produced || ' x ' || v_product_name::text;
  RETURN;
END;
$$;

-- Step 3: reverse_production RPC
CREATE OR REPLACE FUNCTION reverse_production(
  p_fgt_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_fgt record;
  v_recipe record;
  v_deduction record;
BEGIN
  SELECT * INTO v_fgt FROM finished_goods_transactions
  WHERE id = p_fgt_id AND user_id = auth.uid() AND type = 'production';

  IF v_fgt IS NULL THEN
    RAISE EXCEPTION 'Production run not found';
  END IF;

  -- Restore raw material quantities for linked deductions
  FOR v_deduction IN
    SELECT id, material_id, qty
    FROM raw_material_transactions
    WHERE linked_production_id = p_fgt_id AND user_id = auth.uid()
  LOOP
    UPDATE raw_materials
    SET current_qty = current_qty + ABS(v_deduction.qty),
        updated_at = now()
    WHERE id = v_deduction.material_id AND user_id = auth.uid();
  END LOOP;

  -- Delete the linked deduction transactions
  DELETE FROM raw_material_transactions
  WHERE linked_production_id = p_fgt_id AND user_id = auth.uid();

  -- Delete the finished goods transaction
  DELETE FROM finished_goods_transactions
  WHERE id = p_fgt_id AND user_id = auth.uid();
END;
$$;

-- Step 4: update_production RPC
CREATE OR REPLACE FUNCTION update_production(
  p_fgt_id uuid,
  p_new_qty numeric,
  p_new_date date
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_fgt record;
  v_product_id uuid;
BEGIN
  SELECT * INTO v_fgt FROM finished_goods_transactions
  WHERE id = p_fgt_id AND user_id = auth.uid() AND type = 'production';

  IF v_fgt IS NULL THEN
    RETURN QUERY SELECT false, 'Production run not found'::text;
    RETURN;
  END IF;

  v_product_id := v_fgt.product_id;

  -- Reverse the old production run
  PERFORM reverse_production(p_fgt_id);

  -- Log a new production run with updated values
  PERFORM log_production(v_product_id, p_new_qty, p_new_date);

  RETURN QUERY SELECT true, 'Production run updated'::text;
  RETURN;
END;
$$;
