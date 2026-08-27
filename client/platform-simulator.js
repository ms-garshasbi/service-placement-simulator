const axios = require('axios');
const fs = require('fs');

function readJSON(filePath) {
    const text = fs.readFileSync(filePath, {
        encoding: 'utf8'
    });

    try {
        return JSON.parse(text);
    }
    catch (error) {
        throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
}

function saveJSON(jsonResult, filePath) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(jsonResult, null, 2),
        'utf8'
    );
}

const configurations = readJSON('configurations.json');

const ALLOWED_ALGORITHMS = new Set([
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

const algorithm = String(configurations['algo'] ?? '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);

if (algorithm.length === 0) {
    throw new Error('No algorithm was selected in configurations.json.');
}

const unsupportedAlgorithms = algorithm.filter(
    name => !ALLOWED_ALGORITHMS.has(name)
);

if (unsupportedAlgorithms.length > 0) {
    throw new Error(
        `Unsupported algorithm(s): ${unsupportedAlgorithms.join(', ')}. ` +
        `Allowed algorithms: ${[...ALLOWED_ALGORITHMS].join(', ')}`
    );
}

const ip = configurations['address']['ip'];
const port = configurations['address']['port'];
const url = `http://${ip}:${port}/json`;

const requestTimeoutMs =
    Number(
        configurations['requestTimeoutMs'] ??
        30 * 60 * 1000
    );

if (
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs <= 0
) {
    throw new Error(
        'requestTimeoutMs must be a positive integer number of milliseconds.'
    );
}

function getRandomValue(min, max) {
    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max < min
    ) {
        throw new Error(`Invalid random range: [${min}, ${max}]`);
    }

    if (min === max) {
        return min;
    }

    return Math.random() * (max - min) + min;
}

function getRandomDivisibleByN(a, b, N) {
    if (
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        !Number.isFinite(N)
    ) {
        throw new Error(
            'getRandomDivisibleByN requires finite numbers.'
        );
    }

    if (b < a) {
        throw new Error(`Invalid range: [${a}, ${b}]`);
    }

    if (N <= 0) {
        throw new Error('N must be greater than zero.');
    }

    const min = Math.ceil(a / N);
    const max = Math.floor(b / N);

    if (max < min) {
        throw new Error(
            `No number divisible by ${N} exists in [${a}, ${b}].`
        );
    }

    const randMultiple =
        Math.floor(Math.random() * (max - min + 1)) + min;

    return randMultiple * N;
}

function randUniform(min = 100, max = 200) {
    return getRandomValue(min, max);
}

function randExponential(
    min = 100,
    max = 200,
    lambda = 1
) {
    if (
        !Number.isFinite(lambda) ||
        lambda <= 0
    ) {
        throw new Error(
            'lambda must be greater than zero.'
        );
    }

    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max < min
    ) {
        throw new Error(
            `Invalid exponential range: [${min}, ${max}]`
        );
    }

    if (min === max) {
        return min;
    }

    const u = Math.random();

    const maxCDF =
        1 - Math.exp(-lambda);

    const normalized =
        -Math.log(
            1 -
            u *
            maxCDF
        ) /
        lambda;

    return (
        min +
        normalized *
        (max - min)
    );
}

function randNormal(
    min = 100,
    max = 200
) {
    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max < min
    ) {
        throw new Error(
            `Invalid normal range: [${min}, ${max}]`
        );
    }

    if (min === max) {
        return min;
    }

    const mean =
        (min + max) / 2;

    const std =
        (max - min) / 6;

    const u =
        Math.random() ||
        Number.MIN_VALUE;

    const v =
        Math.random() ||
        Number.MIN_VALUE;

    const z =
        Math.sqrt(
            -2 *
            Math.log(u)
        ) *
        Math.cos(
            2 *
            Math.PI *
            v
        );

    let x =
        mean +
        z *
        std;

    if (x < min) {
        x = min;
    }

    if (x > max) {
        x = max;
    }

    return x;
}

function randTriangular(
    min = 100,
    max = 200,
    mode = undefined
) {
    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max < min
    ) {
        throw new Error(
            `Invalid triangular range: [${min}, ${max}]`
        );
    }

    if (min === max) {
        return min;
    }

    if (mode === undefined) {
        mode =
            (min + max) / 2;
    }

    if (
        !Number.isFinite(mode) ||
        mode < min ||
        mode > max
    ) {
        throw new Error(
            `Triangular mode ${mode} must lie inside [${min}, ${max}].`
        );
    }

    const u =
        Math.random();

    const c =
        (mode - min) /
        (max - min);

    if (u < c) {
        return (
            min +
            Math.sqrt(
                u *
                (max - min) *
                (mode - min)
            )
        );
    }

    return (
        max -
        Math.sqrt(
            (1 - u) *
            (max - min) *
            (max - mode)
        )
    );
}

function randAny(
    min = 100,
    max = 200,
    pick = 0
) {
    switch (pick) {
        case 0:
            return randUniform(
                min,
                max
            );

        case 1:
            return randTriangular(
                min,
                max
            );

        case 2:
            return randExponential(
                min,
                max
            );

        default:
            throw new Error(
                `Unknown random distribution pick: ${pick}`
            );
    }
}

function weightedRandom(
    min,
    max,
    splitPercent = 0.8,
    weightUpper = 0.8
) {
    if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        max < min
    ) {
        throw new Error(
            `Invalid weightedRandom range: [${min}, ${max}]`
        );
    }

    if (min === max) {
        return min;
    }

    if (
        !Number.isFinite(splitPercent) ||
        splitPercent < 0 ||
        splitPercent > 1
    ) {
        throw new Error(
            'splitPercent must be between 0 and 1.'
        );
    }

    if (
        !Number.isFinite(weightUpper) ||
        weightUpper < 0 ||
        weightUpper > 1
    ) {
        throw new Error(
            'weightUpper must be between 0 and 1.'
        );
    }

    const epsilon =
        Number.EPSILON;

    const safeSplitPercent =
        Math.min(
            1 - epsilon,
            Math.max(
                epsilon,
                splitPercent
            )
        );

    const split =
        min +
        (max - min) *
        safeSplitPercent;

    const useUpper =
        Math.random() <
        weightUpper;

    let a;
    let b;

    if (useUpper) {
        a = split;
        b = max;
    }
    else {
        a = min;
        b = split;
    }

    return getRandomValue(
        a,
        b
    );
}

const dataGeneration =
    configurations[
        'dataGenration'
    ] === true
    ||
    configurations[
        'dataGenration'
    ] === 'true'
    ||
    configurations[
        'dataGeneration'
    ] === true
    ||
    configurations[
        'dataGeneration'
    ] === 'true';

const startInstance =
    Number(
        configurations['startInstance'] ??
        0
    );

if (
    !Number.isInteger(startInstance) ||
    startInstance < 0
) {
    throw new Error(
        'startInstance must be a non-negative integer.'
    );
}

const numOfInstances =
    Number(
        configurations['numOfInstances'] ??
        1
    );

if (
    !Number.isInteger(numOfInstances) ||
    numOfInstances <= 0
) {
    throw new Error(
        'numOfInstances must be a positive integer.'
    );
}

let counter =
    startInstance;

let completedInstances =
    0;

function _validateFiniteResultNumber(
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

function _parsePerServiceSeries(
    value,
    label,
    expectedCount,
    {
        min = undefined,
        max = undefined
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

    if (lines.length !== expectedCount) {
        throw new Error(
            `${label} must contain exactly ${expectedCount} values; ` +
            `received ${lines.length}.`
        );
    }

    const mapped = {};

    for (
        let index = 0;
        index < lines.length;
        index++
    ) {
        const parsed =
            Number(
                lines[index]
            );

        _validateFiniteResultNumber(
            parsed,
            `${label}[${index}]`,
            {
                min,
                max
            }
        );

        mapped[
            `service${index + 1}`
        ] = parsed;
    }

    return mapped;
}

function _validateFinalSolution(
    solution,
    algoName,
    services,
    nodes
) {
    if (!Array.isArray(solution)) {
        throw new Error(
            `${algoName}_finalSolution must be an array.`
        );
    }

    const expected =
        new Map();

    for (const service of services) {
        for (
            const component
            of service.components ?? []
        ) {
            expected.set(
                `${service.serviceID}::${component.componentID}`,
                {
                    service,
                    component
                }
            );
        }
    }

    if (solution.length !== expected.size) {
        throw new Error(
            `${algoName}_finalSolution must contain ${expected.size} placements; ` +
            `received ${solution.length}.`
        );
    }

    const nodeIDs =
        new Set(
            nodes.map(
                node =>
                    node.nodeID
            )
        );

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
                `${algoName}_finalSolution placement ${index} is malformed.`
            );
        }

        const [
            serviceID,
            componentID,
            versionID,
            nodeID
        ] = placement;

        const key =
            `${serviceID}::${componentID}`;

        const expectedEntry =
            expected.get(key);

        if (!expectedEntry) {
            throw new Error(
                `${algoName}_finalSolution placement ${index} references ` +
                `unknown service/component ${serviceID}/${componentID}.`
            );
        }

        if (seen.has(key)) {
            throw new Error(
                `${algoName}_finalSolution contains duplicate placement for ` +
                `${serviceID}/${componentID}.`
            );
        }

        seen.add(key);

        const versionExists =
            (expectedEntry.component.versions ?? [])
                .some(
                    version =>
                        version.versionNumber ===
                        versionID
                );

        if (!versionExists) {
            throw new Error(
                `${algoName}_finalSolution placement ${index} references ` +
                `unknown version ${versionID}.`
            );
        }

        if (!nodeIDs.has(nodeID)) {
            throw new Error(
                `${algoName}_finalSolution placement ${index} references ` +
                `unknown node ${nodeID}.`
            );
        }
    }
}

function _algorithmFailureRecord(
    algoName,
    algoData
) {
    if (
        !algoData ||
        typeof algoData !== 'object' ||
        Array.isArray(algoData)
    ) {
        return null;
    }

    if (algoData.status !== 'error') {
        return null;
    }

    const error =
        algoData.error;

    if (
        !error ||
        typeof error !== 'object' ||
        typeof error.message !== 'string' ||
        error.message.trim() === ''
    ) {
        throw new Error(
            `${algoName} returned a malformed error record.`
        );
    }

    return {
        algorithm:
            algoName,

        status:
            'failed',

        errorName:
            typeof error.name === 'string' &&
            error.name.trim() !== ''
                ? error.name
                : 'Error',

        errorMessage:
            error.message
    };
}

