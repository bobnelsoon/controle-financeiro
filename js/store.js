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
      version: 6,
      settings: { anoInicial: 2026, conta: null },
      categories: categoriasPadrao(),
      accounts: [],
      flowItems: [],
      flowCells: {},
      transactions: [],
      loans: [],
      budgets: {},
      cardTx: [],
      investments: { assets: [], fixed: [], quotes: {}, history: [] },
      fuel: { entries: [], vehicle: defaultVehicle(), maintenance: [] }
    };
  }

  function defaultVehicle() {
    return { modelo: "", tanque: null, pneu: "", revisaoKm: null, consumoAlcool: null, consumoGasolina: null };
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
      // O saldo em conta passa a ser atualizado automaticamente. O valor já informado é tratado
      // como "atual no momento da atualização": só movimentos NOVOS (Pago/Recebido e lançamentos
      // pix feitos daqui pra frente) mexem no saldo — nada do histórico é reaplicado retroativamente.
      if (st.settings.conta && st.settings.conta.valor != null && !st.settings.conta.at) {
        st.settings.conta.at = new Date().toISOString();
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
    if (st.version < 6) {
      // Novo controle: Combustível (consumo). Só acrescenta o campo, nada existente muda.
      if (!st.fuel) st.fuel = { entries: [] };
      st.version = 6;
    }
    // Perfil do veículo + manutenção do controle Combustível (idempotente; só acrescenta).
    if (st.fuel) {
      if (st.fuel.vehicle === undefined || st.fuel.vehicle === null) st.fuel.vehicle = defaultVehicle();
      if (!Array.isArray(st.fuel.maintenance)) st.fuel.maintenance = [];
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
  function removeCardTxIds(ids) { const set = new Set(ids); state.cardTx = (state.cardTx || []).filter(t => !set.has(t.id)); save(); }

  // Descobre base/parcela a partir da descrição no formato "descrição NN/MM"
  function cardTxParcelaInfo(desc) {
    const m = /^(.*?)\s+(\d{2})\/(\d{2})$/.exec(desc || "");
    return m ? { base: m[1], i: m[2], n: m[3] } : null;
  }
  // Todas as parcelas irmãs de uma compra parcelada: por groupId (compras novas) ou,
  // no fallback, pela descrição base + mesmo cartão (compras antigas, sem groupId).
  function cardTxParcelas(tx) {
    const all = state.cardTx || [];
    if (tx.groupId) {
      const g = all.filter(t => t.groupId === tx.groupId);
      if (g.length) return g;
    }
    const info = cardTxParcelaInfo(tx.desc);
    if (!info) return [tx];
    return all.filter(t => {
      if (t.accountId !== tx.accountId) return false;
      const pi = cardTxParcelaInfo(t.desc);
      return pi && pi.base === info.base && pi.n === info.n;
    });
  }

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
    // Parcelas de empréstimo recebidas (PAGO) depois da âncora entram no saldo, igual às
    // receitas do fluxo marcadas Recebido — assim marcar PAGO some do "a receber" e cai no saldo.
    for (const l of state.loans) {
      for (const p of (l.items || [])) {
        if (p.status === "PAGO" && p.settledAt && (!anchorAt || p.settledAt > anchorAt)) s += (p.value || 0);
      }
    }
    return Math.round(s * 100) / 100;
  }

  function saldoAcumuladoAte(ymStr) {
    const { y } = U.ymParse(ymStr);
    const serie = saldoSerie(y);
    const p = serie.find(p => p.ym === ymStr);
    return p ? p.saldo : 0;
  }

  // Saldo acumulado projetado — parte do saldo real da conta HOJE e projeta mês a mês,
  // somando só o que ainda falta (projectedValue: itens já Pagos/Recebidos contam 0, pois
  // já estão embutidos no saldo em conta). Mesma projeção do dashboard (saldoProjecaoSerie),
  // então o mês atual fecha idêntico ao "Acumulado do mês". Com tudo quitado no mês, o
  // acumulado é igual ao próprio saldo em conta. Meses já realizados (antes do atual) ficam
  // vazios. Sem saldo em conta informado, cai no saldoSerie antigo (estilo planilha).
  function saldoAcumuladoSerie(ano) {
    const base = saldoContaAtual();
    if (base == null) return saldoSerie(ano);
    const start = U.ymHoje();
    const fimAno = U.ym(ano, 12);
    const map = {};
    let s = base;
    let cur = start;
    while (U.ymCmp(cur, fimAno) <= 0) {
      s = Math.round((s + monthTotal(cur)) * 100) / 100;
      map[cur] = s;
      cur = U.ymAdd(cur, 1);
    }
    const serie = [];
    for (let m = 1; m <= 12; m++) {
      const ym = U.ym(ano, m);
      serie.push({ ym, saldo: map[ym] != null ? map[ym] : null });
    }
    return serie;
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

  // Rentabilidade da carteira de ações/FIIs: compara o valor atual (cotação) com o preço pago.
  // Considera só ativos que têm preço médio informado e cotação. Retorna null se não houver base.
  function carteiraRentabilidade() {
    let custo = 0, atual = 0, temBase = false;
    for (const a of inv().assets) {
      const q = inv().quotes[a.ticker];
      if (a.avgPrice == null || a.avgPrice <= 0 || !q) continue;
      temBase = true;
      custo += a.avgPrice * a.qty;
      atual += q.price * a.qty;
    }
    if (!temBase || custo <= 0) return null;
    const ganho = atual - custo;
    return { custo, atual, ganho, pct: (ganho / custo) * 100 };
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

  // ---------- Combustível (controle de consumo) ----------
  // Cada abastecimento: { id, date, odometer, liters, pricePerLiter, total, fuelType, local, toll, obs, full }.
  // Registros só de pedágio (sem abastecer) têm liters null/0 e guardam apenas o toll.
  // Ordenados do mais antigo ao mais novo (por data; hodômetro como desempate).
  function fuelEntries() {
    return (state.fuel && state.fuel.entries ? state.fuel.entries : []).slice().sort((a, b) => {
      const d = (a.date || "").localeCompare(b.date || "");
      if (d !== 0) return d;
      return (a.odometer || 0) - (b.odometer || 0);
    });
  }

  function addFuel(e) {
    if (!state.fuel) state.fuel = { entries: [] };
    state.fuel.entries.push({ id: U.id(), ...e });
    save();
  }
  // Insere vários de uma vez (importação): um único save no fim.
  function addFuelMany(list) {
    if (!state.fuel) state.fuel = { entries: [] };
    for (const e of list) state.fuel.entries.push({ id: U.id(), ...e });
    save();
  }
  function updateFuel(id, patch) {
    const e = (state.fuel.entries || []).find(x => x.id === id);
    if (e) { Object.assign(e, patch); save(); }
  }
  function removeFuel(id) {
    state.fuel.entries = (state.fuel.entries || []).filter(x => x.id !== id);
    save();
  }
  function clearFuel() {
    if (!state.fuel) state.fuel = { entries: [] };
    state.fuel.entries = [];
    save();
  }

  // Consumo pelo método correto "tanque cheio → tanque cheio": a distância desde o último
  // tanque cheio dividida pelos litros abastecidos no intervalo (somando abastecimentos parciais).
  // Só calcula quando o intervalo não mistura combustíveis diferentes. Abastecimentos parciais
  // não geram um número próprio (contam para o próximo tanque cheio). `dist` é a distância bruta
  // desde o registro com hodômetro anterior (para exibição).
  function fuelEntriesComputed() {
    const list = fuelEntries();
    let prevKm = null;              // último hodômetro conhecido (para dist bruta)
    let lastFullKm = null;         // hodômetro do último tanque cheio
    let segLiters = 0, segPaid = 0, segFuel = null, segMixed = false;
    return list.map((e) => {
      const temAbast = e.liters != null && e.liters > 0 && e.odometer != null;
      let dist = null, kmL = null, segDist = null, segLitersOut = null, custoKm = null;
      if (e.odometer != null && prevKm != null && e.odometer > prevKm) dist = e.odometer - prevKm;

      if (temAbast) {
        if (lastFullKm != null) {
          segLiters += e.liters;
          segPaid += (e.total || 0);
          if (segFuel != null && e.fuelType && e.fuelType !== segFuel) segMixed = true;
        }
        const cheio = e.full !== false;
        if (cheio) {
          if (lastFullKm != null && e.odometer > lastFullKm && segLiters > 0 && !segMixed) {
            segDist = e.odometer - lastFullKm;
            segLitersOut = segLiters;
            kmL = segDist / segLiters;
            if (segDist > 0) custoKm = segPaid / segDist;
          }
          lastFullKm = e.odometer; segLiters = 0; segPaid = 0; segFuel = e.fuelType || null; segMixed = false;
        }
      }
      if (e.odometer != null) prevKm = e.odometer;
      return { ...e, dist, kmL, segDist, segLiters: segLitersOut, custoKm };
    });
  }

  function fuelStats(ym) {
    const alvo = ym || U.ymHoje();
    const comp = fuelEntriesComputed();
    const validos = comp.filter(e => e.kmL != null);
    const distValida = validos.reduce((s, e) => s + e.segDist, 0);
    const litrosValidos = validos.reduce((s, e) => s + e.segLiters, 0);
    const pagoValido = validos.reduce((s, e) => s + (e.custoKm != null ? e.custoKm * e.segDist : 0), 0);
    const consumoMedio = litrosValidos > 0 ? distValida / litrosValidos : null;
    const ultimoConsumo = validos.length ? validos[validos.length - 1].kmL : null;
    const custoKmMedio = distValida > 0 ? pagoValido / distValida : null;

    const doMes = comp.filter(e => (e.date || "").slice(0, 7) === alvo);
    const abastMes = doMes.filter(e => e.liters != null && e.liters > 0);
    const gastoMes = abastMes.reduce((s, e) => s + (e.total || 0), 0);
    const litrosMes = abastMes.reduce((s, e) => s + (e.liters || 0), 0);
    const precoMedioMes = litrosMes > 0 ? gastoMes / litrosMes : null;
    const kmMes = doMes.reduce((s, e) => s + (e.dist || 0), 0);
    const tollMes = doMes.reduce((s, e) => s + (e.toll || 0), 0);

    const gastoTotal = comp.reduce((s, e) => s + (e.total || 0), 0);
    const tollTotal = comp.reduce((s, e) => s + (e.toll || 0), 0);
    const nAbast = comp.filter(e => e.liters != null && e.liters > 0).length;
    return {
      consumoMedio, ultimoConsumo, custoKmMedio,
      gastoMes, litrosMes, precoMedioMes, kmMes, tollMes,
      gastoTotal, tollTotal, nAbast, nMes: abastMes.length
    };
  }

  // Gasto por mês (combustível e pedágio separados), do mais antigo ao mais novo
  function fuelGastoPorMes() {
    const comp = fuelEntriesComputed();
    const map = {};
    for (const e of comp) {
      const ym = (e.date || "").slice(0, 7);
      if (!ym) continue;
      if (!map[ym]) map[ym] = { ym, comb: 0, toll: 0, litros: 0, km: 0 };
      map[ym].comb += e.total || 0;
      map[ym].toll += e.toll || 0;
      map[ym].litros += e.liters || 0;
      map[ym].km += e.dist || 0;
    }
    return Object.values(map).sort((a, b) => a.ym.localeCompare(b.ym));
  }

  // Previsão de gasto para o PRÓXIMO mês (para o usuário se programar).
  // Combustível estimado pelo ritmo real (km/dia) ÷ consumo médio × preço recente do litro;
  // pedágio pela média mensal dos meses já fechados. Pedágio fica separado (informativo).
  function fuelPrevisaoProxMes() {
    const pace = fuelPaceKmDia();
    const stats = fuelStats();
    const consumo = stats.consumoMedio;
    const meses = fuelGastoPorMes();
    const ymAtual = U.ymHoje();
    const ymProx = U.ymAdd(ymAtual, 1);
    const { y, m } = U.ymParse(ymProx);
    const diasProx = new Date(y, m, 0).getDate();

    // preço médio recente do litro: último mês com litros
    let precoLitro = null;
    for (let i = meses.length - 1; i >= 0; i--) { if (meses[i].litros > 0) { precoLitro = meses[i].comb / meses[i].litros; break; } }

    const kmPrev = pace != null ? pace * diasProx : null;
    const litrosPrev = (kmPrev != null && consumo) ? kmPrev / consumo : null;
    const combPrev = (litrosPrev != null && precoLitro != null) ? litrosPrev * precoLitro : null;

    // pedágio médio mensal — usa meses fechados (anteriores ao atual). Descarta o 1º mês quando
    // for claramente parcial (pedágio < metade da mediana dos demais), para não puxar a média pra baixo.
    let fechados = meses.filter(x => x.ym < ymAtual && x.toll > 0);
    if (fechados.length >= 3) {
      const resto = fechados.slice(1).map(x => x.toll).sort((a, b) => a - b);
      const mediana = resto[Math.floor(resto.length / 2)];
      if (fechados[0].toll < mediana * 0.5) fechados = fechados.slice(1);
    }
    const baseToll = fechados.length ? fechados : meses.filter(x => x.toll > 0);
    const tollPrev = baseToll.length ? baseToll.reduce((s, x) => s + x.toll, 0) / baseToll.length : null;

    const totalPrev = (combPrev != null || tollPrev != null) ? (combPrev || 0) + (tollPrev || 0) : null;
    return { ymProx, diasProx, pace, consumo, precoLitro, kmPrev, litrosPrev, combPrev, tollPrev, totalPrev };
  }

  // Perfil do veículo
  function fuelVehicle() {
    if (!state.fuel) state.fuel = { entries: [] };
    if (!state.fuel.vehicle) state.fuel.vehicle = defaultVehicle();
    return state.fuel.vehicle;
  }
  function setFuelVehicle(patch) { Object.assign(fuelVehicle(), patch); save(); }

  // Manutenção programada (itens { id, desc, value, done })
  function fuelMaintenance() {
    if (!state.fuel) state.fuel = { entries: [] };
    if (!Array.isArray(state.fuel.maintenance)) state.fuel.maintenance = [];
    return state.fuel.maintenance;
  }
  function addMaintenance(item) { fuelMaintenance().push({ id: U.id(), done: false, ...item }); save(); }
  function updateMaintenance(id, patch) { const it = fuelMaintenance().find(x => x.id === id); if (it) { Object.assign(it, patch); save(); } }
  function removeMaintenance(id) { state.fuel.maintenance = fuelMaintenance().filter(x => x.id !== id); save(); }
  function clearMaintenance() { fuelMaintenance(); state.fuel.maintenance = []; save(); }

  // Km atual = maior hodômetro registrado
  function fuelKmAtual() {
    const ods = (state.fuel && state.fuel.entries ? state.fuel.entries : []).map(e => e.odometer).filter(v => v != null);
    return ods.length ? Math.max(...ods) : null;
  }
  // Ritmo médio (km/dia) entre o primeiro e o último registro com hodômetro
  function fuelPaceKmDia() {
    const list = fuelEntries().filter(e => e.odometer != null);
    if (list.length < 2) return null;
    const a = list[0], b = list[list.length - 1];
    const dias = (new Date(b.date) - new Date(a.date)) / 86400000;
    return dias > 0 ? (b.odometer - a.odometer) / dias : null;
  }
  // Consumo médio real por combustível (km/l), a partir dos intervalos tanque cheio → tanque cheio
  function fuelConsumoPorFuel() {
    const comp = fuelEntriesComputed().filter(e => e.kmL != null && e.segLiters != null);
    const acc = {};
    for (const e of comp) {
      const f = e.fuelType || "?";
      if (!acc[f]) acc[f] = { dist: 0, liters: 0 };
      acc[f].dist += e.segDist; acc[f].liters += e.segLiters;
    }
    const out = {};
    for (const f in acc) out[f] = acc[f].liters > 0 ? acc[f].dist / acc[f].liters : null;
    return out;
  }
  // Último preço informado de um combustível (para pré-preencher o comparador)
  function fuelUltimoPreco(fuelType) {
    const list = fuelEntries().filter(e => e.fuelType === fuelType && e.pricePerLiter != null);
    return list.length ? list[list.length - 1].pricePerLiter : null;
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
    saldoAcumuladoSerie,
    addTransaction, removeTransaction, txDoMes,
    cardTxDoMes, faturaTotal, addCardTx, removeCardTx, removeCardTxIds, cardTxParcelas,
    inv, rvTotal, rfTotal, carteiraRentabilidade, saveQuotes, aportesDoAno,
    despesasPorCategoria, catName, accName,
    fuelEntries, fuelEntriesComputed, fuelStats, addFuel, addFuelMany, updateFuel, removeFuel, clearFuel,
    fuelVehicle, setFuelVehicle, fuelMaintenance, addMaintenance, updateMaintenance, removeMaintenance, clearMaintenance,
    fuelKmAtual, fuelPaceKmDia, fuelConsumoPorFuel, fuelUltimoPreco,
    fuelGastoPorMes, fuelPrevisaoProxMes,
    exportJSON, importJSON, resetAll
  };
})();
