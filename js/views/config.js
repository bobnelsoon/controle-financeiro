// Tela: Configurações — categorias, backup (exportar/importar) e reset
"use strict";

const ViewConfig = (() => {
  function exportar() {
    const blob = new Blob([Store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "controle-financeiro-backup-" + U.hojeISO() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function render(root) {
    const st = Store.state;
    root.innerHTML = `
      <div class="page-head"><h1>Configurações</h1></div>

      <div class="grid-2">
        <div class="card">
          <h2 class="section">Categorias</h2>
          <div id="cat-list"></div>
          <div class="row-gap mt">
            <input type="text" id="nova-cat" placeholder="Nova categoria">
            <button id="btn-add-cat">Adicionar</button>
          </div>
        </div>

        <div>
          <div class="card mb">
            <h2 class="section">📱 Sincronização com o celular</h2>
            <div id="sync-box"></div>
          </div>
          <div class="card mb">
            <h2 class="section">Backup dos dados</h2>
            <p class="muted" style="font-size:12.5px">Os dados ficam salvos neste navegador. Exporte um backup de vez em quando (guarde no iCloud/OneDrive) e importe para restaurar ou trocar de computador.</p>
            <div class="row-gap">
              <button class="btn-primary" id="btn-export">⬇ Exportar backup (.json)</button>
              <button id="btn-import">⬆ Importar backup</button>
              <input type="file" id="file-import" accept=".json" style="display:none">
            </div>
          </div>
          <div class="card">
            <h2 class="section">Zona de perigo</h2>
            <button class="btn-danger" id="btn-reset">Restaurar dados iniciais da planilha</button>
            <p class="muted" style="font-size:12px">Apaga tudo o que foi editado no app e volta ao estado importado da planilha.</p>
          </div>
        </div>
      </div>`;

    const list = root.querySelector("#cat-list");
    for (const c of st.categories) {
      const row = U.el(`
        <div class="list-row">
          <span class="grow">${U.esc(c.name)}</span>
          <button class="btn-sm btn-danger">✕</button>
        </div>`);
      row.querySelector("button").addEventListener("click", () => {
        UI.confirmar(`Excluir a categoria "${c.name}"? Itens que a usam passam a "Sem categoria".`, () => {
          st.categories = st.categories.filter(x => x.id !== c.id);
          delete st.budgets[c.id];
          Store.save();
          App.render();
        });
      });
      list.appendChild(row);
    }

    root.querySelector("#btn-add-cat").addEventListener("click", () => {
      const inp = root.querySelector("#nova-cat");
      const nome = inp.value.trim();
      if (!nome) return;
      st.categories.push({ id: U.id(), name: nome });
      Store.save();
      App.render();
    });

    root.querySelector("#btn-export").addEventListener("click", exportar);
    const fileInput = root.querySelector("#file-import");
    root.querySelector("#btn-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importJSON(reader.result);
          App.render();
          alert("Backup importado com sucesso!");
        } catch (e) {
          alert("Não foi possível importar: " + e.message);
        }
      };
      reader.readAsText(f);
    });

    root.querySelector("#btn-reset").addEventListener("click", () => {
      UI.confirmar("Tem certeza? Todos os dados editados no app serão apagados.", () => {
        Store.resetAll();
        App.render();
      });
    });

    renderSync(root.querySelector("#sync-box"));
  }

  function renderSync(box) {
    if (Sync.ativo()) {
      const c = Sync.config;
      box.innerHTML = `
        <p class="muted" style="font-size:12.5px">Conectado como <b>${U.esc(c.usuario || "?")}</b>.
        Tudo o que você fizer aqui é enviado automaticamente para o seu cofre privado no GitHub
        e aparece nos outros aparelhos ao abrir o app.</p>
        <p id="sync-status" class="muted" style="font-size:12px">${U.esc(Sync.statusTexto())}</p>
        <div class="row-gap">
          <button class="btn-primary" id="btn-sync-agora">🔄 Sincronizar agora</button>
          <button class="btn-danger" id="btn-sync-off">Desativar</button>
        </div>`;
      box.querySelector("#btn-sync-agora").addEventListener("click", async (e) => {
        e.target.disabled = true; e.target.textContent = "Sincronizando...";
        try {
          const acao = await Sync.sincronizar();
          alert(acao === "baixado" ? "Dados mais novos baixados do outro aparelho!" : "Seus dados foram enviados!");
          App.render();
        } catch (err) { alert("Falha na sincronização: " + err.message); App.render(); }
      });
      box.querySelector("#btn-sync-off").addEventListener("click", () => {
        UI.confirmar("Desligar a sincronização neste aparelho? (Os dados continuam salvos aqui e no cofre.)", () => {
          Sync.desativar();
          App.render();
        });
      });
    } else {
      box.innerHTML = `
        <p class="muted" style="font-size:12.5px">Sincronize seus dados entre o computador e o celular
        usando um cofre privado na sua conta do GitHub (gratuito). Crie uma chave de acesso em
        <b>github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)</b>,
        marcando apenas a permissão <b>gist</b>, e cole abaixo.</p>
        <div class="row-gap">
          <input type="password" id="sync-token" placeholder="Cole aqui a chave (token) do GitHub" style="flex:1">
          <button class="btn-primary" id="btn-sync-on">Ativar</button>
        </div>
        <p class="muted" style="font-size:11.5px;margin-top:6px">A chave fica guardada só neste navegador
        (não entra no backup). Repita este passo uma vez em cada aparelho, com a mesma chave.</p>`;
      box.querySelector("#btn-sync-on").addEventListener("click", async (e) => {
        const token = box.querySelector("#sync-token").value.trim();
        if (!token) { alert("Cole a chave do GitHub primeiro."); return; }
        e.target.disabled = true; e.target.textContent = "Conectando...";
        try {
          const r = await Sync.ativar(token);
          alert(`Conectado como ${r.usuario}! ` +
            (r.acao === "baixado" ? "Dados existentes foram baixados do cofre." : "Seus dados foram enviados para o cofre."));
          App.render();
        } catch (err) {
          Sync.desativar();
          alert("Não deu certo: " + err.message);
          App.render();
        }
      });
    }
  }

  return { render };
})();
