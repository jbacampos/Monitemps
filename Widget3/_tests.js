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

// Intervalo longo entre amostras: o incremento continua sendo
// contabilizado no instante observado (não é redistribuído) e NÃO gera
// mais marcação de incerteza.
var rLong = computeRain(pts([
    [d1 + M, 10.0],
    [d1 + 3 * H, 12.0]               // intervalo de ~3 h
]), d1, d1 + 86400000);
check("chuva intervalo longo: total preservado", rLong.total, 2);
checkTrue("chuva intervalo longo: dia exato", !rLong.days[0].uncertain);

var dup = dedupeSortAsc(pts([[d1, 5], [d1, 7], [d1 + M, 9]]));
check("chuva duplicados: quantidade", dup.length, 2);
check("chuva duplicados: último vence", dup[0].value, 7);

var rEdge = computeRain(pts([
    [d1, 10.0],
    [d1 + 86400000, 20.0]
]), d1, d1 + 86400000);
check("chuva: fim exclusivo", rEdge.total, 0);

// ------------------------------------------------------------
// 4b) FREQUÊNCIA DE DIAS CHUVOSOS (estatística do período)
// ------------------------------------------------------------
var ONE_DAY = 24 * H;
var fd = S("2026-10-01T03:00:00Z");            // 01/10 00:00 -03

// (a) Período sem chuva: nenhum dia chuvoso (o denominador é o período).
var sDry = summarizeRainDays([
    { dayStart: fd, mm: 0, uncertain: false }
], 5);
check("dias chuvosos: sem chuva -> total de dias", sDry.totalDays, 5);
check("dias chuvosos: sem chuva -> chuvosos", sDry.rainyDays, 0);

// (b) Todos os dias do período com chuva.
var sWet = summarizeRainDays([
    { dayStart: fd, mm: 1.2, uncertain: false },
    { dayStart: addSiteDays(fd, 1), mm: 0.1, uncertain: false },
    { dayStart: addSiteDays(fd, 2), mm: 20, uncertain: false }
], 3);
check("dias chuvosos: todos chuvosos", sWet.rainyDays, 3);

// (c) Mistura de dias chuvosos e secos (0 mm não é chuvoso).
var sMix = summarizeRainDays([
    { dayStart: fd, mm: 0, uncertain: false },
    { dayStart: addSiteDays(fd, 1), mm: 4.5, uncertain: false },
    { dayStart: addSiteDays(fd, 2), mm: 0, uncertain: false },
    { dayStart: addSiteDays(fd, 3), mm: 2.0, uncertain: false }
], 4);
check("dias chuvosos: mistos -> total", sMix.totalDays, 4);
check("dias chuvosos: mistos -> chuvosos", sMix.rainyDays, 2);

// (d) Dia com 0 mm PORÉM incerto não é contado como chuvoso.
var sUnc = summarizeRainDays([
    { dayStart: fd, mm: 3.0, uncertain: false },
    { dayStart: addSiteDays(fd, 1), mm: 0, uncertain: true }
], 2);
check("dias chuvosos: incerto -> total", sUnc.totalDays, 2);
check("dias chuvosos: incerto -> chuvosos", sUnc.rainyDays, 1);

// (e) Integração: dias SEM registro no ThingsBoard continuam no denominador
//     e vários incrementos no mesmo dia contam UMA única vez.
var sp0 = S("2026-10-01T03:00:00Z");
var sp1 = addSiteDays(sp0, 10);
var rSpan = computeRain(pts([
    [sp0 + M, 10.0],
    [sp0 + 2 * ONE_DAY + M, 12.0],        // +2,0 no dia 3
    [sp0 + 2 * ONE_DAY + 2 * M, 12.5],    // +0,5 no MESMO dia 3
    [sp0 + 5 * ONE_DAY + M, 13.0]         // +0,5 no dia 6
]), sp0, sp1);
var uSpan = countCalendarUnits(sp0, sp1);
check("dias chuvosos: período de 10 dias", uSpan.days, 10);
var sSpan = summarizeRainDays(rSpan.days, uSpan.days);
check("dias chuvosos: denominador = período", sSpan.totalDays, 10);
check("dias chuvosos: 2 dias (sem duplicar)", sSpan.rainyDays, 2);

// (f) Fronteira do dia no fuso do Sítio (UTC-3): 23:59 e 00:01 são dias
//     diferentes e o incremento é atribuído ao dia local da amostra.
var mg1 = S("2026-10-05T02:59:00Z");          // 04/10 23:59 -03
var mg2 = S("2026-10-05T03:01:00Z");          // 05/10 00:01 -03
var rMid = computeRain(pts([[mg1, 1.0], [mg2, 3.0]]), mg1, mg2 + H);
var uMid = countCalendarUnits(mg1, mg2 + H);
check("dias chuvosos: virada de dia -> total", uMid.days, 2);
check("dias chuvosos: virada de dia -> chuvosos",
    summarizeRainDays(rMid.days, uMid.days).rainyDays, 1);

