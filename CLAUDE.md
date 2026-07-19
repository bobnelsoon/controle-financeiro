# Controle Financeiro

App web de finanças pessoais (HTML + CSS + JavaScript puro, sem framework nem build).
Interface em português (pt-BR). Roda 100% no navegador.

## Como executar

Site estático — basta servir a pasta e abrir `index.html`:

```
python3 -m http.server 8000   # depois abra http://localhost:8000
```

Não há passo de build, bundler, testes automatizados no repositório nem dependências npm.
Ao editar um `.js`/`.css`, incremente a querystring `?v=AAAAMMDDHHMM` em **todas** as tags
de `index.html` (cache-busting da versão publicada).

## Arquitetura

Scripts globais em IIFE, carregados em ordem no `index.html` (sem módulos ES):

- `js/utils.js` — `U`: formatação (BRL, datas), helpers de mês (`ym`, `ymAdd`, `ymParse`), DOM (`el`, `esc`).
- `js/store.js` — `Store`: estado + persistência (localStorage) + toda a lógica de cálculo e migração.
- `js/charts.js` — `Charts`: gráficos SVG à mão (linha de saldo, barras).
- `js/quotes.js` — `Quotes`: cotações de ações/FIIs (mfinance → brapi → Yahoo).
- `js/sync.js` — `Sync`: sincronização entre aparelhos via Gist privado do GitHub.
- `js/ui.js` — `UI`: modal genérico, confirmação, selects.
- `js/views/*.js` — uma view por aba (`ViewDashboard`, `ViewFluxo`, `ViewLancamentos`, `ViewCartoes`,
  `ViewEmprestimos`, `ViewInvestimentos`, `ViewOrcamento`, `ViewConfig`), cada uma com `render(root)`.
- `js/app.js` — `App`: roteador por hash (`#dashboard`, `#fluxo`, ...) e `boot()`.

Padrão: cada mutação chama `Store.save()`; a UI re-renderiza com `App.render()`.

## Dados e privacidade

- **O repositório NÃO contém dados pessoais.** A versão publicada define `window.SEED_VAZIO = true`
  e começa vazia. Os dados do usuário vivem apenas em: (1) `localStorage` do navegador e
  (2) um **Gist privado** do GitHub (sincronização, protegido por token pessoal — nunca acessível pelo agente).
- Backup: `Configurações → Exportar/Importar` (JSON). Para validar cálculos com dados reais,
  peça ao usuário o backup exportado e carregue via `Store.importJSON` — não há outro acesso aos dados.
- **Migração**: `Store.migrate` versiona o estado (`state.version`, atual = 5) e só **acrescenta**
  campos, preservando os dados existentes.

## Convenções de cálculo (decisões importantes — não quebrar)

- **Fatura do cartão = identificada pelo mês em que é PAGA.** Gasto do mês atual entra na fatura do
  **mês seguinte** (`ymAdd(ymHoje, 1)`). Por isso:
  - nova compra (Lançamentos/Cartões) já vem com a fatura do próximo mês;
  - a aba Cartões abre na **fatura vigente** (mês seguinte);
  - o dashboard mostra "fatura de <mês seguinte> (gastos de <mês atual>)".
  - `cardTx[].ym` guarda o mês de pagamento da fatura.

- **Saldo em conta é automático e determinístico** (`Store.saldoContaAtual`): parte do valor informado
  (`settings.conta = { at, valor }`) e soma o que foi realizado **depois** da âncora `at`:
  células do fluxo marcadas Pago/Recebido (com `settledAt`/`settledValue`), lançamentos pix/débito
  (com `createdAt`) **e parcelas de empréstimo marcadas PAGO** (com `settledAt`, valor `p.value`). É
  recalculado a cada render (seguro para a sincronização). Reinformar o saldo recalibra a âncora
  (`at = agora`). Compras no cartão NÃO mexem no saldo até a fatura ser paga. **Empréstimo simétrico ao
  fluxo:** marcar uma parcela como PAGO grava `settledAt` e joga `p.value` no saldo — assim o valor sai
  do "a receber" e entra no saldo automaticamente, sem lançamento manual.

- **Resultado do mês — FONTE ÚNICA `Store.monthTotal(ym)`** (usada pelo Dashboard **e** pelo Fluxo
  Anual, para as duas telas baterem): Σ `projectedValue` dos itens do fluxo (itens Pago/Recebido contam
  **0**, então mês todo quitado → Resultado 0). No **Dashboard**, os quadros **Resultado** e **Acumulado**
  olham para o **PRÓXIMO mês** (`ymFatura = ymAdd(ymHoje,1)`), porque o mês atual costuma já estar
  quitado (Resultado 0) e a compra do cartão do mês só vira fatura no mês seguinte — assim os números
  acompanham as Despesas/Cartão, que também mostram a fatura vigente. Os cards **Receitas/Despesas do
  mês** do topo continuam informativos do **mês atual** em valores cheios (`plannedValue` + avulsos +
  `faturaTotal(ymFatura)` como despesa). ⚠️ A função antiga `Store.resultadoMes` (valores cheios +
  fatura) foi **removida**; não recriar.

