// ============================================================
// TESTES (harness local — não faz parte do widget)
// ============================================================

var results = [];
var passedCount = 0;
var failedCount = 0;

function check(name, got, want) {
    var g = JSON.stringify(got);
    var w = JSON.stringify(want);
    var ok = g === w;

    results.push({ name: name, ok: ok, got: g, want: w });

    if (ok) { passedCount++; } else { failedCount++; }
}

function checkTrue(name, cond) {
    check(name, !!cond, true);
}

function S(str) {
    return Date.parse(str);
}

function pts(list) {
    return list.map(function (p) { return { ts: p[0], value: p[1] }; });
}

// ------------------------------------------------------------
// 1) JANELAS DE PERÍODO (13 opções) — fuso do Sítio (UTC-3)
// "Agora" fixo = 2026-10-07 20:35 -03 (quarta-feira)
// ------------------------------------------------------------
var NOW = S("2026-10-07T23:35:00Z");
var w;

w = computeWindow("ultimas24h", NOW);
check("periodo ultimas24h.start", w.start, NOW - 86400000);
check("periodo ultimas24h.end", w.end, NOW);
checkTrue("periodo ultimas24h.liveEnd", w.liveEnd);

w = computeWindow("ultimas48h", NOW);
check("periodo ultimas48h.start", w.start, NOW - 2 * 86400000);

w = computeWindow("ultimas72h", NOW);
check("periodo ultimas72h.start", w.start, NOW - 3 * 86400000);

w = computeWindow("ontem", NOW);
check("periodo ontem.start", w.start, S("2026-10-06T03:00:00Z"));
check("periodo ontem.end", w.end, S("2026-10-07T03:00:00Z"));

w = computeWindow("anteontem", NOW);
check("periodo anteontem.start", w.start, S("2026-10-05T03:00:00Z"));
check("periodo anteontem.end", w.end, S("2026-10-06T03:00:00Z"));

w = computeWindow("ultimos7dias", NOW);
check("periodo ultimos7dias.start", w.start, S("2026-10-01T03:00:00Z"));
check("periodo ultimos7dias.end", w.end, NOW);

w = computeWindow("semanaanterior", NOW);
check("periodo semanaanterior.start", w.start, S("2026-09-27T03:00:00Z"));
check("periodo semanaanterior.end", w.end, S("2026-10-04T03:00:00Z"));

w = computeWindow("mesatual", NOW);
check("periodo mesatual.start", w.start, S("2026-10-01T03:00:00Z"));
check("periodo mesatual.end", w.end, NOW);

w = computeWindow("mesanterior", NOW);
check("periodo mesanterior.start", w.start, S("2026-09-01T03:00:00Z"));
check("periodo mesanterior.end", w.end, S("2026-10-01T03:00:00Z"));

w = computeWindow("anoatual", NOW);
check("periodo anoatual.start", w.start, S("2026-01-01T03:00:00Z"));

w = computeWindow("anopassado", NOW);
check("periodo anopassado.start", w.start, S("2025-01-01T03:00:00Z"));
check("periodo anopassado.end", w.end, S("2026-01-01T03:00:00Z"));

w = computeWindow("anoretrasado", NOW);
check("periodo anoretrasado.start", w.start, S("2024-01-01T03:00:00Z"));
check("periodo anoretrasado.end", w.end, S("2025-01-01T03:00:00Z"));

w = computeWindow("desdeoinicio", NOW);
check("periodo desdeoinicio.start", w.start, null);
check("periodo desdeoinicio.end", w.end, NOW);
checkTrue("periodo desdeoinicio.desdeInicio", w.desdeInicio);

check("periodos: total de opções", PERIOD_IDS.length, 13);

// ------------------------------------------------------------
// 2) CALENDÁRIO DO SÍTIO (limites, virada de meia-noite, bissexto)
// ------------------------------------------------------------
check("startOfSiteDay(meia-noite-1ms)",
    startOfSiteDay(S("2026-10-07T02:59:59.999Z")), S("2026-10-06T03:00:00Z"));
check("startOfSiteDay(meia-noite exata)",
    startOfSiteDay(S("2026-10-07T03:00:00Z")), S("2026-10-07T03:00:00Z"));
check("startOfSiteWeek(quarta) domingo",
    startOfSiteWeek(S("2026-10-07T23:35:00Z")), S("2026-10-04T03:00:00Z"));
