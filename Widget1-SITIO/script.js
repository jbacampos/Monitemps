// ============================================================
// WIDGET 1 — SÍTIO
//
// Dados externos e internos exclusivamente do Sítio (Ecowitt).
// Não consulta o dispositivo de POA.
// ============================================================


// ============================================================
// IDENTIFICAÇÃO DO DEVICE
// ============================================================

const DEVICE_ECOWITT =
    "63eaff60-b030-11f1-940d-1f4ee055f09a";


let lastUpdateTimestamp = null;


// ============================================================
// FORMATA DATA/HORA
// ============================================================

function formatTimestamp(timestamp) {

    const date = new Date(timestamp);

    const day =
        String(date.getDate()).padStart(2, "0");

    const months = [
        "jan", "fev", "mar", "abr",
        "mai", "jun", "jul", "ago",
        "set", "out", "nov", "dez"
    ];

    const month =
        months[date.getMonth()];

    const hour =
        String(date.getHours()).padStart(2, "0");

    const minute =
        String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month} ${hour}:${minute}`;
}


// ============================================================
// ESCREVE UM VALOR DIRETO DA TELEMETRIA
//
// Se a chave não estiver disponível, o placeholder do HTML
// é preservado (mesmo comportamento do widget original).
// ============================================================

function setValue(
    elementId,
    dataPoint,
    digits
) {

    if (!dataPoint) {
        return;
    }

    const element =
        container.querySelector(
            "#" + elementId
        );

    if (!element) {
        return;
    }

    element.textContent =
        Number(dataPoint.value)
            .toFixed(digits);
}


// ============================================================
// ATUALIZA A TELA
// ============================================================

function updateDisplay(getValue) {

    // ========================================================
    // SÍTIO — EXTERNO
    // ========================================================

    const sitioExtTemp =
        getValue(
            DEVICE_ECOWITT,
            "temperature_out"
        );

    const sitioExtHumid =
        getValue(
            DEVICE_ECOWITT,
            "humidity_out"
        );

    const sitioExtFeels =
        getValue(
            DEVICE_ECOWITT,
            "feels_like_out"
        );

    const sitioExtPressure =
        getValue(
            DEVICE_ECOWITT,
            "pressure_relative"
        );

    const sitioExtDew =
        getValue(
            DEVICE_ECOWITT,
            "dew_point_out"
        );

    const sitioExtSolar =
        getValue(
            DEVICE_ECOWITT,
            "solar_radiation"
        );


    // ========================================================
    // SÍTIO — INTERNO
    // ========================================================

    const sitioIntTemp =
        getValue(
            DEVICE_ECOWITT,
            "temperature_in"
        );

    const sitioIntHumid =
        getValue(
            DEVICE_ECOWITT,
            "humidity_in"
        );


    // ========================================================
    // TEMPERATURA EXTERNA (destaque)
    // ========================================================

    setValue("sitioExtTemp", sitioExtTemp, 1);


    // ========================================================
    // DADOS COMPLEMENTARES EXTERNOS
    // ========================================================

    setValue("sitioExtHumid", sitioExtHumid, 1);

    setValue("sitioExtFeels", sitioExtFeels, 1);

    setValue("sitioExtPressure", sitioExtPressure, 0);

    setValue("sitioExtDew", sitioExtDew, 1);

    setValue("sitioExtSolar", sitioExtSolar, 0);


    // ========================================================
    // INTERNO
    // ========================================================

    setValue("sitioIntTemp", sitioIntTemp, 1);

    setValue("sitioIntHumid", sitioIntHumid, 1);


    // ========================================================
    // TIMESTAMPS
    // ========================================================

    const sitioExtTimestamp =
        latestTimestamp(
            sitioExtTemp,
            sitioExtHumid,
            sitioExtFeels,
            sitioExtPressure,
            sitioExtDew,
            sitioExtSolar
        );

    const sitioIntTimestamp =
        latestTimestamp(
            sitioIntTemp,
            sitioIntHumid
        );


    // ========================================================
    // TODOS OS DADOS
    // ========================================================

    const allValues = [

        sitioExtTemp,
        sitioExtHumid,
        sitioExtFeels,
        sitioExtPressure,
        sitioExtDew,
        sitioExtSolar,
        sitioIntTemp,
        sitioIntHumid

    ].filter(Boolean);


    if (!allValues.length) {
        return;
    }


    // ========================================================
    // ÚLTIMA ATUALIZAÇÃO GERAL
    // ========================================================

    lastUpdateTimestamp =
        Math.max(
            ...allValues.map(
                x => Number(x.timestamp)
            )
        );


    const lastUpdateElement =
        container.querySelector(
            "#lastUpdate"
        );


    if (lastUpdateElement) {

        lastUpdateElement.textContent =
            "Dados: " +
            formatTimestamp(
                lastUpdateTimestamp
            );
    }


    updateGlobalStaleness();


    // ========================================================
    // TIMESTAMPS INDIVIDUAIS
    // ========================================================

    updateIndividualTimestamp(
        "sitioExtTimestamp",
        sitioExtTimestamp
    );

    updateIndividualTimestamp(
        "sitioIntTimestamp",
        sitioIntTimestamp
    );
}


// ============================================================
// MAIOR TIMESTAMP DE UM GRUPO
// ============================================================

function latestTimestamp(...values) {

    const timestamps =
        values
            .filter(Boolean)
            .map(x => Number(x.timestamp))
            .filter(Number.isFinite);

    if (!timestamps.length) {
        return null;
    }

    return {
        timestamp: Math.max(...timestamps)
    };
}


// ============================================================
// TIMESTAMP INDIVIDUAL
// ============================================================

function updateIndividualTimestamp(
    elementId,
    groupTimestamp
) {

    const element =
        container.querySelector(
            "#" + elementId
        );

    if (!element) {
        return;
    }

    if (!groupTimestamp) {

        element.style.visibility =
            "hidden";

        return;
    }


    const difference =
        lastUpdateTimestamp -
        groupTimestamp.timestamp;


    if (difference > 5 * 60 * 1000) {

        element.textContent =
            formatTimestamp(
                groupTimestamp.timestamp
            );

        element.style.visibility =
            "visible";

    } else {

        element.style.visibility =
            "hidden";
    }
}


// ============================================================
// ATRASO DA ATUALIZAÇÃO GERAL
// ============================================================

function updateGlobalStaleness() {

    if (!lastUpdateTimestamp) {
        return;
    }

    const element =
        container.querySelector(
            "#lastUpdate"
        );

    if (!element) {
        return;
    }

    const age =
        Date.now() -
        lastUpdateTimestamp;

    element.classList.toggle(
        "atrasado",
        age > 5 * 60 * 1000
    );
}


// ============================================================
// SUBSCRIPTION
//
// Apenas o dispositivo do Sítio (Ecowitt) é consultado.
// ============================================================

const subscriptionOptions = {

    type: "latest",

    datasources: [

        {
            type: "entity",

            entityFilter: {

                type: "singleEntity",

                singleEntity: {

                    entityType: "DEVICE",

                    id: DEVICE_ECOWITT
                }
            },

            dataKeys: [

                {
                    type: "timeseries",
                    name: "temperature_out",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "humidity_out",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "feels_like_out",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "pressure_relative",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "dew_point_out",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "solar_radiation",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "temperature_in",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "humidity_in",
                    settings: {}
                }
            ]
        }
    ],


    // ========================================================
    // CALLBACK
    // ========================================================

    callbacks: {

        onDataUpdated: (subscription) => {

            const data =
                subscription.data;


            // ------------------------------------------------
            // Obtém um valor da subscription
            // ------------------------------------------------

            function getValue(
                deviceId,
                key
            ) {

                const item =
                    data.find(d =>
                        d.dataKey.name === key &&
                        d.datasource
                            .entityFilter
                            .singleEntity
                            .id === deviceId
                    );


                if (!item ||
                    !item.data ||
                    !item.data.length) {

                    return null;
                }


                const point =
                    item.data[
                        item.data.length - 1
                    ];


                return {

                    timestamp:
                        Number(point[0]),

                    value:
                        point[1]
                };
            }


            updateDisplay(getValue);
        }
    }
};


// ============================================================
// CRIA SUBSCRIPTION
// ============================================================

ctx.subscriptionApi
    .createSubscription(
        subscriptionOptions,
        true
    )
    .subscribe(
        (subscription) => {

            ctx.defaultSubscription =
                subscription;
        }
    );


// ============================================================
// REFRESH MANUAL
// ============================================================

const refreshButton =
    container.querySelector(
        "#refreshButton"
    );


if (refreshButton) {

    refreshButton.addEventListener(
        "click",
        () => {

            console.log(
                "REFRESH clicado",
                new Date()
            );


            refreshButton.disabled =
                true;

            refreshButton.classList.add(
                "refreshing"
            );


            // ----------------------------------------------
            // Chaves do Sítio (Ecowitt)
            // ----------------------------------------------

            const ecowittKeys =
                [
                    "temperature_out",
                    "humidity_out",
                    "feels_like_out",
                    "pressure_relative",
                    "dew_point_out",
                    "solar_radiation",
                    "temperature_in",
                    "humidity_in"
                ].join(",");


            const values = {};


            // =================================================
            // CONSULTA O DEVICE DO SÍTIO
            // =================================================

            const url =
                `/api/plugins/telemetry/DEVICE/${DEVICE_ECOWITT}/values/timeseries?keys=${ecowittKeys}`;


            function finishRefresh() {

                function getValue(
                    deviceId,
                    key
                ) {

                    return (
                        values[
                            deviceId +
                            ":" +
                            key
                        ] ||
                        null
                    );
                }


                updateDisplay(
                    getValue
                );


                refreshButton.disabled =
                    false;

                refreshButton.classList.remove(
                    "refreshing"
                );
            }


            ctx.http.get(url).subscribe(

                (response) => {

                    Object.keys(response)
                        .forEach(key => {

                            const points =
                                response[key];


                            if (!points ||
                                !points.length) {

                                return;
                            }


                            let latest =
                                points[0];


                            for (
                                let i = 1;
                                i < points.length;
                                i++
                            ) {

                                if (
                                    Number(
                                        points[i].ts
                                    ) >
                                    Number(
                                        latest.ts
                                    )
                                ) {

                                    latest =
                                        points[i];
                                }
                            }


                            values[
                                DEVICE_ECOWITT +
                                ":" +
                                key
                            ] = {

                                timestamp:
                                    Number(
                                        latest.ts
                                    ),

                                value:
                                    latest.value
                            };
                        });


                    finishRefresh();
                },


                (error) => {

                    console.error(
                        "Erro ao consultar o device do Sítio:",
                        error
                    );


                    console.error(
                        "REFRESH concluído com erro."
                    );


                    refreshButton.disabled =
                        false;

                    refreshButton.classList.remove(
                        "refreshing"
                    );
                }
            );
        }
    );
}


// ============================================================
// VERIFICA PERIODICAMENTE SE OS DADOS ESTÃO ATRASADOS
// ============================================================

setInterval(
    () => {

        updateGlobalStaleness();

    },
    30000
);