// (g) Dia com 0 mm atingido por queda do contador (incerto) na prática.
var q0 = S("2026-10-08T03:00:00Z");           // 08/10 00:00 -03
var rUnc2 = computeRain(pts([
    [q0 + M, 5.0],
    [q0 + ONE_DAY + M, 0.0],                  // queda -> 08 e 09/10 incertos
    [q0 + ONE_DAY + 2 * M, 0.4]
]), q0, q0 + 3 * ONE_DAY);
var sUnc2 = summarizeRainDays(rUnc2.days,
    countCalendarUnits(q0, q0 + 3 * ONE_DAY).days);
check("dias chuvosos: reset -> total de dias", sUnc2.totalDays, 3);
check("dias chuvosos: reset -> chuvosos", sUnc2.rainyDays, 1);

// (h) Rótulo do total: dias inteiros x período com dias parciais.
check("dias período: ontem (1 dia inteiro)",
    formatPeriodDays(countCalendarUnits(S("2026-10-06T03:00:00Z"),
        S("2026-10-07T03:00:00Z"))), "(1 dia)");
check("dias período: setembro inteiro (30 dias)",
    formatPeriodDays(countCalendarUnits(S("2026-09-01T03:00:00Z"),
        S("2026-10-01T03:00:00Z"))), "(30 dias)");
check("dias período: últimas 24h -> parcial",
    formatPeriodDays(countCalendarUnits(NOW - 24 * H, NOW)), "(≈2 dias)");
check("dias período: fim em 'agora' -> parcial",
    formatPeriodDays(countCalendarUnits(S("2026-10-01T03:00:00Z"), NOW)),
    "(≈7 dias)");
check("dias período: início no meio do dia -> parcial",
    formatPeriodDays(countCalendarUnits(S("2026-10-01T15:00:00Z"),
        S("2026-10-04T03:00:00Z"))), "(≈3 dias)");

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
// 7) CORREÇÕES — fronteira inicial e intervalos longos
// ------------------------------------------------------------
var DAY = 86400000;
var bs = S("2026-10-02T03:00:00Z");            // 02/10 00:00 -03
var be = bs + DAY;

// (a) 1ª amostra DEPOIS do início -> incremento da fronteira recuperado,
//     porém incerto (não é separável entre dentro/fora da janela).
var rBd = computeRain(pts([
    [bs + 30000, 100.4],
    [bs + 90000, 100.6]
]), bs, be, { ts: bs - 30000, value: 100.0 });
check("fronteira: total inclui incremento inicial", rBd.total, 0.6);
checkTrue("fronteira: dia incerto", rBd.days[0].uncertain);

// (b) Sem a amostra anterior, o incremento da fronteira não é recuperável.
var rBd0 = computeRain(pts([
    [bs + 30000, 100.4],
    [bs + 90000, 100.6]
]), bs, be);
check("fronteira: sem amostra anterior -> total", rBd0.total, 0.2);

// (c) 1ª amostra EXATAMENTE em startTs -> fronteira exata; o incremento
//     anterior à janela NÃO entra e nada fica incerto.
var rBdEx = computeRain(pts([
    [bs, 100.4],
    [bs + M, 100.6]
]), bs, be, { ts: bs - M, value: 100.0 });
check("fronteira exata: total (exclui pre-janela)", rBdEx.total, 0.2);
checkTrue("fronteira exata: dia exato", !rBdEx.days[0].uncertain);

// (d) Janela terminando exatamente num timestamp de amostra (fim exclusivo).
var rEndEx = computeRain(pts([
    [bs + M, 5.0],
    [bs + 2 * M, 5.3],
    [bs + DAY, 6.0]                            // == endTs -> excluído
]), bs, be, { ts: bs - M, value: 5.0 });
check("fim exclusivo: total", rEndEx.total, 0.3);
checkTrue("fim exclusivo: sem incerteza de fronteira (delta 0)",
    !rEndEx.days[0].uncertain);

// (e) Intervalo >= 3 dias entre amostras: o incremento é atribuído ao
//     instante observado e nenhum dia é marcado como incerto.
var gs = S("2026-10-10T03:00:00Z");
var rLong3 = computeRain(pts([
    [gs, 10.0],
    [gs + 3 * DAY + M, 20.0]
]), gs, gs + 5 * DAY);
check("intervalo longo: total", rLong3.total, 10);
check("intervalo longo: nº dias", rLong3.days.length, 1);
checkTrue("intervalo longo: sem incerteza",
    rLong3.days.every(function (d) { return !d.uncertain; }));

