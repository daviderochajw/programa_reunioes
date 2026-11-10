import { supabase } from './supabase.js';
import { FIELDS } from './config.js';
import { analyze } from './importer.js';
import { readWorkbook, saveWorkbook, templateSheets, exportSheets } from './excel.js';
import { esc, toast, openDialog, fmtDatePT } from './ui.js';
import { norm } from './names.js';

const BATCH = 200;

export function openImport(menus, onDone) {
  const dlg = openDialog(`<div class="dh"><h2>Importar Excel</h2><button class="btn sm" id="x" type="button">Fechar</button></div>
    <p class="muted small">Aceita o <b>modelo simples</b> da app ou o <b>ficheiro original</b> da congregação. Nada é gravado antes de confirmar.</p>
    <div class="actions"><button class="btn" id="tpl" type="button">Descarregar modelo</button></div>
    <label>Ficheiro .xlsx<input id="file" type="file" accept=".xlsx,.xlsm,.xls"></label><div id="res"></div>`);
  dlg.classList.add('wide');
  const q = s => dlg.querySelector(s), res = q('#res');
  q('#x').onclick = () => dlg.close();
  q('#tpl').onclick = () => saveWorkbook(templateSheets(), 'modelo-painel-braga-central.xlsx');
  q('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    res.innerHTML = '<p class="muted">A ler o ficheiro…</p>';
    let an;
    try { an = analyze(await readWorkbook(f)); } catch (err) { res.innerHTML = `<p class="msg">Não consegui abrir o ficheiro (use .xlsx). ${esc(err.message || '')}</p>`; return; }
    if (!an.blocks.length) { res.innerHTML = '<p class="msg">Não encontrei dados reconhecíveis. Experimente o modelo.</p>'; return; }
    show(an);
  };

  function show(an) {
    const allowed = new Set(menus.map(m => m.key));
    res.innerHTML = `<h3>O que foi encontrado</h3>
      ${an.blocks.map(b => `<label class="chk blk"><input type="checkbox" data-b="${b.id}" ${b.checked && allowed.has(b.menu) ? 'checked' : ''} ${allowed.has(b.menu) ? '' : 'disabled'}>
        <span><b>${esc(b.label)}</b> · ${b.rows.length} registo(s)${b.weeks.length ? ` · ${b.weeks.length} semana(s) (${fmtDatePT(b.weeks[0])} a ${fmtDatePT(b.weeks[b.weeks.length - 1])})` : ''}
        <br><small class="muted">${esc(b.source)}${b.warn ? ' · ⚠ ' + esc(b.warn) : ''}</small></span></label>`).join('')}
      ${an.ignored.length ? `<p class="muted small">Folhas ignoradas: ${an.ignored.map(esc).join(', ')}</p>` : ''}
      <fieldset><legend>Como gravar</legend>
        <label class="chk"><input type="radio" name="mode" value="new" checked> <span><b>Só o que ainda não existe</b> <small class="muted">— semanas (ou registos) que já estão na app ficam como estão</small></span></label>
        <label class="chk"><input type="radio" name="mode" value="replace"> <span><b>Substituir</b> <small class="muted">— as semanas que vêm no ficheiro são substituídas; as outras semanas e meses não são tocados. Numa lista (Contactos, Irmãos…) substitui a lista toda.</small></span></label>
        <label class="chk"><input type="radio" name="mode" value="append"> <span><b>Acrescentar tudo</b> <small class="muted">— pode duplicar o que já existe</small></span></label></fieldset>
      <div class="actions"><button class="btn primary" id="go" type="button">Importar</button></div><p id="st" class="muted"></p>`;
    q('#go').onclick = () => apply(an);
  }

  async function apply(an) {
    const chosen = an.blocks.filter(b => q(`[data-b="${b.id}"]`)?.checked);
    if (!chosen.length) return toast('Escolha pelo menos um bloco.');
    const mode = q('[name=mode]:checked').value, replace = mode === 'replace', st = q('#st'), go = q('#go'); go.disabled = true;
    try {
      // 1) reunir as linhas por menu e saber o que vai ser substituído / ignorado
      const byMenu = {}; chosen.forEach(b => (byMenu[b.menu] ||= []).push(...b.rows));
      const oldIds = []; let skipped = 0;
      for (const [menu, rows] of Object.entries(byMenu)) {
        const cfg = FIELDS[menu], weekly = cfg.kind === 'weekly', weeks = [...new Set(rows.map(r => r.week_start).filter(Boolean))];
        if (replace) {
          let qy = supabase.from('items').select('id').eq('menu_key', menu).limit(5000);
          if (weekly) qy = qy.in('week_start', weeks);
          const { data, error } = await qy; if (error) throw error;
          oldIds.push(...data.map(r => r.id));
        } else if (mode === 'new') {
          let keep;
          if (weekly) {
            const { data, error } = await supabase.from('items').select('week_start').eq('menu_key', menu).in('week_start', weeks).limit(5000); if (error) throw error;
            const have = new Set(data.map(r => r.week_start)); keep = rows.filter(r => !have.has(r.week_start));
          } else {
            const { data, error } = await supabase.from('items').select('data').eq('menu_key', menu).limit(5000); if (error) throw error;
            const have = new Set(data.map(r => norm(r.data?.[cfg.title]))); keep = rows.filter(r => !have.has(norm(r.data?.[cfg.title])));
          }
          skipped += rows.length - keep.length; byMenu[menu] = keep;
        }
      }
      const total = Object.values(byMenu).reduce((n, r) => n + r.length, 0);
      if (!total) { go.disabled = false; return toast('Não há nada de novo para importar: tudo já existe na app.'); }
      if (!confirm(`Vai gravar ${total} registo(s)` + (oldIds.length ? ` e substituir ${oldIds.length} registo(s) existentes` : '') + (skipped ? ` (${skipped} já existiam e foram ignorados)` : '') + '. Continuar?')) { go.disabled = false; return; }
      // 2) inserir primeiro (se falhar, desfaz) e só depois apagar o antigo
      const newIds = [];
      try {
        const all = Object.values(byMenu).flat();
        for (let i = 0; i < all.length; i += BATCH) {
          st.textContent = `A gravar… ${Math.min(i + BATCH, all.length)} / ${all.length}`;
          const { data, error } = await supabase.from('items').insert(all.slice(i, i + BATCH)).select('id'); if (error) throw error;
          newIds.push(...data.map(r => r.id));
        }
      } catch (err) {
        for (let i = 0; i < newIds.length; i += BATCH) await supabase.from('items').delete().in('id', newIds.slice(i, i + BATCH));
        throw err;
      }
      for (let i = 0; i < oldIds.length; i += BATCH) { const { error } = await supabase.from('items').delete().in('id', oldIds.slice(i, i + BATCH)); if (error) throw error; }
      st.textContent = ''; dlg.close(); toast(`Importado: ${total} registo(s).`); onDone?.();
    } catch (err) {
      go.disabled = false; q('#st').innerHTML = `<span class="msg">Não foi possível importar (nada ficou alterado): ${esc(err.message || String(err))}</span>`;
    }
  }
}

export async function exportAll(menus) {
  const items = []; let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('items').select('*').order('menu_key').order('week_start', { nullsFirst: true }).order('position').range(from, from + 999);
    if (error) return toast(error.message);
    items.push(...data); if (data.length < 1000) break; from += 1000;
  }
  await saveWorkbook(exportSheets(items, menus), `painel-braga-central-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
