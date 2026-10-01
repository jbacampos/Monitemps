// ============================================================
// WIDGET SÍTIO — CHUVA / VENTO / ASTRONOMIA
// ============================================================

const DEVICE_ECOWITT =
    "63eaff60-b030-11f1-940d-1f4ee055f09a";

// COLOQUE AQUI AS COORDENADAS EXATAS DO SÍTIO.
const SITE_LATITUDE = -30.258806;
const SITE_LONGITUDE = -51.585233;

// O Sítio opera em UTC-3.
const SITE_TIMEZONE_OFFSET_MINUTES = -180;

// Horizonte de nascer/pôr da Lua: bordo superior aparente,
// considerando refração (~0,57°) e semidiâmetro (~0,26°). Como
// moonAltitudeFallback devolve a altitude topocêntrica, o limiar
// corresponde a -(refração + semidiâmetro).
const MOON_RISE_SET_HORIZON = -0.825;

// Horizonte de nascer/pôr do Sol: bordo superior aparente
// (refração ~0,57° + semidiâmetro ~0,27°) → -0,833°.
const SUN_RISE_SET_HORIZON = -0.833;

let lastUpdateTimestamp = null;

function setText(id, value) {
    const el = container.querySelector("#" + id);
    
    if (el) el.textContent = value;
}


function setMoonTime(id, date, outroDia) {

    const el =
        container.querySelector("#" + id);

    if (!el) {
        return;
    }

    el.textContent =
        formatSiteTime(date);

    if (el.classList) {

        el.classList.toggle(
            "moon-outro-dia",
            !!outroDia
        );
    }
}


// ============================================================
// LAYOUT — CLASSES CONFORME A LARGURA DO CARD
// ------------------------------------------------------------
// O ThingsBoard "achata" as media queries do CSS do widget (as
// regras de @media passam a valer sempre). Por isso o layout
// responsivo é aplicado por classes, com base na largura/altura
// reais do card.
// ============================================================

const LAYOUT_XS_MAX_WIDTH = 480;
const LAYOUT_XXS_MAX_WIDTH = 360;
const LAYOUT_SHORT_MAX_HEIGHT = 450;


function updateLayoutClass() {

    const card =
        container.querySelector(".card");

    if (!card) {
        return;
    }

    const width =
        container.clientWidth;

    const height =
        container.clientHeight;

    card.classList.toggle(
        "card--xs",
        width <= LAYOUT_XS_MAX_WIDTH
    );

    card.classList.toggle(
        "card--xxs",
        width <= LAYOUT_XXS_MAX_WIDTH
    );

    card.classList.toggle(
        "card--short",
        height <= LAYOUT_SHORT_MAX_HEIGHT
    );
}

function formatTimestamp(ts) {
    const d = new Date(ts);
    const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    return String(d.getDate()).padStart(2,"0") + "/" +
           months[d.getMonth()] + " " +
           String(d.getHours()).padStart(2,"0") + ":" +
           String(d.getMinutes()).padStart(2,"0");
}

function format1(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(1) : "---";
}

function format0(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n).toString() : "---";
}

function windDirectionName(deg) {
    const d = Number(deg);
    if (!Number.isFinite(d)) return "---";
    const n = ((d % 360) + 360) % 360;
    const names = ["N","NE","E","SE","S","SO","O","NO"];
    return names[Math.round(n / 45) % 8];
}

// ============================================================
// ASTRONOMIA
// ------------------------------------------------------------
// Todos os dados astronômicos (Sol, Lua, fases e estações) são
// calculados localmente, sem dependência de serviços externos.
// ============================================================


// ============================================================
// DATA/HORA LOCAL DO SÍTIO
// ============================================================

function getSiteNow() {

    return new Date(
        Date.now() +
        SITE_TIMEZONE_OFFSET_MINUTES *
        60000
    );
}


function getSiteDateParts() {

    const d =
        getSiteNow();

    return {

        year:
            d.getUTCFullYear(),

        month:
            d.getUTCMonth() + 1,

        day:
            d.getUTCDate()
    };
}


// Indica se um instante pertence ao dia civil atual do sítio.
function isSiteToday(date) {

    if (!(date instanceof Date)) {
        return false;
    }

    const p =
        getSiteDateParts();

    const local =
        new Date(
            date.getTime() +
            SITE_TIMEZONE_OFFSET_MINUTES * 60000
        );

    return (
        local.getUTCFullYear() === p.year &&
        local.getUTCMonth() + 1 === p.month &&
        local.getUTCDate() === p.day
    );
}


// ============================================================
// HORA LOCAL DO SÍTIO -> DATE ABSOLUTO
// ============================================================

