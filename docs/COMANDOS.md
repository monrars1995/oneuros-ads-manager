# Referência de comandos do neuro-ads-manager (v0.2.0)

Cada comando e opção do CLI, conferidos com o código (`cli/`). Para a visão geral, veja o [README](../README.md).

**Como chamar:**
- `neuro-ads-manager <comando>` nas sessões do Claude Code e do Neuro Harness com o plugin ativo;
- `node <clone>/cli/cli.js <comando>` em qualquer terminal.

**Códigos de saída:** `0` ok; `1` achado que pede atenção (auditoria com crítico, compliance com crítico/alto, plano inválido, linhas com problema na conversão) ou erro; `2` uso incorreto (opção ou argumento faltando, arquivo recusado).

**Regras comuns:**
- Nenhum comando lê `.env`, `.env.*`, credenciais ou chaves: o CLI recusa (código 2).
- O token só vem do ambiente e nunca é impresso.
- Nenhum comando escreve na conta de anúncios.

---

## perfil

| Subcomando | O que faz |
|---|---|
| `perfil listar` | Lista os perfis (skill e usuário), com segmento e conjuntos de compliance |
| `perfil mostrar <id>` | Mostra o perfil resolvido (com a `base` aplicada) em JSON |
| `perfil novo --json <arq> [--base <id>]` | Grava um perfil do usuário a partir do JSON; `base` (no JSON ou na opção) é aplicada por baixo |
| `perfil editar <id> --json <arq>` | Aplica os campos do JSON sobre o perfil `<id>` e grava a versão do usuário |
| `perfil remover <id>` | Remove um perfil do usuário (os da skill não são removidos) |
| `perfil validar --json <arq>` | Só valida |

**Validação:** `id` (minúsculas, números, `_` e `-`), `nome` e `segmento` obrigatórios; `compliance.regras` em lista; recusa valores que parecem ID de conta (`act_…`), token, número longo (telefone, IDs) ou e-mail.

**Onde ficam:** `~/.neuro-ads-manager/perfis/<id>.json` (ou `$NEURO_ADS_HOME/perfis`). A skill traz só o perfil `modelo`; os perfis dos clientes ficam apenas na sua máquina, nunca no repositório.

## meta

Lê a conta pela Graph API (só GET). Token: `--token-env <NOME>`, senão o `ambiente.token_env` do perfil (se for um nome exportável), senão `META_ACCESS_TOKEN`.

### meta conferir

```bash
neuro-ads-manager meta conferir [--perfil <id>] [--conta act_…] [--token-env <NOME>] [--api-version vNN.0]
```

Mostra: usuário do token, versão da API, conta (nome, status, moeda, fuso), uso do limite de gasto e o maior percentual de uso informado nos cabeçalhos da API.

Conta: `--conta`, senão a variável `ambiente.conta_env` do perfil, senão `META_AD_ACCOUNT_ID` ou `META_ACCOUNT_ID`.

### meta snapshot

```bash
neuro-ads-manager meta snapshot [--perfil <id>] [--conta act_…] [--periodo 7d] [--comparar] [--ativos] [--saida <arq.json>] [--verbose]
```

| Opção | Padrão | O que faz |
|---|---|---|
| `--periodo` | `7d` | `Nd` (últimos N dias completos), `ontem`, `mes` (mês corrente até ontem), `mes-passado` ou `AAAA-MM-DD:AAAA-MM-DD` |
| `--comparar` | não | Busca também o período anterior de mesmo tamanho (nível de campanha) |
| `--ativos` | não | Só objetos com status efetivo ACTIVE, IN_PROCESS, WITH_ISSUES ou PENDING_REVIEW |
| `--saida` | `relatorios/snapshot-<início>_<fim>.json` | Arquivo de saída (gravado com permissão 600) |
| `--verbose` | não | Mostra pausas por uso e novas tentativas |

O snapshot traz `meta` (data, versão da API, período, chamadas), `account`, `campaigns`, `adsets` (com `targeting`, `promoted_object`, `attribution_spec`, `learning_stage_info`), `ads` (com o criativo), `insights.campaign|adset|ad`, `daily`, `previous` e `audiences`. Os insights usam `use_unified_attribution_setting=true`.

**Cuidados do cliente da API:** paginação por `paging.next` sem o token na URL e com trava de cursor repetido; pausa quando o uso passa de 75%; nova tentativa com espera exponencial nos códigos 1, 2, 4, 17, 32, 341, 613 e 80000–80014, em erros transitórios e em 5xx.

## auditar

```bash
neuro-ads-manager auditar <snapshot.json> [--perfil <id>] [--saida <arq.md>] [--json]
```