function saveAll(resData) {
    if (
        !resData ||
        typeof resData !== 'object'
    ) {
        throw new Error(
            'Invalid server response.'
        );
    }

    const scale =
        configurations['scale'];

    const usersNodes =
        readJSON(
            `./${scale}/users.json`
        );

    const helperNodes =
        readJSON(
            `./${scale}/helpers.json`
        );

    const computingNodes =
        readJSON(
            `./${scale}/nodes.json`
        );

    const services =
        readJSON(
            `./${scale}/services.json`
        );

    const componentConnections =
        readJSON(
            `./${scale}/componentsConnections.json`
        );

    const infraConnections =
        readJSON(
            `./${scale}/infraConnections.json`
        );

    const networkConnections =
        infraConnections.map(
            row =>
                row.map(
                    link =>
                        link.slice(
                            0,
                            2
                        )
                )
        );

    const results = [];

    const allNodes = [
        ...computingNodes,
        ...helperNodes,
        ...usersNodes
    ];

    const expectedServiceCount =
        services.length;

    for (
        const algoName
        of algorithm
    ) {
        const algoData =
            resData[
                algoName
            ];

        if (!algoData) {
            throw new Error(
                `Server returned no record for ${algoName}.`
            );
        }

        const failureRecord =
            _algorithmFailureRecord(
                algoName,
                algoData
            );

        if (failureRecord) {
            results.push(
                failureRecord
            );

            continue;
        }

        if (
            algoData.status !== undefined &&
            algoData.status !== 'success'
        ) {
            throw new Error(
                `${algoName} returned unknown status ${String(algoData.status)}.`
            );
        }

        const result =
            algoData[
                `${algoName}_result`
            ];

        const runtime =
            algoData[
                `${algoName}_runtime`
            ];

        const perService =
            algoData[
                `${algoName}_perService_result`
            ];

        const finalSolution =
            algoData[
                `${algoName}_finalSolution`
            ];

        if (
            !result ||
            typeof result !== 'object' ||
            Array.isArray(result)
        ) {
            throw new Error(
                `${algoName}_result is missing or invalid.`
            );
        }

        if (
            !perService ||
            typeof perService !== 'object' ||
            Array.isArray(perService)
        ) {
            throw new Error(
                `${algoName}_perService_result is missing or invalid.`
            );
        }

        const totalResponseTime =
            _validateFiniteResultNumber(
                result.totalResponseTime,
                `${algoName}.totalResponseTime`,
                {
                    min: 0
                }
            );

        const aveResponseTime =
            _validateFiniteResultNumber(
                result.aveResponseTime,
                `${algoName}.aveResponseTime`,
                {
                    min: 0
                }
            );

        const platformReliability =
            _validateFiniteResultNumber(
                result.platformReliability,
                `${algoName}.platformReliability`,
                {
                    min: 0,
                    max: 1
                }
            );

        const serviceReliability =
            _validateFiniteResultNumber(
                result.serviceReliability,
                `${algoName}.serviceReliability`,
                {
                    min: 0,
                    max: 1
                }
            );

        const algorithmRuntime =
            _validateFiniteResultNumber(
                runtime,
                `${algoName}.runtime`,
                {
                    min: 0
                }
            );

        const responseTimePerService =
            _parsePerServiceSeries(
                perService.resTimePerService,
                `${algoName}.resTimePerService`,
                expectedServiceCount,
                {
                    min: 0
                }
            );

        const platformReliabilityPerService =
            _parsePerServiceSeries(
                perService.platReliability,
                `${algoName}.platReliability`,
                expectedServiceCount,
                {
                    min: 0,
                    max: 1
                }
            );

        const serviceReliabilityPerService =
            _parsePerServiceSeries(
                perService.servReliability,
                `${algoName}.servReliability`,
                expectedServiceCount,
                {
                    min: 0,
                    max: 1
                }
            );

        _validateFinalSolution(
            finalSolution,
            algoName,
            services,
            allNodes
        );

        results.push({
            algorithm:
                algoName,

            status:
                'success',

            totalResponseTime:
                Number(
                    totalResponseTime.toFixed(4)
                ),

            aveResponseTime:
                Number(
                    aveResponseTime.toFixed(4)
                ),

            platformReliability:
                Number(
                    platformReliability.toFixed(4)
                ),

            serviceReliability:
                Number(
                    serviceReliability.toFixed(4)
                ),

            algorithmRuntime:
                Number(
                    algorithmRuntime.toFixed(4)
                ),

            responseTimePerService,

            serviceReliabilityPerService,

            platformReliabilityPerService
        });
    }

    const combinedData = {
        comment:
            'CPU unit = MIPS, ' +
            'Mem unit = MB, ' +
            'Disk unit = MB, ' +
            'BW = Mbps, ' +
            'Datasize = Mb, ' +
            'Response time = second, ' +
            'Algorithm runtime = millisecond',

        computingNodes,
        helperNodes,
        usersNodes,
        services,
        componentConnections,
        networkConnections,
        results
    };

    fs.mkdirSync(
        `./${scale}`,
        {
            recursive: true
        }
    );

    fs.writeFileSync(
        `./${scale}/${counter}.json`,
        JSON.stringify(
            combinedData,
            null,
            2
        ),
        'utf8'
    );
}

async function sendAxiosPost(
    targetUrl,
    dataObj
) {
    try {
        const response =
            await axios.post(
                targetUrl,
                dataObj,
                {
                    timeout: requestTimeoutMs
                }
            );


        if (dataGeneration) {
            for (
                const algoName
                of algorithm
            ) {
                const algoData =
                    response.data?.[algoName];

                if (algoData?.status === 'error') {
                    console.log(
                        `❌ Instance ${counter}: ${algoName} failed: ` +
                        `${algoData.error?.message ?? 'unknown error'}`
                    );
                }
                else {
                    console.log(
                        `🚀 Instance ${counter} was solved using ${algoName}!`
                    );
                }
            }

            saveAll(
                response.data
            );

            console.log(
                `✅ Results saved in ./${configurations['scale']}`
            );

            console.log(
                '--------------------'
            );

            completedInstances++;
            counter++;

            if (
                completedInstances >=
                numOfInstances
            ) {
                return response.data;
            }

            const cmd =
                new commands();

            cmd.newUseCase();

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1000
                    )
            );

            await cmd.runAlgorithms();
        }
        else {
            for (
                const algoName
                of algorithm
            ) {
                const algoData =
                    response.data?.[algoName];

                if (algoData?.status === 'error') {
                    console.log(
                        `❌-----${algoName} failed-----❌`
                    );

                    console.log(
                        algoData.error
                    );
                }
                else {
                    console.log(
                        `✅-----${algoName} result!-----✅`
                    );

                    console.log(
                        algoData?.[`${algoName}_result`]
                    );
                }

                console.log(
                    '-------------------------'
                );
            }

            saveAll(
                response.data
            );
        }

        return response.data;
    }
    catch (error) {
        if (
            error.code ===
            'ECONNABORTED'
        ) {
            console.error(
                'Axios request timed out.'
            );
        }
        else {
            console.error(
                '-----------------------------------------------------------'
            );

            console.error(
                error
            );

            console.error(
                '-----------------------------------------------------------'
            );
        }

        throw error;
    }
}

class computingNodesGenerator {
    constructor(systemConfig) {
        const config =
            systemConfig;

        this.minAPCPUMIPS =
            config.minAPCPUMIPS;

        this.maxAPCPUMIPS =
            config.maxAPCPUMIPS;

        this.minAPMemoryMB =
            config.minAPMemoryMB;

        this.maxAPMemoryMB =
            config.maxAPMemoryMB;

        this.minAPDiskMB =
            config.minAPDiskMB;

        this.maxAPDiskMB =
            config.maxAPDiskMB;

        this.minAPReliability =
            config.minAPReliability;

        this.maxAPReliability =
            config.maxAPReliability;

        this.APNumNode =
            config.APNumNode;

        this.APplatform =
            config.APplatform;

        this.minENCPUMIPS =
            config.minENCPUMIPS;

        this.maxENCPUMIPS =
            config.maxENCPUMIPS;

        this.minENMemoryMB =
            config.minENMemoryMB;

        this.maxENMemoryMB =
            config.maxENMemoryMB;

        this.minENDiskMB =
            config.minENDiskMB;

        this.maxENDiskMB =
            config.maxENDiskMB;

        this.minENReliability =
            config.minENReliability;

        this.maxENReliability =
            config.maxENReliability;

        this.ENNumNode =
            config.ENNumNode;

        this.ENplatform =
            config.ENplatform;

        this.minCNCPUMIPS =
            config.minCNCPUMIPS;

        this.maxCNCPUMIPS =
            config.maxCNCPUMIPS;

        this.minCNMemoryMB =
            config.minCNMemoryMB;

        this.maxCNMemoryMB =
            config.maxCNMemoryMB;

        this.minCNDiskMB =
            config.minCNDiskMB;

        this.maxCNDiskMB =
            config.maxCNDiskMB;

        this.minCNReliability =
            config.minCNReliability;

        this.maxCNReliability =
            config.maxCNReliability;

        this.CNNumNode =
            config.CNNumNode;

        this.CNplatform =
            config.CNplatform;

        this.numUsers =
            config.numUsers;

        this.numHelpers =
            config.numHelpers;

        this.maxBandwidthInTier1 =
            config.maxBandwidthInTier1;

        this.minBandwidthInTier1 =
            config.minBandwidthInTier1;

        this.maxRttInTier1 =
            config.maxRttInTier1;

        this.minRttInTier1 =
            config.minRttInTier1;

        this.maxBandwidthInTier2 =
            config.maxBandwidthInTier2;

        this.minBandwidthInTier2 =
            config.minBandwidthInTier2;

        this.maxRttInTier2 =
            config.maxRttInTier2;

        this.minRttInTier2 =
            config.minRttInTier2;

        this.maxBandwidthInTier3 =
            config.maxBandwidthInTier3;

        this.minBandwidthInTier3 =
            config.minBandwidthInTier3;

        this.maxRttInTier3 =
            config.maxRttInTier3;

        this.minRttInTier3 =
            config.minRttInTier3;

        this.maxBandwidthFromTier1ToTier2 =
            config.maxBandwidthFromTier1ToTier2;

        this.minBandwidthFromTier1ToTier2 =
            config.minBandwidthFromTier1ToTier2;

        this.maxRttFromTier1ToTier2 =
            config.maxRttFromTier1ToTier2;

        this.minRttFromTier1ToTier2 =
            config.minRttFromTier1ToTier2;

        this.maxBandwidthFromTier1ToTier3 =
            config.maxBandwidthFromTier1ToTier3;

        this.minBandwidthFromTier1ToTier3 =
            config.minBandwidthFromTier1ToTier3;

        this.maxRttFromTier1ToTier3 =
            config.maxRttFromTier1ToTier3;

        this.minRttFromTier1ToTier3 =
            config.minRttFromTier1ToTier3;

        this.maxBandwidthFromTier2ToTier3 =
            config.maxBandwidthFromTier2ToTier3;

        this.minBandwidthFromTier2ToTier3 =
            config.minBandwidthFromTier2ToTier3;

        this.maxRttFromTier2ToTier3 =
            config.maxRttFromTier2ToTier3;

        this.minRttFromTier2ToTier3 =
            config.minRttFromTier2ToTier3;

        this.maxBandwidthFromUserToTier1 =
            config.maxBandwidthFromUserToTier1;

        this.minBandwidthFromUserToTier1 =
            config.minBandwidthFromUserToTier1;

        this.maxRttFromUserToTier1 =
            config.maxRttFromUserToTier1;

        this.minRttFromUserToTier1 =
            config.minRttFromUserToTier1;

        this.maxBandwidthFromUserToTier2 =
            config.maxBandwidthFromUserToTier2;

        this.minBandwidthFromUserToTier2 =
            config.minBandwidthFromUserToTier2;

        this.maxRttFromUserToTier2 =
            config.maxRttFromUserToTier2;

        this.minRttFromUserToTier2 =
            config.minRttFromUserToTier2;

        this.maxBandwidthFromUserToTier3 =
            config.maxBandwidthFromUserToTier3;

        this.minBandwidthFromUserToTier3 =
            config.minBandwidthFromUserToTier3;

        this.maxRttFromUserToTier3 =
            config.maxRttFromUserToTier3;

        this.minRttFromUserToTier3 =
            config.minRttFromUserToTier3;

        this.maxBandwidthFromHelperToInfrastructure =
            config.maxBandwidthFromHelperToInfrastructure;

        this.minBandwidthFromHelperToInfrastructure =
            config.minBandwidthFromHelperToInfrastructure;

        this.maxRttFromHelperToInfrastructure =
            config.maxRttFromHelperToInfrastructure;

        this.minRttFromHelperToInfrastructure =
            config.minRttFromHelperToInfrastructure;

        this.maxBandwidthFromUsersToHelpers =
            config.maxBandwidthFromUsersToHelpers;

        this.minBandwidthFromUsersToHelpers =
            config.minBandwidthFromUsersToHelpers;

        this.maxRttFromHelperUsersToHelpers =
            config.maxRttFromHelperUsersToHelpers;

        this.minRttFromHelperUsersToHelpers =
            config.minRttFromHelperUsersToHelpers;

        this.numTier =
            config.numTier ?? 3;

        this.scale =
            config.scale ??
            (
                typeof configurations !==
                'undefined'
                    ? configurations['scale']
                    : undefined
            );

        this.jsonResult = [];

        this.validateConfiguration();
    }

    validateConfiguration() {
        const integerFields = [
            [
                'APNumNode',
                this.APNumNode
            ],
            [
                'ENNumNode',
                this.ENNumNode
            ],
            [
                'CNNumNode',
                this.CNNumNode
            ],
            [
                'numUsers',
                this.numUsers
            ],
            [
                'numHelpers',
                this.numHelpers
            ],
            [
                'numTier',
                this.numTier
            ]
        ];

        for (
            const [name, value]
            of integerFields
        ) {
            if (
                !Number.isInteger(value) ||
                value < 0
            ) {
                throw new Error(
                    `${name} must be a non-negative integer.`
                );
            }
        }

        if (
            this.numTier < 1 ||
            this.numTier > 3
        ) {
            throw new Error(
                'numTier must be between 1 and 3.'
            );
        }

        const platformArrays = [
            [
                'APplatform',
                this.APplatform
            ],
            [
                'ENplatform',
                this.ENplatform
            ],
            [
                'CNplatform',
                this.CNplatform
            ]
        ];

        for (
            const [name, value]
            of platformArrays
        ) {
            if (
                !Array.isArray(value) ||
                value.length === 0
            ) {
                throw new Error(
                    `${name} must be a non-empty array.`
                );
            }
        }
    }

