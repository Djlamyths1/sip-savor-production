import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  ShoppingBag,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Boxes,
  ArrowRight,
  Factory,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Truck,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  type RawMaterial,
  type Product,
  type StockValuation,
  type LowStockMaterial,
  type Sale,
  type Expense,
  type FinishedGoodsTransaction,
  type TotalReceivables,
  type LogisticsSummary,
} from '@/lib/types';
import { Card, Button, StatCard, Spinner, Badge, EmptyState, PageHeader } from '@/components/ui';
import { formatCurrency, formatNumber, formatDate, getDateRange, type PeriodPreset } from '@/lib/utils';
import type { NavId } from '@/lib/constants';

interface DashboardProps {
  onNavigate: (page: NavId) => void;
}

interface DashboardSaleItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  unit_cost: number;
  cogs: number;
  products: {
    name: string;
    variant: string | null;
  } | null;
}

interface DashboardSale {
  id: string;
  invoice_number: string;
  sale_date: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  delivery_charge: number;
  grand_total: number;
  payment_status: string;
  due_date: string | null;
  delivery_required: boolean;
  delivery_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sale_items: DashboardSaleItem[];
}

interface PeriodKPIs {
  totalSales: number;
  totalUnits: number;
  productionQty: number;
  productionCost: number;
  operatingExpenses: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  outstandingCredit: number;
  paymentsReceived: number;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [lowStock, setLowStock] = useState<LowStockMaterial[]>([]);
  const [kpis, setKpis] = useState<PeriodKPIs>({
    totalSales: 0, totalUnits: 0, paymentsReceived: 0, productionQty: 0, productionCost: 0,
    operatingExpenses: 0, cogs: 0, grossProfit: 0, netProfit: 0, outstandingCredit: 0,
  });
  const [salesByDay, setSalesByDay] = useState<{ date: string; total: number }[]>([]);
  const [expensesByDay, setExpensesByDay] = useState<{ date: string; total: number }[]>([]);
  const [salesByProduct, setSalesByProduct] = useState<{ name: string; total: number }[]>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<{ category: string; total: number }[]>([]);
  const [productionByProduct, setProductionByProduct] = useState<{ name: string; qty: number }[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ method: string; total: number }[]>([]);
  const [receivables, setReceivables] = useState<TotalReceivables>({ total_receivables: 0, overdue_amount: 0, customers_owing: 0, partially_paid_invoices: 0, unpaid_invoices: 0 });
  const [logistics, setLogistics] = useState<LogisticsSummary>({ pending_count: 0, ready_count: 0, in_transit_count: 0, delivered_count: 0, failed_count: 0, returned_count: 0, total_delivery_cost: 0, total_customer_charges: 0, total_delivery_margin: 0 });

  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    console.log('DASHBOARD LOAD START', new Date().toISOString());
    setLoading(true);
    const [matRes, prodRes, valRes, lowRes, salesRes, expRes, prodRes2, recvRes, logRes, payRes] = await Promise.all([
      supabase.from('raw_materials').select('*').order('updated_at', { ascending: false }).limit(5),
      supabase.from('products').select('*').order('updated_at', { ascending: false }).limit(5),
      supabase.rpc('get_stock_valuation'),
      supabase.rpc('get_low_stock_materials'),
      supabase.from('sales').select('*, sale_items(id, product_id, quantity, unit_price, discount, line_total, unit_cost, cogs, products(name, variant))').gte('sale_date', start).lte('sale_date', end).order('sale_date', { ascending: false }),
      supabase.from('expenses').select('*').gte('expense_date', start).lte('expense_date', end).order('expense_date', { ascending: false }),
      supabase.from('finished_goods_transactions').select('*').eq('type', 'production').gte('date', start).lte('date', end),
      supabase.rpc('get_total_receivables'),
      supabase.rpc('get_logistics_summary', { p_start: start, p_end: end }),
      supabase.from('customer_payments').select('amount').eq('is_voided', false).gte('payment_date', start).lte('payment_date', end),
    ]);

    setReceivables((recvRes.data as TotalReceivables[])?.[0] || { total_receivables: 0, overdue_amount: 0, customers_owing: 0, partially_paid_invoices: 0, unpaid_invoices: 0 });
    setLogistics((logRes.data as LogisticsSummary[])?.[0] || { pending_count: 0, ready_count: 0, in_transit_count: 0, delivered_count: 0, failed_count: 0, returned_count: 0, total_delivery_cost: 0, total_customer_charges: 0, total_delivery_margin: 0 });

    setMaterials(matRes.data || []);
    setProducts(prodRes.data || []);
    setValuation((valRes.data as StockValuation[])?.[0] || null);
    setLowStock(lowRes.data || []);

    const sales = (salesRes.data || []) as DashboardSale[];
    const expenses = (expRes.data || []) as Expense[];
    const prodTxns = (prodRes2.data || []) as FinishedGoodsTransaction[];

