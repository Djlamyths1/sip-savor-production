/*
# Add Authentication: user_id Columns + Owner-Scoped RLS

## Overview
Converts the app from single-tenant (anon access) to multi-user (sign-in required).
Each user only sees and manages their own inventory data.

## Changes

### 1. Add user_id column to all data tables
- raw_materials: adds user_id (uuid, NOT NULL, DEFAULT auth.uid())
- raw_material_transactions: adds user_id
- products: adds user_id
- recipe_items: adds user_id
- finished_goods_transactions: adds user_id
- expenses: adds user_id
- sales: adds user_id

### 2. Backfill existing rows
- Sets user_id on existing rows to a placeholder so they remain accessible
  via execute_sql (privileged). These rows won't be visible to any
  authenticated user via RLS, but won't cause errors.

### 3. Replace RLS policies
- Drops all existing `anon_*` policies (which allowed anon + authenticated full access)
- Creates new owner-scoped policies (TO authenticated, USING auth.uid() = user_id)
- Each table gets 4 policies: SELECT, INSERT, UPDATE, DELETE
- INSERT policies use WITH CHECK (auth.uid() = user_id)
- The DEFAULT auth.uid() on user_id means inserts omitting user_id still work

### 4. Update RPC functions
- All SECURITY INVOKER functions now reference user_id columns
- log_stock_in, log_production, log_adjustment, log_finished_stock_out, log_sale
  insert with user_id = auth.uid() (via DEFAULT)
- get_stock_valuation, get_low_stock_materials, get_wastage_report,
  get_stock_movement_history filter by auth.uid()

## Security
- RLS remains enabled on all tables
- anon role loses all access (no more anon policies)
- Only authenticated users can read/write their own data
*/

-- ============================================================
-- Step 1: Add user_id columns
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_materials' AND column_name = 'user_id') THEN
    ALTER TABLE raw_materials ADD COLUMN user_id uuid;
    UPDATE raw_materials SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE raw_materials ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE raw_materials ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_material_transactions' AND column_name = 'user_id') THEN
    ALTER TABLE raw_material_transactions ADD COLUMN user_id uuid;
    UPDATE raw_material_transactions SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE raw_material_transactions ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE raw_material_transactions ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'user_id') THEN
    ALTER TABLE products ADD COLUMN user_id uuid;
    UPDATE products SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE products ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE products ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_items' AND column_name = 'user_id') THEN
    ALTER TABLE recipe_items ADD COLUMN user_id uuid;
    UPDATE recipe_items SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE recipe_items ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE recipe_items ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finished_goods_transactions' AND column_name = 'user_id') THEN
    ALTER TABLE finished_goods_transactions ADD COLUMN user_id uuid;
    UPDATE finished_goods_transactions SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE finished_goods_transactions ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE finished_goods_transactions ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'user_id') THEN
    ALTER TABLE expenses ADD COLUMN user_id uuid;
    UPDATE expenses SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE expenses ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'user_id') THEN
    ALTER TABLE sales ADD COLUMN user_id uuid;
    UPDATE sales SET user_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE user_id IS NULL;
    ALTER TABLE sales ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE sales ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

-- ============================================================
-- Step 2: Replace RLS policies — raw_materials
-- ============================================================
DROP POLICY IF EXISTS "anon_select_raw_materials" ON raw_materials;
DROP POLICY IF EXISTS "anon_insert_raw_materials" ON raw_materials;
DROP POLICY IF EXISTS "anon_update_raw_materials" ON raw_materials;
DROP POLICY IF EXISTS "anon_delete_raw_materials" ON raw_materials;

DROP POLICY IF EXISTS "select_own_raw_materials" ON raw_materials;
CREATE POLICY "select_own_raw_materials" ON raw_materials FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_raw_materials" ON raw_materials;
CREATE POLICY "insert_own_raw_materials" ON raw_materials FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_raw_materials" ON raw_materials;
CREATE POLICY "update_own_raw_materials" ON raw_materials FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_raw_materials" ON raw_materials;
CREATE POLICY "delete_own_raw_materials" ON raw_materials FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- raw_material_transactions
-- ============================================================
DROP POLICY IF EXISTS "anon_select_rmt" ON raw_material_transactions;
DROP POLICY IF EXISTS "anon_insert_rmt" ON raw_material_transactions;
DROP POLICY IF EXISTS "anon_update_rmt" ON raw_material_transactions;
DROP POLICY IF EXISTS "anon_delete_rmt" ON raw_material_transactions;

