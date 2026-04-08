-- Drop the overly permissive INSERT policy on audit_logs
DROP POLICY IF EXISTS "System inserts audit logs" ON public.audit_logs;