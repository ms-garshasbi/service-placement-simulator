const algorithms = require('./solvers');
const express = require('express');
const ip = require('ip');
const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require('worker_threads');

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
    'NSGAII',
    'PSO',
    'DE',
    'SA',
    'SCA',
    'WOA',
    'GWO',
    'OPT',
    'NCOGA',
    'NCOPSO',
    'NCODE',
    'NCOSA',
    'NCOtrainGA',
    'NCOtrainPSO',
    'NCOtrainDE',
    'NCOtrainSA',
    'TCA',
    'LRC',
    'MDS',
    'MP',
    'LP',
    'MR'
]);

const NCO_TRAINING_ALGORITHMS = new Map([
    ['NCOtrainGA', 'GA'],
    ['NCOtrainPSO', 'PSO'],
    ['NCOtrainDE', 'DE'],
    ['NCOtrainSA', 'SA'],
]);

const NCO_INFERENCE_ALGORITHMS = new Map([
    ['NCOGA', 'GA'],
    ['NCOPSO', 'PSO'],
    ['NCODE', 'DE'],
    ['NCOSA', 'SA'],
]);

function isNcoTrainingAlgorithm(algo) {
    return NCO_TRAINING_ALGORITHMS.has(algo);
}

function isNcoInferenceAlgorithm(algo) {
    return NCO_INFERENCE_ALGORITHMS.has(algo);
}

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

    const feasibilityValidator =
        new algorithms.solutionOperation(
            body
        );

    feasibilityValidator.assertFeasibleSolution(
        solution,
        `${algo} solution`
    );
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

    const formatted = {
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

    if (typeof result.heuristicFallbackUsed === 'boolean') {
        formatted[`${algo}_feasibilityFallbackUsed`] =
            result.heuristicFallbackUsed;

        formatted[`${algo}_feasibilitySearchStates`] =
            result.heuristicSearchStates ?? 0;
    }

    if (Array.isArray(result.paretoFront)) {
        _validateFiniteMetric(
            result.fitness,
            `${algo} representative scalar fitness`
        );

        if (
            !Number.isInteger(result.paretoFrontSize) ||
            result.paretoFrontSize < 1 ||
            result.paretoFrontSize !== result.paretoFront.length
        ) {
            throw new Error(
                `${algo} returned an invalid Pareto-front size.`
            );
        }

        for (let index = 0; index < result.paretoFront.length; index++) {
            const point =
                result.paretoFront[index];

            if (
                !point ||
                typeof point !== 'object' ||
                !Array.isArray(point.solution) ||
                !point.objectives ||
                typeof point.objectives !== 'object'
            ) {
                throw new Error(
                    `${algo} Pareto-front entry ${index} is malformed.`
                );
            }

            _validateFiniteMetric(
                point.objectives.responseTime,
                `${algo} Pareto responseTime ${index}`,
                { min: 0 }
            );
            _validateFiniteMetric(
                point.objectives.platformReliability,
                `${algo} Pareto platformReliability ${index}`,
                { min: 0, max: 1 }
            );
            _validateFiniteMetric(
                point.objectives.serviceReliability,
                `${algo} Pareto serviceReliability ${index}`,
                { min: 0, max: 1 }
            );
            _validateFiniteMetric(
                point.scalarQuality,
                `${algo} Pareto scalarQuality ${index}`
            );
        }

        formatted[`${algo}_fitness`] =
            result.fitness;
        formatted[`${algo}_paretoFront`] =
            result.paretoFront;
        formatted[`${algo}_paretoFrontSize`] =
            result.paretoFrontSize;
        formatted[`${algo}_objectives`] =
            result.objectives ?? null;
        formatted[`${algo}_representativeSelection`] =
            result.representativeSelection ?? null;
        formatted[`${algo}_convergence`] =
            result.convergence ?? null;
        formatted[`${algo}_offspringRegenerated`] =
            result.offspringRegenerated ?? 0;
    }

    if (typeof result.optimalityProven === 'boolean') {
        _validateFiniteMetric(
            result.fitness,
            `${algo} fitness`
        );

        formatted[`${algo}_optimalityProven`] =
            result.optimalityProven;
        formatted[`${algo}_optimalityGap`] =
            result.optimalityGap ?? 0;
        formatted[`${algo}_fitness`] =
            result.fitness;
        formatted[`${algo}_exactMethod`] =
            result.exactMethod ?? null;
        formatted[`${algo}_rootLowerBound`] =
            result.rootLowerBound ?? null;
        formatted[`${algo}_searchStates`] =
            result.searchStates ?? null;
        formatted[`${algo}_completeSolutionsEvaluated`] =
            result.completeSolutionsEvaluated ?? null;
        formatted[`${algo}_prunedByBound`] =
            result.prunedByBound ?? null;
        formatted[`${algo}_prunedByCapacity`] =
            result.prunedByCapacity ?? null;
        formatted[`${algo}_dominatedVersionsRemoved`] =
            result.dominatedVersionsRemoved ?? null;
        formatted[`${algo}_serviceConfigurationsEnumerated`] =
            result.serviceConfigurationsEnumerated ?? null;
        formatted[`${algo}_serviceConfigurationCounts`] =
            result.serviceConfigurationCounts ?? null;
        formatted[`${algo}_incumbentSource`] =
            result.incumbentSource ?? null;
    }

    return formatted;
}