DROP POLICY IF EXISTS "select_own_rmt" ON raw_material_transactions;
CREATE POLICY "select_own_rmt" ON raw_material_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_rmt" ON raw_material_transactions;
CREATE POLICY "insert_own_rmt" ON raw_material_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_rmt" ON raw_material_transactions;
CREATE POLICY "update_own_rmt" ON raw_material_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rmt" ON raw_material_transactions;
CREATE POLICY "delete_own_rmt" ON raw_material_transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- products
-- ============================================================
DROP POLICY IF EXISTS "anon_select_products" ON products;
DROP POLICY IF EXISTS "anon_insert_products" ON products;
DROP POLICY IF EXISTS "anon_update_products" ON products;
DROP POLICY IF EXISTS "anon_delete_products" ON products;

DROP POLICY IF EXISTS "select_own_products" ON products;
CREATE POLICY "select_own_products" ON products FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_products" ON products;
CREATE POLICY "update_own_products" ON products FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_products" ON products;
CREATE POLICY "delete_own_products" ON products FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- recipe_items
-- ============================================================
DROP POLICY IF EXISTS "anon_select_recipe_items" ON recipe_items;
DROP POLICY IF EXISTS "anon_insert_recipe_items" ON recipe_items;
DROP POLICY IF EXISTS "anon_update_recipe_items" ON recipe_items;
DROP POLICY IF EXISTS "anon_delete_recipe_items" ON recipe_items;

DROP POLICY IF EXISTS "select_own_recipe_items" ON recipe_items;
CREATE POLICY "select_own_recipe_items" ON recipe_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_recipe_items" ON recipe_items;
CREATE POLICY "insert_own_recipe_items" ON recipe_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_recipe_items" ON recipe_items;
CREATE POLICY "update_own_recipe_items" ON recipe_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_recipe_items" ON recipe_items;
CREATE POLICY "delete_own_recipe_items" ON recipe_items FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- finished_goods_transactions
-- ============================================================
DROP POLICY IF EXISTS "anon_select_fgt" ON finished_goods_transactions;
DROP POLICY IF EXISTS "anon_insert_fgt" ON finished_goods_transactions;
DROP POLICY IF EXISTS "anon_update_fgt" ON finished_goods_transactions;
DROP POLICY IF EXISTS "anon_delete_fgt" ON finished_goods_transactions;

DROP POLICY IF EXISTS "select_own_fgt" ON finished_goods_transactions;
CREATE POLICY "select_own_fgt" ON finished_goods_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_fgt" ON finished_goods_transactions;
CREATE POLICY "insert_own_fgt" ON finished_goods_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_fgt" ON finished_goods_transactions;
CREATE POLICY "update_own_fgt" ON finished_goods_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_fgt" ON finished_goods_transactions;
CREATE POLICY "delete_own_fgt" ON finished_goods_transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- expenses
-- ============================================================
DROP POLICY IF EXISTS "anon_select_expenses" ON expenses;
DROP POLICY IF EXISTS "anon_insert_expenses" ON expenses;
DROP POLICY IF EXISTS "anon_update_expenses" ON expenses;
DROP POLICY IF EXISTS "anon_delete_expenses" ON expenses;

DROP POLICY IF EXISTS "select_own_expenses" ON expenses;
CREATE POLICY "select_own_expenses" ON expenses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_expenses" ON expenses;
CREATE POLICY "insert_own_expenses" ON expenses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_expenses" ON expenses;
CREATE POLICY "update_own_expenses" ON expenses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_expenses" ON expenses;
CREATE POLICY "delete_own_expenses" ON expenses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- sales
-- ============================================================
DROP POLICY IF EXISTS "anon_select_sales" ON sales;
DROP POLICY IF EXISTS "anon_insert_sales" ON sales;
DROP POLICY IF EXISTS "anon_update_sales" ON sales;
DROP POLICY IF EXISTS "anon_delete_sales" ON sales;

DROP POLICY IF EXISTS "select_own_sales" ON sales;
CREATE POLICY "select_own_sales" ON sales FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sales" ON sales;
CREATE POLICY "insert_own_sales" ON sales FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sales" ON sales;
CREATE POLICY "update_own_sales" ON sales FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sales" ON sales;
CREATE POLICY "delete_own_sales" ON sales FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Step 3: Update RPC functions to filter by auth.uid()
-- ============================================================

-- log_stock_in: insert with user_id via DEFAULT
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
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_txn_id uuid;
  v_expense_id uuid;
  v_material_name text;
  v_material_category text;
  v_total_amount numeric(12,2);
  v_date date := COALESCE(p_expense_date, CURRENT_DATE);