Perfil: `--perfil`, senão o gravado no snapshot. Sai `1` se houver achado crítico.

| Área | Verificações |
|---|---|
| estrutura | conta não ativa; nomes fora do padrão; muitas campanhas com o mesmo objetivo; campanha com muitos conjuntos; aprendizado limitado |
| mensuração | gasto sem resultado; otimização por clique/engajamento numa conta de resultado; conversão sem pixel/evento; janelas de atribuição diferentes |
| orçamento | verba diária abaixo de CPR alvo × 50 ÷ 7; ritmo de gasto fora do orçamento mensal do perfil |
| públicos | nenhum conjunto exclui convertidos; público em uso vazio ou pequeno; público com problema de entrega; idade abaixo do mínimo do perfil |
| criativos | poucos ou muitos anúncios por conjunto; frequência alta; CTR baixo; ranking abaixo da média; pouca diversidade |
| desempenho | custo por resultado acima do alvo; anúncios gastando sem resultado |
| compliance | copy ativa com termo crítico/alto dos conjuntos do perfil; categoria especial exigida e ausente |

**Limites padrão** (o perfil troca em `limites`): frequência 3,5; CTR de link 0,7%; 2 a 6 anúncios por conjunto; 5 conjuntos por campanha; 3 campanhas por objetivo; 50 eventos de aprendizado por semana; gasto sem resultado 2× o CPR alvo; tolerância de CPR 1,3×.

**Nota:** 100 menos o peso dos achados (crítico 15, alto 8, médio 4, baixo 1). Sem insights ou sem gasto: `null` ("evidência insuficiente").

## alertas

```bash
neuro-ads-manager alertas <snapshot.json> [--perfil <id>] [--saida <arq.md>] [--json]
```

Aplica `regras_decisao` do perfil:

| Regra do perfil | Resultado |
|---|---|
| `pausar.cpr_acima` + `pausar.gasto_min` | anúncios com gasto ≥ mínimo e CPR acima do limite (ou sem resultado) |
| `congelar.frequencia_acima` | conjuntos com frequência acima do limite |
| `escalar.cpr_ate` (+ `dias`, `aumento_pct`, `intervalo_h`) | conjuntos com CPR até o limite num período de pelo menos `dias` |
| `alerta_cpr_geral` | CPR da conta acima do alerta |

Também avisa: conta não ativa, limite de gasto acima de 85%, gasto sem resultado, perfil sem regras.

## relatorio

```bash
neuro-ads-manager relatorio <snapshot.json | export.csv> [--perfil <id>] [--saida <arq.md>] [--titulo "…"] [--gasto-min <R$>] [--periodo …] [--json]
```

- **Snapshot:** resumo com comparação (se o snapshot tiver `previous`), por campanha, melhores e piores anúncios (gasto ≥ `--gasto-min`, padrão: o CPR alvo do perfil ou R$ 50), dia a dia, destaques automáticos e a seção de leitura para o agente.
- **CSV do Gerenciador:** colunas reconhecidas em português ou inglês: "Nome da campanha", "Nome do anúncio", "Valor usado (BRL)", "Impressões", "Alcance", "Frequência", "Cliques no link", "Resultados", "Dia". Separador `,`, `;` ou TAB; números no formato brasileiro ou americano.
- O resultado segue `kpi.resultado` do perfil (em ordem de preferência, sem somar aliases); o rótulo segue `kpi.nome_resultado`.

## conversao

Arquivos CSV com dados de contato. O dado cru nunca vai para a saída nem para a tela.

**Colunas aceitas** (cabeçalho em português ou inglês, sem diferença de acento ou caixa):

| Chave | Nomes aceitos |
|---|---|
| `em` | email, e-mail |
| `ph` | telefone, celular, whatsapp, phone |
| `fn` / `ln` | first_name, primeiro_nome / last_name, sobrenome; ou `nome`/`nome_completo` (separado em primeiro e último) |
| `ct`, `st`, `zp`, `country` | cidade, uf/estado, cep, pais |
| `db`, `ge` | data_nascimento, genero/sexo |
| `external_id` | id_cliente, crm_id, contact_id |
| `lead_id`, `ctwa_clid`, `fbc`, `fbp` | iguais |
| `event_name` | evento, etapa, status |
| `event_time` | data, data_conversao, data_evento, timestamp, created_at (ISO, AAAA-MM-DD, DD/MM/AAAA [HH:MM] ou Unix) |
| `event_id` | id_evento, id, id_conversao |
| `action_source` | origem |
| `value`, `currency` | valor, receita, ticket / moeda |
| `order_id`, `content_name` | pedido, contrato, matricula / produto, servico, curso |