function formatTrainingResult(
    algo,
    result,
    body
) {
    const formatted =
        formatResult(
            algo,
            result,
            body
        );

    if (
        !Array.isArray(result.weights) ||
        result.weights.length !== 16 ||
        result.weights.some(
            value =>
                typeof value !== 'number' ||
                !Number.isFinite(value)
        )
    ) {
        throw new Error(
            `${algo} did not return exactly 16 finite NCO weights.`
        );
    }

    _validateFiniteMetric(
        result.fitness,
        `${algo} fitness`
    );

    if (
        !Number.isInteger(result.modelIndex) ||
        result.modelIndex < 0
    ) {
        throw new Error(
            `${algo} returned an invalid modelIndex.`
        );
    }

    if (
        !Array.isArray(result.convergence)
    ) {
        throw new Error(
            `${algo} returned invalid convergence data.`
        );
    }

    formatted[`${algo}_weights`] =
        result.weights;

    formatted[`${algo}_fitness`] =
        result.fitness;

    formatted[`${algo}_modelIndex`] =
        result.modelIndex;

    formatted[`${algo}_trainingOptimizer`] =
        result.trainingOptimizer;

    formatted[`${algo}_iterationsCompleted`] =
        result.iterationsCompleted;

    formatted[`${algo}_convergence`] =
        result.convergence;

    formatted[`${algo}_trainingStages`] =
        result.stages ?? null;

    formatted[`${algo}_weightsFile`] =
        result.weightsFile ?? null;

    formatted[`${algo}_finalEvaluationRuntime`] =
        result.finalEvaluationRuntime ?? null;

    formatted[`${algo}_trainedModelName`] =
        result.trainedModelName ?? null;

    formatted[`${algo}_trainingScenarioCount`] =
        result.trainingScenarioCount ?? null;

    formatted[`${algo}_trainingMeanFitness`] =
        result.trainingMeanFitness ?? result.fitness;

    formatted[`${algo}_trainingWorstFitness`] =
        result.trainingWorstFitness ?? null;

    formatted[`${algo}_trainingBestFitness`] =
        result.trainingBestFitness ?? null;

    formatted[`${algo}_trainingScenarioQualities`] =
        result.trainingScenarioQualities ?? null;

    formatted[`${algo}_referenceScenarioFitness`] =
        result.referenceScenarioFitness ?? null;

    formatted[`${algo}_trainingDataset`] =
        result.trainingDataset ?? null;

    return formatted;
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
        algo === 'NSGAII'
    ) {
        const solver =
            new algorithms.nsgaII({
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
        algo === 'SCA'
    ) {
        const solver =
            new algorithms.sineCosineAlgorithm({
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
        algo === 'WOA'
    ) {
        const solver =
            new algorithms.whaleOptimizationAlgorithm({
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
        algo === 'GWO'
    ) {
        const solver =
            new algorithms.greyWolfOptimizer({
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
        algo === 'OPT'
    ) {
        const solver =
            new algorithms.exactOptimizationBaseline({
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
        isNcoInferenceAlgorithm(
            algo
        )
    ) {
        const solver =
            new algorithms.NCO(
                body
            );

        const modelIndex =
            Number(
                body
                    ?.configsNCO
                    ?.modelIndex ??
                0
            );

        if (
            !Number.isInteger(modelIndex) ||
            modelIndex < 0
        ) {
            throw new Error(
                `Invalid NCO modelIndex: ${modelIndex}`
            );
        }

        const optimizer =
            NCO_INFERENCE_ALGORITHMS.get(
                algo
            );

        const result =
            solver.run_test(
                optimizer,
                modelIndex
            );

        return formatResult(
            algo,
            result,
            body
        );
    }

    if (
        isNcoTrainingAlgorithm(
            algo
        )
    ) {
        const solver =
            new algorithms.NCO(
                body
            );

        const strategy =
            NCO_TRAINING_ALGORITHMS.get(
                algo
            );

        const result =
            solver.run_train(
                strategy
            );

        return formatTrainingResult(
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

class SolverTimeoutError extends Error {
    constructor(algo, timeoutMs) {
        super(
            `${algo} exceeded the remaining request budget of ${timeoutMs} ms and was terminated.`
        );
        this.name =
            'SolverTimeoutError';
    }
}

class RequestAbortedError extends Error {
    constructor() {
        super(
            'The client disconnected before solver execution completed.'
        );
        this.name =
            'RequestAbortedError';
    }
}

function serializeError(error) {
    return {
        name:
            error?.name ??
            'Error',

        message:
            error?.message ??
            String(error),

        stack:
            typeof error?.stack === 'string'
                ? error.stack
                : undefined
    };
}

function errorFromRecord(record) {
    const error =
        new Error(
            record?.message ??
            'Worker solver failed.'
        );

    error.name =
        record?.name ??
        'Error';

    if (
        typeof record?.stack === 'string' &&
        record.stack.length > 0
    ) {
        error.stack =
            record.stack;
    }

    return error;
}

function runAlgorithmInWorker(
    algo,
    body,
    timeoutMs,
    signal
) {
    if (
        !Number.isInteger(timeoutMs) ||
        timeoutMs <= 0
    ) {
        return Promise.reject(
            new SolverTimeoutError(
                algo,
                Math.max(0, timeoutMs)
            )
        );
    }

    return new Promise(
        (resolve, reject) => {
            const worker =
                new Worker(
                    __filename,
                    {
                        workerData: {
                            mode:
                                'solver',
                            algo,
                            body
                        }
                    }
                );

            let settled =
                false;

            let timer;

            const cleanup = () => {
                if (timer !== undefined) {
                    clearTimeout(timer);
                }

                signal?.removeEventListener(
                    'abort',
                    onAbort
                );
            };

            const rejectAfterTerminate =
                async error => {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    cleanup();

                    try {
                        await worker.terminate();
                    }
                    catch {
                        // Preserve the original timeout/abort error.
                    }

                    reject(error);
                };

            const onAbort = () => {
                void rejectAfterTerminate(
                    new RequestAbortedError()
                );
            };

            worker.once(
                'message',
                message => {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    cleanup();

                    if (message?.ok === true) {
                        resolve(
                            message.result
                        );
                    }
                    else {
                        reject(
                            errorFromRecord(
                                message?.error
                            )
                        );
                    }
                }
            );

            worker.once(
                'error',
                error => {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    cleanup();
                    reject(error);
                }
            );

            worker.once(
                'exit',
                code => {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    cleanup();

                    reject(
                        new Error(
                            `${algo} worker exited before returning a result (exit code ${code}).`
                        )
                    );
                }
            );

            timer =
                setTimeout(
                    () => {
                        void rejectAfterTerminate(
                            new SolverTimeoutError(
                                algo,
                                timeoutMs
                            )
                        );
                    },
                    timeoutMs
                );

            if (signal) {
                if (signal.aborted) {
                    onAbort();
                }
                else {
                    signal.addEventListener(
                        'abort',
                        onAbort,
                        { once: true }
                    );
                }
            }
        }
    );
}

app.post(
    '/json',
    async (req, res) => {
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

            const requestDeadline =
                Date.now() +
                requestTimeoutMs;

            const abortController =
                new AbortController();

            const abortOnDisconnect = () => {
                if (!res.writableEnded) {
                    abortController.abort();
                }
            };

            req.once(
                'aborted',
                abortOnDisconnect
            );

            res.once(
                'close',
                abortOnDisconnect
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

                const remainingMs =
                    requestDeadline -
                    Date.now();

                if (remainingMs <= 0) {
                    output[algo] = {
                        status:
                            'error',

                        error:
                            serializeError(
                                new SolverTimeoutError(
                                    algo,
                                    0
                                )
                            )
                    };

                    continue;
                }

                try {
                    output[algo] =
                        await runAlgorithmInWorker(
                            algo,
                            req.body,
                            remainingMs,
                            abortController.signal
                        );

                    console.log(
                        `✅ ${algo} completed!`
                    );
                }
                catch (error) {
                    if (
                        error?.name ===
                            'RequestAbortedError'
                    ) {
                        return;
                    }

                    console.error(
                        `❌ ${algo} failed:`,
                        error
                    );

                    output[algo] = {
                        status:
                            'error',

                        error:
                            serializeError(error)
                    };
                }
            }

            req.removeListener(
                'aborted',
                abortOnDisconnect
            );

            res.removeListener(
                'close',
                abortOnDisconnect
            );

            if (
                abortController.signal.aborted ||
                res.writableEnded
            ) {
                return;
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

if (
    !isMainThread &&
    workerData?.mode ===
        'solver'
) {
    try {
        const result =
            runAlgorithm(
                workerData.algo,
                workerData.body
            );

        parentPort.postMessage({
            ok:
                true,
            result
        });
    }
    catch (error) {
        parentPort.postMessage({
            ok:
                false,
            error:
                serializeError(error)
        });
    }
    finally {
        parentPort.close();
    }
}
else if (isMainThread) {
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
}