BEGIN
  SELECT name, category INTO v_material_name, v_material_category
  FROM raw_materials WHERE id = p_material_id AND user_id = auth.uid();

  IF v_material_name IS NULL THEN
    RAISE EXCEPTION 'Raw material not found';
  END IF;

  v_total_amount := p_qty * p_unit_cost;

  INSERT INTO raw_material_transactions (material_id, type, qty, date)
  VALUES (p_material_id, 'stock-in', p_qty, v_date)
  RETURNING id INTO v_txn_id;

  INSERT INTO expenses (date, amount, category, description, vendor, payment_method, linked_transaction_id)
  VALUES (
    v_date,
    v_total_amount,
    v_material_category,
    COALESCE(p_description, 'Stock-in: ' || p_qty || ' units of ' || v_material_name),
    p_vendor,
    p_payment_method,
    v_txn_id
  )
  RETURNING id INTO v_expense_id;

  UPDATE raw_material_transactions
  SET linked_expense_id = v_expense_id
  WHERE id = v_txn_id;

  UPDATE raw_materials
  SET current_qty = current_qty + p_qty,
      unit_cost = p_unit_cost,
      updated_at = now()
  WHERE id = p_material_id AND user_id = auth.uid();

  RETURN v_expense_id;
END;
$$;

-- log_production: filter by auth.uid()
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

  FOR v_recipe IN
    SELECT ri.material_id, ri.qty_required
    FROM recipe_items ri
    WHERE ri.product_id = p_product_id AND ri.user_id = auth.uid()
  LOOP
    INSERT INTO raw_material_transactions (material_id, type, qty, reason, date)
    VALUES (v_recipe.material_id, 'production-deduction', -(v_recipe.qty_required * p_qty_produced), 'Production: ' || p_qty_produced || ' x ' || v_product_name, v_date);

    UPDATE raw_materials
    SET current_qty = current_qty - (v_recipe.qty_required * p_qty_produced),
        updated_at = now()
    WHERE id = v_recipe.material_id AND user_id = auth.uid();
  END LOOP;

  INSERT INTO finished_goods_transactions (product_id, type, qty, date)
  VALUES (p_product_id, 'production', p_qty_produced, v_date);

  RETURN QUERY SELECT true, 'Production logged: ' || p_qty_produced || ' x ' || v_product_name::text;
  RETURN;
END;
$$;

-- log_adjustment: filter by auth.uid()
CREATE OR REPLACE FUNCTION log_adjustment(
  p_material_id uuid,
  p_qty_change numeric,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_txn_id uuid;
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM raw_materials WHERE id = p_material_id AND user_id = auth.uid()) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Raw material not found';
  END IF;

  INSERT INTO raw_material_transactions (material_id, type, qty, reason, date)
  VALUES (p_material_id, 'adjustment', p_qty_change, p_reason, CURRENT_DATE)
  RETURNING id INTO v_txn_id;

  UPDATE raw_materials
  SET current_qty = current_qty + p_qty_change,
      updated_at = now()
  WHERE id = p_material_id AND user_id = auth.uid();

  RETURN v_txn_id;
END;
$$;

-- log_finished_stock_out: filter by auth.uid()
CREATE OR REPLACE FUNCTION log_finished_stock_out(
  p_product_id uuid,
  p_qty numeric,
  p_type text,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_txn_id uuid;
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM products WHERE id = p_product_id AND user_id = auth.uid()) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF p_type NOT IN ('sale', 'adjustment') THEN
    RAISE EXCEPTION 'Type must be sale or adjustment';
  END IF;

  INSERT INTO finished_goods_transactions (product_id, type, qty, reason, date)
  VALUES (p_product_id, p_type, -p_qty, p_reason, CURRENT_DATE)
  RETURNING id INTO v_txn_id;

  RETURN v_txn_id;
END;
$$;

-- log_sale: filter by auth.uid()
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
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM products WHERE id = p_product_id AND user_id = auth.uid()) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type = 'production' THEN qty ELSE -qty END), 0)
  INTO v_current_stock
  FROM finished_goods_transactions
  WHERE product_id = p_product_id AND user_id = auth.uid();

  IF v_current_stock < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock (have %, need %)', v_current_stock, p_qty;
  END IF;

  v_total_amount := p_qty * p_unit_price;

  INSERT INTO finished_goods_transactions (product_id, type, qty, reason, date)
  VALUES (p_product_id, 'sale', -p_qty, 'Sale: ' || p_qty || ' x ' || v_total_amount, v_date)
  RETURNING id INTO v_txn_id;

  INSERT INTO sales (product_id, qty, unit_price, total_amount, customer_name, payment_method, date, notes, linked_transaction_id)
  VALUES (p_product_id, p_qty, p_unit_price, v_total_amount, p_customer_name, p_payment_method, v_date, p_notes, v_txn_id)
  RETURNING id INTO v_sale_id;

  RETURN v_sale_id;
