
import { useEffect, useState, useCallback } from 'react';
import {
  ArrowDownToLine,
  Plus,
  Search,
  Package,
  Coins,
  Boxes,
  Pencil,
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
  vendor: string | null;
  payment_method: string | null;
  unit_cost: number | null;
  raw_materials: {
    name: string;
    unit: string;
    category: string;
  };
}

export default function StockIn() {
  const [transactions, setTransactions] = useState<StockInTxn[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [editingTxn, setEditingTxn] = useState<StockInTxn | null>(null);
  const [search, setSearch] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [totalQty, setTotalQty] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [txnRes, matRes] = await Promise.all([
        supabase
          .from('raw_material_transactions')
          .select('*, raw_materials(name, unit, category)')
          .eq('type', 'stock-in')
          .order('date', { ascending: false })
          .limit(100),
        supabase.from('raw_materials').select('*').order('name'),
      ]);

      if (txnRes.error) throw txnRes.error;
      if (matRes.error) throw matRes.error;

      const txns = (txnRes.data || []) as unknown as StockInTxn[];

      console.log('STOCK IN DIAGNOSTIC:', {
        count: txns.length,
        firstTransaction: txns[0],
        firstQty: txns[0]?.qty,
        firstUnitCost: txns[0]?.unit_cost,
      });


      setTransactions(txns);
      setTotalQty(txns.reduce((sum, txn) => sum + Number(txn.qty || 0), 0));
      setMaterials((matRes.data || []) as RawMaterial[]);
    } catch (err) {
      console.error('Failed to load Stock In records:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

// Use the recorded transaction cost first, then the current material cost
// when no transaction cost was recorded.
const totalPurchaseValue = transactions.reduce((sum, txn) => {
  const unitCost =
    txn.unit_cost ??
    materials.find((material) => material.id === txn.material_id)?.unit_cost ??
    null;

  return unitCost == null
    ? sum
    : sum + Number(txn.qty) * Number(unitCost);
}, 0);

  const filtered = transactions.filter((txn) => {
    if (filterMaterial && txn.material_id !== filterMaterial) {
      return false;
    }

    if (search) {
      const term = search.toLowerCase();

      return (
        txn.raw_materials?.name?.toLowerCase().includes(term) ||
        txn.reason?.toLowerCase().includes(term) ||
        txn.vendor?.toLowerCase().includes(term)
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
          <Button
            onClick={() => {
              setEditingTxn(null);
              setShowLog(true);
            }}
            disabled={materials.length === 0}
          >
            <Plus className="w-4 h-4" />
            Log Stock In
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Purchase Value"
          value={formatCurrency(totalPurchaseValue)}
          icon={Coins}
          accent="amber"
          subtitle="Recorded costs and current-cost estimates"
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by material, vendor or notes..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
          />
        </div>

        <div className="sm:w-56">
          <select
            value={filterMaterial}
            onChange={(event) => setFilterMaterial(event.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
          >
            <option value="">All Materials</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={ArrowDownToLine}
            title="No stock-in records found"
            message="Log a raw material purchase, or change your search filters. Purchases update inventory and do not create operating expenses."
            action={
              <Button
                onClick={() => {
                  setEditingTxn(null);
                  setShowLog(true);
                }}
                disabled={materials.length === 0}
              >
                <Plus className="w-4 h-4" />
                Log Stock In
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                    Date
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                    Material
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                    Qty
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                    Unit Cost
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                    Total Cost
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100">
                {filtered.map((txn) => {
                  const unitCost =
                   txn.unit_cost ?? materials.find((m) => m.id === txn.material_id)?.unit_cost ?? null;

                  return (
                    <tr key={txn.id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 text-sm text-stone-600">
                        {txn.date ? formatDate(txn.date) : '—'}
                      </td>

                      <td className="px-5 py-3">
                        <span className="font-medium text-stone-900">
                          {txn.raw_materials?.name || '—'}
                        </span>
                        <span className="text-stone-400 text-xs ml-2">
                          {txn.raw_materials?.category}
                        </span>
                      </td>

                      <td className="px-5 py-3 text-right">
                        <Badge color="green">
                          +{formatNumber(txn.qty)} {txn.raw_materials?.unit}
                        </Badge>
                      </td>

                      <td className="px-5 py-3 text-right text-sm text-stone-600">
                        {unitCost == null
                          ? '—'
                          : formatCurrency(Number(unitCost))}
                      </td>

                      <td className="px-5 py-3 text-right font-semibold text-stone-900">
                        {unitCost == null
                          ? '—'
                          : formatCurrency(
                              Number(txn.qty) * Number(unitCost)
                            )}
                      </td>

                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setShowLog(false);
                            setEditingTxn(txn);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td
                    colSpan={5}
                    className="px-5 py-3 text-right text-sm font-semibold text-stone-700"
                  >
                    Total Displayed Purchase Value:
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">
                    {formatCurrency(totalPurchaseValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {showLog && (
        <LogStockInModal
          key="new"
          materials={materials}
          onClose={() => setShowLog(false)}
          onSaved={() => {
            setShowLog(false);
            void load();
          }}
        />
      )}

      {editingTxn && (
        <LogStockInModal
          key={editingTxn.id}
          materials={materials}
          transaction={editingTxn}
          onClose={() => setEditingTxn(null)}
          onSaved={() => {
            setEditingTxn(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function LogStockInModal({
  materials,
  onClose,
  onSaved,
  transaction,
}: {
  materials: RawMaterial[];
  onClose: () => void;
  onSaved: () => void;
  transaction?: StockInTxn;
}) {
  const isEditing = Boolean(transaction);

  const [materialId, setMaterialId] = useState(
    transaction?.material_id ?? materials[0]?.id ?? ''
  );

  const [qty, setQty] = useState(
    transaction ? String(transaction.qty) : ''
  );

  const [unitCost, setUnitCost] = useState(() => {
  if (transaction?.unit_cost != null) {
    return String(transaction.unit_cost);
  }

  if (transaction) {
    const material = materials.find(
      (item) => item.id === transaction.material_id
    );

    return material?.unit_cost == null
      ? ''
      : String(material.unit_cost);
  }

  const initialMaterial = materials.find(
    (item) => item.id === (transaction?.material_id ?? materials[0]?.id)
  );

  return initialMaterial?.unit_cost == null
    ? ''
    : String(initialMaterial.unit_cost);
});

  const [date, setDate] = useState(
    transaction?.date
      ? transaction.date.slice(0, 10)
      : transaction
        ? ''
        : new Date().toISOString().split('T')[0]
  );

  const [vendor, setVendor] = useState(transaction?.vendor ?? '');

  const [paymentMethod, setPaymentMethod] = useState(
    transaction ? transaction.payment_method ?? '' : 'Cash'
  );

  const [description, setDescription] = useState(
    transaction?.reason ?? ''
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedMaterial = materials.find(
    (material) => material.id === materialId
  );

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const qtyNum = Number(qty);
      const costNum = Number(unitCost);

      if (!qty.trim() || !Number.isFinite(qtyNum) || qtyNum <= 0) {
        throw new Error('Quantity must be greater than 0.');
      }

      if (
        !unitCost.trim() ||
        !Number.isFinite(costNum) ||
        costNum < 0
      ) {
        throw new Error('Enter a valid unit cost of zero or more.');
      }

      if (!date) {
        throw new Error('Please select a transaction date.');
      }
      if (!vendor.trim()) {
        throw new Error('Please enter the vendor or supplier.');
      }

      if (!paymentMethod.trim()) {
        throw new Error('Please select a payment method.');
      }

      if (isEditing && transaction) {
        const { error: rpcError } = await supabase.rpc('edit_stock_in', {
          p_transaction_id: transaction.id,
          p_qty: qtyNum,
          p_unit_cost: costNum,
          p_date: date,
          p_vendor: vendor.trim(),
          p_payment_method: paymentMethod,
          p_description: description.trim() || null,
        });

        if (rpcError) throw rpcError;
      } else {
        if (!materialId) {
          throw new Error('Please select a raw material.');
        }

        const { error: rpcError } = await supabase.rpc('log_stock_in', {
          p_material_id: materialId,
          p_qty: qtyNum,
          p_unit_cost: costNum,
          p_expense_date: date,
          p_vendor: vendor.trim() || null,
          p_payment_method: paymentMethod,
          p_description: description.trim() || null,
        });

        if (rpcError) throw rpcError;
      }

      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save stock-in.'
      );
      setSaving(false);
    }
  };

  const qtyNum = Number(qty) || 0;
  const costNum = Number(unitCost) || 0;

  const resultingStock =
    Number(selectedMaterial?.current_qty || 0) +
    (qtyNum - (transaction?.qty ?? 0));

  const paymentOptions = [
    ...(isEditing && !paymentMethod
      ? [{ value: '', label: 'Select payment method' }]
      : []),
    ...PAYMENT_METHODS,
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Edit Stock In' : 'Log Stock In'}
    >
      <div className="space-y-4">
        {isEditing ? (
          <div className="bg-stone-50 rounded-lg p-3">
            <p className="text-sm font-medium text-stone-900">
              Material:{' '}
              {transaction?.raw_materials?.name ||
                selectedMaterial?.name ||
                '—'}
            </p>
            <p className="text-sm text-stone-600 mt-1">
              Current stock:{' '}
              {formatNumber(Number(selectedMaterial?.current_qty || 0))}{' '}
              {selectedMaterial?.unit}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              The material cannot be changed when editing a transaction.
            </p>
          </div>
        ) : (
          <>
            <Select
              label="Raw Material"
              value={materialId}
              onChange={(value) => {
                setMaterialId(value);

                const material = materials.find((m) => m.id === value);

                if (material) {
                  setUnitCost(
                    material.unit_cost == null
                      ? ''
                      : String(material.unit_cost)
                  );
                }
              }}
              options={materials.map((material) => ({
                value: material.id,
                label: `${material.name} — ${formatNumber(
                  Number(material.current_qty || 0)
                )} ${material.unit} in stock`,
              }))}
            />

            {selectedMaterial && (
              <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-800">
                  Current stock:{' '}
                  {formatNumber(Number(selectedMaterial.current_qty || 0))}{' '}
                  {selectedMaterial.unit}
                </span>
              </div>
            )}
          </>
        )}

        {isEditing && transaction?.unit_cost == null && (
          <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
            This transaction has no recorded unit cost. The form may show the
            current material cost as a starting point. Confirm or correct it
            before saving; it may not be the original purchase price.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Quantity"
            type="number"
            value={qty}
            onChange={setQty}
            step="0.01"
            min="0"
            placeholder="0"
            required
          />

          <Input
            label={`Unit Cost (NGN/${selectedMaterial?.unit || 'unit'})`}
            type="number"
            value={unitCost}
            onChange={setUnitCost}
            step="0.01"
            min="0"
            placeholder="0"
            required
          />
        </div>

        <Input
          label="Date"
          type="date"
          value={date}
          onChange={setDate}
          required
        />

        <Input
          label="Vendor / Supplier"
          value={vendor}
          onChange={setVendor}
          placeholder="Enter vendor or supplier name"
          required
        />

        <Select
          label="Payment Method"
          value={paymentMethod}
          onChange={setPaymentMethod}
          options={paymentOptions}
        />

        <Input
          label="Notes (optional)"
          value={description}
          onChange={setDescription}
          placeholder="Additional details"
        />

        {qtyNum > 0 && unitCost.trim() !== '' && costNum >= 0 && (
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              Total cost:{' '}
              <span className="font-bold">
                {formatCurrency(qtyNum * costNum)}
              </span>
            </p>

            <p className="text-xs text-amber-600 mt-0.5">
              {isEditing ? 'Resulting stock' : 'New stock'}:{' '}
              {formatNumber(resultingStock)} {selectedMaterial?.unit}
            </p>

            <p className="text-xs text-stone-500 mt-1">
              This is an inventory transaction, not an operating expense.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !qty.trim() ||
              !unitCost.trim() ||
              !date ||
              !paymentMethod
            }
          >
            {saving
              ? 'Saving...'
              : isEditing
                ? 'Save Changes'
                : 'Log Stock In'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