- **Acumulado (Dashboard) = saldo previsto na conta no FIM do PRÓXIMO mês**, não `saldo + resultado`.
  É `saldoProjecaoSerie().find(p => p.ym === ymFatura).saldo`: parte do `saldoContaAtual` e soma **só o
  que ainda falta** (itens já Pagos/Recebidos contam 0, pois já estão embutidos no saldo). **Decisão
  importante:** `saldo + resultado` contava em dobro os itens já quitados. Com o mês todo quitado, o
  Acumulado tende ao próprio saldo. "Resultado" e "Acumulado" medem coisas diferentes e **não** se
  somam ("como foi o mês" vs "quanto vou ter na conta").

- **Compras parceladas no cartão**: cada parcela é um `cardTx` separado (um por mês, `desc` com sufixo
  ` NN/MM`). Parcelas novas compartilham um `groupId`. Excluir uma parcela oferece **"Excluir todas as
  N parcelas"** (remove de todos os meses) ou "Só esta"; `Store.cardTxParcelas(tx)` acha as irmãs por
  `groupId` ou, no fallback (compras antigas sem groupId), pela descrição base + mesmo cartão.

- **Projeção do saldo** (`Store.saldoProjecaoSerie`): começa no `saldoContaAtual` e projeta do mês atual
  até dezembro somando `monthTotal` (usa `projectedValue`: itens Pago/Recebido contam 0). Alimenta o
  gráfico do dashboard, o "Saldo projetado (Dez)", o "Acumulado do mês" (`[0]`) e, via
  `Store.saldoAcumuladoSerie(ano)`, a linha **"Saldo acumulado" do Fluxo Anual** (mesma projeção; meses
  já realizados ficam em branco; sem saldo informado cai no `saldoSerie` antigo estilo planilha).
  O `Store.saldoSerie` (acumula desde janeiro) só é usado nesse fallback e em `saldoAcumuladoAte`.

- **Investimentos**: cada ativo tem `avgPrice` (preço médio pago); recompra recalcula média ponderada.
  Ganho/perda por ativo e a rentabilidade da carteira (`Store.carteiraRentabilidade`, em R$ e %,
  verde/vermelho) usam `avgPrice` vs cotação atual; ficam "—" enquanto o preço pago não é informado.
  No Dashboard, a seção de investimentos (rodapé, `grid-2`) tem o quadro **Carteira de investimentos**
  (patrimônio, rentabilidade, aportes do ano, nº de ativos) e **Composição da carteira** (Ações / FIIs /
  Renda fixa em R$ e %, barras proporcionais ao total). O antigo gráfico "Despesas por categoria" e o KPI
  "Patrimônio investido" do topo foram removidos (`Store.despesasPorCategoria`/`catName` seguem no store,
  sem uso no dashboard).

## Convenções de UI

- **Sempre abre no Dashboard**: `App.boot` força `#dashboard` via `history.replaceState`, ignorando a
  última aba salva no hash da URL ao reabrir.
- Tabelas largas rolam dentro do `.card` no mobile (media query ≤700px); tabela de investimentos usa `.tbl-wide`.
- Quadros/linhas com `data-goto` navegam para a aba (`.clickable[data-goto]` no dashboard).
- Estilo por tokens CSS em `:root` (tema claro/escuro via `prefers-color-scheme`).
- **Safe areas (iPhone com notch/Dynamic Island)**: `index.html` usa `viewport-fit=cover` + metas de web
  app (add-to-home-screen) e `theme-color` claro/escuro. Menu do topo (`.sidebar`), conteúdo (`.main`) e
  o `.overlay` do modal aplicam `env(safe-area-inset-*)` (com `max()`/`calc()` preservando o padding
  base) para não ficarem sob a ilha nem a barra de gesto. Validado a 440×956 (iPhone 17 Pro Max): sem
  overflow horizontal, cards em 2 colunas.

## Validação (recomendado antes de commitar mudanças de cálculo)

Não há suite de testes no repo. Para validar de verdade, sirva a pasta e dirija o app num navegador
headless (Chromium/Playwright): carregue um backup real ou dados de exemplo via `Store.importJSON`,
navegue pelas abas e leia os valores computados (`Store.saldoContaAtual`, `Store.faturaTotal`, etc.),
conferindo que não há erro de JS e que os números batem.