**Opções comuns:**

| Opção | Padrão | O que faz |
|---|---|---|
| `--evento <nome>` | — | Nome do evento quando o arquivo não tem a coluna |
| `--origem <action_source>` | `system_generated` | `website`, `app`, `phone_call`, `chat`, `email`, `physical_store`, `system_generated`, `business_messaging`, `other` |
| `--moeda` | `BRL` | Moeda quando o arquivo não tem a coluna |
| `--ddi` | `55` | DDI para telefones sem código do país (10–11 dígitos) |
| `--pais` | `br` | País quando o arquivo não tem a coluna |
| `--fuso` | `-03:00` | Fuso das datas sem fuso |
| `--crm <nome>` | — | `lead_event_source` (eventos do CRM) |
| `--excluir-ids <arq>` | — | Lista de `event_id` já enviados (um por linha ou separados por vírgula) |

**Retenção** (a linha fica de fora e aparece no diagnóstico): sem chave de correspondência; sem nome de evento; data inválida, no futuro, com mais de 62 dias, ou com mais de 7 dias fora de `physical_store`; `event_id` repetido no arquivo ou já enviado.

**event_id:** se o arquivo não tem, é gerado de forma estável (`nam_` + SHA-256 de evento, data, e-mail, telefone, external_id, lead_id e pedido).

| Subcomando | O que faz |
|---|---|
| `conversao validar <csv> [--json]` | Diagnóstico: colunas, eventos, cobertura de cada chave, retidos e avisos. Sai `1` se houver linha com problema |
| `conversao normalizar <csv> --saida <csv>` | CSV com os campos do evento e as chaves já em SHA-256 (permissão 600), só das linhas válidas |
| `conversao payload <csv> --saida <json> [--teste <código>] [--lote <n>] [--canal whatsapp]` | Payload da Conversions API em lotes de até 1.000 (`{ "data": [...] }` ou `{ "lotes": [...] }`), com `test_event_code` se pedido. **Não envia** |
| `conversao dataset [<id>] [--perfil <id>] [--json]` | Pixel/dataset: nome, último evento, indisponibilidade, correspondência automática e contagem por evento (`/stats`). Id: argumento, `ambiente.dataset_env` do perfil ou `META_DATASET_ID` |

## compliance

```bash
neuro-ads-manager compliance <arquivo | -> [--perfil <id> | --regras a,b] [--titulo "…"] [--json]
```

- Conjuntos: `--regras`, senão `compliance.regras` do perfil, senão `meta_politicas`.
- `-` lê da entrada padrão.
- `--titulo` confere o limite de título quando o conjunto ou o perfil tem `limites_copy`.
- Sai `1` se houver achado crítico ou alto.

```bash
neuro-ads-manager compliance regras [<conjunto>]
```

Sem conjunto, lista todos; com conjunto, mostra a base legal, cada regra, os obrigatórios e o checklist humano.

| Conjunto | Regras | Obrigatórios |
|---|---|---|
| `oab` | promessa de resultado, preço/gratuidade, caso concreto, autoengrandecimento, urgência/captação, captação direta, promessa sobre patrimônio, sensacionalismo, acusação a terceiro, número sem fonte, telefone na peça, depoimento, "especialista", ostentação | identificação com OAB, disclaimer |
| `eca_lgpd` | apelo à criança, dado de menor, culpa/medo dos pais, garantia de aprovação, bolsa sem condição | — |
| `saude` | promessa de cura, "sem dor", antes e depois, preço/promoção | responsável técnico com registro |
| `financeiro` | ganho garantido, crédito fácil | — |
| `estetica_tatuagem` | promessa de dor/prazo/resultado, oferta de pressão; limites título 40, primeira linha 125, corpo 2.200 | — |
| `meta_politicas` | atributo pessoal, atributo financeiro ("sua dívida"), "você que…", endosso da Meta, isca de clique | — |
| `lgpd` | dado pessoal na copy | — |

## nome

```bash
neuro-ads-manager nome gerar <campanha|conjunto|anuncio> --perfil <id> campo=valor …
neuro-ads-manager nome validar <campanha|conjunto|anuncio> "<nome>" [--perfil <id>]
neuro-ads-manager nome modelo [--perfil <id>]
```

- O modelo vem de `nomenclatura` do perfil, senão de `presets/nomenclatura.json` (`{cliente} | {canal} | {objetivo} | {segmento} | {mes}`…).
- `gerar` põe os valores em maiúsculas sem acento, troca espaços por `-` e falha se faltar campo.
- `validar` confere o formato e os valores permitidos (`valores`) e mostra os campos lidos. Sai `1` fora do padrão.

