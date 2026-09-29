/*
# Customer Credit, Installment & Payment Tracking System

## New Tables
1. customers — Customer profiles with credit limits
2. customer_payments — Payment records from customers
3. payment_allocations — Many-to-many between payments and invoices (sales)

## Modified Tables
1. sales — Add customer_id, invoice_number, due_date, payment_status columns

## New RPC Functions
1. record_customer_payment — Creates payment + allocations, validates amounts
2. void_customer_payment — Voids a payment and recalculates invoice statuses
3. get_customer_outstanding — Returns total outstanding for a customer
4. get_invoice_payment_summary — Returns paid/outstanding/status for a single invoice
5. get_ar_aging — Returns aging buckets for all customers with outstanding balances
6. get_total_receivables — Returns dashboard receivables summary

## RLS
- All new tables: TO anon, authenticated (single-tenant app, no sign-in)
*/

-- ============================================================
-- 1. CUSTOMERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- ============================================================
-- 2. ADD COLUMNS TO SALES TABLE
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'Paid';

-- Generate invoice numbers for existing sales using a CTE
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM sales WHERE invoice_number IS NULL
)
UPDATE sales
SET invoice_number = 'INV-' || to_char(created_at, 'YYYY') || '-' || lpad((SELECT rn FROM numbered WHERE numbered.id = sales.id)::text, 6, '0')
WHERE invoice_number IS NULL;

-- Create a sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

-- ============================================================
-- 3. CUSTOMER PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'Cash',
  reference_number text,
  bank_name text,
  notes text,
  received_by text,
  is_voided boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  void_reason text,
  voided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customer_payments" ON customer_payments;
CREATE POLICY "anon_select_customer_payments" ON customer_payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customer_payments" ON customer_payments;
CREATE POLICY "anon_insert_customer_payments" ON customer_payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customer_payments" ON customer_payments;
CREATE POLICY "anon_update_customer_payments" ON customer_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customer_payments" ON customer_payments;
CREATE POLICY "anon_delete_customer_payments" ON customer_payments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_customer_payments_number ON customer_payments(payment_number);

-- ============================================================
-- 4. PAYMENT ALLOCATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  allocated_amount numeric(14,2) NOT NULL CHECK (allocated_amount > 0),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_payment_allocations" ON payment_allocations;
CREATE POLICY "anon_select_payment_allocations" ON payment_allocations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_payment_allocations" ON payment_allocations;
CREATE POLICY "anon_insert_payment_allocations" ON payment_allocations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payment_allocations" ON payment_allocations;
CREATE POLICY "anon_update_payment_allocations" ON payment_allocations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payment_allocations" ON payment_allocations;
CREATE POLICY "anon_delete_payment_allocations" ON payment_allocations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_sale_id ON payment_allocations(sale_id);