// (f) Reset do contador seguido de recuperação.
var rs = S("2026-10-12T03:00:00Z");
var rRec = computeRain(pts([
    [rs, 5.0],
    [rs + M, 5.2],                             // +0,2
    [rs + 2 * M, 0.0],                         // reset (queda)
    [rs + 3 * M, 0.3],                         // retoma +0,3
    [rs + 4 * M, 0.5]                          // +0,2
]), rs, rs + DAY);
check("reset+recuperação: total", rRec.total, 0.7);
check("reset+recuperação: resetCount", rRec.resetCount, 1);
checkTrue("reset+recuperação: dia incerto", rRec.days[0].uncertain);

// ------------------------------------------------------------
// 7b) CONSISTÊNCIA total x dias x semanas x meses
// ------------------------------------------------------------
var c0 = S("2026-09-25T03:00:00Z");            // 25/09 00:00
var cons = computeRain(pts([
    [c0, 0],
    [c0 + 2 * DAY, 4.5],
    [c0 + 6 * DAY, 9.0],
    [c0 + 10 * DAY, 13.0]
]), c0, c0 + 12 * DAY);
check("consistência: total", cons.total, 13);
var sumDays = cons.days.reduce(function (a, d) { return a + d.mm; }, 0);
check("consistência: total == soma dias", Math.round(sumDays * 100) / 100, 13);
var rkCons = buildRainRankings(cons.days);
var sumWk = rkCons.weeks.reduce(function (a, w) { return a + w.mm; }, 0);
var sumMo = rkCons.months.reduce(function (a, m) { return a + m.mm; }, 0);
check("consistência: soma semanas == total", Math.round(sumWk * 100) / 100, 13);
check("consistência: soma meses == total", Math.round(sumMo * 100) / 100, 13);

// A incerteza de um dia sem chuva (0 mm, mas atingido por queda do
// contador) deve propagar para a semana/mês (nenhum acumulado incerto
// aparece exato).
var rkUnc = buildRainRankings([
    { dayStart: S("2026-10-04T03:00:00Z"), mm: 5.0, uncertain: false },
    { dayStart: S("2026-10-06T03:00:00Z"), mm: 0, uncertain: true }
]);
checkTrue("ranking: incerteza de dia 0 mm propaga à semana", rkUnc.weeks[0].uncertain);
checkTrue("ranking: incerteza de dia 0 mm propaga ao mês", rkUnc.months[0].uncertain);

// ------------------------------------------------------------
// 8) CANDIDATOS A PICO — distribuição e separação
// ------------------------------------------------------------
var t0p = S("2026-01-01T00:00:00Z");

// Muitos picos fortes no MESMO episódio (< 24 h) -> só 1 candidato.
var conc = selectSpreadCandidates(pts([
    [t0p, 100], [t0p + H, 98], [t0p + 2 * H, 96], [t0p + 23 * H, 95]
]), PEAK_MIN_GAP_MS, COARSE_TOP_K);
check("candidatos: episódio único -> 1", conc.length, 1);
check("candidatos: episódio único valor", conc[0].value, 100);

// Picos distribuídos em > 1 ano -> candidatos espalhados e >= 24 h.
var spreadB = selectSpreadCandidates(pts([
    [t0p, 100],
    [t0p + 2 * H, 99],                         // mesmo episódio
    [t0p + 5 * DAY, 80],
    [t0p + 200 * DAY, 90],
    [t0p + 370 * DAY, 70]
]), PEAK_MIN_GAP_MS, COARSE_TOP_K);
check("candidatos >1 ano: quantidade", spreadB.length, 4);
checkTrue("candidatos >1 ano: separados >= 24h",
    pairwiseGapOk(spreadB, PEAK_MIN_GAP_MS));
checkTrue("candidatos >1 ano: cobrem a janela (> 1 ano)",
    spreadB[spreadB.length - 1].ts - spreadB[0].ts > 365 * DAY);

// Três picos efetivamente separados por >= 24 h -> 3 escolhidos.
var threeP = selectPeaks(pts([
    [t0p, 50], [t0p + 24 * H, 45], [t0p + 48 * H, 40]
]), PEAK_MIN_GAP_MS, 3);
check("3 picos >=24h: quantidade", threeP.length, 3);
checkTrue("3 picos >=24h: separação",
    Math.abs(threeP[0].ts - threeP[1].ts) >= PEAK_MIN_GAP_MS &&
    Math.abs(threeP[1].ts - threeP[2].ts) >= PEAK_MIN_GAP_MS);

// Helper: todos os pares de uma lista separados por >= gap.
function pairwiseGapOk(list, gap) {
    for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
            if (Math.abs(list[i].ts - list[j].ts) < gap) { return false; }
        }
    }
    return true;
}