function siteLocalTimeToDate(
    year,
    month,
    day,
    hour,
    minute
) {

    const utc =
        Date.UTC(
            year,
            month - 1,
            day,
            hour,
            minute,
            0,
            0
        );

    return new Date(
        utc -
        SITE_TIMEZONE_OFFSET_MINUTES *
        60000
    );
}


// ============================================================
// FORMATA HORA DO SÍTIO
// ============================================================

function formatSiteTime(date) {

    if (
        !(date instanceof Date) ||
        Number.isNaN(date.getTime())
    ) {
        return "--:--";
    }

    // Arredonda ao minuto mais próximo; o instante calculado é
    // fracionário.
    const local =
        new Date(
            date.getTime() +
            30000 +
            SITE_TIMEZONE_OFFSET_MINUTES *
            60000
        );

    return (

        String(
            local.getUTCHours()
        ).padStart(2, "0")

        +

        ":"

        +

        String(
            local.getUTCMinutes()
        ).padStart(2, "0")
    );
}


// ============================================================
// SOL — CÁLCULO LOCAL
// ------------------------------------------------------------
// Posição do Sol (Schlyter) + altitude, com o nascer/pôr
// resolvidos por bisseção no instante exato de cada evento.
// ============================================================

function sunPositionFallback(
    jd
) {

    const d =
        jd - 2451543.5;

    const w =
        282.9404 +
        4.70935e-5 * d;

    const e =
        0.016709 -
        1.151e-9 * d;

    const M =
        normalize360(
            356.0470 +
            0.9856002585 * d
        );

    const Mr =
        M *
        Math.PI /
        180;

    const E =
        Mr +
        e *
        Math.sin(Mr) *
        (1 + e * Math.cos(Mr));

    const xv =
        Math.cos(E) - e;

    const yv =
        Math.sqrt(1 - e * e) *
        Math.sin(E);

    const v =
        Math.atan2(yv, xv);

    const r =
        Math.sqrt(xv * xv + yv * yv);

    const lon =
        normalize360(
            v * 180 / Math.PI + w
        );

    const lonRad =
        lon *
        Math.PI /
        180;

    const xs =
        r * Math.cos(lonRad);

    const ys =
        r * Math.sin(lonRad);

    const obliquity =
        23.4393 *
        Math.PI /
        180;

    const ye =
        ys * Math.cos(obliquity);

    const ze =
        ys * Math.sin(obliquity);

    return {

        ra:
            normalize360(
                Math.atan2(ye, xs) *
                180 /
                Math.PI
            ),

        dec:
            Math.atan2(
                ze,
                Math.sqrt(xs * xs + ye * ye)
            ) *
            180 /
            Math.PI,

        eclipticLongitude:
            lon,

        distance:
            r
    };
}


function sunAltitudeFallback(date) {

    const sun =
        sunPositionFallback(
            julianDay(date)
        );

    const lat =
        SITE_LATITUDE *
        Math.PI /
        180;

    const dec =
        sun.dec *
        Math.PI /
        180;

    let ha =
        greenwichSiderealTime(
            julianDay(date)
        )
        +
        SITE_LONGITUDE
        -
        sun.ra;

    ha =
        normalize360(ha);

    if (ha > 180) {
        ha -= 360;
    }

    const haRad =
        ha *
        Math.PI /
        180;

    return (
        Math.asin(
            Math.sin(lat) *
            Math.sin(dec)
            +
            Math.cos(lat) *
            Math.cos(dec) *
            Math.cos(haRad)
        ) *
        180 /
        Math.PI
    );
}


function calculateSunTimesFallback() {

    const p =
        getSiteDateParts();

    const start =
        siteLocalTimeToDate(
            p.year,
            p.month,
            p.day,
            0,
            0
        );

    const end =
        siteLocalTimeToDate(
            p.year,
            p.month,
            p.day,
            0,
            1440
        );

    const middle =
        new Date(
            (
                start.getTime() +
                end.getTime()
            ) / 2
        );

    return {

        sunrise:
            refineSunCrossing(start, middle, true),

        sunset:
            refineSunCrossing(middle, end, false)
    };
}


function refineSunCrossing(left, right, rising) {

    const leftValue =
        sunAltitudeFallback(left) -
        SUN_RISE_SET_HORIZON;

    const rightValue =
        sunAltitudeFallback(right) -
        SUN_RISE_SET_HORIZON;

    // Sem cruzamento (Sol sempre acima ou abaixo do horizonte).
    if (rising) {

        if (!(leftValue < 0 && rightValue > 0)) {
            return null;
        }

    } else {

        if (!(leftValue > 0 && rightValue < 0)) {
            return null;
        }
    }

    for (let i = 0; i < 30; i++) {

        const middle =
            new Date(
                (
                    left.getTime() +
                    right.getTime()
                ) / 2
            );

        const value =
            sunAltitudeFallback(middle) -
            SUN_RISE_SET_HORIZON;

        if (rising === (value < 0)) {
            left = middle;
        } else {
            right = middle;
        }
    }

    return new Date(
        (
            left.getTime() +
            right.getTime()
        ) / 2
    );
}


