// Persistência (localStorage) + modelo de dados + dados iniciais importados da planilha
"use strict";

const Store = (() => {
  const KEY = "controle-financeiro-v1";
  let state = null;

  // ---------- Dados iniciais (importados de "1-Controle Financeiro 2026 Official 1207.xlsx") ----------
  // A versão publicada na internet define window.SEED_VAZIO = true e começa sem nenhum dado:
  // tudo chega pela sincronização (os dados pessoais não vão no código publicado).
  function seedVazio() {
    return {
      version: 5,
      settings: { anoInicial: 2026, conta: null },
      categories: categoriasPadrao(),
      accounts: [],
      flowItems: [],
      flowCells: {},
      transactions: [],
      loans: [],
      budgets: {},
      cardTx: [],
      investments: { assets: [], fixed: [], quotes: {}, history: [] }
    };
  }

  function categoriasPadrao() {
    return [
      { id: "sal",     name: "Salário" },
      { id: "alugueis", name: "Aluguéis" },
      { id: "empfeitos", name: "Empréstimos concedidos" },
      { id: "moradia", name: "Moradia" },
      { id: "contas",  name: "Contas & Serviços" },
      { id: "saude",   name: "Saúde" },
      { id: "cartao",  name: "Cartão de Crédito" },
      { id: "invest",  name: "Investimentos" },
      { id: "impostos", name: "Impostos" },
      { id: "transporte", name: "Transporte" },
      { id: "mercado", name: "Mercado" },
      { id: "lazer",   name: "Lazer" },
      { id: "outros",  name: "Outros" }
    ];
  }

  function seed() { return seedVazio(); }

  // ---------- Importação da aba "Cartão 2026" ----------
  const CARD_NAME_MAP = { "C6": "banco c6", "ITAU": "itau", "MERCADO PAGO": "mercado pago", "SANTANDER": "santander", "AMAZOM": "amazon", "SICOOB": "sicoob" };

  function normName(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  }

  function findAccountByCardName(accounts, cardName) {
    const alvo = CARD_NAME_MAP[cardName] || normName(cardName);
    let acc = accounts.find(a => normName(a.name) === alvo);
    if (!acc) acc = accounts.find(a => normName(a.name).includes(alvo) || alvo.includes(normName(a.name)));
    return acc || null;
  }

  function buildCardTx(accounts) {
    if (typeof CARTAO_IMPORT === "undefined") return [];
    const txs = [];
    for (const [ym, card, desc, value, date] of CARTAO_IMPORT) {
      let acc = findAccountByCardName(accounts, card);
      if (!acc) {
        acc = { id: U.id(), name: card, type: "cartao", dueDay: null, limit: null };
        accounts.push(acc);
      }
      txs.push({ id: U.id(), ym, accountId: acc.id, desc, value, date: date || null });
    }
    return txs;
  }

  // Dias de vencimento/recebimento informados pelo usuário (16/07/2026)
  const DIAS_VENCIMENTO = {};

  function aplicarDiasVencimento(items) {
    for (const it of items) {
      if (DIAS_VENCIMENTO[it.name] != null && it.dueDay == null) it.dueDay = DIAS_VENCIMENTO[it.name];
    }
  }

  // Migra dados salvos de versões anteriores sem perder edições do usuário
  function migrate(st) {
    if (!st.version || st.version < 2) {
      st.settings.conta = st.settings.conta || null;
      // marca o item da fatura como automático e remove os valores fixos futuros
      const itCartao = st.flowItems.find(i => i.name === "Cartão (fatura)");
      if (itCartao) {
        itCartao.autoCartao = true;
        itCartao.note = "Somado automaticamente da tela Cartões";
        for (const ymStr of ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) {
          const k = itCartao.id + "|" + ymStr;
          const c = st.flowCells[k];
          if (c && c.value != null && !c.status) delete st.flowCells[k];
        }
      }
      if (!st.cardTx) st.cardTx = buildCardTx(st.accounts);
      st.version = 2;
    }
    if (st.version < 3) {
      if (!st.investments) st.investments = seedInvestments();
      st.version = 3;
    }
    if (st.version < 4) {
      aplicarDiasVencimento(st.flowItems);
      // cartões: todos vencem dia 1 (informado pelo usuário)
      for (const a of st.accounts) if (a.type === "cartao") a.dueDay = 1;
      st.version = 4;
    }
    if (st.version < 5) {
      // O saldo em conta passa a ser atualizado automaticamente: guarda o instante (at) em que
      // foi informado e soma tudo que foi realizado depois (itens Pago/Recebido + lançamentos pix).
      if (st.settings.conta && st.settings.conta.ym && !st.settings.conta.at) {
        st.settings.conta.at = st.settings.conta.ym + "-01T00:00:00.000Z";
      }
      for (const t of (st.transactions || [])) {
        if (!t.createdAt) t.createdAt = (t.date || U.hojeISO()) + "T12:00:00.000Z";
      }
      // Ativos ganham "preço médio pago" para calcular ganho/perda
      if (st.investments && st.investments.assets) {
        for (const a of st.investments.assets) if (a.avgPrice === undefined) a.avgPrice = null;
      }
      st.version = 5;
    }
    return st;
  }

  // ---------- Persistência ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { state = migrate(JSON.parse(raw)); save(); return; }
    } catch (e) { console.error("Erro lendo dados salvos:", e); }
    state = seed();
    save();
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (typeof Sync !== "undefined") Sync.onLocalSave(); // agenda envio para o outro aparelho
  }

  // ---------- Fluxo anual ----------
  function inRangeRaw(item, ymStr) {
    if (item.startMonth && U.ymCmp(ymStr, item.startMonth) < 0) return false;
    if (item.endMonth && U.ymCmp(ymStr, item.endMonth) > 0) return false;
    return true;
  }

  function getCell(itemId, ymStr) { return state.flowCells[itemId + "|" + ymStr] || null; }

  // Valor efetivamente movimentado por uma célula (usa o valor informado, o automático do
  // cartão ou o valor padrão do item). Usado para debitar/creditar a conta ao marcar Pago/Recebido.
  function effectiveCellValue(item, ymStr, cell) {
    if (cell && cell.value != null) return cell.value;
    if (item && item.autoCartao) { const v = autoCartaoValue(ymStr); if (v != null) return v; }
    if (item && inRangeRaw(item, ymStr)) return item.defaultValue;
    return null;
  }

  function setCell(itemId, ymStr, data) {
    const k = itemId + "|" + ymStr;
    if (!data || (data.value == null && !data.status && !data.note)) { delete state.flowCells[k]; save(); return; }
    // Ao marcar Pago/Recebido, registra o instante da quitação e o valor movimentado,
    // para que o Saldo em conta seja debitado/creditado automaticamente.
    if (data.status && data.status !== "PENDENTE") {
      const prev = state.flowCells[k];
      const jaQuitado = prev && prev.status && prev.status !== "PENDENTE" && prev.settledAt;
      data.settledAt = jaQuitado ? prev.settledAt : new Date().toISOString();
      const item = state.flowItems.find(i => i.id === itemId);
      data.settledValue = effectiveCellValue(item, ymStr, data);
    }
    state.flowCells[k] = data;
    save();
  }

  // ---------- Fatura de cartão (lançamentos da tela Cartões) ----------
  function cardTxDoMes(ymStr, accountId) {
    return (state.cardTx || []).filter(t => t.ym === ymStr && (!accountId || t.accountId === accountId));
  }
  function faturaTotal(ymStr, accountId) {
    return cardTxDoMes(ymStr, accountId).reduce((s, t) => s + t.value, 0);
  }
  function addCardTx(tx) { state.cardTx.push(tx); save(); }
  function removeCardTx(id) { state.cardTx = state.cardTx.filter(t => t.id !== id); save(); }

  // Valor automático do item "Cartão (fatura)": total da fatura do mês, negativo
  function autoCartaoValue(ymStr) {
    const tot = faturaTotal(ymStr, null);
    return tot !== 0 ? -Math.round(tot * 100) / 100 : null;
  }

  // Valor planejado do mês (ignora status) — usado no painel do mês
  function plannedValue(item, ymStr) {
    const c = getCell(item.id, ymStr);
    if (c && c.value != null) return c.value;
    if (item.autoCartao) {
      const v = autoCartaoValue(ymStr);
      if (v != null) return v;
    }
    if (!inRangeRaw(item, ymStr)) return null;
    return item.defaultValue;
  }

  // Valor para projeção de saldo: célula PAGO/RECEBIDO sem valor vale 0 (igual à planilha)
  function projectedValue(item, ymStr) {
    const c = getCell(item.id, ymStr);
    if (c && c.value != null) return c.value;
    if (c && c.status && c.status !== "PENDENTE") return 0;
    if (item.autoCartao) {
      const v = autoCartaoValue(ymStr);
      if (v != null) return v;
    }
    if (!inRangeRaw(item, ymStr)) return null;
    return item.defaultValue;
  }

  function monthTotal(ymStr, fn) {
    let t = 0;
    for (const it of state.flowItems) {
      const v = (fn || projectedValue)(it, ymStr);
      if (v != null) t += v;
    }
    return t;
  }

  // Saldo acumulado.
  // Se o usuário informou o saldo em conta (settings.conta = {ym, valor}), a projeção
  // parte desse valor real: saldo(mês âncora) = valor informado + pendências do próprio mês.
  // Sem âncora, acumula do zero desde o anoInicial (comportamento da planilha).
  function contaAncoraYm() {
    const c = state.settings.conta;
    if (!c) return null;
    return c.at ? c.at.slice(0, 7) : (c.ym || null);
  }

  function saldoSerie(ano) {
    const anchor = state.settings.conta;
    const anchorYm = contaAncoraYm();
    const serie = [];
    let s = 0;
    let cur = U.ym(state.settings.anoInicial, 1);
    const fim = U.ym(ano, 12);
    while (U.ymCmp(cur, fim) <= 0) {
      if (anchor && anchorYm === cur) s = anchor.valor;
      s += monthTotal(cur);
      if (U.ymParse(cur).y === ano) serie.push({ ym: cur, saldo: s });
      cur = U.ymAdd(cur, 1);
    }
    return serie;
  }

  // Projeção do saldo a partir de hoje: começa no saldo atual real da conta e soma, mês a mês,
  // só o que ainda está pendente (itens já Pagos/Recebidos contam 0). Usada no dashboard —
  // fica coerente com o "Saldo em conta" e não mostra meses passados acumulando do zero.
  function saldoProjecaoSerie() {
    const start = U.ymHoje();
    const fim = U.ym(U.ymParse(start).y, 12);
    const base = saldoContaAtual();
    const serie = [];
    let s = base != null ? base : 0;
    let cur = start;
    while (U.ymCmp(cur, fim) <= 0) {
      s += monthTotal(cur); // projectedValue: Pago/Recebido = 0
      serie.push({ ym: cur, saldo: Math.round(s * 100) / 100 });
      cur = U.ymAdd(cur, 1);
    }
    return serie;
  }

  // Saldo atual da conta: parte do valor informado e aplica tudo que já foi realizado depois —
  // itens do fluxo marcados Pago/Recebido e lançamentos via pix/débito/transferência.
  // É recalculado a cada tela (determinístico), então funciona bem com a sincronização.
  function saldoContaAtual() {
    const c = state.settings.conta;
    if (!c) return null;
    const anchorAt = c.at || (c.ym ? c.ym + "-01T00:00:00.000Z" : null);
    let s = c.valor;
    for (const key in state.flowCells) {
      const cell = state.flowCells[key];
      if (!cell || !cell.status || cell.status === "PENDENTE") continue;
      if (cell.settledValue != null && cell.settledAt && (!anchorAt || cell.settledAt > anchorAt)) {
        s += cell.settledValue;
      }
    }
    for (const t of state.transactions) {
      const at = t.createdAt || (t.date ? t.date + "T12:00:00.000Z" : null);
      if (at && (!anchorAt || at > anchorAt)) s += t.value;
    }
    return Math.round(s * 100) / 100;
  }

  function saldoAcumuladoAte(ymStr) {
    const { y } = U.ymParse(ymStr);
    const serie = saldoSerie(y);
    const p = serie.find(p => p.ym === ymStr);
    return p ? p.saldo : 0;
  }

  // ---------- Lançamentos ----------
  function addTransaction(tx) {
    if (!tx.createdAt) tx.createdAt = new Date().toISOString();
    state.transactions.push(tx);
    save();
  }
  function removeTransaction(id) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    save();
  }
  function txDoMes(ymStr) {
    return state.transactions
      .filter(t => t.date && t.date.slice(0, 7) === ymStr)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  // ---------- Despesas por categoria (fluxo planejado + lançamentos) ----------
  function despesasPorCategoria(ymStr) {
    const mapa = {};
    for (const it of state.flowItems) {
      if (it.kind !== "despesa") continue;
      const v = plannedValue(it, ymStr);
      if (v != null && v < 0) mapa[it.categoryId] = (mapa[it.categoryId] || 0) + Math.abs(v);
    }
    for (const t of txDoMes(ymStr)) {
      if (t.value < 0) mapa[t.categoryId || "outros"] = (mapa[t.categoryId || "outros"] || 0) + Math.abs(t.value);
    }
    return mapa;
  }

  function catName(id) {
    const c = state.categories.find(c => c.id === id);
    return c ? c.name : "Sem categoria";
  }
  function accName(id) {
    const a = state.accounts.find(a => a.id === id);
    return a ? a.name : "—";
  }

  // ---------- Investimentos ----------
  function inv() { return state.investments; }

  function rvTotal() {
    let t = 0;
    for (const a of inv().assets) {
      const q = inv().quotes[a.ticker];
      if (q) t += q.price * a.qty;
    }
    return t;
  }
  function rfTotal() {
    return inv().fixed.reduce((s, f) => s + (f.value || 0), 0);
  }

  // Guarda cotações novas e registra o snapshot do dia no histórico
  function saveQuotes(mapa) {
    Object.assign(inv().quotes, mapa);
    const hoje = U.hojeISO();
    const rv = rvTotal(), rf = rfTotal();
    const snap = { date: hoje, rv: Math.round(rv * 100) / 100, rf: Math.round(rf * 100) / 100, total: Math.round((rv + rf) * 100) / 100 };
    const idx = inv().history.findIndex(h => h.date === hoje);
    if (idx >= 0) inv().history[idx] = snap; else inv().history.push(snap);
    if (inv().history.length > 730) inv().history = inv().history.slice(-730);
    save();
  }

  // Aportes do ano: soma do item de fluxo cujo nome contém "invest" (valores negativos = dinheiro aplicado)
  function aportesDoAno(ano) {
    let t = 0;
    for (const it of state.flowItems) {
      if (it.kind !== "despesa" || !/invest/i.test(it.name)) continue;
      for (let m = 1; m <= 12; m++) {
        const v = plannedValue(it, U.ym(ano, m));
        if (v != null && v < 0) t += Math.abs(v);
      }
    }
    return t;
  }

  // ---------- Exportar / importar ----------
  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(txt) {
    const obj = JSON.parse(txt);
    if (!obj || !Array.isArray(obj.flowItems)) throw new Error("Arquivo não parece um backup válido.");
    state = migrate(obj);
    save();
  }
  function resetAll() { state = seed(); save(); }

  return {
    get state() { return state; },
    load, save, seed,
    inRangeRaw, getCell, setCell, plannedValue, projectedValue, effectiveCellValue,
    monthTotal, saldoAcumuladoAte, saldoSerie, saldoProjecaoSerie, saldoContaAtual, contaAncoraYm,
    addTransaction, removeTransaction, txDoMes,
    cardTxDoMes, faturaTotal, addCardTx, removeCardTx,
    inv, rvTotal, rfTotal, saveQuotes, aportesDoAno,
    despesasPorCategoria, catName, accName,
    exportJSON, importJSON, resetAll
  };
})();
