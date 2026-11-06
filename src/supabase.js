import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

// O Supabase Auth exige email. Como as pessoas só usam "nome + palavra-passe",
// o nome é convertido num email interno (nunca é enviado nenhum email).
const EMAIL_DOMAIN = 'braga-central.app';
const norm = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
export const toUsername = name =>
  norm(name).replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
export const toEmail = name => `${toUsername(name)}@${EMAIL_DOMAIN}`;
