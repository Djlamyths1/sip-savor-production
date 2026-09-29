/*
# Sip and Savor — Inventory Management System Schema

## Overview
Creates the complete database schema for the Sip and Savor inventory management system
with integrated expense tracking. This is a single-tenant app (no sign-in), so all tables
use `TO anon, authenticated` policies.

## Tables Created

1. **raw_materials** — Registry of raw material stock items
   - name, unit, current_qty, reorder_threshold, category, unit_cost, created_at, updated_at

2. **raw_material_transactions** — Log of all stock movements for raw materials
   - material_id (FK), type (stock-in/production-deduction/adjustment), qty, reason,
     linked_expense_id (FK nullable), date, created_at

3. **products** — Finished goods catalog
   - name, variant, selling_price, created_at, updated_at

4. **recipe_items** — Bill of materials per product (many-to-many between products and raw_materials)
   - product_id (FK), material_id (FK), qty_required, created_at
   - Composite PK on (product_id, material_id)

5. **finished_goods_transactions** — Log of all stock movements for finished products
   - product_id (FK), type (production/sale/adjustment), qty, reason, date, created_at

6. **expenses** — Expense tracker entries
   - date, amount, category, description, vendor, payment_method,
     linked_transaction_id (FK to raw_material_transactions, nullable), created_at

## RPC Functions

1. **log_stock_in(material_uuid, qty, unit_cost, expense_date, vendor, payment_method, description)**
   - Creates a raw_material_transactions stock-in record
   - Creates a linked expense record
   - Updates raw_materials.current_qty and unit_cost
   - Returns the expense record

2. **log_production(product_uuid, qty_produced, production_date)**
   - Validates all recipe ingredients have sufficient stock
   - Deducts raw materials per recipe (creates production-deduction transactions)
   - Creates a finished_goods_transactions production record (adds qty)
   - Returns summary

3. **log_adjustment(material_uuid, qty_change, reason_text)**
   - Creates an adjustment transaction (positive or negative)
   - Updates raw_materials.current_qty
   - Returns the transaction

4. **log_finished_stock_out(product_uuid, qty, type_text, reason_text)**
   - Creates a finished_goods_transactions record (sale/adjustment)
   - Updates product stock (via finished_goods_transactions)
   - Returns the transaction

5. **get_stock_valuation()** — Returns total valuation of raw + finished inventory
6. **get_low_stock_materials()** — Returns materials at or below reorder threshold
7. **get_wastage_report(start_date, end_date)** — Returns wastage totals by item
8. **get_stock_movement_history(start_date, end_date)** — Returns unified movement log

## Security
- RLS enabled on all tables
- All policies use `TO anon, authenticated` (single-tenant, no sign-in)
- Full CRUD access for all tables
*/

-- ============================================================
-- RAW MATERIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL,
  current_qty numeric(12,2) NOT NULL DEFAULT 0,
  reorder_threshold numeric(12,2) NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Other',
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_raw_materials" ON raw_materials;
CREATE POLICY "anon_select_raw_materials" ON raw_materials FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_raw_materials" ON raw_materials;
CREATE POLICY "anon_insert_raw_materials" ON raw_materials FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_raw_materials" ON raw_materials;
CREATE POLICY "anon_update_raw_materials" ON raw_materials FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_raw_materials" ON raw_materials;
CREATE POLICY "anon_delete_raw_materials" ON raw_materials FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- RAW MATERIAL TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS raw_material_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('stock-in', 'production-deduction', 'adjustment')),
  qty numeric(12,2) NOT NULL,
  reason text,
  linked_expense_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE raw_material_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rmt" ON raw_material_transactions;
CREATE POLICY "anon_select_rmt" ON raw_material_transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_rmt" ON raw_material_transactions;
CREATE POLICY "anon_insert_rmt" ON raw_material_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_rmt" ON raw_material_transactions;
CREATE POLICY "anon_update_rmt" ON raw_material_transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_rmt" ON raw_material_transactions;
CREATE POLICY "anon_delete_rmt" ON raw_material_transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_rmt_material_id ON raw_material_transactions(material_id);
CREATE INDEX IF NOT EXISTS idx_rmt_date ON raw_material_transactions(date);

-- ============================================================
-- PRODUCTS (FINISHED GOODS)
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  variant text DEFAULT '',
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- RECIPE ITEMS (BILL OF MATERIALS)
-- ============================================================

CREATE TABLE IF NOT EXISTS recipe_items (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  qty_required numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, material_id)
);

ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recipe_items" ON recipe_items;
CREATE POLICY "anon_select_recipe_items" ON recipe_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recipe_items" ON recipe_items;
CREATE POLICY "anon_insert_recipe_items" ON recipe_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recipe_items" ON recipe_items;
CREATE POLICY "anon_update_recipe_items" ON recipe_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recipe_items" ON recipe_items;
CREATE POLICY "anon_delete_recipe_items" ON recipe_items FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- FINISHED GOODS TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS finished_goods_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('production', 'sale', 'adjustment')),
  qty numeric(12,2) NOT NULL,
  reason text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finished_goods_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_fgt" ON finished_goods_transactions;
