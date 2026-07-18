// Tela: Dashboard
"use strict";

const ViewDashboard = (() => {
  function render(root) {
    const ymAtual = U.ymHoje();
    const { y: ano, m: mes } = U.ymParse(ymAtual);
    const st = Store.state;

    // Receitas/despesas planejadas do mês (fluxo) + lançamentos avulsos
    let receitas = 0, despesas = 0;
    for (const it of st.flowItems) {
      const v = Store.plannedValue(it, ymAtual);
      if (v == null) continue;
      if (v > 0) receitas += v; else despesas += v;
    }
    for (const t of Store.txDoMes(ymAtual)) {
      if (t.value > 0) receitas += t.value; else despesas += t.value;
    }
    const saldoMes = receitas + despesas;
    const serie = Store.saldoProjecaoSerie();
    const saldoDez = serie.length ? serie[serie.length - 1].saldo : 0;
    const conta = st.settings.conta;
    const saldoConta = Store.saldoContaAtual();
    const patrimonio = Store.rvTotal() + Store.rfTotal();

    // Próximos vencimentos: do mês atual até dezembro, agrupados por mês.
    // Inclui itens do fluxo com dia definido (ainda pendentes) e parcelas de empréstimos em aberto.
    const hoje = new Date().getDate();
    const gruposVenc = [];
    for (let mm = mes; mm <= 12; mm++) {
      const ymStr = U.ym(ano, mm);
      const lista = [];
      for (const it of st.flowItems) {
        if (it.dueDay == null || it.dueDay === "") continue;
        const v = Store.plannedValue(it, ymStr);
        if (v == null || v === 0) continue;
        const c = Store.getCell(it.id, ymStr);
        if (c && c.status && c.status !== "PENDENTE") continue; // já pago/recebido
        lista.push({
          dia: U.diaVencimento(it.dueDay, ano, mm),
          nome: it.name,
          valor: Math.abs(v),
          tipo: v > 0 ? "Receber" : "Pagar",
          cls: v > 0 ? "pos" : "neg"
        });
      }
      for (const l of st.loans) {
        for (const p of l.items) {
          if (p.status === "ABERTO" && p.due && p.due.slice(0, 7) === ymStr) {
            lista.push({ dia: Number(p.due.slice(8)), nome: `${l.person} — ${p.label || "parcela"}`, valor: p.value, tipo: "Receber", cls: "pos" });
          }
        }
      }
      if (!lista.length) continue;
      lista.sort((a, b) => a.dia - b.dia);
      if (mm === mes) for (const v of lista) v.atrasado = v.dia < hoje;
      const total = lista.reduce((s, v) => s + (v.tipo === "Receber" ? v.valor : -v.valor), 0);
      gruposVenc.push({ ymStr, mm, itens: lista, total });
    }

    // Cartões de crédito — fatura vigente (gasto do mês atual é pago no mês seguinte,
    // então a fatura em aberto é a do próximo mês). Todos os cartões aparecem.
    const ymFatura = U.ymAdd(ymAtual, 1);
    const mesFatura = U.ymParse(ymFatura).m;
    const cartoes = st.accounts
      .filter(a => a.type === "cartao")
      .map(a => ({ id: a.id, name: a.name, dueDay: a.dueDay, total: Store.faturaTotal(ymFatura, a.id) }))
      .sort((a, b) => b.total - a.total);

    // Gastos por categoria
    const porCat = Store.despesasPorCategoria(ymAtual);
    const rows = Object.entries(porCat)
      .map(([cat, v]) => ({ label: Store.catName(cat), value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    root.innerHTML = `
      <div class="page-head">
        <h1>Dashboard</h1>
        <span class="muted">${U.MESES[mes - 1]} de ${ano}</span>
        <div class="spacer"></div>
        <span class="muted" id="dash-sync-info" style="font-size:11.5px">${typeof Sync !== "undefined" ? U.esc(Sync.statusTexto()) : ""}</span>
        <button class="btn-primary" id="btn-atualizar">🔄 Atualizar</button>
      </div>
      <div class="cards-grid">
        <div class="card stat clickable" data-goto="fluxo">
          <div class="stat-label">💰 Saldo em conta <button class="btn-sm" id="btn-edit-conta" title="Atualizar saldo">✎</button></div>
          <div class="stat-value num ${saldoConta != null ? U.clsValor(saldoConta) : "muted"}">${saldoConta != null ? U.brl(saldoConta) : "informar"}</div>
          <div class="stat-sub">${conta ? "atualizado automaticamente conforme você paga/recebe" : "clique no lápis para informar"}</div>
        </div>
        <div class="card stat clickable" data-goto="fluxo">
          <div class="stat-label">Receitas do mês</div>
          <div class="stat-value pos num">${U.brl(receitas)}</div>
        </div>
        <div class="card stat clickable" data-goto="fluxo">
          <div class="stat-label">Despesas do mês</div>
          <div class="stat-value neg num">${U.brl(despesas)}</div>
          <div class="stat-sub">total previsto + lançamentos do mês</div>
        </div>
        <div class="card stat clickable" data-goto="fluxo">
          <div class="stat-label">Resultado do mês</div>
          <div class="stat-value num ${U.clsValor(saldoMes)}">${U.brl(saldoMes)}</div>
        </div>
        <div class="card stat clickable" data-goto="fluxo">
          <div class="stat-label">Saldo projetado (Dez/${ano})</div>
          <div class="stat-value num ${U.clsValor(saldoDez)}">${U.brl(saldoDez)}</div>
          <div class="stat-sub">${conta ? "a partir do saldo em conta" : "projeção do fluxo anual"}</div>
        </div>
        <div class="card stat clickable" data-goto="investimentos">
          <div class="stat-label">📈 Patrimônio investido</div>
          <div class="stat-value num">${patrimonio > 0 ? U.brl(patrimonio) : "—"}</div>
          <div class="stat-sub">ações, FIIs e renda fixa</div>
        </div>
      </div>

      ${cartoes.length ? `
      <h2 class="section mt">💳 Cartões de crédito — fatura de ${U.MESES[mesFatura - 1]} <span class="muted" style="font-weight:400;text-transform:none">(gastos de ${U.MESES[mes - 1]})</span></h2>
      <div class="cards-grid" id="dash-cartoes">
        ${cartoes.map(c => `
          <div class="card stat clickable" data-goto="cartoes">
            <div class="stat-label">${U.esc(c.name)}${c.dueDay ? ` <span class="muted" style="font-weight:400">· vence dia ${c.dueDay}</span>` : ""}</div>
            <div class="stat-value num ${c.total > 0 ? "neg" : ""}">${U.brl(c.total)}</div>
          </div>`).join("")}
      </div>` : ""}

      <div class="grid-2 mt">
        <div class="card">
          <h2 class="section">Projeção do saldo — ${U.MESES[mes - 1]} a Dez/${ano}</h2>
          <div id="chart-saldo"></div>
        </div>
        <div class="card">
          <h2 class="section">Próximos vencimentos</h2>
          <div id="dash-venc"></div>
        </div>
      </div>

      <div class="card mt">
        <h2 class="section">Despesas por categoria — ${U.MESES[mes - 1]}</h2>
        <div id="chart-cat"></div>
      </div>`;

    // Quadros clicáveis: leva para a aba referente
    root.querySelectorAll(".card.clickable[data-goto]").forEach(card => {
      card.addEventListener("click", () => { location.hash = "#" + card.dataset.goto; });
    });

    // 🔄 Atualizar tudo: sincroniza com o cofre + busca cotações + recalcula as telas
    root.querySelector("#btn-atualizar").addEventListener("click", async (e) => {
      const btn = e.target;
      btn.disabled = true;
      const avisos = [];
      try {
        if (typeof Sync !== "undefined" && Sync.ativo()) {
          btn.textContent = "Sincronizando...";
          try {
            const acao = await Sync.sincronizar();
            if (acao === "baixado") avisos.push("dados mais novos baixados do cofre");
          } catch (err) { avisos.push("sincronização falhou: " + err.message); }
        }
        const tickers = Store.inv().assets.map(a => a.ticker);
        if (tickers.length) {
          btn.textContent = "Buscando cotações...";
          try {
            const { ok, falhas } = await Quotes.fetchAll(tickers);
            if (Object.keys(ok).length) Store.saveQuotes(ok);
            if (falhas.length) avisos.push("sem cotação para: " + falhas.join(", "));
          } catch (err) { avisos.push("cotações falharam: " + err.message); }
        }
      } finally {
        App.render();
        if (avisos.length) alert("Atualizado com avisos:\n• " + avisos.join("\n• "));
      }
    });

    root.querySelector("#btn-edit-conta").addEventListener("click", (e) => {
      e.stopPropagation();
      UI.modal("Saldo em conta corrente", `
        <label class="fld"><span>Quanto você tem em conta hoje (R$)?</span>
          <input type="text" name="valor" inputmode="decimal" required
            value="${conta ? String(conta.valor).replace(".", ",") : ""}" placeholder="ex.: 5.300,00"></label>
        <p class="muted" style="font-size:12px">A partir deste valor, o saldo é atualizado sozinho: quando você
        marca um item como <b>Pago</b> no Fluxo Anual ele é debitado, quando marca <b>Recebido</b> é somado, e
        cada lançamento via pix/débito/transferência entra automaticamente. Informe de novo sempre que quiser
        recalibrar com o valor real do banco (os movimentos anteriores a esse momento deixam de ser contados).</p>
      `, (form) => {
        const v = U.parseMoney(form.valor.value);
        if (v == null) return false;
        st.settings.conta = { at: new Date().toISOString(), valor: v };
        Store.save();
        App.render();
      });
    });

    Charts.saldoChart(root.querySelector("#chart-saldo"), serie);
    Charts.barsH(root.querySelector("#chart-cat"), rows);

    // Próximos vencimentos agrupados por mês, com total e expansão ao clicar no mês
    const vencEl = root.querySelector("#dash-venc");
    if (!gruposVenc.length) vencEl.innerHTML = `<p class="empty">Nada pendente daqui até dezembro 🎉</p>`;
    else for (const g of gruposVenc) {
      const aberto = g.mm === mes; // mês atual já vem expandido
      const grupo = U.el(`<div class="venc-group ${aberto ? "open" : ""}"></div>`);
      const head = U.el(`
        <button type="button" class="venc-head" aria-expanded="${aberto}">
          <span class="chev">▸</span>
          <span class="grow">${U.MESES[g.mm - 1]} <span class="muted" style="font-weight:400">· ${g.itens.length}</span></span>
          <span class="num ${U.clsValor(g.total)}">${U.brl(g.total)}</span>
        </button>`);
      const itens = U.el(`<div class="venc-itens"></div>`);
      for (const v of g.itens) {
        const data = String(v.dia).padStart(2, "0") + "/" + String(g.mm).padStart(2, "0");
        itens.appendChild(U.el(`
          <div class="list-row">
            <span class="tag num" ${v.atrasado ? 'style="color:var(--critical);border-color:var(--critical)"' : ""}>${v.atrasado ? "⚠ " : ""}${data}</span>
            <span class="grow">${U.esc(v.nome)}<span class="muted" style="font-size:11px"> · ${v.tipo}</span></span>
            <span class="num ${v.cls}">${U.brl(v.valor)}</span>
          </div>`));
      }
      head.addEventListener("click", () => {
        const open = grupo.classList.toggle("open");
        head.setAttribute("aria-expanded", open);
      });
      grupo.appendChild(head);
      grupo.appendChild(itens);
      vencEl.appendChild(grupo);
    }
  }

  return { render };
})();
