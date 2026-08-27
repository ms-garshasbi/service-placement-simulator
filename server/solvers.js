const fs = require('fs');
const { performance } = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
let path = require('path');


function getRandomValue(min, max) 
{
    return Math.random() * (max - min) + min;
}

function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  
  return JSON.parse(result);
}
class solutionOperation {

    constructor(sysConfig) {

        this.services =
            sysConfig['services'] ?? [];

        this.computingNodes =
            sysConfig['computingNodes'] ?? [];

        this.componentConnections =
            sysConfig['componentConnections'] ?? [];

        this.helpers =
            sysConfig['helperNodes'] ?? [];

        this.users =
            sysConfig['usersNodes'] ?? [];

        this.infraConnections =
            sysConfig['infraConnections'] ?? [];

        this.ans =
            sysConfig;

        this._cachedInitialMaxRT =
            undefined;
    }

    deepClone(value) {

        return JSON.parse(
            JSON.stringify(value)
        );
    }


    _allNodes() {

        return [

            ...this.computingNodes,

            ...this.helpers,

            ...this.users
        ];
    }


    _service(serviceID) {

        const service =
            this.services.find(
                s =>
                    s.serviceID ===
                    serviceID
            );


        if (!service) {

            throw new Error(
                `Unknown serviceID: ${serviceID}`
            );
        }


        return service;
    }


    _component(
        service,
        componentID
    ) {

        const component =
            (
                service.components ??
                []
            ).find(
                c =>
                    c.componentID ===
                    componentID
            );


        if (!component) {

            throw new Error(

                `Unknown componentID ` +
                `${componentID} ` +
                `in service ` +
                `${service.serviceID}`
            );
        }


        return component;
    }


    _version(
        component,
        versionNumber
    ) {

        const version =
            (
                component.versions ??
                []
            ).find(
                v =>
                    v.versionNumber ===
                    versionNumber
            );


        if (!version) {

            throw new Error(

                `Unknown versionNumber ` +
                `${versionNumber} ` +
                `in component ` +
                `${component.componentID}`
            );
        }


        return version;
    }


    _node(nodeID) {

        return this
            ._allNodes()
            .find(
                n =>
                    n.nodeID ===
                    nodeID
            );
    }


    _nodeType(nodeID) {

        if (
            this.computingNodes.some(
                n =>
                    n.nodeID ===
                    nodeID
            )
        ) {

            return 'computing';
        }


        if (
            this.helpers.some(
                n =>
                    n.nodeID ===
                    nodeID
            )
        ) {

            return 'helper';
        }


        if (
            this.users.some(
                n =>
                    n.nodeID ===
                    nodeID
            )
        ) {

            return 'user';
        }


        return undefined;
    }


    _nodeReliability(node) {

        const characteristics =
            node?.characteristics ?? {};


        if (
            typeof characteristics
                .reliabilityScore ===
            'number'
        ) {

            return characteristics
                .reliabilityScore;
        }


        if (
            typeof characteristics
                .reliability ===
            'number'
        ) {

            return characteristics
                .reliability;
        }


        throw new Error(

            `Node ${node?.nodeID} ` +
            `has no reliability value`
        );
    }


    _versionReliability(version) {

        const reliability =
            version
                ?.characteristics
                ?.reliabilityScore;


        if (
            typeof reliability !==
            'number'
        ) {

            throw new Error(

                `Version ` +
                `${version?.versionNumber} ` +
                `has no reliabilityScore`
            );
        }


        return reliability;
    }

    _endpoint(
        service,
        component
    ) {

        const components =
            service.components ??
            [];


        const index =
            components.findIndex(
                c =>
                    c.componentID ===
                    component.componentID
            );


        if (index < 0) {

            return undefined;
        }


        if (
            index ===
            components.length - 1
        ) {

            return service.helperID;
        }


        if (index === 0) {

            return service.userID;
        }


        return undefined;
    }

    _compatible(
        service,
        nodeID
    ) {

        const type =
            this._nodeType(
                nodeID
            );


        if (
            type ===
            'computing'
        ) {

            return true;
        }


        if (
            type ===
            'user'
        ) {

            return (
                nodeID ===
                service.userID
            );
        }


        if (
            type ===
            'helper'
        ) {

            return (
                nodeID ===
                service.helperID
            );
        }


        return false;
    }


    _randomChoice(values) {

        if (
            !Array.isArray(values) ||
            values.length === 0
        ) {

            throw new Error(
                'Cannot choose from an empty array'
            );
        }


        return values[
            Math.floor(
                Math.random() *
                values.length
            )
        ];
    }

    _nearestAllowed(
        value,
        allowed
    ) {

        if (
            !Array.isArray(allowed) ||
            allowed.length === 0
        ) {

            throw new Error(
                'No allowed values'
            );
        }


        const numericAllowed =
            allowed.map(Number);


        if (
            numericAllowed.some(
                value =>
                    !Number.isFinite(
                        value
                    )
            )
        ) {

            throw new Error(

                'PSO/DE mapping requires ' +
                'numeric version/node IDs'
            );
        }


        let numericValue =
            Number(value);


        if (
            !Number.isFinite(
                numericValue
            )
        ) {

            numericValue =
                numericAllowed[0];
        }


        numericValue =
            Math.floor(
                numericValue
            );


        let bestIndex = 0;

        let bestDistance =
            Math.abs(

                numericAllowed[0] -
                numericValue
            );


        for (
            let i = 1;
            i < numericAllowed.length;
            i++
        ) {

            const distance =
                Math.abs(

                    numericAllowed[i] -
                    numericValue
                );


            if (
                distance <
                bestDistance
            ) {

                bestIndex =
                    i;

                bestDistance =
                    distance;
            }
        }


        return allowed[
            bestIndex
        ];
    }

    _resource(
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
            typeof value !==
                'number' ||

            !Number.isFinite(
                value
            )
        ) {

            throw new Error(

                `Invalid ${key} ` +
                `value: ${value}`
            );
        }


