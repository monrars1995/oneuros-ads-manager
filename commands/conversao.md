---
description: Confere a conversão de uma conta com a neuro-ads-manager (pixel/dataset, Conversions API, deduplicação, conversão offline do CRM, ctwa_clid, atribuição) e devolve o índice de prontidão e as correções
argument-hint: [perfil] [arquivo.csv de conversões] [dataset]
---

Confira a mensuração pedida seguindo a skill `neuro-ads-manager` (leia o SKILL.md e `references/mensuracao.md`). Argumentos: `$ARGUMENTS`.

**Só leitura.** Nenhum evento é enviado por este comando. Nunca abra `.env`. Arquivos de CRM podem ter dados pessoais: nunca mostre linhas, só agregados.

1. **Perfil.** Leia `mensuracao`, `kpi.eventos_funil` e `ambiente` do perfil.
2. **Dataset.** Rode `neuro-ads-manager conversao dataset --perfil <id>` (ou com o id do dataset). Confira o último evento, os eventos recebidos e se o evento de otimização das campanhas aparece.
3. **Campanhas.** Com um snapshot (`neuro-ads-manager meta snapshot --perfil <id> --periodo 30d`), confira:
   - o `optimization_goal` e o `promoted_object` de cada conjunto ativo;
   - a janela de atribuição (`attribution_spec`): a mesma nos conjuntos comparados?
   - se os resultados do relatório usam os tipos de ação do perfil (`kpi.resultado`), sem somar aliases.
4. **Arquivo de conversões** (se veio): rode `neuro-ads-manager conversao validar <arquivo.csv> [--evento …] [--origem …] [--excluir-ids <enviados.csv>]` e explique a cobertura das chaves, as linhas retidas e por quê. Se o usuário quiser preparar a carga: `conversao normalizar` (CSV só com hash, para o Gerenciador de Eventos) ou `conversao payload --teste <TEST_EVENT_CODE>` (CAPI, primeiro em teste).
5. **Diagnóstico.** Peça ao subagente `neuro-ads-manager:analista-conversao` o diagnóstico completo e o índice de prontidão (alinhamento, eventos, integridade, conversão, atribuição, governança).
6. **Entrega.** Escreva `relatorios/conversao-<perfil>-<data>.md` com:
   - o índice de prontidão e o que puxa para baixo;
   - a tabela de eventos (nome, fonte, quando dispara, `action_source`, dedup, para onde vai);
   - as correções em ordem de impacto;
   - o checklist de LGPD (base legal, minimização, opt-out).
7. **Envio.** Enviar eventos à Meta é escrita: vira plano de mudança, com aprovação, teste com `test_event_code` antes e ledger do que foi aceito.
