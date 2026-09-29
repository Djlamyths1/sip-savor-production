import { useEffect, useState, useCallback } from 'react';
import {
  Receipt,
  Plus,
  Trash2,
  Pencil,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/context/PermissionContext';
import { type Expense } from '@/lib/types';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';

const BLOCKED_CATEGORIES = [
  'Raw Materials', 'Ingredients', 'Fruits & Ingredients', 'Stock-in',
  'Inventory Purchase', 'Production Materials', 'Stock Purchases',
  'Finished Products',
];
import {
  Card,
  Button,
  Input,
  Select,
  Badge,
  Spinner,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import Modal from '@/components/Modal';
import { formatCurrency, formatDate, classNames } from '@/lib/utils';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);

  const { canEnter, canView, canManage } = usePermissions();
  const canCreateExpenses = canEnter('expenses.create');
  const canViewExpenseHistory = canView('expenses.view_history');
  const canEditExpenses = canManage('expenses.edit');
  const canVoidExpenses = canManage('expenses.void');

  const load = useCallback(async () => {
    if (!canViewExpenseHistory) {
      setExpenses([]);
      setTotalAmount(0);
      setLoading(false);
      return;
    }

    let query = supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    if (filterCategory) query = query.eq('category', filterCategory);
    const { data, error } = await query;
    if (!error && data) {
      let filtered = data as Expense[];
      if (search) {
        filtered = filtered.filter(
          (e) =>
            e.description?.toLowerCase().includes(search.toLowerCase()) ||
            e.category.toLowerCase().includes(search.toLowerCase())
        );
      }
      setExpenses(filtered);
      const activeExpenses = filtered.filter((e) => !e.is_voided);
      setTotalAmount(activeExpenses.reduce((sum, e) => sum + e.amount, 0));
    }
    setLoading(false);
  }, [search, filterCategory, canViewExpenseHistory]);

  useEffect(() => {
    load();
  }, [load]);


  const handleVoid = async (id: string) => {
    const reason = window.prompt('Enter the reason for voiding this expense:')?.trim();

    if (!reason) return;

    const { error } = await supabase.rpc('void_expense', {
      p_expense_id: id,
      p_void_reason: reason,
    });

    if (error) {
      window.alert(error.message);
      return;
    }

    await load();
  };
  if (loading) return <Spinner />;

  const activeExpenseCount = expenses.filter((e) => !e.is_voided).length;
  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Track operating expenses — raw material purchases are inventory costs, not expenses"
        action={
          canCreateExpenses ? (
            <Button onClick={() => { setEditingExpense(null); setShowAdd(true); }}>
              <Plus className="w-4 h-4" /> Add Expense
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-stone-500">Total Expenses (filtered)</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{formatCurrency(totalAmount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-stone-500">Expense Count</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{activeExpenseCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-stone-500">Avg per Expense</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            {formatCurrency(activeExpenseCount > 0 ? totalAmount / activeExpenseCount : 0)}
          </p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description, vendor, or category..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
          />
        </div>
        <div className="sm:w-56">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
          >
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {expenses.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Receipt}
            title="No expenses found"
            message="Record operating expenses like utilities, transport, salaries, and rent. Raw material purchases are tracked separately as inventory costs."
            action={
              canCreateExpenses ? (
                <Button onClick={() => { setEditingExpense(null); setShowAdd(true); }}>
                  <Plus className="w-4 h-4" /> Add Expense
                </Button>
              ) : undefined
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
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Category</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Description</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Vendor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Payment</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Amount</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-sm text-stone-600">{formatDate(e.expense_date)}</td>
                    <td className="px-5 py-3">
                      <Badge color="blue">{e.category}</Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-stone-700">{e.description || '—'}</td>
                    <td className="px-5 py-3 text-sm text-stone-500">�</td>
                    <td className="px-5 py-3 text-sm text-stone-500">{e.payment_method}</td>
                    <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEditExpenses && (
                          <button
                            onClick={() => { setEditingExpense(e); setShowAdd(true); }}
                            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canVoidExpenses && (
                          <button
                            onClick={() => handleVoid(e.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total:</td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {showAdd && (
        <AddEditExpenseModal
          expense={editingExpense}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

function AddEditExpenseModal({
  expense,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(expense?.expense_date || new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [category, setCategory] = useState(expense?.category || 'Miscellaneous');
  const [description, setDescription] = useState(expense?.description || '');
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(expense?.payment_method || 'Cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const amountNum = parseFloat(amount);
      if (!amountNum || amountNum <= 0) {
        setError('Amount must be greater than 0');
        setSaving(false);
        return;
      }
      if (BLOCKED_CATEGORIES.some((c) => c.toLowerCase() === category.toLowerCase())) {
        setError('Raw material and inventory purchases must be recorded through Purchases/Inventory, not Expenses.');
        setSaving(false);
        return;
      }
      if (expense) {
        const editReason = window.prompt('Enter the reason for editing this expense:')?.trim();

        if (!editReason) {
          setSaving(false);
          return;
        }

        const { error: e } = await supabase.rpc('update_expense', {
          p_expense_id: expense.id,
          p_expense_date: date,
          p_amount: amountNum,
          p_category: category,
          p_description: description || null,
          p_reference_number: vendor || null,
          p_payment_method: paymentMethod,
          p_notes: null,
          p_edit_reason: editReason,
        });

        if (e) throw e;
      } else {
        const { error: e } = await supabase.rpc('create_expense', {
          p_expense_date: date,
          p_amount: amountNum,
          p_category: category,
          p_description: description || null,
          p_reference_number: vendor || null,
          p_payment_method: paymentMethod,
          p_notes: null,
        });

        if (e) throw e;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Date" type="date" value={date} onChange={setDate} required />
          <Input label="Amount (NGN)" type="number" value={amount} onChange={setAmount} step="0.01" min="0" placeholder="0" required />
        </div>
        <Select label="Category" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES} />
        <Input label="Description" value={description} onChange={setDescription} placeholder="What was this expense for?" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Vendor (optional)" value={vendor} onChange={setVendor} placeholder="Who did you pay?" />
          <Select label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : expense ? 'Update' : 'Add Expense'}</Button>
        </div>
      </div>
    </Modal>
  );
}