    safeProbability(value) {
        const epsilon =
            Number.EPSILON;

        return Math.min(
            1 - epsilon,
            Math.max(
                epsilon,
                value
            )
        );
    }

    randomPlatform(platforms) {
        return platforms[
            Math.floor(
                Math.random() *
                platforms.length
            )
        ];
    }

    getReliabilityScore(
        min,
        max
    ) {
        if (
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            max < min
        ) {
            throw new Error(
                `Invalid reliability range [${min}, ${max}].`
            );
        }

        const highMin =
            Math.max(
                min,
                0.98
            );

        const highMax =
            Math.min(
                max,
                0.999
            );

        if (
            Math.random() <= 0.6 &&
            highMax >= highMin
        ) {
            return getRandomValue(
                highMin,
                highMax
            );
        }

        return getRandomValue(
            min,
            max
        );
    }

    createNode({
        nodeID,
        nodeTier,
        minCPU,
        maxCPU,
        minMemory,
        maxMemory,
        minDisk,
        maxDisk,
        minReliability,
        maxReliability,
        platforms,
        cpuSplit,
        cpuWeightUpper,
        memorySplit,
        memoryWeightUpper
    }) {
        return {
            nodeID:
                nodeID,

            nodeTier:
                nodeTier,

            characteristics: {
                cpu:
                    Math.round(
                        weightedRandom(
                            minCPU,
                            maxCPU,
                            cpuSplit,
                            cpuWeightUpper
                        )
                    ),

                memory:
                    Math.round(
                        weightedRandom(
                            minMemory,
                            maxMemory,
                            memorySplit,
                            memoryWeightUpper
                        )
                    ),

                disk:
                    Number(
                        getRandomValue(
                            minDisk,
                            maxDisk
                        ).toFixed(1)
                    ),

                platform:
                    this.randomPlatform(
                        platforms
                    ),

                reliabilityScore:
                    this.getReliabilityScore(
                        minReliability,
                        maxReliability
                    )
            }
        };
    }

    generate() {
        this.jsonResult = [];

        let id = 0;

        const rnd1 =
            this.safeProbability(
                Math.random()
            );

        const rnd2 =
            this.safeProbability(
                Math.random()
            );

        if (this.numTier >= 1) {
            for (
                let i = 0;
                i < this.APNumNode;
                i++
            ) {
                this.jsonResult.push(
                    this.createNode({
                        nodeID:
                            ++id,

                        nodeTier:
                            1,

                        minCPU:
                            this.minAPCPUMIPS,

                        maxCPU:
                            this.maxAPCPUMIPS,

                        minMemory:
                            this.minAPMemoryMB,

                        maxMemory:
                            this.maxAPMemoryMB,

                        minDisk:
                            this.minAPDiskMB,

                        maxDisk:
                            this.maxAPDiskMB,

                        minReliability:
                            this.minAPReliability,

                        maxReliability:
                            this.maxAPReliability,

                        platforms:
                            this.APplatform,

                        cpuSplit:
                            rnd1,

                        cpuWeightUpper:
                            rnd2,

                        memorySplit:
                            rnd1,

                        memoryWeightUpper:
                            rnd2
                    })
                );
            }
        }

        if (this.numTier >= 2) {
            for (
                let i = 0;
                i < this.ENNumNode;
                i++
            ) {
                this.jsonResult.push(
                    this.createNode({
                        nodeID:
                            ++id,

                        nodeTier:
                            2,

                        minCPU:
                            this.minENCPUMIPS,

                        maxCPU:
                            this.maxENCPUMIPS,

                        minMemory:
                            this.minENMemoryMB,

                        maxMemory:
                            this.maxENMemoryMB,

                        minDisk:
                            this.minENDiskMB,

                        maxDisk:
                            this.maxENDiskMB,

                        minReliability:
                            this.minENReliability,

                        maxReliability:
                            this.maxENReliability,

                        platforms:
                            this.ENplatform,

                        cpuSplit:
                            rnd1,

                        cpuWeightUpper:
                            rnd2,

                        memorySplit:
                            rnd2,

                        memoryWeightUpper:
                            rnd1
                    })
                );
            }
        }

        if (this.numTier >= 3) {
            for (
                let i = 0;
                i < this.CNNumNode;
                i++
            ) {
                this.jsonResult.push(
                    this.createNode({
                        nodeID:
                            ++id,

                        nodeTier:
                            3,

                        minCPU:
                            this.minCNCPUMIPS,

                        maxCPU:
                            this.maxCNCPUMIPS,

                        minMemory:
                            this.minCNMemoryMB,

                        maxMemory:
                            this.maxCNMemoryMB,

                        minDisk:
                            this.minCNDiskMB,

                        maxDisk:
                            this.maxCNDiskMB,

                        minReliability:
                            this.minCNReliability,

                        maxReliability:
                            this.maxCNReliability,

                        platforms:
                            this.CNplatform,

                        cpuSplit:
                            rnd1,

                        cpuWeightUpper:
                            rnd2,

                        memorySplit:
                            rnd2,

                        memoryWeightUpper:
                            rnd1
                    })
                );
            }
        }

        return this.jsonResult;
    }

    makeLink(
        minBandwidth,
        maxBandwidth,
        minRtt,
        maxRtt
    ) {
        if (
            !Number.isFinite(minBandwidth) ||
            !Number.isFinite(maxBandwidth) ||
            maxBandwidth < minBandwidth
        ) {
            throw new Error(
                `Invalid bandwidth range [${minBandwidth}, ${maxBandwidth}].`
            );
        }

        if (
            !Number.isFinite(minRtt) ||
            !Number.isFinite(maxRtt) ||
            maxRtt < minRtt
        ) {
            throw new Error(
                `Invalid RTT range [${minRtt}, ${maxRtt}].`
            );
        }

        const bandwidth =
            Math.floor(
                getRandomValue(
                    minBandwidth,
                    maxBandwidth
                )
            );

        return [
            bandwidth,
            Number(
                getRandomValue(
                    minRtt,
                    maxRtt
                ).toFixed(4)
            ),
            bandwidth
        ];
    }

    connections() {
        const numTier1 =
            this.numTier >= 1
                ? this.APNumNode
                : 0;

        const numTier2 =
            this.numTier >= 2
                ? this.ENNumNode
                : 0;

        const numTier3 =
            this.numTier >= 3
                ? this.CNNumNode
                : 0;

        const totalComputingNodes =
            numTier1 +
            numTier2 +
            numTier3;

        const helperStart =
            totalComputingNodes;

        const helperEnd =
            helperStart +
            this.numHelpers;

        const userStart =
            helperEnd;

        const userEnd =
            userStart +
            this.numUsers;

        const totalNodes =
            userEnd;

        const tier1Start =
            0;

        const tier1End =
            numTier1;

        const tier2Start =
            tier1End;

        const tier2End =
            tier2Start +
            numTier2;

        const tier3Start =
            tier2End;

        const tier3End =
            tier3Start +
            numTier3;

        const isTier1 =
            index =>
                index >= tier1Start &&
                index < tier1End;

        const isTier2 =
            index =>
                index >= tier2Start &&
                index < tier2End;

        const isTier3 =
            index =>
                index >= tier3Start &&
                index < tier3End;

        const isComputing =
            index =>
                index >= 0 &&
                index < totalComputingNodes;

        const isHelper =
            index =>
                index >= helperStart &&
                index < helperEnd;

        const isUser =
            index =>
                index >= userStart &&
                index < userEnd;

        const nodeConnections =
            Array.from(
                {
                    length:
                        totalNodes
                },
                () =>
                    Array(
                        totalNodes
                    )
            );

        const userToInfrastructureLink =
            computingIndex => {
                if (
                    isTier1(
                        computingIndex
                    )
                ) {
                    return this.makeLink(
                        this.minBandwidthFromUserToTier1,
                        this.maxBandwidthFromUserToTier1,
                        this.minRttFromUserToTier1,
                        this.maxRttFromUserToTier1
                    );
                }

                if (
                    isTier2(
                        computingIndex
                    )
                ) {
                    return this.makeLink(
                        this.minBandwidthFromUserToTier2,
                        this.maxBandwidthFromUserToTier2,
                        this.minRttFromUserToTier2,
                        this.maxRttFromUserToTier2
                    );
                }

                if (
                    isTier3(
                        computingIndex
                    )
                ) {
                    return this.makeLink(
                        this.minBandwidthFromUserToTier3,
                        this.maxBandwidthFromUserToTier3,
                        this.minRttFromUserToTier3,
                        this.maxRttFromUserToTier3
                    );
                }

                throw new Error(
                    `Computing node index ${computingIndex} does not belong to a tier.`
                );
            };

        for (
            let i = 0;
            i < totalNodes;
            i++
        ) {
            for (
                let j = i;
                j < totalNodes;
                j++
            ) {
                let link;

                if (i === j) {
                    link = [
                        100000,
                        0,
                        100000
                    ];
                }
                else if (
                    isComputing(i) &&
                    isComputing(j)
                ) {
                    if (
                        isTier1(i) &&
                        isTier1(j)
                    ) {
                        link =
                            this.makeLink(
                                this.minBandwidthInTier1,
                                this.maxBandwidthInTier1,
                                this.minRttInTier1,
                                this.maxRttInTier1
                            );
                    }
                    else if (
                        isTier2(i) &&
                        isTier2(j)
                    ) {
                        link =
                            this.makeLink(
                                this.minBandwidthInTier2,
                                this.maxBandwidthInTier2,
                                this.minRttInTier2,
                                this.maxRttInTier2
                            );
                    }
                    else if (
                        isTier3(i) &&
                        isTier3(j)
                    ) {
                        link =
                            this.makeLink(
                                this.minBandwidthInTier3,
                                this.maxBandwidthInTier3,
                                this.minRttInTier3,
                                this.maxRttInTier3
                            );
                    }
                    else if (
                        (
                            isTier1(i) &&
                            isTier2(j)
                        )
                        ||
                        (
                            isTier2(i) &&
                            isTier1(j)
                        )
                    ) {
                        link =
                            this.makeLink(
                                this.minBandwidthFromTier1ToTier2,
                                this.maxBandwidthFromTier1ToTier2,
                                this.minRttFromTier1ToTier2,
                                this.maxRttFromTier1ToTier2
                            );
                    }
                    else if (
                        (
                            isTier1(i) &&
                            isTier3(j)
                        )
                        ||
                        (
                            isTier3(i) &&
                            isTier1(j)
                        )
                    ) {
                        link =
                            this.makeLink(
                                this.minBandwidthFromTier1ToTier3,
                                this.maxBandwidthFromTier1ToTier3,
                                this.minRttFromTier1ToTier3,
                                this.maxRttFromTier1ToTier3
                            );
                    }
                    else {
                        link =
                            this.makeLink(
                                this.minBandwidthFromTier2ToTier3,
                                this.maxBandwidthFromTier2ToTier3,
                                this.minRttFromTier2ToTier3,
                                this.maxRttFromTier2ToTier3
                            );
                    }
                }
                else if (
                    (
                        isComputing(i) &&
                        isHelper(j)
                    )
                    ||
                    (
                        isHelper(i) &&
                        isComputing(j)
                    )
                ) {
                    link =
                        this.makeLink(
                            this.minBandwidthFromHelperToInfrastructure,
                            this.maxBandwidthFromHelperToInfrastructure,
                            this.minRttFromHelperToInfrastructure,
                            this.maxRttFromHelperToInfrastructure
                        );
                }
                else if (
                    (
                        isComputing(i) &&
                        isUser(j)
                    )
                    ||
                    (
                        isUser(i) &&
                        isComputing(j)
                    )
                ) {
                    const computingIndex =
                        isComputing(i)
                            ? i
                            : j;

                    link =
                        userToInfrastructureLink(
                            computingIndex
                        );
                }
                else if (
                    (
                        isHelper(i) &&
                        isUser(j)
                    )
                    ||
                    (
                        isUser(i) &&
                        isHelper(j)
                    )
                ) {
                    link =
                        this.makeLink(
                            this.minBandwidthFromUsersToHelpers,
                            this.maxBandwidthFromUsersToHelpers,
                            this.minRttFromHelperUsersToHelpers,
                            this.maxRttFromHelperUsersToHelpers
                        );
                }
                else {
                    link = [
                        0,
                        0,
                        0
                    ];
                }

                nodeConnections[i][j] =
                    [...link];

                nodeConnections[j][i] =
                    [...link];
            }
        }

        if (this.scale) {
            fs.mkdirSync(
                `./${this.scale}`,
                {
                    recursive: true
                }
            );

            fs.writeFileSync(
                `./${this.scale}/infraConnections.json`,
                JSON.stringify(
                    nodeConnections,
                    null,
                    2
                ),
                'utf8'
            );
        }

        return nodeConnections;
    }