// ============================================================
// LUA — CÁLCULO LOCAL
// ------------------------------------------------------------
// Modelo de dois corpos com as principais perturbações.
// ============================================================

function normalize360(
    value
) {

    return (
        (
            value % 360
        ) + 360
    ) % 360;
}


function julianDay(
    date
) {

    return (
        date.getTime() /
        86400000
    ) +
    2440587.5;
}


function moonPositionFallback(
    jd
) {

    const d =
        jd -
        2451543.5;

    const N =
        125.1228 -
        0.0529538083 * d;

    const i =
        5.1454;

    const w =
        318.0634 +
        0.1643573223 * d;

    const a =
        60.2666;

    const e =
        0.054900;

    const M =
        normalize360(
            115.3654 +
            13.0649929509 * d
        );

    // Elementos do Sol, necessários às perturbações da Lua.
    const ws =
        282.9404 +
        4.70935e-5 * d;

    const Ms =
        normalize360(
            356.0470 +
            0.9856002585 * d
        );

    // Argumentos médios usados nas perturbações.
    const Lm =
        normalize360(N + w + M);

    const Ls =
        normalize360(Ms + ws);

    const D =
        normalize360(Lm - Ls);

    const F =
        normalize360(Lm - N);

    const Mr =
        M *
        Math.PI /
        180;

    const E =
        Mr +
        e *
        Math.sin(Mr) *
        (
            1 +
            e *
            Math.cos(Mr)
        );

    const xv =
        a *
        (
            Math.cos(E) -
            e
        );

    const yv =
        a *
        Math.sqrt(
            1 - e * e
        ) *
        Math.sin(E);

    const v =
        Math.atan2(
            yv,
            xv
        );

    const r =
        Math.sqrt(
            xv * xv +
            yv * yv
        );

    const Nr =
        N *
        Math.PI /
        180;

    const ir =
        i *
        Math.PI /
        180;

    const wr =
        w *
        Math.PI /
        180;

    const xh =
        r *
        (
            Math.cos(Nr) *
            Math.cos(v + wr)
            -
            Math.sin(Nr) *
            Math.sin(v + wr) *
            Math.cos(ir)
        );

    const yh =
        r *
        (
            Math.sin(Nr) *
            Math.cos(v + wr)
            +
            Math.cos(Nr) *
            Math.sin(v + wr) *
            Math.cos(ir)
        );

    const zh =
        r *
        Math.sin(v + wr) *
        Math.sin(ir);

    // Longitude e latitude eclípticas (geocêntricas, geométricas).
    const lon =
        Math.atan2(yh, xh) *
        180 /
        Math.PI;

    const lat =
        Math.atan2(
            zh,
            Math.sqrt(xh * xh + yh * yh)
        ) *
        180 /
        Math.PI;

    // Perturbações principais da Lua (Schlyter).
    const Dr = D * Math.PI / 180;
    const Fr = F * Math.PI / 180;
    const MrP = M * Math.PI / 180;
    const MsP = Ms * Math.PI / 180;

    const lonPert =
        -1.274 * Math.sin(MrP - 2 * Dr)
        + 0.658 * Math.sin(2 * Dr)
        - 0.186 * Math.sin(MsP)
        - 0.059 * Math.sin(2 * MrP - 2 * Dr)
        - 0.057 * Math.sin(MrP - 2 * Dr + MsP)
        + 0.053 * Math.sin(MrP + 2 * Dr)
        + 0.046 * Math.sin(2 * Dr - MsP)
        + 0.041 * Math.sin(MrP - MsP)
        - 0.035 * Math.sin(Dr)
        - 0.031 * Math.sin(MrP + MsP)
        - 0.015 * Math.sin(2 * Fr - 2 * Dr)
        + 0.011 * Math.sin(MrP - 4 * Dr);

    const latPert =
        -0.173 * Math.sin(Fr - 2 * Dr)
        - 0.055 * Math.sin(MrP - Fr - 2 * Dr)
        - 0.046 * Math.sin(MrP + Fr - 2 * Dr)
        + 0.033 * Math.sin(Fr + 2 * Dr)
        + 0.017 * Math.sin(2 * MrP + Fr);

    const rPert =
        -0.58 * Math.cos(MrP - 2 * Dr)
        - 0.46 * Math.cos(2 * Dr);

    // Posição eclíptica já corrigida (coordenadas retangulares).
    const lonC =
        (lon + lonPert) *
        Math.PI /
        180;

    const latC =
        (lat + latPert) *
        Math.PI /
        180;

    const rC =
        r + rPert;

    const xhC =
        rC * Math.cos(latC) * Math.cos(lonC);

    const yhC =
        rC * Math.cos(latC) * Math.sin(lonC);

    const zhC =
        rC * Math.sin(latC);

    const obliquity =
        23.4393 *
        Math.PI /
        180;

    const ye =
        yhC *
        Math.cos(obliquity)
        -
        zhC *
        Math.sin(obliquity);

    const ze =
        yhC *
        Math.sin(obliquity)
        +
        zhC *
        Math.cos(obliquity);

    return {

        ra:
            normalize360(
                Math.atan2(
                    ye,
                    xhC
                ) *
                180 /
                Math.PI
            ),

        dec:
            Math.atan2(
                ze,
                Math.sqrt(
                    xhC * xhC +
                    ye * ye
                )
            ) *
            180 /
            Math.PI,

        eclipticLongitude:
            normalize360(lon + lonPert),

        distance:
            rC
    };
}