        return value;
    }


    _fits(
        node,
        version
    ) {

        const nodeCharacteristics =
            node.characteristics;


        const versionCharacteristics =
            version.characteristics;


        return (

            this._resource(
                nodeCharacteristics,
                'memory'
            )

            >=

            this._resource(
                versionCharacteristics,
                'memory'
            )

            &&

            this._resource(
                nodeCharacteristics,
                'cpu'
            )

            >=

            this._resource(
                versionCharacteristics,
                'cpu'
            )

            &&

            this._resource(
                nodeCharacteristics,
                'disk'
            )

            >=

            this._resource(
                versionCharacteristics,
                'disk'
            )
        );
    }


    _consume(
        node,
        version
    ) {

        const nodeCharacteristics =
            node.characteristics;


        const versionCharacteristics =
            version.characteristics;


        nodeCharacteristics.memory -=
            this._resource(
                versionCharacteristics,
                'memory'
            );


        nodeCharacteristics.cpu -=
            this._resource(
                versionCharacteristics,
                'cpu'
            );


        if (
            nodeCharacteristics.disk !==
                undefined ||

            versionCharacteristics.disk !==
                undefined
        ) {

            nodeCharacteristics.disk =

                this._resource(
                    nodeCharacteristics,
                    'disk'
                )

                -

                this._resource(
                    versionCharacteristics,
                    'disk'
                );
        }
    }


    _capacityState() {

        const capacity =
            new Map();


        for (
            const node
            of this._allNodes()
        ) {

            capacity.set(

                node.nodeID,

                this.deepClone(
                    node
                )
            );
        }


        return capacity;
    }

    _groups(solution) {

        const groups =
            new Map(
                this.services.map(
                    service => [
                        service.serviceID,
                        []
                    ]
                )
            );


        for (
            const gene
            of solution ?? []
        ) {

            if (
                !groups.has(
                    gene[0]
                )
            ) {

                groups.set(
                    gene[0],
                    []
                );
            }


            groups
                .get(gene[0])
                .push(gene);
        }


        return groups;
    }


    _componentIndex(
        service,
        componentID
    ) {

        const index =
            (
                service.components ??
                []
            ).findIndex(
                component =>
                    component.componentID ===
                    componentID
            );


        if (index < 0) {

            throw new Error(

                `Unknown component ` +
                `${componentID} ` +
                `in service ` +
                `${service.serviceID}`
            );
        }


        return index;
    }

    _infraIndex(nodeID) {

        const matrixSize =
            this.infraConnections.length;


        if (
            matrixSize === 0
        ) {

            throw new Error(
                'infraConnections is empty'
            );
        }

        const directIndex =
            Number(nodeID) - 1;


        if (
            Number.isInteger(
                directIndex
            ) &&

            directIndex >= 0 &&

            directIndex <
                matrixSize
        ) {

            return directIndex;
        }

        const allNodes =
            this._allNodes();


        if (
            allNodes.length ===
            matrixSize
        ) {

            const index =
                allNodes.findIndex(
                    node =>
                        node.nodeID ===
                        nodeID
                );


            if (
                index >= 0
            ) {

                return index;
            }
        }


        throw new Error(

            `Cannot map nodeID ` +
            `${nodeID} ` +
            `to infraConnections`
        );
    }

    _isComplete(solution) {

        const seen =
            new Set();


        try {

            for (
                const gene
                of solution ?? []
            ) {

                if (
                    !Array.isArray(gene) ||
                    gene.length < 4
                ) {

                    return false;
                }


                const service =
                    this._service(
                        gene[0]
                    );


                const component =
                    this._component(
                        service,
                        gene[1]
                    );


                this._version(
                    component,
                    gene[2]
                );


                const key =

                    `${service.serviceID}` +
                    `::` +
                    `${component.componentID}`;


                if (
                    seen.has(key)
                ) {

                    return false;
                }


                seen.add(key);
            }
        }

        catch {

            return false;
        }


        for (
            const service
            of this.services
        ) {

            for (
                const component
                of service.components ??
                []
            ) {

                const key =

                    `${service.serviceID}` +
                    `::` +
                    `${component.componentID}`;


                if (
                    !seen.has(key)
                ) {

                    return false;
                }
            }
        }


        return true;
    }

    _isResourceFeasible(solution) {

        if (
            !this._isComplete(
                solution
            )
        ) {

            return false;
        }


        const capacity =
            this._capacityState();


        try {

            for (
                const gene
                of solution
            ) {

                const service =
                    this._service(
                        gene[0]
                    );


                const component =
                    this._component(
                        service,
                        gene[1]
                    );


                const version =
                    this._version(
                        component,
                        gene[2]
                    );


                const node =
                    capacity.get(
                        gene[3]
                    );


                if (!node) {

                    return false;
                }


                const endpoint =
                    this._endpoint(
                        service,
                        component
                    );


                if (
                    endpoint !==
                        undefined &&

                    gene[3] !==
                        endpoint
                ) {

                    return false;
                }


                if (
                    !this._compatible(
                        service,
                        gene[3]
                    )
                ) {

                    return false;
                }


                if (
                    !this._fits(
                        node,
                        version
                    )
                ) {

                    return false;
                }


                this._consume(
                    node,
                    version
                );
            }
        }

        catch {

            return false;
        }


        return true;
    }

    randomSolution() {

        const nodeIDs =
            this._allNodes()
                .map(
                    node =>
                        node.nodeID
                );


        if (
            nodeIDs.length === 0
        ) {

            throw new Error(
                'No nodes are available'
            );
        }


        const solution = [];

        for (
            const service
            of this.services
        ) {

            for (
                const component
                of service.components ??
                []
            ) {

                const versions =
                    component.versions ??
                    [];


                if (
                    versions.length === 0
                ) {

                    throw new Error(

                        `Component ` +
                        `${component.componentID} ` +
                        `has no versions`
                    );
                }


                solution.push([

                    service.serviceID,

                    component.componentID,

                    this._randomChoice(
                        versions
                    ).versionNumber,

                    this._randomChoice(
                        nodeIDs
                    )
                ]);
            }
        }


        return solution;
    }

    validation(solution) {

        const validated =
            this.deepClone(
                solution ?? []
            );


        const computingNodeIDs =
            this.computingNodes.map(
                node =>
                    node.nodeID
            );


        if (
            validated.length > 0 &&

            computingNodeIDs.length ===
                0
        ) {

            throw new Error(
                'At least one computing node is required'
            );
        }


        for (
            let i = 0;
            i < validated.length;
            i++
        ) {

            const gene =
                validated[i];


            if (
                !Array.isArray(gene) ||
                gene.length < 4
            ) {

                throw new Error(

                    `Invalid gene ` +
                    `at index ${i}`
                );
            }


            const service =
                this._service(
                    gene[0]
                );


            const component =
                this._component(
                    service,
                    gene[1]
                );

            const versionNumbers =
                (
                    component.versions ??
                    []
                ).map(
                    version =>
                        version.versionNumber
                );


            if (
                !versionNumbers.includes(
                    gene[2]
                )
            ) {

                gene[2] =
                    this._nearestAllowed(

                        gene[2],

                        versionNumbers
                    );
            }

            const endpoint =
                this._endpoint(
                    service,
                    component
                );


            if (
                endpoint !==
                undefined
            ) {

                gene[3] =
                    endpoint;
            }

            else if (
                !this._compatible(
                    service,
                    gene[3]
                )
            ) {

                gene[3] =
                    this._randomChoice(
                        computingNodeIDs
                    );
            }
        }


        return validated;
    }

    _feasibleVersionOnNode(
        component,
        node,
        preferredVersionNumber
    ) {

        const versions =
            component.versions ??
            [];


        const preferred =
            versions.find(
                version =>
                    version.versionNumber ===
                    preferredVersionNumber
            );


        if (
            preferred &&

            this._fits(
                node,
                preferred
            )
        ) {

            return preferred;
        }


        const feasible =
            versions.filter(
                version =>
                    this._fits(
                        node,
                        version
                    )
            );


        if (
            feasible.length === 0
        ) {

            return undefined;
        }

        feasible.sort(

            (a, b) =>

                Math.abs(

                    Number(
                        a.versionNumber
                    )

                    -

                    Number(
                        preferredVersionNumber
                    )
                )

                -

                Math.abs(

                    Number(
                        b.versionNumber
                    )

                    -

                    Number(
                        preferredVersionNumber
                    )
                )
        );


        return feasible[0];
    }

    healing(solution) {

        const healed =
            this.validation(
                solution
            );


        const capacity =
            this._capacityState();


        for (
            const gene
            of healed
        ) {

            const service =
                this._service(
                    gene[0]
                );


            const component =
                this._component(
                    service,
                    gene[1]
                );


            let version =
                this._version(
                    component,
                    gene[2]
                );


            const endpoint =
                this._endpoint(
                    service,
                    component
                );

            if (
                endpoint !==
                undefined
            ) {

                const node =
                    capacity.get(
                        endpoint
                    );


                if (!node) {

                    throw new Error(

                        `Required endpoint ` +
                        `node ${endpoint} ` +
                        `does not exist`
                    );
                }


                const repairedVersion =
                    this._feasibleVersionOnNode(

                        component,

                        node,

                        gene[2]
                    );


                if (
                    !repairedVersion
                ) {

                    throw new Error(

                        `No version of service ` +
                        `${service.serviceID}, ` +
                        `component ` +
                        `${component.componentID} ` +
                        `fits required endpoint ` +
                        `${endpoint}`
                    );
                }


                gene[2] =
                    repairedVersion
                        .versionNumber;


                gene[3] =
                    endpoint;


                this._consume(
                    node,
                    repairedVersion
                );


                continue;
            }

            let node =
                capacity.get(
                    gene[3]
                );

            if (
                node &&

                this._compatible(
                    service,
                    gene[3]
                ) &&

                this._fits(
                    node,
                    version
                )
            ) {

                this._consume(
                    node,
                    version
                );


                continue;
            }


            const fallbackNodes =
                [
                    ...this.computingNodes
                ];


            if (
                this._nodeType(
                    gene[3]
                ) ===
                'helper'
            ) {

                fallbackNodes.reverse();
            }


            let placed =
                false;


            for (
                const candidate
                of fallbackNodes
            ) {

                const freeNode =
                    capacity.get(
                        candidate.nodeID
                    );


                if (
                    freeNode &&

                    this._fits(
                        freeNode,
                        version
                    )
                ) {

                    gene[3] =
                        candidate.nodeID;


                    this._consume(
                        freeNode,
                        version
                    );


                    placed =
                        true;


                    break;
                }
            }


            if (placed) {

                continue;
            }

            outer:

            for (
                const candidateVersion
                of component.versions ??
                []
            ) {

                for (
                    const candidate
                    of fallbackNodes
                ) {

                    const freeNode =
                        capacity.get(
                            candidate.nodeID
                        );


                    if (
                        freeNode &&

                        this._fits(
                            freeNode,
                            candidateVersion
                        )
                    ) {

                        gene[2] =
                            candidateVersion
                                .versionNumber;


                        gene[3] =
                            candidate.nodeID;


                        this._consume(
                            freeNode,
                            candidateVersion
                        );


                        placed =
                            true;


                        break outer;
                    }
                }
            }


            if (!placed) {

                throw new Error(

                    `Unable to heal ` +
                    `service ` +
                    `${service.serviceID}, ` +
                    `component ` +
                    `${component.componentID}: ` +
                    `insufficient resources`
                );
            }
        }


        return healed;
    }

    initialSolutions(
        solutionSize
    ) {

        if (
            !Number.isInteger(
                solutionSize
            ) ||

            solutionSize < 0
        ) {

            throw new Error(

                'solutionSize must be ' +
                'a non-negative integer'
            );
        }


        const solutions = [];


        let attempts = 0;


        const maxAttempts =
            Math.max(

                100,

                solutionSize *
                100
            );


        while (
            solutions.length <
                solutionSize &&

            attempts <
                maxAttempts
        ) {

            attempts++;


            try {

                solutions.push(

                    this.healing(
                        this.randomSolution()
                    )
                );
            }

            catch {

            }
        }


        if (
            solutions.length !==
            solutionSize
        ) {

            throw new Error(

                `Could not generate ` +
                `${solutionSize} ` +
                `feasible initial solutions ` +
                `after ${attempts} attempts`
            );
        }


        return solutions;
    }

    solutionsQualitySort(
        solutions,
        quality
    ) {

        if (
            !Array.isArray(
                solutions
            ) ||

            !Array.isArray(
                quality
            ) ||

            solutions.length === 0 ||

            solutions.length !==
                quality.length
        ) {

            throw new Error(

                'solutionsQualitySort requires ' +
                'equal-sized non-empty arrays'
            );
        }


        const indices =
            solutions.map(
                (_, i) => i
            );


        indices.sort(

            (a, b) =>

                quality[a] -
                quality[b]
        );


        const sortedSolutions =
            indices.map(
                index =>
                    solutions[index]
            );


        const sortedQuality =
            indices.map(
                index =>
                    quality[index]
            );

        const medianIndex =
            Math.floor(

                sortedSolutions.length /
                2
            );


        return {

            bestSolution:
                sortedSolutions[0],

            worstSolution:
                sortedSolutions[
                    sortedSolutions.length -
                    1
                ],

            medianSolution:
                sortedSolutions[
                    medianIndex
                ],

            bestQuality:
                sortedQuality[0],

            medianQuality:
                sortedQuality[
                    medianIndex
                ],

            worstQuality:
                sortedQuality[
                    sortedQuality.length -
                    1
                ]
        };
    }

    infraReliability(solution) {

        if (
            this.services.length ===
            0
        ) {

            return 0;
        }


        const groups =
            this._groups(
                solution
            );


        let total =
            0;


        for (
            const service
            of this.services
        ) {

            const placements =
                groups.get(
                    service.serviceID
                ) ?? [];


            const expected =
                service.components ??
                [];


            const placedComponentIDs =
                new Set(

                    placements.map(
                        gene =>
                            gene[1]
                    )
                );

            if (
                placements.length !==
                    expected.length ||

                placedComponentIDs.size !==
                    expected.length
            ) {

                continue;
            }
            const nodeIDs =
                [
                    ...new Set(

                        placements.map(
                            gene =>
                                gene[3]
                        )
                    )
                ];


            let reliability =
                1;


            for (
                const nodeID
                of nodeIDs
            ) {

                const node =
                    this._node(
                        nodeID
                    );


                if (!node) {

                    reliability =
                        0;

                    break;
                }


                reliability *=
                    this._nodeReliability(
                        node
                    );
            }


            total +=
                reliability;
        }


        return (
            total /
            this.services.length
        );
    }

    serviceReliability(solution) {

        if (
            this.services.length ===
            0
        ) {

            return 0;
        }


        const groups =
            this._groups(
                solution
            );


        let total =
            0;


        for (
            const service
            of this.services
        ) {

            const placements =
                groups.get(
                    service.serviceID
                ) ?? [];


            const expected =
                service.components ??
                [];


            const placedComponentIDs =
                new Set(

                    placements.map(
                        gene =>
                            gene[1]
                    )
                );

            if (
                placements.length !==
                    expected.length ||

                placedComponentIDs.size !==
                    expected.length
            ) {

                continue;
            }


            let reliability =
                1;


            for (
                const gene
                of placements
            ) {

                const component =
                    this._component(
                        service,
                        gene[1]
                    );


                const version =
                    this._version(
                        component,
                        gene[2]
                    );


                reliability *=
                    this._versionReliability(
                        version
                    );
            }


            total +=
                reliability;
        }


        return (
            total /
            this.services.length
        );
    }

    executionTime(solution) {

        let total =
            0;


        for (
            const gene
            of solution ?? []
        ) {

            const service =
                this._service(
                    gene[0]
                );


            const component =
                this._component(
                    service,
                    gene[1]
                );


            const version =
                this._version(
                    component,
                    gene[2]
                );


            const node =
                this._node(
                    gene[3]
                );


            if (!node) {

                throw new Error(

                    `Unknown nodeID ` +
                    `${gene[3]}`
                );
            }


            const requiredCPU =
                this._resource(
                    version.characteristics,
                    'cpu'
                );


            const capacityCPU =
                this._resource(
                    node.characteristics,
                    'cpu'
                );


            if (
                capacityCPU <=
                0
            ) {

                throw new Error(

                    `Node ${node.nodeID} ` +
                    `has non-positive CPU`
                );
            }


            total +=
                requiredCPU /
                capacityCPU;
        }


        return total;
    }

    bwDivision(solution) {

        const matrixSize =
            this.infraConnections.length;


        const connections =
            Array.from(

                {
                    length:
                        matrixSize
                },

                () =>
                    Array(
                        matrixSize
                    ).fill(1)
            );


        const groups =
            this._groups(
                solution
            );


        for (
            const service
            of this.services
        ) {

            const placements =
                groups.get(
                    service.serviceID
                ) ?? [];


            for (
                let i = 0;
                i < placements.length;
                i++
            ) {

                const source =
                    placements[i];


                const sourceComponent =
                    this._componentIndex(

                        service,

                        source[1]
                    );


                const sourceNode =
                    this._infraIndex(
                        source[3]
                    );


                for (
                    let j = i + 1;
                    j < placements.length;
                    j++
                ) {

                    const destination =
                        placements[j];


                    const destinationComponent =
                        this._componentIndex(

                            service,

                            destination[1]
                        );


                    const connected =
                        this
                            .componentConnections
                            ?.[sourceComponent]
                            ?.[destinationComponent];


                    if (!connected) {

                        continue;
                    }


                    const destinationNode =
                        this._infraIndex(
                            destination[3]
                        );


                    if (
                        sourceNode ===
                        destinationNode
                    ) {

                        continue;
                    }


                    const bandwidth =
                        this
                            .infraConnections
                            ?.[sourceNode]
                            ?.[destinationNode]
                            ?.[0];


                    if (
                        typeof bandwidth ===
                            'number' &&

                        bandwidth > 0
                    ) {

                        connections[
                            sourceNode
                        ][
                            destinationNode
                        ]++;
                    }
                }
            }
        }


        return connections;
    }

    currentBW(solution) {

        const connections =
            this.bwDivision(
                solution
            );


        const result =
            [];


        for (
            const target
            of this.computingNodes
        ) {

            const targetIndex =
                this._infraIndex(
                    target.nodeID
                );


            let total =
                0;


            let count =
                0;


            for (
                const source
                of this.computingNodes
            ) {

                const sourceIndex =
                    this._infraIndex(
                        source.nodeID
                    );


                const bandwidth =
                    this
                        .infraConnections
                        ?.[sourceIndex]
                        ?.[targetIndex]
                        ?.[0];


                if (
                    typeof bandwidth ===
                        'number' &&

                    bandwidth >= 0
                ) {

                    total +=

                        bandwidth /

                        connections[
                            sourceIndex
                        ][
                            targetIndex
                        ];


                    count++;
                }
            }


            result.push(

                count > 0

                    ?

                    total /
                    count

                    :

                    0
            );
        }


        return result;
    }

    transmissionDelay(solution) {

        const connections =
            this.bwDivision(
                solution
            );


        const groups =
            this._groups(
                solution
            );


        let total =
            0;


        for (
            const service
            of this.services
        ) {

            const placements =
                groups.get(
                    service.serviceID
                ) ?? [];


            for (
                let i = 0;
                i < placements.length;
                i++
            ) {

                const source =
                    placements[i];


                const sourceComponentObject =
                    this._component(

                        service,

                        source[1]
                    );


                const sourceVersion =
                    this._version(

                        sourceComponentObject,

                        source[2]
                    );


                const dataSize =
                    sourceVersion
                        .characteristics
                        .dataSize;


                const sourceComponent =
                    this._componentIndex(

                        service,

                        source[1]
                    );


                const sourceNode =
                    this._infraIndex(
                        source[3]
                    );


                for (
                    let j = i + 1;
                    j < placements.length;
                    j++
                ) {

                    const destination =
                        placements[j];


                    const destinationComponent =
                        this._componentIndex(

                            service,

                            destination[1]
                        );


                    const connected =
                        this
                            .componentConnections
                            ?.[sourceComponent]
                            ?.[destinationComponent];


                    if (!connected) {

                        continue;
                    }


                    const destinationNode =
                        this._infraIndex(
                            destination[3]
                        );


    
                    if (
                        sourceNode ===
                        destinationNode
                    ) {

                        continue;
                    }


                    const link =
                        this
                            .infraConnections
                            ?.[sourceNode]
                            ?.[destinationNode];


                    if (
                        !Array.isArray(link) ||
                        link.length < 2
                    ) {

                        throw new Error(

                            `Missing link ` +
                            `${source[3]} -> ` +
                            `${destination[3]}`
                        );
                    }


                    const baseBandwidth =
                        link[0];


                    const propagationDelay =
                        link[1];


                    if (
                        typeof baseBandwidth !==
                            'number' ||

                        baseBandwidth <=
                            0
                    ) {

                        throw new Error(

                            `Invalid bandwidth on ` +
                            `${source[3]} -> ` +
                            `${destination[3]}`
                        );
                    }


                    const availableBandwidth =

                        baseBandwidth /

                        connections[
                            sourceNode
                        ][
                            destinationNode
                        ];


                    total +=

                        dataSize /
                        availableBandwidth

                        +

                        propagationDelay;
                }
            }
        }


        return total;
    }


    providerDelay(solution) {

        return 0;
    }


    codecDelay(solution) {

        return 0;
    }

    calculateAll(solution) {

        const ResponseTime =

            this.executionTime(
                solution
            )

            +

            this.transmissionDelay(
                solution
            )

            +

            this.providerDelay(
                solution
            )

            +

            this.codecDelay(
                solution
            );


        const PlatformReliability =
            this.infraReliability(
                solution
            );


        const ServiceReliability =
            this.serviceReliability(
                solution
            );


        return {

            ResponseTime,

            PlatformReliability,

            ServiceReliability,

            OverallReliabilty:

                PlatformReliability *

                ServiceReliability
        };
    }

    loadCalculator(solution) {

        let users = 0;

        let helpers = 0;

        let tier1 = 0;

        let tier2 = 0;

        let tier3 = 0;


        for (
            const gene
            of solution ?? []
        ) {

            const type =
                this._nodeType(
                    gene[3]
                );


            if (
                type ===
                'user'
            ) {

                users++;
            }

            else if (
                type ===
                'helper'
            ) {

                helpers++;
            }

            else if (
                type ===
                'computing'
            ) {

                const node =
                    this._node(
                        gene[3]
                    );


                if (
                    node.nodeTier ===
                    1
                ) {

                    tier1++;
                }

                else if (
                    node.nodeTier ===
                    2
                ) {

                    tier2++;
                }

                else if (
                    node.nodeTier ===
                    3
                ) {

                    tier3++;
                }
            }
        }


        const total =

            tier1 +
            tier2 +
            tier3 +
            helpers +
            users;


        if (
            total === 0
        ) {

            return {

                tier1:
                    0,

                tier2:
                    0,

                tier3:
                    0,

                helperTier:
                    0,

                userTier:
                    0
            };
        }


        return {

            tier1:
                tier1 /
                total,

            tier2:
                tier2 /
                total,

            tier3:
                tier3 /
                total,

            helperTier:
                helpers /
                total,

            userTier:
                users /
                total
        };
    }


    entropyCalculator(solution) {

        const usedMemory =
            new Array(
                this.computingNodes.length
            ).fill(0);


        const usedCPU =
            new Array(
                this.computingNodes.length
            ).fill(0);

        for (
            const gene
            of solution ?? []
        ) {

            const nodeIndex =
                this.computingNodes
                    .findIndex(
                        node =>
                            node.nodeID ===
                            gene[3]
                    );


            if (
                nodeIndex < 0
            ) {

                continue;
            }


            const service =
                this._service(
                    gene[0]
                );


            const component =
                this._component(
                    service,
                    gene[1]
                );


            const version =
                this._version(
                    component,
                    gene[2]
                );


            usedMemory[
                nodeIndex
            ] +=

                this._resource(
                    version.characteristics,
                    'memory'
                );


            usedCPU[
                nodeIndex
            ] +=

                this._resource(
                    version.characteristics,
                    'cpu'
                );
        }


        const memoryLoads =
            [];


        const cpuLoads =
            [];


        for (
            let i = 0;
            i < this.computingNodes.length;
            i++
        ) {

            const node =
                this.computingNodes[i];


            const memoryCapacity =
                this._resource(
                    node.characteristics,
                    'memory'
                );


            const cpuCapacity =
                this._resource(
                    node.characteristics,
                    'cpu'
                );


            memoryLoads.push(

                memoryCapacity > 0

                    ?

                    usedMemory[i] /
                    memoryCapacity

                    :

                    0
            );


            cpuLoads.push(

                cpuCapacity > 0

                    ?

                    usedCPU[i] /
                    cpuCapacity

                    :

                    0
            );
        }


        const totalMemory =
            memoryLoads.reduce(
                (sum, value) =>
                    sum + value,
                0
            );


        const totalCPU =
            cpuLoads.reduce(
                (sum, value) =>
                    sum + value,
                0
            );


        let memoryEntropy =
            0;


        let cpuEntropy =
            0;


        if (
            totalMemory > 0
        ) {

            for (
                const load
                of memoryLoads
            ) {

                const probability =

                    load /
                    totalMemory;


                if (
                    probability > 0
                ) {

                    memoryEntropy -=

                        probability *

                        Math.log2(
                            probability
                        );
                }
            }
        }


        if (
            totalCPU > 0
        ) {

            for (
                const load
                of cpuLoads
            ) {

                const probability =

                    load /
                    totalCPU;


                if (
                    probability > 0
                ) {

                    cpuEntropy -=

                        probability *

                        Math.log2(
                            probability
                        );
                }
            }
        }


        return {

            cpu_entropy_infrastructure:

                Number(
                    cpuEntropy.toFixed(4)
                ),

            memory_entropy_infrastructure:

                Number(
                    memoryEntropy.toFixed(4)
                )
        };
    }

    solutionAnalyser(solution) {

        const cost =
            this.calculateAll(
                solution
            );


        const entropy =
            this.entropyCalculator(
                solution
            );

        const representedServices =
            new Set(

                (
                    solution ??
                    []
                ).map(
                    gene =>
                        gene[0]
                )

            ).size;


        const denominator =
            Math.max(

                representedServices ||

                this.services.length,

                1
            );


        return {

            totalResponseTime:

                Number(
                    cost
                        .ResponseTime
                        .toFixed(4)
                ),

            aveResponseTime:

                Number(

                    (
                        cost.ResponseTime /
                        denominator
                    ).toFixed(4)
                ),

            platformReliability:

                Number(
                    cost
                        .PlatformReliability
                        .toFixed(4)
                ),

            serviceReliability:

                Number(
                    cost
                        .ServiceReliability
                        .toFixed(4)
                ),

            entropyAnalysis:
                entropy
        };
    }

    _initialMaxRTCached() {

        if (
            this._cachedInitialMaxRT ===
            undefined
        ) {

            this._cachedInitialMaxRT =
                this.initialMaxRT();


            if (
                !Number.isFinite(
                    this._cachedInitialMaxRT
                ) ||

                this._cachedInitialMaxRT <=
                    0
            ) {

                throw new Error(

                    `Invalid initialMaxRT: ` +
                    `${this._cachedInitialMaxRT}`
                );
            }
        }


        return this
            ._cachedInitialMaxRT;
    }


    quality(solutions) {

        const maxResponseTime =
            this._initialMaxRTCached();


        const quality =
            [];


        for (
            const solution
            of solutions
        ) {

            if (
                !this._isResourceFeasible(
                    solution
                )
            ) {

                quality.push(
                    Number.POSITIVE_INFINITY
                );


                continue;
            }


            const values =
                this.calculateAll(
                    solution
                );

            const value =

                0.33 *

                values.ResponseTime /

                maxResponseTime

                -

                0.33 *

                values.PlatformReliability

                -

                0.33 *

                values.ServiceReliability;


            quality.push(
                value
            );
        }


        return quality;
    }

    perServiceAnalysis(
        solution,
        file_path = 'file_name'
    ) {

        const groups =
            this._groups(
                solution
            );


        const responseTimes =
            [];


        const platformReliabilities =
            [];


        const serviceReliabilities =
            [];

        for (
            const service
            of this.services
        ) {

            const serviceSolution =
                groups.get(
                    service.serviceID
                ) ?? [];


            const result =
                this.solutionAnalyser(
                    serviceSolution
                );


            responseTimes.push(
                result.totalResponseTime
            );


            platformReliabilities.push(
                result.platformReliability
            );


            serviceReliabilities.push(
                result.serviceReliability
            );
        }


        const lines =
            values =>

                values
                    .map(
                        value =>

                            Number(
                                value.toFixed(4)
                            )
                    )
                    .join('\n')

                +

                (
                    values.length > 0
                        ?
                        '\n'
                        :
                        ''
                );


        return {

            resTimePerService:
                lines(
                    responseTimes
                ),

            platReliability:
                lines(
                    platformReliabilities
                ),

            servReliability:
                lines(
                    serviceReliabilities
                )
        };
    }

    mapIntoInteger(solutions) {

        const mapped =
            this.deepClone(
                solutions ?? []
            );


        const nodeIDs =
            this._allNodes()
                .map(
                    node =>
                        node.nodeID
                );


        if (
            nodeIDs.length === 0
        ) {

            throw new Error(
                'No node IDs are available'
            );
        }


        const result =
            [];


        for (
            const solution
            of mapped
        ) {

            for (
                const gene
                of solution
            ) {

                const service =
                    this._service(
                        gene[0]
                    );


                const component =
                    this._component(
                        service,
                        gene[1]
                    );

                const versionIDs =
                    (
                        component.versions ??
                        []
                    ).map(
                        version =>
                            version.versionNumber
                    );


                gene[2] =
                    this._nearestAllowed(

                        gene[2],

                        versionIDs
                    );

                gene[3] =
                    this._nearestAllowed(

                        gene[3],

                        nodeIDs
                    );
            }

            result.push(

                this.healing(

                    this.validation(
                        solution
                    )
                )
            );
        }


        return result;
    }

    initialMaxRT() {

        const system =
            this.deepClone(
                this.ans
            );


        const baseline =
            new taskContinuationAffinity(
                system
            );


        const result =
            baseline.run();


        return (
            result
                .servicePlacementResults
                .totalResponseTime
        );
    }
}