    capacity(
        computingNodes,
        connections
    ) {
        if (
            !Array.isArray(computingNodes) ||
            !Array.isArray(connections)
        ) {
            throw new Error(
                'computingNodes and connections must be arrays.'
            );
        }

        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;

        for (
            const node
            of computingNodes
        ) {
            totalComputationalCapacity +=
                node[
                    'characteristics'
                ][
                    'cpu'
                ];

            totalMemoryCapacity +=
                node[
                    'characteristics'
                ][
                    'memory'
                ];

            totalDiskCapacity +=
                node[
                    'characteristics'
                ][
                    'disk'
                ];
        }

        let totalBandwidthCapacity = 0;

        for (
            let i = 0;
            i < connections.length;
            i++
        ) {
            for (
                let j = i + 1;
                j < connections[i].length;
                j++
            ) {
                const bandwidth =
                    connections
                        ?.[i]
                        ?.[j]
                        ?.[0];

                if (
                    typeof bandwidth === 'number' &&
                    Number.isFinite(
                        bandwidth
                    ) &&
                    bandwidth > 0
                ) {
                    totalBandwidthCapacity +=
                        bandwidth;
                }
            }
        }

        return {
            totalComputationalCapacity:
                totalComputationalCapacity,

            totalMemoryCapacity:
                totalMemoryCapacity,

            totalDiskCapacity:
                totalDiskCapacity,

            totalBandwidthCapacitiy:
                totalBandwidthCapacity
        };
    }
}

class helpersGenerator {
    constructor(helperConfig) {
        const config =
            helperConfig;

        this.minCPUMIPS =
            config.minCPUMIPS;

        this.maxCPUMIPS =
            config.maxCPUMIPS;

        this.minMemoryMB =
            config.minMemoryMB;

        this.maxMemoryMB =
            config.maxMemoryMB;

        this.minDiskMB =
            config.minDiskMB;

        this.maxDiskMB =
            config.maxDiskMB;

        this.minReliability =
            config.minReliability;

        this.maxReliability =
            config.maxReliability;

        this.os =
            config.os;

        this.numHelpers =
            config.numHelpers;

        this.numComputingNodes =
            config.numComputingNodes;

        this.jsonResult = [];

        this.validateConfiguration();
    }

    validateConfiguration() {
        if (
            !Number.isInteger(
                this.numHelpers
            ) ||
            this.numHelpers < 0
        ) {
            throw new Error(
                'numHelpers must be a non-negative integer.'
            );
        }

        if (
            !Number.isInteger(
                this.numComputingNodes
            ) ||
            this.numComputingNodes < 0
        ) {
            throw new Error(
                'numComputingNodes must be a non-negative integer.'
            );
        }

        this.validateRange(
            'CPU',
            this.minCPUMIPS,
            this.maxCPUMIPS
        );

        this.validateRange(
            'memory',
            this.minMemoryMB,
            this.maxMemoryMB
        );

        this.validateRange(
            'disk',
            this.minDiskMB,
            this.maxDiskMB
        );

        this.validateRange(
            'reliability',
            this.minReliability,
            this.maxReliability
        );

        if (
            this.minReliability < 0 ||
            this.maxReliability > 1
        ) {
            throw new Error(
                'Reliability must be between 0 and 1.'
            );
        }

        if (
            !Array.isArray(
                this.os
            ) ||
            this.os.length === 0
        ) {
            throw new Error(
                'os must be a non-empty array.'
            );
        }
    }

    validateRange(
        name,
        min,
        max
    ) {
        if (
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            max < min
        ) {
            throw new Error(
                `Invalid ${name} range: [${min}, ${max}].`
            );
        }
    }

    getReliabilityScore(
        min,
        max
    ) {
        return getRandomValue(
            min,
            max
        );
    }

    generate() {
        this.jsonResult = [];

        for (
            let i = 0;
            i < this.numHelpers;
            i++
        ) {
            const helper = {
                nodeID:
                    this.numComputingNodes +
                    i +
                    1,

                nodeTier:
                    4,

                characteristics: {
                    cpu:
                        getRandomDivisibleByN(
                            this.minCPUMIPS,
                            this.maxCPUMIPS,
                            1
                        ),

                    memory:
                        Math.round(
                            randAny(
                                this.minMemoryMB,
                                this.maxMemoryMB,
                                1
                            )
                        ),

                    disk:
                        Number(
                            getRandomValue(
                                this.minDiskMB,
                                this.maxDiskMB
                            ).toFixed(1)
                        ),

                    os:
                        this.os[
                            Math.floor(
                                Math.random() *
                                this.os.length
                            )
                        ],

                    reliability:
                        this.getReliabilityScore(
                            this.minReliability,
                            this.maxReliability
                        )
                }
            };

            this.jsonResult.push(
                helper
            );
        }

        return this.jsonResult;
    }

    capacity(helpers) {
        if (
            !Array.isArray(
                helpers
            )
        ) {
            throw new Error(
                'helpers must be an array.'
            );
        }

        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;

        for (
            const helper
            of helpers
        ) {
            if (
                !helper ||
                !helper.characteristics
            ) {
                throw new Error(
                    'Invalid helper object.'
                );
            }

            totalComputationalCapacity +=
                helper
                    .characteristics
                    .cpu;

            totalMemoryCapacity +=
                helper
                    .characteristics
                    .memory;

            totalDiskCapacity +=
                helper
                    .characteristics
                    .disk;
        }

        return {
            totalComputationalCapacity,
            totalMemoryCapacity,
            totalDiskCapacity
        };
    }
}

class usersGenerator {
    constructor(userConfig) {
        const config =
            userConfig;

        this.minCPUMIPS =
            config.minCPUMIPS;

        this.maxCPUMIPS =
            config.maxCPUMIPS;

        this.minMemoryMB =
            config.minMemoryMB;

        this.maxMemoryMB =
            config.maxMemoryMB;

        this.minDiskMB =
            config.minDiskMB;

        this.maxDiskMB =
            config.maxDiskMB;

        this.minReliability =
            config.minReliability;

        this.maxReliability =
            config.maxReliability;

        this.os =
            config.os;

        this.numUsers =
            config.numUsers;

        this.numComputingNodes =
            config.numComputingNodes;

        this.numHelpers =
            config.numHelpers;

        this.jsonResult = [];

        this.validateConfiguration();
    }

    validateConfiguration() {
        if (
            !Number.isInteger(
                this.numUsers
            ) ||
            this.numUsers < 0
        ) {
            throw new Error(
                'numUsers must be a non-negative integer.'
            );
        }

        if (
            !Number.isInteger(
                this.numComputingNodes
            ) ||
            this.numComputingNodes < 0
        ) {
            throw new Error(
                'numComputingNodes must be a non-negative integer.'
            );
        }

        if (
            !Number.isInteger(
                this.numHelpers
            ) ||
            this.numHelpers < 0
        ) {
            throw new Error(
                'numHelpers must be a non-negative integer.'
            );
        }

        this.validateRange(
            'CPU',
            this.minCPUMIPS,
            this.maxCPUMIPS
        );

        this.validateRange(
            'memory',
            this.minMemoryMB,
            this.maxMemoryMB
        );

        this.validateRange(
            'disk',
            this.minDiskMB,
            this.maxDiskMB
        );

        this.validateRange(
            'reliability',
            this.minReliability,
            this.maxReliability
        );

        if (
            this.minReliability < 0 ||
            this.maxReliability > 1
        ) {
            throw new Error(
                'Reliability must be between 0 and 1.'
            );
        }

        if (
            !Array.isArray(
                this.os
            ) ||
            this.os.length === 0
        ) {
            throw new Error(
                'os must be a non-empty array.'
            );
        }
    }

    validateRange(
        name,
        min,
        max
    ) {
        if (
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            max < min
        ) {
            throw new Error(
                `Invalid ${name} range: [${min}, ${max}].`
            );
        }
    }

    getReliabilityScore(
        min,
        max
    ) {
        return getRandomValue(
            min,
            max
        );
    }

    generate() {
        this.jsonResult = [];

        for (
            let i = 0;
            i < this.numUsers;
            i++
        ) {
            const user = {
                nodeID:
                    this.numComputingNodes +
                    this.numHelpers +
                    i +
                    1,

                nodeTier:
                    0,

                characteristics: {
                    cpu:
                        getRandomDivisibleByN(
                            this.minCPUMIPS,
                            this.maxCPUMIPS,
                            1
                        ),

                    memory:
                        Math.round(
                            randAny(
                                this.minMemoryMB,
                                this.maxMemoryMB,
                                1
                            )
                        ),

                    disk:
                        Number(
                            getRandomValue(
                                this.minDiskMB,
                                this.maxDiskMB
                            ).toFixed(1)
                        ),

                    os:
                        this.os[
                            Math.floor(
                                Math.random() *
                                this.os.length
                            )
                        ],

                    reliability:
                        this.getReliabilityScore(
                            this.minReliability,
                            this.maxReliability
                        )
                }
            };

            this.jsonResult.push(
                user
            );
        }

        return this.jsonResult;
    }

    capacity(users) {
        if (
            !Array.isArray(
                users
            )
        ) {
            throw new Error(
                'users must be an array.'
            );
        }

        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;

        for (
            const user
            of users
        ) {
            if (
                !user ||
                !user.characteristics
            ) {
                throw new Error(
                    'Invalid user object.'
                );
            }

            totalComputationalCapacity +=
                user
                    .characteristics
                    .cpu;

            totalMemoryCapacity +=
                user
                    .characteristics
                    .memory;

            totalDiskCapacity +=
                user
                    .characteristics
                    .disk;
        }

        return {
            totalComputationalCapacity,
            totalMemoryCapacity,
            totalDiskCapacity
        };
    }
}

class serviceGenerator {
    constructor(serviceConfig) {
        const config =
            serviceConfig;

        this.platformComputationalCapacity =
            config.platformComputationalCapacity;

        this.platformDiskCapacity =
            config.platformDiskCapacity;

        this.platformMemoryCapacity =
            config.platformMemoryCapacity;

        this.platformNetworkCapacity =
            config.platformNetworkCapacity;

        this.internalProvider =
            config.internalProvider;

        this.externalProvider =
            config.externalProvider;

        this.codecType =
            config.codecType;

        this.minReliability =
            config.minReliability;

        this.maxReliability =
            config.maxReliability;

        this.minCPUMIPS =
            config.minCPUMIPS;

        this.maxCPUMIPS =
            config.maxCPUMIPS;

        this.minDataSizeCommunication =
            config.minDataSizeCommunication;

        this.maxDataSizeCommunication =
            config.maxDataSizeCommunication;

        this.numVersions =
            config.numVersions;

        this.numComputingNodes =
            config.numComputingNodes;

        this.numHelpers =
            config.numHelpers;

        this.numUsers =
            config.numUsers;

        // Actual generated nodes are needed to guarantee that mandatory
        // user/helper endpoints and middle components have at least one
        // complete resource-feasible placement.
        this.computingNodes =
            Array.isArray(config.computingNodes)
                ? config.computingNodes
                : [];

        this.helperNodes =
            Array.isArray(config.helperNodes)
                ? config.helperNodes
                : [];

        this.usersNodes =
            Array.isArray(config.usersNodes)
                ? config.usersNodes
                : [];

        this.capacityPercentage =
            config.capacityPercentage;

        this.numServiceComponents =
            config.numServiceComponents;

        this.extraConnectionProbability =
            config.extraConnectionProbability ?? 0.5;

        this.scale =
            config.scale ??
            (
                typeof configurations !== 'undefined'
                    ? configurations['scale']
                    : undefined
            );

        this.validateConfiguration();
    }