function greenwichSiderealTime(
    jd
) {

    const T =
        (
            jd -
            2451545.0
        ) /
        36525;

    let theta =
        280.46061837
        +
        360.98564736629 *
        (
            jd -
            2451545.0
        )
        +
        0.000387933 *
        T * T
        -
        T * T * T /
        38710000;

    return normalize360(theta);
}


function moonAltitudeFallback(
    date
) {

    const moon =
        moonPositionFallback(
            julianDay(date)
        );

    const lat =
        SITE_LATITUDE *
        Math.PI /
        180;

    const dec =
        moon.dec *
        Math.PI /
        180;

    let ha =
        greenwichSiderealTime(
            julianDay(date)
        )
        +
        SITE_LONGITUDE
        -
        moon.ra;

    ha =
        normalize360(ha);

    if (ha > 180) {
        ha -= 360;
    }

    const haRad =
        ha *
        Math.PI /
        180;

    const geocentric =
        Math.asin(
            Math.sin(lat) *
            Math.sin(dec)
            +
            Math.cos(lat) *
            Math.cos(dec) *
            Math.cos(haRad)
        ) *
        180 /
        Math.PI;

    // Paralaxe: converte a altitude geocêntrica em topocêntrica (o
    // observador está na superfície, não no centro da Terra).
    const parallax =
        Math.asin(
            1 /
            moon.distance
        ) *
        180 /
        Math.PI;

    return (
        geocentric -
        parallax *
        Math.cos(geocentric * Math.PI / 180)
    );
}


function refineMoonCrossingFallback(
    left,
    right,
    horizon,
    rising
) {

    for (
        let i = 0;
        i < 25;
        i++
    ) {

        const middle =
            new Date(
                (
                    left.getTime() +
                    right.getTime()
                ) / 2
            );

        const altitude =
            moonAltitudeFallback(
                middle
            );

        if (rising) {

            if (
                altitude >=
                horizon
            ) {
                right = middle;
            } else {
                left = middle;
            }

        } else {

            if (
                altitude <
                horizon
            ) {
                right = middle;
            } else {
                left = middle;
            }
        }
    }

    return new Date(
        (
            left.getTime() +
            right.getTime()
        ) / 2
    );
}


function collectMoonCrossings(startMs, endMs, stepMs) {

    const horizon = MOON_RISE_SET_HORIZON;

    const crossings = [];

    let previous =
        new Date(startMs);

    let previousAltitude =
        moonAltitudeFallback(previous);

    for (let t = startMs + stepMs; t <= endMs; t += stepMs) {

        const current =
            new Date(t);

        const altitude =
            moonAltitudeFallback(current);

        if (previousAltitude < horizon && altitude >= horizon) {

            crossings.push({
                type: "rise",
                date: refineMoonCrossingFallback(previous, current, horizon, true)
            });

        } else if (previousAltitude >= horizon && altitude < horizon) {

            crossings.push({
                type: "set",
                date: refineMoonCrossingFallback(previous, current, horizon, false)
            });
        }

        previous = current;
        previousAltitude = altitude;
    }

    return crossings;
}


function lastCrossingBefore(crossings, type, ms) {

    let found = null;

    for (const c of crossings) {

        if (c.type === type && c.date.getTime() < ms) {
            found = c.date;
        }
    }

    return found;
}


function firstCrossingAfter(crossings, type, ms) {

    for (const c of crossings) {

        if (c.type === type && c.date.getTime() > ms) {
            return c.date;
        }
    }

    return null;
}


