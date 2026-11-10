---
description: Audita uma conta de Meta Ads com a neuro-ads-manager (estrutura, mensuração, públicos, criativos, orçamento, desempenho e compliance) e devolve os achados priorizados, sem alterar nada
argument-hint: [perfil] [período: 7d | 30d | mes-passado | AAAA-MM-DD:AAAA-MM-DD] [snapshot.json]
---

Audite a conta pedida seguindo a skill `neuro-ads-manager` (leia o SKILL.md e `references/estrutura-e-publicos.md` antes). Argumentos: `$ARGUMENTS`.

O comando `neuro-ads-manager` está no PATH desta sessão. **Só leitura:** nada muda na conta. Nunca abra `.env`.

1. **Perfil.** Sem perfil nos argumentos, rode `neuro-ads-manager perfil listar` e pergunte qual usar. Leia o perfil com `neuro-ads-manager perfil mostrar <id>`.
2. **Dados.**
   - Se veio um `snapshot.json`, use-o.
   - Senão, rode `neuro-ads-manager meta conferir --perfil <id>`. Se o token não estiver no ambiente, peça ao usuário para exportar (`export META_ACCESS_TOKEN=...` no terminal dele) e pare.
   - Rode `neuro-ads-manager meta snapshot --perfil <id> --periodo <período, padrão 30d> --comparar`.
   - Sem acesso à API: peça a exportação CSV do Gerenciador e siga só com o que ela permite (diga o que ficou de fora).
3. **Achados automáticos.** Rode `neuro-ads-manager auditar <snapshot> --perfil <id> --json` e `neuro-ads-manager alertas <snapshot> --perfil <id>`.
4. **Revisão.** Peça ao subagente `neuro-ads-manager:auditor` a verificação dos achados e o que o automático não vê (oferta, destino, criativos, funil do CRM). Em segmento regulado, peça ao `neuro-ads-manager:revisor-compliance` a revisão da copy ativa.
5. **Mensuração.** Se o perfil usa CAPI ou CRM, rode `neuro-ads-manager conversao dataset --perfil <id>` e inclua o resultado (ou chame `/neuro-ads-manager:conversao`).
6. **Entrega.** Escreva `relatorios/auditoria-<perfil>-<data>.md` seguindo `templates/auditoria.md`:
   - resumo executivo em 5 linhas;
   - achados por prioridade (P0 corrige já, P1 nesta semana, P2 no mês), cada um com evidência, impacto e recomendação;
   - o que está bom;
   - cobertura e limitações (o que não deu para ver).
7. **Próximo passo.** O que for mudança na conta vira plano: proponha `neuro-ads-manager operacao nova <escopo> --perfil <id>` e **pare para o usuário aprovar**. Não execute nada.

Não declare nada "ok" que você não conferiu. Sem dados de desempenho, diga "evidência insuficiente" em vez de dar nota.