    validateConfiguration() {
        const integerFields = [
            [
                'numVersions',
                this.numVersions
            ],
            [
                'numServiceComponents',
                this.numServiceComponents
            ],
            [
                'numUsers',
                this.numUsers
            ],
            [
                'numHelpers',
                this.numHelpers
            ],
            [
                'numComputingNodes',
                this.numComputingNodes
            ]
        ];

        for (
            const [name, value]
            of integerFields
        ) {
            if (
                !Number.isInteger(value) ||
                value < 0
            ) {
                throw new Error(
                    `${name} must be a non-negative integer.`
                );
            }
        }

        if (
            this.numUsers > 0 &&
            this.numVersions === 0
        ) {
            throw new Error(
                'numVersions must be greater than 0 when services are generated.'
            );
        }

        if (
            this.numUsers > 0 &&
            this.numServiceComponents === 0
        ) {
            throw new Error(
                'numServiceComponents must be greater than 0 when services are generated.'
            );
        }

        if (
            this.numUsers > 0 &&
            this.numHelpers === 0
        ) {
            throw new Error(
                'At least one helper is required when services are generated.'
            );
        }

        this.validateRange(
            'CPU',
            this.minCPUMIPS,
            this.maxCPUMIPS
        );

        this.validateRange(
            'data size',
            this.minDataSizeCommunication,
            this.maxDataSizeCommunication
        );

        this.validateRange(
            'reliability',
            this.minReliability,
            this.maxReliability
        );

        if (
            this.minReliability < 0 ||
            this.maxReliability > 1
        ) {
            throw new Error(
                'Reliability values must be between 0 and 1.'
            );
        }

        if (
            !Number.isFinite(
                this.platformMemoryCapacity
            ) ||
            this.platformMemoryCapacity < 0
        ) {
            throw new Error(
                'platformMemoryCapacity must be non-negative.'
            );
        }

        if (
            !Number.isFinite(
                this.platformDiskCapacity
            ) ||
            this.platformDiskCapacity < 0
        ) {
            throw new Error(
                'platformDiskCapacity must be non-negative.'
            );
        }

        if (
            !Number.isFinite(
                this.capacityPercentage
            ) ||
            this.capacityPercentage < 0 ||
            this.capacityPercentage > 1
        ) {
            throw new Error(
                'capacityPercentage must be between 0 and 1.'
            );
        }

        if (
            !Number.isFinite(
                this.extraConnectionProbability
            ) ||
            this.extraConnectionProbability < 0 ||
            this.extraConnectionProbability > 1
        ) {
            throw new Error(
                'extraConnectionProbability must be between 0 and 1.'
            );
        }

        if (
            !Array.isArray(
                this.internalProvider
            ) ||
            this.internalProvider.length === 0
        ) {
            throw new Error(
                'internalProvider must be a non-empty array.'
            );
        }

        if (
            !Array.isArray(
                this.externalProvider
            ) ||
            this.externalProvider.length === 0
        ) {
            throw new Error(
                'externalProvider must be a non-empty array.'
            );
        }

        if (
            !Array.isArray(
                this.codecType
            ) ||
            this.codecType.length === 0
        ) {
            throw new Error(
                'codecType must be a non-empty array.'
            );
        }
    }

    validateRange(
        name,
        min,
        max
    ) {
        if (
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            max < min
        ) {
            throw new Error(
                `Invalid ${name} range: [${min}, ${max}].`
            );
        }
    }

    safeProbability(value) {
        const epsilon =
            Number.EPSILON;

        return Math.min(
            1 - epsilon,
            Math.max(
                epsilon,
                value
            )
        );
    }

    getReliabilityScore(
        min,
        max
    ) {
        const highMin =
            Math.max(
                min,
                0.99
            );

        const highMax =
            Math.min(
                max,
                1
            );

        if (
            Math.random() <= 0.7 &&
            highMax >= highMin
        ) {
            return getRandomValue(
                highMin,
                highMax
            );
        }

        return getRandomValue(
            min,
            max
        );
    }

    getProvider() {
        const useInternal =
            Math.random() < 0.5;

        const providers =
            useInternal
                ? this.internalProvider
                : this.externalProvider;

        return providers[
            Math.floor(
                Math.random() *
                providers.length
            )
        ];
    }

    getCodecType() {
        return this.codecType[
            Math.floor(
                Math.random() *
                this.codecType.length
            )
        ];
    }

    _clone(value) {
        return JSON.parse(
            JSON.stringify(value)
        );
    }

    _resourceValue(
        characteristics,
        key
    ) {
        const value =
            characteristics?.[key];

        if (
            key === 'disk' &&
            value === undefined
        ) {
            return 0;
        }

        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0
        ) {
            throw new Error(
                `Invalid ${key} value while checking generated scenario feasibility: ${value}`
            );
        }

