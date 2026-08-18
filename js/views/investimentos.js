// Tela: Investimentos — ações e FIIs com cotação ao vivo (Yahoo Finance), renda fixa manual,
// aportes do fluxo anual e histórico diário do patrimônio
"use strict";

const ViewInvestimentos = (() => {
  let atualizando = false;
  let ultimaFalha = null;
  let autoBuscou = false;

  const TIPOS_RF = ["CDB", "LCA", "LCI", "Tesouro Direto", "Poupança", "Cripto", "Outro"];
  const TIPO_LABEL = { fii: "FII", acao: "Ação" };
  const FONTE_NOME = { brapi: "brapi", hg: "HG Brasil", mfinance: "mfinance", yahoo: "Yahoo", manual: "você" };

  // Resume as fontes de uma lista de dados (cotações/dividendos) num rótulo curto: "via brapi",
  // "via brapi + HG Brasil"... Ajuda a conferir de onde veio o dado.
  function fontesLabel(sources) {
    const distintas = [...new Set((sources || []).filter(Boolean))];
    if (!distintas.length) return "";
    return "via " + distintas.map(s => FONTE_NOME[s] || s).join(" + ");
  }

  function quotesDesatualizadas() {
    const qs = Object.values(Store.inv().quotes);
    if (!qs.length) return true;
    const maisRecente = Math.max(...qs.map(q => q.updatedAt || 0));
    return Date.now() - maisRecente > 15 * 60 * 1000; // 15 min
  }

  async function atualizarCotacoes() {
    if (atualizando) return;
    const tickers = Store.inv().assets.map(a => a.ticker);
    if (!tickers.length) return;
    atualizando = true;
    ultimaFalha = null;
    App.render();
    try {
      const token = Store.brapiToken();
      // brapi traz cotação + dividendos numa chamada só (com o token das Configurações).
      const { ok, falhas, dividends } = await Quotes.fetchAll(tickers, token);
      if (Object.keys(ok).length) Store.saveQuotes(ok);
      if (dividends && Object.keys(dividends).length) Store.saveDividends(dividends);
      if (falhas.length) ultimaFalha = "Sem cotação para: " + falhas.join(", ");
      if (!Object.keys(ok).length && falhas.length) ultimaFalha = "Não foi possível buscar as cotações — verifique a internet.";
      if (!token) ultimaFalha = (ultimaFalha ? ultimaFalha + " · " : "") + "Dica: cadastre o token do brapi em Configurações para as cotações. (Os dividendos vêm do Yahoo — grátis.)";
      // Dividendos que o brapi não trouxe (sem token, ou ativo sem dados): tenta a reserva (mfinance).
      const semDiv = tickers.filter(t => !dividends || !dividends[t]);
      if (semDiv.length) {
        try { const dd = await Quotes.fetchDividendsAll(semDiv); if (Object.keys(dd.ok).length) Store.saveDividends(dd.ok); } catch (e) {}
      }
    } catch (e) {
      ultimaFalha = "Erro ao buscar cotações: " + e.message;
    }
    atualizando = false;
    App.render();
  }

  function abrirNovoAtivo() {
    UI.modal("Novo ativo (ação ou FII)", `
      <label class="fld"><span>Ticker (código na B3)</span>
        <input type="text" name="ticker" required placeholder="ex.: PETR4, HGLG11" style="text-transform:uppercase"></label>
      <label class="fld"><span>Tipo</span>
        <select name="tipo"><option value="acao">Ação</option><option value="fii">FII</option></select></label>
      <label class="fld"><span>Quantidade de cotas</span>
        <input type="number" name="qty" required min="1" step="1" value="1"></label>
      <label class="fld"><span>Preço pago por cota (R$)</span>
        <input type="text" name="preco" inputmode="decimal" placeholder="ex.: 98,50"></label>
      <p class="muted" style="font-size:12px">O preço pago é usado para calcular seu ganho/perda. Se você já tem
      esse ativo, informamos a média ponderada entre o que já tinha e esta nova compra.</p>
    `, (form) => {
      const ticker = form.ticker.value.trim().toUpperCase();
      const qty = Number(form.qty.value);
      const preco = U.parseMoney(form.preco.value);
      if (!ticker || !qty) return false;
      const existente = Store.inv().assets.find(a => a.ticker === ticker);
      if (existente) {
        // preço médio ponderado entre a posição atual e a nova compra
        if (preco != null) {
          const antigo = existente.avgPrice != null ? existente.avgPrice : preco;
          existente.avgPrice = Math.round(((antigo * existente.qty + preco * qty) / (existente.qty + qty)) * 100) / 100;
        }
        existente.qty += qty;
      } else {
        Store.inv().assets.push({ id: U.id(), ticker, type: form.tipo.value, qty, avgPrice: preco });
      }
      Store.save();
      App.render();
      atualizarCotacoes();
    });
  }

  // Registrar uma NOVA compra (aporte) de um ativo existente: soma a quantidade e recalcula o
  // preço médio ponderado. Mostra a prévia do novo preço médio ao vivo enquanto digita.
  function abrirAporte(a) {
    const ov = UI.modal("Nova compra de " + a.ticker, `
      <p class="muted" style="font-size:12.5px;margin-top:0">Posição atual: <b>${a.qty}</b> cota(s) · preço médio <b>${a.avgPrice != null ? U.brl(a.avgPrice) : "—"}</b></p>
      <div class="fld-2">
        <label class="fld"><span>Quantidade comprada agora</span>
          <input type="number" name="qty" min="1" step="1" value="1" required></label>
        <label class="fld"><span>Preço pago por cota (R$)</span>
          <input type="text" name="preco" inputmode="decimal" required placeholder="ex.: 98,50"></label>
      </div>
      <div id="ap-previa" class="muted" style="font-size:12.5px"></div>
    `, (form) => {
      const qty = Number(form.qty.value);
      const preco = U.parseMoney(form.preco.value);
      if (!qty || qty <= 0 || preco == null) return false;
      const antigo = a.avgPrice != null ? a.avgPrice : preco;
      a.avgPrice = Math.round(((antigo * a.qty + preco * qty) / (a.qty + qty)) * 100) / 100;
      a.qty += qty;
      Store.save();
      App.render();
      atualizarCotacoes();
    });
    const qtyEl = ov.querySelector('input[name="qty"]');
    const precoEl = ov.querySelector('input[name="preco"]');
    const prev = ov.querySelector("#ap-previa");
    function calc() {
      const qty = Number(qtyEl.value);
      const preco = U.parseMoney(precoEl.value);
      if (!qty || qty <= 0 || preco == null) { prev.innerHTML = ""; return; }
      const antigo = a.avgPrice != null ? a.avgPrice : preco;
      const novoAvg = Math.round(((antigo * a.qty + preco * qty) / (a.qty + qty)) * 100) / 100;
      prev.innerHTML = `Depois desta compra: <b>${a.qty + qty}</b> cota(s) · novo preço médio <b class="pos">${U.brl(novoAvg)}</b> (era ${a.avgPrice != null ? U.brl(a.avgPrice) : "—"})`;
    }
    qtyEl.addEventListener("input", calc);
    precoEl.addEventListener("input", calc);
  }

  // Lançar um dividendo recebido manualmente (o usuário registra assim que recebe). Guarda o valor
  // POR COTA; aceita digitar o total recebido (deriva o por cota pela qtd). Permite ver/remover os
  // lançamentos do ativo selecionado no mesmo modal.
  function abrirLancarDividendo(tickerInicial) {
    const assets = Store.inv().assets;
    if (!assets.length) { UI.modal("Lançar dividendo", `<p class="empty">Você ainda não tem ativos na carteira.</p>`, () => true); return; }
    const opts = assets.map(a => `<option value="${U.esc(a.ticker)}" ${a.ticker === tickerInicial ? "selected" : ""}>${U.esc(a.ticker)} (${a.qty} cotas)</option>`).join("");
    const aIni = assets.find(a => a.ticker === tickerInicial) || assets[0];
    const qtyIni = aIni ? aIni.qty : 0;
    const ov = UI.modal("Lançar dividendo recebido", `
      <label class="fld"><span>Ativo</span><select name="ticker">${opts}</select></label>
      <label class="fld fld-destaque"><span>📌 Cotas que você tinha NESTA DATA <span class="muted" style="font-weight:400;font-size:11px">— ajuste se o pagamento é de outro mês (ex.: recebido em agosto, referente a julho → use as cotas de julho)</span></span>
        <input type="number" name="cotas" min="0" step="1" value="${qtyIni}"></label>
      <label class="fld"><span>Data do pagamento</span><input type="date" name="data" value="${U.hojeISO()}" max="${U.hojeISO()}"></label>
      <div class="fld-2">
        <label class="fld"><span>Total recebido (R$)</span><input type="text" name="total" inputmode="decimal" placeholder="ex.: 8,75"></label>
        <label class="fld"><span>Valor por cota (R$)</span><input type="text" name="porCota" inputmode="decimal" placeholder="ex.: 0,10"></label>
      </div>
      <div id="ld-prev" class="muted" style="font-size:12.5px"></div>
      <p class="muted" style="font-size:12px">Informe o <b>total recebido</b> (ou o valor por cota) — o outro é calculado pelas <b>cotas nesta data</b>. O que você lança aqui é a fonte oficial (não muda ao atualizar cotações nem ao aportar depois).</p>
      <div id="ld-lista" class="mt"></div>
    `, (form) => {
      const ticker = form.ticker.value;
      const cotas = Number(form.cotas.value) || 0;
      let porCota = U.parseMoney(form.porCota.value);
      let total = U.parseMoney(form.total.value);
      if (porCota == null && total != null && cotas) porCota = Math.round((total / cotas) * 1e6) / 1e6;
      if (total == null && porCota != null && cotas) total = Math.round(porCota * cotas * 100) / 100;
      if (porCota == null || porCota <= 0 || !form.data.value || cotas <= 0) return false;
      // Guarda o total e as cotas DA DATA do provento — aportar depois não recalcula este lançamento.
      Store.addDividendoManual(ticker, { value: porCota, total, qty: cotas, payDate: form.data.value });
      App.render();
    }, { okLabel: "Lançar" });

    const sel = ov.querySelector('select[name="ticker"]');
    const cotasEl = ov.querySelector('input[name="cotas"]');
    const pc = ov.querySelector('input[name="porCota"]');
    const tot = ov.querySelector('input[name="total"]');
    const prev = ov.querySelector("#ld-prev");
    const lista = ov.querySelector("#ld-lista");
    const qtdSel = () => Number(cotasEl.value) || 0;
    function calcPrev() {
      const v = U.parseMoney(pc.value);
      prev.innerHTML = (v != null && qtdSel()) ? `= <b class="pos">${U.brl(Math.round(v * qtdSel() * 100) / 100)}</b> <span class="muted">(${qtdSel()} cotas × ${U.brl(v)}/cota)</span>` : "";
    }
    // Recalcula mantendo o "por cota" como taxa; se só o total estiver preenchido, deriva o por cota.
    function recalc() {
      const q = qtdSel(); if (!q) { calcPrev(); return; }
      const vpc = U.parseMoney(pc.value), vt = U.parseMoney(tot.value);
      if (vpc != null) tot.value = String(Math.round(vpc * q * 100) / 100).replace(".", ",");
      else if (vt != null) pc.value = String(Math.round((vt / q) * 1e6) / 1e6).replace(".", ",");
      calcPrev();
    }
    pc.addEventListener("input", () => { const v = U.parseMoney(pc.value); if (v != null && qtdSel()) tot.value = String(Math.round(v * qtdSel() * 100) / 100).replace(".", ","); calcPrev(); });
    tot.addEventListener("input", () => { const v = U.parseMoney(tot.value); if (v != null && qtdSel()) pc.value = String(Math.round((v / qtdSel()) * 1e6) / 1e6).replace(".", ","); calcPrev(); });
    cotasEl.addEventListener("input", recalc);
    sel.addEventListener("change", () => { const a = assets.find(x => x.ticker === sel.value); cotasEl.value = a ? a.qty : 0; renderLista(); recalc(); });
    function renderLista() {
      const man = (Store.inv().dividendsManual || {})[sel.value] || [];
      if (!man.length) { lista.innerHTML = `<p class="muted" style="font-size:12px">Nenhum lançamento manual para ${U.esc(sel.value)} ainda.</p>`; return; }
      lista.innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:4px">Lançamentos de <b>${U.esc(sel.value)}</b>:</div>`;
      for (const x of man.slice().reverse()) {
        const pcTxt = "R$ " + Number(x.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        const totTxt = x.total != null ? U.brl(x.total) : (x.qty != null && x.value != null ? U.brl(Math.round(x.value * x.qty * 100) / 100) : "");
        const extra = `${x.qty != null ? ` · ${x.qty} cotas` : ""}${totTxt ? ` · <b class="pos">${totTxt}</b>` : ""}`;
        const row = U.el(`<div class="list-row"><span class="grow" style="font-size:12.5px">${U.dataBR(x.payDate)} · ${pcTxt}/cota${extra}</span><button class="btn-sm btn-danger" title="Remover">✕</button></div>`);
        row.querySelector("button").addEventListener("click", () => { Store.removeDividendoManual(sel.value, x.id); renderLista(); App.render(); });
        lista.appendChild(row);
      }
    }
    renderLista();
  }

  function abrirEditarAtivo(a) {
    UI.modal("Editar " + a.ticker, `
      <label class="fld"><span>Quantidade de cotas</span>
        <input type="number" name="qty" required min="0" step="1" value="${a.qty}"></label>
      <label class="fld"><span>Preço médio pago por cota (R$)</span>
        <input type="text" name="preco" inputmode="decimal"
          value="${a.avgPrice != null ? String(a.avgPrice).replace(".", ",") : ""}" placeholder="ex.: 98,50"></label>
      <p class="muted" style="font-size:12px">Quantidade 0 remove o ativo da carteira.</p>
    `, (form) => {
      const qty = Number(form.qty.value);
      if (qty <= 0) { Store.inv().assets = Store.inv().assets.filter(x => x.id !== a.id); }
      else { a.qty = qty; a.avgPrice = U.parseMoney(form.preco.value); }
      Store.save();
      App.render();
    });
  }

  function abrirRendaFixa(f) {
    const isNew = !f;
    f = f || { id: U.id(), name: "", type: "CDB", value: null, note: "" };
    UI.modal(isNew ? "Novo investimento (renda fixa e outros)" : "Editar " + f.name, `
      <label class="fld"><span>Nome</span>
        <input type="text" name="nome" required value="${U.esc(f.name)}" placeholder="ex.: CDB Banco C6 110% CDI"></label>
      <label class="fld"><span>Tipo</span>
        <select name="tipo">${TIPOS_RF.map(t => `<option ${t === f.type ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="fld"><span>Valor atual (R$)</span>
        <input type="text" name="valor" required inputmode="decimal"
          value="${f.value != null ? String(f.value).replace(".", ",") : ""}" placeholder="ex.: 5.000,00"></label>
      <label class="fld"><span>Observação (opcional)</span>
        <input type="text" name="obs" value="${U.esc(f.note)}" placeholder="vencimento, taxa..."></label>
      <p class="muted" style="font-size:12px">Renda fixa não tem cotação pública — atualize o valor de vez em quando com o que aparece no app do banco.</p>
    `, (form) => {
      const v = U.parseMoney(form.valor.value);
      if (!form.nome.value.trim() || v == null) return false;
      f.name = form.nome.value.trim();
      f.type = form.tipo.value;
      f.value = v;
      f.note = form.obs.value.trim();
      if (isNew) Store.inv().fixed.push(f);
      Store.save();
      App.render();
    });
  }

  // Importar carteira em JSON: lista de ativos [{ticker,type,qty,avgPrice}] ou objeto
  // { assets:[...], fixed:[...] }. Atualiza pelo ticker (sobrescreve qtd/preço médio) ou adiciona.
  function abrirImportar() {
    UI.modal("Importar investimentos", `
      <p class="muted" style="font-size:12.5px;margin-top:0">Cole um JSON: a <b>lista de ativos</b>
      <code>[{ticker, type, qty, avgPrice}]</code> ou um <b>objeto</b> <code>{assets:[...], fixed:[...]}</code>
      (ações/FIIs + renda fixa). O <b>preço médio</b> alimenta o ganho/perda; a cotação é buscada depois.</p>
      <label class="fld"><span>Dados (JSON)</span><textarea name="json" rows="9" placeholder='{"assets":[{"ticker":"HGLG11","type":"fii","qty":10,"avgPrice":160.00},{"ticker":"PETR4","type":"acao","qty":100,"avgPrice":38.50}]}'></textarea></label>
      <label class="fld fld-check"><input type="checkbox" name="clear"><span>Substituir a carteira atual (apaga ações/FIIs antes de importar)</span></label>
      <div id="imp-msg" class="muted" style="font-size:12.5px"></div>
    `, (form) => {
      const msg = form.querySelector("#imp-msg");
      let dados;
      try { dados = JSON.parse(form.json.value); }
      catch (err) { msg.innerHTML = `<span class="neg">JSON inválido: ${U.esc(err.message)}</span>`; return false; }

      let assets = [], fixed = null;
      if (Array.isArray(dados)) { assets = dados; }
      else if (dados && typeof dados === "object") { assets = dados.assets || dados.ativos || []; fixed = dados.fixed || dados.rendaFixa || null; }
      else { msg.innerHTML = `<span class="neg">Esperado uma lista [ ... ] ou um objeto { ... }.</span>`; return false; }
      if (!Array.isArray(assets)) { msg.innerHTML = `<span class="neg">"assets" deve ser uma lista.</span>`; return false; }

      const inv = Store.inv();
      if (form.clear.checked) inv.assets = [];
      for (const r of assets) {
        const ticker = String(r.ticker != null ? r.ticker : (r.codigo || "")).trim().toUpperCase();
        if (!ticker) continue;
        const qty = Number(r.qty != null ? r.qty : (r.quantidade != null ? r.quantidade : r.cotas)) || 0;
        const avgPrice = U.parseMoney(r.avgPrice != null ? r.avgPrice : (r.preco != null ? r.preco : (r.precoMedio != null ? r.precoMedio : r.price)));
        let type = String(r.type != null ? r.type : (r.tipo || "")).toLowerCase();
        if (type !== "fii" && type !== "acao") type = /11$/.test(ticker) ? "fii" : "acao";
        const ex = inv.assets.find(a => a.ticker === ticker);
        if (ex) { if (qty) ex.qty = qty; if (avgPrice != null) ex.avgPrice = avgPrice; ex.type = type; }
        else inv.assets.push({ id: U.id(), ticker, type, qty, avgPrice });
      }
      if (Array.isArray(fixed)) {
        if (form.clear.checked) inv.fixed = [];
        for (const f of fixed) {
          const name = String(f.name != null ? f.name : (f.nome || "")).trim();
          if (!name) continue;
          inv.fixed.push({ id: U.id(), name, type: (f.type || f.tipo || "Outro"), value: U.parseMoney(f.value != null ? f.value : f.valor), note: (f.note || f.obs || "") });
        }
      }
      Store.save();
      App.render();
      atualizarCotacoes();
    }, { okLabel: "Importar" });
  }

  function render(root) {
    const inv = Store.inv();
    const ano = new Date().getFullYear();
    const rv = Store.rvTotal();
    const rf = Store.rfTotal();
    const total = rv + rf;
    const aportes = Store.aportesDoAno(ano);
    const rent = Store.carteiraRentabilidade();
    const div = Store.dividendosResumo();

    const qs = Object.values(inv.quotes);
    const ultimaAtt = qs.length ? Math.max(...qs.map(q => q.updatedAt || 0)) : null;
    const attTxt = ultimaAtt ? new Date(ultimaAtt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca";
    const fonteQuotes = fontesLabel(qs.map(q => q.source));

    root.innerHTML = `
      <div class="page-head">
        <h1>Investimentos</h1>
        <span class="muted" style="font-size:12px">cotações: ${attTxt}${fonteQuotes ? " · " + fonteQuotes : ""}</span>
        <div class="spacer"></div>
        <button id="btn-att" ${atualizando ? "disabled" : ""}>${atualizando ? "Atualizando..." : "🔄 Atualizar cotações"}</button>
      </div>
      ${ultimaFalha ? `<p class="muted" style="color:var(--critical)">${U.esc(ultimaFalha)}</p>` : ""}

      <div class="cards-grid">
        <div class="card stat">
          <div class="stat-label">Patrimônio investido</div>
          <div class="stat-value num">${U.brl(total)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">📈 Rentabilidade</div>
          ${rent
            ? `<div class="stat-value num ${rent.ganho >= 0 ? "pos" : "neg"}">${rent.ganho >= 0 ? "+" : ""}${U.brl(rent.ganho)}</div>
               <div class="stat-sub ${rent.ganho >= 0 ? "pos" : "neg"}">${rent.ganho >= 0 ? "+" : ""}${rent.pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · vs. preço médio</div>`
            : `<div class="stat-value num muted">—</div><div class="stat-sub">informe o preço médio / atualize as cotações</div>`}
        </div>
        <div class="card stat">
          <div class="stat-label">Renda fixa e outros</div>
          <div class="stat-value num">${U.brl(rf)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Aportes planejados em ${ano}</div>
          <div class="stat-value num pos">${U.brl(aportes)}</div>
          <div class="stat-sub">item "Investimento" do Fluxo Anual</div>
        </div>
      </div>

      <div class="card mb">
        <button type="button" class="dv-head" id="dv-toggle" aria-expanded="false">
          <span class="chev">▸</span>
          <span class="dv-head-txt">
            <span style="font-weight:600;font-size:15px">💰 Dividendos recebidos</span>
            ${div.total > 0 && div.yieldPct != null
              ? `<span class="muted" style="font-size:11.5px">yield ${div.yieldPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · sobre ações/FIIs</span>`
              : `<span class="muted" style="font-size:11.5px">toque pra ver / lançar</span>`}
          </span>
          <b class="num ${div.total > 0 ? "pos" : "muted"}" style="font-size:16px;white-space:nowrap">${U.brl(div.total)}</b>
        </button>
        <div id="div-body" class="dv-body" hidden></div>
      </div>

      <div class="card mb">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 class="section" style="margin:0">Ações & FIIs</h2>
          <div class="row-gap">
            <button class="btn-sm" id="btn-imp-inv">📥 Importar</button>
            <button class="btn-sm" id="btn-ativo">+ Ativo</button>
          </div>
        </div>
        <table class="tbl tbl-wide mt">
          <thead><tr><th>Ticker</th><th>Tipo</th><th class="num">Cotas</th><th class="num">Preço médio</th><th class="num">Preço atual</th><th class="num">Hoje</th><th class="num">Ganho/Perda</th><th class="num">Total</th><th></th></tr></thead>
          <tbody id="rv-body"></tbody>
        </table>
      </div>

      <div class="card mb">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 class="section" style="margin:0">Renda fixa e outros (CDB, LCA...)</h2>
          <button class="btn-sm" id="btn-rf">+ Investimento</button>
        </div>
        <div id="rf-list" class="mt"></div>
      </div>

      <div class="card mb">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
          <h2 class="section" style="margin:0">📈 Rentabilidade da carteira</h2>
          ${rent ? `<b class="num ${rent.ganho >= 0 ? "pos" : "neg"}">${rent.ganho >= 0 ? "+" : ""}${rent.pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · ${rent.ganho >= 0 ? "+" : ""}${U.brl(rent.ganho)} <span class="muted" style="font-weight:400">agora</span></b>` : ""}
        </div>
        <div id="chart-rent" class="mt"></div>
      </div>

      <div class="card">
        <h2 class="section">Evolução do patrimônio (registrada a cada atualização de cotações)</h2>
        <div id="chart-hist"></div>
      </div>`;

    root.querySelector("#btn-att").addEventListener("click", atualizarCotacoes);
    root.querySelector("#btn-ativo").addEventListener("click", abrirNovoAtivo);
    root.querySelector("#btn-imp-inv").addEventListener("click", abrirImportar);
    root.querySelector("#btn-rf").addEventListener("click", () => abrirRendaFixa(null));

    // Card de dividendos (só lançamentos manuais): minimizado por padrão; abre pra ver/lançar.
    const mesAno = iso => { const p = iso.split("-"); return U.MESES_ABREV[Number(p[1]) - 1].toLowerCase() + "/" + p[0].slice(2); };
    const cotaTxt = v => v != null ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—";
    const valTxt = v => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dvToggle = root.querySelector("#dv-toggle");
    if (dvToggle) dvToggle.addEventListener("click", () => {
      const body = root.querySelector("#div-body");
      const abrir = body.hidden;
      body.hidden = !abrir;
      dvToggle.classList.toggle("open", abrir);
      dvToggle.setAttribute("aria-expanded", abrir);
    });

    const divBody = root.querySelector("#div-body");
    const temAuto = Object.keys(Store.inv().dividends || {}).length > 0;
    divBody.appendChild(U.el(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <button class="btn-sm btn-primary" id="btn-lanc-div" style="color:#fff">＋ Lançar</button>
        ${(div.linhas.length || temAuto) ? `<button class="btn-sm" id="btn-limpar-div">🧹 Limpar todos</button>` : ""}
      </div>`));
    if (!div.linhas.length) {
      divBody.appendChild(U.el(`<p class="empty" style="margin:0">Nenhum dividendo lançado. Toque em <b>＋ Lançar</b> para registrar o que você recebeu (só conta o que você lançar aqui).</p>`));
    } else {
      // Cada ativo abre mês a mês: Mês · R$/cota · Cotas · Total (cotas = as do momento do lançamento).
      for (const l of div.linhas) {
        const asset = U.el(`<div class="dvi-asset"></div>`);
        const row = U.el(`
          <div class="list-row dvi-row" style="cursor:pointer">
            <span class="grow"><span class="chev">▸</span> <b>${U.esc(l.ticker)}</b> <span class="muted" style="font-size:11.5px">· ${l.qty} cotas</span></span>
            <b class="num pos">${U.brl(l.total)}</b>
          </div>`);
        const det = U.el(`<div class="dvi-det" hidden></div>`);
        const tbl = U.el(`
          <table class="tbl dvi-tbl">
            <thead><tr><th>Mês</th><th class="num">R$/cota</th><th class="num">Cotas</th><th class="num">Total</th></tr></thead>
            <tbody></tbody>
          </table>`);
        const tb = tbl.querySelector("tbody");
        for (const x of l.lancs) {
          tb.appendChild(U.el(`<tr>
            <td>${mesAno(x.payDate)}</td>
            <td class="num">${cotaTxt(x.value)}</td>
            <td class="num">${x.qty != null ? x.qty : "—"}</td>
            <td class="num pos">${valTxt(x.total)}</td>
          </tr>`));
        }
        det.appendChild(tbl);
        row.addEventListener("click", () => { const abrir = det.hidden; det.hidden = !abrir; row.classList.toggle("open", abrir); });
        asset.appendChild(row);
        asset.appendChild(det);
        divBody.appendChild(asset);
      }
    }
    const btnLanc = divBody.querySelector("#btn-lanc-div");
    if (btnLanc) btnLanc.addEventListener("click", () => abrirLancarDividendo(null));
    const btnLimpar = divBody.querySelector("#btn-limpar-div");
    if (btnLimpar) btnLimpar.addEventListener("click", () => {
      UI.confirmar("Apagar TODOS os lançamentos de dividendos (manuais e os buscados pelo app)? O card zera e você lança de novo o que recebeu.", () => { Store.clearDividendos(); App.render(); });
    });

    // Tabela de renda variável
    const rvBody = root.querySelector("#rv-body");
    for (const a of inv.assets) {
      const q = inv.quotes[a.ticker];
      const totalAtivo = q ? q.price * a.qty : null;
      let varDia = "—", varCls = "muted";
      if (q && q.prevClose) {
        const pct = (q.price / q.prevClose - 1) * 100;
        varDia = (pct >= 0 ? "+" : "") + pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
        varCls = pct > 0 ? "pos" : pct < 0 ? "neg" : "muted";
      }
      // Ganho/perda em relação ao preço médio pago
      let ganhoTxt = "—", ganhoCls = "muted";
      if (q && a.avgPrice != null && a.avgPrice > 0) {
        const ganho = (q.price - a.avgPrice) * a.qty;
        const ganhoPct = (q.price / a.avgPrice - 1) * 100;
        ganhoTxt = `${U.brl(ganho)}<div class="muted" style="font-size:11px">${(ganhoPct >= 0 ? "+" : "") + ganhoPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</div>`;
        ganhoCls = ganho > 0 ? "pos" : ganho < 0 ? "neg" : "muted";
      }
      const tr = U.el(`
        <tr>
          <td><b>${U.esc(a.ticker)}</b>${q && q.name ? `<div class="muted" style="font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(q.name)}</div>` : ""}</td>
          <td><span class="tag">${TIPO_LABEL[a.type] || a.type}</span></td>
          <td class="num">${a.qty}</td>
          <td class="num">${a.avgPrice != null ? U.brl(a.avgPrice) : "—"}</td>
          <td class="num">${q ? U.brl(q.price) : "—"}</td>
          <td class="num ${varCls}">${varDia}</td>
          <td class="num ${ganhoCls}">${ganhoTxt}</td>
          <td class="num"><b>${totalAtivo != null ? U.brl(totalAtivo) : "—"}</b></td>
          <td style="white-space:nowrap">
            <button class="btn-sm ap btn-pay" title="Registrar nova compra (aporte)">＋ aporte</button>
            <button class="btn-sm ed" title="Editar ativo">✎</button>
            <button class="btn-sm btn-danger rm" title="Excluir">✕</button>
          </td>
        </tr>`);
      tr.querySelector(".ap").addEventListener("click", () => abrirAporte(a));
      tr.querySelector(".ed").addEventListener("click", () => abrirEditarAtivo(a));
      tr.querySelector(".rm").addEventListener("click", () => {
        UI.confirmar(`Remover ${a.ticker} da carteira?`, () => {
          Store.inv().assets = Store.inv().assets.filter(x => x.id !== a.id);
          Store.save();
          App.render();
        });
      });
      rvBody.appendChild(tr);
    }
    if (!inv.assets.length) rvBody.innerHTML = `<tr><td colspan="9" class="empty">Nenhum ativo. Clique em "+ Ativo".</td></tr>`;

    // Renda fixa
    const rfList = root.querySelector("#rf-list");
    if (!inv.fixed.length) {
      rfList.innerHTML = `<p class="empty">Nenhum investimento manual. Adicione seus CDBs, LCAs, Tesouro...</p>`;
    } else {
      for (const f of inv.fixed) {
        const row = U.el(`
          <div class="list-row">
            <span class="tag">${U.esc(f.type)}</span>
            <span class="grow">${U.esc(f.name)}${f.note ? ` <span class="muted" style="font-size:12px">· ${U.esc(f.note)}</span>` : ""}</span>
            <b class="num">${U.brl(f.value)}</b>
            <button class="btn-sm ed">✎</button>
            <button class="btn-sm btn-danger rm">✕</button>
          </div>`);
        row.querySelector(".ed").addEventListener("click", () => abrirRendaFixa(f));
        row.querySelector(".rm").addEventListener("click", () => {
          UI.confirmar(`Excluir "${f.name}"?`, () => {
            Store.inv().fixed = Store.inv().fixed.filter(x => x.id !== f.id);
            Store.save();
            App.render();
          });
        });
        rfList.appendChild(row);
      }
    }

    // Rentabilidade da carteira (%) ao longo do tempo
    const rentSerie = Store.rentabilidadeSerie();
    const rentEl = root.querySelector("#chart-rent");
    if (rentSerie.length >= 2) {
      const fmtTick = v => (v >= 0 ? "+" : "") + v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
      // Tooltip: % e R$ (o ganho vem no ponto da série).
      const fmtVal = (v, p) => fmtTick(v) + (p && p.ganho != null ? ` · ${p.ganho >= 0 ? "+" : ""}${U.brl(p.ganho)}` : "");
      Charts.saldoChart(rentEl, rentSerie, { fmt: fmtVal, fmtTick: fmtTick });
    } else {
      rentEl.innerHTML = `<p class="empty">A linha de rentabilidade aparece a partir do 2º dia — cada "🔄 Atualizar cotações" grava um ponto (precisa ter o preço médio informado).</p>`;
    }

    // Histórico do patrimônio
    const hist = inv.history.map(h => ({ ym: h.date, saldo: h.total }));
    const chartEl = root.querySelector("#chart-hist");
    if (hist.length >= 2) Charts.saldoChart(chartEl, hist);
    else chartEl.innerHTML = `<p class="empty">O histórico começa a aparecer a partir do 2º dia de uso — cada atualização de cotações registra o valor do dia.</p>`;

    // Busca automática ao abrir a tela (1x por sessão, se estiver desatualizado)
    if (!autoBuscou && !atualizando && quotesDesatualizadas() && inv.assets.length) {
      autoBuscou = true;
      atualizarCotacoes();
    }
  }

  return { render };
})();