    // Calculate sales KPIs from invoice headers and sale items
    const totalSales = sales.reduce((sum, s) => sum + Number(s.grand_total || 0), 0);

    const totalUnits = sales.reduce(
      (sum, s) =>
        sum +
        (s.sale_items || []).reduce(
          (itemSum, item) => itemSum + Number(item.quantity || 0),
          0
        ),
      0
    );

    // Use stored COGS where available.
    // Historical migrated sale items have cogs = 0 where historical COGS was unavailable.
    const cogs = sales.reduce(
      (sum, s) =>
        sum +
        (s.sale_items || []).reduce(
          (itemSum, item) => itemSum + Number(item.cogs || 0),
          0
        ),
      0
    );

    const grossProfit = totalSales - cogs;
    const operatingExpenses = expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );
    const netProfit = grossProfit - operatingExpenses;

    const outstandingCredit = sales
      .filter((s) => s.payment_status !== 'Paid')
      .reduce((sum, s) => sum + Number(s.grand_total || 0), 0);

    const paymentsReceived = ((payRes.data || []) as { amount: number }[]).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    // Production cost
    console.log('PRODUCTION TXNS', prodTxns.length);
    const prodProductIds = [...new Set(prodTxns.map((t) => t.product_id))];
    console.log('UNIQUE PRODUCTION PRODUCTS', prodProductIds.length);
    const prodCosts: Record<string, number> = {};
    for (const pid of prodProductIds) {
      const { data: recipe } = await supabase
        .from('recipe_items')
        .select('qty_required, raw_materials!inner(unit_cost)')
        .eq('product_id', pid);
      prodCosts[pid] = (recipe || []).reduce(
        (sum: number, r: { qty_required: number; raw_materials: { unit_cost: number }[] }) => sum + Number(r.qty_required || 0) * Number(r.raw_materials?.[0]?.unit_cost || 0),
        0
      );
    }
    console.log('PRODUCTION RECIPE LOOKUPS FINISHED');
    const productionQty = prodTxns.reduce((sum, t) => sum + t.qty, 0);
    const productionCost = prodTxns.reduce((sum, t) => sum + (prodCosts[t.product_id] || 0) * t.qty, 0);

    setKpis({
      totalSales, totalUnits, productionQty, productionCost,
      operatingExpenses, cogs, grossProfit, netProfit, outstandingCredit, paymentsReceived,
    });

    // Sales by day
    const sByDay: Record<string, number> = {};
    sales.forEach((s) => {
      const day = s.sale_date;
      sByDay[day] = (sByDay[day] || 0) + Number(s.grand_total || 0);
    });
    setSalesByDay(
      Object.entries(sByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total }))
    );

    // Expenses by day
    const eByDay: Record<string, number> = {};
    expenses.forEach((e) => {
      const day = e.expense_date;
      eByDay[day] = (eByDay[day] || 0) + Number(e.amount || 0);
    });
    setExpensesByDay(
      Object.entries(eByDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total }))
    );

    // Sales by product
    const sByProd: Record<string, number> = {};
    const prodMap: Record<string, string> = {};
    (prodRes.data || []).forEach((p: Product) => {
      prodMap[p.id] = p.name;
    });

    sales.forEach((s) => {
      (s.sale_items || []).forEach((item) => {
        const name =
          item.products?.name ||
          prodMap[item.product_id] ||
          'Unknown';

        sByProd[name] =
          (sByProd[name] || 0) +
          Number(item.line_total || 0);
      });
    });

    setSalesByProduct(
      Object.entries(sByProd)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, total]) => ({ name, total }))
    );

    // Expenses by category
    const eByCat: Record<string, number> = {};
    expenses.forEach((e) => { eByCat[e.category] = (eByCat[e.category] || 0) + e.amount; });
    setExpensesByCategory(Object.entries(eByCat).sort(([, a], [, b]) => b - a).map(([category, total]) => ({ category, total })));

    // Production by product
    const prodByProd: Record<string, number> = {};
    prodTxns.forEach((t) => {
      const name = prodMap[t.product_id] || 'Unknown';
      prodByProd[name] = (prodByProd[name] || 0) + t.qty;
    });
    setProductionByProduct(Object.entries(prodByProd).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, qty]) => ({ name, qty })));

    // Payment breakdown
    // Use actual customer payments received during the selected period.
    const payBreakdown: Record<string, number> = {};
    const periodPayments = (payRes.data || []) as {
      amount: number;
      payment_method?: string | null;
    }[];

    // Fetch payment methods for the selected period.
    console.log('BEFORE PAYMENT DETAILS');
    const { data: paymentDetails } = await supabase
      .from('customer_payments')
      .select('amount, payment_method')
      .eq('is_voided', false)
      .gte('payment_date', start)
      .lte('payment_date', end);

    (paymentDetails || periodPayments).forEach((p) => {
      const method = p.payment_method || 'Unknown';
      payBreakdown[method] =
        (payBreakdown[method] || 0) + Number(p.amount || 0);
    });

    setPaymentBreakdown(
      Object.entries(payBreakdown).map(([method, total]) => ({
        method,
        total,
      }))
    );

    console.log('DASHBOARD LOAD COMPLETE');
    setLoading(false);
  }, [start, end]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;

  const maxSales = Math.max(...salesByDay.map((d) => d.total), 1);
  const maxExpenses = Math.max(...expensesByDay.map((d) => d.total), 1);
  const maxSalesProd = Math.max(...salesByProduct.map((d) => d.total), 1);
  const maxExpCat = Math.max(...expensesByCategory.map((d) => d.total), 1);
  const maxProdProd = Math.max(...productionByProduct.map((d) => d.qty), 1);
  const maxPay = Math.max(...paymentBreakdown.map((d) => d.total), 1);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Business overview — all figures are from real records"
      />

      {/* Period Selector */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodPreset)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          {period === 'custom' && (
            <>
              <div className="flex-1">
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-stone-700 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>
            </>
          )}
          <Button onClick={load}>
            <Calendar className="w-4 h-4" /> Refresh
          </Button>
        </div>
        <p className="text-xs text-stone-400 mt-2">
          Showing data from {formatDate(start)} to {formatDate(end)}
        </p>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Sales" value={formatCurrency(kpis.totalSales)} icon={ShoppingCart} accent="emerald" subtitle={`${kpis.totalUnits} units sold`} />
        <StatCard label="Payments Received" value={formatCurrency(kpis.paymentsReceived)} icon={CreditCard} accent="blue" subtitle="Customer payments" />
        <StatCard label="Operating Expenses" value={formatCurrency(kpis.operatingExpenses)} icon={TrendingDown} accent="red" subtitle="Excludes raw materials" />
        <StatCard label="Gross Profit" value={formatCurrency(kpis.grossProfit)} icon={TrendingUp} accent="amber" subtitle={`COGS: ${formatCurrency(kpis.cogs)}`} />
        <StatCard label="Net Profit" value={formatCurrency(kpis.netProfit)} icon={DollarSign} accent={kpis.netProfit >= 0 ? 'emerald' : 'red'} subtitle={`Margin: ${kpis.totalSales > 0 ? ((kpis.netProfit / kpis.totalSales) * 100).toFixed(1) : 0}%`} />
        <StatCard label="Total Receivables" value={formatCurrency(receivables.total_receivables)} icon={TrendingDown} accent="red" subtitle={`${receivables.customers_owing} customers owing`} />
        <StatCard label="Overdue Receivables" value={formatCurrency(receivables.overdue_amount)} icon={AlertTriangle} accent="red" subtitle={`${receivables.unpaid_invoices} unpaid invoices`} />
        <StatCard label="Inventory Value" value={formatCurrency(valuation?.total_value || 0)} icon={Boxes} accent="amber" subtitle={`${(valuation?.raw_material_count || 0) + (valuation?.finished_goods_count || 0)} items`} />
      </div>

      {/* Logistics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Pending" value={String(logistics.pending_count)} icon={Clock} accent="amber" />
        <StatCard label="In Transit" value={String(logistics.in_transit_count)} icon={Truck} accent="blue" />
        <StatCard label="Delivered" value={String(logistics.delivered_count)} icon={CheckCircle2} accent="emerald" />
        <StatCard label="Failed" value={String(logistics.failed_count + logistics.returned_count)} icon={XCircle} accent="red" />
        <StatCard label="Delivery Cost" value={formatCurrency(logistics.total_delivery_cost)} icon={TrendingDown} accent="red" />
        <StatCard label="Delivery Margin" value={formatCurrency(logistics.total_delivery_margin)} icon={TrendingUp} accent={logistics.total_delivery_margin >= 0 ? 'emerald' : 'red'} />
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <Card className="p-5 mb-6 border-red-200 bg-red-50/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-stone-900">Low Stock Alert</h3>
              <p className="text-sm text-stone-600 mt-0.5 mb-3">
                {lowStock.length} {lowStock.length === 1 ? 'item is' : 'items are'} at or below reorder threshold
              </p>
              <div className="space-y-2">
                {lowStock.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                    <div>
                      <span className="text-sm font-medium text-stone-900">{item.name}</span>
                      <span className="text-xs text-stone-400 ml-2">{item.category}</span>
                    </div>
                    <Badge color="red">
                      {formatNumber(item.current_qty)} / {formatNumber(item.reorder_threshold)} {item.unit}
                    </Badge>
                  </div>
                ))}
              </div>
              <button onClick={() => onNavigate('raw-materials')} className="mt-3 text-sm font-medium text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                View all materials <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales Trend */}
        <Card className="p-5">
          <h3 className="font-semibold text-stone-900 mb-4">Sales Trend</h3>
          {salesByDay.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="No sales" message="No sales recorded in this period." />
          ) : (
            <div className="space-y-2">
              {salesByDay.slice(-10).map((d) => (
                <div key={d.date} className="flex items-center gap-3">
                  <span className="text-xs text-stone-500 w-20 flex-shrink-0">{formatDate(d.date)}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${(d.total / maxSales) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-stone-700 w-24 text-right">{formatCurrency(d.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expense Trend */}
        <Card className="p-5">
          <h3 className="font-semibold text-stone-900 mb-4">Expense Trend</h3>
          {expensesByDay.length === 0 ? (
            <EmptyState icon={TrendingDown} title="No expenses" message="No operating expenses in this period." />
          ) : (
            <div className="space-y-2">
              {expensesByDay.slice(-10).map((d) => (
                <div key={d.date} className="flex items-center gap-3">
                  <span className="text-xs text-stone-500 w-20 flex-shrink-0">{formatDate(d.date)}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-red-400 h-full rounded-full transition-all" style={{ width: `${(d.total / maxExpenses) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-stone-700 w-24 text-right">{formatCurrency(d.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Sales by Product */}
        <Card className="p-5">
          <h3 className="font-semibold text-stone-900 mb-4">Top Products by Sales</h3>
          {salesByProduct.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No data" message="No product sales in this period." />
          ) : (
            <div className="space-y-2">
              {salesByProduct.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="text-xs text-stone-700 w-32 flex-shrink-0 truncate">{d.name}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${(d.total / maxSalesProd) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-stone-700 w-24 text-right">{formatCurrency(d.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expenses by Category */}
        <Card className="p-5">
          <h3 className="font-semibold text-stone-900 mb-4">Expenses by Category</h3>
          {expensesByCategory.length === 0 ? (
            <EmptyState icon={TrendingDown} title="No data" message="No expenses in this period." />
          ) : (
            <div className="space-y-2">
              {expensesByCategory.slice(0, 8).map((d) => (
                <div key={d.category} className="flex items-center gap-3">
                  <span className="text-xs text-stone-700 w-40 flex-shrink-0 truncate">{d.category}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-red-500 h-full rounded-full transition-all" style={{ width: `${(d.total / maxExpCat) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-stone-700 w-24 text-right">{formatCurrency(d.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Production by Product */}
        <Card className="p-5">
          <h3 className="font-semibold text-stone-900 mb-4">Production by Product</h3>
          {productionByProduct.length === 0 ? (
            <EmptyState icon={Factory} title="No data" message="No production in this period." />
          ) : (
            <div className="space-y-2">
              {productionByProduct.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="text-xs text-stone-700 w-32 flex-shrink-0 truncate">{d.name}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${(d.qty / maxProdProd) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-stone-700 w-20 text-right">{formatNumber(d.qty)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Payment Methods */}
        <Card className="p-5">
          <h3 className="font-semibold text-stone-900 mb-4">Payment Methods</h3>
          {paymentBreakdown.length === 0 ? (
            <EmptyState icon={DollarSign} title="No data" message="No sales in this period." />
          ) : (
            <div className="space-y-2">
              {paymentBreakdown.map((d) => (
                <div key={d.method} className="flex items-center gap-3">
                  <span className="text-xs text-stone-700 w-32 flex-shrink-0">{d.method}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-stone-700 h-full rounded-full transition-all" style={{ width: `${(d.total / maxPay) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-stone-700 w-24 text-right">{formatCurrency(d.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-stone-900">Recent Raw Materials</h3>
            <button onClick={() => onNavigate('raw-materials')} className="text-sm font-medium text-amber-600 hover:text-amber-700">View all</button>
          </div>
          {materials.length === 0 ? (
            <EmptyState icon={Boxes} title="No materials yet" message="Add raw materials to start tracking your inventory." />
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-stone-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-stone-900">{m.name}</p>
                    <p className="text-xs text-stone-400">{m.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-stone-900">{formatNumber(m.current_qty)} {m.unit}</p>
                    <p className="text-xs text-stone-400">{formatCurrency(m.unit_cost)}/{m.unit}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-stone-900">Recent Products</h3>
            <button onClick={() => onNavigate('products')} className="text-sm font-medium text-amber-600 hover:text-amber-700">View all</button>
          </div>
          {products.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No products yet" message="Add finished goods to start tracking production." />
          ) : (
            <div className="space-y-2">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-stone-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-stone-900">{p.name}</p>
                    {p.variant && <p className="text-xs text-stone-400">{p.variant}</p>}
                  </div>
                  <p className="text-sm font-semibold text-stone-900">{formatCurrency(p.selling_price)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}












