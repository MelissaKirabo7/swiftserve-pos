-- Staff accounts (app roles + passcodes), linked to auth users
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('superadmin','owner','rep')),
  passcode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_users_name_key ON public.app_users (lower(name));

GRANT SELECT ON public.app_users TO authenticated;
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in staff can read staff list"
  ON public.app_users FOR SELECT TO authenticated USING (true);

-- Shared live shop state: one row, replicated to every device in realtime
CREATE TABLE public.pos_state (
  id text PRIMARY KEY DEFAULT 'main',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

GRANT SELECT, INSERT, UPDATE ON public.pos_state TO authenticated;
GRANT ALL ON public.pos_state TO service_role;
ALTER TABLE public.pos_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in staff can read shop state"
  ON public.pos_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in staff can create shop state"
  ON public.pos_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Signed-in staff can update shop state"
  ON public.pos_state FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pos_state (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- Realtime so every open device sees changes immediately
ALTER TABLE public.pos_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_state;
ALTER TABLE public.app_users REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_users;

-- Seed staff accounts (auth users are provisioned on first sign-in screen load)
INSERT INTO public.app_users (name, role, passcode) VALUES
  ('Superadmin','superadmin','0000'),
  ('Aquila','owner','1111'),
  ('Jeremy','rep','2222');

-- Optimistic concurrency: bump version + stamp time on every write
CREATE OR REPLACE FUNCTION public.pos_state_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pos_state_touch_trg
  BEFORE UPDATE ON public.pos_state
  FOR EACH ROW EXECUTE FUNCTION public.pos_state_touch();
