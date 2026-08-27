const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');




function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  
  return JSON.parse(result);
}

class CandidateInfeasibleError extends Error {

    constructor(message) {

        super(message);
        this.name =
            'CandidateInfeasibleError';
    }
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

        this._cachedResponseTimeUpperBound =
            undefined;

        this._cachedInfraIndexMap =
            undefined;

        this._topologyAndLinksValidated =
            false;
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


    _validateProbability(
        value,
        label
    ) {

        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1
        ) {

            throw new Error(

                `${label} must be a finite ` +
                `number in [0, 1]; ` +
                `received ${String(value)}`
            );
        }


        return value;
    }


    _validateNonNegativeNumber(
        value,
        label
    ) {

        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0
        ) {

            throw new Error(
                `${label} must be a finite ` +
                `non-negative number; ` +
                `received ${String(value)}`
            );
        }


        return value;
    }


    _validatePositiveNumber(
        value,
        label
    ) {

        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value <= 0
        ) {

            throw new Error(
                `${label} must be a finite ` +
                `positive number; ` +
                `received ${String(value)}`
            );
        }


        return value;
    }


    _dataSize(
        characteristics,
        label = 'dataSize'
    ) {

        return this._validateNonNegativeNumber(
            characteristics?.dataSize,
            label
        );
    }


    _validateTopologyAndLinks() {

        if (this._topologyAndLinksValidated) {
            return;
        }


        if (!Array.isArray(this.services)) {
            throw new Error(
                'services must be an array.'
            );
        }


        let componentCount = null;

        for (const service of this.services) {

            if (!Array.isArray(service?.components)) {
                throw new Error(
                    `Service ${service?.serviceID} components must be an array.`
                );
            }


            if (componentCount === null) {
                componentCount =
                    service.components.length;
            }
            else if (
                service.components.length !==
                    componentCount
            ) {
                throw new Error(
                    'All services must have the same number of components ' +
                    'when using one shared componentConnections matrix.'
                );
            }
        }


        componentCount ??= 0;


        if (!Array.isArray(this.componentConnections)) {
            throw new Error(
                'componentConnections must be an array.'
            );
        }


        if (
            this.componentConnections.length !==
            componentCount
        ) {
            throw new Error(
                `componentConnections must be a ${componentCount}x${componentCount} ` +
                `matrix for the current services; received ` +
                `${this.componentConnections.length} row(s).`
            );
        }


        for (
            let rowIndex = 0;
            rowIndex < componentCount;
            rowIndex++
        ) {

            const row =
                this.componentConnections[rowIndex];

            if (
                !Array.isArray(row) ||
                row.length !== componentCount
            ) {
                throw new Error(
                    `componentConnections row ${rowIndex} must contain ` +
                    `${componentCount} entries.`
                );
            }


            for (
                let columnIndex = 0;
                columnIndex < componentCount;
                columnIndex++
            ) {

                const value =
                    row[columnIndex];

                if (value !== 0 && value !== 1) {
                    throw new Error(
                        `componentConnections[${rowIndex}][${columnIndex}] ` +
                        `must be 0 or 1; received ${String(value)}.`
                    );
                }


                if (
                    rowIndex === columnIndex &&
                    value !== 0
                ) {
                    throw new Error(
                        `componentConnections diagonal entry ` +
                        `[${rowIndex}][${columnIndex}] must be 0.`
                    );
                }
            }
        }


        const allNodes =
            this._allNodes();

        if (
            allNodes.length === 0 &&
            this.infraConnections.length === 0
        ) {
            this._topologyAndLinksValidated = true;
            return;
        }


        // Reuse the authoritative nodeID -> matrix-row validation.
        // This validates that infraConnections is square and that its
        // row count matches the configured infrastructure node order.
        this._getInfraIndexMap();


        for (
            let sourceIndex = 0;
            sourceIndex < this.infraConnections.length;
            sourceIndex++
        ) {

            for (
                let destinationIndex = 0;
                destinationIndex < this.infraConnections.length;
                destinationIndex++
            ) {

                const link =
                    this.infraConnections[sourceIndex]
                        [destinationIndex];

                if (
                    !Array.isArray(link) ||
                    link.length < 2
                ) {
                    throw new Error(
                        `infraConnections[${sourceIndex}][${destinationIndex}] ` +
                        `must be a link array [bandwidth, delay, ...].`
                    );
                }


                this._validateNonNegativeNumber(
                    link[0],
                    `Infrastructure bandwidth at ` +
                    `${sourceIndex} -> ${destinationIndex}`
                );


                this._validateNonNegativeNumber(
                    link[1],
                    `Infrastructure propagation delay at ` +
                    `${sourceIndex} -> ${destinationIndex}`
                );


                if (link.length >= 3) {
                    this._validateNonNegativeNumber(
                        link[2],
                        `Infrastructure base bandwidth at ` +
                        `${sourceIndex} -> ${destinationIndex}`
                    );
                }
            }
        }


        this._topologyAndLinksValidated =
            true;
    }


    _nodeReliability(node) {

        const characteristics =
            node?.characteristics ?? {};


        if (
            characteristics
                .reliabilityScore !==
            undefined
        ) {

            return this._validateProbability(

                characteristics
                    .reliabilityScore,

                `Node ${node?.nodeID} ` +
                `reliabilityScore`
            );
        }


        if (
            characteristics
                .reliability !==
            undefined
        ) {

            return this._validateProbability(

                characteristics
                    .reliability,

                `Node ${node?.nodeID} ` +
                `reliability`
            );
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
            reliability ===
            undefined
        ) {

            throw new Error(

                `Version ` +
                `${version?.versionNumber} ` +
                `has no reliabilityScore`
            );
        }


        return this._validateProbability(

            reliability,

            `Version ` +
            `${version?.versionNumber} ` +
            `reliabilityScore`
        );
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


        // Preserve the original continuous value.
        // Flooring before nearest-value selection creates a
        // systematic downward bias (for example, 1.9 -> 1
        // instead of the true nearest allowed value 2).


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


        return this._validateNonNegativeNumber(
            value,
            `${key} resource`
        );
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


        // Validate every value before mutating the capacity object so a
        // malformed resource cannot leave a partially consumed node.
        const nodeMemory =
            this._resource(
                nodeCharacteristics,
                'memory'
            );

        const nodeCPU =
            this._resource(
                nodeCharacteristics,
                'cpu'
            );

        const versionMemory =
            this._resource(
                versionCharacteristics,
                'memory'
            );

        const versionCPU =
            this._resource(
                versionCharacteristics,
                'cpu'
            );

        const usesDisk =
            nodeCharacteristics.disk !== undefined ||
            versionCharacteristics.disk !== undefined;

        const nodeDisk =
            usesDisk
                ? this._resource(
                    nodeCharacteristics,
                    'disk'
                )
                : 0;

        const versionDisk =
            usesDisk
                ? this._resource(
                    versionCharacteristics,
                    'disk'
                )
                : 0;


        nodeCharacteristics.memory =
            nodeMemory -
            versionMemory;

        nodeCharacteristics.cpu =
            nodeCPU -
            versionCPU;

        if (usesDisk) {
            nodeCharacteristics.disk =
                nodeDisk -
                versionDisk;
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

    _infraNodeOrder() {

        const explicitOrder =
            this.ans?.infraNodeOrder;


        if (
            Array.isArray(explicitOrder) &&
            explicitOrder.length > 0
        ) {

            return explicitOrder.map(
                entry =>
                    (
                        entry !== null &&
                        typeof entry === 'object'
                    )
                        ? entry.nodeID
                        : entry
            );
        }


        return this._allNodes().map(
            node => node.nodeID
        );
    }


    _getInfraIndexMap() {

        if (this._cachedInfraIndexMap) {
            return this._cachedInfraIndexMap;
        }


        if (
            !Array.isArray(this.infraConnections) ||
            this.infraConnections.length === 0
        ) {

            throw new Error(
                'infraConnections is empty'
            );
        }


        const matrixSize =
            this.infraConnections.length;


        for (
            let row = 0;
            row < matrixSize;
            row++
        ) {

            if (
                !Array.isArray(
                    this.infraConnections[row]
                ) ||
                this.infraConnections[row].length !==
                    matrixSize
            ) {

                throw new Error(
                    'infraConnections must be a square matrix.'
                );
            }
        }


        const nodeOrder =
            this._infraNodeOrder();


        if (
            nodeOrder.length !==
            matrixSize
        ) {

            throw new Error(
                `infraConnections has ${matrixSize} rows, ` +
                `but the infrastructure node order has ` +
                `${nodeOrder.length} node IDs.`
            );
        }


        const indexMap =
            new Map();


        for (
            let index = 0;
            index < nodeOrder.length;
            index++
        ) {

            const orderedNodeID =
                nodeOrder[index];


            if (
                orderedNodeID === undefined ||
                orderedNodeID === null
            ) {

                throw new Error(
                    `Missing nodeID for infraConnections row ${index}.`
                );
            }


            if (indexMap.has(orderedNodeID)) {

                throw new Error(
                    `Duplicate nodeID ${orderedNodeID} ` +
                    `in infrastructure node order.`
                );
            }


            indexMap.set(
                orderedNodeID,
                index
            );
        }


        this._cachedInfraIndexMap =
            indexMap;


        return indexMap;
    }


    _infraIndex(nodeID) {

        const indexMap =
            this._getInfraIndexMap();


        if (indexMap.has(nodeID)) {
            return indexMap.get(nodeID);
        }


        throw new Error(
            `Cannot map nodeID ${nodeID} ` +
            `to infraConnections. ` +
            `Expected one of: ` +
            `${Array.from(indexMap.keys()).join(', ')}`
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

                    throw new CandidateInfeasibleError(

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

                throw new CandidateInfeasibleError(

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

    finalizeFeasibleSolution(
        solution,
        solverName = 'solver'
    ) {

        if (
            !this._isComplete(
                solution
            )
        ) {

            throw new Error(
                `${solverName} produced an incomplete placement. ` +
                `No metrics will be returned for an invalid solution.`
            );
        }


        const finalized =
            this.healing(
                solution
            );


        if (
            !this._isResourceFeasible(
                finalized
            )
        ) {

            throw new Error(
                `${solverName} produced a placement that is not ` +
                `resource-feasible after healing.`
            );
        }


        return finalized;
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

        let lastFeasibilityError;


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

            catch (error) {

                if (
                    error instanceof
                    CandidateInfeasibleError
                ) {

                    lastFeasibilityError =
                        error;

                    continue;
                }


                throw error;
            }
        }


        if (
            solutions.length !==
            solutionSize
        ) {

            const lastReason =
                lastFeasibilityError
                    ? ` Last feasibility rejection: ` +
                      `${lastFeasibilityError.message}`
                    : '';


            throw new Error(

                `Could not generate ` +
                `${solutionSize} ` +
                `feasible initial solutions ` +
                `after ${attempts} attempts.` +
                lastReason
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

    infraReliability(
        solution,
        services = this.services
    ) {

        if (
            services.length ===
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
            of services
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
            services.length
        );
    }

    serviceReliability(
        solution,
        services = this.services
    ) {

        if (
            services.length ===
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
            of services
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
            services.length
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

        this._validateTopologyAndLinks();


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
                    ).fill(0)
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
                    let j = 0;
                    j < placements.length;
                    j++
                ) {

                    if (j === i) {
                        continue;
                    }


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



    transmissionDelay(solution) {

        this._validateTopologyAndLinks();


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
                    this._dataSize(
                        sourceVersion.characteristics,
                        `Service ${service.serviceID}, ` +
                        `component ${sourceComponentObject.componentID} dataSize`
                    );


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
                    let j = 0;
                    j < placements.length;
                    j++
                ) {

                    if (j === i) {
                        continue;
                    }


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
                        this._validatePositiveNumber(
                            link[0],
                            `Bandwidth on ${source[3]} -> ${destination[3]}`
                        );


                    const propagationDelay =
                        this._validateNonNegativeNumber(
                            link[1],
                            `Propagation delay on ${source[3]} -> ${destination[3]}`
                        );


                    const activeFlows =

                        Math.max(
                            1,
                            connections[
                                sourceNode
                            ][
                                destinationNode
                            ]
                        );


                    const availableBandwidth =

                        baseBandwidth /
                        activeFlows;


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

    calculateAll(
        solution,
        services = this.services
    ) {

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
                solution,
                services
            );


        const ServiceReliability =
            this.serviceReliability(
                solution,
                services
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

    solutionAnalyser(
        solution,
        services = this.services
    ) {

        const cost =
            this.calculateAll(
                solution,
                services
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

    _responseTimeUpperBoundCached() {

        if (
            this._cachedResponseTimeUpperBound ===
            undefined
        ) {

            this._cachedResponseTimeUpperBound =
                this.responseTimeUpperBound();


            if (
                !Number.isFinite(
                    this._cachedResponseTimeUpperBound
                ) ||

                this._cachedResponseTimeUpperBound <=
                    0
            ) {

                throw new Error(

                    `Invalid response-time upper bound: ` +
                    `${this._cachedResponseTimeUpperBound}`
                );
            }
        }


        return this
            ._cachedResponseTimeUpperBound;
    }


    quality(solutions) {

        const maxResponseTime =
            this._responseTimeUpperBoundCached();


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
                    serviceSolution,
                    [service]
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



    _categoricalValuesForGene(
        gene,
        dimension
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


        if (dimension === 2) {

            const versionIDs =
                (
                    component.versions ??
                    []
                ).map(
                    version =>
                        version.versionNumber
                );


            if (versionIDs.length === 0) {
                throw new Error(
                    `Service ${gene[0]}, component ${gene[1]} ` +
                    `has no version IDs to encode.`
                );
            }


            return versionIDs;
        }


        if (dimension === 3) {

            const nodeIDs =
                this._allNodes()
                    .map(
                        node =>
                            node.nodeID
                    );


            if (nodeIDs.length === 0) {
                throw new Error(
                    'No node IDs are available for categorical encoding.'
                );
            }


            return nodeIDs;
        }


        throw new Error(
            `Unsupported categorical gene dimension ${dimension}.`
        );
    }

    _categoricalIndex(
        value,
        allowed,
        label
    ) {

        const numericValue =
            Number(value);


        const index =
            allowed.findIndex(
                candidate =>
                    Number(candidate) ===
                    numericValue
            );


        if (index < 0) {
            throw new Error(
                `${label} ${value} is not an allowed categorical value.`
            );
        }


        return index;
    }

    _oneHotVector(
        index,
        length
    ) {

        const vector =
            new Array(length)
                .fill(0);


        vector[index] = 1;


        return vector;
    }

    _encodeCategoricalSolutions(
        solutions
    ) {

        const encoded =
            this.deepClone(
                solutions ?? []
            );


        for (
            const solution
            of encoded
        ) {

            for (
                const gene
                of solution
            ) {

                if (
                    !Array.isArray(gene) ||
                    gene.length < 4
                ) {
                    throw new Error(
                        'Invalid gene while encoding categorical solution.'
                    );
                }


                const versionIDs =
                    this._categoricalValuesForGene(
                        gene,
                        2
                    );


                const nodeIDs =
                    this._categoricalValuesForGene(
                        gene,
                        3
                    );


                const versionIndex =
                    this._categoricalIndex(
                        gene[2],
                        versionIDs,
                        'Version ID'
                    );


                const nodeIndex =
                    this._categoricalIndex(
                        gene[3],
                        nodeIDs,
                        'Node ID'
                    );


                gene[2] =
                    this._oneHotVector(
                        versionIndex,
                        versionIDs.length
                    );


                gene[3] =
                    this._oneHotVector(
                        nodeIndex,
                        nodeIDs.length
                    );
            }
        }


        return encoded;
    }

    _decodeCategoricalVector(
        vector,
        allowed,
        label
    ) {

        if (
            !Array.isArray(vector) ||
            vector.length !== allowed.length ||
            vector.length === 0
        ) {

            throw new Error(
                `${label} categorical vector has an invalid length.`
            );
        }


        let bestIndex = 0;
        let bestValue =
            Number(vector[0]);


        if (
            !Number.isFinite(
                bestValue
            )
        ) {
            throw new Error(
                `${label} categorical vector contains a non-finite value.`
            );
        }


        for (
            let i = 1;
            i < vector.length;
            i++
        ) {

            const value =
                Number(
                    vector[i]
                );


            if (
                !Number.isFinite(
                    value
                )
            ) {
                throw new Error(
                    `${label} categorical vector contains a non-finite value.`
                );
            }


            if (
                value >
                bestValue
            ) {

                bestIndex = i;
                bestValue = value;
            }
        }


        return allowed[
            bestIndex
        ];
    }

    _decodeCategoricalSolutions(
        solutions
    ) {

        const decoded =
            this.deepClone(
                solutions ?? []
            );


        const result = [];


        for (
            const solution
            of decoded
        ) {

            for (
                const gene
                of solution
            ) {

                if (
                    !Array.isArray(gene) ||
                    gene.length < 4
                ) {
                    throw new Error(
                        'Invalid gene while decoding categorical solution.'
                    );
                }


                const versionIDs =
                    this._categoricalValuesForGene(
                        gene,
                        2
                    );


                const nodeIDs =
                    this._categoricalValuesForGene(
                        gene,
                        3
                    );


                gene[2] =
                    this._decodeCategoricalVector(
                        gene[2],
                        versionIDs,
                        'Version'
                    );


                gene[3] =
                    this._decodeCategoricalVector(
                        gene[3],
                        nodeIDs,
                        'Node'
                    );
            }


            const validatedSolution =
                this.validation(
                    solution
                );

            try {

                result.push(
                    this.healing(
                        validatedSolution
                    )
                );
            }
            catch (error) {

                if (
                    error instanceof
                    CandidateInfeasibleError
                ) {

                    // Infeasible PSO/DE search candidates are normal.
                    // Keep the validated discrete candidate so quality()
                    // can assign +Infinity instead of aborting the run.
                    result.push(
                        validatedSolution
                    );

                    continue;
                }

                throw error;
            }
        }


        return result;
    }

    responseTimeUpperBound() {

        this._validateTopologyAndLinks();


        const nodes =
            this._allNodes();


        const positiveNodeCPUs =
            nodes
                .map(
                    node =>
                        this._resource(
                            node.characteristics,
                            'cpu'
                        )
                )
                .filter(
                    cpu =>
                        cpu > 0
                );


        if (
            positiveNodeCPUs.length ===
            0
        ) {

            throw new Error(
                'Cannot normalize response time: no node has positive CPU capacity.'
            );
        }


        const minNodeCPU =
            Math.min(
                ...positiveNodeCPUs
            );


        let executionUpperBound =
            0;


        let totalPossibleFlows =
            0;


        const serviceEdges =
            [];


        for (
            const service
            of this.services
        ) {

            const components =
                service.components ??
                [];


            for (
                let i = 0;
                i < components.length;
                i++
            ) {

                const versions =
                    components[i]
                        .versions ??
                        [];


                if (
                    versions.length ===
                    0
                ) {

                    throw new Error(

                        `Cannot normalize response time: ` +
                        `service ${service.serviceID}, ` +
                        `component ${components[i].componentID} ` +
                        `has no versions.`
                    );
                }


                const maxCPU =
                    Math.max(
                        ...versions.map(
                            version =>
                                this._resource(
                                    version.characteristics,
                                    'cpu'
                                )
                        )
                    );


                executionUpperBound +=
                    maxCPU /
                    minNodeCPU;


                for (
                    let j = 0;
                    j < components.length;
                    j++
                ) {

                    if (j === i) {
                        continue;
                    }


                    if (
                        !this
                            .componentConnections
                            ?.[i]
                            ?.[j]
                    ) {

                        continue;
                    }


                    const maxDataSize =
                        Math.max(
                            ...versions.map(
                                version => {

                                    return this._dataSize(
                                        version?.characteristics,
                                        `Service ${service.serviceID}, ` +
                                        `component ${components[i].componentID} dataSize`
                                    );
                                }
                            )
                        );


                    serviceEdges.push(
                        {
                            maxDataSize
                        }
                    );


                    totalPossibleFlows++;
                }
            }
        }


        let transmissionUpperBound =
            0;


        if (
            totalPossibleFlows >
            0
        ) {

            const positiveBandwidths =
                [];


            let maxPropagationDelay =
                0;


            for (
                let i = 0;
                i < this.infraConnections.length;
                i++
            ) {

                const row =
                    this.infraConnections[i] ??
                        [];


                for (
                    let j = 0;
                    j < row.length;
                    j++
                ) {

                    if (i === j) {

                        continue;
                    }


                    const link =
                        row[j];


                    if (
                        !Array.isArray(link) ||
                        link.length < 2
                    ) {

                        throw new Error(
                            `Missing infrastructure link for matrix entry ${i} -> ${j}`
                        );
                    }


                    const bandwidth =
                        this._validateNonNegativeNumber(
                            link[0],
                            `Infrastructure bandwidth at ${i} -> ${j}`
                        );


                    const propagationDelay =
                        this._validateNonNegativeNumber(
                            link[1],
                            `Infrastructure propagation delay at ${i} -> ${j}`
                        );


                    if (bandwidth > 0) {

                        positiveBandwidths.push(
                            bandwidth
                        );
                    }


                    if (
                        propagationDelay >
                            maxPropagationDelay
                    ) {

                        maxPropagationDelay =
                            propagationDelay;
                    }
                }
            }


            if (
                positiveBandwidths.length ===
                0
            ) {

                throw new Error(
                    'Cannot normalize response time: service traffic exists but no positive link bandwidth is available.'
                );
            }


            const minPositiveBandwidth =
                Math.min(
                    ...positiveBandwidths
                );


            for (
                const edge
                of serviceEdges
            ) {

                transmissionUpperBound +=

                    (
                        edge.maxDataSize *
                        totalPossibleFlows
                    )

                    /

                    minPositiveBandwidth

                    +

                    maxPropagationDelay;
            }
        }


        const upperBound =
            executionUpperBound +
            transmissionUpperBound;


        /*
         * providerDelay() and codecDelay() currently return zero.
         * If either model becomes non-zero, its scenario-level upper
         * bound must be added here as well.
         */

        return (
            upperBound >
                0

                ?

                upperBound

                :

                1
        );
    }


    /*
     * Backward-compatible name retained for callers outside this file.
     * It no longer runs TCA; normalization is scenario-derived.
     */


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
        this._ncoNormalization = null;
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
                () => Array(matrixSize).fill(0)
            );

        /*
         * Preserve the bandwidth state that existed when NCO started.
         * infraConnections[i][j][0] is the current/available bandwidth,
         * while [2] is the preserved original/base capacity. NCO must share
         * the current value rather than restoring the base capacity, because
         * [0] may already include contention or other live reductions.
         */
        const initialCurrentBW =
            copyBW.map(
                row =>
                    Array.isArray(row)
                        ? row.map(
                            link =>
                                Array.isArray(link)
                                    ? link[0]
                                    : undefined
                        )
                        : []
            );


        return {
            copyBW,
            dv,
            initialCurrentBW
        };
    }

    getInfraIndex(nodeID) {

        return this._infraIndex(
            nodeID
        );
    }
    bwd(
        solution,
        service,
        currentComponentIndex,
        dv,
        copyBW,
        initialCurrentBW
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


        const applyDirectionalFlow = (
            sourceNodeID,
            sourceNodeIndex,
            destinationNodeID,
            destinationNodeIndex
        ) => {

            if (sourceNodeID === destinationNodeID) {
                return;
            }


            dv[sourceNodeIndex][destinationNodeIndex]++;

            const link =
                copyBW[sourceNodeIndex]
                    ?. [destinationNodeIndex];


            if (
                !Array.isArray(link) ||
                link.length < 3
            ) {
                throw new Error(
                    `NCO missing infrastructure link ` +
                    `${sourceNodeID} -> ${destinationNodeID}.`
                );
            }


            this._validatePositiveNumber(
                link[0],
                `NCO current bandwidth on ${sourceNodeID} -> ${destinationNodeID}`
            );


            this._validateNonNegativeNumber(
                link[1],
                `NCO propagation delay on ${sourceNodeID} -> ${destinationNodeID}`
            );


            // [2] remains a validated original/base-capacity field, but it
            // must not be used to rebuild the live [0] value.
            this._validatePositiveNumber(
                link[2],
                `NCO base bandwidth on ${sourceNodeID} -> ${destinationNodeID}`
            );


            const initialCurrentBandwidth =
                this._validatePositiveNumber(
                    initialCurrentBW
                        ?. [sourceNodeIndex]
                        ?. [destinationNodeIndex],
                    `NCO initial current bandwidth on ${sourceNodeID} -> ${destinationNodeID}`
                );


            copyBW[sourceNodeIndex]
                [destinationNodeIndex][0] =

                initialCurrentBandwidth /
                Math.max(
                    1,
                    dv[sourceNodeIndex]
                        [destinationNodeIndex]
                );
        };


        for (
            let previousComponentIndex = 0;
            previousComponentIndex < currentComponentIndex;
            previousComponentIndex++
        ) {

            const forwardConnected =
                this.componentConnections
                    ?. [previousComponentIndex]
                    ?. [currentComponentIndex] === 1;

            const reverseConnected =
                this.componentConnections
                    ?. [currentComponentIndex]
                    ?. [previousComponentIndex] === 1;


            if (
                !forwardConnected &&
                !reverseConnected
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

            const previousNodeIndex =
                this.getInfraIndex(
                    previousNodeID
                );


            // Account for each actual directed service edge independently.
            // This keeps the old behavior for forward-only DAGs while also
            // supporting reverse and bidirectional component dependencies.
            if (forwardConnected) {
                applyDirectionalFlow(
                    previousNodeID,
                    previousNodeIndex,
                    currentNodeID,
                    currentNodeIndex
                );
            }


            if (reverseConnected) {
                applyDirectionalFlow(
                    currentNodeID,
                    currentNodeIndex,
                    previousNodeID,
                    previousNodeIndex
                );
            }
        }
    }

    averageBandwidthForNode(
        copyBW,
        nodeID
    ) {

        const targetIndex =
            this.getInfraIndex(
                nodeID
            );


        let total = 0;
        let count = 0;


        for (
            const sourceNode
            of this._allNodes()
        ) {

            let sourceIndex;

            try {
                sourceIndex =
                    this.getInfraIndex(
                        sourceNode['nodeID']
                    );
            }
            catch {
                continue;
            }


            // A node's diagonal entry is a local/self link, not a
            // usable network path to another node. Including it can
            // dominate the average because the simulator assigns a
            // deliberately very large self-bandwidth.
            if (sourceIndex === targetIndex) {
                continue;
            }


            const bw =
                copyBW
                    ?. [sourceIndex]
                    ?. [targetIndex]
                    ?. [0];


            if (bw === undefined) {
                continue;
            }


            total +=
                this._validateNonNegativeNumber(
                    bw,
                    `NCO current bandwidth into node ${nodeID}`
                );
            count++;
        }


        return (
            count > 0
                ? total / count
                : undefined
        );
    }


    aveBW(copyBW) {

        return this.computingNodes.map(
            node =>
                this.averageBandwidthForNode(
                    copyBW,
                    node['nodeID']
                )
        );
    }

    _normalizationScale(
        values,
        label
    ) {

        const numericValues =
            values.map(Number);


        if (
            numericValues.some(
                value =>
                    !Number.isFinite(value) ||
                    value < 0
            )
        ) {
            throw new Error(
                `NCO normalization received an invalid ${label} value.`
            );
        }


        const maximum =
            Math.max(
                0,
                ...numericValues
            );


        // A feature that is zero everywhere carries no discriminatory
        // information. Use scale 1 so its normalized value remains zero
        // without introducing division by zero.
        return maximum > 0
            ? maximum
            : 1;
    }

    _validateNormalizationProfile(
        profile
    ) {

        const requiredKeys = [
            'nodeMemory',
            'nodeCPU',
            'versionMemory',
            'versionCPU',
            'dataSize',
            'bandwidth'
        ];


        if (
            !profile ||
            typeof profile !== 'object' ||
            Array.isArray(profile)
        ) {
            throw new Error(
                'NCO normalization profile must be an object.'
            );
        }


        const normalized = {};


        for (const key of requiredKeys) {

            const value =
                Number(
                    profile[key]
                );


            if (
                !Number.isFinite(value) ||
                value <= 0
            ) {
                throw new Error(
                    `Invalid NCO normalization scale ${key}: ${profile[key]}`
                );
            }


            normalized[key] =
                value;
        }


        return normalized;
    }

    _deriveNormalizationProfile() {

        const allNodes =
            this._allNodes();


        const versions = [];


        for (const service of this.services ?? []) {
            for (const component of service.components ?? []) {
                for (const version of component.versions ?? []) {
                    versions.push(
                        version.characteristics ?? {}
                    );
                }
            }
        }


        if (allNodes.length === 0) {
            throw new Error(
                'NCO cannot derive normalization without nodes.'
            );
        }


        if (versions.length === 0) {
            throw new Error(
                'NCO cannot derive normalization without component versions.'
            );
        }


        const externalBandwidths = [];


        for (
            let sourceIndex = 0;
            sourceIndex < this.infraConnections.length;
            sourceIndex++
        ) {
            for (
                let targetIndex = 0;
                targetIndex < this.infraConnections.length;
                targetIndex++
            ) {

                if (sourceIndex === targetIndex) {
                    continue;
                }


                const link =
                    this.infraConnections
                        ?. [sourceIndex]
                        ?. [targetIndex];


                if (
                    !Array.isArray(link) ||
                    link.length < 3
                ) {
                    throw new Error(
                        `NCO requires a three-field infrastructure link ` +
                        `at ${sourceIndex} -> ${targetIndex}.`
                    );
                }


                const bandwidth =
                    this._validateNonNegativeNumber(
                        link[2],
                        `NCO base bandwidth at ${sourceIndex} -> ${targetIndex}`
                    );


                this._validateNonNegativeNumber(
                    link[1],
                    `NCO propagation delay at ${sourceIndex} -> ${targetIndex}`
                );


                externalBandwidths.push(
                    bandwidth
                );
            }
        }


        return {
            nodeMemory:
                this._normalizationScale(
                    allNodes.map(
                        node =>
                            this._resource(
                                node.characteristics,
                                'memory'
                            )
                    ),
                    'node memory'
                ),

            nodeCPU:
                this._normalizationScale(
                    allNodes.map(
                        node =>
                            this._resource(
                                node.characteristics,
                                'cpu'
                            )
                    ),
                    'node CPU'
                ),

            versionMemory:
                this._normalizationScale(
                    versions.map(
                        version =>
                            this._resource(
                                version,
                                'memory'
                            )
                    ),
                    'version memory'
                ),

            versionCPU:
                this._normalizationScale(
                    versions.map(
                        version =>
                            this._resource(
                                version,
                                'cpu'
                            )
                    ),
                    'version CPU'
                ),

            dataSize:
                this._normalizationScale(
                    versions.map(
                        version =>
                            this._dataSize(
                                version,
                                'NCO version dataSize'
                            )
                    ),
                    'version data size'
                ),

            bandwidth:
                this._normalizationScale(
                    externalBandwidths,
                    'external link bandwidth'
                )
        };
    }

    normalizationProfile() {

        if (this._ncoNormalization) {
            return this._ncoNormalization;
        }


        const configured =
            this.ans?.ncoNormalization;


        this._ncoNormalization =
            configured !== undefined
                ? this._validateNormalizationProfile(
                    configured
                )
                : this._deriveNormalizationProfile();


        return this._ncoNormalization;
    }

    formula(
        bandwidth,
        node,
        version,
        w,
        normalization
    ) {

        const f1 =
            this._resource(
                node['characteristics'],
                'memory'
            ) /
            normalization.nodeMemory;

        const f2 =
            this._resource(
                node['characteristics'],
                'cpu'
            ) /
            normalization.nodeCPU;

        const f3 =
            this._nodeReliability(
                node
            );

        const f4 =
            this._resource(
                version,
                'memory'
            ) /
            normalization.versionMemory;

        const f5 =
            this._resource(
                version,
                'cpu'
            ) /
            normalization.versionCPU;

        const f6 =
            this._dataSize(
                version,
                'NCO version dataSize'
            ) /
            normalization.dataSize;

        const f7 =
            this._validateProbability(

                version['reliabilityScore'],

                'NCO version reliabilityScore'
            );

        const f8 =

            (
                typeof bandwidth === 'number' &&
                Number.isFinite(bandwidth)
            )

                ? bandwidth /
                    normalization.bandwidth

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

            w[7] * (f8 ** w[15]);


        return value;
    }


    test(w) {

        this.validateWeights(w);

        this._validateTopologyAndLinks();


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

        const normalization =
            this.normalizationProfile();


        /*
         * One shared mutable capacity state is used for every placement
         * node, including users and helpers.  This is important because
         * endpoint components are mandatory placements, not post-processing
         * corrections.
         */
        const capacity =
            this._capacityState();


        const computingNodesFreeCapacity =
            this.computingNodes.map(
                node =>
                    capacity.get(
                        node['nodeID']
                    )
            );


        const {
            copyBW,
            dv,
            initialCurrentBW
        } = this.createBandwidthState();


        let solution = [];


        let bandwidth =
            this.aveBW(
                copyBW
            );


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


                /*
                 * Endpoint components are part of the NCO decision itself.
                 * The first component must run on service.userID and the last
                 * component must run on service.helperID.  NCO therefore
                 * chooses only the version for an endpoint component; it does
                 * not first optimize a computing-node placement and move it
                 * later in validation().
                 */
                const endpoint =
                    this._endpoint(
                        service,
                        component
                    );


                if (
                    endpoint !==
                    undefined
                ) {

                    const endpointNode =
                        capacity.get(
                            endpoint
                        );


                    if (!endpointNode) {
                        throw new Error(
                            `NCO required endpoint node ` +
                            `${endpoint} does not exist.`
                        );
                    }


                    const endpointBandwidth =
                        this.averageBandwidthForNode(
                            copyBW,
                            endpoint
                        );


                    let bestVersionIndex = -1;
                    let bestValue = -Infinity;
                    let resourceFeasibleVersions = 0;
                    let nonFiniteScores = 0;


                    for (
                        let versionIndex = 0;
                        versionIndex <
                            versions.length;
                        versionIndex++
                    ) {

                        const versionObject =
                            versions[
                                versionIndex
                            ];


                        if (
                            !this._fits(
                                endpointNode,
                                versionObject
                            )
                        ) {
                            continue;
                        }


                        resourceFeasibleVersions++;


                        const value =
                            this.formula(

                                endpointBandwidth,

                                endpointNode,

                                versionObject[
                                    'characteristics'
                                ],

                                w,

                                normalization
                            );


                        if (
                            !Number.isFinite(value)
                        ) {
                            nonFiniteScores++;
                            continue;
                        }


                        if (
                            value > bestValue
                        ) {

                            bestValue =
                                value;

                            bestVersionIndex =
                                versionIndex;
                        }
                    }


                    if (
                        bestVersionIndex ===
                        -1
                    ) {

                        if (
                            resourceFeasibleVersions === 0
                        ) {
                            throw new Error(
                                `NCO cannot place service ` +
                                `${service['serviceID']}, component ` +
                                `${component['componentID']} on required ` +
                                `endpoint ${endpoint}: no version fits CPU/memory/disk capacity.`
                            );
                        }


                        throw new Error(
                            `NCO found ${resourceFeasibleVersions} resource-feasible ` +
                            `version(s) for service ${service['serviceID']}, ` +
                            `component ${component['componentID']} on endpoint ${endpoint}, ` +
                            `but ${nonFiniteScores} produced a non-finite NCO score. ` +
                            `Check NCO feature normalization and weights.`
                        );
                    }


                    const chosenVersion =
                        versions[
                            bestVersionIndex
                        ];


                    solution.push([

                        service['serviceID'],

                        component['componentID'],

                        chosenVersion[
                            'versionNumber'
                        ],

                        endpoint
                    ]);


                    this._consume(
                        endpointNode,
                        chosenVersion
                    );


                    this.bwd(

                        solution,

                        service,

                        componentIndex,

                        dv,

                        copyBW,

                        initialCurrentBW
                    );


                    bandwidth =
                        this.aveBW(
                            copyBW
                        );


                    continue;
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


                    if (!node) {
                        continue;
                    }


                    for (
                        let versionIndex = 0;
                        versionIndex <
                            versions.length;
                        versionIndex++
                    ) {

                        const versionObject =
                            versions[
                                versionIndex
                            ];


                        const version =
                            versionObject[
                                'characteristics'
                            ];


                        if (
                            !this._fits(
                                node,
                                versionObject
                            )
                        ) {
                            continue;
                        }


                        const value =
                            this.formula(

                                bandwidth[nodeIndex],

                                node,

                                version,

                                w,

                                normalization
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

                    throw new Error(
                        `NCO cannot place service ` +
                        `${service['serviceID']}, component ` +
                        `${component['componentID']}: no feasible ` +
                        `computing-node/version pair exists.`
                    );
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


                this._consume(
                    chosenNode,
                    chosenVersion
                );


                this.bwd(

                    solution,

                    service,

                    componentIndex,

                    dv,

                    copyBW,

                    initialCurrentBW
                );


                bandwidth =
                    this.aveBW(
                        copyBW
                    );
            }
        }


        /*
         * This should now be a verification/repair safety net rather than a
         * step that changes NCO's endpoint node decisions.
         */
        solution =
            this.finalizeFeasibleSolution(
                solution,
                'NCO'
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

        const weightsPath =
            path.join(
                __dirname,
                `weights_${model_index}.txt`
            );

        const weights =
            readJSON(
                weightsPath
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
        return this._fits(
            node,
            version
        );
    }


    consumeMemory(node, version) {
        this._consume(
            node,
            version
        );
    }


    run() {

        const startTime =
            performance.now();

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);

        let solution = [];


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
            this.finalizeFeasibleSolution(
                solution,
                'TCA'
            );


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
        return this._fits(
            node,
            version
        );
    }


    consumeMemory(node, version) {
        this._consume(
            node,
            version
        );
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

        const startTime =
            performance.now();

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);

        let solution = [];



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
            this.finalizeFeasibleSolution(
                solution,
                'LRC'
            );


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
        return this._fits(
            node,
            version
        );
    }


    consumeMemory(node, version) {
        this._consume(
            node,
            version
        );
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

            const candidateDataSize =
                this._dataSize(
                    versions[i]['characteristics'],
                    `Component ${component['componentID']} ` +
                    `version ${versions[i]['versionNumber']} dataSize`
                );


            const bestDataSize =
                this._dataSize(
                    bestVersion['characteristics'],
                    `Component ${component['componentID']} ` +
                    `version ${bestVersion['versionNumber']} dataSize`
                );


            if (
                candidateDataSize >
                bestDataSize
            ) {

                bestVersion =
                    versions[i];
            }
        }


        return bestVersion;
    }


    run() {

        const startTime =
            performance.now();

        const userFreeCapacity =
            this.deepClone(this.users);

        const computingNodesFreeCapacity =
            this.deepClone(this.computingNodes);

        const helperFreeCapacity =
            this.deepClone(this.helpers);


        let solution = [];



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
            this.finalizeFeasibleSolution(
                solution,
                'MDS'
            );


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
        return this._fits(
            node,
            version
        );
    }


    consumeMemory(node, version) {
        this._consume(
            node,
            version
        );
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

        const startTime =
            performance.now();

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
            this.finalizeFeasibleSolution(
                solution,
                'MP'
            );


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
        return this._fits(
            node,
            version
        );
    }


    consumeMemory(node, version) {
        this._consume(
            node,
            version
        );
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

        const startTime =
            performance.now();

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
            this.finalizeFeasibleSolution(
                solution,
                'LP'
            );


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
        return this._fits(
            node,
            version
        );
    }


    consumeMemory(node, version) {
        this._consume(
            node,
            version
        );
    }

    getNodeReliability(node) {

        return this._nodeReliability(
            node
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
                this._versionReliability(
                    versions[i]
                ) >
                this._versionReliability(
                    bestVersion
                )
            ) {

                bestVersion =
                    versions[i];
            }
        }


        return bestVersion;
    }


    run() {

        const startTime =
            performance.now();

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
            this.finalizeFeasibleSolution(
                solution,
                'MR'
            );


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

        const gaConfig =
            config.ans?.configsGA;

        if (
            !gaConfig ||
            typeof gaConfig !== 'object' ||
            Array.isArray(gaConfig)
        ) {
            throw new Error(
                'configsGA must be an object.'
            );
        }

        this.cProbability = gaConfig.crossoverRate;
        this.mProbability = gaConfig.mutationRate;
        this.numPopulation = gaConfig.populationSize;
        this.tournamentSize = gaConfig.selectionSize;
        this.iteration = gaConfig.iteration;
    }

    validateConfiguration(iterationCount) {

        if (
            !Number.isInteger(this.numPopulation) ||
            this.numPopulation <= 0
        ) {
            throw new Error(
                'GA populationSize must be a positive integer.'
            );
        }

        if (
            !Number.isInteger(iterationCount) ||
            iterationCount < 0
        ) {
            throw new Error(
                'GA iteration must be a non-negative integer.'
            );
        }

        if (
            typeof this.cProbability !== 'number' ||
            !Number.isFinite(this.cProbability) ||
            this.cProbability < 0 ||
            this.cProbability > 1
        ) {
            throw new Error(
                'GA crossoverRate must be a finite number between 0 and 1.'
            );
        }

        if (
            typeof this.mProbability !== 'number' ||
            !Number.isFinite(this.mProbability) ||
            this.mProbability < 0 ||
            this.mProbability > 1
        ) {
            throw new Error(
                'GA mutationRate must be a finite number between 0 and 1.'
            );
        }

        if (
            !Number.isInteger(this.tournamentSize) ||
            this.tournamentSize <= 0
        ) {
            throw new Error(
                'GA selectionSize must be a positive integer.'
            );
        }
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

    mutation(population) {

        const mutationPopulation =
            this.deepClone(population);

        const computingNodeIDs =
            (this.computingNodes ?? []).map(
                node =>
                    node.nodeID
            );

        if (computingNodeIDs.length === 0) {
            throw new Error(
                'At least one computing node is required for mutation.'
            );
        }

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
                    (component.versions ?? []).map(
                        version =>
                            version.versionNumber
                    );

                if (versionIDs.length === 0) {
                    throw new Error(
                        `Service ${service.serviceID}, ` +
                        `component ${component.componentID} ` +
                        `has no versions.`
                    );
                }

                gene[2] =
                    this._randomChoice(
                        versionIDs
                    );

                gene[3] =
                    this._randomChoice(
                        computingNodeIDs
                    );
            }
        }

        return mutationPopulation;
    }

    healingSolution(population) {

        return population.map(individual => {

            const candidate =
                this.deepClone(individual);

            const validatedCandidate =
                this.validation(candidate);

            try {

                return this.healing(
                    validatedCandidate
                );
            }
            catch (error) {

                if (
                    error instanceof
                    CandidateInfeasibleError
                ) {

                    // An infeasible offspring is a normal GA search
                    // outcome. Preserve it for quality(), which assigns
                    // +Infinity, instead of aborting the generation.
                    return validatedCandidate;
                }

                throw error;
            }
        });
    }



    run(
        iniSols = undefined,
        itr = this.iteration
    ) {

        const startTime = performance.now();

        this.validateConfiguration(
            itr
        );

        if (iniSols === undefined) {
            iniSols =
                this.initialSolutions(
                    this.numPopulation
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

        const psoConfig =
            config.ans?.configsPSO;

        if (
            !psoConfig ||
            typeof psoConfig !== 'object' ||
            Array.isArray(psoConfig)
        ) {
            throw new Error(
                'configsPSO must be an object.'
            );
        }

        this.numParticles =
            psoConfig.populationSize;

        this.w =
            psoConfig.w;

        this.c1 =
            psoConfig.c1;

        this.c2 =
            psoConfig.c2;

        this.iteration =
            psoConfig.iteration;
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
                            gene.length < 4 ||
                            !Array.isArray(gene[2]) ||
                            !Array.isArray(gene[3])
                        ) {
                            throw new Error(
                                `Invalid categorical gene ${geneIndex} ` +
                                `in particle ${particleIndex}.`
                            );
                        }


                        return [
                            gene[0],
                            gene[1],
                            new Array(
                                gene[2].length
                            ).fill(0),
                            new Array(
                                gene[3].length
                            ).fill(0)
                        ];
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
            particles.map(
                (particle, i) => {

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
                                [
                                    positionGene[0],
                                    positionGene[1],
                                    [],
                                    []
                                ];


                            for (
                                let z = 2;
                                z < 4;
                                z++
                            ) {

                                if (
                                    !Array.isArray(positionGene[z]) ||
                                    !Array.isArray(velocityGene[z]) ||
                                    !Array.isArray(pBestGene[z]) ||
                                    !Array.isArray(gBestGene[z]) ||
                                    positionGene[z].length !== velocityGene[z].length ||
                                    positionGene[z].length !== pBestGene[z].length ||
                                    positionGene[z].length !== gBestGene[z].length
                                ) {
                                    throw new Error(
                                        `Categorical vector length mismatch at ` +
                                        `particle ${i}, gene ${j}, dimension ${z}.`
                                    );
                                }


                                newVelocityGene[z] =
                                    positionGene[z].map(
                                        (
                                            positionValue,
                                            k
                                        ) => {

                                            const r1 =
                                                Math.random();

                                            const r2 =
                                                Math.random();


                                            return (
                                                this.w *
                                                velocityGene[z][k]

                                                +

                                                this.c1 *
                                                r1 *
                                                (
                                                    pBestGene[z][k] -
                                                    positionValue
                                                )

                                                +

                                                this.c2 *
                                                r2 *
                                                (
                                                    gBestGene[z][k] -
                                                    positionValue
                                                )
                                            );
                                        }
                                    );
                            }


                            return newVelocityGene;
                        }
                    );
                }
            );


        const updatedPosition =
            particles.map(
                (particle, i) =>

                    particle.map(
                        (positionGene, j) => {

                            const newPositionGene =
                                [
                                    positionGene[0],
                                    positionGene[1],
                                    [],
                                    []
                                ];


                            for (
                                let z = 2;
                                z < 4;
                                z++
                            ) {

                                newPositionGene[z] =
                                    positionGene[z].map(
                                        (
                                            positionValue,
                                            k
                                        ) =>

                                            positionValue +

                                            updatedVelocity[i][j][z][k]
                                    );
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
            this._decodeCategoricalSolutions(
                this.deepClone(
                    particles
                )
            );


        const discretePBest =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    pBest
                )
            );


        const discreteGBest =
            this._decodeCategoricalSolutions(
                [
                    this.deepClone(
                        gBest
                    )
                ]
            )[0];


        const qualities =
            this.quality(
                discreteParticles
            );


        const pBestQuality =
            this.quality(
                discretePBest
            );


        const gBestQuality =
            this.quality(
                [
                    discreteGBest
                ]
            )[0];


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
                            particles[i]
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
        iniSols = undefined,

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


        if (
            typeof this.w !== 'number' ||
            !Number.isFinite(this.w) ||
            this.w < 0
        ) {
            throw new Error(
                'PSO w must be a finite non-negative number.'
            );
        }


        if (
            typeof this.c1 !== 'number' ||
            !Number.isFinite(this.c1) ||
            this.c1 < 0
        ) {
            throw new Error(
                'PSO c1 must be a finite non-negative number.'
            );
        }


        if (
            typeof this.c2 !== 'number' ||
            !Number.isFinite(this.c2) ||
            this.c2 < 0
        ) {
            throw new Error(
                'PSO c2 must be a finite non-negative number.'
            );
        }


        if (iniSols === undefined) {
            iniSols =
                this.initialSolutions(
                    this.numParticles
                );
        }


        let initialParticles =
            this.deepClone(
                Array.isArray(iniSols)
                    ? iniSols
                    : []
            );


        if (
            initialParticles.length >
            this.numParticles
        ) {

            initialParticles =
                initialParticles.slice(
                    0,
                    this.numParticles
                );
        }


        while (
            initialParticles.length <
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


            initialParticles.push(
                this.deepClone(
                    generated[0]
                )
            );
        }


        if (
            initialParticles.length === 0
        ) {
            throw new Error(
                'PSO requires at least one particle.'
            );
        }


        /*
         * PSO operates in one-hot latent categorical space.
         * Version/node IDs are labels only; their numeric values
         * never enter the velocity or position equations.
         */
        let particles =
            this._encodeCategoricalSolutions(
                initialParticles
            );


        const initialDiscreteParticles =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    particles
                )
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
                particles
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
            this._decodeCategoricalSolutions(
                [
                    this.deepClone(
                        gBest
                    )
                ]
            )[0];


        const bestFitness =
            this.quality(
                [
                    bestSolution
                ]
            )[0];


        const finalParticles =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    particles
                )
            );


        const finalPBest =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    pBest
                )
            );


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
                finalParticles,

            solution:
                bestSolution,

            pBest:
                finalPBest,

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

        const deConfig =
            config.ans?.configsDE;

        if (
            !deConfig ||
            typeof deConfig !== 'object' ||
            Array.isArray(deConfig)
        ) {
            throw new Error(
                'configsDE must be an object.'
            );
        }

        this.numSolutions =
            deConfig.populationSize;

        this.crossoverRate =
            deConfig.crossoverRate;

        this.F =
            deConfig.F;

        this.iteration =
            deConfig.iteration;
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
                candidateIndices.slice(
                    0,
                    3
                );


            for (
                let j = 0;
                j < solutions[i].length;
                j++
            ) {

                for (
                    let z = 2;
                    z < 4;
                    z++
                ) {

                    const base =
                        solutions[r1][j][z];

                    const diffA =
                        solutions[r2][j][z];

                    const diffB =
                        solutions[r3][j][z];


                    if (
                        !Array.isArray(base) ||
                        !Array.isArray(diffA) ||
                        !Array.isArray(diffB) ||
                        base.length !== diffA.length ||
                        base.length !== diffB.length
                    ) {
                        throw new Error(
                            `DE categorical vector mismatch at ` +
                            `solution ${i}, gene ${j}, dimension ${z}.`
                        );
                    }


                    mutants[i][j][z] =
                        base.map(
                            (
                                value,
                                k
                            ) =>

                                value

                                +

                                this.F *
                                (
                                    diffA[k] -
                                    diffB[k]
                                )
                        );
                }
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


        const numberOfMutableDimensions =
            solutions[0]
                .reduce(
                    (
                        total,
                        gene
                    ) =>

                        total +
                        gene[2].length +
                        gene[3].length,

                    0
                );


        if (
            numberOfMutableDimensions <= 0
        ) {
            throw new Error(
                'DE has no categorical dimensions to mutate.'
            );
        }


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
                        j < solution.length;
                        j++
                    ) {

                        for (
                            let z = 2;
                            z < 4;
                            z++
                        ) {

                            if (
                                !Array.isArray(
                                    solution[j][z]
                                ) ||
                                !Array.isArray(
                                    mutantVectors[i][j][z]
                                ) ||
                                solution[j][z].length !==
                                    mutantVectors[i][j][z].length
                            ) {
                                throw new Error(
                                    `DE categorical vector mismatch at ` +
                                    `solution ${i}, gene ${j}, dimension ${z}.`
                                );
                            }


                            for (
                                let k = 0;
                                k < solution[j][z].length;
                                k++
                            ) {

                                if (
                                    dimensionIndex ===
                                        forcedDimension

                                    ||

                                    Math.random() <
                                        this.crossoverRate
                                ) {

                                    trial[j][z][k] =
                                        mutantVectors[i][j][z][k];
                                }


                                dimensionIndex++;
                            }
                        }
                    }


                    return trial;
                }
            );


        return trials;
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


        const discretePopulation =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    solutions
                )
            );


        const discreteTrials =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    trialVectors
                )
            );


        const fitnessPopulation =
            this.quality(
                discretePopulation
            );


        const fitnessTrial =
            this.quality(
                discreteTrials
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
        iniSols = undefined,

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

            !Number.isFinite(
                this.crossoverRate
            )

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


        if (iniSols === undefined) {
            iniSols =
                this.initialSolutions(
                    this.numSolutions
                );
        }


        let initialSolutions =
            this.deepClone(
                Array.isArray(iniSols)
                    ? iniSols
                    : []
            );


        if (
            initialSolutions.length >
            this.numSolutions
        ) {

            initialSolutions =
                initialSolutions.slice(
                    0,
                    this.numSolutions
                );
        }


        while (
            initialSolutions.length <
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


            initialSolutions.push(
                this.deepClone(
                    generated[0]
                )
            );
        }


        this.validatePopulationStructure(
            initialSolutions
        );


        /*
         * DE operates in one-hot latent categorical space.
         * Numeric version/node IDs are labels only and are
         * never added, subtracted, or scaled by F.
         */
        let solutions =
            this._encodeCategoricalSolutions(
                initialSolutions
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


            const discreteSolutions =
                this._decodeCategoricalSolutions(
                    this.deepClone(
                        solutions
                    )
                );


            const fitness =
                this.quality(
                    discreteSolutions
                );


            const qualityInfo =
                this.solutionsQualitySort(
                    discreteSolutions,
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


        const finalSolutions =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    solutions
                )
            );


        const finalFitness =
            this.quality(
                finalSolutions
            );


        const bestSol =
            this.solutionsQualitySort(
                finalSolutions,
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
                finalSolutions,

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

        const saConfig =
            config.ans?.configsSA;

        if (
            !saConfig ||
            typeof saConfig !== 'object' ||
            Array.isArray(saConfig)
        ) {
            throw new Error(
                'configsSA must be an object.'
            );
        }

        this.termination =
            saConfig.termination;

        this.temperature =
            saConfig.temperature;

        this.alpha =
            saConfig.alpha;

        this.rate =
            saConfig.rate;

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

    getVersionIDsForGene(gene) {

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


        if (versionIDs.length === 0) {
            throw new Error(
                `Cannot resolve versions for ` +
                `service ${gene[0]}, ` +
                `component ${gene[1]}.`
            );
        }


        return versionIDs;
    }

    getPlacementNodeIDs() {

        const nodeIDs =
            this._allNodes().map(
                node =>
                    node.nodeID
            );


        if (nodeIDs.length === 0) {
            throw new Error(
                'At least one placement node is required.'
            );
        }


        return nodeIDs;
    }

    randomDifferentAllowed(
        current,
        allowed
    ) {

        if (
            !Array.isArray(allowed) ||
            allowed.length === 0
        ) {
            throw new Error(
                'At least one allowed value is required.'
            );
        }


        const alternatives =
            allowed.filter(
                value =>
                    value !== current
            );


        if (alternatives.length === 0) {
            return allowed[0];
        }


        return this._randomChoice(
            alternatives
        );
    }

    initialSolution() {

        const initial =
            this.initialSolutions(1);

        if (
            !Array.isArray(initial) ||
            initial.length === 0
        ) {

            throw new Error(
                'SA could not generate a feasible initial solution.'
            );
        }

        return initial[0];
    }

    neighborSolution(solution) {

        const neighboringSolution =
            this.deepClone(solution);

        const nodeIDs =
            this.getPlacementNodeIDs();


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


            const versionIDs =
                this.getVersionIDsForGene(
                    gene
                );


            if (
                Math.random() < this.rate &&
                versionIDs.length > 1
            ) {

                gene[2] =
                    this.randomDifferentAllowed(
                        gene[2],
                        versionIDs
                    );

                changed = true;
            }

            if (
                Math.random() < this.rate &&
                nodeIDs.length > 1
            ) {

                gene[3] =
                    this.randomDifferentAllowed(
                        gene[3],
                        nodeIDs
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

                const versionIDs =
                    this.getVersionIDsForGene(
                        gene
                    );


                if (versionIDs.length > 1) {

                    mutableDimensions.push({
                        geneIndex: i,
                        field: 2,
                        allowed: versionIDs
                    });
                }


                if (nodeIDs.length > 1) {

                    mutableDimensions.push({
                        geneIndex: i,
                        field: 3,
                        allowed: nodeIDs
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
                    this.randomDifferentAllowed(
                        gene[choice.field],
                        choice.allowed
                    );
            }
        }

        const validatedNeighbor =
            this.validation(
                neighboringSolution
            );

        try {

            return this.healing(
                validatedNeighbor
            );
        }
        catch (error) {

            if (
                error instanceof
                CandidateInfeasibleError
            ) {

                // An infeasible SA neighbor is simply rejected by the
                // fitness rule (+Infinity); it must not terminate SA.
                return validatedNeighbor;
            }

            throw error;
        }
    }



    run(
        iniSol = undefined
    ) {

        const startTime =
            performance.now();

        if (
            typeof this.temperature !== 'number' ||
            !Number.isFinite(this.temperature) ||
            this.temperature <= 0
        ) {

            throw new Error(
                'SA temperature must be a finite number greater than 0.'
            );
        }


        if (
            typeof this.termination !== 'number' ||
            !Number.isFinite(this.termination) ||
            this.termination <= 0
        ) {

            throw new Error(
                'SA termination temperature must be a finite number greater than 0.'
            );
        }


        if (
            typeof this.alpha !== 'number' ||
            !Number.isFinite(this.alpha) ||
            !(
                this.alpha > 0 &&
                this.alpha < 1
            )
        ) {

            throw new Error(
                'SA alpha must be a finite number satisfying 0 < alpha < 1.'
            );
        }


        if (
            typeof this.rate !== 'number' ||
            !Number.isFinite(this.rate) ||
            !(
                this.rate >= 0 &&
                this.rate <= 1
            )
        ) {

            throw new Error(
                'SA mutation rate must be a finite number between 0 and 1.'
            );
        }

        if (iniSol === undefined) {
            iniSol =
                this.initialSolution();
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