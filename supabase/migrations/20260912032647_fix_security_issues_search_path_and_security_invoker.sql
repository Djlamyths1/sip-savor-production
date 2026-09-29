/*
# Fix Security Issues: Mutable Search Path & SECURITY DEFINER Exposure

## Problem
1. All 8 RPC functions have a mutable `search_path`, which allows search-path hijacking.
2. All 8 RPC functions are `SECURITY DEFINER` and executable by `anon` + `authenticated` roles,
   exposing them as potential privilege-escalation vectors.

## Fix
1. Add `SET search_path = public` to every function (immutable search path).
2. Switch all functions from `SECURITY DEFINER` to `SECURITY INVOKER`.
   This is safe because this is a single-tenant app (no sign-in) and every table
   has `TO anon, authenticated` RLS policies allowing full CRUD. The functions
   do not need to bypass RLS — the anon role already has the needed access.

## Functions Updated
- log_stock_in
- log_production
- log_adjustment
- log_finished_stock_out
- get_stock_valuation
- get_low_stock_materials
- get_wastage_report
- get_stock_movement_history
*/

-- ============================================================
-- log_stock_in
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
  FROM raw_materials WHERE id = p_material_id;

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
    COALESCE(p_description, 'Stock-in: ' || v_qty || ' ' || (SELECT unit FROM raw_materials WHERE id = p_material_id) || ' of ' || v_material_name),
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
  WHERE id = p_material_id;

  RETURN v_expense_id;
END;
$$;

-- ============================================================
-- log_production
-- ============================================================
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
  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
  IF v_product_name IS NULL THEN
    RETURN QUERY SELECT false, 'Product not found'::text;
    RETURN;
  END IF;

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

  INSERT INTO finished_goods_transactions (product_id, type, qty, date)
  VALUES (p_product_id, 'production', p_qty_produced, v_date);

  RETURN QUERY SELECT true, 'Production logged: ' || p_qty_produced || ' x ' || v_product_name::text;
  RETURN;
END;
$$;

-- ============================================================
-- log_adjustment
-- ============================================================
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
-- log_finished_stock_out
-- ============================================================
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
-- get_stock_valuation
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
  FROM raw_materials WHERE current_qty > 0;

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
-- get_low_stock_materials
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
SECURITY INVOKER
SET search_path = public
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
-- get_wastage_report
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
    AND (p_start_date IS NULL OR rmt.date >= p_start_date)
    AND (p_end_date IS NULL OR rmt.date <= p_end_date)
  GROUP BY rm.id, rm.name
  ORDER BY total_waste_qty DESC;
END;
$$;

-- ============================================================
-- get_stock_movement_history
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