class NCO extends solutionOperation {

    constructor(ans) {
        super(ans);

        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];

        this.algo = ans['algo'];
        this.ans = ans;
        this.numberOfWeights = 16;
    }

    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    validateWeights(w) {

        if (!Array.isArray(w)) {
            throw new Error(
                'NCO weights must be an array.'
            );
        }

        if (w.length !== this.numberOfWeights) {
            throw new Error(
                `NCO expects exactly ${this.numberOfWeights} weights, ` +
                `but ${w.length} were provided.`
            );
        }

        for (let i = 0; i < w.length; i++) {

            if (
                typeof w[i] !== 'number' ||
                !Number.isFinite(w[i])
            ) {
                throw new Error(
                    `Invalid NCO weight at index ${i}: ${w[i]}`
                );
            }
        }
    }

    createBandwidthState() {

        const copyBW =
            this.deepClone(
                this.infraConnections
            );

        const matrixSize =
            copyBW.length;

        const dv =
            Array.from(
                { length: matrixSize },
                () => Array(matrixSize).fill(1)
            );


        return {
            copyBW,
            dv
        };
    }

    getInfraIndex(nodeID) {

        if (
            this.infraConnections.length ===
            this.computingNodes.length
        ) {

            const index =
                this.computingNodes.findIndex(
                    node =>
                        node['nodeID'] === nodeID
                );


            if (index !== -1) {
                return index;
            }
        }

        const numericIndex =
            Number(nodeID) - 1;


        if (
            Number.isInteger(numericIndex) &&
            numericIndex >= 0 &&
            numericIndex < this.infraConnections.length
        ) {
            return numericIndex;
        }


        throw new Error(
            `Cannot map nodeID ${nodeID} ` +
            `to infraConnections matrix.`
        );
    }
    bwd(
        solution,
        service,
        currentComponentIndex,
        dv,
        copyBW
    ) {

        if (
            !Array.isArray(solution) ||
            solution.length === 0
        ) {
            return;
        }


        if (currentComponentIndex <= 0) {
            return;
        }


        const currentPlacement =
            solution[solution.length - 1];

        const currentServiceID =
            currentPlacement[0];

        const currentNodeID =
            currentPlacement[3];

        const currentNodeIndex =
            this.getInfraIndex(
                currentNodeID
            );

        for (
            let previousComponentIndex = 0;
            previousComponentIndex < currentComponentIndex;
            previousComponentIndex++
        ) {


            if (
                this.componentConnections
                    ?. [previousComponentIndex]
                    ?. [currentComponentIndex] !== 1
            ) {
                continue;
            }


            const previousComponentID =
                service['components']
                    [previousComponentIndex]
                    ['componentID'];

            let previousPlacement = null;


            for (
                let i = solution.length - 2;
                i >= 0;
                i--
            ) {

                if (
                    solution[i][0] === currentServiceID &&
                    solution[i][1] === previousComponentID
                ) {

                    previousPlacement =
                        solution[i];

                    break;
                }
            }


            if (!previousPlacement) {
                continue;
            }


            const previousNodeID =
                previousPlacement[3];
            if (
                currentNodeID ===
                previousNodeID
            ) {
                continue;
            }


            const previousNodeIndex =
                this.getInfraIndex(
                    previousNodeID
                );

            dv[currentNodeIndex][previousNodeIndex]++;

            dv[previousNodeIndex][currentNodeIndex]++;

            const forwardBaseBW =
                copyBW[currentNodeIndex]
                    [previousNodeIndex][2];

            const reverseBaseBW =
                copyBW[previousNodeIndex]
                    [currentNodeIndex][2];


            copyBW[currentNodeIndex]
                [previousNodeIndex][0] =

                forwardBaseBW /
                dv[currentNodeIndex]
                    [previousNodeIndex];


            copyBW[previousNodeIndex]
                [currentNodeIndex][0] =

                reverseBaseBW /
                dv[previousNodeIndex]
                    [currentNodeIndex];
        }
    }

    aveBW(copyBW) {

        const aveBW = [];


        for (
            let j = 0;
            j < this.computingNodes.length;
            j++
        ) {

            const nodeJIndex =
                this.getInfraIndex(
                    this.computingNodes[j]['nodeID']
                );


            let total = 0;
            let count = 0;


            for (
                let i = 0;
                i < this.computingNodes.length;
                i++
            ) {

                const nodeIIndex =
                    this.getInfraIndex(
                        this.computingNodes[i]['nodeID']
                    );

                const bw =
                    copyBW
                        ?. [nodeIIndex]
                        ?. [nodeJIndex]
                        ?. [0];


                if (
                    typeof bw === 'number' &&
                    Number.isFinite(bw)
                ) {

                    total += bw;
                    count++;
                }
            }


            aveBW.push(
                count > 0
                    ? total / count
                    : undefined
            );
        }


        return aveBW;
    }

    formula(
        bandwidth,
        node,
        version,
        w,
        maxMemory,
        maxCPU
    ) {

        const f1 =
            node['characteristics']['memory'] /
            maxMemory;

        const f2 =
            node['characteristics']['cpu'] /
            maxCPU;

        const f3 =
            node['characteristics']['reliabilityScore'];

        const f4 =
            version['memory'] / 2500;

        const f5 =
            version['cpu'] / 1100;

        const f6 =
            version['dataSize'] / 500;

        const f7 =
            version['reliabilityScore'];

        const f8 =

            (
                typeof bandwidth === 'number' &&
                Number.isFinite(bandwidth)
            )

                ? bandwidth / 500

                : 1;

        const value =

            w[0] * (f1 ** w[8])

            +

            w[1] * (f2 ** w[9])

            +

            w[2] * (f3 ** w[10])

            +

            w[3] * (f4 ** w[11])

            +

            w[4] * (f5 ** w[12])

            +

            w[5] * (f6 ** w[13])

            +

            w[6] * (f7 ** w[14])

            +

            w[7] * f8 * w[15];


        return value;
    }


    test(w) {

        this.validateWeights(w);


        const startTime =
            performance.now();


        if (
            !Array.isArray(this.computingNodes) ||
            this.computingNodes.length === 0
        ) {
            throw new Error(
                'NCO requires at least one computing node.'
            );
        }

        const maxMemory =
            Math.max(
                ...this.computingNodes.map(
                    node =>
                        node['characteristics']['memory']
                )
            );


        const maxCPU =
            Math.max(
                ...this.computingNodes.map(
                    node =>
                        node['characteristics']['cpu']
                )
            );


        if (
            !Number.isFinite(maxMemory) ||
            maxMemory <= 0
        ) {
            throw new Error(
                'Invalid maximum node memory.'
            );
        }


        if (
            !Number.isFinite(maxCPU) ||
            maxCPU <= 0
        ) {
            throw new Error(
                'Invalid maximum node CPU.'
            );
        }

        const computingNodesFreeCapacity =
            this.computingNodes.map(
                node => ({
                    ...this.deepClone(node),
                    characteristics: {
                        ...node['characteristics']
                    }
                })
            );


        const {
            copyBW,
            dv
        } = this.createBandwidthState();


        let solution = [];

        let bandwidth =
            new Array(
                this.computingNodes.length
            ).fill(undefined);

        for (const service of this.services) {


            if (
                !Array.isArray(
                    service['components']
                )
            ) {
                continue;
            }


            for (
                let componentIndex = 0;
                componentIndex <
                    service['components'].length;
                componentIndex++
            ) {

                const component =
                    service['components']
                        [componentIndex];


                const versions =
                    component['versions'];


                if (
                    !Array.isArray(versions) ||
                    versions.length === 0
                ) {

                    throw new Error(
                        `Service ${service['serviceID']}, ` +
                        `component ${component['componentID']} ` +
                        `has no versions.`
                    );
                }
                let bestNodeIndex = -1;

                let bestVersionIndex = -1;

                let bestValue =
                    -Infinity;

                for (
                    let nodeIndex = 0;
                    nodeIndex <
                        computingNodesFreeCapacity.length;
                    nodeIndex++
                ) {

                    const node =
                        computingNodesFreeCapacity[
                            nodeIndex
                        ];

                    for (
                        let versionIndex = 0;
                        versionIndex <
                            versions.length;
                        versionIndex++
                    ) {

                        const version =
                            versions[
                                versionIndex
                            ]['characteristics'];

                        if (
                            node['characteristics']['memory'] <
                            version['memory']
                        ) {
                            continue;
                        }


                        const value =
                            this.formula(

                                bandwidth[nodeIndex],

                                node,

                                version,

                                w,

                                maxMemory,

                                maxCPU
                            );


                        if (
                            Number.isFinite(value) &&
                            value > bestValue
                        ) {

                            bestValue =
                                value;

                            bestNodeIndex =
                                nodeIndex;

                            bestVersionIndex =
                                versionIndex;
                        }
                    }
                }

                if (
                    bestNodeIndex === -1 ||
                    bestVersionIndex === -1
                ) {

                    continue;
                }

                const chosenVersion =
                    versions[
                        bestVersionIndex
                    ];


                const chosenNode =
                    computingNodesFreeCapacity[
                        bestNodeIndex
                    ];

                solution.push([

                    service['serviceID'],

                    component['componentID'],

                    chosenVersion[
                        'versionNumber'
                    ],

                    chosenNode[
                        'nodeID'
                    ]
                ]);


                chosenNode[
                    'characteristics'
                ]['memory'] -=

                    chosenVersion[
                        'characteristics'
                    ]['memory'];

                this.bwd(

                    solution,

                    service,

                    componentIndex,

                    dv,

                    copyBW
                );


                bandwidth =
                    this.aveBW(
                        copyBW
                    );
            }
        }


        solution =
            this.validation(
                solution
            );


        const exeTime =
            performance.now() -
            startTime;


        return {

            solution:
                solution,

            servicePlacementResults:
                this.solutionAnalyser(
                    solution
                ),

            nodesFreeCapacity:
                computingNodesFreeCapacity,

            runtime:
                exeTime,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    solution,
                    'NCO-per-service'
                )
        };
    }

    run_test(model_index = 0) {

        const weights =
            readJSON(
                `weights_${model_index}.txt`
            );


        this.validateWeights(
            weights
        );


        return this.test(
            weights
        );
    }

    run(model_index = 0) {

        return this.run_test(
            model_index
        );
    }
}