function calculateMoonTimesFallback() {

    const p =
        getSiteDateParts();

    const start =
        siteLocalTimeToDate(
            p.year,
            p.month,
            p.day,
            0,
            0
        );

    const end =
        siteLocalTimeToDate(
            p.year,
            p.month,
            p.day,
            0,
            1440
        );

    const step =
        5 * 60 * 1000;

    // Cruzamentos cobrindo ontem, hoje e amanhã, para encontrar os
    // eventos vizinhos do momento atual.
    const crossings =
        collectMoonCrossings(
            start.getTime() - 86400000,
            end.getTime() + 86400000,
            step
        );

    const now =
        new Date();

    const nowMs =
        now.getTime();

    const aboveHorizon =
        moonAltitudeFallback(now) >= MOON_RISE_SET_HORIZON;

    let moonrise = null;
    let moonset = null;

    if (aboveHorizon) {

        // A Lua está no céu: último nascer (antes de agora) e próximo
        // pôr (depois de agora). Podem ser de datas civis diferentes.
        moonrise =
            lastCrossingBefore(crossings, "rise", nowMs);

        moonset =
            firstCrossingAfter(crossings, "set", nowMs);

    } else {

        // A Lua não está no céu: próximo nascer e o pôr correspondente
        // a esse mesmo período de visibilidade.
        moonrise =
            firstCrossingAfter(crossings, "rise", nowMs);

        moonset =
            moonrise
                ? firstCrossingAfter(
                    crossings,
                    "set",
                    moonrise.getTime()
                )
                : null;
    }

    return {
        moonrise: moonrise,
        moonset: moonset,
        moonriseOutroDia: !!moonrise && !isSiteToday(moonrise),
        moonsetOutroDia: !!moonset && !isSiteToday(moonset)
    };
}


// Aplica os horários de nascer/pôr da Lua já com o critério acima e a
// cor de "outro dia".
function updateMoonRiseSet() {

    const moon =
        calculateMoonTimesFallback();

    setMoonTime(
        "moonrise",
        moon.moonrise,
        moon.moonriseOutroDia
    );

    setMoonTime(
        "moonset",
        moon.moonset,
        moon.moonsetOutroDia
    );
}


// ============================================================
// SOL — EXIBIÇÃO
// ============================================================

function updateSunTimes() {

    const sun =
        calculateSunTimesFallback();

    setText(
        "sunrise",
        formatSiteTime(
            sun.sunrise
        )
    );

    setText(
        "sunset",
        formatSiteTime(
            sun.sunset
        )
    );
}


function formatMoonEventDate(date) {

    if (!(date instanceof Date) ||
        Number.isNaN(date.getTime())) {
        return "--/-- (---)";
    }

    const local =
        new Date(
            date.getTime() +
            SITE_TIMEZONE_OFFSET_MINUTES * 60000
        );

    const weekdays = [
        "dom", "seg", "ter", "qua",
        "qui", "sex", "sáb"
    ];

    return (
        String(local.getUTCDate()).padStart(2, "0") +
        "/" +
        String(local.getUTCMonth() + 1).padStart(2, "0") +
        " (" +
        weekdays[local.getUTCDay()] +
        ")"
    );
}


function getMoonPhaseInfo(ageDays) {

    const synodicMonth = 29.530588853;
    const fraction =
        (((ageDays % synodicMonth) + synodicMonth) % synodicMonth) /
        synodicMonth;

    const phases = [
        {max: 1 / 16, name: "Lua nova", icon: "🌑"},
        {max: 3 / 16, name: "Crescente", icon: "🌒"},
        {max: 5 / 16, name: "Quarto crescente", icon: "🌓"},
        {max: 7 / 16, name: "Crescente gibosa", icon: "🌔"},
        {max: 9 / 16, name: "Lua cheia", icon: "🌕"},
        {max: 11 / 16, name: "Minguante gibosa", icon: "🌖"},
        {max: 13 / 16, name: "Quarto minguante", icon: "🌗"},
        {max: 15 / 16, name: "Minguante", icon: "🌘"},
        {max: 1, name: "Lua nova", icon: "🌑"}
    ];

    return phases.find(phase => fraction < phase.max) || phases[0];
}


// ============================================================
// FASES DA LUA — CÁLCULO LOCAL
// ------------------------------------------------------------
// A fase vem da elongação real Sol–Lua (as longitudes eclípticas
// já são calculadas pelos modelos local do Sol e da Lua). As
// datas das próximas fases são obtidas por bisseção.
// ============================================================

// Elongação Sol–Lua em graus (0 = Lua nova, 180 = Lua cheia).
function solarLunarElongation(date) {

    const jd =
        julianDay(date);

    const sun =
        sunPositionFallback(jd);

    const moon =
        moonPositionFallback(jd);

    return normalize360(
        moon.eclipticLongitude -
        sun.eclipticLongitude
    );
}


// Diferença (graus) entre a elongação e uma fase alvo,
// normalizada para (-180, 180]. Zero indica a fase exata.
function phaseOffset(date, targetDeg) {

    let offset =
        solarLunarElongation(date) - targetDeg;

    offset =
        normalize360(offset);

    if (offset > 180) {
        offset -= 360;
    }

    return offset;
}


