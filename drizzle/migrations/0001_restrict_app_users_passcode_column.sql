-- Passcodes must not be readable by ordinary signed-in staff; managers read them
-- through a privileged server function instead.
REVOKE SELECT ON public.app_users FROM authenticated;
GRANT SELECT (id, auth_user_id, name, role, created_at) ON public.app_users TO authenticated;