class taskContinuationAffinity extends solutionOperation {

    constructor(ans) {
        super(ans);

        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }


    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    fitsMemory(node, version) {
        return (
            node['characteristics']['memory'] >=
            version['characteristics']['memory']
        );
    }


    consumeMemory(node, version) {
        node['characteristics']['memory'] -=
            version['characteristics']['memory'];
    }


    run() {

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);

        let solution = [];

        const startTime = performance.now();

        for (const service of this.services) {
            const userNode =
                userFreeCapacity.find(
                    user =>
                        user['nodeID'] ===
                        service['userID']
                );

            const helperNode =
                helperFreeCapacity.find(
                    helper =>
                        helper['nodeID'] ===
                        service['helperID']
                );

            for (const component of service['components']) {

                const versions =
                    component['versions'];


                if (
                    !Array.isArray(versions) ||
                    versions.length === 0
                ) {
                    throw new Error(
                        `Component ${component['componentID']} ` +
                        `has no versions.`
                    );
                }


                let placed = false;

                if (userNode) {

                    for (const version of versions) {

                        if (
                            this.fitsMemory(
                                userNode,
                                version
                            )
                        ) {

                            solution.push([
                                service['serviceID'],
                                component['componentID'],
                                version['versionNumber'],
                                userNode['nodeID']
                            ]);


                            this.consumeMemory(
                                userNode,
                                version
                            );


                            placed = true;
                            break;
                        }
                    }
                }

                if (!placed) {

                    for (
                        const node
                        of computingNodesFreeCapacity
                    ) {

                        for (const version of versions) {

                            if (
                                this.fitsMemory(
                                    node,
                                    version
                                )
                            ) {

                                solution.push([
                                    service['serviceID'],
                                    component['componentID'],
                                    version['versionNumber'],
                                    node['nodeID']
                                ]);


                                this.consumeMemory(
                                    node,
                                    version
                                );


                                placed = true;
                                break;
                            }
                        }


                        if (placed) {
                            break;
                        }
                    }
                }

                if (
                    !placed &&
                    helperNode
                ) {

                    for (const version of versions) {

                        if (
                            this.fitsMemory(
                                helperNode,
                                version
                            )
                        ) {

                            solution.push([
                                service['serviceID'],
                                component['componentID'],
                                version['versionNumber'],
                                helperNode['nodeID']
                            ]);


                            this.consumeMemory(
                                helperNode,
                                version
                            );


                            placed = true;
                            break;
                        }
                    }
                }
            }
        }

