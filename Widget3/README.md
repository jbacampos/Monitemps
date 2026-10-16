# MoniTemps — Widget 3 — MÁXIMOS E TOTAIS METEOROLÓGICOS

Terceiro widget do MoniTemps. Consulta o histórico do dispositivo **Ecowitt**
(Sítio) no ThingsBoard e apresenta:

- **TEMPERATURA** — as 3 **maiores** e as 3 **menores** de **temperatura
  externa** do período (separação mínima de 24 h), com a **sensação térmica**
  de cada instante exibida como complemento (`ST`).
- **VENTO** — até 3 picos de **velocidade** e de **rajada**, com separação
  mínima de 24 h entre os horários escolhidos.
- **CHUVA** — total do período e rankings de **dias**, **semanas** e **meses**
  mais chuvosos (WH40H).

Reaproveita a identidade visual dos widgets existentes (fundo `#292c32`,
verde de dados `#9bc53d`) e o seletor de período do widget 3 do Monitora_DG.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura HTML do widget (controles, TEMPERATURA, VENTO, CHUVA, ajuda). |
| `style.css` | Estilo e responsividade (classes `card--xs/xxs/short`). |
| `script.js` | Subscription, leitura do histórico, cálculos e render. |
| `preview.html` | Ambiente local de teste (simula `container`, `ctx` e o device). |
| `_test.html` / `_tests.js` | Harness de testes (sintéticos + dados reais). |
| `_serve.py` | Servidor local só para rodar os testes (grava o resultado). |
| `_gen_realdata.ps1` | Gera `_realdata.js` a partir da API (somente leitura). |
| `.clinerules`, `.gitignore` | Regras de trabalho e exclusões. |

## Dispositivo e telemetrias

- Dispositivo (Sítio): `63eaff60-b030-11f1-940d-1f4ee055f09a` (`Ecowitt`).
- Chaves usadas: `temperature_out` (classifica os extremos), `feels_like_out`
  (sensação térmica, exibida como **`ST`** no mesmo instante do extremo — não
  classifica), `wind_speed`, `wind_gust` (vento/rajada) e `rain_total`,
  `rain_day` (chuva do pluviômetro WH40H — usados nos testes de consistência;
  em execução o widget usa `rain_total`).
- As chaves `rain_*` vêm **exclusivamente** de `rain[]` = **WH40H** (o `piezoRain`
  do WS90 não é publicado).

## Janelas de período (13 opções)

Seleção inicial: **Últimas 24h**. Fuso `America/Sao_Paulo` (UTC-3, sem DST);
todas as janelas são **[início inclusivo, fim exclusivo)**.

| Opção | Início | Fim |
|---|---|---|
| Últimas 24h / 48h / 72h | agora − 24/48/72 h | agora |
| Ontem | 00:00 de ontem | 00:00 de hoje |
| Anteontem | 00:00 de anteontem | 00:00 de ontem |
| Últimos 7 dias | 00:00 de seis dias atrás | agora |
| Semana anterior | domingo 00:00 (semana passada) | domingo 00:00 seguinte |
| Mês atual | 1º do mês 00:00 | agora |
| Mês anterior | 1º do mês anterior 00:00 | 1º do mês atual |
| Ano atual | 1º/01 00:00 | agora |
| Ano passado | 1º/01 do ano anterior | 1º/01 do ano atual |
| Ano retrasado | 1º/01 de dois anos atrás | 1º/01 do ano passado |
| Desde o início | primeira amostra disponível | agora |

## Metodologia dos cálculos

### Temperatura (máximas e mínimas)

- Classificação **exclusiva** por `temperature_out`. A sensação térmica
  (`feels_like_out`) é **complementar**: aparece como **`ST`** no instante de
  cada extremo e **não participa** da classificação.
- Fonte: série **crua** de ambas, na **mesma janela** `[início, fim)` das
  demais seções (leitura crua paginada). As duas séries compartilham os
  timestamps (medido no dispositivo real: **359/359** iguais). A `ST` é
  associada **pelo mesmo instante**: exato ou, na falta, a amostra mais próxima
  dentro de **3 min** (`= GAP_TOLERANCE_MS`, ~3× a cadência). Fora dessa
  tolerância exibe-se **`ST —`** (nunca se usa um horário distante).
