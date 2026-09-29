export interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  current_qty: number;
  reorder_threshold: number;
  category: string;
  unit_cost: number;
  created_at: string;
  updated_at: string;
}

export interface RawMaterialTransaction {
  id: string;
  material_id: string;
  type: 'stock-in' | 'production-deduction' | 'adjustment';
  qty: number;
  reason: string | null;
  linked_expense_id: string | null;
  date: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  variant: string;
  selling_price: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeItem {
  product_id: string;
  material_id: string;
  qty_required: number;
  created_at: string;
  raw_materials?: RawMaterial;
}

export interface FinishedGoodsTransaction {
  id: string;
  product_id: string;
  type: 'production' | 'sale' | 'adjustment';
  qty: number;
  reason: string | null;
  date: string;
  created_at: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface StockValuation {
  raw_material_value: number;
  finished_goods_value: number;
  total_value: number;
  raw_material_count: number;
  finished_goods_count: number;
}

export interface LowStockMaterial {
  id: string;
  name: string;
  unit: string;
  current_qty: number;
  reorder_threshold: number;
  category: string;
}

export interface WastageReportItem {
  material_id: string;
  material_name: string;
  total_waste_qty: number;
  waste_count: number;
}

export interface StockMovementHistoryItem {
  date: string;
  item_name: string;
  movement_type: string;
  qty: number;
  reason: string | null;
  category: string;
}

export interface Sale {
  id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  total_amount: number;
  customer_name: string | null;
  customer_id: string | null;
  invoice_number: string | null;
  due_date: string | null;
  payment_status: string;
  payment_method: string;
  date: string;
  notes: string | null;
  linked_transaction_id: string | null;
  delivery_required: boolean;
  delivery_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  lga: string | null;
  city: string | null;
  town: string | null;
  delivery_address: string | null;
  landmark: string | null;
  contact_person: string | null;
  alternative_phone: string | null;
  delivery_notes: string | null;
  delivery_zone_id: string | null;
  credit_limit: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerPayment {
  id: string;
  payment_number: string;
  customer_id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  bank_name: string | null;
  notes: string | null;
  received_by: string | null;
  is_voided: boolean;
  voided_at: string | null;
  void_reason: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  sale_id: string;
  allocated_amount: number;
  allocated_at: string;
  created_at: string;
}

export interface CustomerOutstanding {
  total_purchases: number;
  total_paid: number;
  total_outstanding: number;
  outstanding_invoices: number;
}

export interface InvoicePaymentSummary {
  invoice_total: number;
  amount_paid: number;
  outstanding: number;
  payment_status: string;
}

export interface ARAgingItem {
  customer_id: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  invoice_total: number;
  amount_paid: number;
  outstanding: number;
  due_date: string | null;
  days_outstanding: number;
  status: string;
  aging_bucket: string;
}

export interface TotalReceivables {
  total_receivables: number;
  overdue_amount: number;
  customers_owing: number;
  partially_paid_invoices: number;
  unpaid_invoices: number;
}

export interface Transporter {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  contact_person: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRate {
  id: string;
  state: string | null;
  lga: string | null;
  zone_id: string | null;
  delivery_method: string;
  rate: number;
  effective_from: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  delivery_number: string;
  sale_id: string | null;
  customer_id: string;
  delivery_date: string;
  dispatch_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  state: string | null;
  lga: string | null;
  city: string | null;
  delivery_address: string | null;
  landmark: string | null;
  delivery_method: string;
  transporter_id: string | null;
  tracking_number: string | null;
  delivery_status: string;
  delivery_cost: number;
  customer_delivery_charge: number;
  delivery_margin: number;
  special_instructions: string | null;
  delivery_requirements: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogisticsSummary {
  pending_count: number;
  ready_count: number;
  in_transit_count: number;
  delivered_count: number;
  failed_count: number;
  returned_count: number;
  total_delivery_cost: number;
  total_customer_charges: number;
  total_delivery_margin: number;
}

export interface StateSalesReportItem {
  state: string;
  customer_count: number;
  invoice_count: number;
  total_qty: number;
  gross_sales: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  delivery_cost: number;
  delivery_charges: number;
  delivery_margin: number;
}


