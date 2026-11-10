# Criativos e copy

## O que faz um anúncio funcionar

1. **Gancho (0–3 s):** a primeira frase ou o primeiro quadro diz para quem é e por que importa agora. Sem logo antes do gancho.
2. **Argumento:** um só por peça (dor, ganho, prova, processo, objeção respondida).
3. **Prova:** dado com fonte, demonstração, bastidor, depoimento (onde o segmento permite).
4. **Próximo passo:** um CTA, coerente com o destino.

## Formatos

| Formato | Proporção | Uso |
|---|---|---|
| Reels / Stories | 9:16 (1080×1920) | Principal em alcance e custo; vídeo nativo vertical |
| Feed | 4:5 (1080×1350) | Par obrigatório do 9:16 (regra de personalização de ativo por posicionamento) |
| Carrossel | 1:1 ou 4:5 | Checklists, passo a passo, portfólio |
| Post orgânico promovido | o do post | Prova social do perfil; escolha pelos melhores orgânicos (tempo de exibição, salvamentos e compartilhamentos por mil alcançados) |

**Área segura 9:16:** texto e rosto fora do topo e da faixa inferior onde ficam nome, legenda e botões. Confira a prévia de cada posicionamento antes de publicar. Para vídeo, use a zona segura do neuro-mv-edit.

## Diversidade e fadiga

- **Conceitos, não variações:** troque o argumento, o gancho e o formato; trocar cor ou fonte não conta como teste.
- **Volume:** 3–6 anúncios ativos por conjunto; 10 no formato 1×1×10.
- **Fadiga:** frequência subindo + CTR caindo + CPM/CPR subindo. Resposta: conceito novo ou público mais amplo.
- **Ranking abaixo da média** (qualidade, engajamento ou conversão) encarece o leilão: reveja gancho e pós-clique.

## Copy

- **Texto principal:** a primeira linha carrega o gancho (até ~125 caracteres aparecem antes do "ver mais").
- **Título:** curto (o conjunto `estetica_tatuagem` limita a 40 caracteres).
- **CTA:** coerente com o destino (`LEARN_MORE` em Instant Form informativo, `WHATSAPP_MESSAGE` em CTWA).
- **Segmento regulado:** tema → condição ("depende do caso e dos documentos") → especialista explicando → CTA de baixa pressão → disclaimer do perfil.
- **Oferta e ano vigentes**; claims com prazo legal ganham data de aposentadoria no briefing.
- **Advantage+ creative desligado** em segmento regulado (a Meta não pode reescrever o texto aprovado).

## Ganchos e ângulos por segmento

| Segmento | Ganchos e ângulos | Evitar |
|---|---|---|
| Serviços jurídicos | Paradoxo, comparativo de conceitos ("X não é o mesmo que Y"), pauta específica e atual, checklist documental; foto real do porta-voz | Garantia, percentual sem fonte, caso concreto, "análise gratuita", "meu caso", "sua dívida", acusar terceiros, estética de notícia, telefone/URL na arte |
| Educação | Depoimento acolhedor de família, história da escola, rotina e tranquilidade dos pais, atividades da escola | Evento passado, desconto vencido, culpar os pais, criança identificada sem termo, uma peça com várias ofertas |
| Estética e serviços locais | Técnica, processo, bastidores, portfólio real; vários ângulos por conjunto | "Sem dor", "uma sessão", "1 dia", "tempo limitado", desconto não aprovado |

## Briefing de produção (o que entregar)

Modelo em `templates/briefing-criativo.md`. Por peça:

- código (C01…), nome no padrão, formato e proporções;
- gancho, roteiro ou layout, texto na arte (pouco), texto principal, título, descrição, CTA;
- prova usada e a fonte;
- resultado do `neuro-ads-manager compliance` e do `revisor-compliance`;
- checklist humano (termo de imagem, identificação profissional, direitos de música e imagem);
- hipótese do teste.

`copy.json` acompanha o briefing com `codigo`, `nome`, `formato`, `gancho`, `texto_principal`, `titulo`, `descricao`, `cta`, `compliance`.

## QA antes de subir

- [ ] Texto da arte idêntico ao aprovado.
- [ ] Rosto visível quando a peça depende dele; logo oficial (nunca gerado por IA).
- [ ] 1 CTA; legível em 360 px de largura.
- [ ] Par Feed 4:5 + Story 9:16 com o mesmo texto.
- [ ] Destino (formulário, WhatsApp, LP) conferido com o anúncio.
- [ ] Prévias por posicionamento revisadas.
