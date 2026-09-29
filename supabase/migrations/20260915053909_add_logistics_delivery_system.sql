/*
# Interstate Customer Location & Logistics Management

## Overview
Extends the existing Customers, Sales, and Expenses system to support
interstate delivery, logistics, and delivery profitability tracking.
Does NOT replace or delete any existing tables or data.

## New Tables
1. transporters — Logistics providers (company vehicles, drivers, transport companies)
2. delivery_zones — Configurable delivery zones (Local, Edo State, South West, etc.)
3. delivery_rates — Rate card: state/LGA/zone/method → rate
4. deliveries — Delivery records linked to sales and customers

## Modified Tables
1. customers — Add location columns: state, lga, city, town, delivery_address,
   landmark, contact_person, alternative_phone, delivery_notes, delivery_zone_id
2. sales — Add delivery_required, delivery_id columns

## New RPC Functions
1. get_delivery_rate(p_state, p_lga, p_zone_id, p_method) — Returns applicable rate
2. get_logistics_summary(p_start, p_end) — KPI counts for dashboard
3. get_state_sales_report(p_start, p_end) — State-by-state sales breakdown

## RLS
- All new tables: TO anon, authenticated (single-tenant app, no sign-in)
- Existing data preserved — only additive ALTER TABLE columns
*/

-- ============================================================
-- 1. TRANSPORTERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  company text,
  vehicle_type text,
  vehicle_number text,
  contact_person text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transporters" ON transporters;
CREATE POLICY "anon_select_transporters" ON transporters FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transporters" ON transporters;
CREATE POLICY "anon_insert_transporters" ON transporters FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transporters" ON transporters;
CREATE POLICY "anon_update_transporters" ON transporters FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transporters" ON transporters;
CREATE POLICY "anon_delete_transporters" ON transporters FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 2. DELIVERY ZONES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_delivery_zones" ON delivery_zones;
CREATE POLICY "anon_select_delivery_zones" ON delivery_zones FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_delivery_zones" ON delivery_zones;
CREATE POLICY "anon_insert_delivery_zones" ON delivery_zones FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_delivery_zones" ON delivery_zones;
CREATE POLICY "anon_update_delivery_zones" ON delivery_zones FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_delivery_zones" ON delivery_zones;
CREATE POLICY "anon_delete_delivery_zones" ON delivery_zones FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default zones
INSERT INTO delivery_zones (name, description)
SELECT * FROM (VALUES
  ('Local - Benin City', 'Within Benin City metropolis'),
  ('Edo State', 'Within Edo State'),
  ('Nearby States', 'Delta, Ondo, Anambra, Imo'),
  ('South West', 'Lagos, Ogun, Oyo, Osun, Ondo, Ekiti'),
  ('South East', 'Anambra, Imo, Abia, Enugu, Ebonyi'),
  ('South South', 'Rivers, Bayelsa, Cross River, Akwa Ibom'),
  ('North Central', 'FCT, Plateau, Benue, Kogi, Nasarawa, Niger, Kwara'),
  ('North West', 'Kano, Kaduna, Katsina, Sokoto, Jigawa, Kebbi, Zamfara'),
  ('North East', 'Borno, Yobe, Bauchi, Gombe, Adamawa, Taraba')
) AS t(name, description)
WHERE NOT EXISTS (SELECT 1 FROM delivery_zones LIMIT 1);

