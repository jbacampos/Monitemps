# MoniTemps — Widget 1 — SÍTIO

Widget independente que apresenta **somente** os dados do **Sítio**
(externos e internos). POA passou a ter um widget próprio (`Widget1-POA`),
sem dependência entre os dois.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura do card: título **SÍTIO**, seções Externo e Interno lado a lado, rodapé. |
| `style.css` | Estilo e responsividade, preservando a base visual do widget original. |
| `script.js` | Subscription, atualização da tela e refresh manual. |
| `preview.html` | Ambiente local de teste (simula `container`, `ctx` e o dispositivo Ecowitt). |

## Dispositivo e telemetrias

- Dispositivo (Sítio / Ecowitt): `63eaff60-b030-11f1-940d-1f4ee055f09a`
- Chaves consultadas — as mesmas do widget original, sem chaves novas:

| Parâmetro exibido | Chave de telemetria | Formato |
|---|---|---|
| Temperatura externa | `temperature_out` | 1 decimal |
| Umidade relativa do ar (externa) | `humidity_out` | 1 decimal |
| Sensação térmica | `feels_like_out` | 1 decimal |
| Pressão atmosférica | `pressure_relative` | inteiro (`hPa`) |
| Ponto de orvalho | `dew_point_out` | 1 decimal |
| Radiação solar | `solar_radiation` | inteiro (`W/m²`) |
| Temperatura interna | `temperature_in` | 1 decimal |
| Umidade relativa do ar (interna) | `humidity_in` | 1 decimal |

Todas as chaves acima já eram assinadas pelo widget original. As chaves
`wind_speed` e `wind_gust` deixaram de ser consultadas porque o vento não faz
parte deste widget (continua no Widget 2). Nenhum valor é fixo ou simulado em
produção.

## Layout

**Externo** e **Interno** ficam **lado a lado** (duas colunas iguais,
separadas por um divisor vertical). A temperatura de cada lado é o destaque
da coluna e, **abaixo dela**, vêm as informações complementares daquele lado.

Essa separação é a **mesma do `Widget1-POA`** — o Sítio usa as suas cores
(`#9bc53d` para temperaturas e valores) e acrescenta dois parâmetros no lado
externo (pressão atmosférica e radiação solar).

**Externo**
1. Temperatura externa (destaque centralizado na coluna, `°C`)
2. Umidade relativa do ar (`%`)
3. Sensação térmica (`°C`)
4. Pressão atmosférica (`hPa`)
5. Ponto de orvalho (`°C`)
6. Radiação solar (`W/m²`)

**Interno**
1. Temperatura interna (destaque centralizado na coluna, `°C`)
2. Umidade relativa do ar (`%`)

Os títulos das linhas usam os nomes completos. Dentro de cada coluna a grade
tem duas colunas de texto: títulos à esquerda e valores alinhados à direita
da coluna.

O título **SÍTIO** usa a mesma fonte dos títulos de seção do Widget 2
(`VENTO`): **22 px / 26 px**, peso 700, `letter-spacing: 2px`
(no mobile, 20 px / 23 px, como no Widget 2 em card pequeno).

## Configuração no dashboard (ThingsBoard)

1. Criar um widget **HTML Container** no dashboard do MoniTemps.
2. Colar `index.html` no campo HTML, `style.css` no CSS e `script.js` no
   JavaScript.
3. Não são necessárias configurações extras: o dispositivo está fixo em
   `script.js`, como no widget original.
4. Tamanho sugerido: **560 × 380 px** (ou célula equivalente). Em viewports
   de até 480 px o CSS reduz fontes e espaçamentos (mesmo breakpoint do
   widget original).
5. Não altera POA, os Widgets 2 e 3, o firmware, as telemetrias, o banco ou
   as integrações.

## Testes executados

- `preview.html` servido por HTTP e executado no Edge (headless), em
  560 px e em iframe de 380 px (mobile).
- Verificações automáticas do preview: **27/27 OK**, incluindo:
  - rótulos alinhados à esquerda e valores alinhados à direita em cada coluna;
  - ausência de sobreposição rótulo × valor;
  - temperatura centralizada na própria coluna;
  - informações complementares **abaixo** da temperatura de cada coluna;
  - seções Externo e Interno **lado a lado**, com a mesma altura;
  - temperaturas na mesma linha;
  - divisor vertical entre as colunas;
  - título SÍTIO com a mesma fonte do título de seção (22 px no desktop,
    20 px no mobile);
  - ausência de transbordo horizontal;
  - valores formatados: `22.0`, `66.8`, `22.0`, `1016`, `15.5`, `457`, `22.2`, `70.4`.
- Validação estática: HTML sem tags abertas, CSS com chaves balanceadas,
  `script.js` sem referência ao dispositivo do POA.

## Observações e limitações

- O botão de ajuda do widget original **não foi incluído**: ele explicava
  apenas as siglas `URA`, `ST`, `PO`, `RS`, `PA`, `VV`, `RV`, que foram
  substituídas pelos nomes completos. O rodapé mantém a data dos dados e o
  botão de atualização.
- Se uma chave não estiver disponível na subscription, o placeholder
  (`--.-` / `----` / `---`) é preservado, como no comportamento original.
- O timestamp individual de um grupo só aparece quando está mais de 5 min
  atrás do dado mais recente (lógica original).
- Sensação térmica e ponto de orvalho são valores **informados pela estação**
  (`feels_like_out`, `dew_point_out`), como no widget original — não são
  recalculados neste widget.