// ------------------------------------------------------------
// 9) PLANEJAMENTO DA AGREGAÇÃO (limites reais da API do ThingsBoard)
// ------------------------------------------------------------
var YEAR = 365 * DAY;
check("agg: intervalo para 1 ano = 1 h", chooseAggInterval(YEAR), COARSE_INTERVAL_MS);
var iv5 = chooseAggInterval(5 * YEAR);
checkTrue("agg: intervalo cresce p/ 5 anos", iv5 > COARSE_INTERVAL_MS);

var plan1 = planAggWindows(t0p, t0p + YEAR, COARSE_INTERVAL_MS, 500, 20);
checkTrue("plan 1a: cobre a janela",
    plan1.windows[0].start === t0p &&
    plan1.windows[plan1.windows.length - 1].end === t0p + YEAR);
checkTrue("plan 1a: contíguo", plan1.windows.every(function (w, i, a) {
    return i === 0 || a[i - 1].end === w.start;
}));
checkTrue("plan 1a: <= 500 intervalos por consulta",
    plan1.windows.every(function (w) {
        return (w.end - w.start) / COARSE_INTERVAL_MS <= 500;
    }));
checkTrue("plan 1a: não truncado", !plan1.capped);

var plan5 = planAggWindows(t0p, t0p + 5 * YEAR, iv5, 500, 20);
checkTrue("plan 5a: <= 500 intervalos por consulta",
    plan5.windows.every(function (w) { return (w.end - w.start) / iv5 <= 500; }));
checkTrue("plan 5a: não truncado", !plan5.capped);

var planCap = planAggWindows(t0p, t0p + YEAR, COARSE_INTERVAL_MS, 500, 2);
checkTrue("plan: capped ao atingir o teto de consultas", planCap.capped);

// ------------------------------------------------------------
// 11) EXTREMOS DE TEMPERATURA (classificação por temperature_out,
//     ST complementar e separação de 24 h)
// ------------------------------------------------------------
var tt0 = S("2026-10-08T03:00:00Z");           // 08/10 00:00 -03
var G24 = 24 * H;                              // janela mínima entre extremos

// (a) Ordenação SOMENTE pelas temperaturas externas. A sensação térmica é
// "invertida" (100 - temp): se a classificação usasse feels_like, a ordem
// mudaria — logo prova que ela é complementar.
var tTemp = pts([
    [tt0, 10.0],
    [tt0 + DAY, 25.0],
    [tt0 + 2 * DAY, 5.0],
    [tt0 + 3 * DAY, 30.0],
    [tt0 + 4 * DAY, -2.0],
    [tt0 + 5 * DAY, 18.0]
]);
var tFeels = pts([
    [tt0, 90.0], [tt0 + DAY, 75.0], [tt0 + 2 * DAY, 95.0],
    [tt0 + 3 * DAY, 70.0], [tt0 + 4 * DAY, 102.0], [tt0 + 5 * DAY, 82.0]
]);
var tExt = selectTempExtremes(tTemp, tFeels, 3, G24, null, null);
check("temp: ocorrências", tExt.count, 6);
check("temp máx qtd", tExt.maxs.length, 3);
check("temp máx 1º (só temperature_out)", tExt.maxs[0].value, 30);
check("temp máx 2º", tExt.maxs[1].value, 25);
check("temp máx 3º", tExt.maxs[2].value, 18);
check("temp mín 1º", tExt.mins[0].value, -2);
check("temp mín 2º", tExt.mins[1].value, 5);
check("temp mín 3º", tExt.mins[2].value, 10);
check("ST do máx 1º (mesmo instante)", tExt.maxs[0].st, 70);
check("ST da mín 1º (mesmo instante)", tExt.mins[0].st, 102);

// (b) Separação temporal mínima (24 h) nas máximas E nas mínimas.
check("temp <24h: 1 máx",
    selectTempExtremes(pts([[tt0, 30.0], [tt0 + 23 * H, 29.0]]), [], 3, G24).maxs.length, 1);
check("temp =24h: 2 máx",
    selectTempExtremes(pts([[tt0, 30.0], [tt0 + 24 * H, 29.0]]), [], 3, G24).maxs.length, 2);
check("temp >24h: 2 máx",
    selectTempExtremes(pts([[tt0, 30.0], [tt0 + 25 * H, 29.0]]), [], 3, G24).maxs.length, 2);
check("temp <24h: 1 mín",
    selectTempExtremes(pts([[tt0, 1.0], [tt0 + 23 * H, 2.0]]), [], 3, G24).mins.length, 1);
check("temp =24h: 2 mín",
    selectTempExtremes(pts([[tt0, 1.0], [tt0 + 24 * H, 2.0]]), [], 3, G24).mins.length, 2);

