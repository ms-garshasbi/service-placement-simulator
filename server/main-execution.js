const algorithms = require('./solvers');
const express = require('express');
const ip = require('ip');

const app = express();

const ipAddress = ip.address();
const ipPort = 3001;

const DEFAULT_REQUEST_TIMEOUT_MS =
    30 * 60 * 1000;

function parseRequestTimeoutMs(value) {
    const timeout =
        value === undefined
            ? Number(
                process.env.REQUEST_TIMEOUT_MS ??
                DEFAULT_REQUEST_TIMEOUT_MS
            )
            : Number(value);

    if (
        !Number.isInteger(timeout) ||
        timeout <= 0
    ) {
        throw new Error(
            'requestTimeoutMs must be a positive integer number of milliseconds.'
        );
    }

    return timeout;
}

const serverRequestTimeoutMs =
    parseRequestTimeoutMs(undefined);

const SUPPORTED_ALGORITHMS = new Set([
    'GA',
    'PSO',
    'DE',
    'SA',
    'NCOGA',
    'TCA',
    'LRC',
    'MDS',
    'MP',
    'LP',
    'MR'
]);

app.use(
    express.json({
        inflate: true,
        limit: '200000kb',
        strict: true,
        type: 'application/json'
    })
);

function clone(value) {
    return JSON.parse(
        JSON.stringify(value)
    );
}

function parseAlgorithms(value) {
    if (
        typeof value !== 'string'
    ) {
        throw new Error(
            'algo must be a non-empty string.'
        );
    }

    const names =
        value
            .split(',')
            .map(
                name =>
                    name.trim()
            )
            .filter(Boolean);

    if (
        names.length === 0
    ) {
        throw new Error(
            'At least one algorithm must be selected.'
        );
    }

    if (
        new Set(names).size !==
        names.length
    ) {
        throw new Error(
            'Duplicate algorithms are not allowed.'
        );
    }

    const unsupported =
        names.filter(
            name =>
                !SUPPORTED_ALGORITHMS.has(
                    name
                )
        );

    if (
        unsupported.length > 0
    ) {
        throw new Error(
            `Unsupported algorithm(s): ${unsupported.join(', ')}. ` +
            `Supported algorithms: ${[
                ...SUPPORTED_ALGORITHMS
            ].join(', ')}.`
        );
    }

    return names;
}

function _validateFiniteMetric(
    value,
    label,
    {
        min = undefined,
        max = undefined
    } = {}
) {
    if (
        typeof value !== 'number' ||
        !Number.isFinite(value)
    ) {
        throw new Error(
            `${label} must be a finite number.`
        );
    }

    if (
        min !== undefined &&
        value < min
    ) {
        throw new Error(
            `${label} must be >= ${min}; received ${value}.`
        );
    }

    if (
        max !== undefined &&
        value > max
    ) {
        throw new Error(
            `${label} must be <= ${max}; received ${value}.`
        );
    }

    return value;
}

function _validatePerServiceSeries(
    value,
    label,
    {
        min = undefined,
        max = undefined,
        expectedCount = undefined
    } = {}
) {
    if (typeof value !== 'string') {
        throw new Error(
            `${label} must be a newline-delimited string.`
        );
    }

    const lines =
        value
            .split('\n')
            .filter(
                line =>
                    line.trim() !== ''
            );

    if (
        expectedCount !== undefined &&
        lines.length !== expectedCount
    ) {
        throw new Error(
            `${label} must contain exactly ${expectedCount} values; ` +
            `received ${lines.length}.`
        );
    }

    for (
        let index = 0;
        index < lines.length;
        index++
    ) {
        const numericValue =
            Number(
                lines[index]
            );

        _validateFiniteMetric(
            numericValue,
            `${label}[${index}]`,
            {
                min,
                max
            }
        );
    }
}

