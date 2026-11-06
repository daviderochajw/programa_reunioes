// Edge Function: só um administrador aprovado pode repor palavras-passe ou eliminar contas.
// Deploy: supabase functions deploy admin-users
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Quem está a chamar? (usa o token da sessão)
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Sem sessão.' }, 401);
    const { data: isAdmin } = await caller.rpc('is_admin');
    if (!isAdmin) return json({ error: 'Sem permissão.' }, 403);

    const { action, user_id, password } = await req.json();
    if (!user_id) return json({ error: 'Falta o utilizador.' }, 400);
    const admin = createClient(url, service);

    if (action === 'reset_password') {
      if (typeof password !== 'string' || password.length < 8) return json({ error: 'A palavra-passe deve ter pelo menos 8 caracteres.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    if (action === 'delete_user') {
      if (user_id === user.id) return json({ error: 'Não pode eliminar a sua própria conta.' }, 400);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