CREATE POLICY "anon_select_fgt" ON finished_goods_transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_fgt" ON finished_goods_transactions;
CREATE POLICY "anon_insert_fgt" ON finished_goods_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_fgt" ON finished_goods_transactions;
CREATE POLICY "anon_update_fgt" ON finished_goods_transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_fgt" ON finished_goods_transactions;
CREATE POLICY "anon_delete_fgt" ON finished_goods_transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_fgt_product_id ON finished_goods_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_fgt_date ON finished_goods_transactions(date);

-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,2) NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  description text,
  vendor text,
  payment_method text DEFAULT 'Cash',
  linked_transaction_id uuid REFERENCES raw_material_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_expenses" ON expenses;
CREATE POLICY "anon_select_expenses" ON expenses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_expenses" ON expenses;
CREATE POLICY "anon_insert_expenses" ON expenses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_expenses" ON expenses;
CREATE POLICY "anon_update_expenses" ON expenses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_expenses" ON expenses;
CREATE POLICY "anon_delete_expenses" ON expenses FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ============================================================
-- RPC: log_stock_in
-- Logs a stock-in purchase: creates raw_material_transaction + expense + updates stock
-- ============================================================

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
  FROM raw_materials WHERE id = p_material_id;

  IF v_material_name IS NULL THEN
    RAISE EXCEPTION 'Raw material not found';
  END IF;

  v_total_amount := p_qty * p_unit_cost;

  -- Create the raw material transaction
  INSERT INTO raw_material_transactions (material_id, type, qty, date)
  VALUES (p_material_id, 'stock-in', p_qty, v_date)
  RETURNING id INTO v_txn_id;

  -- Create the linked expense
  INSERT INTO expenses (date, amount, category, description, vendor, payment_method, linked_transaction_id)
  VALUES (
    v_date,
    v_total_amount,
    v_material_category,
    COALESCE(p_description, 'Stock-in: ' || v_qty || ' ' || (SELECT unit FROM raw_materials WHERE id = p_material_id) || ' of ' || v_material_name),
    p_vendor,
    p_payment_method,
    v_txn_id
  )
  RETURNING id INTO v_expense_id;

  -- Link the expense back to the transaction
  UPDATE raw_material_transactions
  SET linked_expense_id = v_expense_id
  WHERE id = v_txn_id;

  -- Update the raw material stock and unit cost
  UPDATE raw_materials
  SET current_qty = current_qty + p_qty,
      unit_cost = p_unit_cost,
      updated_at = now()
  WHERE id = p_material_id;

  RETURN v_expense_id;
END;
$$;

-- ============================================================
-- RPC: log_production
-- Records a production run: deducts raw materials per recipe, adds finished goods
-- ============================================================