## Branch de trabalho

Desenvolvimento nesta iteração: `claude/project-updates-2r7rf9`.
Fluxo de publicação: commitar na branch → abrir PR para `main` → **merge** (o app é publicado
automaticamente pelo GitHub Pages a partir da `main`, sem workflow de build). URL pública:
`https://bobnelsoon.github.io/controle-financeiro/` (o agente não consegue abrir esse link — a rede
do ambiente bloqueia `github.io`; a publicação em si é automática do lado do GitHub).

## Onde paramos (para continuar amanhã)

Última versão **publicada na `main`**: `v18` / cache `202607201000`. **Nada pendente para publicar** —
a branch `claude/project-updates-2r7rf9` e a `main` estão em dia. O usuário está satisfeito e volta
quando quiser ajustar algo novo.

No ar (v18) e estável:
- **Empréstimo simétrico ao fluxo**: marcar parcela como PAGO grava `settledAt` e o valor cai no
  `saldoContaAtual` (sai do "a receber", entra no saldo — sem lançamento manual).
- **Cards Receitas/Despesas do mês** (topo, informativos do mês atual): separados **pelo sinal** do
  lançamento — positivo → Receitas, negativo → Despesas (não se misturam; positivo NÃO abate despesa).
  Ambos com subtítulo ("fixas + lançamentos" / "fixas + lançamentos + fatura do cartão").
- **Card Receitas tem 2 valores** (`.stat-duplo`): "Receitas do mês" (valor principal, informativo do
  mês atual) e **"Disponível em <mês seguinte>"** (valor secundário, fonte menor). **Disponível =
  Saldo em conta + tudo a receber no PRÓXIMO mês** (`ymFatura`): Σ `projectedValue > 0` dos flowItems +
  parcelas de empréstimo ABERTO que vencem no próximo mês. Olha o mês seguinte de propósito (usuário
  trabalha um mês à frente, igual à fatura/Resultado/Acumulado). Só conta o que ainda falta receber
  (recebidos e lançamentos já estão no saldo → não conta em dobro; estável ao receber). Só aparece se o
  saldo foi informado. Botão **"Compra no cartão"** no card **Saldo em conta** (largura total, ancorado
  na base via flex-column) abre `ViewCartoes.abrirNovaCompra` — lançar compra sem ir na aba Cartões.
- **Dashboard**: seção de investimentos no rodapé (**Carteira de investimentos** + **Composição da
  carteira**); saiu o gráfico "Despesas por categoria" e o KPI "Patrimônio investido" do topo.
- **iPhone / safe areas** (v12): `viewport-fit=cover`, metas de web app, `theme-color`,
  `env(safe-area-inset-*)` no menu/conteúdo/modal. Validado a 440×956 (iPhone 17 Pro Max).
- **Abre sempre no Dashboard** (`App.boot` força `#dashboard` via `history.replaceState`).
- **Excluir compra parcelada** com opção "Excluir todas as N parcelas" (`groupId` nas novas + fallback
  por descrição nas antigas: `Store.cardTxParcelas` / `removeCardTxIds`).
- Resultado/Acumulado do Dashboard olham o **próximo mês** (fonte única `Store.monthTotal` /
  `saldoProjecaoSerie`; Fluxo e Dashboard batem). Botão **Limpar** no editor de célula do Fluxo.
- Saldo em conta automático; fatura do cartão sempre um mês à frente; investimentos com preço pago,
  ganho/perda e rentabilidade.

Pontos de atenção conhecidos:
- **Próximos vencimentos** juntam `flowItems` (com `dueDay`) **e** parcelas de `loans` — sem vínculo
  entre eles; cadastrar a mesma coisa nos dois lugares duplica (é dado do usuário; o agente não acessa).
- **Cache do `index.html`**: o `index.html` não tem `?v=`, então o navegador/CDN pode servir um HTML em
  cache apontando pros assets antigos → parece que "não subiu". Solução do usuário: recarregar forte ou
  abrir com `?v=13` no fim da URL. Melhoria futura possível: fazer o HTML recarregar assets sozinho.

Testes headless ficam no **scratchpad da sessão** (não versionado): `build.mjs` gera `preview-demo.html`
com dados fake + `window.Store/App/U`; `test*.mjs` dirigem via Playwright servindo por
`python3 -m http.server 8199` (Chromium em `/opt/pw-browsers/...`). `build.mjs` já inclui `<meta charset>`
e `<meta viewport>` no preview. Nunca subir dados reais do usuário ao repo nem a artifacts públicos.