END;
$$;

-- get_stock_valuation: filter by auth.uid()
CREATE OR REPLACE FUNCTION get_stock_valuation()
RETURNS TABLE(
  raw_material_value numeric,
  finished_goods_value numeric,
  total_value numeric,
  raw_material_count bigint,
  finished_goods_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_raw_value numeric(12,2) := 0;
  v_finished_value numeric(12,2) := 0;
  v_raw_count bigint := 0;
  v_finished_count bigint := 0;
BEGIN
  SELECT COALESCE(SUM(current_qty * unit_cost), 0), COUNT(*)
  INTO v_raw_value, v_raw_count
  FROM raw_materials WHERE current_qty > 0 AND user_id = auth.uid();

  SELECT COALESCE(SUM(
    (SELECT COALESCE(SUM(ri.qty_required * rm.unit_cost), 0)
     FROM recipe_items ri
     JOIN raw_materials rm ON rm.id = ri.material_id AND rm.user_id = auth.uid()
     WHERE ri.product_id = p.id AND ri.user_id = auth.uid()) * COALESCE((
      SELECT SUM(CASE WHEN type = 'production' THEN qty ELSE -qty END)
      FROM finished_goods_transactions
      WHERE product_id = p.id AND user_id = auth.uid()
    ), 0)
  ), 0), COUNT(*)
  INTO v_finished_value, v_finished_count
  FROM products p WHERE p.user_id = auth.uid();

  RETURN QUERY SELECT
    v_raw_value::numeric,
    v_finished_value::numeric,
    (v_raw_value + v_finished_value)::numeric,
    v_raw_count,
    v_finished_count;
END;
$$;

-- get_low_stock_materials: filter by auth.uid()
CREATE OR REPLACE FUNCTION get_low_stock_materials()
RETURNS TABLE(
  id uuid,
  name text,
  unit text,
  current_qty numeric,
  reorder_threshold numeric,
  category text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT rm.id, rm.name, rm.unit, rm.current_qty, rm.reorder_threshold, rm.category
  FROM raw_materials rm
  WHERE rm.current_qty <= rm.reorder_threshold AND rm.user_id = auth.uid()
  ORDER BY (rm.current_qty - rm.reorder_threshold) ASC;
END;
$$;

-- get_wastage_report: filter by auth.uid()
CREATE OR REPLACE FUNCTION get_wastage_report(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(
  material_id uuid,
  material_name text,
  total_waste_qty numeric,
  waste_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rm.id,
    rm.name,
    COALESCE(SUM(ABS(rmt.qty)), 0)::numeric AS total_waste_qty,
    COUNT(*)::bigint AS waste_count
  FROM raw_material_transactions rmt
  JOIN raw_materials rm ON rm.id = rmt.material_id
  WHERE rmt.type = 'adjustment'
    AND rmt.qty < 0
    AND rmt.user_id = auth.uid()
    AND (p_start_date IS NULL OR rmt.date >= p_start_date)
    AND (p_end_date IS NULL OR rmt.date <= p_end_date)
  GROUP BY rm.id, rm.name
  ORDER BY total_waste_qty DESC;
END;
$$;

-- get_stock_movement_history: filter by auth.uid()
CREATE OR REPLACE FUNCTION get_stock_movement_history(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(
  date date,
  item_name text,
  movement_type text,
  qty numeric,
  reason text,
  category text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rmt.date,
    rm.name,
    rmt.type,
    rmt.qty,
    rmt.reason,
    'Raw Material'::text AS category
  FROM raw_material_transactions rmt
  JOIN raw_materials rm ON rm.id = rmt.material_id
  WHERE rmt.user_id = auth.uid()
    AND (p_start_date IS NULL OR rmt.date >= p_start_date)
    AND (p_end_date IS NULL OR rmt.date <= p_end_date)

  UNION ALL

  SELECT
    fgt.date,
    p.name || COALESCE(' (' || p.variant || ')', ''),
    fgt.type,
    fgt.qty,
    fgt.reason,
    'Finished Goods'::text AS category
  FROM finished_goods_transactions fgt
  JOIN products p ON p.id = fgt.product_id
  WHERE fgt.user_id = auth.uid()
    AND (p_start_date IS NULL OR fgt.date >= p_start_date)
    AND (p_end_date IS NULL OR fgt.date <= p_end_date)
  ORDER BY date DESC;
END;
$$;