CREATE OR REPLACE FUNCTION log_production(
  p_product_id uuid,
  p_qty_produced numeric,
  p_production_date date DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date date := COALESCE(p_production_date, CURRENT_DATE);
  v_recipe record;
  v_product_name text;
BEGIN
  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT false, 'Product not found'::text;
    RETURN;
  END IF;

  -- Check all ingredients have sufficient stock
  FOR v_recipe IN
    SELECT ri.material_id, ri.qty_required, rm.current_qty, rm.name
    FROM recipe_items ri
    JOIN raw_materials rm ON rm.id = ri.material_id
    WHERE ri.product_id = p_product_id
  LOOP
    IF v_recipe.current_qty < (v_recipe.qty_required * p_qty_produced) THEN
      RETURN QUERY SELECT false, 'Insufficient stock of ' || v_recipe.name || ' (need ' || (v_recipe.qty_required * p_qty_produced) || ', have ' || v_recipe.current_qty || ')'::text;
      RETURN;
    END IF;
  END LOOP;

  -- Deduct raw materials
  FOR v_recipe IN
    SELECT ri.material_id, ri.qty_required
    FROM recipe_items ri
    WHERE ri.product_id = p_product_id
  LOOP
    INSERT INTO raw_material_transactions (material_id, type, qty, reason, date)
    VALUES (v_recipe.material_id, 'production-deduction', -(v_recipe.qty_required * p_qty_produced), 'Production: ' || p_qty_produced || ' x ' || v_product_name, v_date);

    UPDATE raw_materials
    SET current_qty = current_qty - (v_recipe.qty_required * p_qty_produced),
        updated_at = now()
    WHERE id = v_recipe.material_id;
  END LOOP;

  -- Add to finished goods stock
  INSERT INTO finished_goods_transactions (product_id, type, qty, date)
  VALUES (p_product_id, 'production', p_qty_produced, v_date);

  RETURN QUERY SELECT true, 'Production logged: ' || p_qty_produced || ' x ' || v_product_name::text;
  RETURN;
END;
$$;

-- ============================================================
-- RPC: log_adjustment
-- Manual stock adjustment for raw materials (corrections, spoilage, spillage)
-- ============================================================

CREATE OR REPLACE FUNCTION log_adjustment(
  p_material_id uuid,
  p_qty_change numeric,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_txn_id uuid;
BEGIN
  INSERT INTO raw_material_transactions (material_id, type, qty, reason, date)
  VALUES (p_material_id, 'adjustment', p_qty_change, p_reason, CURRENT_DATE)
  RETURNING id INTO v_txn_id;

  UPDATE raw_materials
  SET current_qty = current_qty + p_qty_change,
      updated_at = now()
  WHERE id = p_material_id;

  RETURN v_txn_id;
END;
$$;

-- ============================================================
-- RPC: log_finished_stock_out
-- Records stock-out for finished goods (sale, sample, spoilage, gifting)
-- ============================================================

CREATE OR REPLACE FUNCTION log_finished_stock_out(
  p_product_id uuid,
  p_qty numeric,
  p_type text,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_txn_id uuid;
BEGIN
  IF p_type NOT IN ('sale', 'adjustment') THEN
    RAISE EXCEPTION 'Type must be sale or adjustment';
  END IF;

  INSERT INTO finished_goods_transactions (product_id, type, qty, reason, date)
  VALUES (p_product_id, p_type, -p_qty, p_reason, CURRENT_DATE)
  RETURNING id INTO v_txn_id;

  RETURN v_txn_id;
END;
$$;

-- ============================================================
-- RPC: get_stock_valuation
-- Returns total valuation of raw + finished inventory
-- ============================================================

CREATE OR REPLACE FUNCTION get_stock_valuation()
RETURNS TABLE(
  raw_material_value numeric,
  finished_goods_value numeric,
  total_value numeric,
  raw_material_count bigint,
  finished_goods_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raw_value numeric(12,2) := 0;
  v_finished_value numeric(12,2) := 0;
  v_raw_count bigint := 0;
  v_finished_count bigint := 0;
BEGIN
  -- Raw material value = sum(current_qty * unit_cost)
  SELECT COALESCE(SUM(current_qty * unit_cost), 0), COUNT(*)
  INTO v_raw_value, v_raw_count
  FROM raw_materials WHERE current_qty > 0;

  -- Finished goods value = sum(current_stock * cost_per_unit from recipe)
  -- We compute cost per unit from recipe ingredients * unit_cost
  SELECT COALESCE(SUM(
    (SELECT COALESCE(SUM(ri.qty_required * rm.unit_cost), 0)
     FROM recipe_items ri
     JOIN raw_materials rm ON rm.id = ri.material_id
     WHERE ri.product_id = p.id) * COALESCE((
      SELECT SUM(CASE WHEN type = 'production' THEN qty ELSE -qty END)
      FROM finished_goods_transactions
      WHERE product_id = p.id
    ), 0)
  ), 0), COUNT(*)
  INTO v_finished_value, v_finished_count
  FROM products p;

  RETURN QUERY SELECT
    v_raw_value::numeric,
    v_finished_value::numeric,
    (v_raw_value + v_finished_value)::numeric,
    v_raw_count,
    v_finished_count;
END;
$$;

-- ============================================================
-- RPC: get_low_stock_materials
-- Returns materials at or below reorder threshold
-- ============================================================

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
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT rm.id, rm.name, rm.unit, rm.current_qty, rm.reorder_threshold, rm.category
  FROM raw_materials rm
  WHERE rm.current_qty <= rm.reorder_threshold
  ORDER BY (rm.current_qty - rm.reorder_threshold) ASC;
END;
$$;

-- ============================================================
-- RPC: get_wastage_report
-- Returns wastage totals by item for a date range
-- ============================================================

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
SECURITY DEFINER
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
    AND (p_start_date IS NULL OR rmt.date >= p_start_date)
    AND (p_end_date IS NULL OR rmt.date <= p_end_date)
  GROUP BY rm.id, rm.name
  ORDER BY total_waste_qty DESC;
END;
$$;

-- ============================================================
-- RPC: get_stock_movement_history
-- Returns unified stock movement log for a date range
-- ============================================================

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
SECURITY DEFINER
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
  WHERE (p_start_date IS NULL OR rmt.date >= p_start_date)
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
  WHERE (p_start_date IS NULL OR fgt.date >= p_start_date)
    AND (p_end_date IS NULL OR fgt.date <= p_end_date)
  ORDER BY date DESC;
END;
$$;