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
  células do fluxo marcadas Pago/Recebido (com `settledAt`/`settledValue`) e lançamentos pix/débito
  (com `createdAt`). É recalculado a cada render (seguro para a sincronização). Reinformar o saldo
  recalibra a âncora (`at = agora`). Compras no cartão NÃO mexem no saldo até a fatura ser paga.

- **Resultado do mês — FONTE ÚNICA `Store.resultadoMes(ym)`** (usada pelo Dashboard **e** pelo Fluxo
  Anual, para as duas telas sempre baterem): receitas − despesas em **valores cheios** (ignora status
  Pago/Recebido, usa `plannedValue`). Inclui itens fixos do fluxo + lançamentos avulsos do mês +
  **gasto do cartão do mês** (fatura vigente = `faturaTotal(ymAdd(ym,1))`, porque a compra do mês vira
  fatura no mês seguinte). O item automático `autoCartao` ("Cartão (fatura)") é **ignorado** para não
  contar a fatura em dobro. O gráfico "Despesas por categoria" usa a mesma base. **Não alinhar o
  Resultado ao Acumulado por soma** — são métricas diferentes (ver abaixo).

- **Acumulado do mês (Dashboard) = saldo previsto na conta no FIM do mês**, não `saldo + resultado`.
  É `saldoProjecaoSerie()[0].saldo`: parte do `saldoContaAtual` e soma **só o que ainda falta** (itens
  já Pagos/Recebidos contam 0, pois já estão embutidos no saldo). **Decisão importante:** a fórmula
  antiga `saldo em conta + resultado do mês` contava em dobro os itens já quitados (o dinheiro deles já
  está no saldo). Com o mês todo quitado, o Acumulado passa a ser **igual ao próprio saldo em conta**
  (ex.: usuário com Julho todo pago → Acumulado = saldo = R$ 7.900). "Resultado do mês" e "Acumulado"
  medem coisas diferentes e **não** se somam ("como foi o mês" vs "quanto vou ter na conta").

- **Projeção do saldo** (`Store.saldoProjecaoSerie`): começa no `saldoContaAtual` e projeta do mês atual
  até dezembro somando `monthTotal` (usa `projectedValue`: itens Pago/Recebido contam 0). Alimenta o
  gráfico do dashboard, o "Saldo projetado (Dez)", o "Acumulado do mês" (`[0]`) e, via
  `Store.saldoAcumuladoSerie(ano)`, a linha **"Saldo acumulado" do Fluxo Anual** (mesma projeção; meses
  já realizados ficam em branco; sem saldo informado cai no `saldoSerie` antigo estilo planilha).
  O `Store.saldoSerie` (acumula desde janeiro) só é usado nesse fallback e em `saldoAcumuladoAte`.

- **Investimentos**: cada ativo tem `avgPrice` (preço médio pago); recompra recalcula média ponderada.
  Ganho/perda por ativo e a rentabilidade da carteira (`Store.carteiraRentabilidade`, em R$ e %,
  verde/vermelho) usam `avgPrice` vs cotação atual; ficam "—" enquanto o preço pago não é informado.

## Convenções de UI

- Tabelas largas rolam dentro do `.card` no mobile (media query ≤700px); tabela de investimentos usa `.tbl-wide`.
- Quadros/linhas com `data-goto` navegam para a aba (`.clickable[data-goto]` no dashboard).
- Estilo por tokens CSS em `:root` (tema claro/escuro via `prefers-color-scheme`).

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

Versão publicada atual: `v8` / cache `202607190100`. PRs #1 a #5 já mesclados na `main`.

Já feito e no ar:
- Dashboard: quadros clicáveis (`data-goto`), cartões em lista com total, próximos vencimentos por mês.
- Saldo em conta automático (Pago/Recebido + lançamentos pix/débito).
- Fatura do cartão sempre um mês à frente.
- Investimentos com preço pago, ganho/perda e rentabilidade da carteira.
- Quadros **Resultado do mês** e **Acumulado do mês** no dashboard; Fluxo e Dashboard usam a **fonte
  única** `Store.resultadoMes` / `Store.saldoAcumuladoSerie`, então os números batem entre as telas.
- Acumulado corrigido para não contar itens quitados em dobro (= saldo previsto no fim do mês).

Pontos de atenção conhecidos:
- **Próximos vencimentos** juntam `flowItems` (com `dueDay`) **e** parcelas de `loans` — não há vínculo
  entre eles. Se o usuário cadastrar a mesma coisa nos dois lugares, aparece duplicado (foi o caso do
  "Carro Taiara" × "Taiara — parcela 28", resolvido pelo usuário apagando o item de fluxo). É dado do
  usuário; o agente não acessa/edita (vive no localStorage/Gist).

- **PENDENTE — validar o Acumulado com os dados reais.** O usuário reportou que, mesmo abrindo o link
  atualizado, o Acumulado de Julho não veio 7.900 como ele esperava. Diagnóstico em aberto (aguardando
  print do Dashboard ou backup):
  1. **Publicação está OK.** GitHub Pages publica da `main` (sem workflow próprio; runs "pages build and
     deployment" com sucesso). O `index.html` **não tem `?v=`**, então o navegador/CDN pode servir um
     `index.html` em cache que aponta pros arquivos antigos → parece que "não subiu". Solução do lado do
     usuário: abrir com `?v=8` no fim da URL, recarregar forte, ou limpar dados do site (isso apaga o
     localStorage — restaurar via Configurações → Sincronização/Importar). **Ideia de melhoria futura:**
     fazer o `index.html` recarregar os assets sozinho / evitar esse cache do HTML.
  2. **Ou o cálculo:** `Acumulado = saldoProjecaoSerie()[0]` só é igual ao saldo se **todos** os itens
     de Julho estiverem Pago/Recebido (`monthTotal(Julho)=0`). Se sobrar item pendente em Julho no dado
     real, o Acumulado projeta esse pendente e legitimamente difere do saldo. Confirmar com o backup.
  - Como saber se a versão nova carregou: o subtítulo do quadro Acumulado deve ser
    "saldo previsto na conta no fim do mês" (versão antiga dizia "saldo em conta + resultado do mês").

Testes headless ficam em `scratchpad/` (build.mjs gera `preview-demo.html` com dados fake +
`window.Store`; test*.mjs dirigem via Playwright servindo por `python3 -m http.server`). Nunca subir
dados reais do usuário ao repo nem a artifacts públicos.
