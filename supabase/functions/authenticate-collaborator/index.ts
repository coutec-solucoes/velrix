import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function normalize(value: any): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { companyCode, username, password } = await req.json();

    if (!companyCode || !username || !password) {
      return jsonResponse({ error: "Campos obrigatórios: companyCode, username, password" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const normalizedCode = normalize(companyCode);

    // 1. Find owner by document (CNPJ/RUC)
    const { data: ownerProfiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, company_name, document, email")
      .eq("role", "proprietario");

    if (profilesError || !ownerProfiles?.length) {
      return jsonResponse({ error: "Código da empresa não encontrado. Verifique o CNPJ/RUC." }, 404);
    }

    const owner = ownerProfiles.find(
      (p: any) => normalize(p.document || "") === normalizedCode
    );

    if (!owner?.company_id) {
      return jsonResponse({ error: "Código da empresa não encontrado. Verifique o CNPJ/RUC." }, 404);
    }

    const companyId = owner.company_id;
    const companyName = owner.company_name || "";

    // 2. Find collaborator by username (or name as fallback)
    let collaborator: any = null;

    // Try by username first
    const { data: byUsername } = await supabaseAdmin
      .from("users")
      .select("id, company_id, company_name, name, email, role, permissions, password, active, username")
      .eq("company_id", companyId)
      .ilike("username", username.trim())
      .maybeSingle();

    collaborator = byUsername;

    // Fallback: search by name if username not found
    if (!collaborator) {
      const { data: byName } = await supabaseAdmin
        .from("users")
        .select("id, company_id, company_name, name, email, role, permissions, password, active, username")
        .eq("company_id", companyId)
        .is("username", null)
        .ilike("name", username.trim())
        .maybeSingle();

      collaborator = byName;
    }

    if (!collaborator) {
      return jsonResponse({ error: "Usuário não encontrado nesta empresa." }, 404);
    }

    if (collaborator.active === false) {
      return jsonResponse({ error: "Usuário inativo. Contate o proprietário." }, 403);
    }

    // 3. Validate password
    if (!collaborator.password) {
      return jsonResponse({ error: "Este usuário está sem senha cadastrada. O proprietário precisa definir uma senha." }, 403);
    }

    if (collaborator.password !== password) {
      return jsonResponse({ error: "Senha incorreta." }, 401);
    }

    // 4. Create or update Supabase Auth account for the collaborator
    const authEmail = (collaborator.email && collaborator.email.includes("@"))
      ? collaborator.email
      : `collab-${collaborator.id}@veltor.app`;

    // Try to create the auth user
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        name: collaborator.name,
        is_collaborator: true,
        collaborator_id: collaborator.id,
      },
    });

    if (createErr) {
      console.log("[authenticate-collaborator] createUser result:", createErr.message);
    }

    // 5. Generate magic link token (works for both new and existing users)
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: authEmail,
    });

    if (linkErr || !linkData) {
      console.error("[authenticate-collaborator] generateLink error:", linkErr?.message);
      // Fallback: return without session (client will use sessionStorage)
      return jsonResponse({
        success: true,
        collaborator: {
          id: collaborator.id,
          name: collaborator.name,
          email: collaborator.email,
          role: collaborator.role,
          permissions: collaborator.permissions,
          companyId,
          companyName,
        },
        ownerEmail: owner.email || null,
      });
    }

    const tokenHash = linkData.properties?.hashed_token;
    const authUserId = linkData.user?.id;

    // 6. Update profile with correct company data
    if (authUserId) {
      await supabaseAdmin.from("profiles").upsert(
        {
          id: authUserId,
          email: authEmail,
          name: collaborator.name,
          role: collaborator.role,
          company_id: companyId,
          company_name: companyName,
        },
        { onConflict: "id" }
      );
    }

    // 7. Return token + collaborator info
    return jsonResponse({
      success: true,
      tokenHash,
      authEmail,
      collaborator: {
        id: collaborator.id,
        name: collaborator.name,
        email: collaborator.email,
        role: collaborator.role,
        permissions: collaborator.permissions,
        companyId,
        companyName,
      },
    });
  } catch (err) {
    console.error("authenticate-collaborator error:", err);
    return jsonResponse({ error: "Erro interno do servidor." }, 500);
  }
});