- **Critério de ocorrência** (medido nos dados reais: cadência ≈60 s e um mesmo
  valor pode persistir por dezenas de amostras — máx. **64** no período):
  - amostras **consecutivas** (intervalo ≤ `GAP_TOLERANCE_MS`) com o **mesmo
    valor exibido** (0,1 °C) formam **um único patamar = uma ocorrência**,
    datada na 1ª amostra; um intervalo maior separa patamares;
  - o **mesmo valor pode reaparecer** em **outra ocorrência** temporal.
- **Seleção**: janela mínima de **24 h aplicada às ocorrências**, separadamente
  para máximas e mínimas — mesmo princípio dos picos de vento, porém com função
  dedicada (`selectPeaks` ordena só de forma decrescente e não trata mínimas).
  Máximas por temperatura **decrescente**; mínimas **crescente**; empate pelo
  **horário mais antigo**. Sem 3 ocorrências que satisfaçam os 24 h, mostram-se
  **somente as disponíveis** (sem preencher posições).
- **Layout**: dois blocos lado a lado — **Máximas à esquerda**, **Mínimas à
  direita** (divisor vertical). A **1ª** ocorrência tem o **ordinal acima**
  (fonte pequena) e a temperatura na **mesma escala do bloco VENTO** (valor
  grande, 40 px, com a unidade `°C` menor), seguida da **ST** e da **data/hora**;
  as **2ª/3ª** usam uma linha compacta (ordinal, temperatura e ST) com a
  data/hora abaixo. Cores: máximas em **vermelho-alaranjado**, mínimas em
  **azul-claro**, `ST` na mesma família (tom secundário) e data/hora em
  cinza-claro.
- Se a paginação limitar a leitura (histórico muito longo), a nota
  "Leitura limitada pelo volume de histórico" é exibida, sem apresentar o
  resultado como completo.

### Vento (picos)

- Picos escolhidos por **valor decrescente**; um candidato só é aceito se
  estiver a **≥ 24 h** de todos os já aceitos (interpretação documentada).
- Efeito conhecido: um episódio com mais de 24 h pode fornecer **dois** picos.
- Se a janela cabe no teto de leitura crua, o cálculo é **exato** sobre as
  amostras. Caso contrário usa-se **agregação MAX sobre a janela completa**:
  - a janela é dividida em **sub-janelas contíguas** de, no máximo, 500
    intervalos (o intervalo máximo medido na API é 700 — ver diagnósticos);
  - o intervalo de agregação cresce com a janela (1 h até ~1 ano, 5 h em 5
    anos …) para não estourar o teto de sub-consultas;
  - os buckets são **consolidados** (todas as sub-janelas/páginas; **não** há
    truncamento silencioso em 5.000 linhas nem descarte da parte recente);
  - os candidatos são escolhidos com a **mesma separação de 24 h**, de modo
    que a seleção **não fica concentrada em um único episódio** e cobre toda a
    janela;
  - cada candidato é **refinado** com amostras cruas em
    `[bucket − i, bucket + 2i)` (a semântica do timestamp do bucket **não** é
    assumida). Os valores exibidos vêm sempre de amostras cruas.
- Se algum limite técnico impedir a cobertura completa, a nota
  "Leitura limitada pelo volume de histórico" é exibida e a lista é
  apresentada como **possivelmente incompleta** (nunca como exata).

### Chuva (incrementos do contador)

