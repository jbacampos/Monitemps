// ============================================================
// WIDGET SÍTIO — MÁXIMOS E TOTAIS METEOROLÓGICOS
// ------------------------------------------------------------
// Consulta o histórico do dispositivo Ecowitt (Sítio) no
// ThingsBoard e apresenta:
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

// Agregação grosseira (somente seleção de candidatos a pico).
const COARSE_INTERVAL_MS = 3600 * 1000; // 1 hora
const COARSE_TOP_K = 12;                // nº de buckets candidatos

// Lacuna de coleta: intervalo entre amostras acima disso torna a
// atribuição temporal incerta (não é redistribuída).
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

// Seleciona os picos de uma chave dentro de [startTs, endTs].
//   1) Leitura crua quando o volume cabe no teto -> exata.
//   2) Caso contrário: agregação MAX horária para escolher K
//      buckets candidatos e REFINO cru em
//      [bucket - 1h, bucket + 2h) — a semântica do timestamp do
//      bucket não é assumida (cobre início ou fim de bucket).
// Devolve { peaks, method }.
function findTopPeaks(key, startTs, endTs, log) {
    // Estimativa de amostras (cadência medida ~60 s). Se a janela
    // inteira caber no teto de leitura crua, calcula de forma
    // exata; caso contrário usa a agregação sobre a janela COMPLETA
    // (a paginação crua é do mais recente para o mais antigo e
    // poderia ignorar picos antigos).
    const estimate = Math.ceil((endTs - startTs) / 60000);
    const rawFits = estimate <= RAW_MAX_PAGES * RAW_PAGE_LIMIT * 0.8;

    function finalize(points, method) {
        return {
            peaks: selectPeaks(points, PEAK_MIN_GAP_MS, PEAK_TOP_N),
            method: method
        };
    }

    function aggregatedPath() {
        log("Agregação (seleção de candidatos) para " + key);

        return fetchAgg(key, startTs, endTs, COARSE_INTERVAL_MS, "MAX")
            .then(function (buckets) {
                const top = buckets.slice().sort(function (a, b) {
                    return (b.value - a.value) || (a.ts - b.ts);
                }).slice(0, COARSE_TOP_K);

                const jobs = top.map(function (b) {
                    return fetchRaw(key,
                        Math.max(startTs, b.ts - COARSE_INTERVAL_MS),
                        Math.min(endTs, b.ts + 2 * COARSE_INTERVAL_MS),
                        4).then(function (r) { return r.points; });
                });

                return Promise.all(jobs).then(function (lists) {
                    const all = [];

                    lists.forEach(function (pts) {
                        pts.forEach(function (p) { all.push(p); });
                    });

                    return finalize(dedupeSortAsc(all), "aggregated");
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
        return finalize(raw.points, "raw");
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

function renderRain(rain, rankings, units, capped) {
    setText("rainTotal", format1(rain.total));

    let note = "";

    if (capped) {
        note += "Leitura limitada pelo volume de histórico; total parcial. ";
    }
    if (rain.resetCount) {
        note += "Ajustes do contador (" + rain.resetCount + "×). ";
    }
    if (rain.gapCount) {
        note += rain.gapCount + " lacuna(s) de coleta. ";
    }

    setText("rainTotalNote", note ? note + "Marcas " + "\u2248" + " = incerto." : "");

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

        return Promise.all([
            findTopPeaks("wind_speed", start, end, log),
            findTopPeaks("wind_gust", start, end, log),
            fetchRaw("rain_total", start, end)
        ]).then(function (res) {
            if (token !== reloadToken) {
                return;
            }

            renderWind("windSpeed", res[0]);
            renderWind("windGust", res[1]);

            const rain = computeRain(res[2].points, start, end);
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
//   • lacuna (intervalo > GAP_TOLERANCE_MS): o incremento NÃO é
//     redistribuído; ele é contabilizado no instante observado e
//     os dias envolvidos são marcados como incertos.
// O total recuperável é preservado; nada é estimado como exato.
// ============================================================

function computeRain(points, startTs, endTs) {
    const dayMap = new Map();
    let resetCount = 0;
    let gapCount = 0;

    function dayEntry(dayStart) {
        if (!dayMap.has(dayStart)) {
            dayMap.set(dayStart, { dayStart: dayStart, mm: 0, uncertain: false });
        }
        return dayMap.get(dayStart);
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
            // Queda do contador (reinicialização ou ajuste). Não é
            // chuva: o acumulado anterior é PRESERVADO (nada é
            // subtraído). O dia é marcado como incerto porque não é
            // possível distinguir reinicialização de correção.
            resetCount++;
            dayEntry(startOfSiteDay(cur.ts)).uncertain = true;
            continue;
        }

        if (delta === 0) {
            continue;
        }

        if ((cur.ts - prev.ts) > GAP_TOLERANCE_MS) {
            gapCount++;
            dayEntry(startOfSiteDay(cur.ts)).uncertain = true;

            const prevDay = startOfSiteDay(prev.ts);

            if (prevDay !== startOfSiteDay(cur.ts)) {
                dayEntry(prevDay).uncertain = true;
            }
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
        resetCount: resetCount,
        gapCount: gapCount
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
        if (d.mm < RAIN_MIN_MM) {
            return;
        }
        add(weekMap, startOfSiteWeek(d.dayStart), d.mm, d.uncertain);
        add(monthMap, startOfSiteMonth(d.dayStart), d.mm, d.uncertain);
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

