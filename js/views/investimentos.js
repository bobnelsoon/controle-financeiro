// Tela: Investimentos — ações e FIIs com cotação ao vivo (Yahoo Finance), renda fixa manual,
// aportes do fluxo anual e histórico diário do patrimônio
"use strict";

const ViewInvestimentos = (() => {
  let atualizando = false;
  let ultimaFalha = null;
  let autoBuscou = false;

  const TIPOS_RF = ["CDB", "LCA", "LCI", "Tesouro Direto", "Poupança", "Cripto", "Outro"];
  const TIPO_LABEL = { fii: "FII", acao: "Ação" };

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
      const { ok, falhas } = await Quotes.fetchAll(tickers);
      if (Object.keys(ok).length) Store.saveQuotes(ok);
      if (falhas.length) ultimaFalha = "Sem cotação para: " + falhas.join(", ");
      if (!Object.keys(ok).length && falhas.length) ultimaFalha = "Não foi possível buscar as cotações — verifique a internet.";
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
    `, (form) => {
      const ticker = form.ticker.value.trim().toUpperCase();
      const qty = Number(form.qty.value);
      if (!ticker || !qty) return false;
      const existente = Store.inv().assets.find(a => a.ticker === ticker);
      if (existente) existente.qty += qty;
      else Store.inv().assets.push({ id: U.id(), ticker, type: form.tipo.value, qty });
      Store.save();
      App.render();
      atualizarCotacoes();
    });
  }

  function abrirEditarAtivo(a) {
    UI.modal("Editar " + a.ticker, `
      <label class="fld"><span>Quantidade de cotas</span>
        <input type="number" name="qty" required min="0" step="1" value="${a.qty}"></label>
      <p class="muted" style="font-size:12px">Quantidade 0 remove o ativo da carteira.</p>
    `, (form) => {
      const qty = Number(form.qty.value);
      if (qty <= 0) Store.inv().assets = Store.inv().assets.filter(x => x.id !== a.id);
      else a.qty = qty;
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

  function render(root) {
    const inv = Store.inv();
    const ano = new Date().getFullYear();
    const rv = Store.rvTotal();
    const rf = Store.rfTotal();
    const total = rv + rf;
    const aportes = Store.aportesDoAno(ano);

    const qs = Object.values(inv.quotes);
    const ultimaAtt = qs.length ? Math.max(...qs.map(q => q.updatedAt || 0)) : null;
    const attTxt = ultimaAtt ? new Date(ultimaAtt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca";

    root.innerHTML = `
      <div class="page-head">
        <h1>Investimentos</h1>
        <span class="muted" style="font-size:12px">cotações: ${attTxt}</span>
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
          <div class="stat-label">Ações e FIIs</div>
          <div class="stat-value num">${U.brl(rv)}</div>
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
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 class="section" style="margin:0">Ações & FIIs</h2>
          <button class="btn-sm" id="btn-ativo">+ Ativo</button>
        </div>
        <table class="tbl mt">
          <thead><tr><th>Ticker</th><th>Tipo</th><th class="num">Cotas</th><th class="num">Preço</th><th class="num">Hoje</th><th class="num">Total</th><th></th></tr></thead>
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

      <div class="card">
        <h2 class="section">Evolução do patrimônio (registrada a cada atualização de cotações)</h2>
        <div id="chart-hist"></div>
      </div>`;

    root.querySelector("#btn-att").addEventListener("click", atualizarCotacoes);
    root.querySelector("#btn-ativo").addEventListener("click", abrirNovoAtivo);
    root.querySelector("#btn-rf").addEventListener("click", () => abrirRendaFixa(null));

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
      const tr = U.el(`
        <tr>
          <td><b>${U.esc(a.ticker)}</b>${q && q.name ? `<div class="muted" style="font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(q.name)}</div>` : ""}</td>
          <td><span class="tag">${TIPO_LABEL[a.type] || a.type}</span></td>
          <td class="num">${a.qty}</td>
          <td class="num">${q ? U.brl(q.price) : "—"}</td>
          <td class="num ${varCls}">${varDia}</td>
          <td class="num"><b>${totalAtivo != null ? U.brl(totalAtivo) : "—"}</b></td>
          <td style="white-space:nowrap">
            <button class="btn-sm ed" title="Editar quantidade">✎</button>
            <button class="btn-sm btn-danger rm" title="Excluir">✕</button>
          </td>
        </tr>`);
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
    if (!inv.assets.length) rvBody.innerHTML = `<tr><td colspan="7" class="empty">Nenhum ativo. Clique em "+ Ativo".</td></tr>`;

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
