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

  // ---------- brapi.dev (principal): cotação + dividendos numa chamada só ----------
  // Aceita vários tickers separados por vírgula. Com `dividends=true` vem o histórico de proventos.
  async function viaBrapiFull(tickers, token) {
    if (!tickers.length) return { quotes: {}, dividends: {} };
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(tickers.join(","))}?dividends=true` +
      (token ? `&token=${encodeURIComponent(token)}` : "");
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const results = (j && j.results) || [];
    const quotes = {}, dividends = {};
    for (const q of results) {
      const t = q && q.symbol;
      if (!t) continue;
      if (q.regularMarketPrice != null) {
        const prev = q.regularMarketPreviousClose != null ? q.regularMarketPreviousClose : q.regularMarketPrice;
        quotes[t] = { price: q.regularMarketPrice, prevClose: prev, name: q.longName || q.shortName || t, updatedAt: Date.now() };
      }
      const cash = q.dividendsData && q.dividendsData.cashDividends;
      if (Array.isArray(cash) && cash.length) {
        const list = cash
          .filter(x => x.rate != null && x.paymentDate)
          .map(x => ({ value: Number(x.rate), payDate: String(x.paymentDate).slice(0, 10) }))
          .filter(x => !isNaN(x.value) && x.payDate)
          .sort((a, b) => (a.payDate < b.payDate ? -1 : 1))
          .slice(-48); // no máximo ~4 anos, para não inflar o backup
        if (list.length) dividends[t] = { list, updatedAt: Date.now() };
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
          out[t] = { price: q.price, prevClose, name: q.name || t, updatedAt: Date.now() };
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
          if (list.length) return { list, updatedAt: Date.now() };
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
