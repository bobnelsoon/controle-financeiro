// Tela: Dashboard
"use strict";

const ViewDashboard = (() => {
  function render(root) {
    const st = Store.state;
    // Mês de trabalho global: o usuário trabalha um mês à frente. O Dashboard INTEIRO olha esse mês
    // (padrão = fatura vigente; navegável pelo seletor ‹ ›). Assim os cards não ficam em meses diferentes.
    const ymRef = App.mesRef();
    const ymAtual = ymRef;
    const { y: ano, m: mes } = U.ymParse(ymAtual);

    const conta = st.settings.conta;
    const saldoConta = Store.saldoContaAtual();
    // Gráfico receita x despesa mês a mês (do ano do mês de trabalho) + total do ano.
    const rdSerie = Store.receitaDespesaSerie(ano);
    const rdTotReceita = Math.round(rdSerie.reduce((s, p) => s + p.receita, 0) * 100) / 100;
    const rdTotDespesa = Math.round(rdSerie.reduce((s, p) => s + p.despesa, 0) * 100) / 100;
    const rdDif = Math.round((rdTotReceita - rdTotDespesa) * 100) / 100;
    const brlCheio = v => "R$ " + Math.round(Math.abs(v)).toLocaleString("pt-BR"); // sem centavos

    // Quadro "A receber / A pagar" do mês de trabalho — só o que AINDA falta (do fluxo):
    //  - A receber = receita fixa pendente + empréstimos ABERTOS a receber no mês.
    //  - A pagar   = despesa fixa pendente + fatura restante do cartão (o item "Cartão (fatura)"
    //    já entra como negativo pelo projectedValue).
    // Marcar Recebido/Pago tira o item do quadro e mexe no saldo — o "No fim do mês" fica estável.
    let aReceber = 0, aPagar = 0;
    for (const it of st.flowItems) {
      const v = Store.projectedValue(it, ymRef);
      if (v == null) continue;
      if (v > 0) aReceber += v; else aPagar += -v;
    }
    aReceber = Math.round((aReceber + Store.loansAReceberMes(ymRef)) * 100) / 100;
    aPagar = Math.round(aPagar * 100) / 100;
    // "No fim do mês (previsto)" = saldo em conta + a receber − a pagar.
    const fimMes = saldoConta != null ? Math.round((saldoConta + aReceber - aPagar) * 100) / 100 : null;
    const patrimonio = Store.rvTotal() + Store.rfTotal();

    // Próximos vencimentos: do mês REAL de hoje até dezembro (independe do mês de trabalho),
    // agrupados por mês. Itens do fluxo com dia definido (ainda pendentes) + parcelas de empréstimos.
    const hoje = new Date().getDate();
    const { y: anoReal, m: mesReal } = U.ymParse(U.ymHoje());
    const gruposVenc = [];
    for (let mm = mesReal; mm <= 12; mm++) {
      const ymStr = U.ym(anoReal, mm);
      const lista = [];
      for (const it of st.flowItems) {
        if (it.autoCartao) continue; // a fatura entra pelo quadro de cartões
        const v = Store.plannedValue(it, ymStr);
        if (v == null || v === 0) continue;
        const c = Store.getCell(it.id, ymStr);
        if (c && c.status && c.status !== "PENDENTE") continue; // já pago/recebido
        const temDia = it.dueDay != null && it.dueDay !== "";
        lista.push({
          dia: temDia ? U.diaVencimento(it.dueDay, anoReal, mm) : 99, // sem dia → vai pro fim
          semDia: !temDia,
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
      if (mm === mesReal) for (const v of lista) v.atrasado = v.dia < hoje;
      const total = lista.reduce((s, v) => s + (v.tipo === "Receber" ? v.valor : -v.valor), 0);
      gruposVenc.push({ ymStr, mm, itens: lista, total });
    }

    // Cartões de crédito — faturas de meses anteriores ainda
    // não pagas aparecem como linhas "a pagar" (vencidas) e somam no total "Em aberto".
    // O cartão olha a FATURA VIGENTE (mês seguinte, avançando na data de fechamento) — à parte do
    // mês de trabalho: o dash mostra o fluxo do mês atual, mas a fatura que você paga é a do mês seguinte.
    const ymCartoes = Store.faturaVigenteYm();
    const mesCartoes = U.ymParse(ymCartoes).m;
    const mesGastoCartoes = U.ymParse(U.ymAdd(ymCartoes, -1)).m;
    const cartoesDoMes = st.accounts.filter(a => a.type === "cartao");
    const cartoes = cartoesDoMes
      .map(a => {
        const total = Store.faturaTotal(ymCartoes, a.id);
        const restante = Store.faturaRestante(ymCartoes, a.id);
        const pagoRec = Store.faturaPaga(a.id, ymCartoes);
        return { id: a.id, name: a.name, dueDay: a.dueDay, total, restante, pago: !!pagoRec && restante === 0, pagoValor: pagoRec ? pagoRec.value : 0 };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => (a.pago === b.pago ? b.restante - a.restante : (a.pago ? 1 : -1)));
    // Faturas de meses anteriores ao mês de trabalho ainda com saldo (vencidas) — continuam no "Em aberto".
    const vencidas = [];
    { let _gv = 0; for (let ym = U.ymAdd(ymCartoes, -4); ym !== ymCartoes && _gv < 8; ym = U.ymAdd(ym, 1), _gv++) {
      for (const a of cartoesDoMes) {
        const rest = Store.faturaRestante(ym, a.id);
        if (rest > 0) vencidas.push({ name: a.name, mes: U.ymParse(ym).m, restante: rest });
      }
    } }
    const totalRestante = Math.round((cartoes.reduce((s, c) => s + c.restante, 0) + vencidas.reduce((s, v) => s + v.restante, 0)) * 100) / 100;

    // Composição da carteira: valor atual em Ações, FIIs e Renda fixa.
    // Ações/FIIs usam a cotação (mesma base do Patrimônio investido); renda fixa é o valor informado.
    let vAcoes = 0, vFiis = 0;
    const invQuotes = Store.inv().quotes;
    for (const a of Store.inv().assets) {
      const q = invQuotes[a.ticker];
      if (!q) continue;
      const val = q.price * a.qty;
      if (a.type === "fii") vFiis += val; else vAcoes += val;
    }
    const vRF = Store.rfTotal();
    const totalInv = vAcoes + vFiis + vRF;
    const comp = [
      { label: "Ações", value: vAcoes },
      { label: "FIIs", value: vFiis },
      { label: "Renda fixa", value: vRF }
    ].filter(c => c.value > 0).sort((a, b) => b.value - a.value);
    const aportes = Store.aportesDoAno(ano);
    const rent = Store.carteiraRentabilidade();
    const nAtivos = Store.inv().assets.length;
    // Rentabilidade formatada (usada no subtítulo e no KPI do card).
    const rentCls = rent ? (rent.ganho > 0 ? "pos" : rent.ganho < 0 ? "neg" : "muted") : "muted";
    const rentSinal = rent && rent.ganho >= 0 ? "+" : "";
    const rentPctTxt = rent ? rent.pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

    root.innerHTML = `
      <div class="page-head">
        <h1>Dashboard</h1>
        <div style="display:flex;align-items:center;gap:4px" title="Mês de trabalho">
          <button class="btn-sm" id="mes-prev" aria-label="Mês anterior">‹</button>
          <span class="muted" style="min-width:104px;text-align:center;font-weight:600">${U.MESES[mes - 1]} ${ano}</span>
          <button class="btn-sm" id="mes-next" aria-label="Próximo mês">›</button>
          ${App.mesRefAuto() ? "" : `<button class="btn-sm" id="mes-hoje" title="Voltar ao mês de trabalho">↺</button>`}
        </div>
        <div class="spacer"></div>
        <span class="muted" id="dash-sync-info" style="font-size:11.5px">${typeof Sync !== "undefined" ? U.esc(Sync.statusTexto()) : ""}</span>
        <button class="btn-primary" id="btn-atualizar">🔄 Atualizar</button>
      </div>
      <div class="cards-grid cards-2">
        <div class="card stat stat-duplo clickable" data-goto="fluxo">
          <div class="stat-label">💰 Saldo em conta <button class="btn-sm" id="btn-edit-conta" title="Atualizar saldo">✎</button></div>
          <div class="stat-value num ${saldoConta != null ? U.clsValor(saldoConta) : "muted"}">${saldoConta != null ? U.brl(saldoConta) : "informar"}</div>
          <div class="stat-sub">${saldoConta != null && saldoConta < 0
            ? `<span style="color:var(--critical);font-weight:600">⚠️ Cheque especial em uso: ${U.brl(Math.abs(saldoConta))}</span>`
            : (conta ? "atualizado automaticamente conforme você paga/recebe" : "clique no lápis para informar")}</div>
          <div class="stat-linha2">
            <div class="stat-label">No fim de ${U.MESES[mes - 1]} (previsto)</div>
            <div class="stat-value num ${fimMes != null ? U.clsValor(fimMes) : "muted"}">${fimMes != null ? U.brl(fimMes) : "informe o saldo"}</div>
            <div class="stat-sub">saldo em conta + a receber − a pagar</div>
          </div>
        </div>
        <div class="card stat stat-duplo clickable" data-goto="fluxo">
          <div class="stat-label">A receber em ${U.MESES[mes - 1]}</div>
          <div class="stat-value pos num">${U.brl(aReceber)}</div>
          <div class="stat-sub">receita fixa + empréstimo (o que ainda falta)</div>
          <div class="stat-linha2">
            <div class="stat-label">A pagar em ${U.MESES[mes - 1]}</div>
            <div class="stat-value neg num">${U.brl(-aPagar)}</div>
            <div class="stat-sub">despesa fixa + fatura (o que ainda falta)</div>
          </div>
        </div>
      </div>

      ${(cartoes.length || vencidas.length) ? `
      <div class="card mt">
        <div class="cartoes-head">
          <h2 class="section" style="margin:0">💳 Cartões de crédito — fatura de ${U.MESES[mesCartoes - 1]} <span class="muted" style="font-weight:400">(gastos de ${U.MESES[mesGastoCartoes - 1]})</span></h2>
          <a href="#cartoes" class="muted" style="font-size:12px;text-decoration:none">ver detalhes →</a>
        </div>
        <div class="cartoes-list" id="dash-cartoes">
          ${vencidas.map(v => `
            <div class="cartao-row clickable" data-goto="cartoes">
              <span class="cartao-nome">${U.esc(v.name)} <span class="muted" style="font-weight:400">· fatura de ${U.MESES_ABREV[v.mes - 1]} a pagar</span></span>
              <span class="num neg">${U.brl(v.restante)}</span>
            </div>`).join("")}
          ${cartoes.map(c => `
            <div class="cartao-row clickable" data-goto="cartoes">
              <span class="cartao-nome">${U.esc(c.name)}${c.dueDay ? ` <span class="muted" style="font-weight:400">· dia ${c.dueDay}</span>` : ""}</span>
              ${c.pago
                ? `<span class="num pos">✓ pago <span class="muted" style="font-weight:400">${U.brl(c.pagoValor)}</span></span>`
                : `<span class="num neg">${U.brl(c.restante)}</span>`}
            </div>`).join("")}
        </div>
        <div class="cartoes-total">
          <span>${totalRestante > 0 ? "Em aberto (a pagar)" : "Tudo pago ✓"}</span>
          <b class="num ${totalRestante > 0 ? "neg" : "pos"}">${U.brl(totalRestante)}</b>
        </div>
      </div>` : ""}

      <div class="card mt">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <b style="font-size:15px">Receita × Despesa — ${ano}</b>
          <div class="muted" style="font-size:12px;display:flex;gap:12px">
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;margin-right:4px"></span>Receita</span>
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ef4444;margin-right:4px"></span>Despesa</span>
          </div>
        </div>
        <div id="chart-rd"></div>
        <div style="display:flex;gap:8px;border-top:1px solid var(--border);margin-top:8px;padding-top:8px;text-align:center">
          <div style="flex:1"><div class="muted" style="font-size:11px">Receita</div><div class="num pos" style="font-size:13.5px;font-weight:700;white-space:nowrap">${brlCheio(rdTotReceita)}</div></div>
          <div style="flex:1"><div class="muted" style="font-size:11px">Despesa</div><div class="num neg" style="font-size:13.5px;font-weight:700;white-space:nowrap">${brlCheio(rdTotDespesa)}</div></div>
          <div style="flex:1"><div class="muted" style="font-size:11px">Diferença</div><div class="num ${rdDif >= 0 ? "pos" : "neg"}" style="font-size:13.5px;font-weight:700;white-space:nowrap">${rdDif >= 0 ? "+" : "−"}${brlCheio(rdDif)}</div></div>
        </div>
      </div>
      <div class="card mt">
        <h2 class="section">Próximos vencimentos</h2>
        <div id="dash-venc"></div>
      </div>

      <div class="card clickable mt" data-goto="investimentos">
        <h2 class="section">📈 Carteira de investimentos</h2>
        <div class="stat-value num" style="font-size:24px;font-weight:700">${patrimonio > 0 ? U.brl(patrimonio) : "—"}</div>
        <div class="stat-sub">patrimônio investido${rent
          ? ` · <span class="num ${rentCls}">${rentSinal}${U.brl(rent.ganho)} · ${rentSinal}${rentPctTxt}%</span>`
          : ` <span class="muted">(ações, FIIs e renda fixa)</span>`}</div>
        <div style="margin-top:10px">
          <div class="muted" style="font-size:12px;margin-bottom:6px">Composição</div>
          <div id="comp-carteira"></div>
        </div>
        <div class="inv-kpis">
          <div><div class="k-lbl">Rentabilidade</div><div class="k-val num ${rentCls}">${rent ? `${rentSinal}${rentPctTxt}%` : "—"}</div></div>
          <div><div class="k-lbl">Aportes ${ano}</div><div class="k-val num">${aportes > 0 ? U.brl(aportes) : "—"}</div></div>
          <div><div class="k-lbl">Ativos</div><div class="k-val num">${nAtivos || "—"}</div></div>
        </div>
      </div>`;

    // Quadros/linhas clicáveis: leva para a aba referente
    root.querySelectorAll(".clickable[data-goto]").forEach(card => {
      card.addEventListener("click", () => { location.hash = "#" + card.dataset.goto; });
    });

    // Navegação do mês de trabalho
    root.querySelector("#mes-prev").addEventListener("click", () => App.mesRefShift(-1));
    root.querySelector("#mes-next").addEventListener("click", () => App.mesRefShift(1));
    const btnMesHoje = root.querySelector("#mes-hoje");
    if (btnMesHoje) btnMesHoje.addEventListener("click", () => App.mesRefReset());

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

    Charts.receitaDespesaChart(root.querySelector("#chart-rd"), rdSerie);

    // Composição da carteira: barra ÚNICA segmentada (fatia do total) + legenda com R$ e %.
    const compEl = root.querySelector("#comp-carteira");
    const CORES = { "Ações": "#22c55e", "FIIs": "var(--accent)", "Renda fixa": "#f59e0b" };
    if (!comp.length || totalInv <= 0) {
      compEl.innerHTML = `<p class="empty">Sem investimentos cadastrados. Adicione ativos ou renda fixa na aba <b>Investimentos</b>.</p>`;
    } else {
      const seg = comp.map(c => {
        const pct = (c.value / totalInv) * 100;
        const cor = CORES[c.label] || "var(--accent)";
        return `<span style="width:${pct}%;background:${cor}" title="${U.esc(c.label)}: ${U.brl(c.value)} (${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)"></span>`;
      }).join("");
      const bar = U.el(`<div class="comp-bar">${seg}</div>`);
      const leg = U.el(`<div class="comp-leg"></div>`);
      for (const c of comp) {
        const pct = (c.value / totalInv) * 100;
        const pctTxt = pct.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        const cor = CORES[c.label] || "var(--accent)";
        leg.appendChild(U.el(`<span class="comp-leg-item"><span class="comp-dot" style="background:${cor}"></span>${U.esc(c.label)} <b class="num">${U.brl(c.value)}</b> <span class="muted">${pctTxt}%</span></span>`));
      }
      compEl.appendChild(bar);
      compEl.appendChild(leg);
    }

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
        const data = v.semDia ? "s/ dia" : String(v.dia).padStart(2, "0") + "/" + String(g.mm).padStart(2, "0");
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