        return value;
    }

    _fitsGeneratedCapacity(
        node,
        version
    ) {
        const nodeCharacteristics =
            node?.characteristics;

        const versionCharacteristics =
            version?.characteristics;

        return (
            this._resourceValue(
                nodeCharacteristics,
                'cpu'
            ) >=
            this._resourceValue(
                versionCharacteristics,
                'cpu'
            )
            &&
            this._resourceValue(
                nodeCharacteristics,
                'memory'
            ) >=
            this._resourceValue(
                versionCharacteristics,
                'memory'
            )
            &&
            this._resourceValue(
                nodeCharacteristics,
                'disk'
            ) >=
            this._resourceValue(
                versionCharacteristics,
                'disk'
            )
        );
    }

    _consumeGeneratedCapacity(
        node,
        version
    ) {
        const nodeCharacteristics =
            node.characteristics;

        const versionCharacteristics =
            version.characteristics;

        nodeCharacteristics.cpu -=
            this._resourceValue(
                versionCharacteristics,
                'cpu'
            );

        nodeCharacteristics.memory -=
            this._resourceValue(
                versionCharacteristics,
                'memory'
            );

        if (
            nodeCharacteristics.disk !== undefined ||
            versionCharacteristics.disk !== undefined
        ) {
            nodeCharacteristics.disk =
                this._resourceValue(
                    nodeCharacteristics,
                    'disk'
                ) -
                this._resourceValue(
                    versionCharacteristics,
                    'disk'
                );
        }
    }

    _repairVersionForNode(
        component,
        node,
        bounds,
        context
    ) {
        if (
            !node ||
            !node.characteristics
        ) {
            throw new Error(
                `${context}: required placement node does not exist.`
            );
        }

        const versions =
            component?.versions ?? [];

        if (versions.length === 0) {
            throw new Error(
                `${context}: component has no versions.`
            );
        }

        const freeCPU =
            this._resourceValue(
                node.characteristics,
                'cpu'
            );

        const freeMemory =
            this._resourceValue(
                node.characteristics,
                'memory'
            );

        const freeDisk =
            this._resourceValue(
                node.characteristics,
                'disk'
            );

        // Never silently violate the configured lower CPU demand.
        // If even the minimum configured CPU cannot fit, the use-case
        // configuration itself is incompatible with mandatory endpoint
        // placement and must be corrected instead of fabricating a demand.
        if (freeCPU < bounds.minCPU) {
            throw new Error(
                `${context}: node ${node.nodeID} has only ${freeCPU} CPU, ` +
                `below the configured minimum service demand ${bounds.minCPU}. ` +
                `Increase endpoint CPU capacity or lower serviceConfig.minCPUMIPS.`
            );
        }

        if (freeMemory < bounds.minMemory) {
            throw new Error(
                `${context}: node ${node.nodeID} has only ${freeMemory} memory, ` +
                `below the generated minimum component memory ${bounds.minMemory}. ` +
                `Increase endpoint memory capacity or reduce service capacityPercentage.`
            );
        }

        if (freeDisk < bounds.minDisk) {
            throw new Error(
                `${context}: node ${node.nodeID} has only ${freeDisk} disk, ` +
                `below the generated minimum component disk ${bounds.minDisk}. ` +
                `Increase endpoint disk capacity or reduce the generated service disk demand.`
            );
        }

        // Change the already-lightest version. This keeps the random
        // population intact as much as possible while creating one
        // explicit feasibility-anchor version for this placement.
        const target =
            versions
                .slice()
                .sort(
                    (a, b) => {
                        const ac = a.characteristics;
                        const bc = b.characteristics;

                        return (
                            this._resourceValue(ac, 'cpu') -
                            this._resourceValue(bc, 'cpu')
                        ) || (
                            this._resourceValue(ac, 'memory') -
                            this._resourceValue(bc, 'memory')
                        ) || (
                            this._resourceValue(ac, 'disk') -
                            this._resourceValue(bc, 'disk')
                        );
                    }
                )[0];

        target.characteristics.cpu =
            Math.max(
                bounds.minCPU,
                Math.min(
                    target.characteristics.cpu,
                    Math.floor(freeCPU)
                )
            );

        target.characteristics.memory =
            Math.max(
                bounds.minMemory,
                Math.min(
                    target.characteristics.memory,
                    freeMemory
                )
            );

        target.characteristics.disk =
            Math.max(
                bounds.minDisk,
                Math.min(
                    this._resourceValue(
                        target.characteristics,
                        'disk'
                    ),
                    freeDisk
                )
            );

        if (
            !this._fitsGeneratedCapacity(
                node,
                target
            )
        ) {
            throw new Error(
                `${context}: failed to construct a feasible anchor version for node ${node.nodeID}.`
            );
        }

        return target;
    }

    _pickOrRepairPlacement(
        component,
        candidateNodes,
        bounds,
        context
    ) {
        if (
            !Array.isArray(candidateNodes) ||
            candidateNodes.length === 0
        ) {
            throw new Error(
                `${context}: no allowed placement nodes are available.`
            );
        }

        for (const node of candidateNodes) {
            for (
                const version
                of component.versions ?? []
            ) {
                if (
                    this._fitsGeneratedCapacity(
                        node,
                        version
                    )
                ) {
                    return {
                        node,
                        version,
                        repaired: false
                    };
                }
            }
        }

        // No generated version currently fits. Pick the node that requires
        // the least normalized reduction and repair one lightweight version.
        let bestNode = null;
        let bestCost = Infinity;

        for (const node of candidateNodes) {
            const nc =
                node.characteristics;

            for (
                const version
                of component.versions ?? []
            ) {
                const vc =
                    version.characteristics;

                const cpu =
                    this._resourceValue(vc, 'cpu');
                const memory =
                    this._resourceValue(vc, 'memory');
                const disk =
                    this._resourceValue(vc, 'disk');

                const cost =
                    Math.max(
                        0,
                        cpu -
                        this._resourceValue(nc, 'cpu')
                    ) / Math.max(cpu, 1)
                    +
                    Math.max(
                        0,
                        memory -
                        this._resourceValue(nc, 'memory')
                    ) / Math.max(memory, 1)
                    +
                    Math.max(
                        0,
                        disk -
                        this._resourceValue(nc, 'disk')
                    ) / Math.max(disk, 1);

                if (cost < bestCost) {
                    bestCost = cost;
                    bestNode = node;
                }
            }
        }

        if (!bestNode) {
            throw new Error(
                `${context}: unable to choose a placement node for repair.`
            );
        }

        const repairedVersion =
            this._repairVersionForNode(
                component,
                bestNode,
                bounds,
                context
            );

        return {
            node: bestNode,
            version: repairedVersion,
            repaired: true
        };
    }

    ensurePlacementFeasibility(
        services,
        bounds
    ) {
        if (
            !Array.isArray(services)
        ) {
            throw new Error(
                'Generated services must be an array.'
            );
        }

        const computingCapacity =
            this._clone(
                this.computingNodes
            );

        const helperCapacity =
            this._clone(
                this.helperNodes
            );

        const userCapacity =
            this._clone(
                this.usersNodes
            );

        const computingByID =
            new Map(
                computingCapacity.map(
                    node => [
                        node.nodeID,
                        node
                    ]
                )
            );

        const helpersByID =
            new Map(
                helperCapacity.map(
                    node => [
                        node.nodeID,
                        node
                    ]
                )
            );

        const usersByID =
            new Map(
                userCapacity.map(
                    node => [
                        node.nodeID,
                        node
                    ]
                )
            );

        const witnessSolution = [];
        let repairedVersions = 0;

        for (const service of services) {
            const components =
                service.components ?? [];

            for (
                let componentIndex = 0;
                componentIndex < components.length;
                componentIndex++
            ) {
                const component =
                    components[componentIndex];

                let candidateNodes;
                let placementKind;

                // Mirror solutionOperation._endpoint() exactly. The last
                // component check intentionally comes first, so a one-
                // component service uses its helper endpoint under the
                // current solver model.
                if (
                    componentIndex ===
                    components.length - 1
                ) {
                    const helper =
                        helpersByID.get(
                            service.helperID
                        );

                    candidateNodes =
                        helper
                            ? [helper]
                            : [];

                    placementKind =
                        `required helper ${service.helperID}`;
                }
                else if (componentIndex === 0) {
                    const user =
                        usersByID.get(
                            service.userID
                        );

                    candidateNodes =
                        user
                            ? [user]
                            : [];

                    placementKind =
                        `required user ${service.userID}`;
                }
                else {
                    candidateNodes =
                        [...computingByID.values()];

                    placementKind =
                        'computing tier';
                }

                const context =
                    `Service ${service.serviceID}, component ${component.componentID} (${placementKind})`;

                const placement =
                    this._pickOrRepairPlacement(
                        component,
                        candidateNodes,
                        bounds,
                        context
                    );

                if (placement.repaired) {
                    repairedVersions++;
                }

                this._consumeGeneratedCapacity(
                    placement.node,
                    placement.version
                );

                witnessSolution.push([
                    service.serviceID,
                    component.componentID,
                    placement.version.versionNumber,
                    placement.node.nodeID
                ]);
            }
        }

        return {
            witnessSolution,
            repairedVersions
        };
    }

    generate() {
        if (this.numUsers === 0) {
            return {
                services: [],

                min_max_CPUrequired: [
                    this.minCPUMIPS,
                    this.maxCPUMIPS
                ],

                min_max_MAMORYrequired: [
                    0,
                    0
                ],

                min_max_DISKrequired: [
                    0,
                    0
                ],

                min_max_DATASIZE: [
                    this.minDataSizeCommunication,
                    this.maxDataSizeCommunication
                ],

                num_serviceComponentEach:
                    this.numServiceComponents,

                num_services:
                    0
            };
        }

        const totalServiceComponents =
            this.numUsers *
            this.numServiceComponents;

        const platformMemory =
            this.platformMemoryCapacity *
            this.capacityPercentage;

        const platformDisk =
            this.platformDiskCapacity *
            0.2;

        const maxMemoryPerComponent =
            platformMemory /
            totalServiceComponents;

        const maxDiskPerComponent =
            platformDisk /
            totalServiceComponents;

        const minCPUPerComponent =
            this.minCPUMIPS;

        const maxCPUPerComponent =
            this.maxCPUMIPS;

        const minFraction =
            0.5;

        const maxFraction =
            1;

        const rnd1 =
            this.safeProbability(
                Math.random()
            );

        const rnd2 =
            this.safeProbability(
                Math.random()
            );

        const services = [];

        let helperID =
            this.numComputingNodes +
            1;

        let userID =
            this.numComputingNodes +
            this.numHelpers +
            1;

        for (
            let serviceIndex = 0;
            serviceIndex < this.numUsers;
            serviceIndex++
        ) {
            const service = {
                serviceID:
                    serviceIndex + 1,

                components:
                    [],

                userID:
                    userID,

                helperID:
                    helperID
            };

            userID++;

            helperID++;

            if (
                helperID >
                this.numComputingNodes +
                this.numHelpers
            ) {
                helperID =
                    this.numComputingNodes +
                    1;
            }

            for (
                let componentIndex = 0;
                componentIndex <
                    this.numServiceComponents;
                componentIndex++
            ) {
                const component = {
                    componentID:
                        componentIndex + 1,

                    versions:
                        []
                };

                for (
                    let versionIndex = 0;
                    versionIndex <
                        this.numVersions;
                    versionIndex++
                ) {
                    const provider =
                        this.getProvider();

                    const codec =
                        this.getCodecType();

                    const cpu =
                        Math.round(
                            weightedRandom(
                                minCPUPerComponent,
                                maxCPUPerComponent,
                                rnd2,
                                rnd1
                            )
                        );

                    const memory =
                        Math.round(
                            randAny(
                                maxMemoryPerComponent *
                                    minFraction,

                                maxMemoryPerComponent *
                                    maxFraction,

                                0
                            )
                        );

                    const dataSize =
                        Number(
                            weightedRandom(
                                this.minDataSizeCommunication,
                                this.maxDataSizeCommunication,
                                rnd2,
                                rnd1
                            ).toFixed(1)
                        );

                    const diskDistribution =
                        Math.floor(
                            rnd1 *
                            3
                        );

                    const disk =
                        Number(
                            randAny(
                                maxDiskPerComponent *
                                    minFraction,

                                maxDiskPerComponent *
                                    maxFraction,

                                Math.min(
                                    diskDistribution,
                                    2
                                )
                            ).toFixed(1)
                        );

                    const version = {
                        versionNumber:
                            versionIndex + 1,

                        characteristics: {
                            cpu,
                            memory,
                            dataSize,
                            disk,
                            provider,

                            codecType:
                                codec,

                            reliabilityScore:
                                this.getReliabilityScore(
                                    this.minReliability,
                                    this.maxReliability
                                )
                        }
                    };

                    component
                        .versions
                        .push(
                            version
                        );
                }

                service
                    .components
                    .push(
                        component
                    );
            }

            services.push(
                service
            );
        }

        const feasibility =
            this.ensurePlacementFeasibility(
                services,
                {
                    minCPU:
                        minCPUPerComponent,

                    minMemory:
                        maxMemoryPerComponent *
                        minFraction,

                    minDisk:
                        maxDiskPerComponent *
                        minFraction
                }
            );

        if (
            feasibility.repairedVersions > 0
        ) {
            console.log(
                `ℹ️ Repaired ${feasibility.repairedVersions} generated component version(s) to guarantee one complete resource-feasible placement.`
            );
        }

        return {
            services:
                services,

            feasibilityWitness:
                feasibility.witnessSolution,

            min_max_CPUrequired: [
                minCPUPerComponent,
                maxCPUPerComponent
            ],

            min_max_MAMORYrequired: [
                maxMemoryPerComponent *
                    minFraction,

                maxMemoryPerComponent *
                    maxFraction
            ],

            min_max_DISKrequired: [
                maxDiskPerComponent *
                    minFraction,

                maxDiskPerComponent *
                    maxFraction
            ],

            min_max_DATASIZE: [
                this.minDataSizeCommunication,
                this.maxDataSizeCommunication
            ],

            num_serviceComponentEach:
                this.numServiceComponents,

            num_services:
                this.numUsers
        };
    }

    requiredCapacity(services) {
        if (
            !Array.isArray(
                services
            )
        ) {
            throw new Error(
                'services must be an array.'
            );
        }

        let totalComputationalRequirement = 0;
        let totalMemoryRequirement = 0;
        let totalDiskRequirement = 0;

        for (
            const service
            of services
        ) {
            for (
                const component
                of service.components ?? []
            ) {
                const versions =
                    component.versions ?? [];

                if (
                    versions.length === 0
                ) {
                    throw new Error(
                        `Service ${service.serviceID}, component ${component.componentID} has no versions.`
                    );
                }

                let componentCPU = 0;
                let componentMemory = 0;
                let componentDisk = 0;

                for (
                    const version
                    of versions
                ) {
                    componentCPU +=
                        version
                            .characteristics
                            .cpu;

                    componentMemory +=
                        version
                            .characteristics
                            .memory;

                    componentDisk +=
                        version
                            .characteristics
                            .disk;
                }

                totalComputationalRequirement +=
                    componentCPU /
                    versions.length;

                totalMemoryRequirement +=
                    componentMemory /
                    versions.length;

                totalDiskRequirement +=
                    componentDisk /
                    versions.length;
            }
        }

        return {
            totalComputationalRequirement,
            totalMemoryRequirement,
            totalDiskRequirement
        };
    }

    connections(generatedServices) {
        const services =
            generatedServices
                ?.services;

        if (
            !Array.isArray(services) ||
            services.length === 0
        ) {
            throw new Error(
                'No generated services were provided.'
            );
        }

        const numComponents =
            services[0]
                .components
                .length;

        for (
            const service
            of services
        ) {
            if (
                service.components.length !==
                numComponents
            ) {
                throw new Error(
                    'All services must have the same number of components when using one shared componentConnections matrix.'
                );
            }
        }

        const matrix =
            Array.from(
                {
                    length:
                        numComponents
                },
                () =>
                    Array(
                        numComponents
                    ).fill(0)
            );

        for (
            let i = 0;
            i < numComponents;
            i++
        ) {
            for (
                let j = i + 1;
                j < numComponents;
                j++
            ) {
                if (
                    j ===
                    i + 1
                ) {
                    matrix[i][j] =
                        1;
                }
                else if (
                    Math.random() <
                    this.extraConnectionProbability
                ) {
                    matrix[i][j] =
                        1;
                }
            }
        }

        if (this.scale) {
            fs.mkdirSync(
                `./${this.scale}`,
                {
                    recursive: true
                }
            );

            fs.writeFileSync(
                `./${this.scale}/componentsConnections.json`,
                JSON.stringify(
                    matrix,
                    null,
                    2
                ),
                'utf8'
            );
        }

        return matrix;
    }
}