        solution =
            this.validation(solution);


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    solution
                ),

            solution:
                solution,

            nodesFreeCapacity:
                computingNodesFreeCapacity,

            runtime:
                exeTime,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    solution,
                    'TCA-per-service'
                )
        };
    }
}

class leastRequiredCPU extends solutionOperation {

    constructor(ans) {
        super(ans);

        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }


    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    fitsMemory(node, version) {
        return (
            node['characteristics']['memory'] >=
            version['characteristics']['memory']
        );
    }


    consumeMemory(node, version) {
        node['characteristics']['memory'] -=
            version['characteristics']['memory'];
    }


    getLeastCPUVersion(component) {

        const versions =
            component['versions'];


        if (
            !Array.isArray(versions) ||
            versions.length === 0
        ) {
            throw new Error(
                `Component ${component['componentID']} ` +
                `has no versions.`
            );
        }


        let bestVersion =
            versions[0];


        for (
            let i = 1;
            i < versions.length;
            i++
        ) {

            if (
                versions[i]['characteristics']['cpu'] <
                bestVersion['characteristics']['cpu']
            ) {

                bestVersion =
                    versions[i];
            }
        }


        return bestVersion;
    }


    run() {

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);

        let solution = [];

        const startTime =
            performance.now();


        for (const service of this.services) {

            const userNode =
                userFreeCapacity.find(
                    user =>
                        user['nodeID'] ===
                        service['userID']
                );


            const helperNode =
                helperFreeCapacity.find(
                    helper =>
                        helper['nodeID'] ===
                        service['helperID']
                );


            for (
                const component
                of service['components']
            ) {

                const version =
                    this.getLeastCPUVersion(
                        component
                    );


                let placed = false;

                if (
                    userNode &&
                    this.fitsMemory(
                        userNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        userNode['nodeID']
                    ]);


                    this.consumeMemory(
                        userNode,
                        version
                    );


                    placed = true;
                }

                if (!placed) {

                    for (
                        const node
                        of computingNodesFreeCapacity
                    ) {

                        if (
                            this.fitsMemory(
                                node,
                                version
                            )
                        ) {

                            solution.push([
                                service['serviceID'],
                                component['componentID'],
                                version['versionNumber'],
                                node['nodeID']
                            ]);


                            this.consumeMemory(
                                node,
                                version
                            );


                            placed = true;
                            break;
                        }
                    }
                }

                if (
                    !placed &&
                    helperNode &&
                    this.fitsMemory(
                        helperNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        helperNode['nodeID']
                    ]);


                    this.consumeMemory(
                        helperNode,
                        version
                    );
                }
            }
        }


        solution =
            this.validation(solution);


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    solution
                ),

            runtime:
                exeTime,

            nodesFreeCapacity:
                computingNodesFreeCapacity,

            solution:
                solution,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    solution,
                    'LRC-per-service'
                )
        };
    }
}

class mostDataSize extends solutionOperation {

    constructor(ans) {
        super(ans);

        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }


    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    fitsMemory(node, version) {
        return (
            node['characteristics']['memory'] >=
            version['characteristics']['memory']
        );
    }


    consumeMemory(node, version) {
        node['characteristics']['memory'] -=
            version['characteristics']['memory'];
    }


    getLargestDataSizeVersion(component) {

        const versions =
            component['versions'];


        if (
            !Array.isArray(versions) ||
            versions.length === 0
        ) {
            throw new Error(
                `Component ${component['componentID']} ` +
                `has no versions.`
            );
        }


        let bestVersion =
            versions[0];


        for (
            let i = 1;
            i < versions.length;
            i++
        ) {

            if (
                versions[i]['characteristics']['dataSize'] >
                bestVersion['characteristics']['dataSize']
            ) {

                bestVersion =
                    versions[i];
            }
        }


        return bestVersion;
    }


    run() {

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);


        let solution = [];

        const startTime =
            performance.now();


        for (const service of this.services) {

            const userNode =
                userFreeCapacity.find(
                    user =>
                        user['nodeID'] ===
                        service['userID']
                );


            const helperNode =
                helperFreeCapacity.find(
                    helper =>
                        helper['nodeID'] ===
                        service['helperID']
                );


            for (
                const component
                of service['components']
            ) {

                const version =
                    this.getLargestDataSizeVersion(
                        component
                    );


                let placed = false;

                if (
                    userNode &&
                    this.fitsMemory(
                        userNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        userNode['nodeID']
                    ]);


                    this.consumeMemory(
                        userNode,
                        version
                    );


                    placed = true;
                }

                if (!placed) {

                    for (
                        const node
                        of computingNodesFreeCapacity
                    ) {

                        if (
                            this.fitsMemory(
                                node,
                                version
                            )
                        ) {

                            solution.push([
                                service['serviceID'],
                                component['componentID'],
                                version['versionNumber'],
                                node['nodeID']
                            ]);


                            this.consumeMemory(
                                node,
                                version
                            );


                            placed = true;
                            break;
                        }
                    }
                }

                if (
                    !placed &&
                    helperNode &&
                    this.fitsMemory(
                        helperNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        helperNode['nodeID']
                    ]);


                    this.consumeMemory(
                        helperNode,
                        version
                    );
                }
            }
        }


        solution =
            this.validation(solution);


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    solution
                ),

            runtime:
                exeTime,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    solution,
                    'MDS-per-service'
                ),

            solution:
                solution
        };
    }
}

class mostPowerful extends solutionOperation {

    constructor(ans) {
        super(ans);

        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }


    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    fitsMemory(node, version) {
        return (
            node['characteristics']['memory'] >=
            version['characteristics']['memory']
        );
    }


    consumeMemory(node, version) {
        node['characteristics']['memory'] -=
            version['characteristics']['memory'];
    }


    getLeastCPUVersion(component) {

        const versions =
            component['versions'];


        if (
            !Array.isArray(versions) ||
            versions.length === 0
        ) {
            throw new Error(
                `Component ${component['componentID']} ` +
                `has no versions.`
            );
        }


        let bestVersion =
            versions[0];


        for (
            let i = 1;
            i < versions.length;
            i++
        ) {

            if (
                versions[i]['characteristics']['cpu'] <
                bestVersion['characteristics']['cpu']
            ) {

                bestVersion =
                    versions[i];
            }
        }


        return bestVersion;
    }


    run() {

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);

        computingNodesFreeCapacity.sort(
            (a, b) =>
                b['characteristics']['cpu'] -
                a['characteristics']['cpu']
        );


        let solution = [];

        const startTime =
            performance.now();


        for (const service of this.services) {

            const userNode =
                userFreeCapacity.find(
                    user =>
                        user['nodeID'] ===
                        service['userID']
                );


            const helperNode =
                helperFreeCapacity.find(
                    helper =>
                        helper['nodeID'] ===
                        service['helperID']
                );


            for (
                const component
                of service['components']
            ) {
                const version =
                    this.getLeastCPUVersion(
                        component
                    );


                let placed = false;

                for (
                    const node
                    of computingNodesFreeCapacity
                ) {

                    if (
                        userNode &&
                        userNode['characteristics']['cpu'] >
                            node['characteristics']['cpu'] &&
                        this.fitsMemory(
                            userNode,
                            version
                        )
                    ) {

                        solution.push([
                            service['serviceID'],
                            component['componentID'],
                            version['versionNumber'],
                            userNode['nodeID']
                        ]);


                        this.consumeMemory(
                            userNode,
                            version
                        );


                        placed = true;
                        break;
                    }


                    if (
                        this.fitsMemory(
                            node,
                            version
                        )
                    ) {

                        solution.push([
                            service['serviceID'],
                            component['componentID'],
                            version['versionNumber'],
                            node['nodeID']
                        ]);


                        this.consumeMemory(
                            node,
                            version
                        );


                        placed = true;
                        break;
                    }
                }

                if (
                    !placed &&
                    userNode &&
                    this.fitsMemory(
                        userNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        userNode['nodeID']
                    ]);


                    this.consumeMemory(
                        userNode,
                        version
                    );


                    placed = true;
                }

                if (
                    !placed &&
                    helperNode &&
                    this.fitsMemory(
                        helperNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        helperNode['nodeID']
                    ]);


                    this.consumeMemory(
                        helperNode,
                        version
                    );
                }
            }
        }


        solution =
            this.validation(solution);


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    solution
                ),

            solution:
                solution,

            nodesFreeCapacity:
                computingNodesFreeCapacity,

            runtime:
                exeTime,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    solution,
                    'MP-per-service'
                )
        };
    }
}

class leastPowerful extends solutionOperation {

    constructor(ans) {
        super(ans);

        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }


    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    fitsMemory(node, version) {
        return (
            node['characteristics']['memory'] >=
            version['characteristics']['memory']
        );
    }


    consumeMemory(node, version) {
        node['characteristics']['memory'] -=
            version['characteristics']['memory'];
    }


    getMostCPUVersion(component) {

        const versions =
            component['versions'];


        if (
            !Array.isArray(versions) ||
            versions.length === 0
        ) {
            throw new Error(
                `Component ${component['componentID']} ` +
                `has no versions.`
            );
        }


        let bestVersion =
            versions[0];


        for (
            let i = 1;
            i < versions.length;
            i++
        ) {

            if (
                versions[i]['characteristics']['cpu'] >
                bestVersion['characteristics']['cpu']
            ) {

                bestVersion =
                    versions[i];
            }
        }


        return bestVersion;
    }


    run() {

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);

        computingNodesFreeCapacity.sort(
            (a, b) =>
                a['characteristics']['cpu'] -
                b['characteristics']['cpu']
        );


        let solution = [];

        const startTime =
            performance.now();


        for (const service of this.services) {

            const userNode =
                userFreeCapacity.find(
                    user =>
                        user['nodeID'] ===
                        service['userID']
                );


            const helperNode =
                helperFreeCapacity.find(
                    helper =>
                        helper['nodeID'] ===
                        service['helperID']
                );


            for (
                const component
                of service['components']
            ) {

                const version =
                    this.getMostCPUVersion(
                        component
                    );


                let placed = false;


                for (
                    const node
                    of computingNodesFreeCapacity
                ) {

                    if (
                        userNode &&
                        userNode['characteristics']['cpu'] <
                            node['characteristics']['cpu'] &&
                        this.fitsMemory(
                            userNode,
                            version
                        )
                    ) {

                        solution.push([
                            service['serviceID'],
                            component['componentID'],
                            version['versionNumber'],
                            userNode['nodeID']
                        ]);


                        this.consumeMemory(
                            userNode,
                            version
                        );


                        placed = true;
                        break;
                    }


                    if (
                        this.fitsMemory(
                            node,
                            version
                        )
                    ) {

                        solution.push([
                            service['serviceID'],
                            component['componentID'],
                            version['versionNumber'],
                            node['nodeID']
                        ]);


                        this.consumeMemory(
                            node,
                            version
                        );


                        placed = true;
                        break;
                    }
                }

                if (
                    !placed &&
                    userNode &&
                    this.fitsMemory(
                        userNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        userNode['nodeID']
                    ]);


                    this.consumeMemory(
                        userNode,
                        version
                    );


                    placed = true;
                }
                if (
                    !placed &&
                    helperNode &&
                    this.fitsMemory(
                        helperNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        helperNode['nodeID']
                    ]);


                    this.consumeMemory(
                        helperNode,
                        version
                    );
                }
            }
        }


        solution =
            this.validation(solution);


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    solution
                ),

            solution:
                solution,

            runtime:
                exeTime,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    solution,
                    'LP-per-service'
                )
        };
    }
}

