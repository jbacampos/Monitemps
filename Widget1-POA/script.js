// ============================================================
// WIDGET 1 — POA
//
// Dados externos e internos exclusivamente de Porto Alegre.
// Não consulta o dispositivo do Sítio / Ecowitt.
// ============================================================


// ============================================================
// IDENTIFICAÇÃO DO DEVICE
// ============================================================

const DEVICE_POA =
    "23568e90-9e30-11f1-b723-7b68e13f2590";


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
// PONTO DE ORVALHO
//
// Fórmula de Magnus.
// Entrada:
//   temperature = °C
//   humidity    = %
// Retorno:
//   °C
// ============================================================

function calculateDewPoint(temperature, humidity) {

    const T = Number(temperature);
    const RH = Number(humidity);

    if (!Number.isFinite(T) ||
        !Number.isFinite(RH)) {

        return null;
    }

    if (RH <= 0 || RH > 100) {
        return null;
    }

    const a = 17.625;
    const b = 243.04;

    const gamma =
        Math.log(RH / 100) +
        (a * T) / (b + T);

    const dewPoint =
        (b * gamma) /
        (a - gamma);

    return dewPoint;
}


// ============================================================
// SENSAÇÃO TÉRMICA POA
//
// Utiliza a formulação simplificada baseada em Steadman,
// empregada pelo National Weather Service para condições
// abaixo da faixa de aplicação da regressão completa.
//
// Entrada:
//   temperature = °C
//   humidity    = %
//
// Retorno:
//   °C
//
// Importante:
//   esta versão usa SOMENTE temperatura + UR.
//   Não considera vento nem radiação solar.
// ============================================================

function calculatePoaFeelsLike(temperature, humidity) {

    const T = Number(temperature);
    const RH = Number(humidity);

    if (!Number.isFinite(T) ||
        !Number.isFinite(RH)) {

        return null;
    }

    if (RH < 0 || RH > 100) {
        return null;
    }


    // Conversão para Fahrenheit
    const Tf =
        T * 9 / 5 + 32;


    // Formulação simplificada do Heat Index
    // para temperaturas abaixo da faixa da
    // regressão completa.

    let hiF =
        0.5 * (
            Tf +
            61.0 +
            ((Tf - 68.0) * 1.2) +
            (RH * 0.094)
        );


    // O NWS faz a média do resultado com
    // a temperatura real.

    hiF =
        (hiF + Tf) / 2;


    // Volta para Celsius

    return (hiF - 32) * 5 / 9;
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
// ESCREVE UM VALOR CALCULADO (ST / PO)
// ============================================================

function setDerivedValue(
    elementId,
    value
) {

    const element =
        container.querySelector(
            "#" + elementId
        );

    if (!element) {
        return;
    }

    element.textContent =
        value !== null
            ? value.toFixed(1)
            : "---";
}


// ============================================================
// ATUALIZA A TELA
// ============================================================

function updateDisplay(getValue) {

    // ========================================================
    // POA
    // ========================================================

    const poaExtTemp =
        getValue(DEVICE_POA, "extTemp");

    const poaExtHumid =
        getValue(DEVICE_POA, "extHumid");

    const poaIntTemp =
        getValue(DEVICE_POA, "intTemp");

    const poaIntHumid =
        getValue(DEVICE_POA, "intHumid");


    // ========================================================
    // POA — TEMPERATURA E UMIDADE EXTERNAS
    // ========================================================

    setValue("poaExtTemp", poaExtTemp, 1);

    setValue("poaExtHumid", poaExtHumid, 1);


    // ========================================================
    // POA — ST E PO
    //
    // Derivados de temperatura + umidade externas.
    // ========================================================

    if (poaExtTemp && poaExtHumid) {

        setDerivedValue(
            "poaExtFeels",
            calculatePoaFeelsLike(
                poaExtTemp.value,
                poaExtHumid.value
            )
        );

        setDerivedValue(
            "poaExtDew",
            calculateDewPoint(
                poaExtTemp.value,
                poaExtHumid.value
            )
        );
    }


    // ========================================================
    // POA — INTERNO
    // ========================================================

    setValue("poaIntTemp", poaIntTemp, 1);

    setValue("poaIntHumid", poaIntHumid, 1);


    // ========================================================
    // TIMESTAMPS
    //
    // Para os grupos derivados (ST e PO), usamos os
    // timestamps de temperatura + umidade, pois são os dados
    // que efetivamente determinam o cálculo.
    // ========================================================

    const poaExtTimestamp =
        latestTimestamp(
            poaExtTemp,
            poaExtHumid
        );

    const poaIntTimestamp =
        latestTimestamp(
            poaIntTemp,
            poaIntHumid
        );


    // ========================================================
    // TODOS OS DADOS
    // ========================================================

    const allValues = [

        poaExtTemp,
        poaExtHumid,
        poaIntTemp,
        poaIntHumid

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
        "poaExtTimestamp",
        poaExtTimestamp
    );

    updateIndividualTimestamp(
        "poaIntTimestamp",
        poaIntTimestamp
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
// Apenas o dispositivo POA é consultado neste widget.
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

                    id: DEVICE_POA
                }
            },

            dataKeys: [

                {
                    type: "timeseries",
                    name: "extTemp",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "extHumid",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "intTemp",
                    settings: {}
                },

                {
                    type: "timeseries",
                    name: "intHumid",
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
            // Chaves do POA
            // ----------------------------------------------

            const poaKeys =
                "extTemp,extHumid,intTemp,intHumid";


            const values = {};


            // =================================================
            // CONSULTA O DEVICE POA
            // =================================================

            const url =
                `/api/plugins/telemetry/DEVICE/${DEVICE_POA}/values/timeseries?keys=${poaKeys}`;


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
                                DEVICE_POA +
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
                        "Erro ao consultar o device POA:",
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

