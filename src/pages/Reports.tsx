import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  DollarSign,
  TrendingDown,
  Boxes,
  ArrowLeftRight,
  ShoppingCart,
  Printer,
  Download,
  Factory,
  Calendar,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  type StockValuation,
  type WastageReportItem,
  type StockMovementHistoryItem,
  type Product,
  type RawMaterial,
  type Sale,
  type Expense,
  type FinishedGoodsTransaction,
} from '@/lib/types';
import {
  Card,
  Button,
  Spinner,
  EmptyState,
  PageHeader,
  Badge,
  StatCard,
} from '@/components/ui';
import { formatCurrency, formatNumber, formatDate, classNames, getDateRange, downloadCSV, downloadExcel, printReport, type PeriodPreset } from '@/lib/utils';

type ReportTab = 'valuation' | 'cost-margin' | 'wastage' | 'movement' | 'sales' | 'production' | 'expense' | 'profitability' | 'combined';

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>('valuation');

  const tabs: { id: ReportTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'valuation', label: 'Stock Valuation', icon: DollarSign },
    { id: 'cost-margin', label: 'Cost & Margin', icon: BarChart3 },
    { id: 'sales', label: 'Sales Report', icon: ShoppingCart },
    { id: 'production', label: 'Production Report', icon: Factory },
    { id: 'expense', label: 'Expense Report', icon: TrendingDown },
    { id: 'profitability', label: 'Profitability', icon: DollarSign },
    { id: 'combined', label: 'Combined Summary', icon: FileText },
    { id: 'wastage', label: 'Wastage Report', icon: TrendingDown },
    { id: 'movement', label: 'Movement History', icon: ArrowLeftRight },
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate, download, and print business reports from real data" />

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={classNames(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.id ? 'bg-stone-900 text-white shadow-sm' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'valuation' && <ValuationReport />}
      {tab === 'cost-margin' && <CostMarginReport />}
      {tab === 'wastage' && <WastageReport />}
      {tab === 'movement' && <MovementHistoryReport />}
      {tab === 'sales' && <SalesReport />}
      {tab === 'production' && <ProductionReport />}
      {tab === 'expense' && <ExpenseReport />}
      {tab === 'profitability' && <ProfitabilityReport />}
      {tab === 'combined' && <CombinedSummary />}
    </div>
  );
}

// ============================================================
// Date Range Picker (shared)
// ============================================================
function DateRangePicker({ onApply, period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd }: {
  onApply: () => void;
  period: PeriodPreset;
  setPeriod: (p: PeriodPreset) => void;
  customStart: string;
  setCustomStart: (s: string) => void;
  customEnd: string;
  setCustomEnd: (s: string) => void;
}) {
  return (
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
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-stone-700 mb-1.5">End Date</label>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500" />
            </div>
          </>
        )}
        <Button onClick={onApply}>
          <Calendar className="w-4 h-4" /> Generate
        </Button>
      </div>
    </Card>
  );
}

// ============================================================
// Export Buttons (shared)
// ============================================================
function ExportButtons({ onCSV, onExcel, onPrint, disabled }: {
  onCSV: () => void;
  onExcel: () => void;
  onPrint: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <Button variant="secondary" onClick={onCSV} disabled={disabled}>
        <Download className="w-4 h-4" /> CSV
      </Button>
      <Button variant="secondary" onClick={onExcel} disabled={disabled}>
        <Download className="w-4 h-4" /> Excel
      </Button>
      <Button variant="secondary" onClick={onPrint} disabled={disabled}>
        <Printer className="w-4 h-4" /> Print
      </Button>
    </div>
  );
}

// ============================================================
// Helper: fetch recipe cost per product
// ============================================================
async function fetchRecipeCosts(productIds: string[]): Promise<Record<string, number>> {
  const costs: Record<string, number> = {};
  for (const pid of productIds) {
    const { data: recipe } = await supabase
      .from('recipe_items')
      .select('qty_required, raw_materials!inner(unit_cost)')
      .eq('product_id', pid);
    costs[pid] = (recipe || []).reduce(
      (sum: number, r: { qty_required: number; raw_materials: { unit_cost: number }[] }) => sum + Number(r.qty_required || 0) * Number(r.raw_materials?.[0]?.unit_cost || 0),
      0
    );
  }
  return costs;
}