class mostReliablity extends solutionOperation {

    constructor(ans) {
        super(ans);

        this.services = ans['services'];
        this.computingNodes = ans['computingNodes'];
        this.helpers = ans['helperNodes'];
        this.users = ans['usersNodes'];
        this.componentConnections = ans['componentConnections'];
        this.infraConnections = ans['infraConnections'];
    }


    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    fitsMemory(node, version) {
        return (
            node['characteristics']['memory'] >=
            version['characteristics']['memory']
        );
    }


    consumeMemory(node, version) {
        node['characteristics']['memory'] -=
            version['characteristics']['memory'];
    }

    getNodeReliability(node) {

        const characteristics =
            node['characteristics'];


        if (
            characteristics['reliabilityScore'] !==
            undefined
        ) {

            return characteristics[
                'reliabilityScore'
            ];
        }


        if (
            characteristics['reliability'] !==
            undefined
        ) {

            return characteristics[
                'reliability'
            ];
        }


        throw new Error(
            `Node ${node['nodeID']} ` +
            `has no reliability value.`
        );
    }


    getMostReliableVersion(component) {

        const versions =
            component['versions'];


        if (
            !Array.isArray(versions) ||
            versions.length === 0
        ) {
            throw new Error(
                `Component ${component['componentID']} ` +
                `has no versions.`
            );
        }


        let bestVersion =
            versions[0];


        for (
            let i = 1;
            i < versions.length;
            i++
        ) {

            if (
                versions[i]['characteristics']['reliabilityScore'] >
                bestVersion['characteristics']['reliabilityScore']
            ) {

                bestVersion =
                    versions[i];
            }
        }


        return bestVersion;
    }


    run() {

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);

        computingNodesFreeCapacity.sort(
            (a, b) =>
                this.getNodeReliability(b) -
                this.getNodeReliability(a)
        );


        let solution = [];

        const startTime =
            performance.now();


        for (const service of this.services) {

            const userNode =
                userFreeCapacity.find(
                    user =>
                        user['nodeID'] ===
                        service['userID']
                );


            const helperNode =
                helperFreeCapacity.find(
                    helper =>
                        helper['nodeID'] ===
                        service['helperID']
                );


            for (
                const component
                of service['components']
            ) {

                const version =
                    this.getMostReliableVersion(
                        component
                    );


                let placed = false;

                for (
                    const node
                    of computingNodesFreeCapacity
                ) {

                    if (
                        userNode &&
                        this.getNodeReliability(
                            userNode
                        ) >
                        this.getNodeReliability(
                            node
                        ) &&
                        this.fitsMemory(
                            userNode,
                            version
                        )
                    ) {

                        solution.push([
                            service['serviceID'],
                            component['componentID'],
                            version['versionNumber'],
                            userNode['nodeID']
                        ]);


                        this.consumeMemory(
                            userNode,
                            version
                        );


                        placed = true;
                        break;
                    }


                    if (
                        this.fitsMemory(
                            node,
                            version
                        )
                    ) {

                        solution.push([
                            service['serviceID'],
                            component['componentID'],
                            version['versionNumber'],
                            node['nodeID']
                        ]);


                        this.consumeMemory(
                            node,
                            version
                        );


                        placed = true;
                        break;
                    }
                }

                if (
                    !placed &&
                    userNode &&
                    this.fitsMemory(
                        userNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        userNode['nodeID']
                    ]);


                    this.consumeMemory(
                        userNode,
                        version
                    );


                    placed = true;
                }

                if (
                    !placed &&
                    helperNode &&
                    this.fitsMemory(
                        helperNode,
                        version
                    )
                ) {

                    solution.push([
                        service['serviceID'],
                        component['componentID'],
                        version['versionNumber'],
                        helperNode['nodeID']
                    ]);


                    this.consumeMemory(
                        helperNode,
                        version
                    );
                }
            }
        }


        solution =
            this.validation(solution);


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    solution
                ),

            solution:
                solution,

            runtime:
                exeTime,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    solution,
                    'MR-per-service'
                )
        };
    }
}

class geneticAlgorithm extends solutionOperation {
    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);
        const config = sysAlgoConfig;
        this.ans = config.ans;
        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections = config.ans['componentConnections'];
        this.infraConnections = config.ans['infraConnections'];

        this.cProbability = config.ans['configsGA']['crossoverRate'];
        this.mProbability = config.ans['configsGA']['mutationRate'];
        this.numPopulation = config.ans['configsGA']['populationSize'];
        this.tournamentSize = config.ans['configsGA']['selectionSize'];
        this.iteration = config.ans['configsGA']['iteration'];
    }

    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    randomIntInclusive(min, max) {
        if (
            !Number.isInteger(min) ||
            !Number.isInteger(max) ||
            max < min
        ) {
            throw new Error(
                `Invalid integer range: [${min}, ${max}]`
            );
        }
        return min +
            Math.floor(Math.random() * (max - min + 1));
    }

    tournamentSelection(population, fitness) {

        if (!Array.isArray(population) || population.length === 0) {
            return [];
        }

        if (
            !Array.isArray(fitness) ||
            fitness.length !== population.length
        ) {
            throw new Error(
                'Fitness array must have the same length as population.'
            );
        }

        const selectedPopulation = [];
        const tournamentSize =
        Math.max(1, Math.floor(this.tournamentSize));

        for (let n = 0; n < population.length; n++) {

            let selectedIndex =
                this.randomIntInclusive(
                    0,
                    population.length - 1
                );

            let minCost = fitness[selectedIndex];

            for (let i = 1; i < tournamentSize; i++) {

                const candidateIndex =
                    this.randomIntInclusive(
                        0,
                        population.length - 1
                    );

                if (fitness[candidateIndex] < minCost) {
                    selectedIndex = candidateIndex;
                    minCost = fitness[candidateIndex];
                }
            }

            selectedPopulation.push(
                population[selectedIndex]
            );
        }

        return selectedPopulation;
    }

    crossover(population) {

        const crossoverPopulation =
            this.deepClone(population);
        for (
            let i = 0;
            i + 1 < population.length;
            i += 2
        ) {

            if (Math.random() >= this.cProbability) {
                continue;
            }

            const parent1 = population[i];
            const parent2 = population[i + 1];

            if (
                !Array.isArray(parent1) ||
                !Array.isArray(parent2)
            ) {
                throw new Error(
                    'Each chromosome must be an array.'
                );
            }

            if (parent1.length !== parent2.length) {
                throw new Error(
                    'Crossover requires chromosomes of equal length.'
                );
            }

            if (parent1.length < 2) {
                continue;
            }

            const crossoverPoint =
                this.randomIntInclusive(
                    1,
                    parent1.length - 1
                );

            crossoverPopulation[i] = [
                ...parent1.slice(0, crossoverPoint),
                ...parent2.slice(crossoverPoint)
            ];

            crossoverPopulation[i + 1] = [
                ...parent2.slice(0, crossoverPoint),
                ...parent1.slice(crossoverPoint)
            ];
        }

        return crossoverPopulation;
    }

    getUniformVersionCount() {

        const versionCounts = [];

        for (const service of this.services ?? []) {

            for (const component of service.components ?? []) {

                if (
                    !Array.isArray(component.versions) ||
                    component.versions.length === 0
                ) {
                    throw new Error(
                        'Every component must have at least one version.'
                    );
                }

                versionCounts.push(
                    component.versions.length
                );
            }
        }

        if (versionCounts.length === 0) {
            throw new Error(
                'No component versions were found.'
            );
        }

        const firstCount = versionCounts[0];

        if (
            versionCounts.some(
                count => count !== firstCount
            )
        ) {
            throw new Error(
                'Error...'
            );
        }

        return firstCount;
    }

    mutation(population) {

        const mutationPopulation =
            this.deepClone(population);

        if (
            !Array.isArray(this.computingNodes) ||
            this.computingNodes.length === 0
        ) {
            throw new Error(
                'At least one computing node is required for mutation.'
            );
        }

        const numVersions =
            this.getUniformVersionCount();

        for (
            let m = 0;
            m < mutationPopulation.length;
            m++
        ) {

            for (
                let i = 0;
                i < mutationPopulation[m].length;
                i++
            ) {

                if (Math.random() >= this.mProbability) {
                    continue;
                }

                const gene =
                    mutationPopulation[m][i];

                if (
                    !Array.isArray(gene) ||
                    gene.length < 4
                ) {
                    throw new Error(
                        'Each gene must contain at least four fields.'
                    );
                }

                gene[2] =
                    this.randomIntInclusive(
                        1,
                        numVersions
                    );

                gene[3] =
                    this.randomIntInclusive(
                        1,
                        this.computingNodes.length
                    );
            }
        }

        return mutationPopulation;
    }

    healingSolution(population) {

        return population.map(individual => {

            const candidate =
                this.deepClone(individual);

            return this.healing(
                this.validation(candidate)
            );
        });
    }

    elitism(population, newPopulation) {

        const targetSize = population.length;

        const combinedPopulation =
            this.deepClone(
                population.concat(newPopulation)
            );

        const fitness =
            this.quality(combinedPopulation);

        return combinedPopulation
            .map((individual, index) => ({
                individual: individual,
                fitness: fitness[index]
            }))
            .sort(
                (a, b) =>
                    a.fitness - b.fitness
            )
            .slice(0, targetSize)
            .map(
                entry => entry.individual
            );
    }


    run(
        iniSols = this.initialSolutions(this.numPopulation),
        itr = this.iteration
    ) {

        const startTime = performance.now();

        if (
            !Number.isInteger(this.numPopulation) ||
            this.numPopulation <= 0
        ) {
            throw new Error(
                'populationSize must be a positive integer.'
            );
        }

        let population =
            this.deepClone(
                Array.isArray(iniSols)
                    ? iniSols
                    : []
            );

        if (
            population.length >
            this.numPopulation
        ) {
            population =
                population.slice(
                    0,
                    this.numPopulation
                );
        }

        while (
            population.length <
            this.numPopulation
        ) {

            const generated =
                this.initialSolutions(1);

            if (
                !Array.isArray(generated) ||
                generated.length === 0
            ) {
                throw new Error(
                    'initialSolutions(1) did not return a solution.'
                );
            }

            population.push(
                this.deepClone(generated[0])
            );
        }

        let fitness =
            this.quality(population);

        let bestInfo =
            this.solutionsQualitySort(
                population,
                fitness
            );

        bestInfo = {
            ...bestInfo,
            bestSolution:
                this.deepClone(
                    bestInfo.bestSolution
                )
        };

        for (let i = 0; i < itr; i++) {

            fitness =
                this.quality(population);

            const previousPopulation =
                population;

            const selectedPopulation =
                this.tournamentSelection(
                    population,
                    fitness
                );


            const crossoverPopulation =
                this.crossover(
                    selectedPopulation
                );

            const mutationPopulation =
                this.mutation(
                    crossoverPopulation
                );
            const newPopulation =
                this.healingSolution(
                    mutationPopulation
                );
            population =
                newPopulation;

            const currentFitness =
                this.quality(population);

            const currentInfo =
                this.solutionsQualitySort(
                    population,
                    currentFitness
                );

            if (
                currentInfo.bestQuality <
                bestInfo.bestQuality
            ) {

                bestInfo = {
                    ...currentInfo,
                    bestSolution:
                        this.deepClone(
                            currentInfo.bestSolution
                        )
                };
            }
        }


        const exeTime =
            performance.now() - startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    bestInfo.bestSolution
                ),

            runtime:
                exeTime,

            fitness:
                bestInfo.bestQuality,

            bestSolution:
                bestInfo.bestSolution,

            solution:
                bestInfo.bestSolution,

            population:
                population,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    bestInfo.bestSolution,
                    'GA-per-service'
                )
        };
    }
}

