import { useEffect, useState, useCallback } from 'react';
import {
  ArrowDownToLine,
  Plus,
  Search,
  Package,
  TrendingUp,
  Coins,
  Boxes,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type RawMaterial, type RawMaterialTransaction } from '@/lib/types';
import { PAYMENT_METHODS } from '@/lib/constants';
import {
  Card,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  EmptyState,
  PageHeader,
  StatCard,
} from '@/components/ui';
import Modal from '@/components/Modal';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';

interface StockInTxn extends RawMaterialTransaction {
  raw_materials: { name: string; unit: string; category: string };
}

export default function StockIn() {
  const [transactions, setTransactions] = useState<StockInTxn[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalQty, setTotalQty] = useState(0);

  const load = useCallback(async () => {
    const [txnRes, matRes] = await Promise.all([
      supabase
        .from('raw_material_transactions')
        .select('*, raw_materials(name, unit, category)')
        .eq('type', 'stock-in')
        .order('date', { ascending: false })
        .limit(100),
      supabase.from('raw_materials').select('*').order('name'),
    ]);

    const txns = (txnRes.data || []) as StockInTxn[];
    setTransactions(txns);
    setTotalQty(txns.reduce((sum, t) => sum + t.qty, 0));
    setMaterials((matRes.data || []) as RawMaterial[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Compute total spent from transaction qty * material unit_cost
  const totalPurchaseValue = transactions.reduce((sum, t) => {
    const mat = materials.find((m) => m.id === t.material_id);
    return sum + t.qty * (mat?.unit_cost || 0);
  }, 0);

  const filtered = transactions.filter((t) => {
    if (filterMaterial && t.material_id !== filterMaterial) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        t.raw_materials?.name?.toLowerCase().includes(s) ||
        t.reason?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Stock In"
        subtitle="Log raw material purchases — inventory levels update automatically (no expense created)"
        action={
          <Button onClick={() => setShowLog(true)} disabled={materials.length === 0}>
            <Plus className="w-4 h-4" /> Log Stock In
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Purchase Value"
          value={formatCurrency(totalPurchaseValue)}
          icon={Coins}
          accent="amber"
          subtitle={`${filtered.length} transactions`}
        />
        <StatCard
          label="Total Quantity In"
          value={formatNumber(totalQty)}
          icon={Boxes}
          accent="blue"
        />
        <StatCard
          label="Materials Available"
          value={String(materials.length)}
          icon={Package}
          accent="emerald"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by material or notes..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
          />
        </div>
        <div className="sm:w-56">
          <select
            value={filterMaterial}
            onChange={(e) => setFilterMaterial(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
          >
            <option value="">All Materials</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ArrowDownToLine}
            title="No stock-in records yet"
            message="Log your first raw material purchase to update inventory levels. Purchases are tracked as inventory costs, not operating expenses."
            action={
              <Button onClick={() => setShowLog(true)} disabled={materials.length === 0}>
                <Plus className="w-4 h-4" /> Log Stock In
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Material</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Qty</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Unit Cost</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((t) => {
                  const mat = materials.find((m) => m.id === t.material_id);
                  const unitCost = mat?.unit_cost || 0;
                  return (
                    <tr key={t.id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 text-sm text-stone-600">{formatDate(t.date)}</td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-stone-900">{t.raw_materials?.name || '—'}</span>
                        <span className="text-stone-400 text-xs ml-2">{t.raw_materials?.category}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge color="green">+{formatNumber(t.qty)} {t.raw_materials?.unit}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-stone-600">{formatCurrency(unitCost)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-stone-900">
                        {formatCurrency(t.qty * unitCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td colSpan={4} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total Purchase Value:</td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(totalPurchaseValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {showLog && (
        <LogStockInModal
          materials={materials}
          onClose={() => setShowLog(false)}
          onSaved={() => { setShowLog(false); load(); }}
        />
      )}
    </div>
  );
}

function LogStockInModal({
  materials,
  onClose,
  onSaved,
}: {
  materials: RawMaterial[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [materialId, setMaterialId] = useState(materials[0]?.id || '');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedMaterial = materials.find((m) => m.id === materialId);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const qtyNum = parseFloat(qty);
      const costNum = parseFloat(unitCost);
      if (!qtyNum || qtyNum <= 0) {
        setError('Quantity must be greater than 0');
        setSaving(false);
        return;
      }
      if (!costNum || costNum < 0) {
        setError('Unit cost is required');
        setSaving(false);
        return;
      }
      const { error: e } = await supabase.rpc('log_stock_in', {
        p_material_id: materialId,
        p_qty: qtyNum,
        p_unit_cost: costNum,
        p_expense_date: date,
        p_vendor: vendor || null,
        p_payment_method: paymentMethod,
        p_description: description || null,
      });
      if (e) throw e;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log stock-in');
      setSaving(false);
    }
  };

  const qtyNum = parseFloat(qty) || 0;
  const costNum = parseFloat(unitCost) || 0;

  return (
    <Modal open onClose={onClose} title="Log Stock In">
      <div className="space-y-4">
        <Select
          label="Raw Material"
          value={materialId}
          onChange={(v) => {
            setMaterialId(v);
            const m = materials.find((m) => m.id === v);
            if (m) setUnitCost(String(m.unit_cost));
          }}
          options={materials.map((m) => ({
            value: m.id,
            label: `${m.name} — ${formatNumber(m.current_qty)} ${m.unit} in stock`,
          }))}
        />
        {selectedMaterial && (
          <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-800">
              Current stock: {formatNumber(selectedMaterial.current_qty)} {selectedMaterial.unit} at {formatCurrency(selectedMaterial.unit_cost)}/{selectedMaterial.unit}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Quantity" type="number" value={qty} onChange={setQty} step="0.01" min="0" placeholder="0" required />
          <Input label={`Unit Cost (NGN/${selectedMaterial?.unit || 'unit'})`} type="number" value={unitCost} onChange={setUnitCost} step="0.01" min="0" placeholder="0" required />
        </div>
        <Input label="Date" type="date" value={date} onChange={setDate} />
        <Input label="Vendor / Supplier (optional)" value={vendor} onChange={setVendor} placeholder="Where did you buy from?" />
        <Select label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS} />
        <Input label="Notes (optional)" value={description} onChange={setDescription} placeholder="Additional details" />
        {qtyNum > 0 && costNum > 0 && (
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              Total cost: <span className="font-bold">{formatCurrency(qtyNum * costNum)}</span>
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              New stock will be: {formatNumber((selectedMaterial?.current_qty || 0) + qtyNum)} {selectedMaterial?.unit}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              This is an inventory purchase, not an operating expense.
            </p>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !qty || !unitCost}>
            {saving ? 'Logging...' : 'Log Stock In'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
