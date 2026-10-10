# MoniTemps — Widget 3 — MÁXIMOS E TOTAIS METEOROLÓGICOS

Terceiro widget do MoniTemps. Consulta o histórico do dispositivo **Ecowitt**
(Sítio) no ThingsBoard e apresenta:

- **VENTO** — até 3 picos de **velocidade** e de **rajada**, com separação
  mínima de 24 h entre os horários escolhidos.
- **CHUVA** — total do período e rankings de **dias**, **semanas** e **meses**
  mais chuvosos (WH40H).

Reaproveita a identidade visual dos widgets existentes (fundo `#292c32`,
verde de dados `#9bc53d`) e o seletor de período do widget 3 do Monitora_DG.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura HTML do widget (controles, VENTO, CHUVA, ajuda). |
| `style.css` | Estilo e responsividade (classes `card--xs/xxs/short`). |
| `script.js` | Subscription, leitura do histórico, cálculos e render. |
| `preview.html` | Ambiente local de teste (simula `container`, `ctx` e o device). |
| `_test.html` / `_tests.js` | Harness de testes (sintéticos + dados reais). |
| `_serve.py` | Servidor local só para rodar os testes (grava o resultado). |
| `_gen_realdata.ps1` | Gera `_realdata.js` a partir da API (somente leitura). |
| `.clinerules`, `.gitignore` | Regras de trabalho e exclusões. |

## Dispositivo e telemetrias

- Dispositivo (Sítio): `63eaff60-b030-11f1-940d-1f4ee055f09a` (`Ecowitt`).
- Chaves usadas: `wind_speed`, `wind_gust` (vento/rajada) e
  `rain_total`, `rain_day` (chuva do pluviômetro WH40H — usados nos testes de
  consistência; em execução o widget usa `rain_total`).
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

### Vento (picos)

- Picos escolhidos por **valor decrescente**; um candidato só é aceito se
  estiver a **≥ 24 h** de todos os já aceitos (interpretação documentada).
- Efeito conhecido: um episódio com mais de 24 h pode fornecer **dois** picos.
- Se a janela cabe no teto de leitura crua, o cálculo é **exato** sobre as
  amostras. Caso contrário, usa-se **agregação MAX horária** apenas para
  escolher os *K* buckets candidatos e depois o **refino cru** em
  `[bucket − 1 h, bucket + 2 h)` (a semântica do timestamp do bucket **não** é
  assumida). Os valores exibidos vêm sempre de amostras cruas.

### Chuva (incrementos do contador)

- Fonte: série **crua** de `rain_total`; cada amostra gera um incremento em
  relação à anterior.
  - `delta ≥ 0` → incremento real, atribuído ao **dia local da amostra em que o
    aumento foi observado**.
  - `delta < 0` → **queda do contador** (reinicialização ou ajuste): **não é
    chuva**. O acumulado anterior é **preservado** (nada é subtraído) e o dia é
    marcado como **incerto**, porque não é possível distinguir reinicialização
    de correção.
  - **Lacuna** (intervalo entre amostras > 3 min): o incremento **não é
    redistribuído**; é contabilizado no instante observado e os dias envolvidos
    são marcados como **incertos**.
- Rankings: dias → semanas (domingo 00:00) → meses, do mais chuvoso ao menos.
  Apenas unidades com chuva > 0 entram; blocos vazios não são criados.
- Recorte: somam-se **apenas** os incrementos dentro da janela; unidades
  parciais (dia/semana/mês no início/fim) são recortadas ao período.

### Incerteza

Dias com lacuna ou queda do contador recebem a marca `≈` (amarelo). O **total
recuperável é preservado**, mas nada disso é apresentado como medição exata.

## Diagnósticos realizados nos dados reais (somente leitura)

Executados via API pública do ThingsBoard (`POST /api/auth/login/public` +
`GET /values/timeseries`) — sem acesso direto ao PostgreSQL e sem escrita.

| Verificação | Resultado observado |
|---|---|
| Cadência real | ~60 s (59,1 s a 61,1 s; média 60,06 s), **sem deduplicação** |
| Histórico disponível | 2026‑09‑14 17:33 → 10‑10 (≈26 dias) |
| Agregação `interval`+`agg` | suportada; timestamps não são calendário‑estáveis |
| Limite de intervalos | TB rejeita > ~20 736 intervalos (`startTs=0` com interval pequeno) |
| `rain_total` | **NÃO é contínuo**: zera em 2026‑09‑25 23:xx e em 2026‑09‑27 15:16 |
| `rain_day` | zera diariamente; **também zerou** em 2026‑09‑27 15:16 (subestima o dia) |
| Lacuna real | 2026‑09‑21 20:30 → 09‑22 06:30 (≈10 h) |
| Máx. de vento (bruto) | `wind_speed` 57,6 km/h (21/09 02:34); `wind_gust` 79,56 km/h (21/09 02:35) |

## Testes executados

Harness em `_test.html` + `_tests.js`, rodado no Edge headless via `_serve.py`
(não há Node no ambiente). Cobre 97 verificações, com dados sintéticos e reais:

- as 13 janelas de período; limites de dia/semana/mês/ano; virada de meia-noite;
  ano bissexto; "Desde o início" (início = 1ª amostra);
- picos de vento: episódios agrupados, ≥ 24 h, exatamente 24 h, < 3 distintos,
  episódio > 24 h;
- chuva: incrementos normais, virada de meia-noite, reinicialização (zera),
  queda para patamar não nulo, lacuna, lacuna cruzando a meia-noite,
  timestamps duplicados, fim exclusivo;
- rankings dias/semanas/meses e propagação de incerteza; condicionamento;
- **dados reais**: 3 picos de `wind_speed` (57,6 / 49,32 / 48,6) e de
  `wind_gust` (79,56 / 64,44 / 58,32); totais diários 19/09 = 11,9; 20/09 = 1,1;
  21/09 = 42,3; 03/10 = 31,1; detecção de reset e de lacuna; 27/09 marcado
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

`preview.html` também foi renderizado no Edge headless: sem erros de
JavaScript e com as seções VENTO/CHUVA preenchidas.

## Limitações

1. **`rain_total` não é contínuo** e o dispositivo já reinicializou o contador.
   Reinicializações são detectadas e o acumulado anterior é preservado, mas o
   dia é marcado como incerto (não se afirma exatidão).
2. **Lacunas de coleta**: o incremento durante a lacuna é atribuído ao instante
   observado (não é redistribuído) e os dias envolvidos ficam incertos.
3. **Dia com reset**: o `rain_day` do próprio pluviômetro também zera, então ele
   subestima esses dias; por isso a verificação cruzada os exclui.
4. **Alinhamento da agregação**: os buckets agregados do TB não são
   calendário‑estáveis; a agregação é usada só para escolher candidatos, com
   refino cru. Os valores exibidos vêm sempre de amostras cruas.
5. **Volume**: janelas muito longas (ex.: "Desde o início" com anos de dados)
   podem atingir o teto de leitura crua (`60 × 4000` pontos). Nesse caso o
   vento usa a seleção por agregação e a chuva passa a indicar **total parcial**
   ("Leitura limitada pelo volume de histórico"). Hoje (~1 mês) não há impacto.
6. **Timezone**: usa deslocamento fixo UTC‑3 (igual aos widgets existentes);
   é o comportamento correto para `America/Sao_Paulo` no período atual.
7. **`rain_total` e `rain_day` só entram como telemetria**; nenhuma alteração
   foi feita no firmware, nos nomes das chaves, no schema do banco ou no
   dashboard do Ecowitt.

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