// (c) Patamares consecutivos (mesmo valor) = uma ocorrência.
var tRep = selectTempExtremes(pts([
    [tt0, 20.0], [tt0 + M, 20.0], [tt0 + 2 * M, 20.0],
    [tt0 + DAY, 21.0], [tt0 + DAY + M, 21.0],
    [tt0 + 2 * DAY, 19.0]
]), [], 3, G24);
check("temp patamar: ocorrências", tRep.count, 3);
check("temp patamar: máx 1º", tRep.maxs[0].value, 21);
check("temp patamar: máx 1º ts (1ª do patamar)", tRep.maxs[0].ts, tt0 + DAY);
check("temp patamar: máx 2º", tRep.maxs[1].value, 20);
check("temp patamar: máx 3º", tRep.maxs[2].value, 19);
check("temp patamar: mín 1º", tRep.mins[0].value, 19);

// (d) Mesmo valor em dias diferentes (>= 24 h) ocupa posições distintas e,
// no empate, vem primeiro a ocorrência mais antiga.
var tTie = selectTempExtremes(pts([
    [tt0, 25.0], [tt0 + M, 25.0],
    [tt0 + DAY, 25.0], [tt0 + DAY + M, 25.0],
    [tt0 + 2 * DAY, 25.0], [tt0 + 2 * DAY + M, 25.0]
]), [], 3, G24);
check("temp empate dias: 3 posições", tTie.maxs.length, 3);
checkTrue("temp empate dias: mais antigo primeiro",
    tTie.maxs[0].ts === tt0 && tTie.maxs[1].ts === tt0 + DAY &&
    tTie.maxs[2].ts === tt0 + 2 * DAY);
check("temp empate dias: mín também 3", tTie.mins.length, 3);
check("temp empate <24h: cai para 1",
    selectTempExtremes(pts([[tt0, 25.0], [tt0 + 10 * H, 25.0]]), [], 3, G24).maxs.length, 1);

// (e) Menos de três ocorrências -> menos resultados (sem preencher posições).
var tFew = selectTempExtremes(pts([[tt0, 1.0], [tt0 + DAY, 2.0]]), [], 3, G24);
check("temp poucas: máx qtd", tFew.maxs.length, 2);
check("temp poucas: mín qtd", tFew.mins.length, 2);
check("temp poucas: mín 1º", tFew.mins[0].value, 1);

// (f) Período sem dados.
var tNone = selectTempExtremes([], [], 3, G24);
check("temp sem dados: máx qtd", tNone.maxs.length, 0);
check("temp sem dados: ocorrências", tNone.count, 0);

// (g) Associação da sensação térmica: exata, dentro e fora da tolerância.
var stTemp = pts([[tt0, 20.0], [tt0 + DAY, 22.0], [tt0 + 2 * DAY, 24.0]]);
var stFeels = pts([
    [tt0, 19.5],                          // exato
    [tt0 + DAY + 2 * M, 21.0],            // +2 min -> dentro (tolerância 3 min)
    [tt0 + 2 * DAY + 10 * M, 5.0]         // +10 min -> fora -> "ST —"
]);
var tSt = selectTempExtremes(stTemp, stFeels, 3, G24);
check("ST exato", tSt.maxs[2].st, 19.5);
check("ST dentro da tolerância (2 min)", tSt.maxs[1].st, 21.0);
checkTrue("ST fora da tolerância -> null", tSt.maxs[0].st === null);

// (h) Limites [início inclusivo, fim exclusivo).
var tWin = selectTempExtremes(pts([
    [tt0 - M, 99.0],                // antes do início -> excluído
    [tt0, 20.0],
    [tt0 + DAY, 8.0],
    [tt0 + 2 * DAY, 77.0]           // == endTs -> excluído
]), [], 3, G24, tt0, tt0 + 2 * DAY);
check("temp janela: ocorrências", tWin.count, 2);
check("temp janela: máx", tWin.maxs[0].value, 20);
check("temp janela: mín", tWin.mins[0].value, 8);

// (i) Mudança de dia/mês/ano (fuso do Sítio, UTC-3).
var tYear = selectTempExtremes(pts([
    [S("2025-12-31T03:00:00Z"), 10.0],  // 31/12/2025 00:00 -03
    [S("2026-01-01T03:00:00Z"), 20.0],  // 01/01/2026 00:00 -03
    [S("2026-01-02T03:00:00Z"), 15.0]
]), [], 3, G24);
check("temp ano: máx", tYear.maxs[0].value, 20);
check("temp ano: data/hora do máx",
    formatDayShort(tYear.maxs[0].ts) + " " + timeHm(tYear.maxs[0].ts),
    "01/01 00:00");
check("temp ano: data do 1º (mín)", formatDayShort(tYear.mins[0].ts), "31/12");

