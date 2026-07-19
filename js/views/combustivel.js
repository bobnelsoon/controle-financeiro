// Controle de Combustível — abastecimentos, consumo (km/l) e custos
"use strict";

const ViewCombustivel = (() => {
  const TIPOS = [["gasolina", "Gasolina"], ["etanol", "Etanol"], ["diesel", "Diesel"], ["gnv", "GNV"]];
  const tipoLabel = (v) => (TIPOS.find(t => t[0] === v) || [null, "—"])[1];

  // Aceita "38,5", "45230", "5.89" etc. Reaproveita o parser de dinheiro (trata vírgula/ponto).
  function num(t) {
    if (t == null || String(t).trim() === "") return null;
    return U.parseMoney(t);
  }
  const kmL = (v) => v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km/l" : "—";
  const km = (v) => v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " km" : "—";
  const lit = (v) => v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " L" : "—";

  // Formulário de novo/editar abastecimento (usado pelas duas abas).
  function abrirForm(entry) {
    const e = entry || {};
    const tipoOpts = TIPOS.map(([v, l]) => `<option value="${v}" ${e.fuelType === v ? "selected" : ""}>${l}</option>`).join("");
    UI.modal(entry ? "Editar abastecimento" : "Novo abastecimento", `
      <label class="fld"><span>Data</span><input type="date" name="date" value="${e.date || U.hojeISO()}" required></label>
      <label class="fld"><span>Hodômetro (km)</span><input type="text" name="odometer" inputmode="decimal" value="${e.odometer != null ? e.odometer : ""}" placeholder="ex: 45230"></label>
      <label class="fld"><span>Litros</span><input type="text" name="liters" inputmode="decimal" value="${e.liters != null ? e.liters : ""}" required placeholder="ex: 38,5"></label>
      <div class="fld-2">
        <label class="fld"><span>Preço / litro (R$)</span><input type="text" name="price" inputmode="decimal" value="${e.pricePerLiter != null ? e.pricePerLiter : ""}" placeholder="ex: 5,89"></label>
        <label class="fld"><span>Total (R$)</span><input type="text" name="total" inputmode="decimal" value="${e.total != null ? e.total : ""}" placeholder="ex: 226,80"></label>
      </div>
      <div class="fld-2">
        <label class="fld"><span>Combustível</span><select name="fuelType">${tipoOpts}</select></label>
        <label class="fld"><span>Posto</span><input type="text" name="station" value="${U.esc(e.station || "")}" placeholder="opcional"></label>
      </div>
      <label class="fld fld-check"><input type="checkbox" name="full" ${e.full === false ? "" : "checked"}><span>Tanque cheio (usar no cálculo de consumo)</span></label>
    `, (form) => {
      const liters = num(form.liters.value);
      if (liters == null || liters <= 0) return false;
      let price = num(form.price.value);
      let total = num(form.total.value);
      if (total == null && price != null) total = Math.round(liters * price * 100) / 100;
      if (price == null && total != null) price = Math.round((total / liters) * 100) / 100;
      const dados = {
        date: form.date.value || U.hojeISO(),
        odometer: num(form.odometer.value),
        liters,
        pricePerLiter: price,
        total,
        fuelType: form.fuelType.value,
        station: form.station.value.trim(),
        full: form.full.checked
      };
      if (entry) Store.updateFuel(entry.id, dados);
      else Store.addFuel(dados);
      App.render();
    });
  }

  function statCard(label, valor, sub, goto) {
    return `
      <div class="card stat${goto ? " clickable" : ""}"${goto ? ` data-goto="${goto}"` : ""}>
        <div class="stat-label">${label}</div>
        <div class="stat-value num">${valor}</div>
        <div class="stat-sub">${sub}</div>
      </div>`;
  }

  function ligarGoto(root) {
    root.querySelectorAll("[data-goto]").forEach(el =>
      el.addEventListener("click", () => { location.hash = "#" + el.dataset.goto; }));
  }

  function render(root) {
    const s = Store.fuelStats();
    const { m, y } = U.ymParse(U.ymHoje());
    const comp = Store.fuelEntriesComputed();
    const ultimos = comp.slice(-6).reverse();

    root.innerHTML = `
      <div class="page-head">
        <h1>⛽ Combustível</h1>
        <span class="muted">${U.MESES[m - 1]} de ${y}</span>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-abast">+ Abastecimento</button>
      </div>
      <div class="cards-grid">
        ${statCard("Consumo médio", kmL(s.consumoMedio), "média de todos os abastecimentos", "abastecimentos")}
        ${statCard("Último consumo", kmL(s.ultimoConsumo), "do último tanque a tanque", "abastecimentos")}
        ${statCard("Custo por km", s.custoKmMedio != null ? U.brl(s.custoKmMedio) : "—", "média de R$ rodado por km", "abastecimentos")}
        ${statCard("Gasto do mês", U.brl(s.gastoMes), `${s.nMes} abastecimento(s) em ${U.MESES[m - 1]}`, "abastecimentos")}
        ${statCard("Preço médio do litro", s.precoMedioMes != null ? U.brl(s.precoMedioMes) : "—", `no mês (${lit(s.litrosMes)})`, "abastecimentos")}
        ${statCard("Km rodados no mês", km(s.kmMes), "entre os abastecimentos do mês", "abastecimentos")}
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <b style="font-size:15px">Últimos abastecimentos</b>
          <a href="#abastecimentos" class="muted" style="font-size:12.5px">ver todos →</a>
        </div>
        <div id="comb-ultimos" class="mt"></div>
      </div>`;

    root.querySelector("#btn-abast").addEventListener("click", () => abrirForm(null));
    ligarGoto(root);

    const wrap = root.querySelector("#comb-ultimos");
    if (!ultimos.length) {
      wrap.innerHTML = `<p class="empty">Nenhum abastecimento cadastrado. Clique em “+ Abastecimento”.</p>`;
      return;
    }
    const tbl = U.el(`
      <table class="tbl">
        <thead><tr><th>Data</th><th class="num">Hodômetro</th><th class="num">Litros</th><th class="num">R$/L</th><th class="num">Total</th><th class="num">Consumo</th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tbody = tbl.querySelector("tbody");
    for (const e of ultimos) {
      tbody.appendChild(U.el(`
        <tr>
          <td>${U.dataBR(e.date)}</td>
          <td class="num">${e.odometer != null ? e.odometer.toLocaleString("pt-BR") : "—"}</td>
          <td class="num">${e.liters != null ? e.liters.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
          <td class="num">${e.pricePerLiter != null ? U.brl(e.pricePerLiter) : "—"}</td>
          <td class="num">${e.total != null ? U.brl(e.total) : "—"}</td>
          <td class="num">${kmL(e.kmL)}</td>
        </tr>`));
    }
    wrap.appendChild(tbl);
  }

  return { render, abrirForm };
})();

// Aba: lista completa de abastecimentos (adicionar / editar / excluir)
const ViewAbastecimentos = (() => {
  function render(root) {
    const comp = Store.fuelEntriesComputed().reverse(); // mais novo primeiro
    root.innerHTML = `
      <div class="page-head">
        <h1>Abastecimentos</h1>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-abast">+ Abastecimento</button>
      </div>
      <div class="card"><div id="comb-lista"></div></div>`;
    root.querySelector("#btn-abast").addEventListener("click", () => ViewCombustivel.abrirForm(null));

    const wrap = root.querySelector("#comb-lista");
    if (!comp.length) {
      wrap.innerHTML = `<p class="empty">Nenhum abastecimento cadastrado. Clique em “+ Abastecimento”.</p>`;
      return;
    }
    const tbl = U.el(`
      <table class="tbl tbl-wide">
        <thead><tr>
          <th>Data</th><th class="num">Hodômetro</th><th class="num">Km</th>
          <th class="num">Litros</th><th class="num">R$/L</th><th class="num">Total</th>
          <th class="num">Consumo</th><th>Combustível</th><th></th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tbody = tbl.querySelector("tbody");
    for (const e of comp) {
      const tipo = (ViewCombustivel && e.fuelType) ? e.fuelType : "";
      const tr = U.el(`
        <tr>
          <td>${U.dataBR(e.date)}${e.station ? `<div class="muted" style="font-size:11px">${U.esc(e.station)}</div>` : ""}</td>
          <td class="num">${e.odometer != null ? e.odometer.toLocaleString("pt-BR") : "—"}</td>
          <td class="num">${e.dist != null ? e.dist.toLocaleString("pt-BR") : "—"}</td>
          <td class="num">${e.liters != null ? e.liters.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
          <td class="num">${e.pricePerLiter != null ? U.brl(e.pricePerLiter) : "—"}</td>
          <td class="num">${e.total != null ? U.brl(e.total) : "—"}</td>
          <td class="num">${e.kmL != null ? e.kmL.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km/l" : "—"}</td>
          <td>${tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "—"}${e.full === false ? ' <span class="muted" style="font-size:10px">(parcial)</span>' : ""}</td>
          <td class="num" style="white-space:nowrap">
            <button class="btn-sm ed" title="Editar">✎</button>
            <button class="btn-sm btn-danger rm" title="Excluir">🗑</button>
          </td>
        </tr>`);
      tr.querySelector(".ed").addEventListener("click", () => ViewCombustivel.abrirForm(e));
      tr.querySelector(".rm").addEventListener("click", () => {
        UI.confirmar(`Excluir o abastecimento de ${U.dataBR(e.date)}?`, () => {
          Store.removeFuel(e.id);
          App.render();
        });
      });
      tbody.appendChild(tr);
    }
    wrap.appendChild(tbl);
  }

  return { render };
})();
