/*
# Fix: Reassign placeholder user_id to authenticated user

## Overview
When authentication was added, existing rows were backfilled with a placeholder
UUID (00000000-0000-0000-0000-000000000000). The owner-scoped RLS policies
(auth.uid() = user_id) filter these rows out for the real authenticated user,
making all existing data invisible.

This migration reassigns the user_id column on all placeholder rows to the
real authenticated user's UUID. Only the user_id column is changed — no other
fields (quantities, prices, names, etc.) are touched.

## Affected user
- Email: sip.savor2026@gmail.com
- UUID: f4791c25-7460-4aa2-8cab-21e7c1c3f006

## Tables updated
- raw_materials: 35 rows
- products: 17 rows
- recipe_items: 52 rows
- raw_material_transactions: 4 rows
- expenses: 2 rows

## Safety
- Only updates rows WHERE user_id = '00000000-0000-0000-0000-000000000000'
- Does NOT delete, drop, truncate, or modify any other columns
- Existing data (names, quantities, costs, etc.) remains completely intact
*/

UPDATE raw_materials
SET user_id = 'f4791c25-7460-4aa2-8cab-21e7c1c3f006'
WHERE user_id = '00000000-0000-0000-0000-000000000000';

UPDATE products
SET user_id = 'f4791c25-7460-4aa2-8cab-21e7c1c3f006'
WHERE user_id = '00000000-0000-0000-0000-000000000000';

UPDATE recipe_items
SET user_id = 'f4791c25-7460-4aa2-8cab-21e7c1c3f006'
WHERE user_id = '00000000-0000-0000-0000-000000000000';

UPDATE raw_material_transactions
SET user_id = 'f4791c25-7460-4aa2-8cab-21e7c1c3f006'
WHERE user_id = '00000000-0000-0000-0000-000000000000';

UPDATE expenses
SET user_id = 'f4791c25-7460-4aa2-8cab-21e7c1c3f006'
WHERE user_id = '00000000-0000-0000-0000-000000000000';