// (j) Formatação de valores.
check("formato: 1 casa", format1(30), "30.0");
check("formato: negativo", format1(-2), "-2.0");

// (k) Render: classes de cor/categoria, ST, destaque do 1º e data/hora.
var rMax = renderTempItems(tExt.maxs, "max");
checkTrue("render: categoria máximas", rMax.indexOf("temp-item--max") >= 0);
checkTrue("render: 1º em destaque", rMax.indexOf("temp-item--top") >= 0);
checkTrue("render: demais menores", rMax.indexOf("temp-item--rest") >= 0);
checkTrue("render: unidade °C", rMax.indexOf("°C") >= 0);
checkTrue("render: ordinal 1ª acima", rMax.indexOf("temp-top-pos") >= 0 &&
    rMax.indexOf("1ª") >= 0);
checkTrue("render: unidade separada no 1º",
    rMax.indexOf("temp-line--top") >= 0 && rMax.indexOf("temp-unit") >= 0);
checkTrue("render: ST junto à temperatura", rMax.indexOf("ST ") >= 0);
check("render: 3 itens", (rMax.match(/class="temp-item /g) || []).length, 3);

var rMin = renderTempItems([{ ts: tt0, value: 5.0, st: null }], "min");
checkTrue("render: categoria mínimas", rMin.indexOf("temp-item--min") >= 0);
checkTrue("render: ST ausente -> —", rMin.indexOf("ST —") >= 0);
checkTrue("render: data presente", rMin.indexOf(formatDayShort(tt0)) >= 0);
checkTrue("render vazio: 'sem dados'",
    renderTempItems([], "max").indexOf("sem dados") >= 0);

// ------------------------------------------------------------
// Resultado
// ------------------------------------------------------------
function reportResults() {
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
}

// ------------------------------------------------------------
// 10) INTEGRAÇÃO DA AGREGAÇÃO (servidor simulado — assíncrono)
// ------------------------------------------------------------
// Stub que imita a API do ThingsBoard: rejeita consultas agregadas com
// mais de `maxIntervals` intervalos, honra `limit`/`orderBy` e, quando
// `rawFn` é dado, serve a leitura crua (refino) amostra a amostra.
function installTelemetryStub(buckets, opts) {
    opts = opts || {};
    var calls = [];
    var original = ctx.http.get;

    ctx.http.get = function (url) {
        var key = decodeURIComponent((/keys=([^&]+)/.exec(url) || [])[1] || "");
        var start = Number((/startTs=(-?\d+)/.exec(url) || [])[1]);
        var end = Number((/endTs=(-?\d+)/.exec(url) || [])[1]);
        var rawInterval = (/interval=(\d+)/.exec(url) || [])[1];
        var interval = rawInterval ? Number(rawInterval) : 0;
        var limit = Number(((/limit=(\d+)/.exec(url) || [])[1]) || 100);
        var asc = /orderBy=ASC/.test(url);

        calls.push({ start: start, end: end, interval: interval });

        return {
            subscribe: function (ok, err) {
                if (interval > 0) {
                    var intervals = Math.ceil((end - start) / interval);

                    if (opts.maxIntervals && intervals > opts.maxIntervals) {
                        if (err) { err(new Error("Number of intervals is to high - " + intervals)); }
                        return { unsubscribe: function () {} };
                    }

                    var sel = buckets.filter(function (b) {
                        return b.ts >= start && b.ts <= end;
                    });
                    sel.sort(function (a, b) { return asc ? a.ts - b.ts : b.ts - a.ts; });
                    sel = sel.slice(0, limit);

                    var resp = {};
                    resp[key] = sel.map(function (b) {
                        return { ts: b.ts, value: String(b.value) };
                    });
                    ok(resp);
                    return { unsubscribe: function () {} };
                }

                var out = [];
                var stepMs = 60000;

                if (opts.rawFn) {
                    if (asc) {
                        for (var t = start; t <= end && out.length < limit; t += stepMs) {
                            var v = opts.rawFn(key, t);
                            if (v != null) { out.push({ ts: t, value: String(v) }); }
                        }
                    } else {
                        for (var t2 = end; t2 >= start && out.length < limit; t2 -= stepMs) {
                            var v2 = opts.rawFn(key, t2);
                            if (v2 != null) { out.push({ ts: t2, value: String(v2) }); }
                        }
                    }
                }

                var rawResp = {};
                rawResp[key] = out;
                ok(rawResp);
                return { unsubscribe: function () {} };
            }
        };
    };

    return {
        calls: calls,
        restore: function () { ctx.http.get = original; }
    };
}

// Fixture: 400 dias de buckets horários com 3 episódios separados e um
// episódio concentrado (vários picos fortes em < 24 h).
function buildAggFixture() {
    var aggStart = S("2024-01-01T00:00:00Z");
    var hours = 400 * 24;

    function bucketVal(ts) {
        var h = Math.round((ts - aggStart) / H);
        var v = 5 + 3 * Math.sin(h / 24);

        if (h === 24 * 10) { v = 90; }
        if (h === 24 * 100) { v = 70; }        // episódio concentrado
        if (h === 24 * 100 + 1) { v = 72; }
        if (h === 24 * 100 + 2) { v = 71; }
        if (h === 24 * 200) { v = 85; }
        if (h === 24 * 380) { v = 80; }
        return v;
    }

    function rawVal(key, ts) {
        var h = Math.floor((ts - aggStart) / H);
        var mid = aggStart + h * H + 30 * 60000;

        if (Math.abs(ts - mid) < 30000) { return bucketVal(aggStart + h * H); }
        return 5 + 3 * Math.sin(h / 24) * 0.9;
    }

    var buckets = [];
    for (var i = 0; i < hours; i++) {
        buckets.push({ ts: aggStart + i * H, value: bucketVal(aggStart + i * H) });
    }

    return {
        start: aggStart,
        end: aggStart + hours * H,
        hours: hours,
        buckets: buckets,
        rawVal: rawVal
    };
}

function runAsyncTests() {
    var fx = buildAggFixture();

    // (1) fetchAggWindow: cobertura completa, sem truncar em 5000 e
    //     respeitando o limite real de intervalos por consulta.
    function testCoverage() {
        var stub = installTelemetryStub(fx.buckets, { maxIntervals: 700 });

        return fetchAggWindow("wind_speed", fx.start, fx.end, COARSE_INTERVAL_MS,
            "MAX", AGG_MAX_REQUESTS).then(function (r) {
            check("pagin/agg: capped=false", r.capped, false);
            check("pagin/agg: cobertura completa", r.buckets.length, fx.buckets.length);
            check("pagin/agg: 1º bucket", r.buckets[0].ts, fx.start);
            check("pagin/agg: último bucket", r.buckets[r.buckets.length - 1].ts,
                fx.start + (fx.hours - 1) * H);
            checkTrue("pagin/agg: nenhuma consulta > 700 intervalos",
                stub.calls.every(function (c) {
                    return c.interval > 0 &&
                        Math.ceil((c.end - c.start) / c.interval) <= 700;
                }));

            var cand = selectSpreadCandidates(r.buckets, PEAK_MIN_GAP_MS, COARSE_TOP_K);
            var tsList = cand.map(function (c) { return c.ts; });

            checkTrue("pagin/agg: candidatos separados >= 24h",
                pairwiseGapOk(cand, PEAK_MIN_GAP_MS));
            check("pagin/agg: 1º candidato", cand[0].value, 90);
            checkTrue("pagin/agg: candidatos cobrem a janela (> 300 dias)",
                (Math.max.apply(null, tsList) - Math.min.apply(null, tsList)) > 300 * DAY);
            check("pagin/agg: episódio concentrado -> 1 candidato",
                cand.filter(function (c) {
                    return Math.abs(c.ts - (fx.start + 24 * 100 * H)) < 24 * H;
                }).length, 1);
        }).then(function () { stub.restore(); });
    }

    // (2) findTopPeaks: caminho agregado, 3 picos >= 24 h e limited=false.
    function testFindTopPeaks() {
        var stub = installTelemetryStub(fx.buckets,
            { maxIntervals: 700, rawFn: fx.rawVal });

        return findTopPeaks("wind_speed", fx.start, fx.end, function () {})
            .then(function (res) {
                check("findTopPeaks: método", res.method, "aggregated");
                check("findTopPeaks: limited", res.limited, false);
                check("findTopPeaks: qtd", res.peaks.length, 3);
                check("findTopPeaks: 1º", Math.round(res.peaks[0].value * 100) / 100, 90);
                check("findTopPeaks: 2º", Math.round(res.peaks[1].value * 100) / 100, 85);
                check("findTopPeaks: 3º", Math.round(res.peaks[2].value * 100) / 100, 80);
                checkTrue("findTopPeaks: >= 24h entre picos",
                    pairwiseGapOk(res.peaks, PEAK_MIN_GAP_MS));
            }).then(function () { stub.restore(); });
    }

    // (3) Teto de sub-consultas atingido -> resposta parcial sinalizada.
    function testCap() {
        var stub = installTelemetryStub(fx.buckets, { maxIntervals: 700 });

        return fetchAggWindow("wind_speed", fx.start, fx.end, COARSE_INTERVAL_MS,
            "MAX", 3).then(function (r) {
            check("pagin/agg: teto -> capped", r.capped, true);
            checkTrue("pagin/agg: parcial < total", r.buckets.length < fx.buckets.length);
        }).then(function () { stub.restore(); });
    }

    // (4) API rejeita por limite de intervalos -> não falha; sinaliza capped.
    function testApiReject() {
        var stub = installTelemetryStub(fx.buckets, { maxIntervals: 50 });

        return fetchAggWindow("wind_speed", fx.start, fx.end, COARSE_INTERVAL_MS,
            "MAX", AGG_MAX_REQUESTS).then(function (r) {
            check("pagin/agg: rejeição da API -> capped", r.capped, true);
            check("pagin/agg: rejeição -> sem buckets", r.buckets.length, 0);
        }).then(function () { stub.restore(); });
    }

    // (5) Temperatura: histórico longo com paginação da leitura crua.
    function testTempPagination() {
        var tStart = S("2024-01-01T00:00:00Z");
        var tEnd = tStart + 4500 * 60000;

        function tempVal(key, ts) {
            var i = Math.round((ts - tStart) / 60000);
            return 10 + (i % 100) / 10 + (i === 1000 ? 20 : 0);
        }

        var stub = installTelemetryStub([], { rawFn: tempVal });

        return fetchRaw("temperature_out", tStart, tEnd).then(function (r) {
            checkTrue("temp paginação: >= 2 consultas", stub.calls.length >= 2);
            checkTrue("temp paginação: > 4000 amostras (paginou)",
                r.points.length > 4000);
            check("temp paginação: capped", r.capped, false);

            var ex = selectTempExtremes(r.points, [], 3, 24 * H, tStart, tEnd);
            check("temp paginação: máx", ex.maxs[0].value, 30);
            check("temp paginação: mín", ex.mins[0].value, 10);
            checkTrue("temp paginação: ocorrências > 1000", ex.count > 1000);
        }).then(function () {
            stub.restore();

            var stubCap = installTelemetryStub([], { rawFn: tempVal });

            return fetchRaw("temperature_out", tStart, tEnd, 1).then(function (r2) {
                check("temp paginação: capped com 1 página", r2.capped, true);
                check("temp paginação: 1 página = 4000", r2.points.length, 4000);
            }).then(function () { stubCap.restore(); });
        });
    }

    // (6) Cores/estrutura da seção TEMPERATURA (CSS) e ordem das colunas (HTML).
    function testTempCss() {
        var css = "";

        return fetch("style.css").then(function (r) { return r.text(); })
            .then(function (text) {
                css = text;
                return fetch("index.html");
            })
            .then(function (r) { return r.text(); })
            .then(function (html) {
                checkTrue("css: 2 colunas + divisor vertical",
                    css.indexOf(".temp-grid") >= 0 &&
                    css.indexOf("grid-template-columns: 1fr 1fr") >= 0 &&
                    css.indexOf(".temp-block + .temp-block") >= 0);
                checkTrue("css: máximas em vermelho-alaranjado",
                    css.indexOf(".temp-cat--max") >= 0 &&
                    css.indexOf("#ff6b52") >= 0);
                checkTrue("css: mínimas em azul-claro",
                    css.indexOf(".temp-cat--min") >= 0 &&
                    css.indexOf("#5cc8ff") >= 0);
                checkTrue("css: ST secundária (mesma família)",
                    css.indexOf(".temp-item--max .temp-st") >= 0 &&
                    css.indexOf(".temp-item--min .temp-st") >= 0);
                checkTrue("css: data/hora cinza-claro",
                    css.indexOf(".temp-when") >= 0 &&
                    css.indexOf("#c2c7cd") >= 0);
                checkTrue("css: 1º na escala grande (40px) e demais menores",
                    /\.temp-item--top \.temp-v \{[^}]*font-size:\s*40px/.test(css) &&
                    /\.temp-item--rest \.temp-v \{[^}]*font-size:\s*15px/.test(css));
                checkTrue("css: ordinal acima e unidade separada",
                    css.indexOf(".temp-top-pos") >= 0 &&
                    css.indexOf(".temp-unit") >= 0 &&
                    css.indexOf(".temp-line--top") >= 0);
                checkTrue("html: Máximas à esquerda de Mínimas",
                    html.indexOf("temp-block--max") >= 0 &&
                    html.indexOf("temp-block--max") < html.indexOf("temp-block--min"));
            });
    }

    return testCoverage()
        .then(testFindTopPeaks)
        .then(testCap)
        .then(testApiReject)
        .then(testTempPagination)
        .then(testTempCss);
}

var __reported = false;

function finish() {
    if (!__reported) {
        __reported = true;
        reportResults();
    }
}

runAsyncTests().then(finish).catch(function (e) {
    window.__errors = window.__errors || [];
    window.__errors.push("async: " + (e && e.message ? e.message : e));
    finish();
});