-- ============================================================
-- 5. UPDATE log_sale TO ACCEPT customer_id AND payment_status
-- ============================================================
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
  -- Check current stock
  SELECT COALESCE(SUM(CASE WHEN type = 'production' THEN qty ELSE -qty END), 0)
  INTO v_current_stock
  FROM finished_goods_transactions
  WHERE product_id = p_product_id;

  IF v_current_stock < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock (have %, need %)', v_current_stock, p_qty;
  END IF;

  v_total_amount := p_qty * p_unit_price;

  -- If customer_id provided but no customer_name, fetch the name
  IF v_customer_to_use IS NOT NULL AND v_customer_name_to_use IS NULL THEN
    SELECT name INTO v_customer_name_to_use FROM customers WHERE id = v_customer_to_use;
  END IF;

  -- Generate invoice number
  v_invoice_number := 'INV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');

  -- Create the finished goods transaction (deducts stock)
  INSERT INTO finished_goods_transactions (product_id, type, qty, reason, date)
  VALUES (p_product_id, 'sale', -p_qty, 'Sale: ' || p_qty || ' x ' || v_total_amount, v_date)
  RETURNING id INTO v_txn_id;

  -- Create the sales record
  INSERT INTO sales (product_id, qty, unit_price, total_amount, customer_name, customer_id,
                     invoice_number, payment_method, date, notes, linked_transaction_id,
                     payment_status, due_date)
  VALUES (p_product_id, p_qty, p_unit_price, v_total_amount, v_customer_name_to_use, v_customer_to_use,
          v_invoice_number, p_payment_method, v_date, p_notes, v_txn_id,
          p_payment_status, p_due_date)
  RETURNING id INTO v_sale_id;

  -- If initial payment provided, create a customer payment + allocation
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
-- 6. RPC: record_customer_payment
-- ============================================================
CREATE OR REPLACE FUNCTION record_customer_payment(
  p_customer_id uuid,
  p_payment_date date DEFAULT NULL,
  p_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'Cash',
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_received_by text DEFAULT NULL,
  p_sale_ids uuid[] DEFAULT NULL,
  p_allocated_amounts numeric[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_payment_number text;
  v_date date := COALESCE(p_payment_date, CURRENT_DATE);
  v_remaining numeric(14,2);
  v_invoice_total numeric(14,2);
  v_already_paid numeric(14,2);
  v_outstanding numeric(14,2);
  v_alloc_amount numeric(14,2);
  v_sale_id uuid;
  v_idx int;
BEGIN
  -- Validate
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- Generate payment number
  v_payment_number := 'PAY-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');

  -- Create the payment record
  INSERT INTO customer_payments (payment_number, customer_id, payment_date, amount, payment_method, reference_number, notes, received_by)
  VALUES (v_payment_number, p_customer_id, v_date, p_amount, p_payment_method, p_reference_number, p_notes, p_received_by)
  RETURNING id INTO v_payment_id;

  v_remaining := p_amount;

  -- If sale_ids provided, allocate explicitly
  IF p_sale_ids IS NOT NULL AND array_length(p_sale_ids, 1) > 0 THEN
    FOR v_idx IN 1..array_length(p_sale_ids, 1) LOOP
      v_sale_id := p_sale_ids[v_idx];
      v_alloc_amount := COALESCE(p_allocated_amounts[v_idx], 0);

      IF v_alloc_amount <= 0 THEN
        CONTINUE;
      END IF;

      SELECT total_amount INTO v_invoice_total FROM sales WHERE id = v_sale_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % not found', v_sale_id;
      END IF;

      SELECT COALESCE(SUM(pa.allocated_amount), 0) INTO v_already_paid
      FROM payment_allocations pa
      JOIN customer_payments cp ON cp.id = pa.payment_id
      WHERE pa.sale_id = v_sale_id AND cp.is_voided = false;

      v_outstanding := v_invoice_total - v_already_paid;

      IF v_alloc_amount > v_outstanding THEN
        RAISE EXCEPTION 'Payment of % exceeds outstanding balance of % for invoice', v_alloc_amount, v_outstanding;
      END IF;

      INSERT INTO payment_allocations (payment_id, sale_id, allocated_amount)
      VALUES (v_payment_id, v_sale_id, v_alloc_amount);

      v_remaining := v_remaining - v_alloc_amount;
    END LOOP;
  ELSE
    -- Auto-allocate using FIFO (oldest outstanding first)
    FOR v_sale_id IN
      SELECT s.id FROM sales s
      WHERE s.customer_id = p_customer_id
        AND s.payment_status IN ('Unpaid', 'Partially Paid')
      ORDER BY s.date ASC, s.created_at ASC
    LOOP
      IF v_remaining <= 0 THEN EXIT; END IF;

      SELECT total_amount INTO v_invoice_total FROM sales WHERE id = v_sale_id;
      SELECT COALESCE(SUM(pa.allocated_amount), 0) INTO v_already_paid
      FROM payment_allocations pa
      JOIN customer_payments cp ON cp.id = pa.payment_id
      WHERE pa.sale_id = v_sale_id AND cp.is_voided = false;

      v_outstanding := v_invoice_total - v_already_paid;

      IF v_outstanding <= 0 THEN
        CONTINUE;
      END IF;

      v_alloc_amount := LEAST(v_remaining, v_outstanding);

      INSERT INTO payment_allocations (payment_id, sale_id, allocated_amount)
      VALUES (v_payment_id, v_sale_id, v_alloc_amount);

      v_remaining := v_remaining - v_alloc_amount;
    END LOOP;
  END IF;

  -- Update payment_status on all affected sales
  UPDATE sales SET payment_status = sub.new_status
  FROM (
    SELECT s.id,
      CASE
        WHEN COALESCE(SUM(pa.allocated_amount), 0) <= 0 THEN 'Unpaid'
        WHEN COALESCE(SUM(pa.allocated_amount), 0) < s.total_amount THEN 'Partially Paid'
        WHEN COALESCE(SUM(pa.allocated_amount), 0) >= s.total_amount THEN 'Paid'
      END AS new_status
    FROM sales s
    LEFT JOIN payment_allocations pa ON pa.sale_id = s.id
    WHERE s.id IN (SELECT sale_id FROM payment_allocations WHERE payment_id = v_payment_id)
    GROUP BY s.id, s.total_amount
  ) sub
  WHERE sales.id = sub.id;

  RETURN v_payment_id;
END;
$$;

-- ============================================================
-- 7. RPC: void_customer_payment
-- ============================================================
CREATE OR REPLACE FUNCTION void_customer_payment(
  p_payment_id uuid,
  p_void_reason text DEFAULT NULL,
  p_voided_by text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE customer_payments
  SET is_voided = true, voided_at = now(), void_reason = p_void_reason, voided_by = p_voided_by
  WHERE id = p_payment_id;

  -- Recalculate payment_status for all affected sales
  UPDATE sales SET payment_status = sub.new_status
  FROM (
    SELECT s.id,
      CASE
        WHEN COALESCE(SUM(pa.allocated_amount), 0) <= 0 THEN 'Unpaid'
        WHEN COALESCE(SUM(pa.allocated_amount), 0) < s.total_amount THEN 'Partially Paid'
        WHEN COALESCE(SUM(pa.allocated_amount), 0) >= s.total_amount THEN 'Paid'
      END AS new_status
    FROM sales s
    LEFT JOIN payment_allocations pa ON pa.sale_id = s.id
      AND pa.payment_id IN (SELECT id FROM customer_payments WHERE is_voided = false)
    WHERE s.id IN (SELECT sale_id FROM payment_allocations WHERE payment_id = p_payment_id)
    GROUP BY s.id, s.total_amount
  ) sub
  WHERE sales.id = sub.id;
END;
$$;

-- ============================================================
-- 8. RPC: get_customer_outstanding
-- ============================================================
CREATE OR REPLACE FUNCTION get_customer_outstanding(p_customer_id uuid)
RETURNS TABLE (
  total_purchases numeric,
  total_paid numeric,
  total_outstanding numeric,
  outstanding_invoices bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(s.total_amount), 0)::numeric AS total_purchases,
    COALESCE(SUM(
      (SELECT COALESCE(SUM(pa.allocated_amount), 0)
       FROM payment_allocations pa
       JOIN customer_payments cp ON cp.id = pa.payment_id
       WHERE pa.sale_id = s.id AND cp.is_voided = false)
    ), 0)::numeric AS total_paid,
    COALESCE(SUM(
      s.total_amount -
      (SELECT COALESCE(SUM(pa.allocated_amount), 0)
       FROM payment_allocations pa
       JOIN customer_payments cp ON cp.id = pa.payment_id
       WHERE pa.sale_id = s.id AND cp.is_voided = false)
    ), 0)::numeric AS total_outstanding,
    COUNT(*) FILTER (
      WHERE s.total_amount >
        (SELECT COALESCE(SUM(pa.allocated_amount), 0)
         FROM payment_allocations pa
         JOIN customer_payments cp ON cp.id = pa.payment_id
         WHERE pa.sale_id = s.id AND cp.is_voided = false)
    )::bigint AS outstanding_invoices
  FROM sales s
  WHERE s.customer_id = p_customer_id;
END;
$$;

-- ============================================================
-- 9. RPC: get_invoice_payment_summary
-- ============================================================
CREATE OR REPLACE FUNCTION get_invoice_payment_summary(p_sale_id uuid)
RETURNS TABLE (
  invoice_total numeric,
  amount_paid numeric,
  outstanding numeric,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
BEGIN
  SELECT total_amount INTO v_total FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_paid
  FROM payment_allocations pa
  JOIN customer_payments cp ON cp.id = pa.payment_id
  WHERE pa.sale_id = p_sale_id AND cp.is_voided = false;

  RETURN QUERY
  SELECT
    v_total,
    v_paid,
    (v_total - v_paid),
    CASE
      WHEN v_paid <= 0 THEN 'Unpaid'
      WHEN v_paid < v_total THEN 'Partially Paid'
      ELSE 'Paid'
    END;
END;
$$;

-- ============================================================
-- 10. RPC: get_ar_aging
-- ============================================================
CREATE OR REPLACE FUNCTION get_ar_aging()
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  invoice_number text,
  invoice_date date,
  invoice_total numeric,
  amount_paid numeric,
  outstanding numeric,
  due_date date,
  days_outstanding int,
  status text,
  aging_bucket text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH outstanding_invoices AS (
    SELECT
      s.customer_id,
      c.name AS customer_name,
      s.invoice_number,
      s.date AS invoice_date,
      s.total_amount,
      COALESCE((
        SELECT SUM(pa.allocated_amount)
        FROM payment_allocations pa
        JOIN customer_payments cp ON cp.id = pa.payment_id
        WHERE pa.sale_id = s.id AND cp.is_voided = false
      ), 0) AS amount_paid,
      s.due_date,
      s.id AS sale_id
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.customer_id IS NOT NULL
  )
  SELECT
    oi.customer_id,
    oi.customer_name,
    oi.invoice_number,
    oi.invoice_date,
    oi.total_amount,
    oi.amount_paid,
    (oi.total_amount - oi.amount_paid),
    oi.due_date,
    CASE
      WHEN oi.due_date IS NOT NULL THEN CURRENT_DATE - oi.due_date
      ELSE CURRENT_DATE - oi.invoice_date
    END::int,
    CASE
      WHEN oi.amount_paid <= 0 THEN 'Unpaid'
      WHEN oi.amount_paid < oi.total_amount THEN 'Partially Paid'
      ELSE 'Paid'
    END,
    CASE
      WHEN (oi.total_amount - oi.amount_paid) <= 0 THEN 'Paid'
      WHEN oi.due_date IS NOT NULL AND CURRENT_DATE > oi.due_date THEN
        CASE
          WHEN CURRENT_DATE - oi.due_date <= 30 THEN '1-30 Days'
          WHEN CURRENT_DATE - oi.due_date <= 60 THEN '31-60 Days'
          WHEN CURRENT_DATE - oi.due_date <= 90 THEN '61-90 Days'
          WHEN CURRENT_DATE - oi.due_date <= 120 THEN '91-120 Days'
          ELSE '120+ Days'
        END
      ELSE 'Current'
    END
  FROM outstanding_invoices oi
  WHERE (oi.total_amount - oi.amount_paid) > 0
  ORDER BY oi.customer_name, oi.invoice_date;
END;
$$;

-- ============================================================
-- 11. RPC: get_total_receivables
-- ============================================================
CREATE OR REPLACE FUNCTION get_total_receivables()
RETURNS TABLE (
  total_receivables numeric,
  overdue_amount numeric,
  customers_owing bigint,
  partially_paid_invoices bigint,
  unpaid_invoices bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(
      s.total_amount -
      COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa JOIN customer_payments cp ON cp.id = pa.payment_id WHERE pa.sale_id = s.id AND cp.is_voided = false), 0)
    ), 0)::numeric,
    COALESCE(SUM(
      CASE
        WHEN s.due_date IS NOT NULL AND CURRENT_DATE > s.due_date THEN
          s.total_amount -
          COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa JOIN customer_payments cp ON cp.id = pa.payment_id WHERE pa.sale_id = s.id AND cp.is_voided = false), 0)
        ELSE 0
      END
    ), 0)::numeric,
    COUNT(DISTINCT s.customer_id)::bigint,
    COUNT(*) FILTER (WHERE s.payment_status = 'Partially Paid')::bigint,
    COUNT(*) FILTER (WHERE s.payment_status = 'Unpaid')::bigint
  FROM sales s
  WHERE s.customer_id IS NOT NULL
    AND s.total_amount >
      COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa JOIN customer_payments cp ON cp.id = pa.payment_id WHERE pa.sale_id = s.id AND cp.is_voided = false), 0);
END;
$$;