class particleSwarmOptimization extends solutionOperation {

    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);

        const config = sysAlgoConfig;

        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections =
            config.ans['componentConnections'];
        this.infraConnections =
            config.ans['infraConnections'];

        this.ans = config.ans;

        this.numParticles =
            config.ans['configsPSO']['populationSize'];

        this.w =
            config.ans['configsPSO']['w'];

        this.c1 =
            config.ans['configsPSO']['c1'];

        this.c2 =
            config.ans['configsPSO']['c2'];

        this.iteration =
            config.ans['configsPSO']['iteration'];
    }

    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    initialVelocity(particles) {

        if (
            !Array.isArray(particles) ||
            particles.length === 0
        ) {
            return [];
        }


        const chromosomeLength =
            particles[0].length;


        return particles.map(
            (particle, particleIndex) => {

                if (
                    !Array.isArray(particle) ||
                    particle.length !== chromosomeLength
                ) {
                    throw new Error(
                        `Particle ${particleIndex} does not have ` +
                        `the expected chromosome length.`
                    );
                }


                return particle.map(
                    (gene, geneIndex) => {

                        if (
                            !Array.isArray(gene) ||
                            gene.length < 4
                        ) {
                            throw new Error(
                                `Invalid gene ${geneIndex} ` +
                                `in particle ${particleIndex}.`
                            );
                        }

                        const velocityGene =
                            new Array(gene.length).fill(0);

                        velocityGene[0] = gene[0];
                        velocityGene[1] = gene[1];


                        return velocityGene;
                    }
                );
            }
        );
    }

    updateVelocityPosition(
        particles,
        velocities,
        pBest,
        gBest
    ) {

        if (
            particles.length !== velocities.length ||
            particles.length !== pBest.length
        ) {
            throw new Error(
                'particles, velocities, and pBest ' +
                'must have the same length.'
            );
        }

        const updatedVelocity =
            particles.map((particle, i) => {


                if (
                    particle.length !== velocities[i].length ||
                    particle.length !== pBest[i].length ||
                    particle.length !== gBest.length
                ) {
                    throw new Error(
                        `Particle ${i}, velocity, pBest, and ` +
                        `gBest chromosome lengths must match.`
                    );
                }


                return particle.map(
                    (positionGene, j) => {

                        const velocityGene =
                            velocities[i][j];

                        const pBestGene =
                            pBest[i][j];

                        const gBestGene =
                            gBest[j];


                        if (
                            !Array.isArray(positionGene) ||
                            !Array.isArray(velocityGene) ||
                            !Array.isArray(pBestGene) ||
                            !Array.isArray(gBestGene) ||
                            positionGene.length < 4 ||
                            velocityGene.length < 4 ||
                            pBestGene.length < 4 ||
                            gBestGene.length < 4
                        ) {
                            throw new Error(
                                `Invalid gene structure at ` +
                                `particle ${i}, gene ${j}.`
                            );
                        }


                        const newVelocityGene =
                            [...velocityGene];

                        for (let z = 2; z < 4; z++) {

                            const r1 = Math.random();
                            const r2 = Math.random();


                            newVelocityGene[z] =

                                this.w *
                                velocityGene[z]

                                +

                                this.c1 *
                                r1 *
                                (
                                    pBestGene[z] -
                                    positionGene[z]
                                )

                                +

                                this.c2 *
                                r2 *
                                (
                                    gBestGene[z] -
                                    positionGene[z]
                                );
                        }


                        return newVelocityGene;
                    }
                );
            });
        
        const updatedPosition =
            particles.map((particle, i) =>

                particle.map(
                    (positionGene, j) => {

                        const newPositionGene =
                            [...positionGene];


                        for (let z = 2; z < 4; z++) {

                            newPositionGene[z] =

                                positionGene[z] +

                                updatedVelocity[i][j][z];
                        }


                        return newPositionGene;
                    }
                )
            );


        return {

            velocities:
                updatedVelocity,

            positions:
                updatedPosition
        };
    }

    updatepBestgBest(
        pBest,
        gBest,
        particles
    ) {

        if (
            particles.length !== pBest.length
        ) {
            throw new Error(
                'particles and pBest must have ' +
                'the same length.'
            );
        }

        const discreteParticles =
            this.mapIntoInteger(
                this.deepClone(particles)
            );


        const qualities =
            this.quality(discreteParticles);


        const pBestQuality =
            this.quality(pBest);


        const gBestQuality =
            this.quality([gBest])[0];


        if (
            qualities.length !== particles.length ||
            pBestQuality.length !== pBest.length
        ) {
            throw new Error(
                'quality() returned an unexpected ' +
                'number of fitness values.'
            );
        }

        const updatedpBest =
            pBest.map(
                (personalBest, i) => {

                    if (
                        qualities[i] <
                        pBestQuality[i]
                    ) {

                        pBestQuality[i] =
                            qualities[i];


                        return this.deepClone(
                            discreteParticles[i]
                        );
                    }


                    return this.deepClone(
                        personalBest
                    );
                }
            );

        let bestIndex = 0;


        for (
            let i = 1;
            i < pBestQuality.length;
            i++
        ) {

            if (
                pBestQuality[i] <
                pBestQuality[bestIndex]
            ) {
                bestIndex = i;
            }
        }

        const newgBest =

            pBestQuality[bestIndex] <
            gBestQuality

                ? this.deepClone(
                    updatedpBest[bestIndex]
                )

                : this.deepClone(
                    gBest
                );


        return {

            pBest:
                updatedpBest,

            gBest:
                newgBest
        };
    }

    run(
        iniSols =
            this.initialSolutions(
                this.numParticles
            ),

        itr =
            this.iteration
    ) {

        const startTime =
            performance.now();

        if (
            !Number.isInteger(
                this.numParticles
            ) ||
            this.numParticles <= 0
        ) {
            throw new Error(
                'populationSize must be a ' +
                'positive integer.'
            );
        }


        if (
            !Number.isInteger(itr) ||
            itr < 0
        ) {
            throw new Error(
                'iteration must be a ' +
                'non-negative integer.'
            );
        }

        let particles =
            this.deepClone(
                Array.isArray(iniSols)
                    ? iniSols
                    : []
            );

        if (
            particles.length >
            this.numParticles
        ) {

            particles =
                particles.slice(
                    0,
                    this.numParticles
                );
        }

        while (
            particles.length <
            this.numParticles
        ) {

            const generated =
                this.initialSolutions(1);


            if (
                !Array.isArray(generated) ||
                generated.length === 0
            ) {
                throw new Error(
                    'initialSolutions(1) did not ' +
                    'return a valid particle.'
                );
            }


            particles.push(
                this.deepClone(
                    generated[0]
                )
            );
        }


        if (
            particles.length === 0
        ) {
            throw new Error(
                'PSO requires at least one particle.'
            );
        }

        const initialDiscreteParticles =
            this.mapIntoInteger(
                this.deepClone(particles)
            );


        const qualities =
            this.quality(
                initialDiscreteParticles
            );


        if (
            qualities.length !==
            particles.length
        ) {
            throw new Error(
                'quality() returned an unexpected ' +
                'number of fitness values.'
            );
        }

        let bestIndex = 0;


        for (
            let i = 1;
            i < qualities.length;
            i++
        ) {

            if (
                qualities[i] <
                qualities[bestIndex]
            ) {
                bestIndex = i;
            }
        }

        let pBest =
            this.deepClone(
                initialDiscreteParticles
            );

        let gBest =
            this.deepClone(
                pBest[bestIndex]
            );

        let velocities =
            this.initialVelocity(
                particles
            );

        for (
            let i = 0;
            i < itr;
            i++
        ) {

            const updatedVP =
                this.updateVelocityPosition(

                    particles,
                    velocities,
                    pBest,
                    gBest
                );

            velocities =
                updatedVP.velocities;

            particles =
                updatedVP.positions;

            const updatedBests =
                this.updatepBestgBest(

                    pBest,
                    gBest,
                    particles
                );


            pBest =
                updatedBests.pBest;


            gBest =
                updatedBests.gBest;
        }

        const bestSolution =
            this.mapIntoInteger(
                [
                    this.deepClone(
                        gBest
                    )
                ]
            )[0];


        const bestFitness =
            this.quality(
                [bestSolution]
            )[0];


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    bestSolution
                ),

            runtime:
                exeTime,

            fitness:
                bestFitness,

            bestParticle:
                bestSolution,

            particles:
                this.mapIntoInteger(
                    this.deepClone(
                        particles
                    )
                ),

            solution:
                bestSolution,

            pBest:
                this.mapIntoInteger(
                    this.deepClone(
                        pBest
                    )
                ),

            perServiceAnalysis:
                this.perServiceAnalysis(
                    bestSolution,
                    "PSO-per-service"
                )
        };
    }
}

