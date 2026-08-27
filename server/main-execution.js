const algorithms = require('./solvers');
const express = require('express');
const ip = require('ip');
const { performance } = require('node:perf_hooks');

const app = express();

const ipAddress = ip.address();
const ipPort = 3001;

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

function validateResult(
    algo,
    result
) {
    if (
        !result ||
        typeof result !== 'object'
    ) {
        throw new Error(
            `${algo} returned an invalid result.`
        );
    }

    if (
        result.servicePlacementResults ===
        undefined
    ) {
        throw new Error(
            `${algo} did not return servicePlacementResults.`
        );
    }

    if (
        result.perServiceAnalysis ===
        undefined
    ) {
        throw new Error(
            `${algo} did not return perServiceAnalysis.`
        );
    }

    if (
        result.solution ===
        undefined
    ) {
        throw new Error(
            `${algo} did not return solution.`
        );
    }
}

function formatResult(
    algo,
    result,
    runtimeOverride = undefined
) {
    validateResult(
        algo,
        result
    );

    const runtime =
        runtimeOverride ??
        result.runtime;

    if (
        !Number.isFinite(
            Number(runtime)
        )
    ) {
        throw new Error(
            `${algo} returned an invalid runtime.`
        );
    }

    return {
        [`${algo}_result`]:
            result.servicePlacementResults,

        [`${algo}_runtime`]:
            Number(runtime),

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
            result
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
            result
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
            result
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
            result
        );
    }

    if (
        algo === 'NCOGA'
    ) {
        const startTime =
            performance.now();

        const solver =
            new algorithms.NCO(
                body
            );

        const result =
            solver.run_test(0);

        const endTime =
            performance.now();

        return formatResult(
            algo,
            result,
            endTime - startTime
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
            result
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
            result
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
            result
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
            result
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
            result
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
            result
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

                output[algo] =
                    runAlgorithm(
                        algo,
                        req.body
                    );

                console.log(
                    `✅ ${algo} completed!`
                );
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

server.setTimeout(0);