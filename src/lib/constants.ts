export const CATEGORIES = [
  'Fruits & Ingredients',
  'Syrups/Flavorings',
  'Dairy/Yogurt',
  'Packaging',
  'Bottles/Containers',
  'Labels/Branding',
  'Napkins/Accessories',
  'Cleaning Supplies',
  'Other',
] as const;

export const EXPENSE_CATEGORIES = [
  'Logistics & Transportation',
  'Electricity',
  'Water',
  'Waste Management',
  'Salaries & Wages',
  'Rent',
  'Packaging',
  'Fuel & Generator',
  'Internet & Communication',
  'Repairs & Maintenance',
  'Equipment Maintenance',
  'Cleaning & Sanitation',
  'Office Supplies',
  'Marketing & Advertising',
  'Bank & Payment Charges',
  'Licenses & Permits',
  'Insurance',
  'Security',
  'Professional Services',
  'Taxes & Government Levies',
  'Staff Welfare',
  'Equipment Rental',
  'Utilities',
  'Miscellaneous',
] as const;

export const UNITS = [
  'kg',
  'g',
  'liters',
  'ml',
  'pieces',
  'packs',
  'bottles',
  'cups',
  'units',
] as const;

export const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'Card',
  'Mobile Money',
  'Cheque',
] as const;

export const CUSTOMER_PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'POS',
  'Cheque',
  'Other',
] as const;

export const SALE_PAYMENT_STATUS = [
  'Paid',
  'Partially Paid',
  'Credit',
] as const;

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export const DELIVERY_METHODS = [
  'Company Vehicle',
  'Staff/Driver',
  'Transport Company',
  'Courier',
  'Dispatch Rider',
  'Customer Pickup',
  'Third-Party Logistics',
  'Other',
] as const;

export const DELIVERY_STATUSES = [
  'Pending',
  'Preparing',
  'Ready for Dispatch',
  'Dispatched',
  'In Transit',
  'Arrived at Destination',
  'Delivered',
  'Failed Delivery',
  'Returned',
  'Cancelled',
] as const;

export const DELIVERY_REQUIREMENTS = [
  'Keep Cool',
  'Refrigerated',
  'Fragile',
  'Upright',
  'Same-Day Delivery',
  'Cold Chain Required',
] as const;

export const ADJUSTMENT_REASONS = [
  'Spoilage',
  'Spillage',
  'Correction',
  'Theft/Loss',
  'Gift/Sample',
  'Other',
] as const;

export const FINISHED_ADJUSTMENT_REASONS = [
  'Spoilage',
  'Sample',
  'Gifting',
  'Correction',
  'Other',
] as const;

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { id: 'raw-materials', label: 'Raw Materials', icon: 'Package' },
  { id: 'stock-in', label: 'Stock In', icon: 'ArrowDownToLine' },
  { id: 'products', label: 'Products', icon: 'ShoppingBag' },
  { id: 'recipes', label: 'Recipes', icon: 'ChefHat' },
  { id: 'production', label: 'Production', icon: 'Factory' },
  { id: 'sales', label: 'Sales', icon: 'ShoppingCart' },
  { id: 'customers', label: 'Customers', icon: 'Users' },
  { id: 'payments', label: 'Payments', icon: 'CreditCard' },
  { id: 'deliveries', label: 'Deliveries', icon: 'Truck' },
  { id: 'expenses', label: 'Expenses', icon: 'Receipt' },
  { id: 'reports', label: 'Reports', icon: 'BarChart3' },
  { id: 'user-management', label: 'User Management', icon: 'UserCog' },
  { id: 'database-export', label: 'Database Export', icon: 'Download' },
] as const;

export type NavId = (typeof NAV_ITEMS)[number]['id'];


