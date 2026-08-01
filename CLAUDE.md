# Gestão Pessoal

App web de controles pessoais (HTML + CSS + JavaScript puro, sem framework nem build).
Interface em português (pt-BR). Roda 100% no navegador.

**Guarda-chuva de controles**: o app se chama **Gestão Pessoal** e agrupa vários controles selecionáveis
por um botão **"Controles"** ao lado do nome (na `.brand`). Hoje há dois: **💰 Financeiro** (o original,
completo) e **⛽ Combustível** (consumo do carro). Cada controle tem seu próprio conjunto de abas; trocar
de controle troca o menu inteiro e renderiza a primeira aba dele. A escolha fica salva em `localStorage`
(`gestao-controle-ativo`) e reabre no último controle usado. **Configurações** aparece em todos os
controles (cuida da sincronização/backup do app inteiro).

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
- `js/quotes.js` — `Quotes`: cotações de ações/FIIs **e dividendos**. **Fonte principal: brapi.dev**
  (`viaBrapiFull(tickers, token)` — **um ticker por chamada, em paralelo** (`viaBrapiOne`), porque o
  multi-ticker por vírgula é do plano PAGO e faz a chamada inteira falhar no grátis; `dividends=true` traz
  cotação em `results[0].regularMarketPrice`/`regularMarketPreviousClose`/`longName` e dividendos em
  `results[0].dividendsData.cashDividends[]` → `{value: rate, payDate: paymentDate}`). Cada cotação/dividendo
  carrega um `source` (`brapi`/`hg`/`mfinance`/`yahoo`) exibido na tela Investimentos (`fontesLabel` → "via
  brapi", e a fonte por ativo no card de dividendos). ⚠️ **Não há fonte grátis de dividendo de FII no
  navegador**: o plano GRÁTIS do brapi não traz proventos (é dos planos pagos) e Yahoo/StatusInvest são
  bloqueados por CORS client-side. Por isso os dividendos são **lançados à mão** pelo usuário
  (`state.investments.dividendsManual = { ticker: [{id, value(por cota), payDate}] }`,
  `Store.addDividendoManual`/`removeDividendoManual`/`dividendosManuais`) — **têm prioridade** sobre a busca
  automática em `dividendosResumo` (source `manual`, rótulo "você") e **não são sobrescritos** ao atualizar
  cotações. As fontes automáticas (`viaYahooDividends`/mfinance como tentativa, brapi p/ ações) ficam só como
  preenchimento aproximado. `dividendosResumo` só conta como recebido o que tem `payDate <= hoje` (ignora
  provento anunciado com data futura). Botão **＋ Lançar** no card abre `ViewInvestimentos.abrirLancarDividendo`
  (escolhe ativo, data, valor por cota ↔ total pela qtd, e lista/remove os lançamentos do ativo). O **token do brapi**
  NÃO é travado por domínio (credencial pessoal), então **NÃO fica no código**: vive em
  `state.settings.brapiToken` (setado em Configurações, sincroniza privado pelo Gist) e é lido por
  `Store.brapiToken()`. `fetchAll(tickers, token)` devolve `{ ok, falhas, dividends }`: tenta brapi (cota +
  dividendos), depois **HG Brasil** em lote (`viaHGMany`, chave exposta `HG_KEY` browser+domain-locked em
  `bobnelsoon.github.io` — essa pode ficar no código) para o que faltar de cotação, e por fim reservas
  individuais (mfinance → Yahoo). **Reserva de dividendos: mfinance** (`fetchDividend`/`fetchDividendsAll`
  via `/{fiis|stocks}/dividends/{ticker}` — histórico `list:[{value,payDate}]`, últimos ~48), usada só para
  os ativos que o brapi não trouxe (ex.: sem token). `ViewInvestimentos.atualizarCotacoes` salva `saveQuotes`
  + `saveDividends` da mesma chamada do brapi.
- `js/sync.js` — `Sync`: sincronização entre aparelhos via Gist privado do GitHub. **Abrir o app NÃO conta
  como alteração**: `Store.load`/migração salvam com `loadingState=true`, então `Store.save` **não** chama
  `Sync.onLocalSave` (não bumpa `cfg.lastChange`). Sem isso, o aparelho recém-aberto se marcava como "o mais
  novo" e sobrescrevia o cofre com dados velhos; agora ele puxa a versão mais recente (`savedAt > lastChange`).
- `js/ui.js` — `UI`: modal genérico, confirmação, selects.
- `js/views/*.js` — uma view por aba (`ViewDashboard`, `ViewFluxo`, `ViewLancamentos`, `ViewCartoes`,
  `ViewEmprestimos`, `ViewInvestimentos`, `ViewOrcamento`, `ViewCombustivel`, `ViewAbastecimentos`,
  `ViewVeiculo`, `ViewConfig`), cada uma com `render(root)`. `combustivel.js` exporta **três** views
  (`ViewCombustivel` = Resumo, `ViewAbastecimentos` = lista, `ViewVeiculo` = perfil/revisão/manutenção) +
  o form compartilhado `ViewCombustivel.abrirForm(entry)` e `ViewCombustivel.abrirImportar()`.
- `js/views/inicio.js` — a **tela inicial (lançador)** `ViewInicio` (botões Financeiro / Combustível /
  Adicionar / Atualizar), o menu **`Adicionar.abrirMenu()`** (Compra no cartão / Compra parcelada /
  Abastecimento / Recebido / Pago) e **`Marcar.abrir(kind)`** (marca um item FIXO do fluxo como
  RECEBIDO/receita ou PAGO/despesa via `Store.setCell`, atualizando saldo/fluxo/dashboard).
- `js/app.js` — `App`: roteador por hash com **múltiplos controles**. `App.controles` mapeia cada controle
  (`inicio`, `financeiro`, `combustivel`) → `{ nome, icone, inicio, rotas }`. O controle `inicio` é a tela
  lançadora (sem abas — a nav fica vazia). `boot()` monta o seletor de controles + o botão **➕ Adicionar**
  na `.brand`, e **abre sempre na tela inicial** (`#inicio`). `App.trocarControle(id)` troca o controle
  inteiro. Rotas por hash (`#inicio`, `#dashboard`, `#combustivel`, ...) resolvidas no controle ativo.

Padrão: cada mutação chama `Store.save()`; a UI re-renderiza com `App.render()`.

## Dados e privacidade

- **O repositório NÃO contém dados pessoais.** A versão publicada define `window.SEED_VAZIO = true`
  e começa vazia. Os dados do usuário vivem apenas em: (1) `localStorage` do navegador e
  (2) um **Gist privado** do GitHub (sincronização, protegido por token pessoal — nunca acessível pelo agente).
- Backup: `Configurações → Exportar/Importar` (JSON). Para validar cálculos com dados reais,
  peça ao usuário o backup exportado e carregue via `Store.importJSON` — não há outro acesso aos dados.
- **Migração**: `Store.migrate` versiona o estado (`state.version`, atual = 6) e só **acrescenta**
  campos, preservando os dados existentes.

## Convenções de cálculo (decisões importantes — não quebrar)

- **Fatura do cartão = identificada pelo mês em que é PAGA.** Gasto do mês atual entra na fatura do
  **mês seguinte** (`ymAdd(ymHoje, 1)`). **Com dia de fechamento** (`account.closingDay`, opcional):
  `Store.faturaDaCompra(accountId, dataISO)` decide a fatura — compra **até** o fechamento → mês+1;
  **depois** do fechamento → mês+2 (já entrou na fatura seguinte). Os forms de compra (Cartões,
  Lançamentos, abastecimento no cartão) pré-preenchem "Fatura de" com isso e recalculam ao trocar
  cartão/data (respeitando edição manual). Por isso:
  - nova compra (Lançamentos/Cartões) já vem com a fatura do próximo mês;
  - a aba Cartões abre na **fatura vigente** (mês seguinte);
  - o dashboard mostra "fatura de <mês seguinte> (gastos de <mês atual>)". O **quadro de cartões do dashboard**
    (`ViewDashboard`) **avança na DATA DE FECHAMENTO**: `ymCartoes` pula os meses cujo ciclo já fechou
    (`cicloFechou(ym)` = gasto em mês passado, ou gasto no mês atual com `hoje >= minFech`, onde `minFech` é o
    **menor** `closingDay` dos cartões — assim que o 1º cartão fecha, o quadro já vira; o usuário trabalha um
    mês à frente) — ou se a fatura do mês já está toda paga. Faturas que **fecharam mas ainda têm saldo** aparecem como linhas
    "fatura de <mês> a pagar" (`vencidas`) e continuam somando no rodapé **"Em aberto (a pagar)"**; cartão com
    fatura quitada mostra "✓ pago <valor>". Quando não há nada a pagar, o rodapé diz "Tudo pago ✓".
  - **Cheque especial**: quando `saldoContaAtual < 0`, o card "Saldo em conta" mostra em vermelho
    "⚠️ Cheque especial em uso: <valor>" (só aviso — o negativo já está embutido no saldo/projeção; não vira
    lançamento pra não contar em dobro).
  - `cardTx[].ym` guarda o mês de pagamento da fatura.
  - **Mês de trabalho global** (`App.mesRef()`): o usuário trabalha **um mês à frente**, então o **Dashboard
    inteiro** (Receitas/Despesas/Resultado/Acumulado/Cartões) olha **um único mês** — o `App.mesRef()`, padrão
    = `Store.faturaVigenteYm()` (mês seguinte avançando na **data de fechamento** via `minFech`, ou se a fatura
    já está paga). O Dashboard tem um seletor **‹ Mês ›** que navega (só na sessão, `navYm`; **↺** volta ao
    automático). **Lançamentos** abre nesse mês (`mesSel` inicia em `App.mesRef()`) e o **Fluxo Anual** destaca
    a coluna dele. Os **Próximos vencimentos** continuam ancorados na **data REAL** de hoje (não no mês de
    trabalho). Substituiu o esquema antigo (topo no mês atual + Resultado/Cartões no mês+1) e o auto-advance
    local dos cartões — agora tudo deriva de `mesRef`.
  - **Pagamento da fatura por cartão** (`state.faturasPagas["<accountId>|<ym>"] = { at, value }`, init
    idempotente): `Store.pagarFatura(accountId, ym)` grava o total pago; `desfazerFatura` remove.
    `faturaRestante(ym, accountId)` = `faturaTotal − pago` (compras novas numa fatura já paga voltam a
    contar). O `autoCartaoValue` usa o **restante** (só o que falta pagar entra no "a pagar" do fluxo/dash),
    e `saldoContaAtual` **subtrai** as faturas pagas depois da âncora (o dinheiro saiu). Botão "✓ Pagar
    fatura"/"Desfazer" por cartão na aba Cartões. Simétrico a marcar um item do fluxo como Pago.

- **Saldo em conta é automático e determinístico** (`Store.saldoContaAtual`): parte do valor informado
  (`settings.conta = { at, valor }`) e soma o que foi realizado **depois** da âncora `at`:
  células do fluxo marcadas Pago/Recebido (com `settledAt`/`settledValue`), lançamentos pix/débito
  (com `createdAt`) **e parcelas de empréstimo marcadas PAGO** (com `settledAt`, valor `p.value`). É
  recalculado a cada render (seguro para a sincronização). Reinformar o saldo recalibra a âncora
  (`at = agora`). Compras no cartão NÃO mexem no saldo até a **fatura ser marcada como paga**
  (`Store.pagarFatura` → `faturasPagas`, subtraído no saldo). **Empréstimo simétrico ao
  fluxo:** marcar uma parcela como PAGO grava `settledAt` e joga `p.value` no saldo — assim o valor sai
  do "a receber" e entra no saldo automaticamente, sem lançamento manual.

- **Resultado do mês — FONTE ÚNICA `Store.monthTotal(ym)`** (usada pelo Dashboard **e** pelo Fluxo
  Anual, para as duas telas baterem): Σ `projectedValue` dos itens do fluxo (itens Pago/Recebido contam
  **0**, então mês todo quitado → Resultado 0). ⚠️ **`projectedValue` checa o STATUS ANTES do valor**:
  célula marcada Pago/Recebido conta **0 mesmo que tenha valor digitado no mês** (o valor já foi para o
  saldo via `settledValue`). Era um bug (checava o valor primeiro): item com valor próprio marcado continuava
  somando no Resultado e "inflava" o Dashboard. **Dashboard** (topo): três quadros — **Saldo em conta**,
  **A receber / A pagar** do mês de trabalho (Σ `projectedValue` pendente: >0 a receber + `loansAReceberMes`;
  <0 a pagar, inclui a fatura via item `autoCartao`) e **No fim de <mês> (previsto)** = `saldoContaAtual + a
  receber − a pagar`. Marcar Pago/Recebido tira do "a receber/a pagar" e mexe no saldo → o "No fim" fica
  estável. Os antigos cards Receitas/Despesas/Resultado/Acumulado/Saldo-projetado do topo foram **removidos**
  (`plannedValue` segue no store, sem uso no dashboard). ⚠️ A função antiga `Store.resultadoMes` foi
  **removida**; não recriar.

- **Acumulado (Dashboard) = saldo previsto na conta no FIM do PRÓXIMO mês**, não `saldo + resultado`.
  É `saldoProjecaoSerie().find(p => p.ym === ymFatura).saldo`: parte do `saldoContaAtual` e soma **só o
  que ainda falta** (itens já Pagos/Recebidos contam 0, pois já estão embutidos no saldo) **+ os
  empréstimos ABERTOS a receber no mês** (`loansAReceberMes` — não estão nos flowItems; as parcelas já
  PAGAS já entram no saldo). Assim o Acumulado = `saldo (± cheque especial) + a receber (fixos + empréstimos)
  − a pagar`, exatamente o "quanto vou ter no fim do mês". **Decisão importante:** `saldo + resultado`
  contava em dobro os itens já quitados. "Resultado" (a receber − a pagar do mês, **sem** o saldo e **sem**
  empréstimos) e "Acumulado" medem coisas diferentes e **não** se somam. No Dashboard o card do fim do mês
  chama-se **"No fim de <mês> (previsto)"** com subtítulo "saldo + a receber − a pagar".

- **Compras parceladas no cartão**: cada parcela é um `cardTx` separado (um por mês, `desc` com sufixo
  ` NN/MM`). Parcelas novas compartilham um `groupId`. Excluir uma parcela oferece **"Excluir todas as
  N parcelas"** (remove de todos os meses) ou "Só esta"; `Store.cardTxParcelas(tx)` acha as irmãs por
  `groupId` ou, no fallback (compras antigas sem groupId), pela descrição base + mesmo cartão.

- **Projeção do saldo** (`Store.saldoProjecaoSerie`): começa no `saldoContaAtual` e projeta do mês atual
  até dezembro somando `monthTotal` (usa `projectedValue`: itens Pago/Recebido contam 0) **+
  `loansAReceberMes`** (empréstimos ABERTOS a receber no mês). ⚠️ O gráfico do Dashboard **NÃO** é mais a
  projeção de saldo: virou **"Receita × Despesa — <ano>"** (2 linhas mês a mês, `Charts.receitaDespesaChart`
  + `Store.receitaDespesaSerie(ano)` com valores CHEIOS via `plannedValue` + fatura cheia; rodapé mostra o
  **total do ano** de receita e despesa). `saldoProjecaoSerie` segue no store (sem uso no dashboard agora).
  ⚠️ A linha do **Fluxo Anual chama-se "Saldo na conta (fim do mês)" e NÃO acumula** (decisão do usuário —
  a soma empilhada dava um número irreal lá na frente): cada mês = `saldoContaAtual + monthTotal(mês) +
  loansAReceberMes(mês)` (saldo de hoje + o resultado só daquele mês), calculado direto no `fluxo.js`
  (não usa mais `saldoAcumuladoSerie`); meses antes do atual ou sem saldo informado ficam em branco.
  `Store.saldoAcumuladoSerie`/`saldoSerie` seguem no store (sem uso no fluxo agora).

- **Investimentos**: cada ativo tem `avgPrice` (preço médio pago); recompra recalcula média ponderada.
  Ganho/perda por ativo e a rentabilidade da carteira (`Store.carteiraRentabilidade`, em R$ e %,
  verde/vermelho) usam `avgPrice` vs cotação atual; ficam "—" enquanto o preço pago não é informado.
  A aba tem **📥 Importar** (`ViewInvestimentos.abrirImportar`): cola JSON — lista de ativos
  `[{ticker, type, qty, avgPrice}]` ou objeto `{assets, fixed}` (renda fixa junto). Atualiza pelo ticker
  (sobrescreve qtd/preço médio) ou adiciona; `type` explícito ou heurística (`/11$/` → fii). Coluna
  **"Preço médio"** (era "Preço pago"). Botão **"＋ aporte"** por ativo (`ViewInvestimentos.abrirAporte`):
  registra uma nova compra (qtd + preço desta compra) e recalcula a **média ponderada**, com prévia ao vivo
  do novo preço médio. O KPI **"Ações e FIIs"** (redundante com Patrimônio) virou **"📈 Rentabilidade"**
  (R$ + %, `Store.carteiraRentabilidade`). Card **"💰 Dividendos recebidos"**: `state.investments.dividends`
  (`{ticker:{list:[{value,payDate}]}}`, histórico) buscado junto com as cotações; `Store.dividendosResumo(desde)`
  **soma todos os dividendos por cota pagos a partir de `desde`** (× cotas) + yield. `desde` = `Store.divSince()`
  (`state.investments.divSince`, ajustável por um seletor de mês no card; padrão = início do ano). **Só
  informativo** (não entra no fluxo). Se não houver pagamento no período, mostra o último disponível na fonte.
  O card **💰 Dividendos recebidos** lista **TODOS os ativos da carteira** (não só os que pagaram no período):
`Store.dividendosResumo` devolve uma linha por ativo com o total pago desde `divSince` e, para quem não
pagou no período, o **último pagamento disponível** (`ultimoPay`/`ultimoValor`) + `source`; a UI destaca os
que pagaram (verde) e mostra os demais esmaecidos com "último: <data>" ou "sem dados". O brapi é consultado
**escalonado (3 por vez) com 1 nova tentativa** (`mapLimit` em `quotes.js`), para não estourar o limite do
plano grátis (429) e trazer dado atual para todos.
No Dashboard, a seção de investimentos (rodapé, `grid-2`) tem o quadro **Carteira de investimentos**
  (patrimônio, rentabilidade, aportes do ano, nº de ativos) e **Composição da carteira** (Ações / FIIs /
  Renda fixa em R$ e %, barras proporcionais ao total). O antigo gráfico "Despesas por categoria" e o KPI
  "Patrimônio investido" do topo foram removidos (`Store.despesasPorCategoria`/`catName` seguem no store,
  sem uso no dashboard).

- **Combustível (controle ⛽)**: dados em `state.fuel.entries` (entram na sincronização/backup, migração v6).
  Cada registro: `{ id, date, odometer (km), liters, pricePerLiter, total, fuelType (gasolina|alcool|diesel|gnv),
  local, toll (pedágio), obs, full (tanque cheio) }`. Registros **só de pedágio** (viagem sem abastecer) têm
  `liters` null e guardam só o `toll`. Se o form recebe só um de `pricePerLiter`/`total`, o outro é derivado.
  **Consumo (km/l) = tanque cheio → tanque cheio** (`Store.fuelEntriesComputed`): acumula os litros desde o
  último tanque cheio (somando parciais) e no próximo cheio faz `kmL = (odo − odoÚltimoCheio) / litrosDoIntervalo`;
  não calcula em intervalos que **misturam combustíveis** (ex.: transição gasolina→álcool) nem em parciais.
  `custoKm = pagoNoIntervalo / dist`. **Pedágio é separado** (informativo): NÃO entra no gasto de combustível
  nos KPIs; `fuelStats` devolve `tollMes`/`tollTotal` à parte. `Store.fuelStats(ym)` dá consumo médio/último
  (blended entre combustíveis), custo/km, gasto do mês (só combustível), preço médio do litro, km do mês, pedágio.
  Aba **Resumo** (`ViewCombustivel`) = KPIs + últimos abastecimentos; aba **Abastecimentos** (`ViewAbastecimentos`)
  = lista completa (com local/obs/pedágio) + **📥 Importar** (`ViewCombustivel.abrirImportar`): aceita uma
  **lista** de abastecimentos (`date, km, fuel, local, liters, price, paid, toll, obs`) **ou** um **objeto
  completo** `{ vehicle, maintenance, entries }` (carrega perfil do veículo + manutenção + abastecimentos de
  uma vez; nomes de campo flexíveis). `Store.addFuelMany`/`clearFuel`/`setFuelVehicle`/`addMaintenance`/`clearMaintenance`. Import marca como
  **parcial** o que a obs indica (parcial/mínimo/reforço) **ou** dois abastecimentos no mesmo hodômetro (não
  fecham tanque). **Nunca versionar dados reais do usuário** — a importação roda só no navegador dele
  (nem placeholders de exemplo no código podem conter dados reais do usuário).
  - **Aba Veículo** (`ViewVeiculo`): `state.fuel.vehicle` = `{ modelo, tanque, pneu, revisaoKm, consumoAlcool,
    consumoGasolina }` (init idempotente no `migrate`, sem bump de versão) e `state.fuel.maintenance` =
    `[{ id, desc, value, done }]`. **Km atual** = `Store.fuelKmAtual()` (maior hodômetro). **Contador de
    revisão**: `revisaoKm − kmAtual` + previsão de data por `Store.fuelPaceKmDia()` (km/dia entre 1º e último
    registro). **Manutenção**: total previsto e "ainda a pagar" (itens não `done`).
  - **Comparador álcool/gasolina** (card no Resumo): usa `Store.fuelConsumoPorFuel()` (consumo real por
    combustível, dos intervalos válidos) — ou o consumo do perfil, senão fallback 11 / 17,4. Custo/km =
    preço ÷ consumo; **ponto de virada** = `precoGasolina × (consumoAlcool / consumoGasolina)`. Pré-preenche
    com `Store.fuelUltimoPreco(fuel)`.
  - **Dashboard (1ª aba)**: além dos KPIs, tem o card **Previsão para <próximo mês>** (`Store.fuelPrevisaoProxMes`:
    combustível = ritmo km/dia ÷ consumo médio × preço recente do litro; pedágio = média dos meses fechados,
    descartando o 1º se for parcial) e o gráfico **Gasto por mês** (`Store.fuelGastoPorMes` via `Charts.barsH`,
    com a barra da previsão).
  - **Pagamento no cartão** (integração com o Financeiro): o form de abastecimento tem **Forma de pagamento**
    (— não lançar — / 💳 Cartão). No cartão, cria um `cardTx` (fatura = mês do abastecimento **+ 1**) e vincula
    por `entry.linkCardTxId` (+ `payment: "cartao"`, `cardId`). **Editar** o abastecimento remove o `cardTx`
    antigo e recria; **excluir** remove o `cardTx`. A **importação NÃO cria** lançamentos (é histórico) e o
    **pedágio fica de fora** da integração. Só cartão por enquanto (pix/dinheiro não foram pedidos).

## Convenções de UI

- **Abre sempre na tela inicial (lançador)**: `App.boot` força `controleAtivo = "inicio"` e `#inicio`
  (decisão do usuário). De lá o usuário entra num controle (`trocarControle` → 1ª aba dele) ou usa Adicionar.
- **Seletor de controles + Adicionar** (`.brand`): botão "Controles ▾" abre `.ctrl-menu` (🏠 Início /
  💰 Financeiro / ⛽ Combustível; o ativo recebe `.ativo`) e o botão **➕ Adicionar** (`Adicionar.abrirMenu`)
  fica logo abaixo, disponível em qualquer tela. Fecha ao clicar fora. **No mobile**: a `.brand` vira linha,
  a marca vira **só o ícone 💼** (`.brand-txt` escondido) e o **Adicionar do topo some** (`.brand .add-btn`
  display:none) — sobra espaço para as abas rolarem. O Adicionar no mobile fica pelo **FAB flutuante** `➕`
  (`.fab-add`, criado uma vez no `boot`, canto inferior direito, só no mobile via media query, escondido na
  tela inicial) que abre o mesmo menu. No desktop, o botão Adicionar continua na sidebar (sem FAB).
- **Integração pelo Adicionar**: um lançamento atualiza os dois controles — Compra → `ViewCartoes.abrirNovaCompra`
  (cartão + parcelas); Abastecimento → `ViewCombustivel.abrirForm` (pode cair no cartão); Recebido/Pago →
  `Marcar.abrir` marca item fixo do fluxo (setCell com status), mexendo no saldo/fluxo/dashboard.
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

**PUBLICADO** (linha `v19`, cache atual `202607194700`): tudo no ar pela `main`/GitHub Pages. O app é o
**Gestão Pessoal** (guarda-chuva de controles: 💰 Financeiro + ⛽ Combustível) com tela inicial lançadora.
Publicação por PR → merge (PRs #14–#45 mesclados nesta iteração). Próximas melhorias na mesma branch
`claude/project-updates-2r7rf9` (reiniciada a partir da `main` após cada merge) → novo PR → merge.
O usuário já importou os dados reais dele no app (combustível + investimentos) e validou online.

**Mês de trabalho global** (PUBLICADO, cache `202607194200`, PR #39): o usuário trabalha **um mês à frente**.
O Dashboard inteiro olha um único mês = `App.mesRef()` (padrão `Store.faturaVigenteYm`), com seletor **‹ Mês ›**
(↺ volta ao automático). Lançamentos abre nesse mês; Fluxo destaca a coluna dele; vencimentos seguem a data
real. Ver a seção "Mês de trabalho global" nas convenções.

**Dashboard reformulado + correção de cálculo** (PUBLICADO, cache `202607194700`, PRs #42–#45):
- Topo do Dashboard **enxuto**: **Saldo em conta**, **A receber / A pagar** do mês (pendentes: receita fixa +
  empréstimo / despesa fixa + fatura) e **No fim de <mês> (previsto)** = `saldo + a receber − a pagar`.
  Marcar Pago/Recebido tira do quadro e mexe no saldo → o "No fim" fica estável (sem contar em dobro).
- **BUG corrigido** (PR #44): `projectedValue` checava o VALOR antes do STATUS — item com valor próprio no mês
  marcado Pago/Recebido continuava somando no Resultado (Fluxo) e inflava o Dashboard. Agora **status vem
  antes do valor** → marcado conta 0 mesmo com valor digitado. Ver a convenção "Resultado do mês".
- **Fluxo Anual**: a linha virou **"Saldo na conta (fim do mês)"** e **não acumula** — cada mês = `saldo hoje +
  resultado só daquele mês`. Ver convenção "Projeção do saldo".

**Ideias combinadas com o usuário para as próximas (ainda NÃO feitas):**
- **Pagar várias contas de uma vez** (variação da #3): ele NÃO paga tudo no mesmo dia, mas costuma pagar
  ~4 contas juntas — então o ideal é **marcar um conjunto selecionado** de faturas/fixos como pago de uma vez
  (não um "pagar tudo" cego).
- **#4 Janela de pagamento (28→10)**: seção juntando o que vence entre o dia 28 e o 10 do mês seguinte.
- **#5 Ponto mais baixo do saldo**: mostrar o saldo mínimo previsto ("chega a -R$ X no dia Y") por causa do
  cheque especial. O usuário curtiu a ideia; fica pra frente.
- Objetivo do usuário: deixar o app **100% até chegar agosto**, ajustando aos poucos.

**Dividendos manuais + dashboard de cartões** (PUBLICADO, cache `202607194000`, PRs #29–#36):
- **Dividendos**: não há fonte grátis de dividendo de FII no navegador (brapi grátis não traz; Yahoo/StatusInvest
  bloqueados por CORS; mfinance defasada). Solução: **lançamento manual** (`dividendsManual`, botão ＋ Lançar) —
  ver a seção `js/quotes.js`/Investimentos. O card de dividendos ficou **enxuto**: só **ativo · nº de cotas ·
  soma recebida** (a pedido do usuário; sem datas/fonte/por-cota nas linhas). Seletor "desde" com `max` = mês
  atual (não deixa escolher mês futuro) + aviso quando futuro.
- **Dashboard de cartões**: avança na **DATA DE FECHAMENTO** (`cicloFechou`), mostra "✓ pago" por cartão,
  faturas fechadas não pagas viram linhas "fatura de <mês> a pagar" somando no rodapé "Em aberto (a pagar)".
- **Cheque especial**: aviso em vermelho no card Saldo quando `saldoContaAtual < 0` (só informativo).

**Cotações + dividendos pela brapi.dev** (PUBLICADO, cache `202607193300`, PRs #27 e #28):
- `viaBrapiFull` busca **um ticker por chamada, em paralelo** (`viaBrapiOne`) — o multi-ticker por vírgula é
  do plano PAGO do brapi e faz a chamada inteira falhar no grátis (era o bug: caía na HG p/ cotação e mfinance
  p/ dividendos, que trava em fev/2026). `dividends=true` traz cotação + `dividendsData.cashDividends` numa só
  chamada por ativo. Cada cotação/dividendo carrega `source` (`brapi`/`hg`/`mfinance`/`yahoo`), exibido na tela
  Investimentos (`fontesLabel` → "cotações: … · via brapi" e "💰 Dividendos recebidos (via brapi)").
- O **token do brapi** fica em **Configurações → 📈 Cotações e dividendos (brapi)** (`state.settings.brapiToken`,
  via `Store.setBrapiToken`/`brapiToken`), sincroniza privado pelo Gist — **NÃO** vai hardcoded no repo (não é
  domain-locked como a chave HG). Fallbacks: HG/mfinance/Yahoo p/ cotação, mfinance p/ dividendos que faltarem.
  ⚠️ O usuário colou o token em Configurações (sincroniza para todos os aparelhos).
- ⚠️ **Não testável ao vivo pelo agente** (a rede do ambiente bloqueia brapi.dev/APIs de finanças — `HTTP 000`);
  validação só em headless com respostas simuladas. Se voltar a aparecer "via HG"/"via mfinance" ou algum ativo
  sem dividendo, investigar limite de requisições do plano grátis do brapi ou ticker específico.

Adicionado depois da v19 inicial (tudo publicado e validado em headless; **nada de dado real versionado**):
- **Combustível — Dashboard** (previsão do próximo mês + gráfico de gasto/mês + comparador), **pagamento no
  cartão** no abastecimento, **soma automática** do total (preço×litros) e **importar completo**
  `{vehicle, maintenance, entries}`.
- **Investimentos — 📥 Importar** (`ViewInvestimentos.abrirImportar`): cola JSON de ativos/renda fixa.
- **Cartões — pagar fatura por cartão** (`faturasPagas`, `Store.pagarFatura`): sai do "a pagar" e do saldo;
  **dia de fechamento** por cartão (`account.closingDay` + `Store.faturaDaCompra`) escolhe a fatura da compra.
- **UI mobile**: marca vira só o ícone 💼, Adicionar sai do topo (vira **FAB** flutuante), botões compactos —
  mais espaço para as abas.
- **Sync corrigido**: abrir o app **não** conta como alteração (`loadingState` no `Store.save`), então o
  aparelho recém-aberto **puxa** a versão mais nova do cofre em vez de sobrescrever com dados velhos.

No ar (v19), validado em headless com os dados reais do usuário (**nada de dado real foi versionado**):
- **Tela inicial (lançador)** `ViewInicio`: o app **abre sempre nela** com 4 botões — Financeiro, Combustível,
  ➕ Adicionar, 🔄 Atualizar. O botão **➕ Adicionar** também fica na `.brand` (sempre acessível) e abre o menu
  Compra / Compra parcelada / Abastecimento / Recebido / Pago, integrando os dois controles (ver convenções).
- **Gestão Pessoal** + **seletor de Controles** na `.brand` (botão "Controles ▾" → 🏠 Início / 💰 Financeiro /
  ⛽ Combustível). Troca o controle inteiro (nav + view), salva a escolha em `localStorage`. Configurações
  aparece nos dois controles.
- **Controle de Combustível** (`state.fuel`, migração v6): abas **Resumo** (KPIs de consumo/custo + comparador
  álcool×gasolina + últimos), **Abastecimentos** (lista completa + 📥 Importar JSON) e **Veículo** (perfil +
  contador de revisão + manutenção programada). Consumo **tanque cheio → tanque cheio**; **pedágio separado**
  (informativo). Ver a seção "Combustível (controle ⛽)" nas convenções de cálculo.
- O usuário tem um **histórico real de combustível** (veículo flex, rota fixa entre duas cidades, transição
  gasolina→álcool, dezenas de abastecimentos). Foi usado só para **validar localmente** (scratchpad da sessão,
  não versionado); consumo real bate com os cálculos (álcool compensa no uso dele). **Os dados reais NUNCA vão
  ao repositório** — vivem só no aparelho/Gist do usuário. Para revalidar, pedir o histórico de novo.

Ideias que ficaram na mesa para o Combustível (usuário vai escolher): custo por viagem (trecho + pedágio),
gráfico do preço do litro no tempo, KPI de consumo separado por combustível, alerta de revisão mais visível,
metas/orçamento de combustível por mês.

No ar (v18) e estável no controle Financeiro:
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
