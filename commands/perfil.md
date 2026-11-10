---
description: Cria, edita ou mostra um perfil de cliente da neuro-ads-manager (segmento, metas, regras de decisão, compliance, nomenclatura, cadência), com perguntas no chat
argument-hint: [novo | editar <id> | listar | mostrar <id>]
---

Cuide dos perfis da neuro-ads-manager. Argumentos: `$ARGUMENTS`. O comando `neuro-ads-manager` está no PATH.

- **`listar` / `mostrar <id>`:** rode `neuro-ads-manager perfil listar` (ou `perfil mostrar <id>`) e resuma.
- **`novo`, ou sem argumento:**
  1. Rode `neuro-ads-manager perfil listar` e `neuro-ads-manager compliance regras`.
  2. Pergunte, com múltipla escolha e poucas perguntas por vez:
     - **Obrigatórios:** nome do cliente, id curto (minúsculas), segmento.
     - **Recomendados:** destino principal, evento decisor, CPR alvo (com a fonte), regras de decisão (pausar, congelar, escalar), conjuntos de compliance, região e idade mínima, fuso, aprovador.
     - **Opcionais:** nomenclatura própria, cadência, disclaimer, limites de copy.
     - Use `modelo` como base (é o único perfil que vem com a skill) e ajuste pelo segmento: conjuntos de compliance (`oab`, `eca_lgpd`, `saude`, `financeiro`, `estetica_tatuagem`), evento decisor e regras de decisão.
  3. **Nunca grave** ID de conta, pixel, página, token, e-mail ou telefone. Em `ambiente`, só o **nome** das variáveis (`token_env`, `conta_env`, `dataset_env`).
  4. Monte o JSON com `"id"` e `"base"`, grave num arquivo temporário e rode `neuro-ads-manager perfil novo --json <arquivo>`. Se a validação recusar, corrija e rode de novo.
  5. Mostre o resultado com `neuro-ads-manager perfil mostrar <id>` e o próximo passo: `/neuro-ads-manager:auditar <id>`.
- **`editar <id>`:** rode `perfil mostrar <id>`, pergunte o que muda, grave um JSON só com os campos alterados e rode `neuro-ads-manager perfil editar <id> --json <arquivo>`. Editar um perfil que vem com a skill cria a versão do usuário.

Os perfis do usuário ficam em `~/.neuro-ads-manager/perfis/` e sobrevivem às atualizações. Nunca edite `presets/perfis.json` da skill.