// Instante exato da fase entre dois instantes que a contêm.
function bisectPhase(leftMs, rightMs, targetDeg) {

    for (let i = 0; i < 40; i++) {

        const middleMs =
            (leftMs + rightMs) / 2;

        if (
            phaseOffset(new Date(middleMs), targetDeg) <= 0
        ) {
            leftMs = middleMs;
        } else {
            rightMs = middleMs;
        }
    }

    return new Date(
        (leftMs + rightMs) / 2
    );
}


// Primeira ocorrência da fase alvo depois de fromMs.
function findNextPhase(fromMs, targetDeg) {

    const stepMs =
        6 * 3600000;

    const limitMs =
        fromMs + 40 * 86400000;

    let previousMs = fromMs;

    let previousOffset =
        phaseOffset(new Date(previousMs), targetDeg);

    for (
        let t = fromMs + stepMs;
        t <= limitMs;
        t += stepMs
    ) {

        const offset =
            phaseOffset(new Date(t), targetDeg);

        if (previousOffset <= 0 && offset > 0) {
            return bisectPhase(previousMs, t, targetDeg);
        }

        previousMs = t;
        previousOffset = offset;
    }

    return null;
}


// Última ocorrência da fase alvo antes de toMs.
function findPreviousPhase(toMs, targetDeg) {

    const stepMs =
        6 * 3600000;

    const startMs =
        toMs - 40 * 86400000;

    let result = null;

    let previousMs = startMs;

    let previousOffset =
        phaseOffset(new Date(previousMs), targetDeg);

    for (
        let t = startMs + stepMs;
        t <= toMs;
        t += stepMs
    ) {

        const offset =
            phaseOffset(new Date(t), targetDeg);

        if (previousOffset <= 0 && offset > 0) {

            const instant =
                bisectPhase(previousMs, t, targetDeg);

            if (instant.getTime() <= toMs) {
                result = instant;
            }
        }

        previousMs = t;
        previousOffset = offset;
    }

    return result;
}


function updateMoonEventFallback(
    selector,
    label,
    icon,
    date
) {

    const el =
        container.querySelector(selector);

    if (!el) {
        return;
    }

    const labelEl =
        el.querySelector(".moon-event-label");

    const iconEl =
        el.querySelector(".moon-event-icon");

    const dateEl =
        el.querySelector(".moon-event-date");

    if (labelEl) {
        labelEl.textContent = label;
    }

    if (iconEl) {
        iconEl.textContent = icon;
    }

    if (dateEl) {
        dateEl.textContent =
            "em " +
            formatMoonEventDate(date);
    }
}


function updateMoonPhaseFallback() {

    const now =
        new Date();

    const previousNew =
        findPreviousPhase(now.getTime(), 0);

    const ageDays =
        previousNew
            ? (now.getTime() - previousNew.getTime()) / 86400000
            : 0;

    const phase =
        getMoonPhaseInfo(ageDays);

    setText(
        "moonIcon",
        phase.icon
    );

    setText(
        "moonPhaseName",
        phase.name
    );

    setText(
        "moonAge",
        ageDays.toFixed(1).replace(".", ",") +
        " dias"
    );

    const nextFull =
        findNextPhase(now.getTime(), 180);

    const nextNew =
        findNextPhase(now.getTime(), 0);

    updateMoonEventFallback(
        "#nextFullMoon",
        "Lua cheia",
        "🌕",
        nextFull
    );

    updateMoonEventFallback(
        "#nextNewMoon",
        "Lua nova",
        "🌑",
        nextNew
    );

    // Mostra primeiro a próxima fase a ocorrer.
    const moonEvents =
        container.querySelector(".moon-events");

    const fullEvent =
        container.querySelector("#nextFullMoon");

    const newEvent =
        container.querySelector("#nextNewMoon");

    if (moonEvents && fullEvent && newEvent) {

        const fullFirst =
            nextFull &&
            nextNew &&
            nextFull.getTime() < nextNew.getTime();

        if (fullFirst) {
            moonEvents.appendChild(fullEvent);
            moonEvents.appendChild(newEvent);
        } else {
            moonEvents.appendChild(newEvent);
            moonEvents.appendChild(fullEvent);
        }
    }
}


// ============================================================
// ESTAÇÕES DO ANO — HEMISFÉRIO SUL
// ------------------------------------------------------------
// Equinócios e solstícios calculados localmente (fórmulas de
// Meeus, cap. 27).
// ============================================================

// Equinócios e solstícios vistos do hemisfério Sul.
const SOUTH_SEASONS = {
    3: { name: "Outono", icon: "🍁" },
    6: { name: "Inverno", icon: "❄️" },
    9: { name: "Primavera", icon: "🌸" },
    12: { name: "Verão", icon: "☀️" }
};