## operacao

```bash
neuro-ads-manager operacao nova <escopo> [--perfil <id>] [--pasta operacoes]
neuro-ads-manager operacao validar <pasta>
neuro-ads-manager operacao aprovar <pasta> --aprovador "<nome>" --mensagem "<texto literal>"
neuro-ads-manager operacao registrar <pasta> --op <id> --estado <estado> [--nota "…"]
neuro-ads-manager operacao status <pasta> [--json]
```

- `nova` cria `<pasta>/AAAA-MM-DD-<escopo>/` com `plano.json` (modelo), `README.md` e `ledger.jsonl`. Não sobrescreve pasta existente.
- `validar` mostra erros, avisos e o SHA-256 do plano (JSON canônico, chaves ordenadas). Erros: DELETE; método inválido; caminho não preenchido; escrita sem `depois` ou `rollback`; objeto novo ACTIVE com `criar_pausado`; aumento acima de `regras.escala_max_pct`; redução depois de aumento; soma diferente com `orcamento_soma_constante`; dependência inexistente.
- `aprovar` exige plano válido; grava `aprovacao.json` com o hash. Uma aprovação anterior de outro hash é guardada como `aprovacao.<hash>.json`.
- `registrar` exige aprovação válida para o hash atual (exceto `skipped`) e recusa repetir `request_started` numa operação em `request_started` ou `outcome_unknown`.
- Estados: `prepared`, `request_started`, `response_received`, `verified`, `outcome_unknown`, `verification_failed`, `rolled_back`, `skipped`.
- `status` mostra o hash, se está aprovado, se o plano mudou depois da aprovação e o último estado de cada operação.

## harness

```bash
neuro-ads-manager harness status [--base <pasta>] [--perfil-harness neuro]
neuro-ads-manager harness instalar [--copiar] [--dry-run] [--base <pasta>] [--perfil-harness neuro]
neuro-ads-manager harness remover [--dry-run] [--base <pasta>] [--perfil-harness neuro]
```

- **Base:** `--base`, senão `NEURO_HARNESS_HOME`, senão `~/.neuro-harness` (ou `~/.neuro-mv-superagent`, se só ela existir). O `dsh` usado é `<base>/runtime/node_modules/.bin/dsh` e o `DSH_HOME` é `<base>/dsh`.
- **instalar:** `dsh plugin --profile <perfil> add link:<pasta do pacote>`. O gerenciador do Harness acrescenta o bundle ao perfil e valida o `cordis.patch.yml`. Com `--copiar`, copia o pacote para `<base>/plugins/neuro-ads-manager` e liga a cópia.
- **remover:** `dsh plugin --profile <perfil> remove neuro-ads-manager` e apaga a cópia, se houver.
- Depois: `neuro-harness restart`.

No Harness, o plugin registra a skill `neuro-ads-manager` e os comandos `neuro-ads-auditar`, `neuro-ads-conversao`, `neuro-ads-criativos`, `neuro-ads-perfil`, `neuro-ads-planejar`, `neuro-ads-relatorio`, e põe o `bin/` do pacote no PATH enquanto estiver ativo.

## status, version, help

- `status`: pasta do pacote e da skill, perfis, biblioteca do usuário, quais variáveis de ambiente estão definidas (sem mostrar valores) e a situação no Neuro Harness.
- `version`: a versão do pacote.
- `help`: a ajuda resumida.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `META_ACCESS_TOKEN` | Token da Graph API (ou o nome indicado em `--token-env` / `ambiente.token_env`) |
| `META_AD_ACCOUNT_ID`, `META_ACCOUNT_ID` | Conta de anúncio |
| `META_DATASET_ID` | Pixel/dataset |
| `META_GRAPH_VERSION` | Versão da Graph API (padrão `v27.0`) |
| `NEURO_ADS_HOME` | Biblioteca do usuário (padrão `~/.neuro-ads-manager`) |
| `NEURO_HARNESS_HOME`, `NEURO_HARNESS_PROFILE`, `DSH_HOME` | Neuro Harness |
| `NEURO_ADS_DEBUG` | Mostra a pilha em erros inesperados (sem token) |
| `NO_COLOR` | Saída sem cores |

## Arquivos

| Arquivo | Onde |
|---|---|
| Snapshot | `relatorios/snapshot-<início>_<fim>.json` (600) |
| Relatórios e auditorias | onde `--saida` indicar (sugestão: `relatorios/`) |
| Planos de mudança | `operacoes/AAAA-MM-DD-<escopo>/` |
| Conversão com hash e payload | onde `--saida` indicar (600) |
| Perfis do usuário | `~/.neuro-ads-manager/perfis/` |
