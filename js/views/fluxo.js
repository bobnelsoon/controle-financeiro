// Tela: Fluxo Anual — grade de receitas/despesas por mês, no formato da planilha
"use strict";

const ViewFluxo = (() => {
  let ano = new Date().getFullYear();

  function cellHTML(item, ymStr) {
    if (!Store.inRangeRaw(item, ymStr)) {
      const c = Store.getCell(item.id, ymStr);
      if (!c) return { txt: "", cls: "fora" };
    }
    const c = Store.getCell(item.id, ymStr);
    if (c && c.status && c.status !== "PENDENTE") {
      const cls = c.status === "PAGO" ? "pago" : "recebido";
      return { txt: `<span class="chip ${cls}">${c.status}</span>`, cls: "" };
    }
    const v = Store.plannedValue(item, ymStr);
    if (v == null) return { txt: "", cls: "" };
    const fmt = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { txt: `<span class="${U.clsValor(v)}">${fmt}</span>`, cls: "" };
  }

  function abrirEditorCelula(item, ymStr) {
    const c = Store.getCell(item.id, ymStr) || {};
    const vAtual = c.value != null ? String(c.value).replace(".", ",") : "";
    const statusAtual = c.status || "PENDENTE";
    const padrao = item.defaultValue != null && Store.inRangeRaw(item, ymStr)
      ? `<p class="muted" style="margin:0 0 8px">Valor padrão: ${U.brl(item.defaultValue)} — deixe em branco para usá-lo.</p>` : "";

    UI.modal(`${item.name} — ${U.ymLabel(ymStr)}`, `
      ${padrao}
      <label class="fld"><span>Valor deste mês (R$)</span>
        <input type="text" name="valor" value="${U.esc(vAtual)}" placeholder="ex.: -1.250,00" inputmode="decimal">
      </label>
      <label class="fld"><span>Situação</span>
        <div class="status-btns">
          <button type="button" data-st="PENDENTE" class="${statusAtual === "PENDENTE" ? "on" : ""}">Pendente</button>
          <button type="button" data-st="PAGO" class="${statusAtual === "PAGO" ? "on" : ""}">Pago</button>
          <button type="button" data-st="RECEBIDO" class="${statusAtual === "RECEBIDO" ? "on" : ""}">Recebido</button>
        </div>
        <input type="hidden" name="status" value="${statusAtual}">
      </label>
      <p class="muted" style="font-size:12px">Marcar como Pago/Recebido tira o valor da projeção de saldo (como na planilha) e registra que o mês foi quitado.</p>
    `, (form) => {
      const valor = U.parseMoney(form.valor.value);
      const status = form.status.value === "PENDENTE" ? null : form.status.value;
      const data = {};
      if (valor != null) data.value = valor;
      if (status) data.status = status;
      Store.setCell(item.id, ymStr, Object.keys(data).length ? data : null);
      App.render();
    }, { okLabel: "Salvar" });

    document.querySelectorAll(".status-btns button").forEach(b => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".status-btns button").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        document.querySelector('input[name="status"]').value = b.dataset.st;
      });
    });
  }

  function selectDia(atual, kind) {
    const rotulo = kind === "receita" ? "Dia do recebimento" : "Dia do vencimento";
    let opts = `<option value="">(sem dia definido)</option>`;
    for (let d = 1; d <= 31; d++) opts += `<option value="${d}" ${String(atual) === String(d) ? "selected" : ""}>dia ${d}</option>`;
    opts += `<option value="ultimo" ${atual === "ultimo" ? "selected" : ""}>último dia útil do mês</option>`;
    return `<label class="fld"><span>${rotulo}</span><select name="dia">${opts}</select></label>`;
  }

  function lerDia(form) {
    const v = form.dia.value;
    return v === "" ? null : v === "ultimo" ? "ultimo" : Number(v);
  }

  function abrirNovoItem(kind) {
    UI.modal(kind === "receita" ? "Nova receita fixa" : "Nova despesa fixa", `
      <label class="fld"><span>Nome</span><input type="text" name="nome" required></label>
      <label class="fld"><span>Categoria</span>${UI.selectCategorias("cat", kind === "receita" ? "outros" : "moradia")}</label>
      <label class="fld"><span>Valor mensal (R$) — deixe em branco se variar mês a mês</span>
        <input type="text" name="valor" placeholder="ex.: 350,00" inputmode="decimal"></label>
      ${selectDia(null, kind)}
      <label class="fld"><span>Começa em</span><input type="month" name="inicio" value="${U.ymHoje()}"></label>
      <label class="fld"><span>Termina em (opcional)</span><input type="month" name="fim"></label>
    `, (form) => {
      const nome = form.nome.value.trim();
      if (!nome) return false;
      let v = U.parseMoney(form.valor.value);
      if (v != null) v = kind === "despesa" ? -Math.abs(v) : Math.abs(v);
      Store.state.flowItems.push({
        id: U.id(), name: nome, kind, categoryId: form.cat.value,
        defaultValue: v, startMonth: form.inicio.value || U.ymHoje(),
        endMonth: form.fim.value || null, note: "", dueDay: lerDia(form)
      });
      Store.save();
      App.render();
    });
  }

  function abrirEditarItem(item) {
    UI.modal("Editar item: " + item.name, `
      <label class="fld"><span>Nome</span><input type="text" name="nome" required value="${U.esc(item.name)}"></label>
      <label class="fld"><span>Categoria</span>${UI.selectCategorias("cat", item.categoryId)}</label>
      <label class="fld"><span>Valor mensal padrão (R$) — em branco se variar</span>
        <input type="text" name="valor" inputmode="decimal"
          value="${item.defaultValue != null ? String(Math.abs(item.defaultValue)).replace(".", ",") : ""}"></label>
      ${selectDia(item.dueDay, item.kind)}
      <label class="fld"><span>Começa em</span><input type="month" name="inicio" value="${item.startMonth || ""}"></label>
      <label class="fld"><span>Termina em (opcional)</span><input type="month" name="fim" value="${item.endMonth || ""}"></label>
    `, (form) => {
      const nome = form.nome.value.trim();
      if (!nome) return false;
      item.name = nome;
      item.categoryId = form.cat.value;
      let v = U.parseMoney(form.valor.value);
      item.defaultValue = v == null ? null : (item.kind === "despesa" ? -Math.abs(v) : Math.abs(v));
      item.dueDay = lerDia(form);
      item.startMonth = form.inicio.value || item.startMonth;
      item.endMonth = form.fim.value || null;
      Store.save();
      App.render();
    });
  }

  function removerItem(item) {
    UI.confirmar(`Excluir "${item.name}" e todos os seus valores mensais?`, () => {
      Store.state.flowItems = Store.state.flowItems.filter(i => i.id !== item.id);
      for (const k of Object.keys(Store.state.flowCells)) {
        if (k.startsWith(item.id + "|")) delete Store.state.flowCells[k];
      }
      Store.save();
      App.render();
    });
  }

  function linhaItem(item, meses, ymAtual) {
    const tr = document.createElement("tr");
    const diaTxt = U.labelVencimento(item.dueDay);
    const td0 = U.el(`<td style="cursor:pointer" title="${U.esc(item.name)}${diaTxt ? " — " + diaTxt : ""} (clique para editar)">${U.esc(item.name)}${diaTxt ? ` <span class="muted" style="font-size:10px">· ${diaTxt.replace("último dia útil", "últ. útil")}</span>` : ""}<button class="del-item" title="Excluir item">✕</button></td>`);
    td0.addEventListener("click", () => abrirEditarItem(item));
    td0.querySelector(".del-item").addEventListener("click", e => { e.stopPropagation(); removerItem(item); });
    tr.appendChild(td0);
    for (const ymStr of meses) {
      const { txt, cls } = cellHTML(item, ymStr);
      const td = U.el(`<td class="val ${cls} num">${txt}</td>`);
      if (cls !== "fora" || true) td.addEventListener("click", () => abrirEditorCelula(item, ymStr));
      tr.appendChild(td);
    }
    return tr;
  }

  function render(root) {
    const st = Store.state;
    const meses = [];
    for (let m = 1; m <= 12; m++) meses.push(U.ym(ano, m));
    const ymAtual = U.ymHoje();

    root.innerHTML = `
      <div class="page-head">
        <h1>Fluxo Anual</h1>
        <select id="sel-ano"></select>
        <div class="spacer"></div>
        <button id="btn-nova-receita">+ Receita fixa</button>
        <button id="btn-nova-despesa">+ Despesa fixa</button>
      </div>
      <div class="card fluxo-wrap">
        <table class="fluxo">
          <thead><tr><th>Item</th>${meses.map(mm =>
            `<th class="${mm === ymAtual ? "mes-atual" : ""}">${U.MESES_ABREV[U.ymParse(mm).m - 1]}</th>`).join("")}</tr></thead>
          <tbody id="fluxo-body"></tbody>
        </table>
      </div>
      <p class="muted" style="font-size:12px">Clique em uma célula para editar o valor do mês ou marcar como Pago/Recebido.</p>`;

    // seletor de ano
    const sel = root.querySelector("#sel-ano");
    const anoIni = st.settings.anoInicial;
    for (let a = anoIni; a <= anoIni + 6; a++) {
      sel.appendChild(U.el(`<option value="${a}" ${a === ano ? "selected" : ""}>${a}</option>`));
    }
    sel.addEventListener("change", () => { ano = Number(sel.value); App.render(); });
    root.querySelector("#btn-nova-receita").addEventListener("click", () => abrirNovoItem("receita"));
    root.querySelector("#btn-nova-despesa").addEventListener("click", () => abrirNovoItem("despesa"));

    const body = root.querySelector("#fluxo-body");
    const receitas = st.flowItems.filter(i => i.kind === "receita");
    const despesas = st.flowItems.filter(i => i.kind === "despesa");

    body.appendChild(U.el(`<tr class="grupo"><td>RECEITAS</td>${meses.map(() => "<td></td>").join("")}</tr>`));
    for (const it of receitas) body.appendChild(linhaItem(it, meses, ymAtual));

    body.appendChild(U.el(`<tr class="grupo"><td>DESPESAS</td>${meses.map(() => "<td></td>").join("")}</tr>`));
    for (const it of despesas) body.appendChild(linhaItem(it, meses, ymAtual));

    // Totais — mesma base do Dashboard (Store.resultadoMes), para os números baterem.
    const trTotal = U.el(`<tr class="total"><td>Resultado do mês</td></tr>`);
    for (const mm of meses) {
      const t = Store.resultadoMes(mm);
      trTotal.appendChild(U.el(`<td class="num ${U.clsValor(t)}" style="text-align:right">${t.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>`));
    }
    body.appendChild(trTotal);

    // Saldo acumulado — projeção ancorada no saldo real da conta (igual ao "Acumulado do
    // mês" do dashboard no mês atual). Meses já realizados ficam em branco.
    const serie = Store.saldoAcumuladoSerie(ano);
    const trSaldo = U.el(`<tr class="total"><td>Saldo acumulado</td></tr>`);
    for (const p of serie) {
      const txt = p.saldo == null ? "" : p.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
      trSaldo.appendChild(U.el(`<td class="num ${p.saldo == null ? "" : U.clsValor(p.saldo)}" style="text-align:right">${txt}</td>`));
    }
    body.appendChild(trSaldo);
  }

  return { render };
})();
