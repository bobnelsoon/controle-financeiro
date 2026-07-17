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
    const serie = Store.saldoSerie(ano);
    const saldoDez = serie.length ? serie[serie.length - 1].saldo : 0;
    const conta = st.settings.conta;
    const patrimonio = Store.rvTotal() + Store.rfTotal();

    // Próximos vencimentos: itens do fluxo com dia definido (não pagos) + parcelas de empréstimos
    const hoje = new Date().getDate();
    const venc = [];
    for (const it of st.flowItems) {
      if (it.dueDay == null || it.dueDay === "") continue;
      const v = Store.plannedValue(it, ymAtual);
      if (v == null || v === 0) continue;
      const c = Store.getCell(it.id, ymAtual);
      if (c && c.status && c.status !== "PENDENTE") continue; // já pago/recebido
      venc.push({
        dia: U.diaVencimento(it.dueDay, ano, mes),
        nome: it.name,
        valor: Math.abs(v),
        tipo: v > 0 ? "Receber" : "Pagar",
        cls: v > 0 ? "pos" : "neg"
      });
    }
    for (const l of st.loans) {
      for (const p of l.items) {
        if (p.status === "ABERTO" && p.due && p.due.slice(0, 7) === ymAtual) {
          venc.push({ dia: Number(p.due.slice(8)), nome: `${l.person} — ${p.label || "parcela"}`, valor: p.value, tipo: "Receber", cls: "pos" });
        }
      }
    }
    venc.sort((a, b) => a.dia - b.dia);
    for (const v of venc) v.atrasado = v.dia < hoje;
    const proximos = venc.slice(0, 9);

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
      </div>
      <div class="cards-grid">
        <div class="card stat">
          <div class="stat-label">💰 Saldo em conta <button class="btn-sm" id="btn-edit-conta" title="Atualizar saldo">✎</button></div>
          <div class="stat-value num ${conta ? U.clsValor(conta.valor) : "muted"}">${conta ? U.brl(conta.valor) : "informar"}</div>
          <div class="stat-sub">${conta ? "informado em " + U.ymLabel(conta.ym) + " — base da projeção" : "clique no lápis para informar"}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Receitas do mês</div>
          <div class="stat-value pos num">${U.brl(receitas)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Despesas do mês</div>
          <div class="stat-value neg num">${U.brl(despesas)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Resultado do mês</div>
          <div class="stat-value num ${U.clsValor(saldoMes)}">${U.brl(saldoMes)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Saldo projetado (Dez/${ano})</div>
          <div class="stat-value num ${U.clsValor(saldoDez)}">${U.brl(saldoDez)}</div>
          <div class="stat-sub">${conta ? "a partir do saldo em conta" : "projeção do fluxo anual"}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">📈 Patrimônio investido</div>
          <div class="stat-value num">${patrimonio > 0 ? U.brl(patrimonio) : "—"}</div>
          <div class="stat-sub"><a href="#investimentos">ações, FIIs e renda fixa</a></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2 class="section">Evolução do saldo — ${ano}</h2>
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

    root.querySelector("#btn-edit-conta").addEventListener("click", () => {
      UI.modal("Saldo em conta corrente", `
        <label class="fld"><span>Quanto você tem em conta hoje (R$)?</span>
          <input type="text" name="valor" inputmode="decimal" required
            value="${conta ? String(conta.valor).replace(".", ",") : ""}" placeholder="ex.: 5.300,00"></label>
        <p class="muted" style="font-size:12px">A projeção de saldo passa a partir deste valor: os itens ainda pendentes
        do mês atual e dos próximos meses são somados/abatidos dele. Atualize sempre que quiser recalibrar
        (os itens já marcados como Pago/Recebido não são contados de novo).</p>
      `, (form) => {
        const v = U.parseMoney(form.valor.value);
        if (v == null) return false;
        st.settings.conta = { ym: U.ymHoje(), valor: v };
        Store.save();
        App.render();
      });
    });

    Charts.saldoChart(root.querySelector("#chart-saldo"), serie);
    Charts.barsH(root.querySelector("#chart-cat"), rows);

    const vencEl = root.querySelector("#dash-venc");
    if (!proximos.length) vencEl.innerHTML = `<p class="empty">Nada pendente neste mês 🎉</p>`;
    else for (const v of proximos) {
      const data = String(v.dia).padStart(2, "0") + "/" + String(mes).padStart(2, "0");
      vencEl.appendChild(U.el(`
        <div class="list-row">
          <span class="tag num" ${v.atrasado ? 'style="color:var(--critical);border-color:var(--critical)"' : ""}>${v.atrasado ? "⚠ " : ""}${data}</span>
          <span class="grow">${U.esc(v.nome)}<span class="muted" style="font-size:11px"> · ${v.tipo}</span></span>
          <span class="num ${v.cls}">${U.brl(v.valor)}</span>
        </div>`));
    }
  }

  return { render };
})();