check("startOfSiteMonth", startOfSiteMonth(NOW), S("2026-10-01T03:00:00Z"));
check("startOfSiteYear", startOfSiteYear(NOW), S("2026-01-01T03:00:00Z"));
check("addSiteDays virada de mês",
    addSiteDays(S("2026-10-31T03:00:00Z"), 1), S("2026-11-01T03:00:00Z"));
check("addSiteMonths virada de ano",
    addSiteMonths(S("2026-01-01T03:00:00Z"), -1), S("2025-12-01T03:00:00Z"));
check("addSiteYears", addSiteYears(S("2026-01-01T03:00:00Z"), -2), S("2024-01-01T03:00:00Z"));
check("ano bissexto: countCalendarUnits dias",
    countCalendarUnits(S("2028-02-01T03:00:00Z"), S("2028-03-01T03:00:00Z")).days, 29);
check("countCalendarUnits ~6 meses (dias)", countCalendarUnits(
    S("2026-04-01T03:00:00Z"), S("2026-10-01T03:00:00Z")).days, 183);

// ------------------------------------------------------------
// 3) PICOS DE VENTO (separação mínima de 24 h)
// ------------------------------------------------------------
var H = 3600000;
var t0 = S("2026-10-01T00:00:00Z");

var cluster = [
    { ts: t0 + 0 * H, value: 10 },
    { ts: t0 + 1 * H, value: 50 },   // pico A
    { ts: t0 + 2 * H, value: 48 },   // mesmo episódio (< 24 h)
    { ts: t0 + 3 * H, value: 45 },   // mesmo episódio
    { ts: t0 + 30 * H, value: 40 },  // pico B
    { ts: t0 + 31 * H, value: 39 },  // mesmo episódio de B
    { ts: t0 + 60 * H, value: 35 },  // pico C
    { ts: t0 + 80 * H, value: 20 }   // < 24 h de C -> excluído
];

var pk = selectPeaks(cluster, 24 * H, 3);
check("picos: quantidade", pk.length, 3);
check("picos: 1o", pk[0].value, 50);
check("picos: 2o", pk[1].value, 40);
check("picos: 3o", pk[2].value, 35);
checkTrue("picos: 24h entre 1o e 2o", Math.abs(pk[0].ts - pk[1].ts) >= 24 * H);
checkTrue("picos: 24h entre 2o e 3o", Math.abs(pk[1].ts - pk[2].ts) >= 24 * H);

var pkFew = selectPeaks(pts([[t0, 60], [t0 + H, 70]]), 24 * H, 3);
check("picos: menos de 3 distintos", pkFew.length, 1);
check("picos: valor unico", pkFew[0].value, 70);

check("picos: exatamente 24h aceito",
    selectPeaks(pts([[t0, 50], [t0 + 24 * H, 40]]), 24 * H, 3).length, 2);
check("picos: 23h59 rejeitado",
    selectPeaks(pts([[t0, 50], [t0 + 24 * H - 60000, 40]]), 24 * H, 3).length, 1);
check("picos: episódio >24h gera 2",
    selectPeaks(pts([[t0, 80], [t0 + 25 * H, 60]]), 24 * H, 3).length, 2);

// ------------------------------------------------------------
// 4) CHUVA — incrementos do contador do WH40H
// ------------------------------------------------------------
var M = 60000;
var d1 = S("2026-10-01T03:00:00Z");   // 2026-10-01 00:00 -03

var rNorm = computeRain(pts([
    [d1 + 1438 * M, 100.0],           // 23:58 do dia 1
    [d1 + 1439 * M, 101.0],           // +1,0 (23:59, dia 1)
    [d1 + 1440 * M, 101.5],           // +0,5 (00:00, dia 2)
    [d1 + 1441 * M, 102.0]            // +0,5 (00:01, dia 2)
]), d1, d1 + 2 * 86400000);

check("chuva: total", rNorm.total, 2);
check("chuva: nº dias", rNorm.days.length, 2);
check("chuva: virada de meia-noite dia 1", rNorm.days[0].mm, 1);
check("chuva: virada de meia-noite dia 2", rNorm.days[1].mm, 1);
check("chuva: resetCount", rNorm.resetCount, 0);
check("chuva: gapCount", rNorm.gapCount, 0);