function _validateSolution(
    solution,
    algo,
    body
) {
    if (!Array.isArray(solution)) {
        throw new Error(
            `${algo} solution must be an array.`
        );
    }

    const services =
        body?.services;

    if (!Array.isArray(services)) {
        throw new Error(
            'Request services must be an array before validating a solver result.'
        );
    }

    const allNodes = [
        ...(Array.isArray(body?.computingNodes)
            ? body.computingNodes
            : []),
        ...(Array.isArray(body?.helperNodes)
            ? body.helperNodes
            : []),
        ...(Array.isArray(body?.usersNodes)
            ? body.usersNodes
            : [])
    ];

    const nodeIDs =
        new Set();

    for (const node of allNodes) {
        if (
            node?.nodeID === undefined ||
            node?.nodeID === null
        ) {
            throw new Error(
                'Every request node must have a nodeID before validating a solver result.'
            );
        }

        if (nodeIDs.has(node.nodeID)) {
            throw new Error(
                `Duplicate request nodeID ${node.nodeID}.`
            );
        }

        nodeIDs.add(node.nodeID);
    }

    const expected =
        new Map();

    for (const service of services) {
        if (!Array.isArray(service?.components)) {
            throw new Error(
                `Request service ${service?.serviceID} components must be an array.`
            );
        }

        for (const component of service.components) {
            const key =
                `${service.serviceID}::${component.componentID}`;

            if (expected.has(key)) {
                throw new Error(
                    `Duplicate request service/component ${service.serviceID}/${component.componentID}.`
                );
            }

            expected.set(
                key,
                component
            );
        }
    }

    if (solution.length !== expected.size) {
        throw new Error(
            `${algo} solution must contain exactly ${expected.size} placements; ` +
            `received ${solution.length}.`
        );
    }

    const seen =
        new Set();

    for (
        let index = 0;
        index < solution.length;
        index++
    ) {
        const placement =
            solution[index];

        if (
            !Array.isArray(placement) ||
            placement.length < 4
        ) {
            throw new Error(
                `${algo} solution placement ${index} must contain ` +
                `[serviceID, componentID, versionID, nodeID].`
            );
        }

        const [
            serviceID,
            componentID,
            versionID,
            nodeID
        ] = placement;

        if (
            serviceID === undefined ||
            serviceID === null ||
            componentID === undefined ||
            componentID === null ||
            versionID === undefined ||
            versionID === null ||
            nodeID === undefined ||
            nodeID === null
        ) {
            throw new Error(
                `${algo} solution placement ${index} contains a missing field.`
            );
        }

        const key =
            `${serviceID}::${componentID}`;

        const component =
            expected.get(key);

        if (!component) {
            throw new Error(
                `${algo} solution placement ${index} references unknown ` +
                `service/component ${serviceID}/${componentID}.`
            );
        }

        if (seen.has(key)) {
            throw new Error(
                `${algo} solution contains duplicate placement for ` +
                `${serviceID}/${componentID}.`
            );
        }

        seen.add(key);

        const versionExists =
            (component.versions ?? [])
                .some(
                    version =>
                        version.versionNumber ===
                        versionID
                );

        if (!versionExists) {
            throw new Error(
                `${algo} solution placement ${index} references unknown ` +
                `version ${versionID} for ${serviceID}/${componentID}.`
            );
        }

        if (!nodeIDs.has(nodeID)) {
            throw new Error(
                `${algo} solution placement ${index} references unknown node ${nodeID}.`
            );
        }
    }
}

function validateResult(
    algo,
    result,
    body
) {
    if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result)
    ) {
        throw new Error(
            `${algo} returned an invalid result.`
        );
    }

    const metrics =
        result.servicePlacementResults;

    if (
        !metrics ||
        typeof metrics !== 'object' ||
        Array.isArray(metrics)
    ) {
        throw new Error(
            `${algo} did not return valid servicePlacementResults.`
        );
    }

    _validateFiniteMetric(
        metrics.totalResponseTime,
        `${algo} totalResponseTime`,
        { min: 0 }
    );

    _validateFiniteMetric(
        metrics.aveResponseTime,
        `${algo} aveResponseTime`,
        { min: 0 }
    );

    _validateFiniteMetric(
        metrics.platformReliability,
        `${algo} platformReliability`,
        { min: 0, max: 1 }
    );

    _validateFiniteMetric(
        metrics.serviceReliability,
        `${algo} serviceReliability`,
        { min: 0, max: 1 }
    );

    _validateSolution(
        result.solution,
        algo,
        body
    );

    const expectedServiceCount =
        body.services.length;

    const perService =
        result.perServiceAnalysis;

    if (
        !perService ||
        typeof perService !== 'object' ||
        Array.isArray(perService)
    ) {
        throw new Error(
            `${algo} did not return valid perServiceAnalysis.`
        );
    }

    _validatePerServiceSeries(
        perService.resTimePerService,
        `${algo} resTimePerService`,
        {
            min: 0,
            expectedCount:
                expectedServiceCount
        }
    );

    _validatePerServiceSeries(
        perService.platReliability,
        `${algo} platReliability`,
        {
            min: 0,
            max: 1,
            expectedCount:
                expectedServiceCount
        }
    );

    _validatePerServiceSeries(
        perService.servReliability,
        `${algo} servReliability`,
        {
            min: 0,
            max: 1,
            expectedCount:
                expectedServiceCount
        }
    );

    _validateFiniteMetric(
        result.runtime,
        `${algo} runtime`,
        { min: 0 }
    );
}

