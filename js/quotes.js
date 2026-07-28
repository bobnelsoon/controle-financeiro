// Cotações de ações e FIIs da B3 e dividendos por cota.
// Fonte principal: brapi.dev (token pessoal do usuário, guardado nas Configurações e sincronizado
// de forma privada — NÃO fica no código). Uma só chamada traz cotação + dividendos.
// Reservas de cotação: HG Brasil (chave exposta, travada no domínio), mfinance e Yahoo.
// Reserva de dividendos: mfinance (histórico).
"use strict";

const Quotes = (() => {
  // Chave "exposta" do HG Brasil, restrita ao domínio publicado (bobnelsoon.github.io). Por ser
  // do tipo browser + domain-locked, pode ficar no código (só funciona a partir do site do usuário).
  const HG_KEY = "c0f5c4be";

  // ---------- brapi.dev (principal): cotação + dividendos por cota ----------
  // IMPORTANTE: no plano GRATUITO do brapi cada chamada aceita só UM ticker (o multi-ticker por
  // vírgula é do plano pago e faz a chamada inteira falhar). Por isso buscamos um ticker por vez,
  // em paralelo — assim funciona no grátis e um ticker que falha não derruba os outros.
  function parseBrapiCash(q) {
    const cash = q.dividendsData && q.dividendsData.cashDividends;
    if (!Array.isArray(cash) || !cash.length) return null;
    const list = cash
      .filter(x => x.rate != null && x.paymentDate)
      .map(x => ({ value: Number(x.rate), payDate: String(x.paymentDate).slice(0, 10) }))
      .filter(x => !isNaN(x.value) && x.payDate)
      .sort((a, b) => (a.payDate < b.payDate ? -1 : 1))
      .slice(-48); // no máximo ~4 anos, para não inflar o backup
    return list.length ? { list, source: "brapi", updatedAt: Date.now() } : null;
  }

  async function viaBrapiOne(ticker, token) {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?dividends=true` +
      (token ? `&token=${encodeURIComponent(token)}` : "");
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const q = j && j.results && j.results[0];
    if (!q) throw new Error(j && j.message ? j.message : "sem dados");
    const out = { quote: null, dividends: null };
    if (q.regularMarketPrice != null) {
      const prev = q.regularMarketPreviousClose != null ? q.regularMarketPreviousClose : q.regularMarketPrice;
      out.quote = { price: q.regularMarketPrice, prevClose: prev, name: q.longName || q.shortName || ticker, source: "brapi", updatedAt: Date.now() };
    }
    out.dividends = parseBrapiCash(q);
    return out;
  }

  // Executa `fn` sobre os itens com no máximo `limit` em paralelo (para não estourar o limite de
  // requisições/minuto do plano grátis do brapi, que derrubaria parte dos tickers).
  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let i = 0;
    async function worker() {
      while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
    }
    const n = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: n }, worker));
    return results;
  }

  // Busca cada ticker individualmente, no máximo 3 por vez, com UMA nova tentativa após uma pausa
  // (o plano grátis limita requisições por minuto — a 2ª tentativa recupera os que tomaram 429).
  async function viaBrapiFull(tickers, token) {
    const quotes = {}, dividends = {};
    if (!tickers.length) return { quotes, dividends };
    const res = await mapLimit(tickers, 3, async (t) => {
      try { return { t, v: await viaBrapiOne(t, token) }; }
      catch (e) {
        try { await new Promise(r => setTimeout(r, 700)); return { t, v: await viaBrapiOne(t, token) }; }
        catch (e2) { return { t, v: null }; }
      }
    });
    for (const r of res) {
      if (r && r.v) {
        if (r.v.quote) quotes[r.t] = r.v.quote;
        if (r.v.dividends) dividends[r.t] = r.v.dividends;
      }
    }
    return { quotes, dividends };
  }

  // ---------- HG Brasil (reserva de cotação): vários símbolos numa chamada só ----------
  async function viaHGMany(tickers) {
    if (!tickers.length) return {};
    const url = `https://api.hgbrasil.com/finance/stock_price?key=${HG_KEY}&symbol=${encodeURIComponent(tickers.join(","))}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const results = j && j.results;
    const out = {};
    if (results) {
      for (const t of tickers) {
        const q = results[t] || results[t.toUpperCase()];
        if (q && q.price != null && !q.error) {
          const chg = Number(q.change_percent);
          const prevClose = (!isNaN(chg) && (1 + chg / 100) !== 0) ? q.price / (1 + chg / 100) : q.price;
          out[t] = { price: q.price, prevClose, name: q.name || t, source: "hg", updatedAt: Date.now() };
        }
      }
    }
    return out;
  }

  // mfinance tem endpoints separados para FIIs e ações — tenta os dois
  async function viaMfinance(ticker) {
    const bases = ticker.match(/11B?$/) // FIIs geralmente terminam em 11
      ? ["fiis", "stocks"]
      : ["stocks", "fiis"];
    let ultimoErro = null;
    for (const base of bases) {
      try {
        const r = await fetch(`https://mfinance.com.br/api/v1/${base}/${encodeURIComponent(ticker)}`);
        if (!r.ok) { ultimoErro = new Error("HTTP " + r.status); continue; }
        const j = await r.json();
        if (j && j.lastPrice) {
          return {
            price: j.lastPrice,
            prevClose: j.closingPrice != null ? j.closingPrice : j.lastPrice,
            name: j.name || ticker,
            source: "mfinance",
            updatedAt: Date.now()
          };
        }
        ultimoErro = new Error("sem dados");
      } catch (e) { ultimoErro = e; }
    }
    throw ultimoErro || new Error("sem dados");
  }

  async function viaBrapi(ticker) {
    const { quotes } = await viaBrapiFull([ticker], "");
    if (quotes[ticker]) return quotes[ticker];
    throw new Error("sem dados");
  }

  async function viaYahoo(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.SA?interval=1d&range=1d`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const res = j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.meta || res.meta.regularMarketPrice == null) throw new Error("sem dados");
    const m = res.meta;
    return {
      price: m.regularMarketPrice,
      prevClose: m.previousClose != null ? m.previousClose : m.chartPreviousClose,
      name: m.longName || m.shortName || ticker,
      source: "yahoo",
      updatedAt: Date.now()
    };
  }

  function tokenAtual() {
    try { return (typeof Store !== "undefined" && Store.brapiToken) ? Store.brapiToken() : ""; }
    catch (e) { return ""; }
  }

  async function fetchQuote(ticker) {
    const token = tokenAtual();
    const fontes = [() => viaBrapiFull([ticker], token).then(r => { if (r.quotes[ticker]) return r.quotes[ticker]; throw new Error("sem dados"); }), viaHG1, viaMfinance, viaYahoo];
    let ultimoErro = null;
    for (const fonte of fontes) {
      try { return await fonte(ticker); } catch (e) { ultimoErro = e; }
    }
    throw ultimoErro || new Error("todas as fontes falharam");
  }
  async function viaHG1(ticker) {
    const m = await viaHGMany([ticker]);
    if (m[ticker]) return m[ticker];
    throw new Error("sem dados");
  }

  // Só as fontes reserva (sem brapi) — usadas para o que o brapi/HG não trouxeram.
  async function fetchQuoteReserva(ticker) {
    for (const fonte of [viaMfinance, viaYahoo]) {
      try { return await fonte(ticker); } catch (e) {}
    }
    throw new Error("todas as reservas falharam");
  }

  // Busca várias; devolve { ok: {ticker: quote}, falhas: [ticker], dividends: {ticker: {list,...}} }.
  // 1º tenta o brapi (cotação + dividendos numa chamada só, com o token do usuário); depois o HG em
  // lote para o que faltar de cotação; por fim as reservas individuais.
  async function fetchAll(tickers, token) {
    token = token != null ? token : tokenAtual();
    const ok = {}, dividends = {};
    if (token) {
      try {
        const r = await viaBrapiFull(tickers, token);
        Object.assign(ok, r.quotes);
        Object.assign(dividends, r.dividends);
      } catch (e) { /* segue pros fallbacks */ }
    }
    const semCotacao = tickers.filter(t => !ok[t]);
    if (semCotacao.length) {
      try { Object.assign(ok, await viaHGMany(semCotacao)); } catch (e) { /* segue */ }
    }
    const restantes = tickers.filter(t => !ok[t]);
    const falhas = [];
    if (restantes.length) {
      const res = await Promise.allSettled(restantes.map(fetchQuoteReserva));
      restantes.forEach((t, i) => {
        if (res[i].status === "fulfilled") ok[t] = res[i].value;
        else falhas.push(t);
      });
    }
    return { ok, falhas, dividends };
  }

  // ---------- Dividendos (reserva: mfinance) ----------
  // Histórico de dividendos por cota: devolve { list: [{value, payDate}] } com TODOS os pagamentos
  // (últimos ~48). FIIs em /fiis/dividends, ações em /stocks/dividends. Usado quando o brapi não trouxe.
  async function fetchDividend(ticker) {
    const bases = ticker.match(/11B?$/) ? ["fiis", "stocks"] : ["stocks", "fiis"];
    let ultimoErro = null;
    for (const base of bases) {
      try {
        const r = await fetch(`https://mfinance.com.br/api/v1/${base}/dividends/${encodeURIComponent(ticker)}`);
        if (!r.ok) { ultimoErro = new Error("HTTP " + r.status); continue; }
        const j = await r.json();
        const arr = j && j.dividends;
        if (Array.isArray(arr) && arr.length) {
          const list = arr
            .filter(x => x.value != null && (x.payDate || x.declaredDate))
            .map(x => ({ value: x.value, payDate: (x.payDate || x.declaredDate).slice(0, 10) }))
            .sort((a, b) => (a.payDate < b.payDate ? -1 : 1))
            .slice(-48); // no máximo ~4 anos, para não inflar o backup
          if (list.length) return { list, source: "mfinance", updatedAt: Date.now() };
        }
        ultimoErro = new Error("sem dividendos");
      } catch (e) { ultimoErro = e; }
    }
    throw ultimoErro || new Error("sem dividendos");
  }

  async function fetchDividendsAll(tickers) {
    const resultados = await Promise.allSettled(tickers.map(fetchDividend));
    const ok = {}, falhas = [];
    tickers.forEach((t, i) => {
      if (resultados[i].status === "fulfilled") ok[t] = resultados[i].value;
      else falhas.push(t);
    });
    return { ok, falhas };
  }

  return { fetchQuote, fetchAll, fetchDividend, fetchDividendsAll };
})();
