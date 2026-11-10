# Changelog

Todas as mudanças relevantes do **Neuro Ads Manager** ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/):

- **MAJOR**: quebra de compatibilidade (comandos do CLI, formato de perfil, de snapshot ou de plano de mudança);
- **MINOR**: recurso novo compatível;
- **PATCH**: correção sem mudança de comportamento esperado.

## [0.2.0] — 2026-11-10

Código aberto publicamente em [monrars1995/oneuros-ads-manager](https://github.com/monrars1995/oneuros-ads-manager).

### Removido
- **Perfis de cliente** da skill: `presets/perfis.json` traz só o `modelo`. Perfis de cliente são configuração de campanha e ficam apenas na máquina do usuário, em `~/.neuro-ads-manager/perfis/` (crie com `neuro-ads-manager perfil novo --base modelo`).
- **Dados e análises de campanha:** o documento de análise de contas reais saiu do repositório, e as referências, os conjuntos de compliance, os comandos e o README passaram a usar exemplos genéricos ou fictícios.

### Alterado
- **Fixture de teste sintético:** `tests/fixtures/snapshot.json` usa uma conta fictícia (`act_0000000001`), campanhas e anúncios inventados e números de exemplo; os testes usam um perfil fictício montado sobre o `modelo`.
- **Repositório:** `monrars1995/oneuros-ads-manager` nos manifestos, no README e no CLI. Os nomes do pacote, do plugin e do comando continuam `neuro-ads-manager`.
- `.claude-plugin/marketplace.json` passa a ter a versão (`metadata.version`), mantida pelo `cli/version.js`.

## [0.1.0] — 2026-11-08

Primeira versão (repositório privado).

### Adicionado
- **Skill `neuro-ads-manager`** com as boas práticas de tráfego pago e padrões validados em projetos reais:
  - regras inegociáveis (segredos, IDs e dados pessoais, leitura por padrão, PAUSED, nunca excluir, não somar o incompatível, evento decisor);
  - estrutura de conta, públicos, criativos e copy, orçamento e lances, testes, mensuração, relatórios e mudanças na conta;
  - 8 referências em `references/` e 5 modelos em `templates/`.
- **Perfis de cliente** sem dados sensíveis (o `modelo` e perfis por segmento), com metas, regras de decisão, compliance, nomenclatura e cadência.
- **Conjuntos de compliance:** `oab` (Provimento 205/2021), `eca_lgpd`, `saude`, `financeiro`, `estetica_tatuagem`, `meta_politicas` e `lgpd`, cada um com regras, obrigatórios e checklist humano.
- **CLI `neuro-ads-manager`** (Node 20+, sem dependências):
  - `meta conferir` e `meta snapshot`: cliente da Graph API só de leitura (v27.0 por padrão), com paginação protegida, pausa por uso, novas tentativas em erro transitório e token oculto;
  - `auditar` (achados por área e nota que vira "evidência insuficiente" sem dados), `alertas` (pausar, congelar, escalar pelas regras do perfil) e `relatorio` (snapshot ou CSV do Gerenciador);
  - `conversao validar | normalizar | payload | dataset`: SHA-256, retenção pela janela da CAPI, `event_id` estável, histórico de enviados, `ctwa_clid` e `business_messaging`, `test_event_code`;
  - `compliance` (lint de copy e limites de tamanho) e `compliance regras`;
  - `nome gerar | validar | modelo`;
  - `operacao nova | validar | aprovar | registrar | status`: plano de mudança com SHA-256, aprovação literal e ledger;
  - `perfil`, `harness`, `status`.
- **Plugin do Claude Code:** 6 comandos (`auditar`, `planejar`, `relatorio`, `criativos`, `conversao`, `perfil`), 3 subagentes só de leitura (`auditor`, `revisor-compliance`, `analista-conversao`) e o comando `neuro-ads-manager` no PATH.
- **Plugin do Neuro Harness / DeepSeek Harness:** bundle (`harness/`) que registra a skill e os comandos `neuro-ads-*` no serviço de skills e põe o CLI no PATH; instalação com `neuro-ads-manager harness instalar`.
- **Manifesto Agent Plugins** (`plugin.json`) e `cli/version.js` para manter a versão igual em todos os manifestos.
- **Testes** (`npm test`) com dados sintéticos.
- **Documentação:** README e `docs/COMANDOS.md`.