-- ============================================================
-- 3. DELIVERY RATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text,
  lga text,
  zone_id uuid REFERENCES delivery_zones(id) ON DELETE SET NULL,
  delivery_method text NOT NULL,
  rate numeric(14,2) NOT NULL CHECK (rate >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_delivery_rates" ON delivery_rates;
CREATE POLICY "anon_select_delivery_rates" ON delivery_rates FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_delivery_rates" ON delivery_rates;
CREATE POLICY "anon_insert_delivery_rates" ON delivery_rates FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_delivery_rates" ON delivery_rates;
CREATE POLICY "anon_update_delivery_rates" ON delivery_rates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_delivery_rates" ON delivery_rates;
CREATE POLICY "anon_delete_delivery_rates" ON delivery_rates FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_delivery_rates_state ON delivery_rates(state);
CREATE INDEX IF NOT EXISTS idx_delivery_rates_zone ON delivery_rates(zone_id);

-- ============================================================
-- 4. EXTEND CUSTOMERS TABLE WITH LOCATION FIELDS
-- ============================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lga text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS town text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS landmark text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS alternative_phone text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS delivery_notes text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES delivery_zones(id) ON DELETE SET NULL;

-- ============================================================
-- 5. EXTEND SALES TABLE WITH DELIVERY COLUMNS
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_required boolean NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_id uuid;

-- ============================================================
-- 6. DELIVERIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number text UNIQUE NOT NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  dispatch_date date,
  expected_delivery_date date,
  actual_delivery_date date,
  state text,
  lga text,
  city text,
  delivery_address text,
  landmark text,
  delivery_method text NOT NULL DEFAULT 'Customer Pickup',
  transporter_id uuid REFERENCES transporters(id) ON DELETE SET NULL,
  tracking_number text,
  delivery_status text NOT NULL DEFAULT 'Pending',
  delivery_cost numeric(14,2) NOT NULL DEFAULT 0,
  customer_delivery_charge numeric(14,2) NOT NULL DEFAULT 0,
  delivery_margin numeric(14,2) GENERATED ALWAYS AS (customer_delivery_charge - delivery_cost) STORED,
  special_instructions text,
  delivery_requirements text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_deliveries" ON deliveries;
CREATE POLICY "anon_select_deliveries" ON deliveries FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_deliveries" ON deliveries;
CREATE POLICY "anon_insert_deliveries" ON deliveries FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_deliveries" ON deliveries;
CREATE POLICY "anon_update_deliveries" ON deliveries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_deliveries" ON deliveries;
CREATE POLICY "anon_delete_deliveries" ON deliveries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_deliveries_customer_id ON deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_sale_id ON deliveries(sale_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(delivery_status);
CREATE INDEX IF NOT EXISTS idx_deliveries_state ON deliveries(state);

-- Link sales.delivery_id to deliveries
ALTER TABLE sales ADD CONSTRAINT fk_sales_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL NOT VALID;

-- ============================================================
-- 7. RPC: get_delivery_rate
-- ============================================================
CREATE OR REPLACE FUNCTION get_delivery_rate(
  p_state text DEFAULT NULL,
  p_lga text DEFAULT NULL,
  p_zone_id uuid DEFAULT NULL,
  p_delivery_method text DEFAULT 'Customer Pickup'
)
RETURNS TABLE (rate numeric, rate_id uuid, zone_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try exact state + LGA + method match first
  RETURN QUERY
  SELECT dr.rate, dr.id, dz.name
  FROM delivery_rates dr
  LEFT JOIN delivery_zones dz ON dz.id = dr.zone_id
  WHERE dr.active = true
    AND dr.delivery_method = p_delivery_method
    AND dr.state = p_state
    AND dr.lga = p_lga
    AND CURRENT_DATE >= dr.effective_from
  ORDER BY dr.effective_from DESC
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Try state + method match
  RETURN QUERY
  SELECT dr.rate, dr.id, dz.name
  FROM delivery_rates dr
  LEFT JOIN delivery_zones dz ON dz.id = dr.zone_id
  WHERE dr.active = true
    AND dr.delivery_method = p_delivery_method
    AND dr.state = p_state
    AND dr.lga IS NULL
    AND CURRENT_DATE >= dr.effective_from
  ORDER BY dr.effective_from DESC
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Try zone + method match
  IF p_zone_id IS NOT NULL THEN
    RETURN QUERY
    SELECT dr.rate, dr.id, dz.name
    FROM delivery_rates dr
    LEFT JOIN delivery_zones dz ON dz.id = dr.zone_id
    WHERE dr.active = true
      AND dr.delivery_method = p_delivery_method
      AND dr.zone_id = p_zone_id
      AND dr.state IS NULL
      AND CURRENT_DATE >= dr.effective_from
    ORDER BY dr.effective_from DESC
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Fallback: method-only match
  RETURN QUERY
  SELECT dr.rate, dr.id, dz.name
  FROM delivery_rates dr
  LEFT JOIN delivery_zones dz ON dz.id = dr.zone_id
  WHERE dr.active = true
    AND dr.delivery_method = p_delivery_method
    AND dr.state IS NULL
    AND dr.lga IS NULL
    AND dr.zone_id IS NULL
    AND CURRENT_DATE >= dr.effective_from
  ORDER BY dr.effective_from DESC
  LIMIT 1;
END;
$$;

-- ============================================================
-- 8. RPC: get_logistics_summary
-- ============================================================
CREATE OR REPLACE FUNCTION get_logistics_summary(
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  pending_count bigint,
  ready_count bigint,
  in_transit_count bigint,
  delivered_count bigint,
  failed_count bigint,
  returned_count bigint,
  total_delivery_cost numeric,
  total_customer_charges numeric,
  total_delivery_margin numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE d.delivery_status = 'Pending')::bigint,
    COUNT(*) FILTER (WHERE d.delivery_status = 'Ready for Dispatch')::bigint,
    COUNT(*) FILTER (WHERE d.delivery_status IN ('Dispatched', 'In Transit'))::bigint,
    COUNT(*) FILTER (WHERE d.delivery_status = 'Delivered')::bigint,
    COUNT(*) FILTER (WHERE d.delivery_status = 'Failed Delivery')::bigint,
    COUNT(*) FILTER (WHERE d.delivery_status = 'Returned')::bigint,
    COALESCE(SUM(d.delivery_cost), 0)::numeric,
    COALESCE(SUM(d.customer_delivery_charge), 0)::numeric,
    COALESCE(SUM(d.customer_delivery_charge - d.delivery_cost), 0)::numeric
  FROM deliveries d
  WHERE (p_start IS NULL OR d.delivery_date >= p_start)
    AND (p_end IS NULL OR d.delivery_date <= p_end);
END;
$$;

-- ============================================================
-- 9. RPC: get_state_sales_report
-- ============================================================
CREATE OR REPLACE FUNCTION get_state_sales_report(
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  state text,
  customer_count bigint,
  invoice_count bigint,
  total_qty numeric,
  gross_sales numeric,
  net_sales numeric,
  cogs numeric,
  gross_profit numeric,
  delivery_cost numeric,
  delivery_charges numeric,
  delivery_margin numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(c.state, 'Unknown') AS state,
    COUNT(DISTINCT s.customer_id)::bigint AS customer_count,
    COUNT(*)::bigint AS invoice_count,
    COALESCE(SUM(s.qty), 0)::numeric AS total_qty,
    COALESCE(SUM(s.total_amount), 0)::numeric AS gross_sales,
    COALESCE(SUM(s.total_amount), 0)::numeric AS net_sales,
    0::numeric AS cogs,
    0::numeric AS gross_profit,
    COALESCE(SUM(COALESCE(d.delivery_cost, 0)), 0)::numeric AS delivery_cost,
    COALESCE(SUM(COALESCE(d.customer_delivery_charge, 0)), 0)::numeric AS delivery_charges,
    COALESCE(SUM(COALESCE(d.customer_delivery_charge, 0) - COALESCE(d.delivery_cost, 0)), 0)::numeric AS delivery_margin
  FROM sales s
  LEFT JOIN customers c ON c.id = s.customer_id
  LEFT JOIN deliveries d ON d.sale_id = s.id
  WHERE (p_start IS NULL OR s.date >= p_start)
    AND (p_end IS NULL OR s.date <= p_end)
    AND s.customer_id IS NOT NULL
  GROUP BY COALESCE(c.state, 'Unknown')
  ORDER BY gross_sales DESC;
END;
$$;
