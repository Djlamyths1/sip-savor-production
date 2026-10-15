
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Users,
  Plus,
  Pencil,
  Search,
  Phone,
  MapPin,
  CreditCard,
  FileText,
  Printer,
  TrendingDown,
  TrendingUp,
  Coins,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  type Customer,
  type CustomerOutstanding,
  type Sale,
  type CustomerPayment,
} from '@/lib/types';
import { NIGERIAN_STATES, CUSTOMER_PAYMENT_METHODS } from '@/lib/constants';
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
import { formatCurrency, formatDate, classNames } from '@/lib/utils';

interface SaleWithAllocations extends Sale {
  amount_paid: number;
  outstanding: number;
}

interface PaymentWithAllocations extends CustomerPayment {
  payment_allocations: {
    sale_id: string;
    allocated_amount: number;
    sales: { invoice_number: string | null } | null;
  }[];
}

const EMPTY_OUTSTANDING: CustomerOutstanding = {
  total_purchases: 0,
  total_paid: 0,
  total_outstanding: 0,
  outstanding_invoices: 0,
};

const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;

const escapeHtml = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null);

  // Load the customer list.
  const load = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      setLoadError('');

      const list = (data ?? []) as Customer[];
      setCustomers(list);

      setSelectedCustomer((prev) =>
        prev
          ? list.find((c) => c.id === prev.id) ?? prev
          : prev
      );
    } catch (err) {
      console.error('Failed to load customers:', err);

      if (err && typeof err === 'object' && 'message' in err) {
        setLoadError(String(err.message));
      } else {
        setLoadError(JSON.stringify(err) || String(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const term = search.trim().toLowerCase();

  const filtered = term
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term) ||
          c.state?.toLowerCase().includes(term)
      )
    : customers;

  if (loading) return <Spinner />;

  // Keep modals available from both the list and profile views.
  const modals = (
    <>
      {showAdd && (
        <CustomerModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            void load();
          }}
        />
      )}

      {editing && (
        <CustomerModal
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );

  if (selectedCustomer) {
    return (
      <>
        <CustomerProfile
          customer={selectedCustomer}
          onBack={() => setSelectedCustomer(null)}
          onEdit={() => setEditing(selectedCustomer)}
          onSaved={() => {
            void load();
          }}
        />
        {modals}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Manage customer profiles, credit limits, and account balances"
        action={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        }
      />

      {loadError && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50/50">
          <p className="text-sm font-medium text-red-700">
            Could not load customers: {loadError}
          </p>
        </Card>
      )}

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or state..."
          className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          {customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No customers yet"
              message="Add your first customer to start tracking sales, payments, and deliveries."
              action={
                <Button onClick={() => setShowAdd(true)}>
                  <Plus className="w-4 h-4" /> Add Customer
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No matching customers"
              message={`Nothing matches "${search}". Try a different name, phone number, or state.`}
            />
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              onClick={() => setSelectedCustomer(c)}
              onEdit={() => setEditing(c)}
            />
          ))}
        </div>
      )}

      {modals}
    </div>
  );
}

