// ============================================================
// WIDGET SÍTIO — MÁXIMOS E TOTAIS METEOROLÓGICOS
// ------------------------------------------------------------
// Consulta o histórico do dispositivo Ecowitt (Sítio) no
// ThingsBoard e apresenta:
//   • TEMPERATURA : 3 maiores e 3 menores de temperatura externa
//              (separação mínima de 24 h), com a sensação térmica do
//              mesmo instante exibida como "ST".
//   • VENTO  : até 3 picos de velocidade e de rajada, com
//              separação mínima de 24 h entre os horários.
//   • CHUVA  : total do período e rankings de dias / semanas /
//              meses mais chuvosos, a partir dos incrementos do
//              contador do pluviômetro WH40H.
//
// Fonte de dados: a mesma camada usada pelos widgets existentes
// (/api/plugins/telemetry). A agregação no servidor é usada
// apenas para SELECIONAR candidatos a pico; os valores exibidos
// vêm sempre de amostras cruas (refino), para não apresentar
// aproximações como medições.
// ============================================================

const DEVICE_ECOWITT = "63eaff60-b030-11f1-940d-1f4ee055f09a";

// O Sítio opera em UTC-3 (America/Sao_Paulo, sem horário de verão),
// igual ao widget existente.
const SITE_TIMEZONE_OFFSET_MINUTES = -180;
const SITE_OFFSET_MS = SITE_TIMEZONE_OFFSET_MINUTES * 60000;

// Primeiro dia da semana local (0 = domingo).
const WEEK_START = 0;

// Separação mínima entre picos contabilizados no mesmo ranking.
const PEAK_MIN_GAP_MS = 24 * 3600 * 1000;
const PEAK_TOP_N = 3;

// Temperatura: telemetria classificada (temperature_out) e a complementar
// (feels_like_out, exibida como "ST" no mesmo instante). Nº de extremos por
// categoria e janela mínima entre ocorrências (mesmo princípio dos picos de
// vento, aplicado às OCORRÊNCIAS).
const TEMP_KEY = "temperature_out";
const TEMP_FEELS_KEY = "feels_like_out";
const TEMP_TOP_N = 3;
const TEMP_MIN_GAP_MS = 24 * 3600 * 1000;

// As séries temperature_out e feels_like_out compartilham os timestamps
// (verificado no dispositivo real). Ainda assim aceita-se a amostra de
// sensação térmica mais próxima dentro desta tolerância (= GAP_TOLERANCE_MS,
// ~3× a cadência); fora dela NÃO se associa (exibe "ST —").
const TEMP_ST_TOLERANCE_MS = 3 * 60 * 1000;

// Agregação grosseira (somente seleção de candidatos a pico).
const COARSE_INTERVAL_MS = 3600 * 1000; // 1 hora
const COARSE_TOP_K = 12;                // nº de candidatos (espalhados)

// Restrições REAIS medidas na API do ThingsBoard (datalog.top):
//   • uma consulta agregada é REJEITADA acima de ~700 intervalos
//     (701 intervalos de 1 h -> HTTP 400 "Number of intervals is to high");
//   • o intervalo pode ser qualquer múltiplo (2 h, 8 h, ...);
//   • a leitura crua aceita limit >= 4000 (até 60000 nesta instância).
// Por isso a janela agregada é dividida em sub-janelas contíguas de, no
// máximo, AGG_MAX_INTERVALS intervalos, e todos os buckets são consolidados.
const AGG_MAX_INTERVALS = 500;          // intervalos por consulta (< 700 medido)
const AGG_MAX_REQUESTS = 20;            // teto de sub-consultas por chave
const AGG_PAGE_LIMIT = 5000;            // limite de buckets por resposta
const RAW_REFINE_PAGES = 4;             // páginas cruas por candidato

// Intervalo máximo entre amostras consecutivas para considerá-las
// adjacentes (usado no critério de "ocorrência distinta" da temperatura).
const GAP_TOLERANCE_MS = 3 * 60 * 1000; // 3 minutos (> 3× a cadência)

// Abaixo deste valor (mm) a unidade exibiria "0,0 mm" e não entra
// nos rankings (evita posições vazias).
const RAIN_MIN_MM = 0.05;

// Paginação da leitura crua.
const RAW_PAGE_LIMIT = 4000;
const RAW_MAX_PAGES = 60;               // teto de segurança (~240k pontos/chave)

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez"];

// ============================================================
// TEMPO LOCAL DO SÍTIO
// ------------------------------------------------------------
// O deslocamento é fixo (UTC-3). Trabalhamos com um "espaço local"
// somando o deslocamento e lendo o resultado como UTC; assim os
// limites de dia/semana/mês/ano seguem o calendário do Sítio.
// ============================================================

function siteShift(ts) {
    return ts + SITE_OFFSET_MS;
}

function siteUnshift(ts) {
    return ts - SITE_OFFSET_MS;
}

function siteParts(ts) {
    const d = new Date(siteShift(ts));

    return {
        y: d.getUTCFullYear(),
        mo: d.getUTCMonth(),
        d: d.getUTCDate(),
        h: d.getUTCHours(),
        mi: d.getUTCMinutes(),
        dow: d.getUTCDay()
    };
}

function startOfSiteDay(ts) {
    const s = siteShift(ts);
    return siteUnshift(Math.floor(s / 86400000) * 86400000);
}

function startOfSiteWeek(ts) {
    const dayStart = startOfSiteDay(ts);
    const diff = (siteParts(dayStart).dow - WEEK_START + 7) % 7;
    return addSiteDays(dayStart, -diff);
}