- Fonte: série **crua** de `rain_total`; cada amostra gera um incremento em
  relação à anterior.
  - `delta ≥ 0` → incremento real, atribuído ao **dia local da amostra em que o
    aumento foi observado**.
  - `delta < 0` → **queda do contador** (reinicialização ou ajuste): **não é
    chuva**. O acumulado anterior é **preservado** (nada é subtraído) e **todos
    os dias** que o intervalo atravessa ficam **incertos**, porque não é
    possível distinguir reinicialização de correção.
  - **Intervalos longos**: o incremento **não é redistribuído**; é
    contabilizado no instante observado. Como as telemetrias do Ecowitt2TB só
    são publicadas quando o valor muda, um intervalo longo não distingue falha
    de coleta de período sem variação — por isso não há contagem de lacunas.
  - **Fronteira inicial**: busca-se a amostra **imediatamente anterior** ao
    início da janela (`fetchPrevSample`).
    - Se a 1ª amostra da janela coincide com `startTs`, a fronteira é **exata**:
      a amostra é a própria linha de base e o incremento anterior **não** entra.
    - Se a 1ª amostra é **posterior** a `startTs`, o incremento
      `(anterior → 1ª amostra)` atravessa a fronteira e **não é separável**
      entre dentro/fora: ele é contabilizado (preserva o total recuperável) e
      os dias tocados ficam **incertos** (nunca exatos).
    - Sem amostra anterior, nada existia antes da janela e nada se perde.
- **Frequência de dias chuvosos** (substitui a antiga contagem de lacunas de
  coleta): o rótulo do total mostra `Total no período (N dias)` e, abaixo da
  precipitação, `Dias com chuva: M` — reaproveitando os totais diários já
  calculados (`summarizeRainDays`).
  - `N` é o número de **dias do calendário do Sítio** abrangidos pela janela
    (`countCalendarUnits`), incluindo dias **sem** nenhuma amostra no
    ThingsBoard — o denominador **não** depende de haver registros.
  - Quando o período **não** é composto só por dias inteiros (início e/ou fim
    fora da meia-noite local), o rótulo usa a marca de incerteza para indicar a
    **quantidade parcial**: `(≈3 dias)` (`formatPeriodDays`).
  - `M` conta os dias com **total diário > 0**, cada dia **uma única vez**.
  - Dia com 0 mm **mas incerto** (queda do contador ou fronteira inicial) **não**
    é contado como chuvoso. Esta linha **não** exibe ajustes do contador nem
    marcas de incerteza (as marcas `≈` dos rankings continuam existindo).
- Rankings: dias → semanas (domingo 00:00) → meses, do mais chuvoso ao menos.
  Apenas unidades com chuva > 0 entram; blocos vazios não são criados.
- **Recorte `[start, end)`** com fim **exclusivo**: nenhuma amostra em `endTs`
  nem qualquer incremento observado fora da janela é contado.
- A **incerteza propaga** para as semanas/meses — inclusive a partir de dias
  afetados com 0 mm — de modo que **nenhum acumulado potencialmente incerto**
  apareça como exato.

### Incerteza

Dias com queda do contador (ou ajuste) ou incremento na **fronteira
inicial** recebem a marca `≈` (amarelo). A marca **propaga** para as semanas e
meses afetados — inclusive a partir de dias com 0 mm. O **total recuperável é
preservado**, mas nada disso é apresentado como medição exata.

## Diagnósticos realizados nos dados reais (somente leitura)

Executados via API pública do ThingsBoard (`POST /api/auth/login/public` +
`GET /values/timeseries`) — sem acesso direto ao PostgreSQL e sem escrita.

| Verificação | Resultado observado |
|---|---|
| Cadência real | ~60 s (59,1 s a 61,1 s; média 60,06 s), **sem deduplicação** |
| Histórico disponível | 2026‑09‑14 17:33 → 10‑10 (≈26 dias) |
| Agregação `interval`+`agg` | suportada; timestamps não são calendário‑estáveis |
| Limite de intervalos | Medido em 10/10/2026: **700** intervalos/h OK; **701 rejeitado** (`Number of intervals is to high`). Intervalos maiores (2 h, 8 h) são aceitos |
| Limite de `limit` (cru) | Aceita até 60 000 (retorna todo o histórico desta instância, ~36 mil amostras/chave) |
| `rain_total` | **NÃO é contínuo**: zera em 2026‑09‑25 23:xx e em 2026‑09‑27 15:16 |
| `rain_day` | zera diariamente; **também zerou** em 2026‑09‑27 15:16 (subestima o dia) |
| `temperature_out`/`feels_like_out` | cadência ≈60 s; timestamps **idênticos** (359/359 em 6 h); um mesmo valor (0,1 °C) pode persistir até ~64 amostras seguidas (medido: 13,7–18,7 °C em 24 h) |
| Lacuna real | 2026‑09‑21 20:30 → 09‑22 06:30 (≈10 h) |
| Máx. de vento (bruto) | `wind_speed` 57,6 km/h (21/09 02:34); `wind_gust` 79,56 km/h (21/09 02:35) |