var rReset = computeRain(pts([
    [d1, 50.0],
    [d1 + M, 50.2],
    [d1 + 2 * M, 0.0],               // reinicialização
    [d1 + 3 * M, 0.5]
]), d1, d1 + 86400000);
check("chuva reset: total", rReset.total, 0.7);
check("chuva reset: resetCount", rReset.resetCount, 1);
checkTrue("chuva reset: dia incerto", rReset.days[0].uncertain);

// queda para patamar NÃO nulo (não distinguível de reinicialização):
// acumulado anterior preservado e dia marcado como incerto
var rDrop = computeRain(pts([
    [d1, 0.0],
    [d1 + M, 4.7],                   // +4,7
    [d1 + 2 * M, 1.5],               // queda de -3,2
    [d1 + 3 * M, 3.0]                // +1,5
]), d1, d1 + 86400000);
check("chuva queda: total preservado", rDrop.total, 6.2);
check("chuva queda: resetCount", rDrop.resetCount, 1);
checkTrue("chuva queda: dia incerto", rDrop.days[0].uncertain);

var rGap = computeRain(pts([
    [d1 + M, 10.0],
    [d1 + 3 * H, 12.0]               // lacuna de ~3 h
]), d1, d1 + 86400000);
check("chuva lacuna: total preservado", rGap.total, 2);
check("chuva lacuna: gapCount", rGap.gapCount, 1);
checkTrue("chuva lacuna: incerto", rGap.days[0].uncertain);

var rGapNight = computeRain(pts([
    [d1 + 1438 * M, 50.0],           // 23:58 dia 1
    [d1 + 1442 * M, 52.0]            // 00:02 dia 2 (+2 após lacuna de 4 min)
]), d1, d1 + 2 * 86400000);
check("chuva lacuna meia-noite: total", rGapNight.total, 2);
checkTrue("chuva lacuna meia-noite: dia 1 incerto", rGapNight.days[0].uncertain);
checkTrue("chuva lacuna meia-noite: dia 2 incerto", rGapNight.days[1].uncertain);

var dup = dedupeSortAsc(pts([[d1, 5], [d1, 7], [d1 + M, 9]]));
check("chuva duplicados: quantidade", dup.length, 2);
check("chuva duplicados: último vence", dup[0].value, 7);

var rEdge = computeRain(pts([
    [d1, 10.0],
    [d1 + 86400000, 20.0]
]), d1, d1 + 86400000);
check("chuva: fim exclusivo", rEdge.total, 0);

// ------------------------------------------------------------
// 5) RANKINGS (dias / semanas / meses) e condicionamento
// ------------------------------------------------------------
var dayList = [
    { dayStart: S("2026-09-21T03:00:00Z"), mm: 42.3, uncertain: false },
    { dayStart: S("2026-09-22T03:00:00Z"), mm: 0.5, uncertain: false },
    { dayStart: S("2026-09-27T03:00:00Z"), mm: 9.6, uncertain: false },
    { dayStart: S("2026-10-03T03:00:00Z"), mm: 31.1, uncertain: true },
    { dayStart: S("2026-10-04T03:00:00Z"), mm: 4.7, uncertain: false }
];

var rk = buildRainRankings(dayList);
check("ranking dias: 1º", rk.days[0].mm, 42.3);
check("ranking dias: 2º", rk.days[1].mm, 31.1);
check("ranking dias: 3º", rk.days[2].mm, 9.6);
checkTrue("ranking dias: incerto preservado", rk.days[1].uncertain);
check("ranking semanas: 1ª (20/09)", rk.weeks[0].mm, 42.8);
check("ranking semanas: 2ª (27/09)", rk.weeks[1].mm, 40.7);
check("ranking semanas: 3ª (04/10)", rk.weeks[2].mm, 4.7);
checkTrue("ranking semanas: incerto propagado", rk.weeks[1].uncertain);
check("ranking meses: setembro", rk.months[0].mm, 52.4);
check("ranking meses: outubro", rk.months[1].mm, 35.8);
check("ranking meses: quantidade", rk.months.length, 2);

check("gate 24h: dias", countCalendarUnits(NOW - 24 * H, NOW).days, 2);
check("gate 24h: semanas", countCalendarUnits(NOW - 24 * H, NOW).weeks, 1);
check("gate 6 meses: meses",
    countCalendarUnits(S("2026-04-01T03:00:00Z"), S("2026-10-01T03:00:00Z")).months, 6);

