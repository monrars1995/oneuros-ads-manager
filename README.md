# 📈 Neuro Ads Manager — Gestor de Tráfego Pago (v0.2.0)

[![version](https://img.shields.io/badge/vers%C3%A3o-v0.2.0-blue.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Meta Marketing API](https://img.shields.io/badge/Meta%20Marketing%20API-v27.0-1877F2.svg)](https://developers.facebook.com/docs/marketing-api)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-D97757.svg)](#usando-no-claude-code)
[![Neuro Harness](https://img.shields.io/badge/Neuro%20Harness-bundle-111111.svg)](#usando-no-neuro-harness)

> **Um gestor de tráfego pago para agentes de IA.** Ele audita a conta, planeja campanhas, gera relatórios, prepara criativos e copy dentro das regras do segmento e confere se a conversão está chegando à Meta, seguindo as boas práticas de mercado e padrões validados em projetos reais.
>
> - **Plataforma:** Meta Ads (Facebook, Instagram, WhatsApp/CTWA, Lead Ads), com CRM (GoHighLevel) no funil.
> - **Segmentos com compliance:** advocacia (OAB), educação (ECA/LGPD), saúde, crédito, estética e as políticas da Meta.
> - **Seguro por padrão:** só lê a conta. Mudanças viram um plano com hash e aprovação humana; tudo nasce PAUSED; nada de `.env`, IDs ou dados pessoais nos entregáveis.

**Sumário:**
- **Primeiros passos:** [Início rápido](#início-rápido) · [Instalação](#instalação) · [Ambiente](#ambiente-e-tokens)
- **Uso:** [Claude Code](#usando-no-claude-code) · [Neuro Harness](#usando-no-neuro-harness) · [Outros agentes](#usando-em-outros-agentes) · [Um ciclo completo](#um-ciclo-completo)
- **Recursos:** [CLI](#referência-rápida-do-cli) · [Perfis](#perfis-de-cliente) · [Compliance](#compliance-por-segmento) · [Mensuração](#mensuração-e-conversão) · [Mudanças na conta](#mudanças-na-conta)
- **Manutenção:** [Atualização](#atualização) · [Desinstalação](#desinstalação) · [Problemas](#solução-de-problemas) · [Estrutura](#estrutura-do-repositório) · [Releases](#desenvolvimento-e-releases) · [Privacidade](#-privacidade) · [Autor](#autor-e-licença)

Todos os comandos e opções estão em **[docs/COMANDOS.md](docs/COMANDOS.md)**.

---

## Início rápido

**1. Instale no Claude Code:**

```bash
claude plugin marketplace add monrars1995/oneuros-ads-manager#v0.2.0
```

```bash
claude plugin install neuro-ads-manager@neuro-ads-manager --scope user
```

**2. Exporte o token da Meta no seu terminal** (token de usuário do sistema com `ads_read`; o plugin nunca lê `.env`):

```bash
export META_ACCESS_TOKEN=... META_AD_ACCOUNT_ID=act_...
```

**3. Abra uma sessão nova** e rode:

```text
/neuro-ads-manager:perfil novo
/neuro-ads-manager:auditar acme 30d
/neuro-ads-manager:relatorio acme 7d
```

- **`perfil`** cria o perfil do cliente (aqui, um cliente fictício `acme`) a partir do `modelo`, com perguntas no chat. O perfil fica só na sua máquina.
- **`auditar`** tira o retrato da conta pela API, levanta os achados e devolve a auditoria priorizada. Não muda nada.
- **`relatorio`** gera o relatório do período com comparação e espaço para a leitura.

---

## Instalação

### Requisitos

| Ferramenta | Versão | Para |
|---|---|---|
| Node.js | 20+ | O CLI e os testes |
| Claude Code | atual | Plugin com comandos, subagentes e o CLI no PATH |
| DeepSeek Harness / Neuro Harness | 0.2.x | Opcional: bundle do Harness |
| Token da Meta | usuário do sistema com `ads_read` | Snapshot e conferência de dataset |

Não há dependências npm.

### Claude Code

| Passo | Comando |
|---|---|
| Marketplace (fixado na versão) | `claude plugin marketplace add monrars1995/oneuros-ads-manager#v0.2.0` |
| Plugin | `claude plugin install neuro-ads-manager@neuro-ads-manager --scope user` |
| Conferir | `claude plugin details neuro-ads-manager` |

Para testar a partir de um clone, sem instalar: `claude --plugin-dir ~/Code/neuro-ads-manager`.

### Neuro Harness

Com o Neuro Harness instalado (`~/.neuro-harness`), a partir de um clone:

```bash
git clone https://github.com/monrars1995/oneuros-ads-manager.git ~/Code/neuro-ads-manager
```

```bash
node ~/Code/neuro-ads-manager/cli/cli.js harness instalar
```

```bash
neuro-harness restart
```

O `harness instalar` roda `dsh plugin --profile neuro add link:<clone>`: o gerenciador de plugins do Harness instala o pacote, acrescenta o bundle ao perfil e valida o `cordis.patch.yml`. Detalhes em [Usando no Neuro Harness](#usando-no-neuro-harness).

### Outros agentes

Copie (ou ligue) a pasta `skills/neuro-ads-manager` para a pasta de skills do agente (`~/.agents/skills`, `~/.codex/skills`, `.claude/skills` de um projeto…). O CLI roda com `node <clone>/cli/cli.js`.

---

## Ambiente e tokens

| Variável | Para | Padrão |
|---|---|---|
| `META_ACCESS_TOKEN` | Token da Graph API (usuário do sistema, `ads_read`) | — |
| `META_AD_ACCOUNT_ID` | Conta de anúncio (`act_…`) | — |
| `META_DATASET_ID` | Pixel/dataset para `conversao dataset` | — |
| `META_GRAPH_VERSION` | Versão da Graph API | `v27.0` |
| `NEURO_ADS_HOME` | Biblioteca do usuário (perfis) | `~/.neuro-ads-manager` |
| `NEURO_HARNESS_HOME` | Base do Neuro Harness | `~/.neuro-harness` |

- **O token nunca é lido de arquivo.** O CLI recusa abrir `.env`, `.env.*`, credenciais e chaves, e nunca imprime o token (erros passam por um filtro).
- O perfil pode dizer em que variável está o token (`ambiente.token_env`). Nomes com hífen (como `CRM-TOKEN`) não podem ser exportados no shell: use letras, números e `_`.
- Use um token de **usuário do sistema** do Business Manager do cliente. Para escrever na conta (fora do plugin), `ads_management`.

---

## Usando no Claude Code

O plugin traz:
- a skill `neuro-ads-manager`;
- 6 comandos;
- 3 subagentes;
- o comando `neuro-ads-manager` no PATH das sessões.

### Comandos

| Comando | Argumentos | O que faz |
|---|---|---|
| `/neuro-ads-manager:auditar` | `[perfil] [período] [snapshot.json]` | Retrato da conta, achados automáticos verificados pelo `auditor`, compliance da copy ativa e a auditoria priorizada (P0/P1/P2) em `relatorios/` |
| `/neuro-ads-manager:planejar` | `<objetivo> [perfil] [verba] [período]` | Plano de campanha: economia, estrutura, públicos, orçamento, criativos, mensuração, testes, compliance e cronograma |
| `/neuro-ads-manager:relatorio` | `[perfil] [período] [snapshot.json \| export.csv]` | Relatório com comparação, campanhas, melhores e piores anúncios, alertas e a leitura |
| `/neuro-ads-manager:criativos` | `<oferta ou briefing> [perfil] [formato] [quantidade]` | Conceitos, copy, nomes e briefing de produção, já passados pelo compliance |
| `/neuro-ads-manager:conversao` | `[perfil] [arquivo.csv] [dataset]` | Dataset, campanhas e arquivo de conversões; índice de prontidão e correções |
| `/neuro-ads-manager:perfil` | `[novo \| editar <id> \| listar \| mostrar <id>]` | Cria ou edita um perfil de cliente com perguntas no chat |

- **A skill sozinha:** `/neuro-ads-manager:neuro-ads-manager`. Ela também é ativada quando o pedido é de tráfego pago.
- **Nenhum comando escreve na conta.** O que precisa mudar vira plano de mudança, e o comando para para você aprovar.

### Subagentes

| Subagente | Quando | Devolve |
|---|---|---|
| `@agent-neuro-ads-manager:auditor` | Depois do snapshot e do `auditar` | Achados verificados com evidência e prioridade; os falsos positivos descartados; o que não deu para ver |
| `@agent-neuro-ads-manager:revisor-compliance` | Antes de publicar copy ou criativo; na auditoria | Tabela `peça \| trecho \| regra \| severidade \| base \| reescrita` e o veredito por peça |
| `@agent-neuro-ads-manager:analista-conversao` | Na conferência de conversão | Índice de prontidão de mensuração, tabela de eventos e correções por impacto |

Os três só leem.

### Exemplo de sessão

```text
você  › /neuro-ads-manager:auditar acme 30d
agente› Token ok, conta ativa, limite de gasto em 62%. Snapshot em relatorios/snapshot-2026-10-09_2026-11-07.json.
        12 achados automáticos; o auditor confirmou 10 e descartou 2 (disclaimer lido como promessa; conjunto criado há 2 dias).
        P0: 2 anúncios com "análise gratuita" (OAB); conjunto otimizando para clique numa conta de leads.
        Auditoria em relatorios/auditoria-acme-2026-11-08.md. Quer que eu monte o plano de mudança dos P0?
você  › sim, pode montar
agente› Plano em operacoes/2026-11-08-p0-acme/ (3 operações, validado, sha256 4be1…). Aprova?
você  › aprovado, pode pausar os dois anúncios e trocar a otimização
agente› Aprovação registrada com a sua mensagem. A execução fica com a ferramenta do projeto; registro cada passo no ledger.
```

---

## Usando no Neuro Harness

O pacote é um plugin do DeepSeek Harness (`package.json` → `dsh.bundle.patch` → `harness/cordis.patch.yml`). O módulo `harness/index.mjs`:

- registra no serviço `skills` do Harness a skill `neuro-ads-manager` e um comando por arquivo de `commands/`: `neuro-ads-auditar`, `neuro-ads-planejar`, `neuro-ads-relatorio`, `neuro-ads-criativos`, `neuro-ads-conversao`, `neuro-ads-perfil` (o modelo vê só a skill; os comandos são para você chamar);
- põe o `bin/` do pacote no PATH enquanto o plugin estiver ativo, então o comando `neuro-ads-manager` funciona nas sessões.

| Ação | Comando |
|---|---|
| Instalar (liga o clone; atualizar o clone atualiza o Harness) | `node <clone>/cli/cli.js harness instalar` |
| Instalar uma cópia fixa | `node <clone>/cli/cli.js harness instalar --copiar` |
| Ver o que faria | `… harness instalar --dry-run` |
| Conferir | `neuro-ads-manager harness status` |
| Remover | `neuro-ads-manager harness remover` |

Depois de instalar ou remover: `neuro-harness restart`. Os subagentes do Claude Code ficam em `agents/*.md`: no Harness, peça ao agente para seguir o arquivo ou passá-lo como instrução de um subagente.

---

## Usando em outros agentes

Peça em linguagem natural ("audite a conta do cliente Acme nos últimos 30 dias com a skill neuro-ads-manager"). O agente lê a skill e usa o CLI com `node <clone>/cli/cli.js <comando>`.

---

## Um ciclo completo

```text
perfil  →  meta conferir  →  meta snapshot  →  auditar / alertas / relatorio  →  operacao nova
        →  operacao validar  →  aprovação no chat  →  operacao aprovar  →  execução (ferramenta do projeto)
        →  operacao registrar  →  leitura D+3 / D+7  →  relatório
```

```bash
neuro-ads-manager meta conferir --perfil acme
```

```bash
neuro-ads-manager meta snapshot --perfil acme --periodo 30d --comparar
```

```bash
neuro-ads-manager auditar relatorios/snapshot-2026-10-09_2026-11-07.json --perfil acme --saida relatorios/auditoria-acme.md
```

```bash
neuro-ads-manager alertas relatorios/snapshot-2026-10-09_2026-11-07.json --perfil acme
```

```bash
neuro-ads-manager operacao nova pausar-anuncios-sem-resultado --perfil acme
```

---

## Referência rápida do CLI

| Comando | O que faz |
|---|---|
| `perfil listar \| mostrar <id> \| novo --json <arq> \| editar <id> --json <arq> \| remover <id> \| validar --json <arq>` | Perfis de cliente |
| `meta conferir [--perfil] [--conta]` | Token, conta, status, limite de gasto, uso da API |
| `meta snapshot [--perfil] [--conta] [--periodo] [--comparar] [--ativos] [--saida]` | Estrutura, insights por nível, diário, período anterior e públicos (só GET) |
| `auditar <snapshot> [--perfil] [--saida] [--json]` | Achados por área, com evidência e recomendação; nota ou "evidência insuficiente" |
| `alertas <snapshot> [--perfil] [--saida] [--json]` | Pausar, congelar, escalar e alertas da conta pelas regras do perfil |
| `relatorio <snapshot \| export.csv> [--perfil] [--saida] [--titulo] [--gasto-min]` | Relatório em Markdown |
| `conversao validar <csv> [--evento] [--origem] [--excluir-ids]` | Cobertura das chaves, retidos, duplicados (sem mostrar dado pessoal) |
| `conversao normalizar <csv> --saida <csv>` | CSV só com SHA-256 e campos do evento |
| `conversao payload <csv> --saida <json> [--teste <código>] [--lote]` | Payload da Conversions API (não envia) |
| `conversao dataset [<id>] [--perfil]` | Último evento e contagem por evento do pixel/dataset |
| `compliance <arquivo \| -> [--perfil \| --regras] [--titulo] [--json]` | Lint de copy; sai 1 com crítico ou alto |
| `compliance regras [<conjunto>]` | Conjuntos de regras e checklist humano |
| `nome gerar \| validar \| modelo` | Nomenclatura do perfil |
| `operacao nova \| validar \| aprovar \| registrar \| status` | Plano de mudança com hash, aprovação e ledger |
| `harness instalar \| status \| remover` | Neuro Harness |
| `status`, `version`, `help` | Instalação, versão e ajuda |

Períodos: `7d`, `30d`, `ontem`, `mes`, `mes-passado` ou `AAAA-MM-DD:AAAA-MM-DD`. Detalhes de cada opção em [docs/COMANDOS.md](docs/COMANDOS.md).

---

## Perfis de cliente

A skill traz um único perfil, o **`modelo`** (segmento geral, compliance `meta_politicas` e `lgpd`), ponto de partida para os seus clientes. **Perfis de cliente são configuração de campanha e não vão para o repositório:** ficam só na sua máquina.

| Segmento | Conjuntos de compliance sugeridos | Destino e evento decisor típicos |
|---|---|---|
| Advocacia | `oab`, `meta_politicas`, `lgpd` | Instant Form; evento qualificado (MQL/SQL/agenda) |
| Educação | `eca_lgpd`, `meta_politicas`, `lgpd` | WhatsApp (CTWA), site/LP; visita e matrícula |
| Saúde | `saude`, `meta_politicas`, `lgpd` | WhatsApp ou formulário; consulta agendada |
| Estética e serviços locais | `estetica_tatuagem`, `meta_politicas`, `lgpd` | WhatsApp com venda; Purchase do CRM pela CAPI |

Cada perfil traz segmento, metas (`kpi`), regras de decisão (pausar, congelar, escalar), limites, públicos, orçamento, criativos, mensuração, compliance, nomenclatura, cadência e aprovação. **Nenhum guarda ID de conta, pixel, página, token ou dado pessoal**: só o nome das variáveis de ambiente. O validador recusa o resto.

Os perfis do usuário ficam em `~/.neuro-ads-manager/perfis/<id>.json` (ou `$NEURO_ADS_HOME/perfis`), valem por cima do `modelo` e sobrevivem às atualizações.

```bash
neuro-ads-manager perfil novo --json acme.json --base modelo
```

---

## Compliance por segmento

| Conjunto | Base | O essencial |
|---|---|---|
| `oab` | Provimento 205/2021; Código de Ética e Disciplina | Informativo; sem promessa, preço, gratuidade, caso concreto, autoengrandecimento, urgência ou captação; OAB e disclaimer |
| `eca_lgpd` | ECA; LGPD art. 14; CONANDA 163/2014; CDC; CONAR | Fale com os pais; termo de imagem; sem nome + série; sem culpa; bolsa com condição; base legal |
| `saude` | CFM 2.336/2023 e conselhos; Anvisa; CDC | Sem promessa de cura nem "sem dor"; antes e depois com regra; responsável técnico |
| `financeiro` | CDC; Banco Central; política da Meta | Sem ganho garantido; categoria especial; CET |
| `estetica_tatuagem` | CDC; política da Meta | Sem promessa de dor, prazo ou resultado; 18+; limites de copy |
| `meta_politicas` | Padrões de Publicidade da Meta | Sem atributo pessoal ("sua dívida"), endosso da Meta ou isca de clique |
| `lgpd` | LGPD | Base legal, minimização, opt-out, arquivos restritos |

```bash
neuro-ads-manager compliance copy.txt --perfil acme
```

```bash
neuro-ads-manager compliance regras eca_lgpd
```

O lint é a primeira passada; o subagente `revisor-compliance` faz a leitura de contexto. Nenhum dos dois substitui o jurídico do cliente.

---

## Mensuração e conversão

- **Pixel + CAPI** com o mesmo `event_id`; `action_source` real (`system_generated` no CRM, `physical_store` presencial, `business_messaging` com `ctwa_clid` no WhatsApp).
- **Hash SHA-256** de e-mail, telefone (DDI 55), nome, cidade, UF, CEP, país e `external_id`; `lead_id`, `ctwa_clid`, `fbc`, `fbp` sem hash.
- **`event_id` estável** e lista de enviados (`--excluir-ids`) para não reenviar.
- **Janela da CAPI:** até 7 dias; só `physical_store` até 62. O resto fica retido.
- **Teste antes da carga:** `conversao payload --teste <TEST_EVENT_CODE>`.

```bash
neuro-ads-manager conversao validar conversoes.csv --evento Purchase --origem system_generated --crm GoHighLevel
```

```bash
neuro-ads-manager conversao payload conversoes.csv --saida payload.json --teste TEST12345
```

O CSV aceita colunas em português ou inglês (`email`, `telefone`, `nome`, `cidade`, `uf`, `cep`, `id_cliente`, `lead_id`, `ctwa_clid`, `evento`, `data`, `valor`…); o modelo está em `skills/neuro-ads-manager/templates/conversao-offline.csv`. O dado cru nunca vai para a saída.

---

## Mudanças na conta

O plugin **não escreve na conta** nesta versão. Ele monta, valida e registra; a escrita fica com a ferramenta do projeto do cliente ou com o Gerenciador, depois da aprovação.

```text
operacoes/AAAA-MM-DD-<escopo>/
  README.md        o que muda, como executar, verificar e reverter
  plano.json       operações com antes, depois e rollback
  aprovacao.json   aprovador, mensagem literal e SHA-256 do plano
  ledger.jsonl     andamento de cada operação
```

- O `operacao validar` bloqueia DELETE, objeto novo ACTIVE, aumento de orçamento acima do limite (padrão +20%), redução depois de aumento e operação sem rollback.
- A aprovação é do hash: se o plano mudar, ela deixa de valer.
- Escrita incerta nunca é repetida: lê-se o estado e registra-se `outcome_unknown` ou `verified`.

---

## Atualização

**Claude Code:**

```bash
claude plugin marketplace add monrars1995/oneuros-ads-manager#vX.Y.Z
```

```bash
claude plugin update neuro-ads-manager@neuro-ads-manager
```

**Neuro Harness (instalado com link ao clone):** `git -C ~/Code/neuro-ads-manager pull` e `neuro-harness restart`. Com `--copiar`, rode `harness instalar --copiar` de novo.

Seus perfis em `~/.neuro-ads-manager/` não mudam. Depois de atualizar, abra uma sessão nova.

## Desinstalação

| Onde | Comando |
|---|---|
| Claude Code | `claude plugin uninstall neuro-ads-manager@neuro-ads-manager` e `claude plugin marketplace remove neuro-ads-manager` |
| Neuro Harness | `neuro-ads-manager harness remover` e `neuro-harness restart` |
| Perfis do usuário | apague `~/.neuro-ads-manager/` (só se quiser) |

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| `Defina META_ACCESS_TOKEN no ambiente` | Exporte o token no seu terminal (o CLI não lê `.env`), ou indique `--token-env <NOME>` |
| `Graph API … código 190` | Token inválido ou expirado: gere outro token de usuário do sistema |
| `código 10` ou `200` | Permissão: o usuário do sistema precisa de `ads_read` e acesso à conta |
| `código 17`, `4`, `613` ou `80000–80014` | Limite de uso: o CLI espera e tenta de novo; se persistir, rode mais tarde ou peça o Full access do Marketing API Access Tier |
| `código 100` | Campo ou parâmetro inválido para a versão: confira `META_GRAPH_VERSION` |
| `Recusado: .env pode conter segredos` | Proposital: o CLI não abre arquivos de segredo |
| Comandos não aparecem no Harness | `neuro-ads-manager harness status` e `neuro-harness restart` |

---

## Estrutura do repositório

```text
.claude-plugin/        plugin.json, marketplace.json e ícone do Claude Code
agents/                subagentes: auditor, revisor-compliance, analista-conversao
bin/neuro-ads-manager  comando do PATH (Claude Code e Neuro Harness)
cli/                   CLI sem dependências (Node 20+)
  cli.js               entrada e subcomandos
  meta.js              cliente da Graph API (só GET) e snapshot
  auditoria.js         achados por área
  alertas.js           regras de decisão do perfil
  relatorio.js         relatório em Markdown
  metricas.js          métricas, resultado por perfil, CSV do Gerenciador
  conversao.js         normalização, SHA-256, retenção e payload da CAPI
  compliance.js        lint de copy por conjunto de regras
  nomes.js             nomenclatura
  operacao.js          plano de mudança, aprovação e ledger
  perfis.js            perfis da skill e do usuário
  harness.js           instalação no Neuro Harness
  version.js           versão única em todos os manifestos
commands/              comandos do plugin (auditar, planejar, relatorio, criativos, conversao, perfil)
docs/                  COMANDOS.md
harness/               plugin do DeepSeek Harness (index.mjs + cordis.patch.yml)
skills/neuro-ads-manager/
  SKILL.md             a skill
  references/          estrutura e públicos, criativos e copy, orçamento e testes, mensuração,
                       compliance, relatórios, Marketing API, mudanças na conta
  presets/             perfis.json (só o modelo), compliance.json, nomenclatura.json
  templates/           auditoria, plano de campanha, relatório, briefing de criativo, CSV de conversão
tests/                 testes (node --test) com dados sintéticos
plugin.json            manifesto Agent Plugins
package.json           pacote npm, bin e manifesto `dsh` do Harness
```

---

## Desenvolvimento e releases

**Para testar a partir de um clone:**
- `npm test` roda os testes (só dados sintéticos; nenhum chama a API).
- `node cli/cli.js <comando>` roda o CLI.
- `claude --plugin-dir .` abre uma sessão com o plugin do clone.
- `claude plugin validate .` confere os manifestos.

O projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/): **MAJOR** quebra compatibilidade (comandos, formato de perfil ou de plano), **MINOR** traz recurso novo, **PATCH** corrige. O histórico está no [`CHANGELOG.md`](CHANGELOG.md).

**Como publicar uma versão:**

1. Grave a versão em todos os marcadores e confira:
   ```bash
   npm run version:set X.Y.Z
   ```
   ```bash
   npm run version:check
   ```
2. Descreva as mudanças no topo do `CHANGELOG.md`, abra o PR e faça o merge na `main`.
3. Crie a tag e a release:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
   ```

---

## 🔒 Privacidade

- **O plugin não coleta nem envia dados.** Snapshots, relatórios, planos e perfis ficam no seu computador: na pasta do projeto e em `~/.neuro-ads-manager/`.
- **Rede:** só a Graph API da Meta, com o token que você exporta, e só para leitura (GET).
- **Segredos:** o CLI não abre `.env`, credenciais nem chaves, e oculta o token em mensagens de erro. URLs de paginação com token não são guardadas.
- **Dados pessoais:** arquivos de conversão são normalizados e viram SHA-256; o dado cru não vai para a saída. Snapshots e arquivos com hash são gravados com permissão 600. Relatórios e perfis não levam IDs nem contatos.

---

## Autor e licença

Desenvolvido por **Ramon Ribeiro** para a **GoldNeuron**.

- GitHub: [@monrars1995](https://github.com/monrars1995)
- Instagram: [@monrars](https://instagram.com/monrars) e [@goldneuron.io](https://instagram.com/goldneuron.io)

Licença [MIT](LICENSE).