// ============================================================
// Valuation Report (no date filter)
// ============================================================
function ValuationReport() {
  const [loading, setLoading] = useState(true);
  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<(Product & { stock: number; cost: number })[]>([]);

  useEffect(() => {
    async function load() {
      const [valRes, matRes, prodRes] = await Promise.all([
        supabase.rpc('get_stock_valuation'),
        supabase.from('raw_materials').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
      ]);
      setValuation((valRes.data as StockValuation[])?.[0] || null);
      setMaterials((matRes.data || []) as RawMaterial[]);
      const prods = (prodRes.data || []) as Product[];
      const enriched = await Promise.all(
        prods.map(async (p) => {
          const { data: txns } = await supabase.from('finished_goods_transactions').select('qty, type').eq('product_id', p.id);
          const stock = (txns || []).reduce((sum: number, t: { type: string; qty: number }) => sum + (t.type === 'production' ? t.qty : -t.qty), 0);
          const { data: recipe } = await supabase.from('recipe_items').select('qty_required, raw_materials!inner(unit_cost)').eq('product_id', p.id);
          const cost = (recipe || []).reduce((sum: number, r: { qty_required: number; raw_materials: { unit_cost: number }[] }) => sum + Number(r.qty_required || 0) * Number(r.raw_materials?.[0]?.unit_cost || 0), 0);
          return { ...p, stock, cost };
        })
      );
      setProducts(enriched);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Raw Materials Value" value={formatCurrency(valuation?.raw_material_value || 0)} icon={Boxes} accent="blue" />
        <StatCard label="Finished Goods Value" value={formatCurrency(valuation?.finished_goods_value || 0)} icon={BarChart3} accent="emerald" />
        <StatCard label="Total Inventory Value" value={formatCurrency(valuation?.total_value || 0)} icon={DollarSign} accent="amber" />
      </div>
      <Card className="overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-stone-100"><h3 className="font-semibold text-stone-900">Raw Material Valuation</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Material</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Category</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Unit Cost</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {materials.filter((m) => m.current_qty > 0).map((m) => (
                <tr key={m.id} className="hover:bg-stone-50/50">
                  <td className="px-5 py-3 font-medium text-stone-900">{m.name}</td>
                  <td className="px-5 py-3 text-sm text-stone-500">{m.category}</td>
                  <td className="px-5 py-3 text-right text-sm">{formatNumber(m.current_qty)} {m.unit}</td>
                  <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(m.unit_cost)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(m.current_qty * m.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50 border-t-2 border-stone-200">
                <td colSpan={4} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total:</td>
                <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(valuation?.raw_material_value || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100"><h3 className="font-semibold text-stone-900">Finished Goods Valuation</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Product</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Stock</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Cost/Unit</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {products.filter((p) => p.stock > 0).map((p) => (
                <tr key={p.id} className="hover:bg-stone-50/50">
                  <td className="px-5 py-3 font-medium text-stone-900">{p.name}{p.variant && <span className="text-stone-400 text-sm ml-2">{p.variant}</span>}</td>
                  <td className="px-5 py-3 text-right text-sm">{formatNumber(p.stock)}</td>
                  <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(p.cost)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(p.stock * p.cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50 border-t-2 border-stone-200">
                <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total:</td>
                <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(valuation?.finished_goods_value || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Cost & Margin Report (no date filter)
// ============================================================
function CostMarginReport() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<(Product & { cost: number; stock: number })[]>([]);

  useEffect(() => {
    async function load() {
      const { data: prods } = await supabase.from('products').select('*').order('name');
      const enriched = await Promise.all(
        (prods || []).map(async (p: Product) => {
          const { data: recipe } = await supabase.from('recipe_items').select('qty_required, raw_materials!inner(unit_cost)').eq('product_id', p.id);
          const cost = (recipe || []).reduce((sum: number, r: { qty_required: number; raw_materials: { unit_cost: number }[] }) => sum + Number(r.qty_required || 0) * Number(r.raw_materials?.[0]?.unit_cost || 0), 0);
          const { data: txns } = await supabase.from('finished_goods_transactions').select('qty, type').eq('product_id', p.id);
          const stock = (txns || []).reduce((sum: number, t: { type: string; qty: number }) => sum + (t.type === 'production' ? t.qty : -t.qty), 0);
          return { ...p, cost, stock };
        })
      );
      setProducts(enriched);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Spinner />;
  if (products.length === 0) return <Card className="p-6"><EmptyState icon={BarChart3} title="No products" message="Add products and recipes to see cost and margin analysis." /></Card>;

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Product</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Cost/Unit</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Selling Price</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Profit/Unit</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Margin %</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Stock</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Stock Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {products.map((p) => {
              const margin = p.selling_price - p.cost;
              const marginPct = p.selling_price > 0 ? (margin / p.selling_price) * 100 : 0;
              return (
                <tr key={p.id} className="hover:bg-stone-50/50">
                  <td className="px-5 py-3 font-medium text-stone-900">{p.name}{p.variant && <span className="text-stone-400 text-sm ml-2">{p.variant}</span>}</td>
                  <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(p.cost)}</td>
                  <td className="px-5 py-3 text-right text-sm font-medium text-stone-900">{formatCurrency(p.selling_price)}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-stone-900">{formatCurrency(margin)}</td>
                  <td className="px-5 py-3 text-right"><Badge color={marginPct >= 30 ? 'green' : marginPct >= 10 ? 'amber' : 'red'}>{marginPct.toFixed(1)}%</Badge></td>
                  <td className="px-5 py-3 text-right text-sm">{formatNumber(p.stock)}</td>
                  <td className="px-5 py-3 text-right text-sm font-medium text-stone-900">{formatCurrency(p.stock * p.cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================
// Sales Report (date-filtered, with export)
// ============================================================
function SalesReport() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sales, setSales] = useState<(Sale & { products: { name: string; variant: string } })[]>([]);
  const [summary, setSummary] = useState({ count: 0, grossSales: 0, totalQty: 0, creditOutstanding: 0 });

  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sales')
      .select('*, products(name, variant)')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });
    const salesData = (data || []) as (Sale & { products: { name: string; variant: string } })[];
    setSales(salesData);
    setSummary({
      count: salesData.length,
      grossSales: salesData.reduce((s, x) => s + x.total_amount, 0),
      totalQty: salesData.reduce((s, x) => s + x.qty, 0),
      creditOutstanding: salesData.filter((x) => x.payment_method === 'Credit').reduce((s, x) => s + x.total_amount, 0),
    });
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const headers = ['Date', 'Invoice #', 'Product', 'Customer', 'Qty', 'Unit Price', 'Total', 'Payment Method'];
  const rows = sales.map((s) => [
    formatDate(s.date), s.id.slice(0, 8).toUpperCase(),
    s.products?.name || '—', s.customer_name || '—',
    s.qty, s.unit_price, s.total_amount, s.payment_method,
  ]);

  const fileBase = `Sales_Report_${start}_to_${end}`;

  return (
    <div>
      <DateRangePicker onApply={load} period={period} setPeriod={setPeriod} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      <ExportButtons
        disabled={sales.length === 0}
        onCSV={() => downloadCSV(fileBase, headers, rows)}
        onExcel={() => downloadExcel(fileBase, 'Sales Report', headers, rows)}
        onPrint={() => printReport('Sales Report', `${formatDate(start)} - ${formatDate(end)}`, headers, rows, [
          { label: 'Total Invoices', value: String(summary.count) },
          { label: 'Total Quantity Sold', value: String(summary.totalQty) },
          { label: 'Gross Sales', value: formatCurrency(summary.grossSales) },
          { label: 'Outstanding Credit', value: formatCurrency(summary.creditOutstanding) },
        ])}
      />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Invoices" value={String(summary.count)} icon={ShoppingCart} accent="blue" />
        <StatCard label="Gross Sales" value={formatCurrency(summary.grossSales)} icon={DollarSign} accent="emerald" />
        <StatCard label="Units Sold" value={formatNumber(summary.totalQty)} icon={Boxes} accent="amber" />
        <StatCard label="Outstanding Credit" value={formatCurrency(summary.creditOutstanding)} icon={TrendingDown} accent="red" />
      </div>
      {loading ? <Spinner /> : sales.length === 0 ? (
        <Card className="p-6"><EmptyState icon={ShoppingCart} title="No records found" message="No sales found for the selected period." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Invoice #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Product</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Customer</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Unit Price</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Total</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sales.map((s) => (
                  <tr key={s.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-sm text-stone-600">{formatDate(s.date)}</td>
                    <td className="px-5 py-3 text-sm font-mono text-stone-500">{s.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-5 py-3 font-medium text-stone-900">{s.products?.name || '—'}{s.products?.variant && <span className="text-stone-400 text-sm ml-1">{s.products.variant}</span>}</td>
                    <td className="px-5 py-3 text-sm text-stone-500">{s.customer_name || '—'}</td>
                    <td className="px-5 py-3 text-right text-sm">{formatNumber(s.qty)}</td>
                    <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(s.unit_price)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(s.total_amount)}</td>
                    <td className="px-5 py-3"><Badge color="blue">{s.payment_method}</Badge></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td colSpan={6} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Gross Sales:</td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(summary.grossSales)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Production Report (date-filtered, with export)
// ============================================================
function ProductionReport() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [records, setRecords] = useState<(FinishedGoodsTransaction & { products: { name: string; variant: string } })[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState({ batches: 0, totalQty: 0, totalCost: 0, avgCost: 0 });

  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('finished_goods_transactions')
      .select('*, products(name, variant)')
      .eq('type', 'production')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });
    const txns = (data || []) as (FinishedGoodsTransaction & { products: { name: string; variant: string } })[];
    setRecords(txns);
    const prodIds = [...new Set(txns.map((t) => t.product_id))];
    const recipeCosts = await fetchRecipeCosts(prodIds);
    setCosts(recipeCosts);
    const totalQty = txns.reduce((s, t) => s + t.qty, 0);
    const totalCost = txns.reduce((s, t) => s + (recipeCosts[t.product_id] || 0) * t.qty, 0);
    setSummary({ batches: txns.length, totalQty, totalCost, avgCost: totalQty > 0 ? totalCost / totalQty : 0 });
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const headers = ['Date', 'Production #', 'Product', 'Qty Produced', 'Unit Cost', 'Total Cost'];
  const rows = records.map((r) => [
    formatDate(r.date), r.id.slice(0, 8).toUpperCase(),
    `${r.products?.name || '—'}${r.products?.variant ? ` (${r.products.variant})` : ''}`,
    r.qty, costs[r.product_id] || 0, (costs[r.product_id] || 0) * r.qty,
  ]);
  const fileBase = `Production_Report_${start}_to_${end}`;

  return (
    <div>
      <DateRangePicker onApply={load} period={period} setPeriod={setPeriod} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      <ExportButtons
        disabled={records.length === 0}
        onCSV={() => downloadCSV(fileBase, headers, rows)}
        onExcel={() => downloadExcel(fileBase, 'Production Report', headers, rows)}
        onPrint={() => printReport('Production Report', `${formatDate(start)} - ${formatDate(end)}`, headers, rows, [
          { label: 'Total Batches', value: String(summary.batches) },
          { label: 'Total Quantity', value: formatNumber(summary.totalQty) },
          { label: 'Total Production Cost', value: formatCurrency(summary.totalCost) },
          { label: 'Avg Unit Cost', value: formatCurrency(summary.avgCost) },
        ])}
      />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Batches" value={String(summary.batches)} icon={Factory} accent="blue" />
        <StatCard label="Total Quantity" value={formatNumber(summary.totalQty)} icon={Boxes} accent="emerald" />
        <StatCard label="Total Production Cost" value={formatCurrency(summary.totalCost)} icon={DollarSign} accent="amber" />
        <StatCard label="Avg Unit Cost" value={formatCurrency(summary.avgCost)} icon={BarChart3} accent="blue" />
      </div>
      {loading ? <Spinner /> : records.length === 0 ? (
        <Card className="p-6"><EmptyState icon={Factory} title="No records found" message="No production runs in the selected period." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Production #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Product</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Unit Cost</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {records.map((r) => {
                  const uc = costs[r.product_id] || 0;
                  return (
                    <tr key={r.id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 text-sm text-stone-600">{formatDate(r.date)}</td>
                      <td className="px-5 py-3 text-sm font-mono text-stone-500">{r.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-5 py-3 font-medium text-stone-900">{r.products?.name || '—'}{r.products?.variant && <span className="text-stone-400 text-sm ml-1">{r.products.variant}</span>}</td>
                      <td className="px-5 py-3 text-right text-sm">{formatNumber(r.qty)}</td>
                      <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(uc)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(uc * r.qty)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total:</td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">{formatNumber(summary.totalQty)}</td>
                  <td></td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(summary.totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Expense Report (date-filtered, with export)
// ============================================================
function ExpenseReport() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);

  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('expenses').select('*').gte('date', start).lte('date', end).order('date', { ascending: false });
    const expData = (data || []) as Expense[];
    setExpenses(expData);
    setTotal(expData.reduce((s, e) => s + e.amount, 0));
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const headers = ['Date', 'Expense ID', 'Category', 'Description', 'Vendor', 'Amount', 'Payment Method'];
  const rows = expenses.map((e) => [
    formatDate(e.expense_date), e.id.slice(0, 8).toUpperCase(),
    e.category, e.description || '-', '-',
    e.amount, e.payment_method || '-',
  ]);
  const fileBase = `Expense_Report_${start}_to_${end}`;

  // Category breakdown
  const catBreakdown: Record<string, number> = {};
  expenses.forEach((e) => { catBreakdown[e.category] = (catBreakdown[e.category] || 0) + e.amount; });

  return (
    <div>
      <DateRangePicker onApply={load} period={period} setPeriod={setPeriod} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      <ExportButtons
        disabled={expenses.length === 0}
        onCSV={() => downloadCSV(fileBase, headers, rows)}
        onExcel={() => downloadExcel(fileBase, 'Expense Report', headers, rows)}
        onPrint={() => printReport('Expense Report', `${formatDate(start)} - ${formatDate(end)}`, headers, rows, [
          { label: 'Total Operating Expenses', value: formatCurrency(total) },
          { label: 'Expense Count', value: String(expenses.length) },
          ...Object.entries(catBreakdown).sort(([, a], [, b]) => b - a).map(([cat, amt]) => ({ label: cat, value: formatCurrency(amt) })),
        ])}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Operating Expenses" value={formatCurrency(total)} icon={TrendingDown} accent="red" />
        <StatCard label="Expense Count" value={String(expenses.length)} icon={FileText} accent="blue" />
        <StatCard label="Avg per Expense" value={formatCurrency(expenses.length > 0 ? total / expenses.length : 0)} icon={DollarSign} accent="amber" />
      </div>
      {loading ? <Spinner /> : expenses.length === 0 ? (
        <Card className="p-6"><EmptyState icon={TrendingDown} title="No records found" message="No operating expenses in the selected period." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">ID</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Category</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Description</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Vendor</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Amount</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-sm text-stone-600">{formatDate(e.expense_date)}</td>
                    <td className="px-5 py-3 text-sm font-mono text-stone-500">{e.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-5 py-3"><Badge color="blue">{e.category}</Badge></td>
                    <td className="px-5 py-3 text-sm text-stone-700">{e.description || '—'}</td>
                    <td className="px-5 py-3 text-sm text-stone-500">-</td>
                    <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-3 text-sm text-stone-500">{e.payment_method}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total Operating Expenses:</td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Profitability Report (date-filtered, with export)
// ============================================================
function ProfitabilityReport() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState({
    netSales: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0,
    grossMargin: 0, netMargin: 0, totalQty: 0, invoiceCount: 0,
  });

  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    const [salesRes, expRes] = await Promise.all([
      supabase.from('sales').select('*').gte('date', start).lte('date', end),
      supabase.from('expenses').select('amount').gte('date', start).lte('date', end),
    ]);
    const sales = (salesRes.data || []) as Sale[];
    const expenses = (expRes.data || []) as { amount: number }[];
    const recipeCosts = await fetchRecipeCosts([...new Set(sales.map((s) => s.product_id))]);
    const netSales = sales.reduce((s, x) => s + x.total_amount, 0);
    const cogs = sales.reduce((s, x) => s + (recipeCosts[x.product_id] || 0) * x.qty, 0);
    const grossProfit = netSales - cogs;
    const operatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - operatingExpenses;
    setData({
      netSales, cogs, grossProfit, operatingExpenses, netProfit,
      grossMargin: netSales > 0 ? (grossProfit / netSales) * 100 : 0,
      netMargin: netSales > 0 ? (netProfit / netSales) * 100 : 0,
      totalQty: sales.reduce((s, x) => s + x.qty, 0),
      invoiceCount: sales.length,
    });
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const headers = ['Metric', 'Amount'];
  const rows: (string | number)[][] = [
    ['Net Sales', formatCurrency(data.netSales)],
    ['COGS', formatCurrency(data.cogs)],
    ['Gross Profit', formatCurrency(data.grossProfit)],
    ['Gross Profit Margin', `${data.grossMargin.toFixed(1)}%`],
    ['Operating Expenses', formatCurrency(data.operatingExpenses)],
    ['Net Profit', formatCurrency(data.netProfit)],
    ['Net Profit Margin', `${data.netMargin.toFixed(1)}%`],
    ['Total Invoices', data.invoiceCount],
    ['Total Units Sold', data.totalQty],
  ];
  const fileBase = `Profitability_Report_${start}_to_${end}`;

  return (
    <div>
      <DateRangePicker onApply={load} period={period} setPeriod={setPeriod} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      <ExportButtons
        onCSV={() => downloadCSV(fileBase, headers, rows)}
        onExcel={() => downloadExcel(fileBase, 'Profitability Report', headers, rows)}
        onPrint={() => printReport('Profitability Report', `${formatDate(start)} - ${formatDate(end)}`, headers, rows)}
      />
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Net Sales" value={formatCurrency(data.netSales)} icon={DollarSign} accent="emerald" subtitle={`${data.invoiceCount} invoices`} />
            <StatCard label="COGS" value={formatCurrency(data.cogs)} icon={TrendingDown} accent="amber" subtitle={`${formatNumber(data.totalQty)} units`} />
            <StatCard label="Gross Profit" value={formatCurrency(data.grossProfit)} icon={BarChart3} accent="blue" subtitle={`${data.grossMargin.toFixed(1)}% margin`} />
            <StatCard label="Operating Expenses" value={formatCurrency(data.operatingExpenses)} icon={TrendingDown} accent="red" subtitle="Excl. raw materials" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <StatCard label="Net Profit" value={formatCurrency(data.netProfit)} icon={DollarSign} accent={data.netProfit >= 0 ? 'emerald' : 'red'} subtitle={`${data.netMargin.toFixed(1)}% margin`} />
            <StatCard label="Gross Profit Margin" value={`${data.grossMargin.toFixed(1)}%`} icon={BarChart3} accent="blue" />
          </div>
          <Card className="p-6">
            <h3 className="font-semibold text-stone-900 mb-4">Profitability Breakdown</h3>
            <div className="space-y-3">
              <ProfitRow label="Net Sales (Gross Sales - Discounts)" value={formatCurrency(data.netSales)} color="text-emerald-600" />
              <ProfitRow label="Cost of Goods Sold (COGS)" value={`- ${formatCurrency(data.cogs)}`} color="text-amber-600" />
              <div className="border-t border-stone-200 pt-3" />
              <ProfitRow label="Gross Profit" value={formatCurrency(data.grossProfit)} color="text-blue-600" bold />
              <ProfitRow label="Operating Expenses" value={`- ${formatCurrency(data.operatingExpenses)}`} color="text-red-600" />
              <div className="border-t-2 border-stone-300 pt-3" />
              <ProfitRow label="Net Profit" value={formatCurrency(data.netProfit)} color={data.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} bold large />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ProfitRow({ label, value, color, bold, large }: { label: string; value: string; color: string; bold?: boolean; large?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${large ? 'text-base' : 'text-sm'} ${bold ? 'font-bold' : 'font-medium'} text-stone-700`}>{label}</span>
      <span className={`${large ? 'text-xl' : 'text-base'} ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>{value}</span>
    </div>
  );
}

// ============================================================
// Combined Summary (date-filtered, with export)
// ============================================================
function CombinedSummary() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState({
    productionQty: 0, productionCost: 0, grossSales: 0, cogs: 0,
    grossProfit: 0, operatingExpenses: 0, netProfit: 0,
    grossMargin: 0, netMargin: 0,
  });

  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    const [salesRes, expRes, prodRes] = await Promise.all([
      supabase.from('sales').select('*').gte('date', start).lte('date', end),
      supabase.from('expenses').select('amount').gte('date', start).lte('date', end),
      supabase.from('finished_goods_transactions').select('*').eq('type', 'production').gte('date', start).lte('date', end),
    ]);
    const sales = (salesRes.data || []) as Sale[];
    const expenses = (expRes.data || []) as { amount: number }[];
    const prodTxns = (prodRes.data || []) as FinishedGoodsTransaction[];
    const allProductIds = [...new Set([...sales.map((s) => s.product_id), ...prodTxns.map((t) => t.product_id)])];
    const recipeCosts = await fetchRecipeCosts(allProductIds);
    const grossSales = sales.reduce((s, x) => s + x.total_amount, 0);
    const cogs = sales.reduce((s, x) => s + (recipeCosts[x.product_id] || 0) * x.qty, 0);
    const grossProfit = grossSales - cogs;
    const operatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - operatingExpenses;
    const productionQty = prodTxns.reduce((s, t) => s + t.qty, 0);
    const productionCost = prodTxns.reduce((s, t) => s + (recipeCosts[t.product_id] || 0) * t.qty, 0);
    setData({
      productionQty, productionCost, grossSales, cogs, grossProfit, operatingExpenses, netProfit,
      grossMargin: grossSales > 0 ? (grossProfit / grossSales) * 100 : 0,
      netMargin: grossSales > 0 ? (netProfit / grossSales) * 100 : 0,
    });
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const headers = ['Metric', 'Value'];
  const rows: (string | number)[][] = [
    ['Period', `${formatDate(start)} - ${formatDate(end)}`],
    ['Total Production (Qty)', formatNumber(data.productionQty)],
    ['Production Cost', formatCurrency(data.productionCost)],
    ['Gross Sales', formatCurrency(data.grossSales)],
    ['COGS', formatCurrency(data.cogs)],
    ['Gross Profit', formatCurrency(data.grossProfit)],
    ['Gross Margin', `${data.grossMargin.toFixed(1)}%`],
    ['Operating Expenses', formatCurrency(data.operatingExpenses)],
    ['Net Profit', formatCurrency(data.netProfit)],
    ['Net Margin', `${data.netMargin.toFixed(1)}%`],
  ];
  const fileBase = `Combined_Summary_${start}_to_${end}`;

  return (
    <div>
      <DateRangePicker onApply={load} period={period} setPeriod={setPeriod} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      <ExportButtons
        onCSV={() => downloadCSV(fileBase, headers, rows)}
        onExcel={() => downloadExcel(fileBase, 'Combined Summary', headers, rows)}
        onPrint={() => printReport('Combined Summary', `${formatDate(start)} - ${formatDate(end)}`, headers, rows)}
      />
      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <StatCard label="Production Qty" value={formatNumber(data.productionQty)} icon={Factory} accent="blue" />
            <StatCard label="Production Cost" value={formatCurrency(data.productionCost)} icon={DollarSign} accent="amber" />
            <StatCard label="Gross Sales" value={formatCurrency(data.grossSales)} icon={ShoppingCart} accent="emerald" />
            <StatCard label="COGS" value={formatCurrency(data.cogs)} icon={TrendingDown} accent="amber" />
            <StatCard label="Gross Profit" value={formatCurrency(data.grossProfit)} icon={BarChart3} accent="blue" subtitle={`${data.grossMargin.toFixed(1)}%`} />
            <StatCard label="Operating Expenses" value={formatCurrency(data.operatingExpenses)} icon={TrendingDown} accent="red" />
          </div>
          <Card className="p-6">
            <StatCard label="Net Profit" value={formatCurrency(data.netProfit)} icon={DollarSign} accent={data.netProfit >= 0 ? 'emerald' : 'red'} subtitle={`${data.netMargin.toFixed(1)}% margin`} />
          </Card>
        </>
      )}
    </div>
  );
}

// ============================================================
// Wastage Report (date-filtered)
// ============================================================
function WastageReport() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WastageReportItem[]>([]);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_wastage_report', { p_start_date: start, p_end_date: end });
    setItems((data as WastageReportItem[]) || []);
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const totalWaste = items.reduce((sum, i) => sum + i.total_waste_qty, 0);

  return (
    <div>
      <DateRangePicker onApply={load} period={period} setPeriod={setPeriod} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      {loading ? <Spinner /> : items.length === 0 ? (
        <Card className="p-6"><EmptyState icon={TrendingDown} title="No wastage recorded" message="No negative stock adjustments found for the selected period." /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <StatCard label="Total Wastage Quantity" value={formatNumber(totalWaste)} icon={TrendingDown} accent="red" />
            <StatCard label="Items with Wastage" value={String(items.length)} icon={Boxes} accent="amber" />
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Material</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Total Wasted</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Adjustments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {items.map((i) => (
                    <tr key={i.material_id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 font-medium text-stone-900">{i.material_name}</td>
                      <td className="px-5 py-3 text-right"><Badge color="red">{formatNumber(i.total_waste_qty)}</Badge></td>
                      <td className="px-5 py-3 text-right text-sm text-stone-500">{i.waste_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ============================================================
// Movement History Report (date-filtered)
// ============================================================
function MovementHistoryReport() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockMovementHistoryItem[]>([]);
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const { start, end } = getDateRange(period, customStart, customEnd);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_stock_movement_history', { p_start_date: start, p_end_date: end });
    setItems((data as StockMovementHistoryItem[]) || []);
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <DateRangePicker onApply={load} period={period} setPeriod={setPeriod} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} />
      {loading ? <Spinner /> : items.length === 0 ? (
        <Card className="p-6"><EmptyState icon={ArrowLeftRight} title="No movements found" message="No stock movements recorded for the selected period." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Item</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Type</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-sm text-stone-600">{formatDate(item.date)}</td>
                    <td className="px-5 py-3 font-medium text-stone-900">{item.item_name}</td>
                    <td className="px-5 py-3">
                      <Badge color={item.movement_type === 'stock-in' ? 'green' : item.movement_type === 'production-deduction' ? 'amber' : item.movement_type === 'production' ? 'blue' : item.movement_type === 'sale' ? 'purple' : 'stone'}>{item.movement_type}</Badge>
                    </td>
                    <td className={classNames('px-5 py-3 text-right font-medium', item.qty > 0 ? 'text-emerald-600' : 'text-red-600')}>{item.qty > 0 ? '+' : ''}{formatNumber(item.qty)}</td>
                    <td className="px-5 py-3 text-sm text-stone-500">{item.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}











