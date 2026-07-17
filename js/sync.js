// Sincronização entre aparelhos via GitHub Gist privado (dados só na conta do usuário).
// A chave (token) fica salva apenas neste navegador, fora do backup e fora do gist.
"use strict";

const Sync = (() => {
  const CFG_KEY = "controle-financeiro-sync";
  const GIST_DESC = "Controle Financeiro — sincronização (criado pelo app)";
  const GIST_FILE = "controle-financeiro.json";
  const DEBOUNCE_MS = 4000;

  let cfg = null;        // { token, gistId, usuario, lastChange, lastSync }
  let timer = null;
  let aplicandoRemoto = false;
  let statusMsg = "";

  function loadCfg() {
    if (cfg) return cfg;
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
    catch (e) { cfg = {}; }
    return cfg;
  }
  function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

  function ativo() { return !!loadCfg().token; }

  async function api(path, method, body) {
    const r = await fetch("https://api.github.com" + path, {
      method: method || "GET",
      headers: {
        "Authorization": "Bearer " + cfg.token,
        "Accept": "application/vnd.github+json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 401) throw new Error("Chave inválida ou expirada. Gere uma nova em github.com.");
    if (r.status === 403) throw new Error("Sem permissão — confira se a chave tem o escopo \"gist\".");
    if (!r.ok && r.status !== 404) throw new Error("GitHub respondeu " + r.status);
    return r;
  }

  async function acharOuCriarGist() {
    if (cfg.gistId) {
      const r = await api("/gists/" + cfg.gistId);
      if (r.ok) return cfg.gistId;
      cfg.gistId = null; // gist foi apagado — procurar/criar de novo
    }
    const lista = await (await api("/gists?per_page=100")).json();
    const achado = lista.find(g => g.files && g.files[GIST_FILE]);
    if (achado) { cfg.gistId = achado.id; saveCfg(); return cfg.gistId; }
    // não existe ainda — cria privado com o estado atual
    const novo = await (await api("/gists", "POST", {
      description: GIST_DESC,
      public: false,
      files: { [GIST_FILE]: { content: pacoteLocal() } }
    })).json();
    cfg.gistId = novo.id;
    cfg.lastSync = Date.now();
    saveCfg();
    return cfg.gistId;
  }

  function pacoteLocal() {
    return JSON.stringify({ savedAt: cfg.lastChange || Date.now(), state: Store.state });
  }

  async function baixarRemoto() {
    const g = await (await api("/gists/" + cfg.gistId)).json();
    const f = g.files && g.files[GIST_FILE];
    if (!f) return null;
    let txt = f.content;
    if (f.truncated) txt = await (await fetch(f.raw_url)).text(); // arquivo grande
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  async function push() {
    await api("/gists/" + cfg.gistId, "PATCH", {
      files: { [GIST_FILE]: { content: pacoteLocal() } }
    });
    cfg.lastSync = Date.now();
    saveCfg();
  }

  function temDados(s) {
    return !!(s && ((s.flowItems || []).length || (s.transactions || []).length ||
      (s.cardTx || []).length || ((s.investments || {}).assets || []).length));
  }

  // Sincroniza de verdade: o lado com alteração mais recente vence.
  // Proteção: um aparelho vazio nunca sobrescreve dados de um aparelho com dados.
  async function sincronizar() {
    if (!ativo()) return "desligado";
    await acharOuCriarGist();
    const remoto = await baixarRemoto();
    if (remoto && !temDados(remoto.state) && temDados(Store.state)) {
      await push();          // cofre vazio + aparelho com dados → envia
      return "enviado";
    }
    const localTs = temDados(Store.state) ? (cfg.lastChange || 0) : 0; // aparelho vazio sempre aceita o cofre
    if (remoto && remoto.state && remoto.savedAt > localTs) {
      aplicandoRemoto = true;
      try {
        Store.importJSON(JSON.stringify(remoto.state));
        cfg.lastChange = remoto.savedAt;
        cfg.lastSync = Date.now();
        saveCfg();
      } finally { aplicandoRemoto = false; }
      return "baixado";
    }
    await push();
    return "enviado";
  }

  // Chamado pelo Store a cada save(): agenda um envio (com pausa para agrupar edições)
  function onLocalSave() {
    if (!ativo() || aplicandoRemoto) return;
    cfg.lastChange = Date.now();
    saveCfg();
    clearTimeout(timer);
    timer = setTimeout(() => {
      push().then(() => { statusMsg = ""; notificar(); })
        .catch(e => { statusMsg = "⚠ Falha ao enviar: " + e.message; notificar(); });
    }, DEBOUNCE_MS);
  }

  // Ativa a sincronização com uma chave nova (valida e faz a primeira sincronização)
  async function ativar(token) {
    loadCfg();
    cfg.token = token.trim();
    const u = await (await api("/user")).json();
    cfg.usuario = u.login;
    saveCfg();
    const acao = await sincronizar();
    return { usuario: u.login, acao };
  }

  function desativar() {
    clearTimeout(timer);
    cfg = {};
    localStorage.removeItem(CFG_KEY);
  }

  // Ao abrir o app: baixa alterações feitas em outro aparelho
  async function init() {
    if (!ativo()) return;
    try {
      const acao = await sincronizar();
      statusMsg = "";
      if (acao === "baixado") App.render();
    } catch (e) {
      statusMsg = "⚠ Sem sincronizar: " + e.message;
    }
    notificar();
  }

  function notificar() {
    const el = document.getElementById("sync-status");
    if (el) el.textContent = statusTexto();
  }

  function statusTexto() {
    if (!ativo()) return "";
    if (statusMsg) return statusMsg;
    if (cfg.lastSync) {
      const d = new Date(cfg.lastSync);
      return "✓ sincronizado às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return "";
  }

  return {
    get config() { return loadCfg(); },
    ativo, ativar, desativar, sincronizar, onLocalSave, init, statusTexto
  };
})();