function formatResult(
    algo,
    result,
    body
) {
    validateResult(
        algo,
        result,
        body
    );

    return {
        status:
            'success',

        [`${algo}_result`]:
            result.servicePlacementResults,

        [`${algo}_runtime`]:
            result.runtime,

        [`${algo}_perService_result`]:
            result.perServiceAnalysis,

        [`${algo}_finalSolution`]:
            result.solution
    };
}

function runAlgorithm(
    algo,
    body
) {
    if (
        algo === 'GA'
    ) {
        const solver =
            new algorithms.geneticAlgorithm({
                ans: body,
                algo: algo
            });

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'PSO'
    ) {
        const solver =
            new algorithms.particleSwarmOptimization({
                ans: body,
                algo: algo
            });

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'DE'
    ) {
        const solver =
            new algorithms.differentialEvolution({
                ans: body,
                algo: algo
            });

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'SA'
    ) {
        const solver =
            new algorithms.simulatedAnnealing({
                ans: body,
                algo: algo
            });

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'NCOGA'
    ) {
        const solver =
            new algorithms.NCO(
                body
            );

        const result =
            solver.run_test(0);

        return formatResult(
            algo,
            result,
            body
        );
    }

    const system =
        clone(
            body
        );

    if (
        algo === 'TCA'
    ) {
        const solver =
            new algorithms.taskContinuationAffinity(
                system
            );

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'LRC'
    ) {
        const solver =
            new algorithms.leastRequiredCPU(
                system
            );

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'MDS'
    ) {
        const solver =
            new algorithms.mostDataSize(
                system
            );

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'MP'
    ) {
        const solver =
            new algorithms.mostPowerful(
                system
            );

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'LP'
    ) {
        const solver =
            new algorithms.leastPowerful(
                system
            );

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        algo === 'MR'
    ) {
        const solver =
            new algorithms.mostReliablity(
                system
            );

        const result =
            solver.run();

        return formatResult(
            algo,
            result,
            body
        );
    }

    throw new Error(
        `Unsupported algorithm: ${algo}.`
    );
}

app.post(
    '/json',
    (req, res) => {
        try {
            if (
                !req.body ||
                typeof req.body !== 'object'
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            'Request body must be a JSON object.'
                    });
            }

            let requestTimeoutMs;

            try {
                requestTimeoutMs =
                    parseRequestTimeoutMs(
                        req.body.requestTimeoutMs
                    );
            }
            catch (error) {
                return res
                    .status(400)
                    .json({
                        error:
                            error.message
                    });
            }

            req.setTimeout(
                requestTimeoutMs
            );

            res.setTimeout(
                requestTimeoutMs
            );

            if (
                req.body.type !== 'current'
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            `Unsupported request type: ${req.body.type}. ` +
                            `Only "current" is supported.`
                    });
            }

            let selectedAlgorithms;

            try {
                selectedAlgorithms =
                    parseAlgorithms(
                        req.body.algo
                    );
            }
            catch (error) {
                return res
                    .status(400)
                    .json({
                        error:
                            error.message
                    });
            }

            const output = {};

            for (
                const algo
                of selectedAlgorithms
            ) {
                console.log(
                    `\n🚀 ${algo} is running...`
                );

                try {
                    output[algo] =
                        runAlgorithm(
                            algo,
                            req.body
                        );

                    console.log(
                        `✅ ${algo} completed!`
                    );
                }
                catch (error) {
                    console.error(
                        `❌ ${algo} failed:`,
                        error
                    );

                    output[algo] = {
                        status:
                            'error',

                        error: {
                            name:
                                error?.name ??
                                'Error',

                            message:
                                error?.message ??
                                String(error)
                        }
                    };
                }
            }

            return res.json(
                output
            );
        }
        catch (error) {
            console.error(
                'Algorithm execution failed:'
            );

            console.error(
                error
            );

            if (
                res.headersSent
            ) {
                return;
            }

            return res
                .status(500)
                .json({
                    error:
                        error.message ??
                        'Internal server error.'
                });
        }
    }
);

const server =
    app.listen(
        ipPort,
        () => {
            console.log(
                `Listening on ${ipAddress}:${ipPort} !!!`
            );
        }
    );

server.setTimeout(
    serverRequestTimeoutMs
);

server.requestTimeout =
    serverRequestTimeoutMs;