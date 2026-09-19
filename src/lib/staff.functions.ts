import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Role = "superadmin" | "owner" | "rep";

export type StaffPublic = { id: string; name: string; role: Role };

const DOMAIN = "aquila-pos.app";

function emailFor(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}@${DOMAIN}`;
}

function passwordFor(passcode: string) {
  return `pos-${passcode}`;
}

/** Staff list for the sign-in picker. Never returns passcodes. */
export const listStaff = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, name, role")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as StaffPublic[];
});

/** Creates the login account behind each staff passcode. Idempotent. */
export const provisionStaff = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, name, passcode, auth_user_id");
  if (error) throw error;

  let created = 0;
  for (const row of data ?? []) {
    if (row.auth_user_id) continue;
    const email = emailFor(row.name);
    const made = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordFor(row.passcode),
      email_confirm: true,
      user_metadata: { name: row.name },
    });
    let authId = made.data.user?.id ?? null;
    if (!authId) {
      // Account already exists from an earlier run: find and reuse it.
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      authId = list.data.users.find((u) => u.email === email)?.id ?? null;
      if (authId) {
        await supabaseAdmin.auth.admin.updateUserById(authId, {
          password: passwordFor(row.passcode),
        });
      }
    }
    if (!authId) continue;
    await supabaseAdmin.from("app_users").update({ auth_user_id: authId }).eq("id", row.id);
    created += 1;
  }
  return { created };
});

/** Resolves the email/password pair for a passcode sign-in. */
export const resolveLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; passcode: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("app_users")
      .select("id, name, passcode")
      .ilike("name", data.name.trim());
    if (error) throw error;
    const row = rows?.[0];
    if (!row || row.passcode !== data.passcode.trim()) return { ok: false as const };
    return {
      ok: true as const,
      email: emailFor(row.name),
      password: passwordFor(row.passcode),
    };
  });

async function assertManager(supabase: {
  from: (t: "app_users") => {
    select: (c: string) => { eq: (col: string, v: string) => Promise<{ data: unknown }> };
  };
}, userId: string) {
  const { data } = (await supabase.from("app_users").select("role").eq("auth_user_id", userId)) as {
    data: { role: Role }[] | null;
  };
  const role = data?.[0]?.role;
  if (role !== "superadmin" && role !== "owner") throw new Error("Forbidden");
  return role;
}

export const saveStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; role: Role; passcode: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.id) {
      const { data: rows } = await supabaseAdmin
        .from("app_users")
        .select("auth_user_id")
        .eq("id", data.id);
      const authId = rows?.[0]?.auth_user_id;
      await supabaseAdmin
        .from("app_users")
        .update({ name: data.name, role: data.role, passcode: data.passcode })
        .eq("id", data.id);
      if (authId) {
        await supabaseAdmin.auth.admin.updateUserById(authId, {
          email: emailFor(data.name),
          password: passwordFor(data.passcode),
        });
      }
      return { ok: true };
    }

    const made = await supabaseAdmin.auth.admin.createUser({
      email: emailFor(data.name),
      password: passwordFor(data.passcode),
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    const { error } = await supabaseAdmin.from("app_users").insert({
      name: data.name,
      role: data.role,
      passcode: data.passcode,
      auth_user_id: made.data.user?.id ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const removeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("app_users")
      .select("auth_user_id")
      .eq("id", data.id);
    await supabaseAdmin.from("app_users").delete().eq("id", data.id);
    const authId = rows?.[0]?.auth_user_id;
    if (authId) await supabaseAdmin.auth.admin.deleteUser(authId);
    return { ok: true };
  });

/** Full staff list including passcodes — managers only. */
export const listStaffSecure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_users")
      .select("id, name, role, passcode")
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  });