class commands {
    constructor() {
        this.allowedAlgorithms =
            new Set([
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
    }

    randomInt(
        min,
        max
    ) {
        if (
            !Number.isInteger(min) ||
            !Number.isInteger(max) ||
            max < min
        ) {
            throw new Error(
                `Invalid integer range: [${min}, ${max}]`
            );
        }

        return (
            Math.floor(
                Math.random() *
                (max - min + 1)
            ) +
            min
        );
    }

    randomFloat(
        min,
        max,
        decimals = 4
    ) {
        if (
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            max < min
        ) {
            throw new Error(
                `Invalid floating-point range: [${min}, ${max}]`
            );
        }

        return Number(
            (
                Math.random() *
                (max - min) +
                min
            ).toFixed(decimals)
        );
    }

    randomMinMax(
        minValue,
        maxValue
    ) {
        const first =
            this.randomInt(
                minValue,
                maxValue
            );

        const second =
            this.randomInt(
                minValue,
                maxValue
            );

        return {
            min:
                Math.min(
                    first,
                    second
                ),

            max:
                Math.max(
                    first,
                    second
                )
        };
    }

    randomMinMaxFloat(
        minValue,
        maxValue
    ) {
        const first =
            getRandomValue(
                minValue,
                maxValue
            );

        const second =
            getRandomValue(
                minValue,
                maxValue
            );

        return {
            min:
                Math.min(
                    first,
                    second
                ),

            max:
                Math.max(
                    first,
                    second
                )
        };
    }

    randomIntRange(
        globalMin,
        globalMax
    ) {
        const min =
            this.randomInt(
                globalMin,
                globalMax
            );

        const max =
            this.randomInt(
                min,
                globalMax
            );

        return {
            min,
            max
        };
    }

    randomFloatRange(
        globalMin,
        globalMax,
        decimals = 4
    ) {
        const min =
            this.randomFloat(
                globalMin,
                globalMax,
                decimals
            );

        const max =
            this.randomFloat(
                min,
                globalMax,
                decimals
            );

        return {
            min,
            max
        };
    }

    generateSystem() {
        const useCase =
            configurations
                ?.useCase
                ?.new;

        if (!useCase) {
            throw new Error(
                'Missing configurations.useCase.new section.'
            );
        }

        const readPositiveInteger =
            (
                key,
                fallbackKey = undefined
            ) => {
                const rawValue =
                    useCase[key] ??
                    (
                        fallbackKey
                            ? useCase[fallbackKey]
                            : undefined
                    );

                const value =
                    Number(
                        rawValue
                    );

                if (
                    !Number.isInteger(value) ||
                    value <= 0
                ) {
                    throw new Error(
                        `configurations.useCase.new.${key} must be a positive integer.`
                    );
                }

                return value;
            };

        return {
            users:
                readPositiveInteger(
                    'numberOfUsers'
                ),

            helpers:
                readPositiveInteger(
                    'numberOfHelpers'
                ),

            accessPoints:
                readPositiveInteger(
                    'numberOfAccessPoints'
                ),

            edgeNodes:
                readPositiveInteger(
                    'numberOfEdgeNodes'
                ),

            cloudNodes:
                readPositiveInteger(
                    'numberOfCloudNodes'
                ),

            componentsPerService:
                readPositiveInteger(
                    'numberOfServiceComponentsPerService'
                ),

            versions:
                readPositiveInteger(
                    'numbeOfServiceComponentsVersions',
                    'numberOfServiceComponentsVersions'
                )
        };
    }

    generateRandomNetworkLinkConfig() {
        const config =
            configurations
                ?.useCase
                ?.computingNodesConfig;

        if (!config) {
            throw new Error(
                'Missing configurations.useCase.computingNodesConfig section.'
            );
        }

        const numericKeys = [
            'maxBandwidthInTier1',
            'minBandwidthInTier1',
            'maxRttInTier1',
            'minRttInTier1',

            'maxBandwidthInTier2',
            'minBandwidthInTier2',
            'maxRttInTier2',
            'minRttInTier2',

            'maxBandwidthInTier3',
            'minBandwidthInTier3',
            'maxRttInTier3',
            'minRttInTier3',

            'maxBandwidthFromTier1ToTier2',
            'minBandwidthFromTier1ToTier2',
            'maxRttFromTier1ToTier2',
            'minRttFromTier1ToTier2',

            'maxBandwidthFromTier1ToTier3',
            'minBandwidthFromTier1ToTier3',
            'maxRttFromTier1ToTier3',
            'minRttFromTier1ToTier3',

            'maxBandwidthFromTier2ToTier3',
            'minBandwidthFromTier2ToTier3',
            'maxRttFromTier2ToTier3',
            'minRttFromTier2ToTier3',

            'maxBandwidthFromUserToTier1',
            'minBandwidthFromUserToTier1',
            'maxRttFromUserToTier1',
            'minRttFromUserToTier1',

            'maxBandwidthFromUserToTier2',
            'minBandwidthFromUserToTier2',
            'maxRttFromUserToTier2',
            'minRttFromUserToTier2',

            'maxBandwidthFromUserToTier3',
            'minBandwidthFromUserToTier3',
            'maxRttFromUserToTier3',
            'minRttFromUserToTier3',

            'maxBandwidthFromHelperToInfrastructure',
            'minBandwidthFromHelperToInfrastructure',
            'maxRttFromHelperToInfrastructure',
            'minRttFromHelperToInfrastructure',

            'maxBandwidthFromUsersToHelpers',
            'minBandwidthFromUsersToHelpers',
            'maxRttFromHelperUsersToHelpers',
            'minRttFromHelperUsersToHelpers'
        ];

        const result = {};

        for (
            const key
            of numericKeys
        ) {
            const value =
                Number(
                    config[key]
                );

            if (
                !Number.isFinite(
                    value
                )
            ) {
                throw new Error(
                    `configurations.useCase.computingNodesConfig.${key} must be numeric.`
                );
            }

            result[key] =
                value;
        }

        const rangePairs = [
            [
                'minBandwidthInTier1',
                'maxBandwidthInTier1'
            ],
            [
                'minRttInTier1',
                'maxRttInTier1'
            ],
            [
                'minBandwidthInTier2',
                'maxBandwidthInTier2'
            ],
            [
                'minRttInTier2',
                'maxRttInTier2'
            ],
            [
                'minBandwidthInTier3',
                'maxBandwidthInTier3'
            ],
            [
                'minRttInTier3',
                'maxRttInTier3'
            ],
            [
                'minBandwidthFromTier1ToTier2',
                'maxBandwidthFromTier1ToTier2'
            ],
            [
                'minRttFromTier1ToTier2',
                'maxRttFromTier1ToTier2'
            ],
            [
                'minBandwidthFromTier1ToTier3',
                'maxBandwidthFromTier1ToTier3'
            ],
            [
                'minRttFromTier1ToTier3',
                'maxRttFromTier1ToTier3'
            ],
            [
                'minBandwidthFromTier2ToTier3',
                'maxBandwidthFromTier2ToTier3'
            ],
            [
                'minRttFromTier2ToTier3',
                'maxRttFromTier2ToTier3'
            ],
            [
                'minBandwidthFromUserToTier1',
                'maxBandwidthFromUserToTier1'
            ],
            [
                'minRttFromUserToTier1',
                'maxRttFromUserToTier1'
            ],
            [
                'minBandwidthFromUserToTier2',
                'maxBandwidthFromUserToTier2'
            ],
            [
                'minRttFromUserToTier2',
                'maxRttFromUserToTier2'
            ],
            [
                'minBandwidthFromUserToTier3',
                'maxBandwidthFromUserToTier3'
            ],
            [
                'minRttFromUserToTier3',
                'maxRttFromUserToTier3'
            ],
            [
                'minBandwidthFromHelperToInfrastructure',
                'maxBandwidthFromHelperToInfrastructure'
            ],
            [
                'minRttFromHelperToInfrastructure',
                'maxRttFromHelperToInfrastructure'
            ],
            [
                'minBandwidthFromUsersToHelpers',
                'maxBandwidthFromUsersToHelpers'
            ],
            [
                'minRttFromHelperUsersToHelpers',
                'maxRttFromHelperUsersToHelpers'
            ]
        ];

        for (
            const [minKey, maxKey]
            of rangePairs
        ) {
            if (
                result[maxKey] <
                result[minKey]
            ) {
                throw new Error(
                    `${maxKey} must be greater than or equal to ${minKey}.`
                );
            }
        }

        return result;
    }

    newUseCase() {
        const useCase =
            configurations
                ?.useCase;

        if (!useCase) {
            throw new Error(
                'Missing configurations.useCase section.'
            );
        }

        const newConfig =
            useCase.new;

        const computingSource =
            useCase.computingNodesConfig;

        const helperSource =
            useCase.helpersConfig;

        const userSource =
            useCase.usersConfig;

        const serviceSource =
            useCase.serviceConfig;

        if (
            !newConfig ||
            !computingSource ||
            !helperSource ||
            !userSource ||
            !serviceSource
        ) {
            throw new Error(
                'Incomplete useCase configuration. Required sections: new, computingNodesConfig, helpersConfig, usersConfig, serviceConfig.'
            );
        }

        fs.mkdirSync(
            `./${configurations['scale']}`,
            {
                recursive: true
            }
        );

        const system =
            this.generateSystem();

        const numUsers =
            system.users;

        const numHelpers =
            system.helpers;

        const numAPs =
            system.accessPoints;

        const numEdgeNodes =
            system.edgeNodes;

        const numCloudNodes =
            system.cloudNodes;

        const numVersions =
            system.versions;

        const numServiceComponents =
            system.componentsPerService;

        const totalComputingNodes =
            numAPs +
            numEdgeNodes +
            numCloudNodes;

        const number =
            (
                value,
                path
            ) => {
                const parsed =
                    Number(
                        value
                    );

                if (
                    !Number.isFinite(
                        parsed
                    )
                ) {
                    throw new Error(
                        `${path} must be numeric.`
                    );
                }

                return parsed;
            };

        const nonEmptyArray =
            (
                value,
                path
            ) => {
                if (
                    !Array.isArray(
                        value
                    ) ||
                    value.length === 0
                ) {
                    throw new Error(
                        `${path} must be a non-empty array.`
                    );
                }

                return [
                    ...value
                ];
            };

        const network =
            this.generateRandomNetworkLinkConfig();

        const computingNodesConfig = {
            minAPCPUMIPS:
                number(
                    computingSource.minAPCPUMIPS,
                    'useCase.computingNodesConfig.minAPCPUMIPS'
                ),

            maxAPCPUMIPS:
                number(
                    computingSource.maxAPCPUMIPS,
                    'useCase.computingNodesConfig.maxAPCPUMIPS'
                ),

            minAPMemoryMB:
                number(
                    computingSource.minAPMemoryMB,
                    'useCase.computingNodesConfig.minAPMemoryMB'
                ),

            maxAPMemoryMB:
                number(
                    computingSource.maxAPMemoryMB,
                    'useCase.computingNodesConfig.maxAPMemoryMB'
                ),

            minAPDiskMB:
                number(
                    computingSource.minAPDiskMB,
                    'useCase.computingNodesConfig.minAPDiskMB'
                ),

            maxAPDiskMB:
                number(
                    computingSource.maxAPDiskMB,
                    'useCase.computingNodesConfig.maxAPDiskMB'
                ),

            minAPReliability:
                number(
                    computingSource.minAPReliability,
                    'useCase.computingNodesConfig.minAPReliability'
                ),

            maxAPReliability:
                number(
                    computingSource.maxAPReliability,
                    'useCase.computingNodesConfig.maxAPReliability'
                ),

            APplatform:
                nonEmptyArray(
                    computingSource.APplatform,
                    'useCase.computingNodesConfig.APplatform'
                ),

            APNumNode:
                numAPs,

            minENCPUMIPS:
                number(
                    computingSource.minENCPUMIPS,
                    'useCase.computingNodesConfig.minENCPUMIPS'
                ),

            maxENCPUMIPS:
                number(
                    computingSource.maxENCPUMIPS,
                    'useCase.computingNodesConfig.maxENCPUMIPS'
                ),

            minENMemoryMB:
                number(
                    computingSource.minENMemoryMB,
                    'useCase.computingNodesConfig.minENMemoryMB'
                ),

            maxENMemoryMB:
                number(
                    computingSource.maxENMemoryMB,
                    'useCase.computingNodesConfig.maxENMemoryMB'
                ),

            minENDiskMB:
                number(
                    computingSource.minENDiskMB,
                    'useCase.computingNodesConfig.minENDiskMB'
                ),

            maxENDiskMB:
                number(
                    computingSource.maxENDiskMB,
                    'useCase.computingNodesConfig.maxENDiskMB'
                ),

            minENReliability:
                number(
                    computingSource.minENReliability,
                    'useCase.computingNodesConfig.minENReliability'
                ),

            maxENReliability:
                number(
                    computingSource.maxENReliability,
                    'useCase.computingNodesConfig.maxENReliability'
                ),

            ENplatform:
                nonEmptyArray(
                    computingSource.ENplatform,
                    'useCase.computingNodesConfig.ENplatform'
                ),

            ENNumNode:
                numEdgeNodes,

            minCNCPUMIPS:
                number(
                    computingSource.minCNCPUMIPS,
                    'useCase.computingNodesConfig.minCNCPUMIPS'
                ),

            maxCNCPUMIPS:
                number(
                    computingSource.maxCNCPUMIPS,
                    'useCase.computingNodesConfig.maxCNCPUMIPS'
                ),

            minCNMemoryMB:
                number(
                    computingSource.minCNMemoryMB,
                    'useCase.computingNodesConfig.minCNMemoryMB'
                ),

            maxCNMemoryMB:
                number(
                    computingSource.maxCNMemoryMB,
                    'useCase.computingNodesConfig.maxCNMemoryMB'
                ),

            minCNDiskMB:
                number(
                    computingSource.minCNDiskMB,
                    'useCase.computingNodesConfig.minCNDiskMB'
                ),

            maxCNDiskMB:
                number(
                    computingSource.maxCNDiskMB,
                    'useCase.computingNodesConfig.maxCNDiskMB'
                ),

            minCNReliability:
                number(
                    computingSource.minCNReliability,
                    'useCase.computingNodesConfig.minCNReliability'
                ),

            maxCNReliability:
                number(
                    computingSource.maxCNReliability,
                    'useCase.computingNodesConfig.maxCNReliability'
                ),

            CNplatform:
                nonEmptyArray(
                    computingSource.CNplatform,
                    'useCase.computingNodesConfig.CNplatform'
                ),

            CNNumNode:
                numCloudNodes,

            numUsers:
                numUsers,

            numHelpers:
                numHelpers,

            scale:
                configurations[
                    'scale'
                ],

            ...network,

            numTier:
                3
        };

        const helpersConfig = {
            minCPUMIPS:
                number(
                    helperSource.minCPUMIPS,
                    'useCase.helpersConfig.minCPUMIPS'
                ),

            maxCPUMIPS:
                number(
                    helperSource.maxCPUMIPS,
                    'useCase.helpersConfig.maxCPUMIPS'
                ),

            minMemoryMB:
                number(
                    helperSource.minMemoryMB,
                    'useCase.helpersConfig.minMemoryMB'
                ),

            maxMemoryMB:
                number(
                    helperSource.maxMemoryMB,
                    'useCase.helpersConfig.maxMemoryMB'
                ),

            minDiskMB:
                number(
                    helperSource.minDiskMB,
                    'useCase.helpersConfig.minDiskMB'
                ),

            maxDiskMB:
                number(
                    helperSource.maxDiskMB,
                    'useCase.helpersConfig.maxDiskMB'
                ),

            minReliability:
                number(
                    helperSource.minReliability,
                    'useCase.helpersConfig.minReliability'
                ),

            maxReliability:
                number(
                    helperSource.maxReliability,
                    'useCase.helpersConfig.maxReliability'
                ),

            os:
                nonEmptyArray(
                    helperSource.os,
                    'useCase.helpersConfig.os'
                ),

            numComputingNodes:
                totalComputingNodes,

            numHelpers:
                numHelpers
        };

        const usersConfig = {
            minCPUMIPS:
                number(
                    userSource.minCPUMIPS,
                    'useCase.usersConfig.minCPUMIPS'
                ),

            maxCPUMIPS:
                number(
                    userSource.maxCPUMIPS,
                    'useCase.usersConfig.maxCPUMIPS'
                ),

            minMemoryMB:
                number(
                    userSource.minMemoryMB,
                    'useCase.usersConfig.minMemoryMB'
                ),

            maxMemoryMB:
                number(
                    userSource.maxMemoryMB,
                    'useCase.usersConfig.maxMemoryMB'
                ),

            minDiskMB:
                number(
                    userSource.minDiskMB,
                    'useCase.usersConfig.minDiskMB'
                ),

            maxDiskMB:
                number(
                    userSource.maxDiskMB,
                    'useCase.usersConfig.maxDiskMB'
                ),

            minReliability:
                number(
                    userSource.minReliability,
                    'useCase.usersConfig.minReliability'
                ),

            maxReliability:
                number(
                    userSource.maxReliability,
                    'useCase.usersConfig.maxReliability'
                ),

            os:
                nonEmptyArray(
                    userSource.os,
                    'useCase.usersConfig.os'
                ),

            numUsers:
                numUsers,

            numComputingNodes:
                totalComputingNodes,

            numHelpers:
                numHelpers
        };

        const nodeGenerator =
            new computingNodesGenerator(
                computingNodesConfig
            );

        const computingNodes =
            nodeGenerator.generate();

        const infraConnections =
            nodeGenerator.connections();

        const computingCapacity =
            nodeGenerator.capacity(
                computingNodes,
                infraConnections
            );

        const helperGenerator =
            new helpersGenerator(
                helpersConfig
            );

        const helperNodes =
            helperGenerator.generate();

        const userGenerator =
            new usersGenerator(
                usersConfig
            );

        const usersNodes =
            userGenerator.generate();

        const platformComputingCapacity =
            computingCapacity
                .totalComputationalCapacity;

        const platformMemoryCapacity =
            computingCapacity
                .totalMemoryCapacity;

        const platformDiskCapacity =
            computingCapacity
                .totalDiskCapacity;

        const platformNetworkCapacity =
            computingCapacity
                .totalBandwidthCapacitiy;

        const serviceConfig = {
            platformComputationalCapacity:
                platformComputingCapacity,

            platformDiskCapacity:
                platformDiskCapacity,

            platformMemoryCapacity:
                platformMemoryCapacity,

            platformNetworkCapacity:
                platformNetworkCapacity,

            minCPUMIPS:
                number(
                    serviceSource.minCPUMIPS,
                    'useCase.serviceConfig.minCPUMIPS'
                ),

            maxCPUMIPS:
                number(
                    serviceSource.maxCPUMIPS,
                    'useCase.serviceConfig.maxCPUMIPS'
                ),

            internalProvider:
                nonEmptyArray(
                    serviceSource.internalProvider,
                    'useCase.serviceConfig.internalProvider'
                ),

            externalProvider:
                nonEmptyArray(
                    serviceSource.externalProvider,
                    'useCase.serviceConfig.externalProvider'
                ),

            codecType:
                nonEmptyArray(
                    serviceSource.codecType,
                    'useCase.serviceConfig.codecType'
                ),

            minReliability:
                number(
                    serviceSource.minReliability,
                    'useCase.serviceConfig.minReliability'
                ),

            maxReliability:
                number(
                    serviceSource.maxReliability,
                    'useCase.serviceConfig.maxReliability'
                ),

            numVersions:
                numVersions,

            numComputingNodes:
                totalComputingNodes,

            numHelpers:
                numHelpers,

            numUsers:
                numUsers,

            computingNodes:
                computingNodes,

            helperNodes:
                helperNodes,

            usersNodes:
                usersNodes,

            minDataSizeCommunication:
                number(
                    serviceSource.minDataSize,
                    'useCase.serviceConfig.minDataSize'
                ),

            maxDataSizeCommunication:
                number(
                    serviceSource.maxDataSize,
                    'useCase.serviceConfig.maxDataSize'
                ),

            capacityPercentage:
                number(
                    serviceSource.capacityPercentage,
                    'useCase.serviceConfig.capacityPercentage'
                ),

            numServiceComponents:
                numServiceComponents,

            scale:
                configurations[
                    'scale'
                ]
        };

        const serviceGeneratorInstance =
            new serviceGenerator(
                serviceConfig
            );

        const generatedServices =
            serviceGeneratorInstance.generate();

        const componentConnections =
            serviceGeneratorInstance.connections(
                generatedServices
            );

        saveJSON(
            generatedServices.services,
            `./${configurations['scale']}/services.json`
        );

        saveJSON(
            computingNodes,
            `./${configurations['scale']}/nodes.json`
        );

        saveJSON(
            helperNodes,
            `./${configurations['scale']}/helpers.json`
        );

        saveJSON(
            usersNodes,
            `./${configurations['scale']}/users.json`
        );

        console.log(
            '✅ New instance was created from configurations.json.'
        );

        return {
            services:
                generatedServices.services,

            computingNodes:
                computingNodes,

            helperNodes:
                helperNodes,

            usersNodes:
                usersNodes,

            componentConnections:
                componentConnections,

            infraConnections:
                infraConnections
        };
    }

    getSelectedAlgorithms() {
        const algorithms =
            String(
                configurations[
                    'algo'
                ] ?? ''
            )
            .split(',')
            .map(
                algorithm =>
                    algorithm.trim()
            )
            .filter(Boolean);

        if (
            algorithms.length === 0
        ) {
            throw new Error(
                'No algorithm was selected.'
            );
        }

        const invalid =
            algorithms.filter(
                algorithm =>
                    !this
                        .allowedAlgorithms
                        .has(
                            algorithm
                        )
            );

        if (
            invalid.length > 0
        ) {
            throw new Error(
                `Unsupported algorithm(s): ${invalid.join(', ')}. ` +
                `Allowed algorithms: ${[
                    ...this.allowedAlgorithms
                ].join(', ')}`
            );
        }

        return algorithms;
    }

    _currentFeasibilityBounds(system) {
        const services =
            system.services ?? [];

        const computingNodes =
            system.computingNodes ?? [];

        const totalComponents =
            services.reduce(
                (sum, service) =>
                    sum +
                    (service.components ?? []).length,
                0
            );

        if (totalComponents <= 0) {
            return {
                minCPU: 0,
                minMemory: 0,
                minDisk: 0
            };
        }

        const existingVersions =
            services.flatMap(
                service =>
                    (service.components ?? []).flatMap(
                        component =>
                            component.versions ?? []
                    )
            );

        const finiteMinimum =
            (key, fallback = 0) => {
                const values =
                    existingVersions
                        .map(
                            version =>
                                version?.characteristics?.[key]
                        )
                        .filter(
                            value =>
                                typeof value === 'number' &&
                                Number.isFinite(value) &&
                                value >= 0
                        );

                return values.length > 0
                    ? Math.min(...values)
                    : fallback;
            };

        const serviceSource =
            configurations
                ?.useCase
                ?.serviceConfig ?? {};

        const configuredMinCPU =
            Number(
                serviceSource.minCPUMIPS
            );

        const minCPU =
            Number.isFinite(configuredMinCPU) &&
            configuredMinCPU >= 0
                ? configuredMinCPU
                : finiteMinimum('cpu', 0);

        const totalComputingMemory =
            computingNodes.reduce(
                (sum, node) =>
                    sum +
                    Number(
                        node?.characteristics?.memory ??
                        0
                    ),
                0
            );

        const totalComputingDisk =
            computingNodes.reduce(
                (sum, node) =>
                    sum +
                    Number(
                        node?.characteristics?.disk ??
                        0
                    ),
                0
            );

        const configuredCapacityPercentage =
            Number(
                serviceSource.capacityPercentage
            );

        const minMemory =
            Number.isFinite(
                configuredCapacityPercentage
            ) &&
            configuredCapacityPercentage >= 0
                ? (
                    totalComputingMemory *
                    configuredCapacityPercentage /
                    totalComponents *
                    0.5
                )
                : finiteMinimum('memory', 0);

        const minDisk =
            totalComputingDisk > 0
                ? (
                    totalComputingDisk *
                    0.2 /
                    totalComponents *
                    0.5
                )
                : finiteMinimum('disk', 0);

        return {
            minCPU,
            minMemory,
            minDisk
        };
    }

    repairCurrentSystemFeasibility(
        system,
        scale
    ) {
        const repairer =
            Object.create(
                serviceGenerator.prototype
            );

        repairer.computingNodes =
            system.computingNodes ?? [];

        repairer.helperNodes =
            system.helperNodes ?? [];

        repairer.usersNodes =
            system.usersNodes ?? [];

        const bounds =
            this._currentFeasibilityBounds(
                system
            );

        const feasibility =
            repairer.ensurePlacementFeasibility(
                system.services,
                bounds
            );

        if (
            feasibility.repairedVersions > 0
        ) {
            saveJSON(
                system.services,
                `./${scale}/services.json`
            );

            console.log(
                `ℹ️ Repaired ${feasibility.repairedVersions} version(s) in the current services.json so the loaded instance has one complete resource-feasible placement.`
            );
        }

        return system;
    }

    loadCurrentSystem() {
        const scale =
            configurations[
                'scale'
            ];

        const system = {
            usersNodes:
                readJSON(
                    `./${scale}/users.json`
                ),

            helperNodes:
                readJSON(
                    `./${scale}/helpers.json`
                ),

            computingNodes:
                readJSON(
                    `./${scale}/nodes.json`
                ),

            services:
                readJSON(
                    `./${scale}/services.json`
                ),

            componentConnections:
                readJSON(
                    `./${scale}/componentsConnections.json`
                ),

            infraConnections:
                readJSON(
                    `./${scale}/infraConnections.json`
                )
        };

        return this.repairCurrentSystemFeasibility(
            system,
            scale
        );
    }

    runAlgorithms() {
        const algorithms =
            this.getSelectedAlgorithms();

        const system =
            this.loadCurrentSystem();

        const payload = {
            ...system,

            type:
                configurations[
                    'type'
                ],

            scale:
                configurations[
                    'scale'
                ],

            algo:
                algorithms.join(','),

            requestTimeoutMs:
                requestTimeoutMs
        };

        if (
            algorithms.includes(
                'GA'
            )
        ) {
            payload.configsGA = {
                iteration:
                    configurations
                        .geneticAlgorithm
                        .iterations,

                crossoverRate:
                    configurations
                        .geneticAlgorithm
                        .crossoverRate,

                mutationRate:
                    configurations
                        .geneticAlgorithm
                        .mutationRate,

                selectionSize:
                    configurations
                        .geneticAlgorithm
                        .selectionPressure,

                populationSize:
                    configurations
                        .geneticAlgorithm
                        .populationSize
            };

        }

        if (
            algorithms.includes(
                'PSO'
            )
        ) {
            payload.configsPSO = {
                populationSize:
                    configurations
                        .particleSwarmOptimization
                        .populationSize,

                w:
                    configurations
                        .particleSwarmOptimization
                        .w,

                c1:
                    configurations
                        .particleSwarmOptimization
                        .c1,

                c2:
                    configurations
                        .particleSwarmOptimization
                        .c2,

                iteration:
                    configurations
                        .particleSwarmOptimization
                        .iteration
            };
        }

        if (
            algorithms.includes(
                'DE'
            )
        ) {
            payload.configsDE = {
                populationSize:
                    configurations
                        .differentialEvolution
                        .populationSize,

                crossoverRate:
                    configurations
                        .differentialEvolution
                        .crossoverRate,

                F:
                    configurations
                        .differentialEvolution
                        .F,

                iteration:
                    configurations
                        .differentialEvolution
                        .iteration
            };
        }

        if (
            algorithms.includes(
                'SA'
            )
        ) {
            payload.configsSA = {
                termination:
                    configurations
                        .simulatedAnnealing
                        .terminationValue,

                temperature:
                    configurations
                        .simulatedAnnealing
                        .temperature,

                alpha:
                    configurations
                        .simulatedAnnealing
                        .alpha,

                rate:
                    configurations
                        .simulatedAnnealing
                        .updatingRate
            };
        }

        return sendAxiosPost(
            url,
            payload
        );
    }


}

(async () => {
    const cmd =
        new commands();

    if (
        configurations[
            'type'
        ] === 'new'
    ) {
        cmd.newUseCase();
    }
    else if (
        configurations[
            'type'
        ] === 'current'
    ) {
        if (dataGeneration) {
            cmd.newUseCase();
        }

        await cmd.runAlgorithms();
    }
    else {
        throw new Error(
            `Unknown configuration type: ${configurations['type']}. Allowed types are: new, current.`
        );
    }
})()
.catch(
    error => {
        console.error(
            'Application failed:'
        );

        console.error(
            error
        );

        process.exitCode =
            1;
    }
);