## Testes executados

Harness em `_test.html` + `_tests.js`, rodado no Edge headless via `_serve.py`
(não há Node no ambiente). Cobre 234 verificações, com dados sintéticos e reais:

- as 13 janelas de período; limites de dia/semana/mês/ano; virada de meia-noite;
  ano bissexto; "Desde o início" (início = 1ª amostra);
- temperatura: ordenação **só** por `temperature_out` (a `ST` é “invertida” nas
  amostras para provar que não classifica); associação da `ST` (exata, dentro e
  **fora** da tolerância → `ST —`); separação de 24 h em máximas e mínimas
  (**< 24 h, = 24 h e > 24 h**); patamares consecutivos = 1 ocorrência; mesmo
  valor em dias diferentes (empate pelo mais antigo); menos de 3 ocorrências
  (sem preencher posições); período sem dados; limites de início/fim; mudança
  de dia/mês/ano; formatação (°C com 1 casa e data/hora local); classes de
  cor/categoria, ordinal `1ª` acima e unidade separada no 1º; **cores, escala do
  1º (40 px) e estrutura no CSS**; ordem das colunas (**Máximas à esquerda**);
  histórico longo com paginação (>= 2 consultas, teto de páginas sinalizado);
- picos de vento: episódios agrupados, ≥ 24 h, exatamente 24 h, < 3 distintos,
  episódio > 24 h; candidatos espalhados (episódio concentrado → 1 candidato;
  3 picos ≥ 24 h; distribuição em > 1 ano); planejamento da agregação
  (contíguo, ≤ 500 intervalos, teto de consultas);
- chuva: incrementos normais, virada de meia-noite, reinicialização (zera),
  retomada/recuperação, queda para patamar não nulo, **intervalos longos**
  (incremento preservado no instante observado, sem marcação de incerteza),
  **fronteira inicial** (incremento recuperado e incerto; fronteira exata
  quando a 1ª amostra coincide com `startTs`; incremento fora da janela não
  contado), timestamps duplicados, fim exclusivo;
- **frequência de dias chuvosos**: período sem chuva, todos os dias com chuva,
  mistura de chuvosos e secos, dias **sem registro no ThingsBoard** mantidos no
  denominador, sem duplicar dias com vários incrementos, virada de dia no fuso
  do Sítio, dia com 0 mm **incerto** (não contado como chuvoso) e rótulo do
  período com dias inteiros x parciais;
- rankings dias/semanas/meses, **consistência total × dias × semanas × meses**
  e propagação de incerteza (inclusive a partir de dias com 0 mm);
- **agregação com servidor simulado**: cobertura completa da janela sem truncar
  em 5.000, nenhuma consulta acima de 700 intervalos, resposta parcial
  sinalizada (`capped`) e rejeição da API tratada sem falhar;
- **dados reais**: 3 picos de `wind_speed` (57,6 / 49,32 / 48,6) e de
  `wind_gust` (79,56 / 64,44 / 58,32); totais diários 19/09 = 11,9; 20/09 = 1,1;
  21/09 = 42,3; 03/10 = 31,1; detecção de reset; 27/09 marcado
  incerto; consistência contador × `rain_day` ≤ 0,2 mm nos dias sem queda.

Como rodar:

```powershell
# 1) (opcional) regerar os dados reais de teste
./_gen_realdata.ps1

# 2) rodar o harness (Edge headless + servidor local)
python _serve.py            # em um terminal
# em outro: abrir http://127.0.0.1:8137/_test.html no Edge
# o resultado é gravado em _test_result.json
```