class differentialEvolution extends solutionOperation {

    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);

        const config = sysAlgoConfig;

        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];
        this.componentConnections =
            config.ans['componentConnections'];
        this.infraConnections =
            config.ans['infraConnections'];

        this.ans = config.ans;

        this.numSolutions =
            config.ans['configsDE']['populationSize'];

        this.crossoverRate =
            config.ans['configsDE']['crossoverRate'];

        this.F =
            config.ans['configsDE']['F'];

        this.iteration =
            config.ans['configsDE']['iteration'];
    }

    deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    validatePopulationStructure(solutions) {

        if (
            !Array.isArray(solutions) ||
            solutions.length === 0
        ) {
            throw new Error(
                'DE requires a non-empty population.'
            );
        }


        const chromosomeLength =
            solutions[0].length;


        if (chromosomeLength === 0) {
            throw new Error(
                'DE chromosomes must contain at least one gene.'
            );
        }


        for (
            let i = 0;
            i < solutions.length;
            i++
        ) {

            const solution =
                solutions[i];


            if (
                !Array.isArray(solution) ||
                solution.length !== chromosomeLength
            ) {
                throw new Error(
                    `Solution ${i} does not have ` +
                    `the expected chromosome length.`
                );
            }


            for (
                let j = 0;
                j < chromosomeLength;
                j++
            ) {

                const gene =
                    solution[j];


                if (
                    !Array.isArray(gene) ||
                    gene.length < 4
                ) {
                    throw new Error(
                        `Invalid gene ${j} ` +
                        `in solution ${i}.`
                    );
                }

                if (
                    gene[0] !== solutions[0][j][0] ||
                    gene[1] !== solutions[0][j][1]
                ) {
                    throw new Error(
                        `Chromosome ordering mismatch at ` +
                        `solution ${i}, gene ${j}. ` +
                        `All DE solutions must use the same ` +
                        `service/component ordering.`
                    );
                }
            }
        }
    }

    mutantVector(solutions) {

        this.validatePopulationStructure(
            solutions
        );

        if (solutions.length < 4) {

            throw new Error(
                'DE/rand/1 requires at least 4 solutions ' +
                'so that r1, r2, and r3 can be distinct ' +
                'from each other and from the target solution.'
            );
        }

        const mutants =
            this.deepClone(
                solutions
            );


        for (
            let i = 0;
            i < solutions.length;
            i++
        ) {

            const candidateIndices = [];


            for (
                let index = 0;
                index < solutions.length;
                index++
            ) {

                if (index !== i) {
                    candidateIndices.push(
                        index
                    );
                }
            }


            this.shuffleArray(
                candidateIndices
            );

            const [r1, r2, r3] =
                candidateIndices.slice(0, 3);


            for (
                let j = 0;
                j < solutions[i].length;
                j++
            ) {

                mutants[i][j][2] =

                    solutions[r1][j][2]

                    +

                    this.F *
                    (
                        solutions[r2][j][2] -
                        solutions[r3][j][2]
                    );



                mutants[i][j][3] =

                    solutions[r1][j][3]

                    +

                    this.F *
                    (
                        solutions[r2][j][3] -
                        solutions[r3][j][3]
                    );
            }
        }

        return mutants;
    }

    shuffleArray(array) {

        for (
            let i = array.length - 1;
            i > 0;
            i--
        ) {

            const j =
                Math.floor(
                    Math.random() * (i + 1)
                );


            [
                array[i],
                array[j]
            ] = [
                array[j],
                array[i]
            ];
        }


        return array;
    }

    trialVector(
        solutions,
        mutantVectors
    ) {

        this.validatePopulationStructure(
            solutions
        );

        this.validatePopulationStructure(
            mutantVectors
        );


        if (
            solutions.length !==
            mutantVectors.length
        ) {
            throw new Error(
                'solutions and mutantVectors must ' +
                'have the same population size.'
            );
        }

        const numberOfGenes =
            solutions[0].length;

        const numberOfMutableDimensions =
            numberOfGenes * 2;


        const trials =
            solutions.map(
                (solution, i) => {

                    const trial =
                        this.deepClone(
                            solution
                        );

                    const forcedDimension =
                        Math.floor(
                            Math.random() *
                            numberOfMutableDimensions
                        );


                    let dimensionIndex = 0;


                    for (
                        let j = 0;
                        j < numberOfGenes;
                        j++
                    ) {

                        for (
                            let z = 2;
                            z < 4;
                            z++
                        ) {

                            if (
                                dimensionIndex ===
                                    forcedDimension

                                ||

                                Math.random() <
                                    this.crossoverRate
                            ) {

                                trial[j][z] =
                                    mutantVectors[i][j][z];
                            }


                            dimensionIndex++;
                        }
                    }


                    return trial;
                }
            );


        return this.mapIntoInteger(
            this.deepClone(
                trials
            )
        );
    }

    selection(
        solutions,
        trialVectors
    ) {

        if (
            solutions.length !==
            trialVectors.length
        ) {
            throw new Error(
                'solutions and trialVectors must ' +
                'have the same length.'
            );
        }


        const fitnessPopulation =
            this.quality(
                solutions
            );


        const fitnessTrial =
            this.quality(
                trialVectors
            );


        if (
            fitnessPopulation.length !==
                solutions.length

            ||

            fitnessTrial.length !==
                trialVectors.length
        ) {
            throw new Error(
                'quality() returned an unexpected ' +
                'number of fitness values.'
            );
        }

        return solutions.map(
            (solution, i) => {


                if (
                    fitnessTrial[i] <
                    fitnessPopulation[i]
                ) {

                    return this.deepClone(
                        trialVectors[i]
                    );
                }


                return this.deepClone(
                    solution
                );
            }
        );
    }

    run(
        iniSols =
            this.initialSolutions(
                this.numSolutions
            ),

        itr =
            this.iteration
    ) {

        const startTime =
            performance.now();
        if (
            !Number.isInteger(
                this.numSolutions
            )

            ||

            this.numSolutions < 4
        ) {

            throw new Error(
                'DE populationSize must be ' +
                'an integer of at least 4.'
            );
        }


        if (
            !Number.isInteger(itr) ||
            itr < 0
        ) {

            throw new Error(
                'DE iteration count must be ' +
                'a non-negative integer.'
            );
        }


        if (
            typeof this.crossoverRate !==
                'number'

            ||

            this.crossoverRate < 0

            ||

            this.crossoverRate > 1
        ) {

            throw new Error(
                'DE crossoverRate must be ' +
                'between 0 and 1.'
            );
        }


        if (
            typeof this.F !== 'number' ||
            !Number.isFinite(this.F) ||
            this.F < 0
        ) {

            throw new Error(
                'DE mutation factor F must be ' +
                'a finite non-negative number.'
            );
        }

        let solutions =
            this.deepClone(
                Array.isArray(iniSols)
                    ? iniSols
                    : []
            );

        if (
            solutions.length >
            this.numSolutions
        ) {

            solutions =
                solutions.slice(
                    0,
                    this.numSolutions
                );
        }

        while (
            solutions.length <
            this.numSolutions
        ) {

            const generated =
                this.initialSolutions(1);


            if (
                !Array.isArray(generated) ||
                generated.length === 0
            ) {

                throw new Error(
                    'initialSolutions(1) did not ' +
                    'return a valid solution.'
                );
            }


            solutions.push(
                this.deepClone(
                    generated[0]
                )
            );
        }


        this.validatePopulationStructure(
            solutions
        );

        const bestConv = [];
        const medianConv = [];
        const worstConv = [];

        for (
            let i = 0;
            i < itr;
            i++
        ) {

            const mutants =
                this.mutantVector(
                    solutions
                );

            const trials =
                this.trialVector(
                    solutions,
                    mutants
                );

            solutions =
                this.selection(
                    solutions,
                    trials
                );

            const fitness =
                this.quality(
                    solutions
                );


            const qualityInfo =
                this.solutionsQualitySort(
                    solutions,
                    fitness
                );


            bestConv.push(
                qualityInfo['bestQuality']
            );

            medianConv.push(
                qualityInfo['medianQuality']
            );

            worstConv.push(
                qualityInfo['worstQuality']
            );
        }

        const finalFitness =
            this.quality(
                solutions
            );


        const bestSol =
            this.solutionsQualitySort(
                solutions,
                finalFitness
            );


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    bestSol['bestSolution']
                ),

            runtime:
                exeTime,

            fitness:
                bestSol['bestQuality'],

            bestSolution:
                bestSol['bestSolution'],

            solutions:
                solutions,

            solution:
                bestSol['bestSolution'],

            convergence: {

                best:
                    bestConv,

                median:
                    medianConv,

                worst:
                    worstConv
            },

            perServiceAnalysis:
                this.perServiceAnalysis(
                    bestSol['bestSolution'],
                    'DE-per-service'
                )
        };
    }
}

class simulatedAnnealing extends solutionOperation {

    constructor(sysAlgoConfig) {
        super(sysAlgoConfig);

        const config = sysAlgoConfig;

        this.ans = config.ans;

        this.computingNodes = config.ans['computingNodes'];
        this.services = config.ans['services'];
        this.users = config.ans['usersNodes'];
        this.helpers = config.ans['helperNodes'];

        this.componentConnections =
            config.ans['componentConnections'];

        this.infraConnections =
            config.ans['infraConnections'];

        this.termination =
            config.ans['configsSA']['termination'];

        this.temperature =
            config.ans['configsSA']['temperature'];

        this.alpha =
            config.ans['configsSA']['alpha'];

        this.rate =
            config.ans['configsSA']['rate'];

    }

    deepClone(value) {
        return JSON.parse(
            JSON.stringify(value)
        );
    }

    randomIntInclusive(min, max) {

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
            min +
            Math.floor(
                Math.random() *
                (max - min + 1)
            )
        );
    }

    randomDifferentInt(current, min, max) {

        if (max <= min) {
            return min;
        }

        const currentInt =
            Number(current);

        if (
            !Number.isInteger(currentInt) ||
            currentInt < min ||
            currentInt > max
        ) {
            return this.randomIntInclusive(
                min,
                max
            );
        }

        const value =
            this.randomIntInclusive(
                min,
                max - 1
            );

        return value >= currentInt
            ? value + 1
            : value;
    }

    getVersionCountForGene(gene) {

        const serviceIndex =
            Number(gene[0]) - 1;

        const componentIndex =
            Number(gene[1]) - 1;


        const component =
            this.services
                ?. [serviceIndex]
                ?.components
                ?. [componentIndex];


        if (
            !component ||
            !Array.isArray(component.versions) ||
            component.versions.length === 0
        ) {
            throw new Error(
                `Cannot resolve versions for ` +
                `service ${gene[0]}, ` +
                `component ${gene[1]}.`
            );
        }


        return component.versions.length;
    }

    getNumPlacementNodes() {

        return (
            this.computingNodes.length +
            this.users.length +
            this.helpers.length
        );
    }

    initialSolution() {

        return this.healing(
            this.validation(
                this.randomSolution()
            )
        );
    }

    neighborSolution(solution) {

        const neighboringSolution =
            this.deepClone(solution);

        const numNodes =
            this.getNumPlacementNodes();


        if (numNodes < 1) {
            throw new Error(
                'At least one placement node is required.'
            );
        }


        let changed = false;

        for (
            let i = 0;
            i < neighboringSolution.length;
            i++
        ) {

            const gene =
                neighboringSolution[i];


            if (
                !Array.isArray(gene) ||
                gene.length < 4
            ) {
                throw new Error(
                    `Invalid chromosome gene at index ${i}.`
                );
            }


            const numVersions =
                this.getVersionCountForGene(
                    gene
                );


            if (
                Math.random() < this.rate &&
                numVersions > 1
            ) {

                gene[2] =
                    this.randomDifferentInt(
                        gene[2],
                        1,
                        numVersions
                    );

                changed = true;
            }

            if (
                Math.random() < this.rate &&
                numNodes > 1
            ) {

                gene[3] =
                    this.randomDifferentInt(
                        gene[3],
                        1,
                        numNodes
                    );

                changed = true;
            }
        }

        if (!changed) {

            const mutableDimensions = [];


            for (
                let i = 0;
                i < neighboringSolution.length;
                i++
            ) {

                const gene =
                    neighboringSolution[i];

                const numVersions =
                    this.getVersionCountForGene(
                        gene
                    );


                if (numVersions > 1) {

                    mutableDimensions.push({
                        geneIndex: i,
                        field: 2,
                        max: numVersions
                    });
                }


                if (numNodes > 1) {

                    mutableDimensions.push({
                        geneIndex: i,
                        field: 3,
                        max: numNodes
                    });
                }
            }


            if (
                mutableDimensions.length > 0
            ) {

                const choice =
                    mutableDimensions[
                        this.randomIntInclusive(
                            0,
                            mutableDimensions.length - 1
                        )
                    ];


                const gene =
                    neighboringSolution[
                        choice.geneIndex
                    ];


                gene[choice.field] =
                    this.randomDifferentInt(
                        gene[choice.field],
                        1,
                        choice.max
                    );
            }
        }

        return this.healing(
            this.validation(
                neighboringSolution
            )
        );
    }

    neighborSolution2(solution) {
        return this.neighborSolution(
            solution
        );
    }

    run(
        iniSol = this.initialSolution()
    ) {

        const startTime =
            performance.now();

        if (!(this.temperature > 0)) {

            throw new Error(
                'SA temperature must be greater than 0.'
            );
        }


        if (!(this.termination > 0)) {

            throw new Error(
                'SA termination temperature must be greater than 0.'
            );
        }


        if (
            !(
                this.alpha > 0 &&
                this.alpha < 1
            )
        ) {

            throw new Error(
                'SA alpha must satisfy 0 < alpha < 1.'
            );
        }


        if (
            !(
                this.rate >= 0 &&
                this.rate <= 1
            )
        ) {

            throw new Error(
                'SA mutation rate must be between 0 and 1.'
            );
        }

        let temperature =
            this.temperature;
        let solution =
            this.healing(
                this.validation(
                    this.deepClone(
                        iniSol
                    )
                )
            );

        let currentFitness =
            this.quality(
                [solution]
            )[0];

        let bestCost =
            currentFitness;

        let bestSolution =
            this.deepClone(
                solution
            );

        while (
            temperature >
            this.termination
        ) {

            const neighbor =
                this.neighborSolution(
                    solution
                );


            const neighborFitness =
                this.quality(
                    [neighbor]
                )[0];

            const diff =
                neighborFitness -
                currentFitness;

            if (
                diff < 0

                ||

                Math.random() <
                    Math.exp(
                        -diff /
                        temperature
                    )
            ) {

                solution =
                    neighbor;

                currentFitness =
                    neighborFitness;

                if (
                    currentFitness <
                    bestCost
                ) {

                    bestCost =
                        currentFitness;

                    bestSolution =
                        this.deepClone(
                            solution
                        );
                }
            }

            temperature *=
                this.alpha;
        }


        const exeTime =
            performance.now() -
            startTime;


        return {

            servicePlacementResults:
                this.solutionAnalyser(
                    bestSolution
                ),

            runtime:
                exeTime,

            fitness:
                bestCost,

            bestSolution:
                bestSolution,

            solution:
                bestSolution,

            perServiceAnalysis:
                this.perServiceAnalysis(
                    bestSolution,
                    'SA-per-service'
                )
        };
    }
}

module.exports = {
    solutionOperation,
    taskContinuationAffinity,
    leastRequiredCPU,
    mostDataSize,
    mostPowerful,
    leastPowerful,
    mostReliablity,
    NCO,
    geneticAlgorithm,
    particleSwarmOptimization,
    differentialEvolution,
    simulatedAnnealing,
}