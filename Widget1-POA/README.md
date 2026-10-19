# MoniTemps — Widget 1 — POA

Widget independente que apresenta **somente** os dados de **Porto Alegre**
(externos e internos). O Sítio passou a ter um widget próprio
(`Widget1-SITIO`), sem dependência entre os dois.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura do card: título **POA**, seções Externo e Interno lado a lado, rodapé. |
| `style.css` | Estilo e responsividade, preservando a base visual do widget original. |
| `script.js` | Subscription, atualização da tela, cálculos e refresh manual. |
| `preview.html` | Ambiente local de teste (simula `container`, `ctx` e o dispositivo POA). |

## Dispositivo e telemetrias

- Dispositivo (POA): `23568e90-9e30-11f1-b723-7b68e13f2590`
- Chaves consultadas — as mesmas do widget original, sem chaves novas:

| Parâmetro exibido | Chave de telemetria | Formato |
|---|---|---|
| Temperatura externa | `extTemp` | 1 decimal |
| Umidade relativa do ar (externa) | `extHumid` | 1 decimal |
| Temperatura interna | `intTemp` | 1 decimal |
| Umidade relativa do ar (interna) | `intHumid` | 1 decimal |

**Sensação térmica** e **ponto de orvalho** não são telemetrias do POA:
continuam calculados no navegador, com as fórmulas do widget original
(Heat Index simplificado do NWS e fórmula de Magnus), a partir de
`extTemp` + `extHumid`. Nenhum valor é fixo ou simulado em produção.

## Layout

**Externo** e **Interno** ficam **lado a lado** (duas colunas iguais,
separadas por um divisor vertical). A temperatura de cada lado é o destaque
da coluna e, **abaixo dela**, vêm as informações complementares daquele lado.

**Externo**
1. Temperatura externa (destaque centralizado na coluna, `°C`)
2. Umidade relativa do ar (`%`)
3. Sensação térmica (`°C`)
4. Ponto de orvalho (`°C`)

**Interno**
1. Temperatura interna (destaque centralizado na coluna, `°C`)
2. Umidade relativa do ar (`%`)

Os títulos das linhas usam os nomes completos. Dentro de cada coluna a grade
tem duas colunas de texto: títulos à esquerda e valores alinhados à direita
da coluna.

O título **POA** usa a mesma fonte dos títulos de seção do Widget 2
(`VENTO`): **22 px / 26 px**, peso 700, `letter-spacing: 2px`
(no mobile, 20 px / 23 px, como no Widget 2 em card pequeno).

## Configuração no dashboard (ThingsBoard)

1. Criar um widget **HTML Container** no dashboard do MoniTemps.
2. Colar `index.html` no campo HTML, `style.css` no CSS (substituindo todo o
   conteúdo anterior) e `script.js` no JavaScript.
3. Não são necessárias configurações extras: o dispositivo está fixo em
   `script.js`, como no widget original.
4. Tamanho sugerido: **560 × 320 px** (ou célula equivalente). Em viewports
   de até 480 px o CSS reduz fontes e espaçamentos (mesmo breakpoint do
   widget original).
5. Não altera o Sítio, os Widgets 2 e 3, o firmware, as telemetrias, o banco
   ou as integrações.

## Testes executados

- `preview.html` servido por HTTP e executado no Edge (headless), em
  560 px e em iframe de 380 px (mobile).
- Verificações automáticas do preview: **25/25 OK**, incluindo:
  - rótulos alinhados à esquerda e valores alinhados à direita em cada coluna;
  - ausência de sobreposição rótulo × valor;
  - temperatura centralizada na própria coluna;
  - informações complementares **abaixo** da temperatura de cada coluna;
  - seções Externo e Interno **lado a lado**, com a mesma altura;
  - temperaturas na mesma linha;
  - divisor vertical entre as colunas;
  - título POA com a mesma fonte do título de seção (22 px no desktop,
    20 px no mobile);
  - ausência de transbordo horizontal;
  - valores calculados/formatados: `22.0`, `66.8`, `22.0`, `15.5`, `22.2`, `70.4`.
- Validação estática: HTML sem tags abertas, CSS com chaves balanceadas,
  `script.js` sem referência ao dispositivo do Sítio.
- Simulação do **HTML Container** (CSS com namespace
  `.html-container-<hash>`, como o ThingsBoard injeta): seções lado a lado com
  `display: flex`, inclusive quando uma regra antiga
  `.html-container-<hash> .sections { flex-direction: column }` ainda está
  presente (o seletor `.card > .sections` vence por especificidade).

## Se o widget aparecer empilhado no ThingsBoard

Sintoma: **Externo** e **Interno** um embaixo do outro e uma **linha horizontal**
entre eles. O `style.css` atual não desenha essa linha horizontal: as seções
ficam em `.card > .sections` com `display: flex` e o divisor é **vertical**
(`.section.interno { border-left: ... }`). Se a linha horizontal aparece, o
dashboard está aplicando um CSS antigo, não este arquivo.

No widget **HTML Container** do ThingsBoard:

1. Abra as configurações do widget e localize o campo **CSS** do próprio HTML
   Container (o mesmo painel onde ficam o HTML e o JavaScript).
2. **Substitua todo** o conteúdo do campo pelo `style.css` atual. Não acrescente
   o novo CSS ao antigo: regras antigas depois das novas voltam a empilhar as
   seções.
3. Não use o campo **Widget CSS** (Widget card → Advanced widget style) para
   isso. Ele é aplicado ao contêiner do widget e não substitui o CSS do HTML
   Container; o CSS do container recebe um namespace
   (`.html-container-<hash> .sections`) e tem prioridade.
4. Salve o widget e a dashboard. Depois **recarregue a página inteira**
   (F5 ou Ctrl+Shift+R). O HTML Container cria um `<style>` com id
   `html-container-<hash>` calculado a partir do CSS; ao editar sem recarregar,
   o estilo antigo pode continuar no `<head>`.
5. Para conferir no console do navegador (F12):

   ```js
   getComputedStyle(document.querySelector(".card > .sections")).display
   // esperado: "flex"
   ```

   Se retornar `block` (ou as seções continuarem empilhadas), o CSS deste
   arquivo ainda não está no campo CSS do widget.

O seletor `.card > .sections` e o uso de `flex` são intencionais: o CSS do HTML
Container é injetado como `.html-container-<hash> .card > .sections`, com
especificidade maior que uma regra antiga `.html-container-<hash> .sections`.
Assim, mesmo que sobre uma regra antiga no dashboard, ela não consegue voltar a
empilhar as colunas.


## Observações e limitações

- O botão de ajuda do widget original **não foi incluído**: ele explicava
  apenas as siglas `URA`, `ST`, `PO` etc., que foram substituídas pelos nomes
  completos. O rodapé mantém a data dos dados e o botão de atualização.
- Se uma chave não estiver disponível na subscription, o placeholder
  (`--.-` / `---`) é preservado, como no comportamento original.
- O timestamp individual de um grupo só aparece quando está mais de 5 min
  atrás do dado mais recente (lógica original).
- A sensação térmica do POA usa somente temperatura e umidade (não considera
  vento nem radiação solar) — mesma formulação já existente.