function startOfSiteMonth(ts) {
    const d = new Date(siteShift(ts));
    return siteUnshift(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfSiteYear(ts) {
    const d = new Date(siteShift(ts));
    return siteUnshift(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function addSiteDays(ts, n) {
    const d = new Date(siteShift(ts));
    d.setUTCDate(d.getUTCDate() + n);
    return siteUnshift(d.getTime());
}

function addSiteMonths(ts, n) {
    const d = new Date(siteShift(ts));
    d.setUTCMonth(d.getUTCMonth() + n);
    return siteUnshift(d.getTime());
}

function addSiteYears(ts, n) {
    const d = new Date(siteShift(ts));
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return siteUnshift(d.getTime());
}

// ============================================================
// FORMATAÇÃO
// ============================================================

function pad2(n) {
    return String(n).padStart(2, "0");
}

function format1(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(1) : "---";
}

function formatDateTime(ts) {
    const p = siteParts(ts);
    return pad2(p.d) + "/" + MONTHS[p.mo] + " " + pad2(p.h) + ":" + pad2(p.mi);
}

function formatDayShort(ts) {
    const p = siteParts(ts);
    return pad2(p.d) + "/" + pad2(p.mo + 1);
}

function formatWeekLabel(startTs, endTs) {
    // Fim exclusivo -> mostra o último dia pertencente à semana.
    return formatDayShort(startTs) + "–" + formatDayShort(endTs - 1);
}

function formatMonthLabel(ts) {
    const p = siteParts(ts);
    const name = MONTHS[p.mo];
    return name.charAt(0).toUpperCase() + name.slice(1) + "/" +
        String(p.y).slice(-2);
}

// ============================================================
// JANELAS DE PERÍODO (as 13 opções)
// ------------------------------------------------------------
// Todas as janelas são [início inclusivo, fim exclusivo).
// liveEnd=true indica que o fim acompanha "agora".
// desdeInicio=true indica que o início é a primeira amostra
// disponível (resolvido na camada de dados).
// ============================================================

const PERIOD_IDS = [
    "ultimas24h", "ultimas48h", "ultimas72h", "ontem", "anteontem",
    "ultimos7dias", "semanaanterior", "mesatual", "mesanterior",
    "anoatual", "anopassado", "anoretrasado", "desdeoinicio"
];

const PERIOD_LABELS = {
    ultimas24h: "Últimas 24h",
    ultimas48h: "Últimas 48h",
    ultimas72h: "Últimas 72h",
    ontem: "Ontem",
    anteontem: "Anteontem",
    ultimos7dias: "Últimos 7 dias",
    semanaanterior: "Semana anterior",
    mesatual: "Mês atual",
    mesanterior: "Mês anterior",
    anoatual: "Ano atual",
    anopassado: "Ano passado",
    anoretrasado: "Ano retrasado",
    desdeoinicio: "Desde o início"
};

const H24 = 24 * 3600 * 1000;

function computeWindow(periodId, now) {
    const today = startOfSiteDay(now);
    const weekStart = startOfSiteWeek(now);
    const monthStart = startOfSiteMonth(now);
    const yearStart = startOfSiteYear(now);

    switch (periodId) {
    case "ultimas24h":
        return { start: now - H24, end: now, liveEnd: true, desdeInicio: false };
    case "ultimas48h":
        return { start: now - 2 * H24, end: now, liveEnd: true, desdeInicio: false };
    case "ultimas72h":
        return { start: now - 3 * H24, end: now, liveEnd: true, desdeInicio: false };
    case "ontem":
        return { start: addSiteDays(today, -1), end: today, liveEnd: false, desdeInicio: false };
    case "anteontem":
        return { start: addSiteDays(today, -2), end: addSiteDays(today, -1), liveEnd: false, desdeInicio: false };
    case "ultimos7dias":
        return { start: addSiteDays(today, -6), end: now, liveEnd: true, desdeInicio: false };
    case "semanaanterior":
        return { start: addSiteDays(weekStart, -7), end: weekStart, liveEnd: false, desdeInicio: false };
    case "mesatual":
        return { start: monthStart, end: now, liveEnd: true, desdeInicio: false };
    case "mesanterior":
        return { start: addSiteMonths(monthStart, -1), end: monthStart, liveEnd: false, desdeInicio: false };
    case "anoatual":
        return { start: yearStart, end: now, liveEnd: true, desdeInicio: false };
    case "anopassado":
        return { start: addSiteYears(yearStart, -1), end: yearStart, liveEnd: false, desdeInicio: false };
    case "anoretrasado":
        return { start: addSiteYears(yearStart, -2), end: addSiteYears(yearStart, -1), liveEnd: false, desdeInicio: false };
    case "desdeoinicio":
        return { start: null, end: now, liveEnd: true, desdeInicio: true };
    default:
        return { start: now - H24, end: now, liveEnd: true, desdeInicio: false };
    }
}

// ============================================================
// LAYOUT — CLASSES CONFORME A LARGURA DO CARD
// ------------------------------------------------------------
// O ThingsBoard "achata" as media queries do CSS do widget; por
// isso o layout responsivo é aplicado por classes, com base na
// largura/altura reais do card (mesmo critério do widget atual).
// ============================================================

const LAYOUT_XS_MAX_WIDTH = 480;
const LAYOUT_XXS_MAX_WIDTH = 360;
const LAYOUT_SHORT_MAX_HEIGHT = 480;

function updateLayoutClass() {
    const card = container.querySelector(".card");

    if (!card) {
        return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    card.classList.toggle("card--xs", width <= LAYOUT_XS_MAX_WIDTH);
    card.classList.toggle("card--xxs", width <= LAYOUT_XXS_MAX_WIDTH);
    card.classList.toggle("card--short", height <= LAYOUT_SHORT_MAX_HEIGHT);
}

// ============================================================
// CAMADA DE DADOS
// ------------------------------------------------------------
// Mesma API usada pelos widgets existentes:
//   /api/plugins/telemetry/DEVICE/<id>/values/timeseries
// O widget roda autenticado no ThingsBoard, por isso a URL é
// relativa.
// ============================================================

function httpGetJson(url) {
    return new Promise(function (resolve, reject) {
        ctx.http.get(url).subscribe(
            function (response) { resolve(response || {}); },
            function (error) { reject(error); }
        );
    });
}

function telemetryUrl(key, startTs, endTs, extra) {
    let url = "/api/plugins/telemetry/DEVICE/" + DEVICE_ECOWITT +
        "/values/timeseries" +
        "?keys=" + encodeURIComponent(key) +
        "&startTs=" + startTs +
        "&endTs=" + endTs;

    if (extra) {
        url += "&" + extra;
    }

    return url;
}

function dedupeSortAsc(points) {
    const sorted = points.slice().sort(function (a, b) { return a.ts - b.ts; });
    const out = [];

    sorted.forEach(function (p) {
        if (out.length && out[out.length - 1].ts === p.ts) {
            out[out.length - 1] = p;   // fica o último valor do timestamp
        } else {
            out.push(p);
        }
    });

    return out;
}

// Leitura crua paginada em [startTs, endTs]. Devolve
// { points (crescente), capped } — capped indica que o teto de
// páginas foi atingido (dados possivelmente incompletos).
function fetchRaw(key, startTs, endTs, maxPages) {
    const limitPages = maxPages || RAW_MAX_PAGES;
    const collected = [];
    let end = endTs;
    let page = 0;
    let capped = false;

    function nextPage() {
        if (page >= limitPages) {
            capped = true;
            return Promise.resolve();
        }

        const url = telemetryUrl(key, startTs, end,
            "limit=" + RAW_PAGE_LIMIT + "&orderBy=DESC");

        return httpGetJson(url).then(function (response) {
            const arr = (response && response[key]) || [];

            if (!arr.length) {
                return;
            }

            arr.forEach(function (p) {
                const ts = Number(p.ts);
                const value = Number(p.value);

                if (Number.isFinite(ts) && Number.isFinite(value) &&
                    ts >= startTs && ts <= end) {
                    collected.push({ ts: ts, value: value });
                }
            });

            page++;

            if (arr.length < RAW_PAGE_LIMIT) {
                return;
            }

            const oldest = Number(arr[arr.length - 1].ts);

            if (!Number.isFinite(oldest) || oldest <= startTs) {
                return;
            }

            end = oldest - 1;
            return nextPage();
        });
    }

    return nextPage().then(function () {
        return { points: dedupeSortAsc(collected), capped: capped };
    });
}

// Leitura agregada (executada no servidor). Usada apenas para
// seleção de candidatos; os valores exibidos vêm do refino cru.
function fetchAgg(key, startTs, endTs, interval, agg, limit) {
    const url = telemetryUrl(key, startTs, endTs,
        "interval=" + interval +
        "&agg=" + agg +
        "&limit=" + (limit || 5000) +
        "&orderBy=ASC");

    return httpGetJson(url).then(function (response) {
        const arr = (response && response[key]) || [];
        const out = [];

        arr.forEach(function (p) {
            const ts = Number(p.ts);
            const value = Number(p.value);

            if (Number.isFinite(ts) && Number.isFinite(value)) {
                out.push({ ts: ts, value: value });
            }
        });

        return out;
    });
}

// Primeira amostra disponível (para "Desde o início").
function fetchFirstTs(key, endTs) {
    const url = telemetryUrl(key, 0, endTs, "limit=1&orderBy=ASC");

    return httpGetJson(url).then(function (response) {
        const arr = (response && response[key]) || [];

        if (!arr.length) {
            return null;
        }

        const ts = Number(arr[0].ts);
        return Number.isFinite(ts) ? ts : null;
    });
}

// Amostra IMEDIATAMENTE anterior a `beforeTs` (estritamente < beforeTs).
// Necessária para medir o incremento da 1ª amostra dentro da janela, que
// de outra forma seria perdido em `computeRain`.
function fetchPrevSample(key, beforeTs) {
    const url = telemetryUrl(key, 0, beforeTs - 1, "limit=1&orderBy=DESC");

    return httpGetJson(url).then(function (response) {
        const arr = (response && response[key]) || [];

        if (!arr.length) {
            return null;
        }

        const ts = Number(arr[0].ts);
        const value = Number(arr[0].value);

        if (!Number.isFinite(ts) || !Number.isFinite(value)) {
            return null;
        }

        return { ts: ts, value: value };
    });
}

// ============================================================
// PICOS DE VENTO (>= 24 h de separação)
// ------------------------------------------------------------
// Interpretação adotada: os picos são escolhidos por valor
// decrescente; um candidato só é aceito se estiver a >= 24 h de
// todos os já aceitos. Efeito documentado: um episódio com mais
// de 24 h de duração pode fornecer dois picos distintos.
// ============================================================

function selectPeaks(points, minGapMs, topN) {
    const byValue = points.slice().sort(function (a, b) {
        return (b.value - a.value) || (a.ts - b.ts);
    });

    const chosen = [];

    for (let i = 0; i < byValue.length && chosen.length < topN; i++) {
        const p = byValue[i];
        let ok = true;

        for (let j = 0; j < chosen.length; j++) {
            if (Math.abs(chosen[j].ts - p.ts) < minGapMs) {
                ok = false;
                break;
            }
        }

        if (ok) {
            chosen.push(p);
        }
    }

    return chosen.sort(function (a, b) {
        return (b.value - a.value) || (a.ts - b.ts);
    });
}

// ============================================================
// EXTREMOS DE TEMPERATURA (máximas / mínimas)
// ------------------------------------------------------------
// Classificação EXCLUSIVA por temperature_out. feels_like_out é apenas
// complementar (exibida como "ST" no instante do extremo) e NÃO participa
// da classificação.
//
// Critério de "ocorrência distinta" (temperature_out):
//   • amostras CONSECUTIVAS (intervalo <= GAP_TOLERANCE_MS) com o MESMO
//     valor exibido (0,1 °C) formam um único patamar = UMA ocorrência,
//     datada na 1ª amostra. Um intervalo maior separa patamares.
//   • O MESMO valor PODE reaparecer em OUTRA ocorrência temporal.
//   • Máximas ordenadas por temperatura DECRESCENTE; mínimas CRESCENTE;
//     empate -> horário MAIS ANTIGO. Não se inventam valores/horários.
//
// Seleção: separação temporal mínima de TEMP_MIN_GAP_MS (24 h) aplicada
// SEPARADAMENTE a máximas e a mínimas — mesmo princípio dos picos de vento,
// porém sobre as OCORRÊNCIAS. (Não reutiliza `selectPeaks`: ele ordena
// apenas de forma decrescente e não trata mínimas.) Mostra até `topN`
// ocorrências e NÃO preenche posições inexistentes.
// Janela [startTs, endTs): início inclusivo, fim exclusivo.
// ============================================================

// Valor de sensação térmica no MESMO instante `ts`:
//   • amostra exata -> esse valor;
//   • senão, a amostra mais próxima dentro de `tolMs`;
//   • senão null (o render exibe "ST —").
function feelsAtInstant(feelsTs, feelsByTs, ts, tolMs) {
    if (feelsByTs.has(ts)) {
        return feelsByTs.get(ts);
    }
    if (!feelsTs.length) {
        return null;
    }

    let lo = 0;
    let hi = feelsTs.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (feelsTs[mid] < ts) { lo = mid + 1; } else { hi = mid - 1; }
    }

    let best = null;
    let bestDiff = Infinity;

    [lo, lo - 1].forEach(function (idx) {
        if (idx < 0 || idx >= feelsTs.length) { return; }
        const diff = Math.abs(feelsTs[idx] - ts);
        if (diff < bestDiff) { bestDiff = diff; best = feelsTs[idx]; }
    });

    return (best != null && bestDiff <= tolMs) ? feelsByTs.get(best) : null;
}

function selectTempExtremes(tempPoints, feelsPoints, topN, minGapMs, startTs, endTs) {
    const n = topN || TEMP_TOP_N;
    const gap = minGapMs || TEMP_MIN_GAP_MS;

    // 1) Ocorrências de temperature_out (patamares de 0,1 °C).
    const inWin = tempPoints.filter(function (p) {
        return (startTs == null || p.ts >= startTs) &&
            (endTs == null || p.ts < endTs);
    }).sort(function (a, b) { return a.ts - b.ts; });

    const occ = [];
    let prevTs = null;

    inWin.forEach(function (p) {
        const v = Math.round(p.value * 10) / 10;
        const last = occ[occ.length - 1];
        const adjacent = prevTs != null && (p.ts - prevTs) <= GAP_TOLERANCE_MS;

        if (!(last && last.value === v && adjacent)) {
            occ.push({ ts: p.ts, value: v });
        }

        prevTs = p.ts;
    });

    // 2) Sensação térmica no mesmo instante (exata ou dentro da tolerância).
    const feelsByTs = new Map();
    const feelsTs = [];

    (feelsPoints || []).forEach(function (p) {
        if (!feelsByTs.has(p.ts)) {
            feelsByTs.set(p.ts, Math.round(p.value * 10) / 10);
            feelsTs.push(p.ts);
        }
    });

    feelsTs.sort(function (a, b) { return a - b; });

    occ.forEach(function (o) {
        o.st = feelsAtInstant(feelsTs, feelsByTs, o.ts, TEMP_ST_TOLERANCE_MS);
    });

    // 3) Seleção com separação temporal (mesmo princípio dos picos de vento).
    function select(sortedOcc) {
        const chosen = [];

        for (let i = 0; i < sortedOcc.length && chosen.length < n; i++) {
            const c = sortedOcc[i];
            let ok = true;

            for (let j = 0; j < chosen.length; j++) {
                if (Math.abs(chosen[j].ts - c.ts) < gap) { ok = false; break; }
            }

            if (ok) { chosen.push(c); }
        }

        return chosen;
    }

    const maxs = select(occ.slice().sort(function (a, b) {
        return (b.value - a.value) || (a.ts - b.ts);
    }));

    const mins = select(occ.slice().sort(function (a, b) {
        return (a.value - b.value) || (a.ts - b.ts);
    }));

    return { maxs: maxs, mins: mins, count: occ.length };
}

// Espalha os candidatos a pico pela janela. Aplica aos buckets agregados o
// MESMO critério de separação mínima usado no ranking final, de modo que a
// seleção não fique concentrada em um único episódio de vento e cubra toda
// a janela. A escolha continua sendo pelos maiores valores.
function selectSpreadCandidates(buckets, minGapMs, maxCount) {
    const sorted = buckets.slice().sort(function (a, b) {
        return (b.value - a.value) || (a.ts - b.ts);
    });

    const chosen = [];

    for (let i = 0; i < sorted.length && chosen.length < maxCount; i++) {
        const b = sorted[i];
        let ok = true;

        for (let j = 0; j < chosen.length; j++) {
            if (Math.abs(chosen[j].ts - b.ts) < minGapMs) {
                ok = false;
                break;
            }
        }

        if (ok) {
            chosen.push(b);
        }
    }

    return chosen;
}

// Intervalo de agregação adaptativo: o menor múltiplo de 1 h que faça a
// janela caber em AGG_MAX_INTERVALS * AGG_MAX_REQUESTS buckets, respeitando
// o limite de intervalos por consulta e o teto de sub-consultas.
function chooseAggInterval(windowMs) {
    const maxBuckets = AGG_MAX_INTERVALS * AGG_MAX_REQUESTS;
    const hours = Math.ceil(windowMs / COARSE_INTERVAL_MS);

    if (hours <= maxBuckets) {
        return COARSE_INTERVAL_MS;
    }

    return Math.ceil(hours / maxBuckets) * COARSE_INTERVAL_MS;
}

// Divide [startTs, endTs) em sub-janelas CONTÍGUAS com, no máximo,
// maxIntervals intervalos cada. `capped` indica que o teto de sub-consultas
// foi atingido e a cobertura temporal ficaria incompleta.
function planAggWindows(startTs, endTs, interval, maxIntervals, maxRequests) {
    const span = Math.max(1, interval) * Math.max(1, maxIntervals);
    const windows = [];
    let cursor = startTs;
    let capped = false;

    while (cursor < endTs) {
        if (windows.length >= maxRequests) {
            capped = true;
            break;
        }

        const end = Math.min(endTs, cursor + span);
        windows.push({ start: cursor, end: end });
        cursor = end;
    }

    return { windows: windows, capped: capped };
}

// Deduplica buckets por timestamp mantendo o MAIOR valor (agregação MAX).
function dedupeTsKeepMax(points) {
    const map = new Map();

    points.forEach(function (p) {
        const cur = map.get(p.ts);

        if (cur === undefined || p.value > cur.value) {
            map.set(p.ts, p);
        }
    });

    return Array.from(map.values()).sort(function (a, b) { return a.ts - b.ts; });
}

// Leitura agregada paginada de UMA sub-janela. A paginação evita perder
// buckets quando a resposta atinge o limite de linhas.
function fetchAggPaged(key, startTs, endTs, interval, agg, pageLimit) {
    const limit = pageLimit || AGG_PAGE_LIMIT;
    const collected = [];
    let cursor = startTs;
    let page = 0;
    let capped = false;

    function next() {
        if (page >= 400) {              // guarda contra laço infinito
            capped = true;
            return Promise.resolve();
        }

        return fetchAgg(key, cursor, endTs, interval, agg, limit)
            .then(function (buckets) {
                if (!buckets.length) {
                    return;
                }

                buckets.forEach(function (b) {
                    if (b.ts >= startTs && b.ts <= endTs) {
                        collected.push(b);
                    }
                });

                page++;

                const last = buckets[buckets.length - 1].ts;

                if (buckets.length < limit || last >= endTs) {
                    return;
                }

                if (last + 1 <= cursor) { // sem progresso
                    capped = true;
                    return;
                }

                cursor = last + 1;
                return next();
            });
    }

    return next().then(function () {
        return { buckets: dedupeTsKeepMax(collected), capped: capped };
    });
}

// Consolida TODOS os buckets de [startTs, endTs) para uma chave, dividindo
// a janela em sub-janelas (limite de intervalos da API). Não trunca a
// cobertura em silêncio: se a API rejeitar, se uma página não avançar ou se
// o teto de sub-consultas for atingido, devolve capped=true.
function fetchAggWindow(key, startTs, endTs, interval, agg, maxRequests) {
    const plan = planAggWindows(startTs, endTs, interval,
        AGG_MAX_INTERVALS, maxRequests || AGG_MAX_REQUESTS);
    const all = [];
    let capped = plan.capped;

    function step(i) {
        if (i >= plan.windows.length) {
            return Promise.resolve();
        }

        const w = plan.windows[i];

        return fetchAggPaged(key, w.start, w.end, interval, agg)
            .then(function (r) {
                r.buckets.forEach(function (b) { all.push(b); });

                if (r.capped) {
                    capped = true;      // cobertura desta sub-janela incompleta
                    return;
                }

                return step(i + 1);
            })
            .catch(function () {
                // Rejeição da API (ex.: limite de intervalos): preserva o
                // que já foi obtido e sinaliza que a resposta é incompleta.
                capped = true;
            });
    }

    return step(0).then(function () {
        return { buckets: dedupeTsKeepMax(all), capped: capped };
    });
}

// Seleciona os picos de uma chave dentro de [startTs, endTs].
//   1) Leitura crua quando o volume cabe no teto -> exata.
//   2) Caso contrário: agregação MAX sobre a janela COMPLETA (dividida em
//      sub-janelas), candidatos ESPALHADOS (>= 24 h) e REFINO cru em
//      [bucket - i, bucket + 2i) — a semântica do timestamp do bucket não
//      é assumida (cobre início ou fim de bucket).
// Devolve { peaks, method, limited }.
function findTopPeaks(key, startTs, endTs, log) {
    // Estimativa de amostras (cadência medida ~60 s). Se a janela
    // inteira caber no teto de leitura crua, calcula de forma exata;
    // caso contrário usa a agregação sobre a janela COMPLETA.
    const estimate = Math.ceil((endTs - startTs) / 60000);
    const rawFits = estimate <= RAW_MAX_PAGES * RAW_PAGE_LIMIT * 0.8;

    function finalize(points, method, limited) {
        return {
            peaks: selectPeaks(points, PEAK_MIN_GAP_MS, PEAK_TOP_N),
            method: method,
            limited: !!limited
        };
    }

    function aggregatedPath() {
        const interval = chooseAggInterval(endTs - startTs);

        log("Agregação (candidatos) para " + key + " — intervalo " +
            (interval / COARSE_INTERVAL_MS) + " h, janela dividida");

        return fetchAggWindow(key, startTs, endTs, interval, "MAX", AGG_MAX_REQUESTS)
            .then(function (agg) {
                const candidates = selectSpreadCandidates(
                    agg.buckets, PEAK_MIN_GAP_MS, COARSE_TOP_K);

                if (!candidates.length) {
                    return finalize([], "aggregated", agg.capped);
                }

                const jobs = candidates.map(function (b) {
                    return fetchRaw(key,
                        Math.max(startTs, b.ts - interval),
                        Math.min(endTs, b.ts + 2 * interval),
                        RAW_REFINE_PAGES).then(function (r) { return r.points; });
                });

                return Promise.all(jobs).then(function (lists) {
                    const all = [];

                    lists.forEach(function (pts) {
                        pts.forEach(function (p) { all.push(p); });
                    });

                    return finalize(dedupeSortAsc(all), "aggregated", agg.capped);
                });
            });
    }

    if (!rawFits) {
        return aggregatedPath();
    }

    return fetchRaw(key, startTs, endTs).then(function (raw) {
        if (raw.capped) {
            return aggregatedPath();
        }
        return finalize(raw.points, "raw", false);
    });
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================

function setText(id, value) {
    const el = container.querySelector("#" + id);
    if (el) { el.textContent = value; }
}

function setHtml(id, value) {
    const el = container.querySelector("#" + id);
    if (el) { el.innerHTML = value; }
}

function timeHm(ts) {
    const p = siteParts(ts);
    return pad2(p.h) + ":" + pad2(p.mi);
}

function renderWind(prefix, result) {
    const peaks = result.peaks;

    if (!peaks.length) {
        setText(prefix + "Peak", "---");
        setText(prefix + "PeakWhen", "Sem dados no período");
        setHtml(prefix + "Rest", "");
        return;
    }

    setText(prefix + "Peak", format1(peaks[0].value));
    setText(prefix + "PeakWhen", formatDateTime(peaks[0].ts));

    let html = "";

    for (let i = 1; i < peaks.length; i++) {
        html +=
            '<div class="peak-row">' +
            '<span class="peak-pos">' + (i + 1) + 'º</span>' +
            '<span class="peak-v">' + format1(peaks[i].value) + ' km/h</span>' +
            '<span class="peak-t">' + formatDayShort(peaks[i].ts) + " " +
            timeHm(peaks[i].ts) + '</span>' +
            "</div>";
    }

    if (!html) {
        html = '<div class="peak-empty">Sem 2º/3º pico distinto (≥ 24 h).</div>';
    }

    setHtml(prefix + "Rest", html);
}

// Um bloco de extremos (Máximas ou Mínimas): até 3 ocorrências.
//   • 1ª ocorrência: ordinal acima (fonte pequena) e temperatura com a MESMA
//     escala do bloco VENTO (valor grande + unidade menor), seguida da
//     sensação térmica (ST) e da data/hora.
//   • Demais: linha compacta (ordinal, temperatura e ST) e data/hora abaixo.
function renderTempItems(items, variant) {
    if (!items.length) {
        return '<div class="temp-empty">sem dados</div>';
    }

    let html = "";

    items.forEach(function (it, i) {
        const stText = (it.st == null)
            ? "ST —"
            : "ST " + format1(it.st) + " °C";
        const stCls = (it.st == null) ? " temp-st--none" : "";
        const when = formatDayShort(it.ts) + " " + timeHm(it.ts);
        const cat = "temp-item--" + variant;

        if (i === 0) {
            html +=
                '<div class="temp-item ' + cat + ' temp-item--top">' +
                '<div class="temp-top-pos">1ª</div>' +
                '<div class="temp-line temp-line--top">' +
                '<span class="temp-v">' + format1(it.value) + "</span>" +
                '<span class="temp-unit">°C</span>' +
                "</div>" +
                '<div class="temp-st temp-st--top' + stCls + '">' +
                stText + "</div>" +
                '<div class="temp-when">' + when + "</div>" +
                "</div>";
            return;
        }

        html +=
            '<div class="temp-item ' + cat + ' temp-item--rest">' +
            '<div class="temp-line">' +
            '<span class="temp-pos">' + (i + 1) + "ª</span>" +
            '<span class="temp-v">' + format1(it.value) + ' °C</span>' +
            '<span class="temp-st' + stCls + '">' + stText + "</span>" +
            "</div>" +
            '<div class="temp-when">' + when + "</div>" +
            "</div>";
    });

    return html;
}

function renderTemperature(extremes) {
    setHtml("tempMin", renderTempItems(extremes.mins, "min"));
    setHtml("tempMax", renderTempItems(extremes.maxs, "max"));
}

function renderRankBlock(title, items, labelFn) {
    if (!items.length) {
        return '<div class="rank-block">' +
            '<div class="rank-title">' + title + "</div>" +
            '<div class="rank-empty">sem chuva</div></div>';
    }

    let rows = "";

    items.forEach(function (it, i) {
        rows +=
            '<div class="rank-row">' +
            '<span class="rank-pos">' + (i + 1) + 'º</span>' +
            '<span class="rank-name">' + labelFn(it) + "</span>" +
            '<span class="rank-v">' + format1(it.mm) + " mm" +
            (it.uncertain ? ' <span class="unc">≈</span>' : "") +
            "</span></div>";
    });

    return '<div class="rank-block">' +
        '<div class="rank-title">' + title + "</div>" + rows + "</div>";
}

// Estatística do período: total de dias do calendário do Sítio abrangidos
// pela janela e quantos tiveram chuva (total diário > 0). Reaproveita os
// totais diários já calculados por `computeRain` (nenhuma segunda
// acumulação). Um dia com 0 mm mas INCERTO (queda do contador ou fronteira
// inicial) simplesmente não é contado como chuvoso.
function summarizeRainDays(rainDays, totalDays) {
    let rainyDays = 0;

    rainDays.forEach(function (d) {
        if (d.mm > 0) {
            rainyDays++;
        }
    });

    return {
        totalDays: totalDays,
        rainyDays: rainyDays
    };
}

function renderRain(rain, rankings, units, capped) {
    setText("rainTotal", format1(rain.total));

    // Linha do período (substitui a antiga contagem de lacunas de coleta).
    // O denominador vem do PERÍODO abrangido (countCalendarUnits), não da
    // quantidade de dias com amostras no ThingsBoard. Ajustes do contador e
    // marcas de incerteza NÃO são exibidos nesta linha.
    const stats = summarizeRainDays(rain.days, units.days);

    let note = "Período: " + stats.totalDays +
        (stats.totalDays === 1 ? " dia" : " dias") +
        " · Dias com chuva: " + stats.rainyDays;

    if (capped) {
        note += " Leitura limitada pelo volume de histórico; total parcial.";
    }

    setText("rainTotalNote", note);

    const blocks = [];

    if (units.days >= 2) {
        blocks.push(["Dias", rankings.days, function (it) {
            return formatDayShort(it.key);
        }]);
    }

    if (units.weeks >= 2) {
        blocks.push(["Semanas", rankings.weeks, function (it) {
            return formatWeekLabel(it.key, addSiteDays(it.key, 7));
        }]);
    }

    if (units.months >= 2) {
        blocks.push(["Meses", rankings.months, function (it) {
            return formatMonthLabel(it.key);
        }]);
    }

    // Não criar rankings vazios: só blocos elegíveis COM chuva.
    const filled = blocks.filter(function (b) { return b[1].length; });
    let html = "";

    if (!filled.length) {
        html = '<div class="rank-empty">' +
            (rain.total > 0 ? "Sem dados para comparação no período." : "Sem chuva no período.") +
            "</div>";
    } else {
        filled.forEach(function (b) {
            html += renderRankBlock(b[0], b[1], b[2]);
        });
    }

    setHtml("rainRankings", html);
}

function renderEmpty(message) {
    renderWind("windSpeed", { peaks: [], method: "none" });
    renderWind("windGust", { peaks: [], method: "none" });
    setText("windNote", "");
    renderTemperature({ maxs: [], mins: [] });
    setText("tempNote", "");
    setText("rainTotal", "---");
    setText("rainTotalNote", "");
    setHtml("rainRankings",
        '<div class="rank-empty">' + (message || "Sem dados no período.") + "</div>");
}

// ============================================================
// ORQUESTRAÇÃO
// ============================================================

let currentPeriod = "ultimas24h";
let reloadToken = 0;
let lastUpdateTs = null;
let lastAutoReload = 0;
const AUTO_RELOAD_MIN_MS = 60000;

function log(msg) {
    if (typeof console !== "undefined" && console.log) {
        console.log("[Monitemps] " + msg);
    }
}

function setBusy(busy) {
    const btn = container.querySelector("#refreshButton");
    if (btn) { btn.disabled = !!busy; }
}

// Resolve o início da janela. Para "Desde o início", usa a primeira
// amostra disponível (não se pode usar startTs=0 com intervalos).
function resolveWindow(now) {
    const spec = computeWindow(currentPeriod, now);

    if (!spec.desdeInicio) {
        return Promise.resolve(spec);
    }

    return fetchFirstTs("rain_total", spec.end).then(function (ts) {
        if (ts == null) {
            return null;
        }
        return { start: ts, end: spec.end, liveEnd: spec.liveEnd, desdeInicio: true };
    });
}

function updateLastUpdate(points) {
    let ts = null;

    if (points && points.length) {
        ts = points[points.length - 1].ts;
    }

    lastUpdateTs = ts;

    const el = container.querySelector("#lastUpdate");

    if (el) {
        el.textContent = ts
            ? "Dados: " + formatDateTime(ts)
            : "Dados: --/--- --:--";
    }
}

function reload() {
    const token = ++reloadToken;
    setBusy(true);

    const now = Date.now();

    resolveWindow(now).then(function (spec) {
        if (!spec || spec.start == null) {
            if (token === reloadToken) {
                renderEmpty("Sem dados no período.");
            }
            return;
        }

        const start = spec.start;
        const end = spec.end;

        const tempJobs = [
            fetchRaw(TEMP_KEY, start, end),
            fetchRaw(TEMP_FEELS_KEY, start, end)
        ];

        return Promise.all([
            findTopPeaks("wind_speed", start, end, log),
            findTopPeaks("wind_gust", start, end, log),
            fetchRaw("rain_total", start, end),
            fetchPrevSample("rain_total", start)
        ].concat(tempJobs)).then(function (res) {
            if (token !== reloadToken) {
                return;
            }

            renderWind("windSpeed", res[0]);
            renderWind("windGust", res[1]);

            const windLimited = res[0].limited || res[1].limited;

            setText("windNote", windLimited
                ? "Leitura limitada pelo volume de histórico; a lista " +
                  "de picos pode estar incompleta."
                : "");

            // Temperatura (classificação por temperature_out; feels_like_out
            // entra apenas como "ST" no instante de cada extremo).
            const tempRaw = res[4];
            const feelsRaw = res[5];

            renderTemperature(selectTempExtremes(tempRaw.points,
                feelsRaw.points, TEMP_TOP_N, TEMP_MIN_GAP_MS, start, end));

            setText("tempNote", (tempRaw.capped || feelsRaw.capped)
                ? "Leitura limitada pelo volume de histórico; os extremos " +
                  "podem estar incompletos."
                : "");

            // A amostra anterior ao início evita perder o incremento da
            // fronteira inicial (marcado como incerto quando não separável).
            const rain = computeRain(res[2].points, start, end, res[3]);
            const rankings = buildRainRankings(rain.days);
            const units = countCalendarUnits(start, end);

            renderRain(rain, rankings, units, res[2].capped);
            updateLastUpdate(res[2].points);
        });
    }).catch(function (err) {
        if (token !== reloadToken) {
            return;
        }
        console.error("Monitemps: falha ao carregar histórico.", err);
        renderEmpty("Não foi possível carregar o histórico.");
    }).then(function () {
        if (token === reloadToken) {
            setBusy(false);
        }
    });
}

// ============================================================
// CHUVA — INCREMENTOS DO CONTADOR (WH40H)
// ------------------------------------------------------------
// Método: a partir da série CRUA de rain_total (crescente), cada
// amostra gera um incremento em relação à anterior.
//   • delta >= 0 -> incremento real, atribuído ao dia local da
//     amostra em que o aumento foi OBSERVADO;
//   • delta < 0  -> REINICIALIZAÇÃO do contador: não é chuva
//     (a queda é ignorada) e o dia é marcado como incerto;
//   • reinício do contador: o incremento NÃO é redistribuído; ele é
//     contabilizado no instante observado e TODOS os dias que o intervalo
//     atravessa ficam marcados como incertos;
//   • fronteira inicial: a 1ª amostra da janela é medida em relação à
//     amostra imediatamente anterior (prevPoint). Se ela não coincidir com
//     startTs, esse incremento cruza a fronteira e não é separável -> é
//     contabilizado, mas os dias tocados ficam incertos (não exato).
// O total recuperável é preservado; nada é estimado como exato.
// ============================================================

function computeRain(points, startTs, endTs, prevPoint) {
    const dayMap = new Map();
    let resetCount = 0;

    function dayEntry(dayStart) {
        if (!dayMap.has(dayStart)) {
            dayMap.set(dayStart, { dayStart: dayStart, mm: 0, uncertain: false });
        }
        return dayMap.get(dayStart);
    }

    // Marca como incertos TODOS os dias de calendário tocados por
    // [fromTs, toTs]. O incremento observado no fim de um reinício do
    // contador pode ter ocorrido em qualquer dia do intervalo;
    // a incerteza é propagada a todos eles. O incremento NÃO é redistribuído.
    function markRangeUncertain(fromTs, toTs) {
        let d = startOfSiteDay(fromTs);
        const last = startOfSiteDay(toTs);

        while (d <= last) {
            dayEntry(d).uncertain = true;
            d = addSiteDays(d, 1);
        }
    }

    // Fronteira inicial. A leitura crua começa em startTs, mas cada
    // incremento é medido a partir da amostra anterior; sem tratar isso, o
    // incremento da 1ª amostra da janela seria perdido (prevPoint é a
    // amostra imediatamente anterior a startTs).
    //   • 1ª amostra exatamente em startTs -> fronteira EXATA: a amostra é a
    //     própria linha de base e o incremento anterior à janela não entra;
    //   • 1ª amostra DEPOIS de startTs -> o incremento (prevPoint -> 1ª)
    //     atravessa a fronteira e NÃO é separável. Ele é contabilizado
    //     (preserva o total recuperável) e os dias tocados ficam INCERTOS;
    //   • sem prevPoint -> nada existia antes da janela; nada se perde.
    if (points.length) {
        const first = points[0];

        if (prevPoint && first.ts > startTs && first.ts < endTs) {
            const bDelta = first.value - prevPoint.value;

            if (bDelta < 0) {
                resetCount++;
                markRangeUncertain(prevPoint.ts, first.ts);
            } else if (bDelta > 0) {
                dayEntry(startOfSiteDay(first.ts)).mm += bDelta;
                markRangeUncertain(prevPoint.ts, first.ts);
            }
        }
    }

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];

        // Fim exclusivo: só incrementos observados dentro da janela.
        if (cur.ts < startTs || cur.ts >= endTs) {
            continue;
        }

        const delta = cur.value - prev.value;

        if (delta < 0) {
            // Queda do contador (reinicialização ou ajuste). Não é chuva:
            // o acumulado anterior é PRESERVADO (nada é subtraído) e todos
            // os dias que o contador poderia ter percorrido ficam incertos.
            resetCount++;
            markRangeUncertain(prev.ts, cur.ts);
            continue;
        }

        if (delta === 0) {
            continue;
        }

        dayEntry(startOfSiteDay(cur.ts)).mm += delta;
    }

    const days = Array.from(dayMap.values()).map(function (d) {
        d.mm = Math.round(d.mm * 100) / 100;
        return d;
    }).sort(function (a, b) { return a.dayStart - b.dayStart; });

    let total = 0;
    days.forEach(function (d) { total += d.mm; });

    return {
        total: Math.round(total * 100) / 100,
        days: days,
        resetCount: resetCount
    };
}

// Agrupa os dias por semana / mês (calendário do Sítio) e devolve
// até 3 unidades de cada tipo, das mais chuvosas para as menos.
// Somente unidades com chuva > 0 entram no ranking.
function buildRainRankings(days) {
    const weekMap = new Map();
    const monthMap = new Map();

    function add(map, key, mm, uncertain) {
        if (!map.has(key)) {
            map.set(key, { key: key, mm: 0, uncertain: false });
        }
        const e = map.get(key);
        e.mm += mm;
        e.uncertain = e.uncertain || uncertain;
    }

    days.forEach(function (d) {
        // A incerteza propaga MESMO para dias abaixo do limite de exibição:
        // nenhuma semana/mês potencialmente incerto pode aparecer como exato.
        // O valor, porém, só é somado quando o dia é exibível.
        const shown = d.mm >= RAIN_MIN_MM ? d.mm : 0;

        add(weekMap, startOfSiteWeek(d.dayStart), shown, d.uncertain);
        add(monthMap, startOfSiteMonth(d.dayStart), shown, d.uncertain);
    });

    function top(map) {
        return Array.from(map.values()).map(function (e) {
            e.mm = Math.round(e.mm * 100) / 100;
            return e;
        }).filter(function (e) { return e.mm >= RAIN_MIN_MM; })
            .sort(function (a, b) { return (b.mm - a.mm) || (a.key - b.key); })
            .slice(0, PEAK_TOP_N);
    }

    return {
        days: days.filter(function (d) { return d.mm >= RAIN_MIN_MM; })
            .map(function (d) { return { key: d.dayStart, mm: d.mm, uncertain: d.uncertain }; })
            .sort(function (a, b) { return (b.mm - a.mm) || (a.key - b.key); })
            .slice(0, PEAK_TOP_N),
        weeks: top(weekMap),
        months: top(monthMap)
    };
}

// Quantas unidades de calendário a janela [startTs, endTs) cobre.
function countCalendarUnits(startTs, endTs) {
    const last = endTs - 1;

    const days = Math.round(
        (startOfSiteDay(last) - startOfSiteDay(startTs)) / 86400000) + 1;

    const weeks = Math.round(
        (startOfSiteWeek(last) - startOfSiteWeek(startTs)) / (7 * 86400000)) + 1;

    let months = 0;
    let m = startOfSiteMonth(startTs);
    const mLast = startOfSiteMonth(last);

    while (m <= mLast) {
        months++;
        m = addSiteMonths(m, 1);
    }

    return { days: days, weeks: weeks, months: months };
}

// ============================================================
// CONTROLES, SUBSCRIPTION E INICIALIZAÇÃO
// ============================================================

function setupControls() {
    const sel = container.querySelector("#periodSelect");

    if (!sel) {
        return;
    }

    if (sel.value) {
        currentPeriod = sel.value;
    }

    sel.addEventListener("change", function () {
        if (sel.value) {
            currentPeriod = sel.value;
        }
        reload();
    });
}

// Assinatura "latest": apenas dispara uma recarga leve (no máximo a
// cada 60 s) quando o período termina em "agora". Não é fonte de
// histórico.
function startSubscription() {
    if (!ctx.subscriptionApi) {
        return;
    }

    const options = {
        type: "latest",
        datasources: [{
            type: "entity",
            entityFilter: {
                type: "singleEntity",
                singleEntity: { entityType: "DEVICE", id: DEVICE_ECOWITT }
            },
            dataKeys: ["rain_total", "wind_speed", "wind_gust"].map(function (name) {
                return { type: "timeseries", name: name, settings: {} };
            })
        }],
        callbacks: {
            onDataUpdated: function () {
                const spec = computeWindow(currentPeriod, Date.now());

                if (!spec.liveEnd) {
                    return;
                }

                const now = Date.now();

                if (now - lastAutoReload < AUTO_RELOAD_MIN_MS) {
                    return;
                }

                lastAutoReload = now;
                reload();
            }
        }
    };

    ctx.subscriptionApi.createSubscription(options, true).subscribe(function (sub) {
        ctx.defaultSubscription = sub;
    });
}

function setupHelp() {
    const helpButton = container.querySelector("#helpButton");
    const helpOverlay = container.querySelector("#helpOverlay");
    const helpClose = container.querySelector("#helpClose");

    if (helpButton && helpOverlay) {
        helpButton.addEventListener("click", function () {
            helpOverlay.hidden = false;
        });
    }

    if (helpClose && helpOverlay) {
        helpClose.addEventListener("click", function () {
            helpOverlay.hidden = true;
        });
    }

    if (helpOverlay) {
        helpOverlay.addEventListener("click", function (event) {
            if (event.target === helpOverlay) {
                helpOverlay.hidden = true;
            }
        });
    }

    if (typeof document !== "undefined") {
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && helpOverlay && !helpOverlay.hidden) {
                helpOverlay.hidden = true;
            }
        });
    }
}

function setupRefresh() {
    const refreshButton = container.querySelector("#refreshButton");

    if (refreshButton) {
        refreshButton.addEventListener("click", function () {
            reload();
        });
    }
}

if (ctx.registerDestroyCallback) {
    ctx.registerDestroyCallback(function () {
        reloadToken++;      // invalida cargas em andamento
    });
}

setupControls();
setupHelp();
setupRefresh();
startSubscription();
updateLayoutClass();

if (typeof window !== "undefined") {
    window.addEventListener("resize", updateLayoutClass);
}

if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(updateLayoutClass).observe(container);
}

reload();

