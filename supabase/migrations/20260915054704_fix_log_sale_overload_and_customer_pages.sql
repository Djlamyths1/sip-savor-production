/*
# Fix log_sale RPC Overload Ambiguity

## Problem
The log_sale function was redefined with additional parameters in a previous
migration, but the OLD function signature was never dropped. PostgREST now
sees two candidates and cannot resolve which to call, producing:
  PGRST203: Could not choose the best candidate function

## Fix
Drop the old 7-parameter signature explicitly, keeping only the new
11-parameter version that supports customer_id, payment_status, due_date,
and initial_payment.

## Also
Fix customer_payments updated_at trigger — add a trigger to keep updated_at
current, matching the pattern used by other tables.
*/

-- Drop the old log_sale function signature (7 params)
-- The new one (11 params with defaults) covers all old call sites.
DROP FUNCTION IF EXISTS log_sale(uuid, numeric, numeric, date, text, text, text);

-- Ensure the new signature exists (re-create to be safe)
CREATE OR REPLACE FUNCTION log_sale(
  p_product_id uuid,
  p_qty numeric,
  p_unit_price numeric,
  p_sale_date date DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_payment_method text DEFAULT 'Cash',
  p_notes text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_payment_status text DEFAULT 'Paid',
  p_due_date date DEFAULT NULL,
  p_initial_payment numeric DEFAULT 0
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
  v_invoice_number text;
  v_initial_pay numeric(14,2) := COALESCE(p_initial_payment, 0);
  v_payment_id uuid;
  v_customer_to_use uuid := p_customer_id;
  v_customer_name_to_use text := p_customer_name;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN type = 'production' THEN qty ELSE -qty END), 0)
  INTO v_current_stock
  FROM finished_goods_transactions
  WHERE product_id = p_product_id;

  IF v_current_stock < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock (have %, need %)', v_current_stock, p_qty;
  END IF;

  v_total_amount := p_qty * p_unit_price;

  IF v_customer_to_use IS NOT NULL AND v_customer_name_to_use IS NULL THEN
    SELECT name INTO v_customer_name_to_use FROM customers WHERE id = v_customer_to_use;
  END IF;

  v_invoice_number := 'INV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');

  INSERT INTO finished_goods_transactions (product_id, type, qty, reason, date)
  VALUES (p_product_id, 'sale', -p_qty, 'Sale: ' || p_qty || ' x ' || v_total_amount, v_date)
  RETURNING id INTO v_txn_id;

  INSERT INTO sales (product_id, qty, unit_price, total_amount, customer_name, customer_id,
                     invoice_number, payment_method, date, notes, linked_transaction_id,
                     payment_status, due_date)
  VALUES (p_product_id, p_qty, p_unit_price, v_total_amount, v_customer_name_to_use, v_customer_to_use,
          v_invoice_number, p_payment_method, v_date, p_notes, v_txn_id,
          p_payment_status, p_due_date)
  RETURNING id INTO v_sale_id;

  IF v_customer_to_use IS NOT NULL AND v_initial_pay > 0 THEN
    v_payment_id := public.record_customer_payment(
      p_customer_id := v_customer_to_use,
      p_payment_date := v_date,
      p_amount := v_initial_pay,
      p_payment_method := p_payment_method,
      p_reference_number := NULL,
      p_notes := 'Initial payment for ' || v_invoice_number,
      p_received_by := NULL,
      p_sale_ids := ARRAY[v_sale_id],
      p_allocated_amounts := ARRAY[v_initial_pay]
    );
  END IF;

  RETURN v_sale_id;
END;
$$;

-- ============================================================
-- updated_at trigger for customer_payments
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_customer_payments_updated_at ON customer_payments;
CREATE TRIGGER trigger_customer_payments_updated_at
  BEFORE UPDATE ON customer_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_customers_updated_at ON customers;
CREATE TRIGGER trigger_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_transporters_updated_at ON transporters;
CREATE TRIGGER trigger_transporters_updated_at
  BEFORE UPDATE ON transporters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_delivery_zones_updated_at ON delivery_zones;
CREATE TRIGGER trigger_delivery_zones_updated_at
  BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_delivery_rates_updated_at ON delivery_rates;
CREATE TRIGGER trigger_delivery_rates_updated_at
  BEFORE UPDATE ON delivery_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_deliveries_updated_at ON deliveries;
CREATE TRIGGER trigger_deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