`preview.html` também foi renderizado no Edge headless nos períodos **Últimas
24h**, **Últimos 7 dias** e **Desde o início**: sem erros de JavaScript e com as
seções TEMPERATURA/VENTO/CHUVA preenchidas.

## Limitações

1. **`rain_total` não é contínuo** e o dispositivo já reinicializou o contador.
   Reinicializações são detectadas e o acumulado anterior é preservado, mas
   **todos os dias** que o contador poderia ter percorrido ficam incertos (não
   se afirma exatidão).
2. **Intervalos longos entre amostras**: o incremento é atribuído ao instante
   observado (não é redistribuído). Como as telemetrias do Ecowitt2TB só são
   publicadas quando o valor muda, a ausência de amostras não distingue falha
   de coleta de período sem variação; por isso não há contagem de lacunas.
3. **Fronteira inicial**: quando a janela não começa exatamente em uma amostra,
   o incremento entre a amostra anterior e a 1ª amostra da janela não é
   separável; ele é contabilizado, mas os dias tocados ficam incertos.
4. **Dia com reset**: o `rain_day` do próprio pluviômetro também zera, então ele
   subestima esses dias; por isso a verificação cruzada os exclui.
5. **Alinhamento da agregação**: os buckets agregados do TB não são
   calendário‑estáveis; a agregação é usada só para escolher candidatos, com
   refino cru. Os valores exibidos vêm sempre de amostras cruas.
6. **Volume/limites**: janelas muito longas (ex.: "Desde o início" com anos de
   dados) podem atingir o teto de leitura crua (`60 × 4000` pontos). Nesse caso
   o vento usa a seleção por agregação em **sub-janelas de ≤ 500 intervalos**
   (a API rejeita mais de 700 intervalos por consulta) e a chuva passa a indicar
   **total parcial**. Se algum limite técnico impedir a cobertura completa, o
   widget **avisa** ("Leitura limitada…") em vez de apresentar o resultado como
   exato. Hoje (~1 mês) não há impacto.
7. **Timezone**: usa deslocamento fixo UTC‑3 (igual aos widgets existentes);
   é o comportamento correto para `America/Sao_Paulo` no período atual.
8. **`rain_total` e `rain_day` só entram como telemetria**; nenhuma alteração
   foi feita no firmware, nos nomes das chaves, no schema do banco ou no
   dashboard do Ecowitt.
9. **Altura do card**: a seção TEMPERATURA mostra 6 ocorrências (3 máximas + 3
   mínimas) em **duas colunas lado a lado** (Máximas | Mínimas); em cards
   estreitos as colunas **não empilham** — preserva o divisor e evita dobrar a
   altura. Medido: 560 × 760 e 340 × 760 cabem **sem corte**. Em cards muito
   **baixos** (≤ ~600 px) as três seções não cabem simultaneamente e o
   `overflow: hidden` do card corta o excedente — comportamento pré-existente
   de dimensionamento do dashboard (que deve fornecer altura suficiente).
   Nenhum dado é truncado no cálculo; apenas a exibição é limitada pelo card.
10. **Sensação térmica (`ST`)**: associada ao **mesmo instante** (exato ou
    ±3 min). Quando não há amostra de `feels_like_out` dentro da tolerância,
    exibe-se **`ST —`** — nunca um horário distante nem valor inventado. Ela
    **não** classifica (a classificação é só por `temperature_out`).

## Integração ao ThingsBoard (HTML Container)

1. Importar/criar um widget **HTML Container** no dashboard do MoniTemps.
2. Colar o conteúdo de `index.html` no campo HTML, `style.css` no CSS e
   `script.js` no JavaScript.
3. O widget usa o `ctx`/`container` padrão do ThingsBoard e consulta o
   dispositivo `63eaff60-b030-11f1-940d-1f4ee055f09a` (o mesmo usado pelo
   widget de vento/chuva existente). Não são necessárias configurações extras.
4. Não modifica os widgets 1 e 2, o firmware do Ecowitt, as telemetrias nem o
   banco de dados.

## Regra de trabalho

Alterações pequenas, controladas e verificáveis; preservar o comportamento
existente; testar no `preview.html`/harness antes de publicar no ThingsBoard.

