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

let lastUpdateTimestamp = null;

function setText(id, value) {
    const el = container.querySelector("#" + id);
    
    if (el) el.textContent = value;
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
// Fonte primária: USNO Astronomical Applications Department.
//
// O USNO calcula nascer/pôr do Sol e da Lua para a coordenada
// e a data local informadas. O resultado é mostrado ao minuto.
// O cálculo local abaixo é apenas fallback caso o serviço
// externo não esteja disponível.
// ============================================================

const USNO_API_BASE =
    "https://aa.usno.navy.mil/api/rstt/oneday";

const USNO_MOON_PHASES_API =
    "https://aa.usno.navy.mil/api/moon/phases/date";

let astronomyDateKey = null;
let astronomyRequestInProgress = false;
let moonPhaseDateKey = null;
let moonPhaseRequestInProgress = false;


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


function getSiteDateKey() {

    const p =
        getSiteDateParts();

    return (
        String(p.year).padStart(4, "0") +
        "-" +
        String(p.month).padStart(2, "0") +
        "-" +
        String(p.day).padStart(2, "0")
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

    const local =
        new Date(
            date.getTime() +
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
// CONVERTE "HH:MM" DO USNO
// ============================================================

function parseUSNOTime(
    text,
    year,
    month,
    day
) {

    if (
        typeof text !== "string"
    ) {
        return null;
    }

    const match =
        text.match(
            /^(\d{1,2}):(\d{2})/
        );

    if (!match) {
        return null;
    }

    const hour =
        Number(match[1]);

    const minute =
        Number(match[2]);

    if (
        hour > 23 ||
        minute > 59
    ) {
        return null;
    }

    return siteLocalTimeToDate(
        year,
        month,
        day,
        hour,
        minute
    );
}


// ============================================================
// PROCURA UM EVENTO NAS LISTAS DO USNO
// ============================================================

function findUSNOEvent(
    list,
    names,
    year,
    month,
    day
) {

    if (!Array.isArray(list)) {
        return null;
    }

    for (
        const item of list
    ) {

        if (
            !item ||
            typeof item !== "object"
        ) {
            continue;
        }

        const phen =
            String(
                item.phen || ""
            ).trim().toLowerCase();

        if (
            !names.some(
                n =>
                    phen ===
                    String(n).toLowerCase()
            )
        ) {
            continue;
        }

        const result =
            parseUSNOTime(
                item.time,
                year,
                month,
                day
            );

        if (result) {
            return result;
        }
    }

    return null;
}


// ============================================================
// SOL — FALLBACK LOCAL
// ------------------------------------------------------------
// Fórmulas NOAA.
// ============================================================

function dayOfYear(
    year,
    month,
    day
) {

    const start =
        Date.UTC(
            year,
            0,
            1
        );

    const current =
        Date.UTC(
            year,
            month - 1,
            day
        );

    return (
        Math.floor(
            (
                current -
                start
            ) / 86400000
        )
    ) + 1;
}


function calculateSunTimesFallback() {

    const p =
        getSiteDateParts();

    const n =
        dayOfYear(
            p.year,
            p.month,
            p.day
        );

    const gamma =
        2 *
        Math.PI /
        365 *
        (n - 1);

    const equationOfTime =
        229.18 *
        (
            0.000075
            +
            0.001868 *
            Math.cos(gamma)
            -
            0.032077 *
            Math.sin(gamma)
            -
            0.014615 *
            Math.cos(
                2 * gamma
            )
            -
            0.040849 *
            Math.sin(
                2 * gamma
            )
        );

    const declination =
        0.006918
        -
        0.399912 *
        Math.cos(gamma)
        +
        0.070257 *
        Math.sin(gamma)
        -
        0.006758 *
        Math.cos(
            2 * gamma
        )
        +
        0.000907 *
        Math.sin(
            2 * gamma
        )
        -
        0.002697 *
        Math.cos(
            3 * gamma
        )
        +
        0.001480 *
        Math.sin(
            3 * gamma
        );

    const latRad =
        SITE_LATITUDE *
        Math.PI /
        180;

    const zenith =
        90.833 *
        Math.PI /
        180;

    const cosH =
        (
            Math.cos(zenith) /
            (
                Math.cos(latRad) *
                Math.cos(declination)
            )
        )
        -
        Math.tan(latRad) *
        Math.tan(declination);

    if (
        cosH > 1 ||
        cosH < -1
    ) {
        return {
            sunrise: null,
            sunset: null
        };
    }

    const H =
        Math.acos(cosH) *
        180 /
        Math.PI;

    const noon =
        720
        -
        4 * SITE_LONGITUDE
        -
        equationOfTime
        +
        SITE_TIMEZONE_OFFSET_MINUTES;

    return {

        sunrise:
            siteLocalTimeToDate(
                p.year,
                p.month,
                p.day,
                0,
                noon - H * 4
            ),

        sunset:
            siteLocalTimeToDate(
                p.year,
                p.month,
                p.day,
                0,
                noon + H * 4
            )
    };
}


// ============================================================
// LUA — FALLBACK LOCAL
// ------------------------------------------------------------
// Mantido somente como contingência quando o USNO não responder.
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

    const obliquity =
        23.4393 *
        Math.PI /
        180;

    const ye =
        yh *
        Math.cos(obliquity)
        -
        zh *
        Math.sin(obliquity);

    const ze =
        yh *
        Math.sin(obliquity)
        +
        zh *
        Math.cos(obliquity);

    return {

        ra:
            normalize360(
                Math.atan2(
                    ye,
                    xh
                ) *
                180 /
                Math.PI
            ),

        dec:
            Math.atan2(
                ze,
                Math.sqrt(
                    xh * xh +
                    ye * ye
                )
            ) *
            180 /
            Math.PI,

        distance:
            r
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

    return (
        Math.asin(
            Math.sin(lat) *
            Math.sin(dec)
            +
            Math.cos(lat) *
            Math.cos(dec) *
            Math.cos(haRad)
        )
        *
        180 /
        Math.PI
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

    const horizon =
        -0.30;

    const step =
        5 * 60 * 1000;

    let previous =
        start;

    let previousAltitude =
        moonAltitudeFallback(
            previous
        );

    let rise = null;
    let set = null;

    for (
        let t =
            start.getTime() + step;

        t <=
            end.getTime();

        t += step
    ) {

        const current =
            new Date(t);

        const altitude =
            moonAltitudeFallback(
                current
            );

        if (
            !rise &&
            previousAltitude <
                horizon &&
            altitude >=
                horizon
        ) {

            rise =
                refineMoonCrossingFallback(
                    previous,
                    current,
                    horizon,
                    true
                );
        }

        if (
            !set &&
            previousAltitude >=
                horizon &&
            altitude <
                horizon
        ) {

            set =
                refineMoonCrossingFallback(
                    previous,
                    current,
                    horizon,
                    false
                );
        }

        previous =
            current;

        previousAltitude =
            altitude;
    }

    return {
        moonrise: rise,
        moonset: set
    };
}


// ============================================================
// ASTRONOMIA — FALLBACK
// ============================================================

function updateAstronomyLocalFallback() {

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

    setTimeout(() => {

        const moon =
            calculateMoonTimesFallback();

        setText(
            "moonrise",
            formatSiteTime(
                moon.moonrise
            )
        );

        setText(
            "moonset",
            formatSiteTime(
                moon.moonset
            )
        );

    }, 0);
}


// ============================================================
// ASTRONOMIA — USNO
// ============================================================

function updateAstronomyFromUSNO() {

    if (
        astronomyRequestInProgress
    ) {
        return;
    }

    const dateKey =
        getSiteDateKey();

    if (
        astronomyDateKey ===
        dateKey
    ) {
        return;
    }

    astronomyRequestInProgress =
        true;

    const p =
        getSiteDateParts();

    const url =
        USNO_API_BASE +
        "?date=" +
        dateKey +
        "&coords=" +
        SITE_LATITUDE +
        "," +
        SITE_LONGITUDE +
        "&tz=-3";

    ctx.http.get(url).subscribe(

        response => {

            try {

                const data =
                    response &&
                    response.properties &&
                    response.properties.data
                        ? response.properties.data
                        : response &&
                          response.data
                            ? response.data
                            : response;

                const sunData =
                    data &&
                    Array.isArray(
                        data.sundata
                    )
                        ? data.sundata
                        : [];

                const moonData =
                    data &&
                    Array.isArray(
                        data.moondata
                    )
                        ? data.moondata
                        : [];
                        
                const sunrise =
                    findUSNOEvent(
                        sunData,
                        ["Rise"],
                        p.year,
                        p.month,
                        p.day
                    );

                const sunset =
                    findUSNOEvent(
                        sunData,
                        ["Set"],
                        p.year,
                        p.month,
                        p.day
                    );

                const moonrise =
                    findUSNOEvent(
                        moonData,
                        ["Rise"],
                        p.year,
                        p.month,
                        p.day
                    );

                const moonset =
                    findUSNOEvent(
                        moonData,
                        ["Set"],
                        p.year,
                        p.month,
                        p.day
                    );

                if (
                    sunrise ||
                    sunset ||
                    moonrise ||
                    moonset
                ) {

                    setText(
                        "sunrise",
                        formatSiteTime(
                            sunrise
                        )
                    );

                    setText(
                        "sunset",
                        formatSiteTime(
                            sunset
                        )
                    );

                    setText(
                        "moonrise",
                        formatSiteTime(
                            moonrise
                        )
                    );

                    setText(
                        "moonset",
                        formatSiteTime(
                            moonset
                        )
                    );

                    astronomyDateKey =
                        dateKey;

                } else {

                    console.warn(
                        "USNO não retornou eventos."
                    );

                    updateAstronomyLocalFallback();

                    astronomyDateKey =
                        dateKey;
                }

            } catch (error) {

                console.error(
                    "Erro ao interpretar USNO:",
                    error
                );

                updateAstronomyLocalFallback();

                astronomyDateKey =
                    dateKey;
            }

            astronomyRequestInProgress =
                false;
        },

        error => {

            console.warn(
                "USNO indisponível; usando fallback local.",
                error
            );

            updateAstronomyLocalFallback();

            astronomyDateKey =
                dateKey;

            astronomyRequestInProgress =
                false;
        }
    );
}


// ============================================================
// FASES DA LUA — USNO
// ------------------------------------------------------------
// Usa as datas das fases principais calculadas pelo USNO.
// A idade da Lua é o tempo decorrido desde a última Lua Nova.
// ============================================================

function getSiteDateKeyOffset(days) {

    const d =
        new Date(
            getSiteNow().getTime() +
            days * 86400000
        );

    return (
        String(d.getUTCFullYear()).padStart(4, "0") +
        "-" +
        String(d.getUTCMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getUTCDate()).padStart(2, "0")
    );
}


function parseUSNOPhaseDate(item) {

    if (!item) return null;

    const year = Number(item.year);
    const month = Number(item.month);
    const day = Number(item.day);

    const match =
        String(item.time || "").match(/^(\d{1,2}):(\d{2})/);

    if (!Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        !match) {
        return null;
    }

    return new Date(
        Date.UTC(
            year,
            month - 1,
            day,
            Number(match[1]),
            Number(match[2]),
            0,
            0
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



function updateMoonPhaseDisplay(phases) {

    if (!Array.isArray(phases) || !phases.length) {
        return;
    }

    const now = new Date();

    const events =
        phases
            .map(item => ({
                phase: String(item.phase || "").trim(),
                date: parseUSNOPhaseDate(item)
            }))
            .filter(item => item.date);

    const newMoons =
        events.filter(item =>
            /new moon/i.test(item.phase)
        );

    const fullMoons =
        events.filter(item =>
            /full moon/i.test(item.phase)
        );

    const previousNew =
        newMoons
            .filter(item =>
                item.date.getTime() <= now.getTime()
            )
            .sort((a, b) => b.date - a.date)[0];

    if (previousNew) {

        const ageDays =
            (now.getTime() - previousNew.date.getTime()) /
            86400000;

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
    }

    const nextFull =
        fullMoons
            .filter(item =>
                item.date.getTime() > now.getTime()
            )
            .sort((a, b) => a.date - b.date)[0];

    const nextNew =
        newMoons
            .filter(item =>
                item.date.getTime() > now.getTime()
            )
            .sort((a, b) => a.date - b.date)[0];


    // ========================================================
    // PRÓXIMA LUA CHEIA
    // ========================================================

    if (nextFull) {

        const el =
            container.querySelector("#nextFullMoon");

        if (el) {

            const label =
                el.querySelector(".moon-event-label");

            const icon =
                el.querySelector(".moon-event-icon");

            const date =
                el.querySelector(".moon-event-date");

            if (label) {
                label.textContent = "Lua cheia";
            }

            if (icon) {
                icon.textContent = "🌕";
            }

            if (date) {
                date.textContent =
                    "em " +
                    formatMoonEventDate(
                        nextFull.date
                    );
            }
        }
    }


    // ========================================================
    // PRÓXIMA LUA NOVA
    // ========================================================

    if (nextNew) {

        const el =
            container.querySelector("#nextNewMoon");

        if (el) {

            const label =
                el.querySelector(".moon-event-label");

            const icon =
                el.querySelector(".moon-event-icon");

            const date =
                el.querySelector(".moon-event-date");

            if (label) {
                label.textContent = "Lua nova";
            }

            if (icon) {
                icon.textContent = "🌑";
            }

            if (date) {
                date.textContent =
                    "em " +
                    formatMoonEventDate(
                        nextNew.date
                    );
            }
        }
    }
}

function updateMoonPhasesFromUSNO() {

    if (moonPhaseRequestInProgress) {
        return;
    }

    const dateKey =
        getSiteDateKey();

    if (moonPhaseDateKey === dateKey) {
        return;
    }

    moonPhaseRequestInProgress = true;

    const startDate =
        getSiteDateKeyOffset(-40);

    const url =
        USNO_MOON_PHASES_API +
        "?date=" +
        startDate +
        "&nump=12";

    ctx.http.get(url).subscribe(

        response => {

            try {

                const phases =
                    response && Array.isArray(response.phasedata)
                        ? response.phasedata
                        : response &&
                          response.data &&
                          Array.isArray(response.data.phasedata)
                            ? response.data.phasedata
                            : [];

                if (phases.length) {
                    updateMoonPhaseDisplay(phases);
                    moonPhaseDateKey = dateKey;
                }

            } catch (error) {

                console.error(
                    "Erro ao interpretar fases da Lua:",
                    error
                );
            }

            moonPhaseRequestInProgress = false;
        },

        error => {

            console.warn(
                "USNO indisponível para fases da Lua.",
                error
            );

            moonPhaseRequestInProgress = false;
        }
    );
}


function updateAstronomy() {

    updateAstronomyLocalFallback();
    updateAstronomyFromUSNO();
    updateMoonPhasesFromUSNO();
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

setInterval(updateGlobalStaleness, 30000);
updateAstronomy();
setInterval(updateAstronomy, 60000);