function CustomerCard({
  customer,
  onClick,
  onEdit,
}: {
  customer: Customer;
  onClick: () => void;
  onEdit: () => void;
}) {
  return (
    <div onClick={onClick} className="cursor-pointer">
      <Card className="p-5 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-stone-900">
              {customer.name}
            </h3>
            {customer.contact_person && (
              <p className="text-xs text-stone-500 mt-0.5">
                {customer.contact_person}
              </p>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors"
            aria-label={`Edit ${customer.name}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5 text-sm text-stone-600">
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-stone-400" />
              {customer.phone}
            </div>
          )}

          {customer.state && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-stone-400" />
              {customer.city ? `${customer.city}, ` : ''}
              {customer.state}
            </div>
          )}
        </div>

        {customer.credit_limit > 0 && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-500">
              Credit Limit:{' '}
            </span>
            <span className="text-xs font-semibold text-stone-700">
              {formatCurrency(customer.credit_limit)}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

function CustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [state, setState] = useState(customer?.state || 'Edo');
  const [lga, setLga] = useState(customer?.lga || '');
  const [city, setCity] = useState(customer?.city || '');
  const [town, setTown] = useState(customer?.town || '');
  const [deliveryAddress, setDeliveryAddress] = useState(
    customer?.delivery_address || ''
  );
  const [landmark, setLandmark] = useState(customer?.landmark || '');
  const [contactPerson, setContactPerson] = useState(
    customer?.contact_person || ''
  );
  const [altPhone, setAltPhone] = useState(
    customer?.alternative_phone || ''
  );
  const [deliveryNotes, setDeliveryNotes] = useState(
    customer?.delivery_notes || ''
  );
  const [creditLimit, setCreditLimit] = useState(
    customer ? String(customer.credit_limit) : '0'
  );
  const [notes, setNotes] = useState(customer?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      if (!name.trim()) {
        setError('Customer name is required');
        setSaving(false);
        return;
      }

      const limit = parseFloat(creditLimit) || 0;

      if (limit < 0) {
        setError('Credit limit cannot be negative');
        setSaving(false);
        return;
      }

      const payload = {
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        address: address || null,
        state,
        lga: lga || null,
        city: city || null,
        town: town || null,
        delivery_address: deliveryAddress || null,
        landmark: landmark || null,
        contact_person: contactPerson || null,
        alternative_phone: altPhone || null,
        delivery_notes: deliveryNotes || null,
        credit_limit: limit,
        notes: notes || null,
      };

      if (customer) {
        const { error: e } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', customer.id);

        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from('customers')
          .insert(payload);

        if (e) throw e;
      }

      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save customer'
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? 'Edit Customer' : 'Add Customer'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Customer Name"
            value={name}
            onChange={setName}
            placeholder="Business name"
            required
          />
          <Input
            label="Contact Person"
            value={contactPerson}
            onChange={setContactPerson}
            placeholder="Contact person"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="Phone number"
          />
          <Input
            label="Alternative Phone"
            value={altPhone}
            onChange={setAltPhone}
            placeholder="Alt phone"
          />
        </div>

        <Input
          label="Email"
          value={email}
          onChange={setEmail}
          placeholder="Email address"
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="State"
            value={state}
            onChange={setState}
            options={NIGERIAN_STATES as unknown as string[]}
          />
          <Input
            label="LGA"
            value={lga}
            onChange={setLga}
            placeholder="Local Govt Area"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="City"
            value={city}
            onChange={setCity}
            placeholder="City"
          />
          <Input
            label="Town"
            value={town}
            onChange={setTown}
            placeholder="Town/Area"
          />
        </div>

        <Input
          label="Delivery Address"
          value={deliveryAddress}
          onChange={setDeliveryAddress}
          placeholder="Full delivery address"
        />
        <Input
          label="Landmark"
          value={landmark}
          onChange={setLandmark}
          placeholder="Nearby landmark"
        />
        <Input
          label="Delivery Notes"
          value={deliveryNotes}
          onChange={setDeliveryNotes}
          placeholder="Special delivery instructions"
        />
        <Input
          label="Credit Limit (NGN)"
          type="number"
          value={creditLimit}
          onChange={setCreditLimit}
          step="0.01"
          min="0"
          placeholder="0"
        />
        <Input
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Internal notes"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving...' : 'Save Customer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomerProfile({
  customer,
  onBack,
  onEdit,
  onSaved,
}: {
  customer: Customer;
  onBack: () => void;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<
    'overview' | 'invoices' | 'payments' | 'statement'
  >('overview');
  const [outstanding, setOutstanding] =
    useState<CustomerOutstanding>(EMPTY_OUTSTANDING);
  const [rawSales, setRawSales] = useState<Sale[]>([]);
  const [payments, setPayments] =
    useState<PaymentWithAllocations[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showRecordPayment, setShowRecordPayment] = useState(false);

  // Load this customer's balance, sales, and payment allocations.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const [outRes, salesRes, payRes] = await Promise.all([
        supabase.rpc('get_customer_outstanding', {
          p_customer_id: customer.id,
        }),


        supabase
          .from('sales')
          .select('*')
          .eq('customer_id', customer.id)
          .order('sale_date', { ascending: false }),


        supabase
          .from('customer_payments')
          .select(`
            *,
            payment_allocations (
              sale_id,
              allocated_amount,
              sales (invoice_number)
            )
          `)
          .eq('customer_id', customer.id)
          .order('payment_date', { ascending: false }),
      ]);

      const firstError =
        outRes.error || salesRes.error || payRes.error;

      if (firstError) {
        throw firstError;
      }

      const balanceData = Array.isArray(outRes.data)
        ? outRes.data[0]
        : outRes.data;

      setOutstanding(
        (balanceData as CustomerOutstanding | null) ??
          EMPTY_OUTSTANDING
      );


const salesData = (salesRes.data ?? []).map((sale) => {
  const row = sale as unknown as Record<string, unknown>;

  return {
    ...row,
    date: String(row.sale_date ?? ''),
    total_amount: Number(row.grand_total ?? 0),
  } as unknown as Sale;
});

setRawSales(salesData);


      setPayments(
        (payRes.data ?? []) as unknown as PaymentWithAllocations[]
      );
    } catch (err) {
      console.error('Failed to load customer profile:', err);

      if (err && typeof err === 'object' && 'message' in err) {
        setLoadError(String(err.message));
      } else {
        setLoadError(JSON.stringify(err) || String(err));
      }
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Derive invoice payments from non-voided payment allocations.
  const sales: SaleWithAllocations[] = useMemo(() => {
    const paidBySale = new Map<string, number>();

    payments
      .filter((p) => !p.is_voided)
      .forEach((p) =>
        p.payment_allocations?.forEach((a) =>
          paidBySale.set(
            a.sale_id,
            (paidBySale.get(a.sale_id) || 0) +
              Number(a.allocated_amount)
          )
        )
      );

    return rawSales.map((s) => {
      const paid = round2(paidBySale.get(s.id) || 0);

      return {
        ...s,
        amount_paid: paid,
        outstanding: Math.max(
          0,
          round2(s.total_amount - paid)
        ),
      };
    });
  }, [rawSales, payments]);

  const outstandingInvoices = sales.filter(
    (s) => s.payment_status !== 'Paid'
  );

  const creditLimit = customer.credit_limit || 0;
  const atOrOverLimit =
    creditLimit > 0 &&
    outstanding.total_outstanding >= creditLimit;
  const overLimit =
    creditLimit > 0 &&
    outstanding.total_outstanding > creditLimit;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-sm text-stone-500 hover:text-stone-700 flex items-center gap-1"
        >
          ← Back to Customers
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {customer.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-stone-500">
            {customer.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {customer.phone}
              </span>
            )}
            {customer.state && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {customer.city ? `${customer.city}, ` : ''}
                {customer.state}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onEdit}>
            <Pencil className="w-4 h-4" /> Edit
          </Button>
          <Button onClick={() => setShowRecordPayment(true)}>
            <CreditCard className="w-4 h-4" /> Record Payment
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="p-4 mb-6 border-red-200 bg-red-50/50">
          <p className="text-sm font-medium text-red-700">
            Some account data could not be loaded: {loadError}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Purchases"
          value={formatCurrency(outstanding.total_purchases)}
          icon={Coins}
          accent="emerald"
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(outstanding.total_paid)}
          icon={TrendingUp}
          accent="blue"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(outstanding.total_outstanding)}
          icon={TrendingDown}
          accent="red"
          subtitle={`${outstanding.outstanding_invoices} invoices`}
        />
        <StatCard
          label="Credit Limit"
          value={formatCurrency(customer.credit_limit)}
          icon={CreditCard}
          accent="amber"
        />
      </div>

      {atOrOverLimit && (
        <Card className="p-4 mb-6 border-red-200 bg-red-50/50">
          <p className="text-sm font-medium text-red-700">
            {overLimit
              ? `Customer has exceeded their credit limit of ${formatCurrency(creditLimit)}.`
              : `Customer has reached their credit limit of ${formatCurrency(creditLimit)}.`}
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {(
          ['overview', 'invoices', 'payments', 'statement'] as const
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={classNames(
              'px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all',
              tab === t
                ? 'bg-stone-900 text-white shadow-sm'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            )}
          >
            {t === 'invoices' ? 'Outstanding Invoices' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-5">
                <h3 className="font-semibold text-stone-900 mb-4">
                  Customer Details
                </h3>
                <div className="space-y-2 text-sm">
                  <DetailRow
                    label="Contact Person"
                    value={customer.contact_person}
                  />
                  <DetailRow label="Phone" value={customer.phone} />
                  <DetailRow
                    label="Alt Phone"
                    value={customer.alternative_phone}
                  />
                  <DetailRow label="Email" value={customer.email} />
                  <DetailRow label="State" value={customer.state} />
                  <DetailRow label="LGA" value={customer.lga} />
                  <DetailRow label="City" value={customer.city} />
                  <DetailRow label="Town" value={customer.town} />
                  <DetailRow
                    label="Delivery Address"
                    value={customer.delivery_address}
                  />
                  <DetailRow
                    label="Landmark"
                    value={customer.landmark}
                  />
                  <DetailRow
                    label="Delivery Notes"
                    value={customer.delivery_notes}
                  />
                  <DetailRow label="Notes" value={customer.notes} />
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold text-stone-900 mb-4">
                  Recent Invoices
                </h3>

                {sales.length === 0 ? (
                  <p className="text-sm text-stone-400">
                    No invoices yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sales.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium text-stone-900">
                            {s.invoice_number ||
                              s.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="text-xs text-stone-400">
                            {formatDate(s.date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-stone-900">
                            {formatCurrency(s.total_amount)}
                          </p>
                          <PaymentStatusBadge
                            status={s.payment_status}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === 'invoices' && (
            <Card className="overflow-hidden">
              {outstandingInvoices.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No outstanding invoices"
                  message="All invoices are fully paid."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Invoice #
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Date
                        </th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Total
                        </th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Paid
                        </th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Outstanding
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {outstandingInvoices.map((s) => (
                        <tr
                          key={s.id}
                          className="hover:bg-stone-50/50"
                        >
                          <td className="px-5 py-3 text-sm font-mono text-stone-700">
                            {s.invoice_number || '—'}
                          </td>
                          <td className="px-5 py-3 text-sm text-stone-600">
                            {formatDate(s.date)}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-stone-900">
                            {formatCurrency(s.total_amount)}
                          </td>
                          <td className="px-5 py-3 text-right text-sm text-stone-600">
                            {formatCurrency(s.amount_paid)}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-red-600">
                            {formatCurrency(s.outstanding)}
                          </td>
                          <td className="px-5 py-3">
                            <PaymentStatusBadge
                              status={s.payment_status}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === 'payments' && (
            <Card className="overflow-hidden">
              {payments.length === 0 ? (
                <EmptyState
                  icon={CreditCard}
                  title="No payments recorded"
                  message="Record a payment to see it here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Date
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Payment #
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Invoice(s)
                        </th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Amount
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Method
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Reference
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {payments.map((p) => {
                        const invoiceNumbers = (
                          p.payment_allocations || []
                        ).map(
                          (a) =>
                            a.sales?.invoice_number ||
                            a.sale_id.slice(0, 8).toUpperCase()
                        );

                        const inv = invoiceNumbers.length
                          ? invoiceNumbers.join(', ')
                          : '—';

                        return (
                          <tr
                            key={p.id}
                            className="hover:bg-stone-50/50"
                          >
                            <td className="px-5 py-3 text-sm text-stone-600">
                              {formatDate(p.payment_date)}
                            </td>
                            <td className="px-5 py-3 text-sm font-mono text-stone-700">
                              {p.payment_number}
                            </td>
                            <td className="px-5 py-3 text-sm text-stone-600">
                              {inv}
                            </td>
                            <td className="px-5 py-3 text-right font-semibold text-stone-900">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="px-5 py-3 text-sm text-stone-600">
                              {p.payment_method}
                            </td>
                            <td className="px-5 py-3 text-sm text-stone-500">
                              {p.reference_number || '—'}
                            </td>
                            <td className="px-5 py-3">
                              {p.is_voided ? (
                                <Badge color="red">Voided</Badge>
                              ) : (
                                <Badge color="green">Active</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {tab === 'statement' && (
            <CustomerStatement
              customer={customer}
              sales={sales}
              payments={payments}
            />
          )}
        </>
      )}

      {showRecordPayment && (
        <RecordPaymentModal
          customer={customer}
          sales={outstandingInvoices}
          onClose={() => setShowRecordPayment(false)}
          onSaved={() => {
            setShowRecordPayment(false);
            void load();
            onSaved();
          }}
        />
      )}
    </div>
  );
}

function CustomerStatement({
  customer,
  sales,
  payments,
}: {
  customer: Customer;
  sales: SaleWithAllocations[];
  payments: PaymentWithAllocations[];
}) {
  type Row = {
    date: string;
    ref: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  };

  const rows: Row[] = useMemo(() => {
    // Sales come before payments on the same date.
    const allItems: {
      date: string;
      kind: number;
      ref: string;
      desc: string;
      debit: number;
      credit: number;
    }[] = [
      ...sales.map((s) => ({
        date: s.date,
        kind: 0,
        ref:
          s.invoice_number || s.id.slice(0, 8).toUpperCase(),
        desc: 'Sale',
        debit: s.total_amount,
        credit: 0,
      })),
      ...payments
        .filter((p) => !p.is_voided)
        .map((p) => ({
          date: p.payment_date,
          kind: 1,
          ref: p.payment_number,
          desc: 'Payment',
          debit: 0,
          credit: p.amount,
        })),
    ].sort((a, b) => {
      const byDate = String(a.date).localeCompare(String(b.date));
      return byDate !== 0 ? byDate : a.kind - b.kind;
    });

    let balance = 0;

    return allItems.map((item) => {
      balance = round2(balance + item.debit - item.credit);

      return {
        date: item.date,
        ref: item.ref,
        description: item.desc,
        debit: item.debit,
        credit: item.credit,
        balance,
      };
    });
  }, [sales, payments]);

  const closingBalance = rows.length
    ? rows[rows.length - 1].balance
    : 0;

  const handlePrint = () => {
    const html = `<!DOCTYPE html><html><head><title>Statement - ${escapeHtml(customer.name)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px;color:#1c1917}
    .header{text-align:center;margin-bottom:24px}.header h1{font-size:22px;font-weight:bold}
    .header p{font-size:12px;color:#78716c;margin-top:2px}
    .customer{margin-bottom:20px}.customer h2{font-size:16px}.customer p{font-size:13px;color:#57534e}
    table{width:100%;border-collapse:collapse}th{background:#f5f5f0;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;border-bottom:2px solid #e7e5e4}
    td{padding:8px;border-bottom:1px solid #f5f5f4;font-size:12px}.right{text-align:right}
    .closing{margin-top:20px;font-size:16px;font-weight:bold}
    @media print{body{padding:15px}}
    </style></head><body>
    <div class="header"><h1>Sip &amp; Savor</h1><p>Beverage Production &amp; Sales</p></div>
    <div class="customer"><h2>${escapeHtml(customer.name)}</h2>${customer.phone ? `<p>${escapeHtml(customer.phone)}</p>` : ''}${customer.state ? `<p>${escapeHtml(customer.state)}</p>` : ''}</div>
    <table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${escapeHtml(formatDate(r.date))}</td><td>${escapeHtml(r.ref)}</td><td>${escapeHtml(r.description)}</td><td class="right">${r.debit ? formatCurrency(r.debit) : '—'}</td><td class="right">${r.credit ? formatCurrency(r.credit) : '—'}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')}</tbody></table>
    <div class="closing">Closing Balance: ${formatCurrency(closingBalance)}</div>
    </body></html>`;

    const w = window.open('', '_blank');

    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 250);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex justify-end px-5 py-3 border-b border-stone-100">
        <Button
          variant="secondary"
          onClick={handlePrint}
          disabled={rows.length === 0}
        >
          <Printer className="w-4 h-4" /> Print Statement
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No transactions"
          message="No sales or payments to show."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                  Date
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                  Reference
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                  Description
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                  Debit
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                  Credit
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-stone-500 uppercase">
                  Balance
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-stone-50/50">
                  <td className="px-5 py-3 text-sm text-stone-600">
                    {formatDate(r.date)}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-stone-700">
                    {r.ref}
                  </td>
                  <td className="px-5 py-3 text-sm text-stone-700">
                    {r.description}
                  </td>
                  <td className="px-5 py-3 text-right text-sm">
                    {r.debit ? formatCurrency(r.debit) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-emerald-600">
                    {r.credit ? formatCurrency(r.credit) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-stone-900">
                    {formatCurrency(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-stone-50 border-t-2 border-stone-200">
                <td
                  colSpan={5}
                  className="px-5 py-3 text-right text-sm font-semibold text-stone-700"
                >
                  Closing Balance:
                </td>
                <td className="px-5 py-3 text-right font-bold text-stone-900">
                  {formatCurrency(closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function RecordPaymentModal({
  customer,
  sales,
  onClose,
  onSaved,
}: {
  customer: Customer;
  sales: SaleWithAllocations[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedSale = sales.find(
    (s) => s.id === selectedSaleId
  );
  const amountNum = parseFloat(amount) || 0;

  const totalOutstanding = round2(
    sales.reduce((sum, s) => sum + s.outstanding, 0)
  );

  // A payment can be allocated to one invoice or automatically by FIFO.
  const maxAllowed = selectedSale
    ? selectedSale.outstanding
    : totalOutstanding;

  const exceedsBalance =
    amountNum > 0 &&
    sales.length > 0 &&
    round2(amountNum) > maxAllowed;

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      if (!amountNum || amountNum <= 0) {
        setError('Amount must be greater than 0');
        setSaving(false);
        return;
      }

      if (exceedsBalance) {
        setError(
          `Amount cannot exceed the ${selectedSale ? 'invoice' : 'total'} outstanding balance of ${formatCurrency(maxAllowed)}`
        );
        setSaving(false);
        return;
      }

      const saleIds = selectedSaleId
        ? [selectedSaleId]
        : null;
      const allocatedAmounts = selectedSaleId
        ? [amountNum]
        : null;

      const { error: e } = await supabase.rpc(
        'record_customer_payment',
        {
          p_customer_id: customer.id,
          p_payment_date: paymentDate,
          p_amount: amountNum,
          p_payment_method: paymentMethod,
          p_reference_number: referenceNumber || null,
          p_notes: notes || null,
          p_received_by: receivedBy || null,
          p_sale_ids: saleIds,
          p_allocated_amounts: allocatedAmounts,
        }
      );

      if (e) throw e;

      onSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to record payment'
      );
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Record Payment">
      <div className="space-y-4">
        <div className="bg-stone-50 rounded-lg p-3">
          <p className="text-sm font-medium text-stone-700">
            {customer.name}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            {customer.state || 'No state set'}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            Total outstanding: {formatCurrency(totalOutstanding)}
          </p>
        </div>

        <Input
          label="Payment Date"
          type="date"
          value={paymentDate}
          onChange={setPaymentDate}
        />
        <Input
          label="Amount (NGN)"
          type="number"
          value={amount}
          onChange={setAmount}
          step="0.01"
          min="0"
          placeholder="0"
          required
        />
        <Select
          label="Payment Method"
          value={paymentMethod}
          onChange={setPaymentMethod}
          options={
            CUSTOMER_PAYMENT_METHODS as unknown as string[]
          }
        />
        <Input
          label="Reference Number"
          value={referenceNumber}
          onChange={setReferenceNumber}
          placeholder="Transaction reference"
        />
        <Input
          label="Received By"
          value={receivedBy}
          onChange={setReceivedBy}
          placeholder="Who received the payment"
        />

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            Allocate to Invoice (optional)
          </label>
          <select
            value={selectedSaleId}
            onChange={(e) => setSelectedSaleId(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
          >
            <option value="">Auto-allocate (FIFO)</option>
            {sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.invoice_number ||
                  s.id.slice(0, 8).toUpperCase()}{' '}
                — {formatCurrency(s.outstanding)} due of{' '}
                {formatCurrency(s.total_amount)} (
                {s.payment_status})
              </option>
            ))}
          </select>
        </div>

        {selectedSale && (
          <div className="bg-amber-50 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">Invoice Total:</span>
              <span className="font-medium">
                {formatCurrency(selectedSale.total_amount)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">Already Paid:</span>
              <span className="font-medium">
                {formatCurrency(selectedSale.amount_paid)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">Outstanding:</span>
              <span className="font-medium">
                {formatCurrency(selectedSale.outstanding)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">New Payment:</span>
              <span className="font-medium">
                {formatCurrency(amountNum)}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t border-amber-200 pt-1">
              <span className="text-stone-600">Remaining:</span>
              <span className="font-bold">
                {formatCurrency(
                  Math.max(
                    0,
                    round2(
                      selectedSale.outstanding - amountNum
                    )
                  )
                )}
              </span>
            </div>
          </div>
        )}

        {exceedsBalance && (
          <p className="text-sm text-red-600">
            This is more than the{' '}
            {selectedSale ? 'invoice' : 'total'} outstanding balance
            of {formatCurrency(maxAllowed)}.
          </p>
        )}

        <Input
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Additional notes"
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !amountNum || exceedsBalance}
          >
            {saving ? 'Recording...' : 'Record Payment'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <div className="flex justify-between">
      <span className="text-stone-500">{label}:</span>
      <span className="text-stone-800 font-medium text-right">
        {value}
      </span>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'Paid') {
    return <Badge color="green">Paid</Badge>;
  }

  if (status === 'Partially Paid') {
    return <Badge color="amber">Partially Paid</Badge>;
  }

  if (status === 'Unpaid') {
    return <Badge color="red">Unpaid</Badge>;
  }

  if (status === 'Credit') {
    return <Badge color="red">Credit</Badge>;
  }

  return <Badge color="stone">{status}</Badge>;
}