// ------------------------------------------------------------
// 6) DADOS REAIS (quando _realdata.js está presente)
// ------------------------------------------------------------
function dayKey(ts) {
    var p = siteParts(ts);
    return p.y + "-" + pad2(p.mo + 1) + "-" + pad2(p.d);
}

if (window.__REAL__) {
    var R = window.__REAL__;

    var wsPk = selectPeaks(pts(R.wind_speed), PEAK_MIN_GAP_MS, 3);
    check("real wind_speed: qtd", wsPk.length, 3);
    check("real wind_speed: 1o", Math.round(wsPk[0].value * 100) / 100, R.expect.windSpeed[0]);
    check("real wind_speed: 2o", Math.round(wsPk[1].value * 100) / 100, R.expect.windSpeed[1]);
    check("real wind_speed: 3o", Math.round(wsPk[2].value * 100) / 100, R.expect.windSpeed[2]);
    checkTrue("real wind_speed: separacao 24h",
        Math.abs(wsPk[0].ts - wsPk[1].ts) >= PEAK_MIN_GAP_MS &&
        Math.abs(wsPk[1].ts - wsPk[2].ts) >= PEAK_MIN_GAP_MS);

    var wgPk = selectPeaks(pts(R.wind_gust), PEAK_MIN_GAP_MS, 3);
    check("real wind_gust: 1o", Math.round(wgPk[0].value * 100) / 100, R.expect.windGust[0]);
    check("real wind_gust: 2o", Math.round(wgPk[1].value * 100) / 100, R.expect.windGust[1]);

    var rr = computeRain(pts(R.rain_total), R.rainStart, R.rainEnd);
    checkTrue("real chuva: reset detectado", rr.resetCount >= R.expect.minResets);
    checkTrue("real chuva: lacuna detectada", rr.gapCount >= R.expect.minGaps);

    var byDay = {};
    var uncertain = {};

    rr.days.forEach(function (d) {
        byDay[dayKey(d.dayStart)] = d.mm;
        if (d.uncertain) { uncertain[dayKey(d.dayStart)] = true; }
    });

    checkTrue("real chuva: 2026-09-27 marcado incerto (ajuste do contador)",
        !!uncertain["2026-09-27"]);

    Object.keys(R.expect.daily).forEach(function (k) {
        check("real chuva dia " + k, byDay[k], R.expect.daily[k]);
    });

    // Verificação cruzada: acumulado diário pelo contador (rain_total)
    // versus o acumulador diário do próprio pluviômetro (rain_day).
    if (R.rain_day) {
        var rdMax = {};

        pts(R.rain_day).forEach(function (p) {
            var k = dayKey(p.ts);
            if (rdMax[k] === undefined || p.value > rdMax[k]) {
                rdMax[k] = p.value;
            }
        });

        var maxDiff = 0;
        var worst = "";

        Object.keys(byDay).forEach(function (k) {
            // Dias com reinicialização/ajuste do contador não servem
            // para a verificação cruzada: o próprio rain_day também
            // reinicia e passa a subestimar o acumulado do dia.
            if (rdMax[k] === undefined || uncertain[k]) { return; }

            var df = Math.abs(byDay[k] - rdMax[k]);
            if (df > maxDiff) { maxDiff = df; worst = k; }
        });

        checkTrue("real chuva: contador x rain_day <= 0,2 mm (" + worst + " " +
            maxDiff.toFixed(2) + " mm)", maxDiff <= 0.2);
    }
}

// ------------------------------------------------------------
// Resultado
// ------------------------------------------------------------
document.getElementById("out").textContent =
    "PASS " + passedCount + " / FAIL " + failedCount +
    (window.__errors.length ? " / ERR " + window.__errors.length : "") + "\n" +
    results.filter(function (r) { return !r.ok; })
        .map(function (r) { return "FAIL " + r.name + " got=" + r.got + " want=" + r.want; })
        .join("\n") +
    (window.__errors.length ? "\nJS ERRORS: " + window.__errors.join("; ") : "");

try {
    navigator.sendBeacon("/__result", JSON.stringify({
        passed: passedCount,
        failed: failedCount,
        errors: window.__errors,
        real: !!window.__REAL__,
        results: results
    }));
} catch (e) { /* ignora */ }


