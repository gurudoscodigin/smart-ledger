

## Diagnosis

### Problem 1: Data siloed per user
All tables (`transacoes`, `bancos`, `cartoes`, `recorrencias_fixas`, `categorias`, `comprovantes`, `fornecedores`) have RLS policies that restrict SELECT to `auth.uid() = user_id`. This means an "assistente" can only see data they personally created, and the admin only sees data via a separate admin policy. In a shared financial system, **all authenticated users should see all records**.

The `user_id` column should remain for audit purposes (who created it), but should NOT restrict read access.

### Problem 2: Deleted users still visible in frontend
The Control Center query fetches all profiles without filtering out `[Removido]` users, so deleted users persist in the UI list.

---

## Plan

### Step 1: Migration — Open SELECT RLS for shared tables

Create a single migration that:
- **Drops** the per-user SELECT restrictions on: `transacoes`, `bancos`, `cartoes`, `recorrencias_fixas`, `categorias`, `fornecedores`, `preferencias_origem`
- **Creates** new SELECT policies allowing all authenticated users to read all rows (e.g. `USING (true)` for `TO authenticated`)
- Keeps existing INSERT/UPDATE/DELETE policies unchanged (users still only modify their own data)
- Keeps the admin-specific SELECT policies (they're harmless and redundant now)

Affected policies to replace:
- `transacoes`: "Users view own transacoes" → change to allow all authenticated
- `bancos`: "Users manage own bancos" (ALL) → split into separate SELECT (all) + INSERT/UPDATE/DELETE (own)
- `cartoes`: same as bancos
- `recorrencias_fixas`: same pattern
- `categorias`: same pattern
- `fornecedores`: same pattern
- `preferencias_origem`: same pattern

### Step 2: Frontend — Filter deleted users from Control Center

In `ControlCenter.tsx` line 274, filter the users list:
```
(users || []).filter(u => u.display_name !== '[Removido]')
```

### Step 3: Validate

- Verify that an assistente user can see all transactions, banks, and cards
- Verify that deleted users no longer appear in the Control Center list
- Verify that users can still only INSERT/UPDATE their own records

---

### Technical Detail: RLS Policy Changes

For tables using `ALL` command policies (bancos, cartoes, categorias, recorrencias_fixas, fornecedores, preferencias_origem), the single "Users manage own X" policy must be dropped and replaced with:
1. `SELECT` policy: `USING (true)` TO authenticated
2. `INSERT` policy: `WITH CHECK (auth.uid() = user_id)` TO authenticated
3. `UPDATE` policy: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` TO authenticated
4. `DELETE` policy: `USING (auth.uid() = user_id)` TO authenticated (or admin-only where appropriate)

For `transacoes`, only the SELECT policy changes; INSERT/UPDATE/DELETE are already separate.