function formatSeasonDate(date) {

    if (
        !(date instanceof Date) ||
        Number.isNaN(date.getTime())
    ) {
        return "--/--- (---)";
    }

    const local =
        new Date(
            date.getTime() +
            SITE_TIMEZONE_OFFSET_MINUTES * 60000
        );

    const months = [
        "jan", "fev", "mar", "abr",
        "mai", "jun", "jul", "ago",
        "set", "out", "nov", "dez"
    ];

    const weekdays = [
        "dom", "seg", "ter", "qua",
        "qui", "sex", "sáb"
    ];

    return (
        String(local.getUTCDate()).padStart(2, "0") +
        "/" +
        months[local.getUTCMonth()] +
        " (" +
        weekdays[local.getUTCDay()] +
        ")"
    );
}


// ============================================================
// ESTAÇÕES — CÁLCULO LOCAL
// ------------------------------------------------------------
// Aproximação pelas fórmulas de Meeus (Astronomical Algorithms,
// cap. 27).
// ============================================================

function seasonEventFallbackJDE(year, index) {

    // 0 = equinócio de março, 1 = solstício de junho,
    // 2 = equinócio de setembro, 3 = solstício de dezembro.

    const table = [
        [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
        [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.00030],
        [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
        [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032]
    ];

    const y2 =
        (year - 2000) / 1000;

    const t =
        table[index];

    // JDE (Tempo Terrestre). A conversão para instante absoluto
    // ignora o ΔT (≈ 70 s), irrelevante para exibição ao dia.
    return (
        t[0] +
        t[1] * y2 +
        t[2] * y2 * y2 +
        t[3] * y2 * y2 * y2 +
        t[4] * y2 * y2 * y2 * y2
    );
}


function buildSeasonEventsFallback(year) {

    const months = [3, 6, 9, 12];

    const events = [];

    for (let i = 0; i < months.length; i++) {

        const season =
            SOUTH_SEASONS[months[i]];

        if (!season) {
            continue;
        }

        events.push({
            name: season.name,
            icon: season.icon,
            date: new Date(
                (seasonEventFallbackJDE(year, i) - 2440587.5) *
                86400000
            )
        });
    }

    return events;
}


function updateSeasonFallback() {

    const year =
        getSiteDateParts().year;

    const events =
        buildSeasonEventsFallback(year - 1)
            .concat(buildSeasonEventsFallback(year))
            .concat(buildSeasonEventsFallback(year + 1));

    if (!events.length) {
        return;
    }

    const sorted =
        events
            .slice()
            .sort((a, b) => a.date - b.date);

    const now =
        new Date();

    const previous =
        sorted.filter(
            item => item.date.getTime() <= now.getTime()
        );

    const current =
        previous[previous.length - 1];

    const next =
        sorted.filter(
            item => item.date.getTime() > now.getTime()
        )[0];

    const nowIcon =
        container.querySelector("#seasonNowIcon");

    const nowName =
        container.querySelector("#seasonNowName");

    const nextIcon =
        container.querySelector("#seasonNextIcon");

    const nextText =
        container.querySelector("#seasonNextText");

    if (nowIcon && current) {
        nowIcon.textContent = current.icon;
    }

    if (nowName && current) {
        nowName.textContent = current.name;
    }

    if (nextIcon && next) {
        nextIcon.textContent = next.icon;
    }

    if (nextText && next) {
        nextText.textContent =
            next.name +
            " em " +
            formatSeasonDate(next.date);
    }
}


function updateAstronomy() {

    updateSunTimes();

    updateMoonRiseSet();

    updateMoonPhaseFallback();

    updateSeasonFallback();
}

// ============================================================
// DADOS
// ============================================================

function updateGlobalStaleness() {
    if (!lastUpdateTimestamp) return;
    const el = container.querySelector("#lastUpdate");
    if (!el) return;
    el.classList.toggle("atrasado", Date.now() - lastUpdateTimestamp > 5*60*1000);
}

function updateDisplay(getValue) {
    const keys = {
        windSpeed: "wind_speed",
        windGust: "wind_gust",
        windDirection: "wind_direction_10min",
        rainRate: "rain_rate",
        rainHour: "rain_hour",
        rainDay: "rain_day",
        rainWeek: "rain_week",
        rainMonth: "rain_month",
        rainYear: "rain_year"
    };

    const values = {};
    Object.keys(keys).forEach(id => {
        values[id] = getValue(DEVICE_ECOWITT, keys[id]);
    });

    if (values.windSpeed) setText("windSpeed", format1(values.windSpeed.value));
    if (values.windGust) setText("windGust", format1(values.windGust.value));

    if (values.windDirection) {
        const d = Number(values.windDirection.value);
        setText("windDirection", windDirectionName(d));
        setText("windDegrees", Number.isFinite(d) ? `(${Math.round(d)}°)` : "");
    }

    if (values.rainRate) setText("rainRate", format1(values.rainRate.value));
    if (values.rainHour) setText("rainHour", format1(values.rainHour.value));
    if (values.rainDay) setText("rainDay", format1(values.rainDay.value));
    if (values.rainWeek) setText("rainWeek", format0(values.rainWeek.value));
    if (values.rainMonth) setText("rainMonth", format0(values.rainMonth.value));
    if (values.rainYear) setText("rainYear", format0(values.rainYear.value));

    const all = Object.values(values).filter(Boolean);
    if (!all.length) return;

    lastUpdateTimestamp = Math.max(...all.map(x => Number(x.timestamp)));
    const last = container.querySelector("#lastUpdate");
    if (last) {
        last.textContent = "Dados: " + formatTimestamp(lastUpdateTimestamp);
        updateGlobalStaleness();
    }
}

// ============================================================
// SUBSCRIPTION
// ============================================================

const subscriptionOptions = {
    type: "latest",
    datasources: [{
        type: "entity",
        entityFilter: {
            type: "singleEntity",
            singleEntity: {
                entityType: "DEVICE",
                id: DEVICE_ECOWITT
            }
        },
        dataKeys: [
            "wind_speed",
            "wind_gust",
            "wind_direction_10min",
            "rain_rate",
            "rain_hour",
            "rain_day",
            "rain_week",
            "rain_month",
            "rain_year"
        ].map(name => ({type:"timeseries", name, settings:{}}))
    }],
    callbacks: {
        onDataUpdated: (subscription) => {
            const data = subscription.data;
            updateDisplay((deviceId, key) => {
                if (deviceId !== DEVICE_ECOWITT) return null;
                const item = data.find(d =>
                    d.dataKey.name === key &&
                    d.datasource &&
                    d.datasource.entityFilter &&
                    d.datasource.entityFilter.singleEntity &&
                    d.datasource.entityFilter.singleEntity.id === deviceId
                );
                if (!item || !item.data || !item.data.length) return null;
                const p = item.data[item.data.length - 1];
                return {timestamp:Number(p[0]), value:p[1]};
            });
        }
    }
};

ctx.subscriptionApi
    .createSubscription(subscriptionOptions, true)
    .subscribe(subscription => {
        ctx.defaultSubscription = subscription;
    });

// ============================================================
// REFRESH MANUAL
// ============================================================

const refreshButton = container.querySelector("#refreshButton");

if (refreshButton) {
    refreshButton.addEventListener("click", () => {
        refreshButton.disabled = true;

        const keys = [
            "wind_speed",
            "wind_gust",
            "wind_direction_10min",
            "rain_rate",
            "rain_hour",
            "rain_day",
            "rain_week",
            "rain_month",
            "rain_year"
        ].join(",");

        const url = `/api/plugins/telemetry/DEVICE/${DEVICE_ECOWITT}/values/timeseries?keys=${keys}`;

        ctx.http.get(url).subscribe(
            response => {
                const values = {};

                Object.keys(response).forEach(key => {
                    const points = response[key];
                    if (!points || !points.length) return;

                    let latest = points[0];
                    for (let i = 1; i < points.length; i++) {
                        if (Number(points[i].ts) > Number(latest.ts)) latest = points[i];
                    }
                    values[key] = {timestamp:Number(latest.ts), value:latest.value};
                });

                updateDisplay((deviceId, key) =>
                    deviceId === DEVICE_ECOWITT ? (values[key] || null) : null
                );

                refreshButton.disabled = false;
            },
            error => {
                console.error("Erro ao atualizar Ecowitt:", error);
                refreshButton.disabled = false;
            }
        );
    });
}

// ============================================================
// HELP
// ============================================================

const helpButton = container.querySelector("#helpButton");
const helpOverlay = container.querySelector("#helpOverlay");
const helpClose = container.querySelector("#helpClose");

if (helpButton && helpOverlay) {
    helpButton.addEventListener("click", () => {
        helpOverlay.hidden = false;
    });
}

if (helpClose && helpOverlay) {
    helpClose.addEventListener("click", () => {
        helpOverlay.hidden = true;
    });
}

if (helpOverlay) {
    helpOverlay.addEventListener("click", event => {
        if (event.target === helpOverlay) helpOverlay.hidden = true;
    });
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && helpOverlay && !helpOverlay.hidden) {
        helpOverlay.hidden = true;
    }
});

updateLayoutClass();

window.addEventListener(
    "resize",
    updateLayoutClass
);

if (typeof ResizeObserver !== "undefined") {

    new ResizeObserver(
        updateLayoutClass
    ).observe(container);
}

setInterval(updateGlobalStaleness, 30000);
updateAstronomy();
setInterval(updateAstronomy, 60000);
