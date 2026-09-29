import { useEffect, useState, useCallback } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Printer,
  Download,
  TrendingUp,
  Coins,
  Ban,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  type CustomerPayment,
  type Customer,
} from '@/lib/types';
import { CUSTOMER_PAYMENT_METHODS } from '@/lib/constants';
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
import { formatCurrency, formatDate, downloadCSV, downloadExcel, printReport } from '@/lib/utils';

interface PaymentWithCustomer extends CustomerPayment {
  customers: { name: string; state: string | null } | null;
  payment_allocations: { sale_id: string; allocated_amount: number; sales: { invoice_number: string | null } | null }[];
}

export default function Payments() {
  const [payments, setPayments] = useState<PaymentWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [showRecord, setShowRecord] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<PaymentWithCustomer | null>(null);
  const [voidPayment, setVoidPayment] = useState<PaymentWithCustomer | null>(null);

  const load = useCallback(async () => {
    const [payRes, custRes] = await Promise.all([
      supabase.from('customer_payments')
        .select('*, customers(name, state), payment_allocations(sale_id, allocated_amount, sales(invoice_number))')
        .order('payment_date', { ascending: false })
        .limit(1000),
      supabase.from('customers').select('*').order('name'),
    ]);
    setPayments((payRes.data || []) as PaymentWithCustomer[]);
    setCustomers((custRes.data || []) as Customer[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = payments.filter((p) => {
    if (filterMethod && p.payment_method !== filterMethod) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.payment_number?.toLowerCase().includes(s) ||
        p.customers?.name?.toLowerCase().includes(s) ||
        p.reference_number?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const totalReceived = filtered.filter((p) => !p.is_voided).reduce((sum, p) => sum + p.amount, 0);
  const cashTotal = filtered.filter((p) => !p.is_voided && p.payment_method === 'Cash').reduce((sum, p) => sum + p.amount, 0);
  const transferTotal = filtered.filter((p) => !p.is_voided && (p.payment_method === 'Bank Transfer' || p.payment_method === 'POS')).reduce((sum, p) => sum + p.amount, 0);

  const headers = ['Date', 'Payment #', 'Customer', 'Invoice', 'Amount', 'Method', 'Reference', 'Received By', 'Status'];
  const rows = filtered.map((p) => [
    formatDate(p.payment_date), p.payment_number,
    p.customers?.name || '—',
    p.payment_allocations?.[0]?.sales?.invoice_number || '—',
    p.amount, p.payment_method, p.reference_number || '—',
    p.received_by || '—', p.is_voided ? 'Voided' : 'Active',
  ]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Customer Payments"
        subtitle="Record and track customer payments — payments settle receivables, not new sales"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => {
              downloadCSV('Payment_Report', headers, rows);
            }}><Download className="w-4 h-4" /> CSV</Button>
            <Button onClick={() => setShowRecord(true)} disabled={customers.length === 0}>
              <Plus className="w-4 h-4" /> Record Payment
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Received" value={formatCurrency(totalReceived)} icon={Coins} accent="emerald" subtitle={`${filtered.filter((p) => !p.is_voided).length} payments`} />
        <StatCard label="Cash Received" value={formatCurrency(cashTotal)} icon={TrendingUp} accent="amber" />
        <StatCard label="Transfer/POS" value={formatCurrency(transferTotal)} icon={CreditCard} accent="blue" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by payment #, customer, or reference..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
          />
        </div>
        <div className="sm:w-48">
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
          >
            <option value="">All Methods</option>
            {CUSTOMER_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={CreditCard}
            title="No payments recorded"
            message="Record your first customer payment to see it here."
            action={customers.length > 0 ? <Button onClick={() => setShowRecord(true)}><Plus className="w-4 h-4" /> Record Payment</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Payment #</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Invoice</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Amount</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Method</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Reference</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Receipt</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-stone-500 uppercase">Void</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((p) => (
                  <tr key={p.id} className={`hover:bg-stone-50/50 ${p.is_voided ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 text-sm text-stone-600">{formatDate(p.payment_date)}</td>
                    <td className="px-5 py-3 text-sm font-mono text-stone-700">{p.payment_number}</td>
                    <td className="px-5 py-3 text-sm font-medium text-stone-900">{p.customers?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-stone-600">{p.payment_allocations?.[0]?.sales?.invoice_number || '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(p.amount)}</td>
                    <td className="px-5 py-3"><Badge color="blue">{p.payment_method}</Badge></td>
                    <td className="px-5 py-3 text-sm text-stone-500">{p.reference_number || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => setReceiptPayment(p)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors" title="Print receipt">
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {!p.is_voided && (
                        <button onClick={() => setVoidPayment(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="Void payment">
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td colSpan={4} className="px-5 py-3 text-right text-sm font-semibold text-stone-700">Total Received:</td>
                  <td className="px-5 py-3 text-right font-bold text-stone-900">{formatCurrency(totalReceived)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {showRecord && (
        <RecordPaymentModal customers={customers} onClose={() => setShowRecord(false)} onSaved={() => { setShowRecord(false); load(); }} />
      )}

      {receiptPayment && (
        <PaymentReceiptModal payment={receiptPayment} onClose={() => setReceiptPayment(null)} />
      )}

      {voidPayment && (
        <VoidPaymentModal payment={voidPayment} onClose={() => setVoidPayment(null)} onVoided={() => { setVoidPayment(null); load(); }} />
      )}
    </div>
  );
}

function RecordPaymentModal({ customers, onClose, onSaved }: { customers: Customer[]; onClose: () => void; onSaved: () => void }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [outstandingSales, setOutstandingSales] = useState<{ id: string; invoice_number: string | null; grand_total: number; payment_status: string }[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) return;
    supabase.from('sales')
      .select('id, invoice_number, grand_total, payment_status')
      .eq('customer_id', customerId)
      .in('payment_status', ['Unpaid', 'Partially Paid'])
      .order('sale_date', { ascending: true })
      .then(({ data }) => setOutstandingSales(data || []));
    setSelectedSaleId('');
  }, [customerId]);

  const selectedSale = outstandingSales.find((s) => s.id === selectedSaleId);
  const amountNum = parseFloat(amount) || 0;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (!customerId) { setError('Select a customer'); setSaving(false); return; }
      if (!amountNum || amountNum <= 0) { setError('Amount must be greater than 0'); setSaving(false); return; }
      const saleIds = selectedSaleId ? [selectedSaleId] : null;
      const allocatedAmounts = selectedSaleId ? [amountNum] : null;
      const { error: e } = await supabase.rpc('record_customer_payment', {
        p_customer_id: customerId,
        p_payment_date: paymentDate,
        p_amount: amountNum,
        p_payment_method: paymentMethod,
        p_reference_number: referenceNumber || null,
        p_notes: notes || null,
        p_received_by: receivedBy || null,
        p_sale_ids: saleIds,
        p_allocated_amounts: allocatedAmounts,
      });
      if (e) throw e;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Record Customer Payment">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
          >
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? ` — ${c.state}` : ''}</option>)}
          </select>
        </div>
        <Input label="Payment Date" type="date" value={paymentDate} onChange={setPaymentDate} />
        <Input label="Amount (NGN)" type="number" value={amount} onChange={setAmount} step="0.01" min="0" placeholder="0" required />
        <Select label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={CUSTOMER_PAYMENT_METHODS as unknown as string[]} />
        <Input label="Reference Number" value={referenceNumber} onChange={setReferenceNumber} placeholder="Transaction reference" />
        <Input label="Received By" value={receivedBy} onChange={setReceivedBy} placeholder="Who received the payment" />
        {outstandingSales.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Allocate to Invoice (optional)</label>
            <select
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
            >
              <option value="">Auto-allocate (FIFO)</option>
              {outstandingSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.invoice_number || s.id.slice(0, 8).toUpperCase()} — {formatCurrency(s.grand_total)} ({s.payment_status})
                </option>
              ))}
            </select>
          </div>
        )}
        {selectedSale && (
          <div className="bg-amber-50 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-stone-600">Invoice Total:</span><span className="font-medium">{formatCurrency(selectedSale.grand_total)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-600">New Payment:</span><span className="font-medium">{formatCurrency(amountNum)}</span></div>
            <div className="flex justify-between text-sm border-t border-amber-200 pt-1"><span className="text-stone-600">Remaining:</span><span className="font-bold">{formatCurrency(Math.max(0, selectedSale.grand_total - amountNum))}</span></div>
          </div>
        )}
        <Input label="Notes" value={notes} onChange={setNotes} placeholder="Additional notes" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !amount || !customerId}>{saving ? 'Recording...' : 'Record Payment'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentReceiptModal({ payment, onClose }: { payment: PaymentWithCustomer; onClose: () => void }) {
  const handlePrint = () => {
    const html = `<!DOCTYPE html><html><head><title>Payment Receipt - ${payment.payment_number}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;width:320px;margin:0 auto;padding:20px;color:#1c1917}
    .header{text-align:center;margin-bottom:16px}.header h1{font-size:20px;font-weight:bold}
    .header p{font-size:11px;color:#78716c;margin-top:2px}
    .divider{border-top:1px dashed #a8a29e;margin:12px 0}
    .row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px}
    .label{color:#57534e}.value{font-weight:bold}
    .total{font-size:16px;font-weight:bold;margin-top:8px}
    .center{text-align:center;font-size:11px;color:#78716c;margin-top:16px}
    </style></head><body>
    <div class="header"><h1>Sip &amp; Savor</h1><p>Beverage Production &amp; Sales</p></div>
    <div class="divider"></div>
    <div class="row"><span class="label">Payment #:</span><span class="value">${payment.payment_number}</span></div>
    <div class="row"><span class="label">Date:</span><span class="value">${formatDate(payment.payment_date)}</span></div>
    <div class="row"><span class="label">Customer:</span><span class="value">${payment.customers?.name || '—'}</span></div>
    <div class="row"><span class="label">Invoice:</span><span class="value">${payment.payment_allocations?.[0]?.sales?.invoice_number || '—'}</span></div>
    <div class="divider"></div>
    <div class="row total"><span>Amount Paid:</span><span>${formatCurrency(payment.amount)}</span></div>
    <div class="row"><span class="label">Payment Method:</span><span class="value">${payment.payment_method}</span></div>
    ${payment.reference_number ? `<div class="row"><span class="label">Reference:</span><span class="value">${payment.reference_number}</span></div>` : ''}
    ${payment.received_by ? `<div class="row"><span class="label">Received By:</span><span class="value">${payment.received_by}</span></div>` : ''}
    <div class="divider"></div>
    <div class="center">Thank you for your payment!</div>
    </body></html>`;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); }
  };

  return (
    <Modal open onClose={onClose} title="Payment Receipt" maxWidth="max-w-sm">
      <div className="space-y-4">
        <div className="border-2 border-dashed border-stone-200 rounded-xl p-5 bg-stone-50">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 mb-2">
              <CreditCard className="w-6 h-6 text-stone-900" />
            </div>
            <h3 className="font-bold text-stone-900">Sip &amp; Savor</h3>
            <p className="text-xs text-stone-400">Payment Receipt</p>
          </div>
          <div className="border-t border-dashed border-stone-300 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-stone-500">Payment #:</span><span className="font-medium text-stone-900">{payment.payment_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Date:</span><span className="font-medium text-stone-900">{formatDate(payment.payment_date)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Customer:</span><span className="font-medium text-stone-900">{payment.customers?.name || '—'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Invoice:</span><span className="font-medium text-stone-900">{payment.payment_allocations?.[0]?.sales?.invoice_number || '—'}</span></div>
          </div>
          <div className="border-t border-dashed border-stone-300 pt-3 mt-3">
            <div className="flex justify-between text-base font-bold text-stone-900 mb-1"><span>Amount Paid:</span><span>{formatCurrency(payment.amount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Method:</span><span className="font-medium text-stone-900">{payment.payment_method}</span></div>
            {payment.reference_number && <div className="flex justify-between text-sm"><span className="text-stone-500">Reference:</span><span className="font-medium text-stone-900">{payment.reference_number}</span></div>}
            {payment.received_by && <div className="flex justify-between text-sm"><span className="text-stone-500">Received By:</span><span className="font-medium text-stone-900">{payment.received_by}</span></div>}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">Close</Button>
          <Button onClick={handlePrint} className="flex-1"><Printer className="w-4 h-4" /> Print Receipt</Button>
        </div>
      </div>
    </Modal>
  );
}

function VoidPaymentModal({ payment, onClose, onVoided }: { payment: PaymentWithCustomer; onClose: () => void; onVoided: () => void }) {
  const [reason, setReason] = useState('');
  const [voidedBy, setVoidedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleVoid = async () => {
    setSaving(true);
    setError('');
    try {
      const { error: e } = await supabase.rpc('void_customer_payment', {
        p_payment_id: payment.id,
        p_void_reason: reason || null,
        p_voided_by: voidedBy || null,
      });
      if (e) throw e;
      onVoided();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void payment');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Void Payment">
      <div className="space-y-4">
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-sm text-red-800">
            You are about to void payment <span className="font-mono font-semibold">{payment.payment_number}</span> for {formatCurrency(payment.amount)}.
            This will reverse the allocation but preserve the payment record for audit purposes.
          </p>
        </div>
        <Input label="Void Reason" value={reason} onChange={setReason} placeholder="Why is this payment being voided?" />
        <Input label="Voided By" value={voidedBy} onChange={setVoidedBy} placeholder="Who is voiding this payment?" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleVoid} disabled={saving}>{saving ? 'Voiding...' : 'Void Payment'}</Button>
        </div>
      </div>
    </Modal>
  );
}



