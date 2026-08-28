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


    _referenceExecutionWorkloadSeconds() {

        const value =
            Number(
                this.ans
                    ?.executionWorkloadSeconds ??
                1
            );


        return this._validatePositiveNumber(
            value,
            'executionWorkloadSeconds'
        );
    }


    _cpuWorkloadMI(
        version,
        label = 'CPU workload'
    ) {

        const explicitWorkload =
            version
                ?.characteristics
                ?.cpuWorkloadMI;


        if (
            explicitWorkload !==
            undefined
        ) {

            return this._validateNonNegativeNumber(
                explicitWorkload,
                `${label} [MI]`
            );
        }

        const cpuDemandMIPS =
            this._resource(
                version?.characteristics,
                'cpu'
            );


        return (
            cpuDemandMIPS *
            this._referenceExecutionWorkloadSeconds()
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

        if (components.length === 1) {

            return service.userID;
        }


        if (index === 0) {

            return service.userID;
        }


        if (
            index ===
            components.length - 1
        ) {

            return service.helperID;
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

    assertFeasibleSolution(
        solution,
        label = 'solution'
    ) {

        if (
            !this._isComplete(
                solution
            )
        ) {

            throw new Error(
                `${label} is incomplete, duplicated, or references an unknown service/component/version.`
            );
        }


        const capacity =
            this._capacityState();


        for (
            let index = 0;
            index < solution.length;
            index++
        ) {

            const gene =
                solution[index];


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

                throw new Error(
                    `${label} placement ${index} references unknown node ${gene[3]}.`
                );
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

                throw new Error(
                    `${label} placement ${index} violates the endpoint rule for ` +
                    `service ${service.serviceID}, component ${component.componentID}: ` +
                    `expected node ${endpoint}, received ${gene[3]}.`
                );
            }


            if (
                endpoint === undefined &&
                this._nodeType(
                    gene[3]
                ) !== 'computing'
            ) {

                throw new Error(
                    `${label} placement ${index} violates the computing-tier rule for ` +
                    `service ${service.serviceID}, component ${component.componentID}: ` +
                    `received node ${gene[3]}.`
                );
            }


            if (
                !this._compatible(
                    service,
                    gene[3]
                )
            ) {

                throw new Error(
                    `${label} placement ${index} uses incompatible node ${gene[3]} for ` +
                    `service ${service.serviceID}, component ${component.componentID}.`
                );
            }


            if (
                !this._fits(
                    node,
                    version
                )
            ) {

                const nc =
                    node.characteristics ?? {};

                const vc =
                    version.characteristics ?? {};

                throw new Error(
                    `${label} placement ${index} exceeds remaining resources on node ${gene[3]} ` +
                    `for service ${service.serviceID}, component ${component.componentID}, ` +
                    `version ${version.versionNumber}. ` +
                    `Remaining CPU/memory/disk=` +
                    `${String(nc.cpu)}/${String(nc.memory)}/${String(nc.disk ?? 0)}; ` +
                    `required=${String(vc.cpu)}/${String(vc.memory)}/${String(vc.disk ?? 0)}.`
                );
            }


            this._consume(
                node,
                version
            );
        }


        return true;
    }

    _isResourceFeasible(solution) {

        try {

            this.assertFeasibleSolution(
                solution
            );

            return true;
        }

        catch {

            return false;
        }
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
                this._nodeType(
                    gene[3]
                ) !== 'computing'
            ) {

                if (
                    computingNodeIDs.length ===
                        0
                ) {

                    throw new Error(
                        `Service ${service.serviceID}, component ${component.componentID} ` +
                        `requires computing-tier placement, but no computing nodes are available.`
                    );
                }


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


    _heuristicPlaceComponent({
        capacity,
        solution,
        service,
        component,
        solverName,
        versionComparator,
        nodeComparator,
        priority = 'version-first'
    }) {

        const versions = [
            ...(component.versions ?? [])
        ];

        if (versions.length === 0) {
            throw new Error(
                `${solverName}: component ${component.componentID} of service ` +
                `${service.serviceID} has no versions.`
            );
        }

        if (typeof versionComparator === 'function') {
            versions.sort(versionComparator);
        }

        const endpoint =
            this._endpoint(
                service,
                component
            );

        let nodes;

        if (endpoint !== undefined) {
            const endpointNode =
                capacity.get(endpoint);

            if (!endpointNode) {
                throw new CandidateInfeasibleError(
                    `${solverName} requires endpoint node ${endpoint} for service ` +
                    `${service.serviceID}, component ${component.componentID}, but that node does not exist.`
                );
            }

            nodes = [endpointNode];
        }
        else {
            nodes = this.computingNodes
                .map(node => capacity.get(node.nodeID))
                .filter(Boolean);

            if (nodes.length === 0) {
                throw new CandidateInfeasibleError(
                    `${solverName} cannot place service ${service.serviceID}, component ` +
                    `${component.componentID}: no computing nodes are available.`
                );
            }

            if (typeof nodeComparator === 'function') {
                nodes.sort(nodeComparator);
            }
        }

        const place = (node, version) => {
            if (!this._fits(node, version)) {
                return false;
            }

            solution.push([
                service.serviceID,
                component.componentID,
                version.versionNumber,
                node.nodeID
            ]);

            this._consume(
                node,
                version
            );

            return true;
        };

        if (priority === 'node-first') {
            for (const node of nodes) {
                for (const version of versions) {
                    if (place(node, version)) {
                        return;
                    }
                }
            }
        }
        else {
            for (const version of versions) {
                for (const node of nodes) {
                    if (place(node, version)) {
                        return;
                    }
                }
            }
        }

        throw new CandidateInfeasibleError(
            `${solverName} cannot place service ${service.serviceID}, component ` +
            `${component.componentID}: none of its ${versions.length} version(s) fits the ` +
            `${endpoint !== undefined ? `required endpoint ${endpoint}` : 'remaining computing-node capacities'}.`
        );
    }


    _heuristicCandidatePairs({
        capacity,
        service,
        component,
        versionComparator,
        nodeComparator,
        priority = 'version-first'
    }) {
        const versions = [
            ...(component.versions ?? [])
        ];

        if (typeof versionComparator === 'function') {
            versions.sort(versionComparator);
        }

        const endpoint =
            this._endpoint(
                service,
                component
            );

        let nodes;

        if (endpoint !== undefined) {
            const endpointNode = capacity.get(endpoint);
            nodes = endpointNode ? [endpointNode] : [];
        }
        else {
            nodes = this.computingNodes
                .map(node => capacity.get(node.nodeID))
                .filter(Boolean);

            if (typeof nodeComparator === 'function') {
                nodes.sort(nodeComparator);
            }
        }

        const pairs = [];

        if (priority === 'node-first') {
            for (const node of nodes) {
                for (const version of versions) {
                    if (this._fits(node, version)) {
                        pairs.push({ node, version });
                    }
                }
            }
        }
        else {
            for (const version of versions) {
                for (const node of nodes) {
                    if (this._fits(node, version)) {
                        pairs.push({ node, version });
                    }
                }
            }
        }

        return pairs;
    }

    _heuristicBacktrackingPlacement({
        solverName,
        versionComparator,
        nodeComparator,
        priority = 'version-first',
        maxStates = 250000
    }) {
        const tasks = [];

        for (const service of this.services) {
            for (const component of service.components ?? []) {
                tasks.push({ service, component });
            }
        }

        const capacity = this._capacityState();
        const solution = [];
        let states = 0;

        const search = index => {
            if (index >= tasks.length) {
                return true;
            }

            states++;
            if (states > maxStates) {
                throw new CandidateInfeasibleError(
                    `${solverName} feasibility fallback exceeded ${maxStates} search states. ` +
                    `The scenario may be infeasible or too constrained for the bounded heuristic repair.`
                );
            }

            const { service, component } = tasks[index];
            const pairs = this._heuristicCandidatePairs({
                capacity,
                service,
                component,
                versionComparator,
                nodeComparator,
                priority
            });

            for (const { node, version } of pairs) {
                const before = this.deepClone(node.characteristics);

                solution.push([
                    service.serviceID,
                    component.componentID,
                    version.versionNumber,
                    node.nodeID
                ]);

                this._consume(node, version);

                if (search(index + 1)) {
                    return true;
                }

                solution.pop();
                node.characteristics = before;
            }

            return false;
        };

        if (!search(0)) {
            throw new CandidateInfeasibleError(
                `${solverName} could not construct a complete feasible placement even after ` +
                `bounded backtracking using the heuristic's own candidate ordering.`
            );
        }

        return {
            solution,
            capacity,
            fallbackUsed: true,
            searchStates: states
        };
    }

    _heuristicBuildSolution({
        solverName,
        versionComparator,
        nodeComparator,
        priority = 'version-first'
    }) {
        const capacity = this._capacityState();
        const solution = [];

        try {
            for (const service of this.services) {
                for (const component of service.components ?? []) {
                    this._heuristicPlaceComponent({
                        capacity,
                        solution,
                        service,
                        component,
                        solverName,
                        versionComparator,
                        nodeComparator,
                        priority
                    });
                }
            }

            return {
                solution,
                capacity,
                fallbackUsed: false,
                searchStates: 0
            };
        }
        catch (error) {
            if (!(error instanceof CandidateInfeasibleError)) {
                throw error;
            }

            return this._heuristicBacktrackingPlacement({
                solverName,
                versionComparator,
                nodeComparator,
                priority
            });
        }
    }

    _heuristicComputingCapacity(capacity) {
        return this.computingNodes
            .map(node => capacity.get(node.nodeID))
            .filter(Boolean)
            .map(node => this.deepClone(node));
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

    _executionTimeForGene(gene) {

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
                `Unknown nodeID ${gene[3]}`
            );
        }


        const workloadMI =
            this._cpuWorkloadMI(
                version,
                `Service ${service.serviceID}, ` +
                `component ${component.componentID} CPU workload`
            );


        const capacityMIPS =
            this._resource(
                node.characteristics,
                'cpu'
            );


        if (
            capacityMIPS <=
            0
        ) {

            throw new Error(
                `Node ${node.nodeID} ` +
                `has non-positive CPU capacity`
            );
        }

        return (
            workloadMI /
            capacityMIPS
        );
    }


    executionTime(solution) {

        let total =
            0;


        for (
            const gene
            of solution ?? []
        ) {

            total +=
                this._executionTimeForGene(
                    gene
                );
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


    _edgeTransmissionDelay(
        service,
        source,
        destination,
        connections
    ) {

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


        const sourceNode =
            this._infraIndex(
                source[3]
            );


        const destinationNode =
            this._infraIndex(
                destination[3]
            );

        if (
            sourceNode ===
            destinationNode
        ) {

            return 0;
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
                `${source[3]} -> ${destination[3]}`
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


        return (
            dataSize /
            availableBandwidth
            +
            propagationDelay
        );
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


                const sourceComponent =
                    this._componentIndex(
                        service,
                        source[1]
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


                    if (
                        !this
                            .componentConnections
                            ?.[sourceComponent]
                            ?.[destinationComponent]
                    ) {
                        continue;
                    }


                    total +=
                        this._edgeTransmissionDelay(
                            service,
                            source,
                            destination,
                            connections
                        );
                }
            }
        }

        return total;
    }


    _serviceCriticalPathResponseTime(
        service,
        placements,
        connections
    ) {

        const components =
            service.components ??
            [];


        if (
            components.length ===
            0
        ) {

            return 0;
        }


        const placementByIndex =
            new Array(
                components.length
            );


        for (
            const placement
            of placements
        ) {

            const componentIndex =
                this._componentIndex(
                    service,
                    placement[1]
                );


            if (
                placementByIndex[
                    componentIndex
                ] !==
                undefined
            ) {

                throw new Error(
                    `Duplicate placement for service ` +
                    `${service.serviceID}, component ` +
                    `${placement[1]} while computing critical path.`
                );
            }


            placementByIndex[
                componentIndex
            ] = placement;
        }


        for (
            let i = 0;
            i < components.length;
            i++
        ) {

            if (
                placementByIndex[i] ===
                undefined
            ) {

                throw new Error(
                    `Missing placement for service ` +
                    `${service.serviceID}, component ` +
                    `${components[i].componentID} while computing critical path.`
                );
            }
        }


        const indegree =
            new Array(
                components.length
            ).fill(0);


        const successors =
            Array.from(
                {
                    length:
                        components.length
                },
                () => []
            );


        for (
            let sourceIndex = 0;
            sourceIndex < components.length;
            sourceIndex++
        ) {

            for (
                let destinationIndex = 0;
                destinationIndex < components.length;
                destinationIndex++
            ) {

                if (
                    sourceIndex ===
                    destinationIndex
                ) {
                    continue;
                }


                if (
                    this
                        .componentConnections
                        ?.[sourceIndex]
                        ?.[destinationIndex] !==
                    1
                ) {
                    continue;
                }


                successors[
                    sourceIndex
                ].push(
                    destinationIndex
                );


                indegree[
                    destinationIndex
                ]++;
            }
        }


        const queue =
            [];


        for (
            let i = 0;
            i < indegree.length;
            i++
        ) {

            if (
                indegree[i] ===
                0
            ) {

                queue.push(i);
            }
        }


        const earliestStart =
            new Array(
                components.length
            ).fill(0);


        const finishTime =
            new Array(
                components.length
            ).fill(0);


        let processed =
            0;


        while (
            queue.length >
            0
        ) {

            const currentIndex =
                queue.shift();


            processed++;


            const currentPlacement =
                placementByIndex[
                    currentIndex
                ];


            finishTime[
                currentIndex
            ] =

                earliestStart[
                    currentIndex
                ]

                +

                this._executionTimeForGene(
                    currentPlacement
                );


            for (
                const successorIndex
                of successors[
                    currentIndex
                ]
            ) {

                const edgeDelay =
                    this._edgeTransmissionDelay(
                        service,
                        currentPlacement,
                        placementByIndex[
                            successorIndex
                        ],
                        connections
                    );


                earliestStart[
                    successorIndex
                ] =
                    Math.max(

                        earliestStart[
                            successorIndex
                        ],

                        finishTime[
                            currentIndex
                        ]
                        +
                        edgeDelay
                    );


                indegree[
                    successorIndex
                ]--;


                if (
                    indegree[
                        successorIndex
                    ] ===
                    0
                ) {

                    queue.push(
                        successorIndex
                    );
                }
            }
        }


        if (
            processed !==
            components.length
        ) {

            throw new Error(
                `Service ${service.serviceID} component graph contains a cycle. ` +
                `Critical-path response time requires a DAG.`
            );
        }


        return Math.max(
            0,
            ...finishTime
        );
    }


    criticalPathResponseTime(
        solution,
        services = this.services,
        contentionSolution = solution
    ) {

        this._validateTopologyAndLinks();


        const selectedServices =
            Array.isArray(services)
                ? services
                : this.services;


        if (
            selectedServices.length ===
            0
        ) {

            return 0;
        }

        const connections =
            this.bwDivision(
                contentionSolution
            );


        const groups =
            this._groups(
                solution
            );


        let total =
            0;


        for (
            const service
            of selectedServices
        ) {

            total +=
                this._serviceCriticalPathResponseTime(
                    service,
                    groups.get(
                        service.serviceID
                    ) ?? [],
                    connections
                );
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
        services = this.services,
        contentionSolution = solution
    ) {

        const ResponseTime =

            this.criticalPathResponseTime(
                solution,
                services,
                contentionSolution
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
        services = this.services,
        contentionSolution = solution
    ) {

        const cost =
            this.calculateAll(
                solution,
                services,
                contentionSolution
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
                    [service],
                    solution
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

            const endpoint =
                this._endpoint(
                    service,
                    component
                );


            if (endpoint !== undefined) {
                return [endpoint];
            }

            const nodeIDs =
                this.computingNodes
                    .map(
                        node =>
                            node.nodeID
                    );


            if (nodeIDs.length === 0) {
                throw new Error(
                    `Service ${gene[0]}, component ${gene[1]} requires computing-tier placement, ` +
                    `but no computing node IDs are available for categorical encoding.`
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

        let index =
            allowed.findIndex(
                candidate =>
                    candidate === value
            );

        if (index < 0) {
            index =
                allowed.findIndex(
                    candidate =>
                        String(candidate) ===
                        String(value)
                );
        }


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


                const maxWorkloadMI =
                    Math.max(
                        ...versions.map(
                            version =>
                                this._cpuWorkloadMI(
                                    version,
                                    `Service ${service.serviceID}, ` +
                                    `component ${components[i].componentID} CPU workload`
                                )
                        )
                    );


                executionUpperBound +=
                    maxWorkloadMI /
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

        return (
            upperBound >
                0

                ?

                upperBound

                :

                1
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
        this.ncoConfig = ans['configsNCO'] ?? {};
        this.trainingScenarios =
            Array.isArray(ans['trainingScenarios'])
                ? ans['trainingScenarios']
                : [];
        this.trainingDataset =
            ans['trainingDataset'] ?? null;
        this._ncoNormalization = null;
        this._ncoTrainingSettings = null;
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

    _trainingNumber(
        value,
        label,
        {
            defaultValue,
            min = -Infinity,
            max = Infinity,
            integer = false
        } = {}
    ) {
        const candidate =
            value === undefined
                ? defaultValue
                : value;

        const number = Number(candidate);

        if (
            !Number.isFinite(number) ||
            number < min ||
            number > max ||
            (integer && !Number.isInteger(number))
        ) {
            throw new Error(
                `Invalid NCO training parameter ${label}: ${candidate}`
            );
        }

        return number;
    }

    _trainingBoolean(value, defaultValue) {
        if (value === undefined) {
            return defaultValue;
        }

        if (typeof value !== 'boolean') {
            throw new Error(
                `Invalid NCO training boolean value: ${value}`
            );
        }

        return value;
    }

    _trainingSettings() {
        if (this._ncoTrainingSettings) {
            return this._ncoTrainingSettings;
        }

        const root =
            this.ncoConfig?.training ?? {};

        const weightMin =
            this._trainingNumber(
                root.weightMin,
                'weightMin',
                {
                    defaultValue: 0,
                    min: 0
                }
            );

        const weightMax =
            this._trainingNumber(
                root.weightMax,
                'weightMax',
                {
                    defaultValue: 1,
                    min: weightMin
                }
            );

        if (weightMax <= weightMin) {
            throw new Error(
                'NCO training weightMax must be greater than weightMin.'
            );
        }

        const tolerance =
            this._trainingNumber(
                root.improvementTolerance,
                'improvementTolerance',
                {
                    defaultValue: 1e-9,
                    min: 0
                }
            );

        const modelIndex =
            this._trainingNumber(
                this.ncoConfig?.modelIndex,
                'modelIndex',
                {
                    defaultValue: 0,
                    min: 0,
                    integer: true
                }
            );

        const gaSource = root.ga ?? {};
        const psoSource = root.pso ?? {};
        const deSource = root.de ?? {};
        const saSource = root.sa ?? {};

        this._ncoTrainingSettings = {
            weightMin,
            weightMax,
            tolerance,
            modelIndex,
            saveWeights:
                this._trainingBoolean(
                    root.saveWeights,
                    true
                ),

            ga: {
                populationSize:
                    this._trainingNumber(
                        gaSource.populationSize,
                        'ga.populationSize',
                        {
                            defaultValue: 40,
                            min: 2,
                            integer: true
                        }
                    ),
                iterations:
                    this._trainingNumber(
                        gaSource.iterations,
                        'ga.iterations',
                        {
                            defaultValue: 60,
                            min: 1,
                            integer: true
                        }
                    ),
                mutationRate:
                    this._trainingNumber(
                        gaSource.mutationRate,
                        'ga.mutationRate',
                        {
                            defaultValue: 0.1,
                            min: 0,
                            max: 1
                        }
                    ),
                crossoverRate:
                    this._trainingNumber(
                        gaSource.crossoverRate,
                        'ga.crossoverRate',
                        {
                            defaultValue: 0.8,
                            min: 0,
                            max: 1
                        }
                    ),
                tournamentSize:
                    this._trainingNumber(
                        gaSource.tournamentSize,
                        'ga.tournamentSize',
                        {
                            defaultValue: 5,
                            min: 2,
                            integer: true
                        }
                    ),
                sigma:
                    this._trainingNumber(
                        gaSource.sigma,
                        'ga.sigma',
                        {
                            defaultValue: 0.08,
                            min: 0
                        }
                    ),
                patience:
                    this._trainingNumber(
                        gaSource.patience,
                        'ga.patience',
                        {
                            defaultValue: 15,
                            min: 1,
                            integer: true
                        }
                    )
            },

            pso: {
                populationSize:
                    this._trainingNumber(
                        psoSource.populationSize,
                        'pso.populationSize',
                        {
                            defaultValue: 40,
                            min: 2,
                            integer: true
                        }
                    ),
                iterations:
                    this._trainingNumber(
                        psoSource.iterations,
                        'pso.iterations',
                        {
                            defaultValue: 60,
                            min: 1,
                            integer: true
                        }
                    ),
                w:
                    this._trainingNumber(
                        psoSource.w,
                        'pso.w',
                        {
                            defaultValue: 0.7,
                            min: 0
                        }
                    ),
                c1:
                    this._trainingNumber(
                        psoSource.c1,
                        'pso.c1',
                        {
                            defaultValue: 1.5,
                            min: 0
                        }
                    ),
                c2:
                    this._trainingNumber(
                        psoSource.c2,
                        'pso.c2',
                        {
                            defaultValue: 1.5,
                            min: 0
                        }
                    ),
                velocityScale:
                    this._trainingNumber(
                        psoSource.velocityScale,
                        'pso.velocityScale',
                        {
                            defaultValue: 0.2,
                            min: 0
                        }
                    ),
                patience:
                    this._trainingNumber(
                        psoSource.patience,
                        'pso.patience',
                        {
                            defaultValue: 15,
                            min: 1,
                            integer: true
                        }
                    )
            },

            de: {
                populationSize:
                    this._trainingNumber(
                        deSource.populationSize,
                        'de.populationSize',
                        {
                            defaultValue: 40,
                            min: 4,
                            integer: true
                        }
                    ),
                iterations:
                    this._trainingNumber(
                        deSource.iterations,
                        'de.iterations',
                        {
                            defaultValue: 60,
                            min: 1,
                            integer: true
                        }
                    ),
                F:
                    this._trainingNumber(
                        deSource.F,
                        'de.F',
                        {
                            defaultValue: 0.7,
                            min: 0
                        }
                    ),
                crossoverRate:
                    this._trainingNumber(
                        deSource.crossoverRate,
                        'de.crossoverRate',
                        {
                            defaultValue: 0.8,
                            min: 0,
                            max: 1
                        }
                    ),
                patience:
                    this._trainingNumber(
                        deSource.patience,
                        'de.patience',
                        {
                            defaultValue: 15,
                            min: 1,
                            integer: true
                        }
                    )
            },

            sa: {
                initialTemperature:
                    this._trainingNumber(
                        saSource.initialTemperature,
                        'sa.initialTemperature',
                        {
                            defaultValue: 1,
                            min: Number.EPSILON
                        }
                    ),
                minimumTemperature:
                    this._trainingNumber(
                        saSource.minimumTemperature,
                        'sa.minimumTemperature',
                        {
                            defaultValue: 1e-4,
                            min: 0
                        }
                    ),
                alpha:
                    this._trainingNumber(
                        saSource.alpha,
                        'sa.alpha',
                        {
                            defaultValue: 0.95,
                            min: Number.EPSILON,
                            max: 0.999999999
                        }
                    ),
                mutationRate:
                    this._trainingNumber(
                        saSource.mutationRate,
                        'sa.mutationRate',
                        {
                            defaultValue: 0.2,
                            min: 0,
                            max: 1
                        }
                    ),
                sigma:
                    this._trainingNumber(
                        saSource.sigma,
                        'sa.sigma',
                        {
                            defaultValue: 0.08,
                            min: 0
                        }
                    ),
                maxIterations:
                    this._trainingNumber(
                        saSource.maxIterations,
                        'sa.maxIterations',
                        {
                            defaultValue: 250,
                            min: 1,
                            integer: true
                        }
                    ),
                patience:
                    this._trainingNumber(
                        saSource.patience,
                        'sa.patience',
                        {
                            defaultValue: 80,
                            min: 1,
                            integer: true
                        }
                    )
            }
        };

        if (
            this._ncoTrainingSettings.sa.minimumTemperature >=
            this._ncoTrainingSettings.sa.initialTemperature
        ) {
            throw new Error(
                'NCO training sa.minimumTemperature must be smaller than sa.initialTemperature.'
            );
        }

        return this._ncoTrainingSettings;
    }

    _randomTrainingVector(settings = this._trainingSettings()) {
        const span =
            settings.weightMax -
            settings.weightMin;

        return Array.from(
            { length: this.numberOfWeights },
            () =>
                settings.weightMin +
                Math.random() * span
        );
    }

    _clipTrainingVector(
        vector,
        settings = this._trainingSettings()
    ) {
        if (
            !Array.isArray(vector) ||
            vector.length !== this.numberOfWeights
        ) {
            throw new Error(
                `NCO training candidates must contain exactly ${this.numberOfWeights} weights.`
            );
        }

        return vector.map(
            (value, index) => {
                const numeric = Number(value);

                if (!Number.isFinite(numeric)) {
                    throw new Error(
                        `Invalid NCO training weight at index ${index}: ${value}`
                    );
                }

                return Math.min(
                    settings.weightMax,
                    Math.max(
                        settings.weightMin,
                        numeric
                    )
                );
            }
        );
    }

    _gaussianNoise() {
        let u1 = 0;
        let u2 = 0;

        while (u1 === 0) {
            u1 = Math.random();
        }

        while (u2 === 0) {
            u2 = Math.random();
        }

        return (
            Math.sqrt(
                -2 * Math.log(u1)
            ) *
            Math.cos(
                2 * Math.PI * u2
            )
        );
    }

    _isTrainingCandidateFailure(error) {
        if (
            error instanceof CandidateInfeasibleError ||
            error?.name === 'CandidateInfeasibleError'
        ) {
            return true;
        }

        const message =
            String(
                error?.message ?? ''
            );

        return (
            message.includes('NCO cannot place service') ||
            message.includes('NCO produced an incomplete placement') ||
            message.includes('no version fits CPU/memory/disk capacity') ||
            message.includes('produced a non-finite NCO score')
        );
    }

    _trainingScenarioList() {
        if (
            !Array.isArray(this.trainingScenarios) ||
            this.trainingScenarios.length < 2
        ) {
            throw new Error(
                'NCO multi-scenario training requires at least two trainingScenarios. ' +
                'Generate the persistent NCO training dataset before starting training.'
            );
        }

        const configuredCount =
            Number(
                this.ncoConfig
                    ?.training
                    ?.scenarioCount ??
                this.trainingScenarios.length
            );

        if (
            !Number.isInteger(configuredCount) ||
            configuredCount < 2
        ) {
            throw new Error(
                `Invalid NCO training scenarioCount: ${configuredCount}`
            );
        }

        if (
            configuredCount !==
            this.trainingScenarios.length
        ) {
            throw new Error(
                `NCO training received ${this.trainingScenarios.length} scenarios, ` +
                `but configurations specify scenarioCount=${configuredCount}.`
            );
        }

        return this.trainingScenarios;
    }

    _trainingScenarioEvaluator(scenario, index) {
        if (
            !scenario ||
            typeof scenario !== 'object' ||
            Array.isArray(scenario)
        ) {
            throw new Error(
                `Invalid NCO training scenario at index ${index}.`
            );
        }

        const requiredArrays = [
            'services',
            'computingNodes',
            'helperNodes',
            'usersNodes',
            'componentConnections',
            'infraConnections'
        ];

        for (const field of requiredArrays) {
            if (!Array.isArray(scenario[field])) {
                throw new Error(
                    `NCO training scenario ${index + 1} is missing array ${field}.`
                );
            }
        }

        return new NCO({
            ...this.deepClone(scenario),
            algo:
                this.algo,
            configsNCO:
                this.deepClone(this.ncoConfig),
            executionWorkloadSeconds:
                Number(
                    scenario.executionWorkloadSeconds ??
                    this.ans.executionWorkloadSeconds ??
                    1
                )
        });
    }

    _evaluateTrainingCandidate(weights) {
        const candidate =
            this._clipTrainingVector(weights);

        const scenarios =
            this._trainingScenarioList();

        const perScenarioQualities = [];

        for (
            let index = 0;
            index < scenarios.length;
            index++
        ) {
            try {
                const evaluator =
                    this._trainingScenarioEvaluator(
                        scenarios[index],
                        index
                    );

                const result =
                    evaluator.test(candidate);

                const quality =
                    evaluator.quality([
                        result.solution
                    ])[0];

                if (!Number.isFinite(quality)) {
                    return {
                        weights: candidate,
                        quality:
                            Number.POSITIVE_INFINITY,
                        perScenarioQualities: null,
                        bestScenarioQuality: null,
                        worstScenarioQuality: null
                    };
                }

                perScenarioQualities.push(
                    quality
                );
            }
            catch (error) {
                if (
                    this._isTrainingCandidateFailure(
                        error
                    )
                ) {
                    return {
                        weights: candidate,
                        quality:
                            Number.POSITIVE_INFINITY,
                        perScenarioQualities: null,
                        bestScenarioQuality: null,
                        worstScenarioQuality: null
                    };
                }

                throw error;
            }
        }

        const quality =
            perScenarioQualities.reduce(
                (sum, value) => sum + value,
                0
            ) /
            perScenarioQualities.length;

        return {
            weights: candidate,
            quality,
            perScenarioQualities,
            bestScenarioQuality:
                Math.min(
                    ...perScenarioQualities
                ),
            worstScenarioQuality:
                Math.max(
                    ...perScenarioQualities
                )
        };
    }

    _evaluateTrainingPopulation(population) {
        return population.map(
            weights =>
                this._evaluateTrainingCandidate(
                    weights
                ).quality
        );
    }

    _bestTrainingCandidate(
        population,
        qualities
    ) {
        let bestIndex = -1;
        let bestQuality = Number.POSITIVE_INFINITY;

        for (
            let i = 0;
            i < population.length;
            i++
        ) {
            if (qualities[i] < bestQuality) {
                bestQuality = qualities[i];
                bestIndex = i;
            }
        }

        return {
            index: bestIndex,
            quality: bestQuality,
            weights:
                bestIndex >= 0
                    ? [...population[bestIndex]]
                    : null
        };
    }

    _prepareTrainingPopulation(
        initialPopulation,
        populationSize
    ) {
        const settings =
            this._trainingSettings();

        let population =
            Array.isArray(initialPopulation)
                ? initialPopulation.map(
                    candidate =>
                        this._clipTrainingVector(
                            candidate,
                            settings
                        )
                )
                : [];

        if (population.length > populationSize) {
            const qualities =
                this._evaluateTrainingPopulation(
                    population
                );

            population =
                population
                    .map(
                        (weights, index) => ({
                            weights,
                            quality: qualities[index]
                        })
                    )
                    .sort(
                        (a, b) =>
                            a.quality - b.quality
                    )
                    .slice(0, populationSize)
                    .map(
                        item => [...item.weights]
                    );
        }

        while (population.length < populationSize) {
            population.push(
                this._randomTrainingVector(
                    settings
                )
            );
        }

        return population;
    }

    _trainingProgressRecord(
        iteration,
        qualities,
        bestQuality
    ) {
        const finite =
            qualities
                .filter(Number.isFinite)
                .sort((a, b) => a - b);

        return {
            iteration,
            bestQuality,
            populationBest:
                finite.length > 0
                    ? finite[0]
                    : null,
            populationMedian:
                finite.length > 0
                    ? finite[
                        Math.floor(
                            finite.length / 2
                        )
                    ]
                    : null,
            populationWorst:
                finite.length > 0
                    ? finite[finite.length - 1]
                    : null,
            feasibleCandidates:
                finite.length,
            populationSize:
                qualities.length
        };
    }

    _trainingImproved(
        candidate,
        incumbent,
        tolerance
    ) {
        return (
            Number.isFinite(candidate) &&
            (
                !Number.isFinite(incumbent) ||
                candidate < incumbent - tolerance
            )
        );
    }

    _tournamentTrainingIndex(
        qualities,
        tournamentSize
    ) {
        let bestIndex =
            Math.floor(
                Math.random() * qualities.length
            );

        for (
            let i = 1;
            i < tournamentSize;
            i++
        ) {
            const candidateIndex =
                Math.floor(
                    Math.random() * qualities.length
                );

            if (
                qualities[candidateIndex] <
                qualities[bestIndex]
            ) {
                bestIndex = candidateIndex;
            }
        }

        return bestIndex;
    }

    _mutateTrainingVector(
        vector,
        mutationRate,
        sigma
    ) {
        const settings =
            this._trainingSettings();

        const span =
            settings.weightMax -
            settings.weightMin;

        const mutated = [...vector];

        for (
            let i = 0;
            i < mutated.length;
            i++
        ) {
            if (Math.random() < mutationRate) {
                mutated[i] +=
                    this._gaussianNoise() *
                    sigma *
                    span;
            }
        }

        return this._clipTrainingVector(
            mutated,
            settings
        );
    }

    _runTrainingGA(initialPopulation = []) {
        const settings =
            this._trainingSettings();

        const config =
            settings.ga;

        let population =
            this._prepareTrainingPopulation(
                initialPopulation,
                config.populationSize
            );

        let qualities =
            this._evaluateTrainingPopulation(
                population
            );

        let best =
            this._bestTrainingCandidate(
                population,
                qualities
            );

        let stagnant = 0;
        let iterationsCompleted = 0;
        const convergence = [];

        for (
            let iteration = 1;
            iteration <= config.iterations;
            iteration++
        ) {
            const nextPopulation = [];

            if (best.weights) {
                nextPopulation.push(
                    [...best.weights]
                );
            }

            while (
                nextPopulation.length <
                config.populationSize
            ) {
                const parent1 =
                    population[
                        this._tournamentTrainingIndex(
                            qualities,
                            Math.min(
                                config.tournamentSize,
                                population.length
                            )
                        )
                    ];

                const parent2 =
                    population[
                        this._tournamentTrainingIndex(
                            qualities,
                            Math.min(
                                config.tournamentSize,
                                population.length
                            )
                        )
                    ];

                let child1 = [...parent1];
                let child2 = [...parent2];

                if (
                    Math.random() <
                    config.crossoverRate
                ) {
                    const point =
                        1 +
                        Math.floor(
                            Math.random() *
                            (this.numberOfWeights - 1)
                        );

                    child1 = [
                        ...parent1.slice(0, point),
                        ...parent2.slice(point)
                    ];

                    child2 = [
                        ...parent2.slice(0, point),
                        ...parent1.slice(point)
                    ];
                }

                nextPopulation.push(
                    this._mutateTrainingVector(
                        child1,
                        config.mutationRate,
                        config.sigma
                    )
                );

                if (
                    nextPopulation.length <
                    config.populationSize
                ) {
                    nextPopulation.push(
                        this._mutateTrainingVector(
                            child2,
                            config.mutationRate,
                            config.sigma
                        )
                    );
                }
            }

            population = nextPopulation;
            qualities =
                this._evaluateTrainingPopulation(
                    population
                );

            const currentBest =
                this._bestTrainingCandidate(
                    population,
                    qualities
                );

            if (
                this._trainingImproved(
                    currentBest.quality,
                    best.quality,
                    settings.tolerance
                )
            ) {
                best = currentBest;
                stagnant = 0;
            }
            else {
                stagnant++;
            }

            convergence.push(
                this._trainingProgressRecord(
                    iteration,
                    qualities,
                    best.quality
                )
            );

            iterationsCompleted = iteration;

            if (stagnant >= config.patience) {
                break;
            }
        }

        return {
            weights: best.weights,
            quality: best.quality,
            population,
            convergence,
            iterationsCompleted
        };
    }

    _runTrainingPSO(initialPopulation = []) {
        const settings =
            this._trainingSettings();

        const config =
            settings.pso;

        let population =
            this._prepareTrainingPopulation(
                initialPopulation,
                config.populationSize
            );

        const span =
            settings.weightMax -
            settings.weightMin;

        const velocities =
            population.map(
                () =>
                    Array.from(
                        { length: this.numberOfWeights },
                        () =>
                            (
                                Math.random() * 2 - 1
                            ) *
                            config.velocityScale *
                            span
                    )
            );

        let qualities =
            this._evaluateTrainingPopulation(
                population
            );

        const personalBest =
            population.map(
                candidate => [...candidate]
            );

        const personalBestQuality =
            [...qualities];

        let globalBest =
            this._bestTrainingCandidate(
                personalBest,
                personalBestQuality
            );

        let stagnant = 0;
        let iterationsCompleted = 0;
        const convergence = [];

        for (
            let iteration = 1;
            iteration <= config.iterations;
            iteration++
        ) {
            const guide =
                globalBest.weights ??
                this._randomTrainingVector(
                    settings
                );

            for (
                let i = 0;
                i < population.length;
                i++
            ) {
                for (
                    let j = 0;
                    j < this.numberOfWeights;
                    j++
                ) {
                    const r1 = Math.random();
                    const r2 = Math.random();

                    velocities[i][j] =
                        config.w * velocities[i][j] +
                        config.c1 * r1 *
                        (
                            personalBest[i][j] -
                            population[i][j]
                        ) +
                        config.c2 * r2 *
                        (
                            guide[j] -
                            population[i][j]
                        );

                    population[i][j] +=
                        velocities[i][j];
                }

                population[i] =
                    this._clipTrainingVector(
                        population[i],
                        settings
                    );
            }

            qualities =
                this._evaluateTrainingPopulation(
                    population
                );

            for (
                let i = 0;
                i < population.length;
                i++
            ) {
                if (
                    qualities[i] <
                    personalBestQuality[i]
                ) {
                    personalBestQuality[i] =
                        qualities[i];

                    personalBest[i] =
                        [...population[i]];
                }
            }

            const currentBest =
                this._bestTrainingCandidate(
                    personalBest,
                    personalBestQuality
                );

            if (
                this._trainingImproved(
                    currentBest.quality,
                    globalBest.quality,
                    settings.tolerance
                )
            ) {
                globalBest = currentBest;
                stagnant = 0;
            }
            else {
                stagnant++;
            }

            convergence.push(
                this._trainingProgressRecord(
                    iteration,
                    qualities,
                    globalBest.quality
                )
            );

            iterationsCompleted = iteration;

            if (stagnant >= config.patience) {
                break;
            }
        }

        return {
            weights: globalBest.weights,
            quality: globalBest.quality,
            population:
                personalBest.map(
                    candidate => [...candidate]
                ),
            convergence,
            iterationsCompleted
        };
    }

    _sampleDistinctPopulationIndices(
        populationSize,
        excluded,
        count
    ) {
        const candidates = [];

        for (
            let i = 0;
            i < populationSize;
            i++
        ) {
            if (!excluded.has(i)) {
                candidates.push(i);
            }
        }

        if (candidates.length < count) {
            throw new Error(
                'NCO DE population is too small to sample distinct donor indices.'
            );
        }

        for (
            let i = candidates.length - 1;
            i > 0;
            i--
        ) {
            const j =
                Math.floor(
                    Math.random() * (i + 1)
                );

            [
                candidates[i],
                candidates[j]
            ] = [
                candidates[j],
                candidates[i]
            ];
        }

        return candidates.slice(0, count);
    }

    _runTrainingDE(initialPopulation = []) {
        const settings =
            this._trainingSettings();

        const config =
            settings.de;

        let population =
            this._prepareTrainingPopulation(
                initialPopulation,
                config.populationSize
            );

        let qualities =
            this._evaluateTrainingPopulation(
                population
            );

        let best =
            this._bestTrainingCandidate(
                population,
                qualities
            );

        let stagnant = 0;
        let iterationsCompleted = 0;
        const convergence = [];

        for (
            let iteration = 1;
            iteration <= config.iterations;
            iteration++
        ) {
            const bestGuide =
                best.weights ??
                this._randomTrainingVector(
                    settings
                );

            const nextPopulation =
                population.map(
                    candidate => [...candidate]
                );

            const nextQualities =
                [...qualities];

            for (
                let i = 0;
                i < population.length;
                i++
            ) {
                const [r1, r2] =
                    this._sampleDistinctPopulationIndices(
                        population.length,
                        new Set([i]),
                        2
                    );

                const mutant =
                    new Array(
                        this.numberOfWeights
                    );

                for (
                    let j = 0;
                    j < this.numberOfWeights;
                    j++
                ) {
                    mutant[j] =
                        population[i][j] +
                        config.F *
                        (
                            bestGuide[j] -
                            population[i][j]
                        ) +
                        config.F *
                        (
                            population[r1][j] -
                            population[r2][j]
                        );
                }

                const clippedMutant =
                    this._clipTrainingVector(
                        mutant,
                        settings
                    );

                const jRand =
                    Math.floor(
                        Math.random() *
                        this.numberOfWeights
                    );

                const trial =
                    population[i].map(
                        (value, j) =>
                            (
                                Math.random() <
                                config.crossoverRate ||
                                j === jRand
                            )
                                ? clippedMutant[j]
                                : value
                    );

                const trialEvaluation =
                    this._evaluateTrainingCandidate(
                        trial
                    );

                if (
                    trialEvaluation.quality <=
                    qualities[i]
                ) {
                    nextPopulation[i] =
                        [...trialEvaluation.weights];

                    nextQualities[i] =
                        trialEvaluation.quality;
                }
            }

            population = nextPopulation;
            qualities = nextQualities;

            const currentBest =
                this._bestTrainingCandidate(
                    population,
                    qualities
                );

            if (
                this._trainingImproved(
                    currentBest.quality,
                    best.quality,
                    settings.tolerance
                )
            ) {
                best = currentBest;
                stagnant = 0;
            }
            else {
                stagnant++;
            }

            convergence.push(
                this._trainingProgressRecord(
                    iteration,
                    qualities,
                    best.quality
                )
            );

            iterationsCompleted = iteration;

            if (stagnant >= config.patience) {
                break;
            }
        }

        return {
            weights: best.weights,
            quality: best.quality,
            population,
            convergence,
            iterationsCompleted
        };
    }

    _runTrainingSA() {
        const settings =
            this._trainingSettings();

        const config =
            settings.sa;

        let currentEvaluation = null;

        for (let attempt = 0; attempt < 100; attempt++) {
            const candidate =
                this._randomTrainingVector(
                    settings
                );

            const evaluation =
                this._evaluateTrainingCandidate(
                    candidate
                );

            if (Number.isFinite(evaluation.quality)) {
                currentEvaluation = evaluation;
                break;
            }
        }

        if (!currentEvaluation) {
            throw new Error(
                'NCO SA training could not generate a feasible initial weight vector.'
            );
        }

        let bestEvaluation = {
            weights: [...currentEvaluation.weights],
            quality: currentEvaluation.quality
        };

        let temperature =
            config.initialTemperature;

        let stagnant = 0;
        let iterationsCompleted = 0;
        const convergence = [];

        for (
            let iteration = 1;
            iteration <= config.maxIterations &&
            temperature > config.minimumTemperature;
            iteration++
        ) {
            let neighbor =
                this._mutateTrainingVector(
                    currentEvaluation.weights,
                    config.mutationRate,
                    config.sigma
                );

            if (
                neighbor.every(
                    (value, index) =>
                        value ===
                        currentEvaluation.weights[index]
                )
            ) {
                const forcedIndex =
                    Math.floor(
                        Math.random() *
                        this.numberOfWeights
                    );

                neighbor = [...neighbor];
                neighbor[forcedIndex] +=
                    this._gaussianNoise() *
                    config.sigma *
                    (
                        settings.weightMax -
                        settings.weightMin
                    );

                neighbor =
                    this._clipTrainingVector(
                        neighbor,
                        settings
                    );
            }

            const neighborEvaluation =
                this._evaluateTrainingCandidate(
                    neighbor
                );

            let accept = false;

            if (
                neighborEvaluation.quality <
                currentEvaluation.quality
            ) {
                accept = true;
            }
            else if (
                Number.isFinite(
                    neighborEvaluation.quality
                )
            ) {
                const difference =
                    neighborEvaluation.quality -
                    currentEvaluation.quality;

                accept =
                    Math.random() <
                    Math.exp(
                        -difference /
                        temperature
                    );
            }

            if (accept) {
                currentEvaluation =
                    neighborEvaluation;
            }

            if (
                this._trainingImproved(
                    currentEvaluation.quality,
                    bestEvaluation.quality,
                    settings.tolerance
                )
            ) {
                bestEvaluation = {
                    weights:
                        [...currentEvaluation.weights],
                    quality:
                        currentEvaluation.quality
                };

                stagnant = 0;
            }
            else {
                stagnant++;
            }

            convergence.push({
                iteration,
                bestQuality:
                    bestEvaluation.quality,
                currentQuality:
                    Number.isFinite(
                        currentEvaluation.quality
                    )
                        ? currentEvaluation.quality
                        : null,
                temperature
            });

            iterationsCompleted = iteration;
            temperature *= config.alpha;

            if (stagnant >= config.patience) {
                break;
            }
        }

        return {
            weights:
                bestEvaluation.weights,
            quality:
                bestEvaluation.quality,
            population: [
                [...bestEvaluation.weights]
            ],
            convergence,
            iterationsCompleted
        };
    }

    _modelNameForOptimizer(optimizer) {
        const normalized =
            String(optimizer ?? '')
                .trim()
                .toUpperCase();

        const names = {
            GA: 'NCOGA',
            PSO: 'NCOPSO',
            DE: 'NCODE',
            SA: 'NCOSA'
        };

        const modelName =
            names[normalized];

        if (!modelName) {
            throw new Error(
                `Unsupported NCO model optimizer: ${optimizer}.`
            );
        }

        return modelName;
    }

    _persistTrainingWeights(
        weights,
        optimizer,
        modelIndex,
        saveWeights
    ) {
        if (!saveWeights) {
            return null;
        }

        this.validateWeights(weights);

        const modelName =
            this._modelNameForOptimizer(
                optimizer
            );

        const targetPath =
            path.join(
                __dirname,
                `weights_${modelName}_${modelIndex}.txt`
            );

        const temporaryPath =
            `${targetPath}.tmp-${process.pid}-${Date.now()}`;

        fs.writeFileSync(
            temporaryPath,
            JSON.stringify(
                weights,
                null,
                2
            ),
            'utf8'
        );

        fs.renameSync(
            temporaryPath,
            targetPath
        );

        return targetPath;
    }

    _completeTraining(
        optimizer,
        optimizerResult,
        startTime,
        stages = undefined
    ) {
        if (
            !optimizerResult?.weights ||
            !Number.isFinite(
                optimizerResult.quality
            )
        ) {
            throw new Error(
                `NCO ${optimizer} training did not find a feasible finite-quality weight vector.`
            );
        }

        const settings =
            this._trainingSettings();

        const weights =
            this._clipTrainingVector(
                optimizerResult.weights,
                settings
            );

        this.validateWeights(weights);

        const trainingEvaluation =
            this._evaluateTrainingCandidate(
                weights
            );

        if (
            !Number.isFinite(
                trainingEvaluation.quality
            ) ||
            !Array.isArray(
                trainingEvaluation.perScenarioQualities
            )
        ) {
            throw new Error(
                `NCO ${optimizer} training produced non-finite multi-scenario fitness.`
            );
        }

        const finalResult =
            this.test(weights);

        const referenceScenarioFitness =
            this.quality([
                finalResult.solution
            ])[0];

        if (
            !Number.isFinite(
                referenceScenarioFitness
            )
        ) {
            throw new Error(
                `NCO ${optimizer} training produced non-finite reference-scenario fitness.`
            );
        }

        const modelName =
            this._modelNameForOptimizer(
                optimizer
            );

        const weightsFile =
            this._persistTrainingWeights(
                weights,
                optimizer,
                settings.modelIndex,
                settings.saveWeights
            );

        return {
            ...finalResult,
            runtime:
                performance.now() -
                startTime,
            finalEvaluationRuntime:
                finalResult.runtime,
            fitness:
                trainingEvaluation.quality,
            trainingMeanFitness:
                trainingEvaluation.quality,
            trainingBestFitness:
                trainingEvaluation.bestScenarioQuality,
            trainingWorstFitness:
                trainingEvaluation.worstScenarioQuality,
            trainingScenarioQualities:
                trainingEvaluation.perScenarioQualities,
            trainingScenarioCount:
                trainingEvaluation.perScenarioQualities.length,
            referenceScenarioFitness,
            weights,
            weightsFile,
            modelIndex:
                settings.modelIndex,
            trainingOptimizer:
                optimizer,
            trainedModelName:
                modelName,
            trainingDataset:
                this.trainingDataset,
            iterationsCompleted:
                optimizerResult.iterationsCompleted,
            convergence:
                optimizerResult.convergence ?? [],
            stages
        };
    }

    run_train_ga() {
        const startTime = performance.now();

        return this._completeTraining(
            'GA',
            this._runTrainingGA(),
            startTime
        );
    }

    run_train_pso() {
        const startTime = performance.now();

        return this._completeTraining(
            'PSO',
            this._runTrainingPSO(),
            startTime
        );
    }

    run_train_de() {
        const startTime = performance.now();

        return this._completeTraining(
            'DE',
            this._runTrainingDE(),
            startTime
        );
    }

    run_train_sa() {
        const startTime = performance.now();

        return this._completeTraining(
            'SA',
            this._runTrainingSA(),
            startTime
        );
    }

    run_train(strategy) {
        const normalized =
            String(strategy ?? '')
                .trim()
                .toUpperCase();

        if (normalized === 'GA') {
            return this.run_train_ga();
        }

        if (normalized === 'PSO') {
            return this.run_train_pso();
        }

        if (normalized === 'DE') {
            return this.run_train_de();
        }

        if (normalized === 'SA') {
            return this.run_train_sa();
        }

        throw new Error(
            `Unsupported NCO training strategy: ${strategy}.`
        );
    }

    run_test(
        optimizer = 'GA',
        model_index =
            this.ncoConfig?.modelIndex ?? 0
    ) {
        if (
            typeof optimizer === 'number'
        ) {
            model_index = optimizer;
            optimizer = 'GA';
        }

        const numericModelIndex =
            Number(model_index);

        if (
            !Number.isInteger(numericModelIndex) ||
            numericModelIndex < 0
        ) {
            throw new Error(
                `Invalid NCO model index: ${model_index}`
            );
        }

        const modelName =
            this._modelNameForOptimizer(
                optimizer
            );

        const weightsPath =
            path.join(
                __dirname,
                `weights_${modelName}_${numericModelIndex}.txt`
            );

        if (!fs.existsSync(weightsPath)) {
            throw new Error(
                `${modelName} weights file does not exist: ${weightsPath}. ` +
                `Train it first with NCOtrain${String(optimizer).toUpperCase()} ` +
                `using the same configsNCO.modelIndex.`
            );
        }

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

    run(
        optimizer = 'GA',
        model_index =
            this.ncoConfig?.modelIndex ?? 0
    ) {
        return this.run_test(
            optimizer,
            model_index
        );
    }

}

class taskContinuationAffinity extends solutionOperation {

    constructor(ans) {
        super(ans);
    }

    run() {
        const startTime = performance.now();

        const built = this._heuristicBuildSolution({
            solverName: 'TCA',
            priority: 'node-first'
        });

        const solution = this.finalizeFeasibleSolution(built.solution, 'TCA');
        const exeTime = performance.now() - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution,
            nodesFreeCapacity: this._heuristicComputingCapacity(built.capacity),
            runtime: exeTime,
            heuristicFallbackUsed: built.fallbackUsed,
            heuristicSearchStates: built.searchStates,
            perServiceAnalysis: this.perServiceAnalysis(solution, 'TCA-per-service')
        };
    }
}

class leastRequiredCPU extends solutionOperation {

    constructor(ans) {
        super(ans);
    }

    run() {
        const startTime = performance.now();

        const versionComparator = (a, b) =>
            this._resource(a.characteristics, 'cpu') -
            this._resource(b.characteristics, 'cpu');

        const built = this._heuristicBuildSolution({
            solverName: 'LRC',
            versionComparator,
            priority: 'version-first'
        });

        const solution = this.finalizeFeasibleSolution(built.solution, 'LRC');
        const exeTime = performance.now() - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime,
            nodesFreeCapacity: this._heuristicComputingCapacity(built.capacity),
            solution,
            heuristicFallbackUsed: built.fallbackUsed,
            heuristicSearchStates: built.searchStates,
            perServiceAnalysis: this.perServiceAnalysis(solution, 'LRC-per-service')
        };
    }
}

class mostDataSize extends solutionOperation {

    constructor(ans) {
        super(ans);
    }

    run() {
        const startTime = performance.now();

        const versionComparator = (a, b) =>
            this._dataSize(b.characteristics, `MDS version ${b.versionNumber} dataSize`) -
            this._dataSize(a.characteristics, `MDS version ${a.versionNumber} dataSize`);

        const built = this._heuristicBuildSolution({
            solverName: 'MDS',
            versionComparator,
            priority: 'version-first'
        });

        const solution = this.finalizeFeasibleSolution(built.solution, 'MDS');
        const exeTime = performance.now() - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            runtime: exeTime,
            perServiceAnalysis: this.perServiceAnalysis(solution, 'MDS-per-service'),
            solution,
            heuristicFallbackUsed: built.fallbackUsed,
            heuristicSearchStates: built.searchStates
        };
    }
}

class mostPowerful extends solutionOperation {

    constructor(ans) {
        super(ans);
    }

    run() {
        const startTime = performance.now();

        const versionComparator = (a, b) =>
            this._resource(a.characteristics, 'cpu') -
            this._resource(b.characteristics, 'cpu');

        const nodeComparator = (a, b) =>
            this._resource(b.characteristics, 'cpu') -
            this._resource(a.characteristics, 'cpu');

        const built = this._heuristicBuildSolution({
            solverName: 'MP',
            versionComparator,
            nodeComparator,
            priority: 'version-first'
        });

        const solution = this.finalizeFeasibleSolution(built.solution, 'MP');
        const exeTime = performance.now() - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution,
            nodesFreeCapacity: this._heuristicComputingCapacity(built.capacity),
            runtime: exeTime,
            heuristicFallbackUsed: built.fallbackUsed,
            heuristicSearchStates: built.searchStates,
            perServiceAnalysis: this.perServiceAnalysis(solution, 'MP-per-service')
        };
    }
}

class leastPowerful extends solutionOperation {

    constructor(ans) {
        super(ans);
    }

    run() {
        const startTime = performance.now();

        const versionComparator = (a, b) =>
            this._resource(b.characteristics, 'cpu') -
            this._resource(a.characteristics, 'cpu');

        const nodeComparator = (a, b) =>
            this._resource(a.characteristics, 'cpu') -
            this._resource(b.characteristics, 'cpu');

        const built = this._heuristicBuildSolution({
            solverName: 'LP',
            versionComparator,
            nodeComparator,
            priority: 'version-first'
        });

        const solution = this.finalizeFeasibleSolution(built.solution, 'LP');
        const exeTime = performance.now() - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution,
            runtime: exeTime,
            nodesFreeCapacity: this._heuristicComputingCapacity(built.capacity),
            heuristicFallbackUsed: built.fallbackUsed,
            heuristicSearchStates: built.searchStates,
            perServiceAnalysis: this.perServiceAnalysis(solution, 'LP-per-service')
        };
    }
}

class mostReliablity extends solutionOperation {

    constructor(ans) {
        super(ans);
    }

    run() {
        const startTime = performance.now();

        const versionComparator = (a, b) =>
            this._versionReliability(b) -
            this._versionReliability(a);

        const nodeComparator = (a, b) =>
            this._nodeReliability(b) -
            this._nodeReliability(a);

        const built = this._heuristicBuildSolution({
            solverName: 'MR',
            versionComparator,
            nodeComparator,
            priority: 'version-first'
        });

        const solution = this.finalizeFeasibleSolution(built.solution, 'MR');
        const exeTime = performance.now() - startTime;

        return {
            servicePlacementResults: this.solutionAnalyser(solution),
            solution,
            runtime: exeTime,
            nodesFreeCapacity: this._heuristicComputingCapacity(built.capacity),
            heuristicFallbackUsed: built.fallbackUsed,
            heuristicSearchStates: built.searchStates,
            perServiceAnalysis: this.perServiceAnalysis(solution, 'MR-per-service')
        };
    }
}

class exactOptimizationBaseline extends solutionOperation {

    constructor(sysAlgoConfig) {
        const ans = sysAlgoConfig?.ans ?? sysAlgoConfig;
        super(ans);

        this.ans = ans;
        this.services = ans['services'] ?? [];
        this.computingNodes = ans['computingNodes'] ?? [];
        this.users = ans['usersNodes'] ?? [];
        this.helpers = ans['helperNodes'] ?? [];
        this.componentConnections = ans['componentConnections'] ?? [];
        this.infraConnections = ans['infraConnections'] ?? [];

        const config = ans?.configsOPT ?? {};

        this.dominancePruning =
            config.dominancePruning !== false;

        this.warmStart =
            config.warmStart !== false;

        this.boundEpsilon = 1e-12;

        this.searchStates = 0;
        this.completeSolutionsEvaluated = 0;
        this.prunedByBound = 0;
        this.prunedByCapacity = 0;
        this.dominatedVersionsRemoved = 0;
        this.incumbentUpdates = 0;
        this.warmStartCandidates = 0;
        this.warmStartFeasible = 0;

        this.bestQuality = Infinity;
        this.bestSolution = null;
        this.incumbentSource = null;

        this._exactVariableByKey = new Map();
        this._edgeLowerBoundCache = new Map();
    }

    _exactKey(serviceID, componentID) {
        return JSON.stringify([
            serviceID,
            componentID
        ]);
    }

    _exactGeneKey(gene) {
        return JSON.stringify(gene);
    }

    _versionDominates(left, right) {
        const lc = left.characteristics ?? {};
        const rc = right.characteristics ?? {};

        const leftValues = {
            memory: this._resource(lc, 'memory'),
            cpu: this._resource(lc, 'cpu'),
            disk: this._resource(lc, 'disk'),
            workload: this._cpuWorkloadMI(left, 'OPT dominance left workload'),
            dataSize: this._dataSize(lc, 'OPT dominance left dataSize'),
            reliability: this._versionReliability(left)
        };

        const rightValues = {
            memory: this._resource(rc, 'memory'),
            cpu: this._resource(rc, 'cpu'),
            disk: this._resource(rc, 'disk'),
            workload: this._cpuWorkloadMI(right, 'OPT dominance right workload'),
            dataSize: this._dataSize(rc, 'OPT dominance right dataSize'),
            reliability: this._versionReliability(right)
        };

        const noWorse =
            leftValues.memory <= rightValues.memory &&
            leftValues.cpu <= rightValues.cpu &&
            leftValues.disk <= rightValues.disk &&
            leftValues.workload <= rightValues.workload &&
            leftValues.dataSize <= rightValues.dataSize &&
            leftValues.reliability >= rightValues.reliability;

        const strictlyBetter =
            leftValues.memory < rightValues.memory ||
            leftValues.cpu < rightValues.cpu ||
            leftValues.disk < rightValues.disk ||
            leftValues.workload < rightValues.workload ||
            leftValues.dataSize < rightValues.dataSize ||
            leftValues.reliability > rightValues.reliability;

        return noWorse && strictlyBetter;
    }

    _nonDominatedVersions(component) {
        const versions = [
            ...(component.versions ?? [])
        ];

        if (versions.length === 0) {
            throw new Error(
                `OPT: component ${component.componentID} has no versions.`
            );
        }

        if (!this.dominancePruning) {
            return versions;
        }

        const keep = [];

        for (let i = 0; i < versions.length; i++) {
            let dominated = false;

            for (let j = 0; j < versions.length; j++) {
                if (i === j) {
                    continue;
                }

                if (
                    this._versionDominates(
                        versions[j],
                        versions[i]
                    )
                ) {
                    dominated = true;
                    break;
                }
            }

            if (dominated) {
                this.dominatedVersionsRemoved++;
            }
            else {
                keep.push(versions[i]);
            }
        }

        if (keep.length === 0) {
            throw new Error(
                `OPT dominance pruning removed every version of component ${component.componentID}.`
            );
        }

        return keep;
    }

    _buildExactVariables() {
        this._validateTopologyAndLinks();

        const variables = [];
        const originalCapacity = this._capacityState();

        for (const service of this.services) {
            for (let componentIndex = 0;
                componentIndex < (service.components ?? []).length;
                componentIndex++) {

                const component = service.components[componentIndex];
                const endpoint = this._endpoint(service, component);
                const versions = this._nonDominatedVersions(component);

                let nodes;

                if (endpoint !== undefined) {
                    const endpointNode = originalCapacity.get(endpoint);

                    if (!endpointNode) {
                        throw new Error(
                            `OPT required endpoint node ${endpoint} does not exist for ` +
                            `service ${service.serviceID}, component ${component.componentID}.`
                        );
                    }

                    nodes = [endpointNode];
                }
                else {
                    nodes = this.computingNodes
                        .map(node => originalCapacity.get(node.nodeID))
                        .filter(Boolean);

                    if (nodes.length === 0) {
                        throw new Error(
                            `OPT cannot place non-endpoint component ${component.componentID} of ` +
                            `service ${service.serviceID}: no computing nodes exist.`
                        );
                    }
                }

                const options = [];

                for (const version of versions) {
                    for (const node of nodes) {
                        if (!this._fits(node, version)) {
                            continue;
                        }

                        const gene = [
                            service.serviceID,
                            component.componentID,
                            version.versionNumber,
                            node.nodeID
                        ];

                        options.push({
                            gene,
                            nodeID: node.nodeID,
                            version,
                            executionTime:
                                this._cpuWorkloadMI(
                                    version,
                                    `OPT service ${service.serviceID}, component ${component.componentID} workload`
                                ) /
                                this._resource(
                                    node.characteristics,
                                    'cpu'
                                ),
                            versionReliability:
                                this._versionReliability(version),
                            nodeReliability:
                                this._nodeReliability(node),
                            dataSize:
                                this._dataSize(
                                    version.characteristics,
                                    `OPT service ${service.serviceID}, component ${component.componentID} dataSize`
                                )
                        });
                    }
                }

                if (options.length === 0) {
                    throw new CandidateInfeasibleError(
                        `OPT has no individually feasible node/version option for service ` +
                        `${service.serviceID}, component ${component.componentID}.`
                    );
                }

                options.sort((left, right) => {
                    const leftScore =
                        left.executionTime -
                        0.25 * left.versionReliability -
                        0.25 * left.nodeReliability;

                    const rightScore =
                        right.executionTime -
                        0.25 * right.versionReliability -
                        0.25 * right.nodeReliability;

                    return leftScore - rightScore;
                });

                const variable = {
                    service,
                    component,
                    componentIndex,
                    endpoint,
                    options,
                    minExecutionTime:
                        Math.min(
                            ...options.map(option => option.executionTime)
                        ),
                    maxVersionReliability:
                        Math.max(
                            ...options.map(option => option.versionReliability)
                        )
                };

                variables.push(variable);
                this._exactVariableByKey.set(
                    this._exactKey(
                        service.serviceID,
                        component.componentID
                    ),
                    variable
                );
            }
        }

        variables.sort((left, right) => {
            if (left.options.length !== right.options.length) {
                return left.options.length - right.options.length;
            }

            const leftMaxCPU = Math.max(
                ...left.options.map(option =>
                    this._resource(option.version.characteristics, 'cpu')
                )
            );

            const rightMaxCPU = Math.max(
                ...right.options.map(option =>
                    this._resource(option.version.characteristics, 'cpu')
                )
            );

            return rightMaxCPU - leftMaxCPU;
        });

        return variables;
    }

    _buildServicePlans() {
        const plans = [];

        for (const service of this.services) {
            const components = service.components ?? [];
            const successors = Array.from(
                { length: components.length },
                () => []
            );
            const indegree = new Array(components.length).fill(0);

            for (let source = 0; source < components.length; source++) {
                for (let destination = 0; destination < components.length; destination++) {
                    if (source === destination) {
                        continue;
                    }

                    if (
                        this.componentConnections?.[source]?.[destination] === 1
                    ) {
                        successors[source].push(destination);
                        indegree[destination]++;
                    }
                }
            }

            const queue = [];
            for (let i = 0; i < indegree.length; i++) {
                if (indegree[i] === 0) {
                    queue.push(i);
                }
            }

            const topologicalOrder = [];
            const indegreeCopy = [...indegree];

            while (queue.length > 0) {
                const current = queue.shift();
                topologicalOrder.push(current);

                for (const successor of successors[current]) {
                    indegreeCopy[successor]--;
                    if (indegreeCopy[successor] === 0) {
                        queue.push(successor);
                    }
                }
            }

            if (topologicalOrder.length !== components.length) {
                throw new Error(
                    `OPT requires a DAG; service ${service.serviceID} component graph contains a cycle.`
                );
            }

            const variables = components.map(component => {
                const variable = this._exactVariableByKey.get(
                    this._exactKey(service.serviceID, component.componentID)
                );

                if (!variable) {
                    throw new Error(
                        `OPT internal error: missing decision variable for service ` +
                        `${service.serviceID}, component ${component.componentID}.`
                    );
                }

                return variable;
            });

            const forcedNodeIDs = new Set();
            for (const variable of variables) {
                if (variable.endpoint !== undefined) {
                    forcedNodeIDs.add(variable.endpoint);
                }
            }

            plans.push({
                service,
                components,
                variables,
                successors,
                topologicalOrder,
                forcedNodeIDs
            });
        }

        return plans;
    }

    _noContentionEdgeDelay(service, sourceGene, destinationGene) {
        const sourceIndex = this._infraIndex(sourceGene[3]);
        const destinationIndex = this._infraIndex(destinationGene[3]);

        if (sourceIndex === destinationIndex) {
            return 0;
        }

        const link = this.infraConnections?.[sourceIndex]?.[destinationIndex];
        if (!Array.isArray(link) || link.length < 2) {
            throw new Error(
                `OPT missing infrastructure link ${sourceGene[3]} -> ${destinationGene[3]}.`
            );
        }

        const bandwidth = this._validatePositiveNumber(
            link[0],
            `OPT bandwidth ${sourceGene[3]} -> ${destinationGene[3]}`
        );

        const propagationDelay = this._validateNonNegativeNumber(
            link[1],
            `OPT propagation delay ${sourceGene[3]} -> ${destinationGene[3]}`
        );

        const sourceComponent = this._component(service, sourceGene[1]);
        const sourceVersion = this._version(sourceComponent, sourceGene[2]);
        const dataSize = this._dataSize(
            sourceVersion.characteristics,
            `OPT source data size service ${service.serviceID}, component ${sourceComponent.componentID}`
        );

        return dataSize / bandwidth + propagationDelay;
    }

    _edgeLowerBound(
        service,
        sourceVariable,
        destinationVariable,
        assigned
    ) {
        const sourceAssigned = assigned.get(
            this._exactKey(
                service.serviceID,
                sourceVariable.component.componentID
            )
        );

        const destinationAssigned = assigned.get(
            this._exactKey(
                service.serviceID,
                destinationVariable.component.componentID
            )
        );

        if (sourceAssigned && destinationAssigned) {
            return this._noContentionEdgeDelay(
                service,
                sourceAssigned,
                destinationAssigned
            );
        }

        let cacheKey;

        if (sourceAssigned) {
            cacheKey = JSON.stringify([
                'source',
                service.serviceID,
                sourceVariable.component.componentID,
                destinationVariable.component.componentID,
                this._exactGeneKey(sourceAssigned)
            ]);
        }
        else if (destinationAssigned) {
            cacheKey = JSON.stringify([
                'destination',
                service.serviceID,
                sourceVariable.component.componentID,
                destinationVariable.component.componentID,
                this._exactGeneKey(destinationAssigned)
            ]);
        }
        else {
            cacheKey = JSON.stringify([
                'none',
                service.serviceID,
                sourceVariable.component.componentID,
                destinationVariable.component.componentID
            ]);
        }

        if (this._edgeLowerBoundCache.has(cacheKey)) {
            return this._edgeLowerBoundCache.get(cacheKey);
        }

        const sourceGenes = sourceAssigned
            ? [sourceAssigned]
            : sourceVariable.options.map(option => option.gene);

        const destinationGenes = destinationAssigned
            ? [destinationAssigned]
            : destinationVariable.options.map(option => option.gene);

        let minimum = Infinity;

        for (const sourceGene of sourceGenes) {
            for (const destinationGene of destinationGenes) {
                const delay = this._noContentionEdgeDelay(
                    service,
                    sourceGene,
                    destinationGene
                );

                if (delay < minimum) {
                    minimum = delay;
                }
            }
        }

        if (!Number.isFinite(minimum)) {
            throw new Error(
                `OPT could not derive a finite lower-bound delay for service ${service.serviceID}.`
            );
        }

        this._edgeLowerBoundCache.set(cacheKey, minimum);
        return minimum;
    }

    _responseTimeLowerBound(servicePlans, assigned) {
        let total = 0;

        for (const plan of servicePlans) {
            const earliestStart = new Array(plan.components.length).fill(0);
            const finish = new Array(plan.components.length).fill(0);

            for (const currentIndex of plan.topologicalOrder) {
                const variable = plan.variables[currentIndex];
                const assignedGene = assigned.get(
                    this._exactKey(
                        plan.service.serviceID,
                        variable.component.componentID
                    )
                );

                const executionTime = assignedGene
                    ? this._executionTimeForGene(assignedGene)
                    : variable.minExecutionTime;

                finish[currentIndex] =
                    earliestStart[currentIndex] + executionTime;

                for (const successorIndex of plan.successors[currentIndex]) {
                    const edgeDelay = this._edgeLowerBound(
                        plan.service,
                        variable,
                        plan.variables[successorIndex],
                        assigned
                    );

                    earliestStart[successorIndex] = Math.max(
                        earliestStart[successorIndex],
                        finish[currentIndex] + edgeDelay
                    );
                }
            }

            total += Math.max(0, ...finish);
        }

        return total;
    }

    _platformReliabilityUpperBound(servicePlans, assigned) {
        if (servicePlans.length === 0) {
            return 0;
        }

        let total = 0;

        for (const plan of servicePlans) {
            const nodeIDs = new Set(plan.forcedNodeIDs);

            for (const variable of plan.variables) {
                const gene = assigned.get(
                    this._exactKey(
                        plan.service.serviceID,
                        variable.component.componentID
                    )
                );

                if (gene) {
                    nodeIDs.add(gene[3]);
                }
            }

            let reliability = 1;
            for (const nodeID of nodeIDs) {
                const node = this._node(nodeID);
                if (!node) {
                    reliability = 0;
                    break;
                }
                reliability *= this._nodeReliability(node);
            }

            total += reliability;
        }

        return total / servicePlans.length;
    }

    _serviceReliabilityUpperBound(servicePlans, assigned) {
        if (servicePlans.length === 0) {
            return 0;
        }

        let total = 0;

        for (const plan of servicePlans) {
            let reliability = 1;

            for (const variable of plan.variables) {
                const gene = assigned.get(
                    this._exactKey(
                        plan.service.serviceID,
                        variable.component.componentID
                    )
                );

                if (gene) {
                    const version = this._version(
                        variable.component,
                        gene[2]
                    );
                    reliability *= this._versionReliability(version);
                }
                else {
                    reliability *= variable.maxVersionReliability;
                }
            }

            total += reliability;
        }

        return total / servicePlans.length;
    }

    _qualityLowerBound(servicePlans, assigned) {
        const maxResponseTime = this._responseTimeUpperBoundCached();

        const responseLowerBound =
            this._responseTimeLowerBound(
                servicePlans,
                assigned
            );

        const platformUpperBound =
            this._platformReliabilityUpperBound(
                servicePlans,
                assigned
            );

        const serviceUpperBound =
            this._serviceReliabilityUpperBound(
                servicePlans,
                assigned
            );

        return (
            0.33 * responseLowerBound / maxResponseTime -
            0.33 * platformUpperBound -
            0.33 * serviceUpperBound
        );
    }

    _tryIncumbent(solution, source) {
        let quality;

        try {
            quality = this.quality([solution])[0];
        }
        catch (error) {
            if (error instanceof CandidateInfeasibleError) {
                return false;
            }
            throw error;
        }

        if (!Number.isFinite(quality)) {
            return false;
        }

        if (quality < this.bestQuality) {
            this.bestQuality = quality;
            this.bestSolution = this.deepClone(solution);
            this.incumbentSource = source;
            this.incumbentUpdates++;
            return true;
        }

        return false;
    }

    _warmStartExactSearch() {
        if (!this.warmStart) {
            return;
        }

        const lowestCPU = (a, b) =>
            this._resource(a.characteristics, 'cpu') -
            this._resource(b.characteristics, 'cpu');

        const highestCPU = (a, b) =>
            this._resource(b.characteristics, 'cpu') -
            this._resource(a.characteristics, 'cpu');

        const highestReliabilityVersion = (a, b) =>
            this._versionReliability(b) -
            this._versionReliability(a);

        const highestNodeCPU = (a, b) =>
            this._resource(b.characteristics, 'cpu') -
            this._resource(a.characteristics, 'cpu');

        const lowestNodeCPU = (a, b) =>
            this._resource(a.characteristics, 'cpu') -
            this._resource(b.characteristics, 'cpu');

        const highestNodeReliability = (a, b) =>
            this._nodeReliability(b) -
            this._nodeReliability(a);

        const strategies = [
            {
                name: 'OPT-warm-TCA',
                priority: 'node-first'
            },
            {
                name: 'OPT-warm-MP',
                versionComparator: lowestCPU,
                nodeComparator: highestNodeCPU,
                priority: 'version-first'
            },
            {
                name: 'OPT-warm-LP',
                versionComparator: highestCPU,
                nodeComparator: lowestNodeCPU,
                priority: 'version-first'
            },
            {
                name: 'OPT-warm-MR',
                versionComparator: highestReliabilityVersion,
                nodeComparator: highestNodeReliability,
                priority: 'version-first'
            }
        ];

        for (const strategy of strategies) {
            this.warmStartCandidates++;
            const capacity = this._capacityState();
            const solution = [];
            let feasible = true;

            try {
                for (const service of this.services) {
                    for (const component of service.components ?? []) {
                        this._heuristicPlaceComponent({
                            capacity,
                            solution,
                            service,
                            component,
                            solverName: strategy.name,
                            versionComparator: strategy.versionComparator,
                            nodeComparator: strategy.nodeComparator,
                            priority: strategy.priority
                        });
                    }
                }
            }
            catch (error) {
                if (error instanceof CandidateInfeasibleError) {
                    feasible = false;
                }
                else {
                    throw error;
                }
            }

            if (!feasible) {
                continue;
            }

            this.warmStartFeasible++;
            this._tryIncumbent(
                solution,
                strategy.name
            );
        }
    }

    _configurationResourceUse(genes) {
        const byNode = new Map();

        for (const gene of genes) {
            const service = this._service(gene[0]);
            const component = this._component(service, gene[1]);
            const version = this._version(component, gene[2]);
            const characteristics = version.characteristics ?? {};

            if (!byNode.has(gene[3])) {
                byNode.set(gene[3], {
                    nodeID: gene[3],
                    cpu: 0,
                    memory: 0,
                    disk: 0
                });
            }

            const use = byNode.get(gene[3]);
            use.cpu += this._resource(characteristics, 'cpu');
            use.memory += this._resource(characteristics, 'memory');
            use.disk += this._resource(characteristics, 'disk');
        }

        return [...byNode.values()];
    }

    _configurationFitsCapacity(capacity, configuration) {
        for (const use of configuration.resourceUse) {
            const node = capacity.get(use.nodeID);
            if (!node) {
                return false;
            }

            if (
                this._resource(node.characteristics, 'cpu') < use.cpu ||
                this._resource(node.characteristics, 'memory') < use.memory ||
                this._resource(node.characteristics, 'disk') < use.disk
            ) {
                return false;
            }
        }

        return true;
    }

    _enumerateServiceConfigurations(plan) {
        const capacity = this._capacityState();
        const solution = [];
        const configurations = [];
        const maxResponseTime = this._responseTimeUpperBoundCached();

        const enumerate = componentIndex => {
            if (componentIndex >= plan.variables.length) {
                const genes = this.deepClone(solution);
                const responseTime = this.criticalPathResponseTime(
                    genes,
                    [plan.service],
                    genes
                );
                const platformReliability = this.infraReliability(
                    genes,
                    [plan.service]
                );
                const serviceReliability = this.serviceReliability(
                    genes,
                    [plan.service]
                );

                configurations.push({
                    genes,
                    resourceUse:
                        this._configurationResourceUse(genes),
                    responseTime,
                    platformReliability,
                    serviceReliability,
                    localScore:
                        0.33 * responseTime / maxResponseTime -
                        0.33 * platformReliability -
                        0.33 * serviceReliability
                });
                return;
            }

            const variable = plan.variables[componentIndex];

            for (const option of variable.options) {
                const freeNode = capacity.get(option.nodeID);
                if (!freeNode || !this._fits(freeNode, option.version)) {
                    continue;
                }

                const before = this.deepClone(freeNode.characteristics);
                this._consume(freeNode, option.version);
                solution.push(option.gene);

                enumerate(componentIndex + 1);

                solution.pop();
                freeNode.characteristics = before;
            }
        };

        enumerate(0);

        if (configurations.length === 0) {
            throw new CandidateInfeasibleError(
                `OPT found no feasible complete configuration for service ${plan.service.serviceID}.`
            );
        }

        configurations.sort(
            (left, right) =>
                left.localScore - right.localScore
        );

        plan.configurations = configurations;
        plan.minStandaloneResponse = Math.min(
            ...configurations.map(configuration => configuration.responseTime)
        );
        plan.maxPlatformReliability = Math.max(
            ...configurations.map(configuration => configuration.platformReliability)
        );
        plan.maxServiceReliability = Math.max(
            ...configurations.map(configuration => configuration.serviceReliability)
        );

        return configurations;
    }

    _applyServiceConfiguration(capacity, configuration) {
        const beforeByNode = new Map();

        for (const gene of configuration.genes) {
            const service = this._service(gene[0]);
            const component = this._component(service, gene[1]);
            const version = this._version(component, gene[2]);
            const node = capacity.get(gene[3]);

            if (!node || !this._fits(node, version)) {
                for (const [nodeID, characteristics] of beforeByNode) {
                    const restoreNode = capacity.get(nodeID);
                    if (restoreNode) {
                        restoreNode.characteristics = characteristics;
                    }
                }
                return null;
            }

            if (!beforeByNode.has(gene[3])) {
                beforeByNode.set(
                    gene[3],
                    this.deepClone(node.characteristics)
                );
            }

            this._consume(node, version);
        }

        return beforeByNode;
    }

    _restoreServiceConfiguration(capacity, beforeByNode) {
        for (const [nodeID, characteristics] of beforeByNode) {
            const node = capacity.get(nodeID);
            if (node) {
                node.characteristics = characteristics;
            }
        }
    }

    _serviceConfigurationLowerBound(
        orderedPlans,
        selectedConfigurations,
        depth,
        capacity
    ) {
        const totalServices = orderedPlans.length;
        const partialGenes = [];
        const assignedServices = [];

        let platformUpperTotal = 0;
        let serviceUpperTotal = 0;

        for (let index = 0; index < depth; index++) {
            const configuration = selectedConfigurations[index];
            if (!configuration) {
                throw new Error('OPT internal error: missing selected service configuration.');
            }

            partialGenes.push(...configuration.genes);
            assignedServices.push(orderedPlans[index].service);
            platformUpperTotal += configuration.platformReliability;
            serviceUpperTotal += configuration.serviceReliability;
        }

        let responseLowerBound = 0;

        if (partialGenes.length > 0) {

            responseLowerBound = this.criticalPathResponseTime(
                partialGenes,
                assignedServices,
                partialGenes
            );
        }

        for (let index = depth; index < orderedPlans.length; index++) {
            const plan = orderedPlans[index];

            let minimumResponse = Infinity;
            let maximumPlatformReliability = -Infinity;
            let maximumServiceReliability = -Infinity;
            let feasibleConfigurationExists = false;

            for (const configuration of plan.configurations) {
                if (
                    capacity &&
                    !this._configurationFitsCapacity(
                        capacity,
                        configuration
                    )
                ) {
                    continue;
                }

                feasibleConfigurationExists = true;
                minimumResponse = Math.min(
                    minimumResponse,
                    configuration.responseTime
                );
                maximumPlatformReliability = Math.max(
                    maximumPlatformReliability,
                    configuration.platformReliability
                );
                maximumServiceReliability = Math.max(
                    maximumServiceReliability,
                    configuration.serviceReliability
                );
            }

            if (!feasibleConfigurationExists) {
                return Infinity;
            }

            responseLowerBound += minimumResponse;
            platformUpperTotal += maximumPlatformReliability;
            serviceUpperTotal += maximumServiceReliability;
        }

        return (
            0.33 * responseLowerBound / this._responseTimeUpperBoundCached() -
            0.33 * (platformUpperTotal / totalServices) -
            0.33 * (serviceUpperTotal / totalServices)
        );
    }

    _coordinateWarmStart(servicePlans, maxPasses = 2) {
        if (!this.warmStart || !this.bestSolution) {
            return;
        }

        let current = this.deepClone(this.bestSolution);
        let currentQuality = this.bestQuality;

        for (let pass = 0; pass < maxPasses; pass++) {
            let improved = false;

            for (const plan of servicePlans) {
                const otherGenes = current.filter(
                    gene => gene[0] !== plan.service.serviceID
                );

                let serviceBestSolution = current;
                let serviceBestQuality = currentQuality;

                for (const configuration of plan.configurations) {
                    const candidate = [
                        ...otherGenes,
                        ...configuration.genes
                    ];

                    const quality = this.quality([candidate])[0];
                    if (
                        Number.isFinite(quality) &&
                        quality < serviceBestQuality
                    ) {
                        serviceBestQuality = quality;
                        serviceBestSolution = candidate;
                    }
                }

                if (serviceBestQuality < currentQuality) {
                    currentQuality = serviceBestQuality;
                    current = this.deepClone(serviceBestSolution);
                    improved = true;

                    if (currentQuality < this.bestQuality) {
                        this.bestQuality = currentQuality;
                        this.bestSolution = this.deepClone(current);
                        this.incumbentSource = 'OPT-coordinate-warm-start';
                        this.incumbentUpdates++;
                    }
                }
            }

            if (!improved) {
                break;
            }
        }
    }

    _searchServiceConfigurations(
        orderedPlans,
        depth,
        capacity,
        selectedConfigurations
    ) {
        this.searchStates++;

        if (depth >= orderedPlans.length) {
            const solution = selectedConfigurations.flatMap(
                configuration => configuration.genes
            );

            this.completeSolutionsEvaluated++;
            this._tryIncumbent(solution, 'exact-search');
            return;
        }

        const plan = orderedPlans[depth];

        for (const configuration of plan.configurations) {
            const beforeByNode = this._applyServiceConfiguration(
                capacity,
                configuration
            );

            if (!beforeByNode) {
                this.prunedByCapacity++;
                continue;
            }

            selectedConfigurations.push(configuration);

            const lowerBound = this._serviceConfigurationLowerBound(
                orderedPlans,
                selectedConfigurations,
                depth + 1,
                capacity
            );

            if (
                Number.isFinite(this.bestQuality) &&
                lowerBound >= this.bestQuality + this.boundEpsilon
            ) {
                this.prunedByBound++;
            }
            else {
                this._searchServiceConfigurations(
                    orderedPlans,
                    depth + 1,
                    capacity,
                    selectedConfigurations
                );
            }

            selectedConfigurations.pop();
            this._restoreServiceConfiguration(
                capacity,
                beforeByNode
            );
        }
    }

    _searchExact(
        variables,
        servicePlans,
        depth,
        capacity,
        partialSolution,
        assigned
    ) {
        this.searchStates++;

        if (depth >= variables.length) {
            this.completeSolutionsEvaluated++;
            this._tryIncumbent(
                partialSolution,
                'exact-search'
            );
            return;
        }

        const variable = variables[depth];
        const key = this._exactKey(
            variable.service.serviceID,
            variable.component.componentID
        );

        for (const option of variable.options) {
            const freeNode = capacity.get(option.nodeID);

            if (!freeNode || !this._fits(freeNode, option.version)) {
                this.prunedByCapacity++;
                continue;
            }

            const beforeCharacteristics =
                this.deepClone(freeNode.characteristics);

            this._consume(freeNode, option.version);
            partialSolution.push(option.gene);
            assigned.set(key, option.gene);

            const lowerBound =
                this._qualityLowerBound(
                    servicePlans,
                    assigned
                );

            if (
                Number.isFinite(this.bestQuality) &&
                lowerBound >=
                    this.bestQuality + this.boundEpsilon
            ) {
                this.prunedByBound++;
            }
            else {
                this._searchExact(
                    variables,
                    servicePlans,
                    depth + 1,
                    capacity,
                    partialSolution,
                    assigned
                );
            }

            assigned.delete(key);
            partialSolution.pop();
            freeNode.characteristics = beforeCharacteristics;
        }
    }

    run() {
        const startTime = performance.now();

        if (!Array.isArray(this.services) || this.services.length === 0) {
            throw new Error('OPT requires at least one service.');
        }

        this._buildExactVariables();
        const servicePlans = this._buildServicePlans();

        for (const plan of servicePlans) {
            this._enumerateServiceConfigurations(plan);
        }

        const orderedPlans = [...servicePlans].sort(
            (left, right) =>
                left.configurations.length - right.configurations.length
        );

        this.serviceConfigurationCounts =
            orderedPlans.map(plan => ({
                serviceID: plan.service.serviceID,
                count: plan.configurations.length
            }));

        this.serviceConfigurationsEnumerated =
            this.serviceConfigurationCounts.reduce(
                (sum, entry) => sum + entry.count,
                0
            );

        this._warmStartExactSearch();
        this._coordinateWarmStart(
            orderedPlans,
            2
        );

        const initialCapacity = this._capacityState();

        const rootLowerBound =
            this._serviceConfigurationLowerBound(
                orderedPlans,
                [],
                0,
                initialCapacity
            );

        this._searchServiceConfigurations(
            orderedPlans,
            0,
            initialCapacity,
            []
        );

        if (!this.bestSolution || !Number.isFinite(this.bestQuality)) {
            throw new CandidateInfeasibleError(
                'OPT exhausted the exact search space without finding a feasible placement.'
            );
        }

        this.assertFeasibleSolution(
            this.bestSolution,
            'OPT exact solution'
        );

        const runtime = performance.now() - startTime;

        return {
            servicePlacementResults:
                this.solutionAnalyser(
                    this.bestSolution
                ),
            runtime,
            fitness:
                this.bestQuality,
            solution:
                this.bestSolution,
            bestSolution:
                this.bestSolution,
            perServiceAnalysis:
                this.perServiceAnalysis(
                    this.bestSolution,
                    'OPT-per-service'
                ),
            optimalityProven: true,
            optimalityGap: 0,
            exactMethod:
                'service-configuration branch-and-bound',
            rootLowerBound,
            searchStates:
                this.searchStates,
            completeSolutionsEvaluated:
                this.completeSolutionsEvaluated,
            prunedByBound:
                this.prunedByBound,
            prunedByCapacity:
                this.prunedByCapacity,
            dominatedVersionsRemoved:
                this.dominatedVersionsRemoved,
            serviceConfigurationsEnumerated:
                this.serviceConfigurationsEnumerated,
            serviceConfigurationCounts:
                this.serviceConfigurationCounts,
            incumbentUpdates:
                this.incumbentUpdates,
            incumbentSource:
                this.incumbentSource,
            warmStartCandidates:
                this.warmStartCandidates,
            warmStartFeasible:
                this.warmStartFeasible
        };
    }
}


class nsgaII extends solutionOperation {

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

        const nsgaConfig =
            config.ans?.configsNSGAII;

        if (
            !nsgaConfig ||
            typeof nsgaConfig !== 'object' ||
            Array.isArray(nsgaConfig)
        ) {
            throw new Error(
                'configsNSGAII must be an object.'
            );
        }

        this.populationSize =
            nsgaConfig.populationSize;
        this.iterations =
            nsgaConfig.iteration;
        this.crossoverRate =
            nsgaConfig.crossoverRate;
        this.mutationRate =
            nsgaConfig.mutationRate;
        this.tournamentSize =
            nsgaConfig.tournamentSize ?? 2;

        this.offspringRegenerated = 0;
    }

    validateConfiguration(itr) {
        if (
            !Number.isInteger(this.populationSize) ||
            this.populationSize < 4
        ) {
            throw new Error(
                'NSGA-II populationSize must be an integer of at least 4.'
            );
        }

        if (
            !Number.isInteger(itr) ||
            itr < 0
        ) {
            throw new Error(
                'NSGA-II iteration count must be a non-negative integer.'
            );
        }

        for (const [name, value] of [
            ['crossoverRate', this.crossoverRate],
            ['mutationRate', this.mutationRate]
        ]) {
            if (
                typeof value !== 'number' ||
                !Number.isFinite(value) ||
                value < 0 ||
                value > 1
            ) {
                throw new Error(
                    `NSGA-II ${name} must be between 0 and 1.`
                );
            }
        }

        if (
            !Number.isInteger(this.tournamentSize) ||
            this.tournamentSize < 2 ||
            this.tournamentSize > this.populationSize
        ) {
            throw new Error(
                'NSGA-II tournamentSize must be an integer between 2 and populationSize.'
            );
        }
    }

    objectiveRecord(solution) {
        if (!this._isResourceFeasible(solution)) {
            return {
                vector: [
                    Number.POSITIVE_INFINITY,
                    Number.POSITIVE_INFINITY,
                    Number.POSITIVE_INFINITY
                ],
                responseTime: Number.POSITIVE_INFINITY,
                platformReliability: 0,
                serviceReliability: 0,
                feasible: false
            };
        }

        const values =
            this.calculateAll(solution);

        const responseTime =
            Number(values.ResponseTime);
        const platformReliability =
            Number(values.PlatformReliability);
        const serviceReliability =
            Number(values.ServiceReliability);

        if (
            !Number.isFinite(responseTime) ||
            !Number.isFinite(platformReliability) ||
            !Number.isFinite(serviceReliability)
        ) {
            throw new Error(
                'NSGA-II objective evaluation produced a non-finite value.'
            );
        }

        return {
            vector: [
                responseTime,
                1 - platformReliability,
                1 - serviceReliability
            ],
            responseTime,
            platformReliability,
            serviceReliability,
            feasible: true
        };
    }

    evaluatePopulation(population) {
        return population.map(
            solution => ({
                solution:
                    this.deepClone(solution),
                objectives:
                    this.objectiveRecord(solution),
                rank:
                    Number.POSITIVE_INFINITY,
                crowdingDistance:
                    0
            })
        );
    }

    dominates(left, right) {
        const a = left.objectives.vector;
        const b = right.objectives.vector;

        let strictlyBetter = false;

        for (let i = 0; i < a.length; i++) {
            if (a[i] > b[i]) {
                return false;
            }

            if (a[i] < b[i]) {
                strictlyBetter = true;
            }
        }

        return strictlyBetter;
    }

    fastNonDominatedSort(individuals) {
        const dominated =
            individuals.map(() => []);
        const dominationCount =
            individuals.map(() => 0);
        const fronts = [[]];

        for (let p = 0; p < individuals.length; p++) {
            for (let q = 0; q < individuals.length; q++) {
                if (p === q) {
                    continue;
                }

                if (
                    this.dominates(
                        individuals[p],
                        individuals[q]
                    )
                ) {
                    dominated[p].push(q);
                }
                else if (
                    this.dominates(
                        individuals[q],
                        individuals[p]
                    )
                ) {
                    dominationCount[p]++;
                }
            }

            if (dominationCount[p] === 0) {
                individuals[p].rank = 0;
                fronts[0].push(p);
            }
        }

        let frontIndex = 0;

        while (
            frontIndex < fronts.length &&
            fronts[frontIndex].length > 0
        ) {
            const nextFront = [];

            for (const p of fronts[frontIndex]) {
                for (const q of dominated[p]) {
                    dominationCount[q]--;

                    if (dominationCount[q] === 0) {
                        individuals[q].rank =
                            frontIndex + 1;
                        nextFront.push(q);
                    }
                }
            }

            if (nextFront.length > 0) {
                fronts.push(nextFront);
            }

            frontIndex++;
        }

        return fronts.map(
            front =>
                front.map(index => individuals[index])
        );
    }

    assignCrowdingDistance(front) {
        if (front.length === 0) {
            return;
        }

        for (const individual of front) {
            individual.crowdingDistance = 0;
        }

        if (front.length <= 2) {
            for (const individual of front) {
                individual.crowdingDistance =
                    Number.POSITIVE_INFINITY;
            }
            return;
        }

        const dimensions =
            front[0].objectives.vector.length;

        for (let objective = 0; objective < dimensions; objective++) {
            const sorted =
                [...front].sort(
                    (a, b) =>
                        a.objectives.vector[objective] -
                        b.objectives.vector[objective]
                );

            sorted[0].crowdingDistance =
                Number.POSITIVE_INFINITY;
            sorted[sorted.length - 1].crowdingDistance =
                Number.POSITIVE_INFINITY;

            const minValue =
                sorted[0].objectives.vector[objective];
            const maxValue =
                sorted[sorted.length - 1]
                    .objectives.vector[objective];
            const range =
                maxValue - minValue;

            if (
                !Number.isFinite(range) ||
                range <= 0
            ) {
                continue;
            }

            for (let i = 1; i < sorted.length - 1; i++) {
                if (
                    !Number.isFinite(
                        sorted[i].crowdingDistance
                    )
                ) {
                    continue;
                }

                const previous =
                    sorted[i - 1]
                        .objectives.vector[objective];
                const next =
                    sorted[i + 1]
                        .objectives.vector[objective];

                sorted[i].crowdingDistance +=
                    (next - previous) / range;
            }
        }
    }

    rankPopulation(population) {
        const individuals =
            this.evaluatePopulation(population);
        const fronts =
            this.fastNonDominatedSort(individuals);

        for (const front of fronts) {
            this.assignCrowdingDistance(front);
        }

        return {
            individuals,
            fronts
        };
    }

    betterTournamentCandidate(left, right) {
        if (left.rank < right.rank) {
            return left;
        }

        if (right.rank < left.rank) {
            return right;
        }

        if (
            left.crowdingDistance >
            right.crowdingDistance
        ) {
            return left;
        }

        if (
            right.crowdingDistance >
            left.crowdingDistance
        ) {
            return right;
        }

        return Math.random() < 0.5
            ? left
            : right;
    }

    tournamentSelect(individuals) {
        let winner =
            individuals[
                Math.floor(
                    Math.random() * individuals.length
                )
            ];

        for (let i = 1; i < this.tournamentSize; i++) {
            const challenger =
                individuals[
                    Math.floor(
                        Math.random() * individuals.length
                    )
                ];

            winner =
                this.betterTournamentCandidate(
                    winner,
                    challenger
                );
        }

        return this.deepClone(
            winner.solution
        );
    }

    crossover(parent1, parent2) {
        const child1 =
            this.deepClone(parent1);
        const child2 =
            this.deepClone(parent2);

        if (Math.random() >= this.crossoverRate) {
            return [child1, child2];
        }

        if (child1.length !== child2.length) {
            throw new Error(
                'NSGA-II parents must have the same number of genes.'
            );
        }

        for (let i = 0; i < child1.length; i++) {
            if (
                child1[i][0] !== child2[i][0] ||
                child1[i][1] !== child2[i][1]
            ) {
                throw new Error(
                    'NSGA-II parent gene ordering is inconsistent.'
                );
            }

            if (Math.random() < 0.5) {
                child1[i][2] = parent2[i][2];
                child2[i][2] = parent1[i][2];
            }

            if (Math.random() < 0.5) {
                child1[i][3] = parent2[i][3];
                child2[i][3] = parent1[i][3];
            }
        }

        return [child1, child2];
    }

    mutate(solution) {
        const candidate =
            this.deepClone(solution);

        for (const gene of candidate) {
            const service =
                this._service(gene[0]);
            const component =
                this._component(
                    service,
                    gene[1]
                );

            if (Math.random() < this.mutationRate) {
                const versions =
                    (component.versions ?? [])
                        .map(
                            version =>
                                version.versionNumber
                        );

                if (versions.length === 0) {
                    throw new Error(
                        `NSGA-II component ${component.componentID} has no versions.`
                    );
                }

                gene[2] =
                    versions[
                        Math.floor(
                            Math.random() * versions.length
                        )
                    ];
            }

            const endpoint =
                this._endpoint(
                    service,
                    component
                );

            if (endpoint !== undefined) {
                gene[3] = endpoint;
            }
            else if (
                Math.random() < this.mutationRate
            ) {
                if (this.computingNodes.length === 0) {
                    throw new Error(
                        'NSGA-II cannot mutate a non-endpoint component without computing nodes.'
                    );
                }

                gene[3] =
                    this.computingNodes[
                        Math.floor(
                            Math.random() *
                            this.computingNodes.length
                        )
                    ].nodeID;
            }
        }

        return candidate;
    }

    repairOrRegenerate(solution) {
        const validated =
            this.validation(
                this.deepClone(solution)
            );

        try {
            return this.healing(validated);
        }
        catch (error) {
            if (
                !(error instanceof CandidateInfeasibleError)
            ) {
                throw error;
            }

            this.offspringRegenerated++;

            const generated =
                this.initialSolutions(1);

            if (
                !Array.isArray(generated) ||
                generated.length !== 1
            ) {
                throw new Error(
                    'NSGA-II could not regenerate an infeasible offspring.'
                );
            }

            return generated[0];
        }
    }

    makeOffspring(rankedPopulation) {
        const offspring = [];

        while (offspring.length < this.populationSize) {
            const parent1 =
                this.tournamentSelect(
                    rankedPopulation.individuals
                );
            const parent2 =
                this.tournamentSelect(
                    rankedPopulation.individuals
                );

            const children =
                this.crossover(
                    parent1,
                    parent2
                );

            for (const child of children) {
                if (offspring.length >= this.populationSize) {
                    break;
                }

                offspring.push(
                    this.repairOrRegenerate(
                        this.mutate(child)
                    )
                );
            }
        }

        return offspring;
    }

    environmentalSelection(combinedPopulation) {
        const ranked =
            this.rankPopulation(
                combinedPopulation
            );
        const nextPopulation = [];

        for (const front of ranked.fronts) {
            if (
                nextPopulation.length +
                front.length <=
                this.populationSize
            ) {
                for (const individual of front) {
                    nextPopulation.push(
                        this.deepClone(
                            individual.solution
                        )
                    );
                }
                continue;
            }

            const remaining =
                this.populationSize -
                nextPopulation.length;

            const byCrowding =
                [...front].sort(
                    (a, b) => {
                        const aInfinite =
                            !Number.isFinite(a.crowdingDistance);
                        const bInfinite =
                            !Number.isFinite(b.crowdingDistance);

                        if (aInfinite && !bInfinite) {
                            return -1;
                        }

                        if (bInfinite && !aInfinite) {
                            return 1;
                        }

                        if (aInfinite && bInfinite) {
                            return 0;
                        }

                        return (
                            b.crowdingDistance -
                            a.crowdingDistance
                        );
                    }
                );

            for (let i = 0; i < remaining; i++) {
                nextPopulation.push(
                    this.deepClone(
                        byCrowding[i].solution
                    )
                );
            }

            break;
        }

        return nextPopulation;
    }

    uniqueFront(front) {
        const seen = new Set();
        const unique = [];

        for (const individual of front) {
            const key =
                JSON.stringify(
                    individual.solution
                );

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            unique.push(individual);
        }

        return unique;
    }

    convergenceRecord(front) {
        if (front.length === 0) {
            return {
                paretoFrontSize: 0,
                minResponseTime: null,
                maxPlatformReliability: null,
                maxServiceReliability: null
            };
        }

        return {
            paretoFrontSize:
                front.length,
            minResponseTime:
                Math.min(
                    ...front.map(
                        item =>
                            item.objectives.responseTime
                    )
                ),
            maxPlatformReliability:
                Math.max(
                    ...front.map(
                        item =>
                            item.objectives.platformReliability
                    )
                ),
            maxServiceReliability:
                Math.max(
                    ...front.map(
                        item =>
                            item.objectives.serviceReliability
                    )
                )
        };
    }

    run(
        iniSols = undefined,
        itr = this.iterations
    ) {
        const startTime =
            performance.now();

        this.validateConfiguration(itr);

        if (iniSols === undefined) {
            iniSols =
                this.initialSolutions(
                    this.populationSize
                );
        }

        let population =
            this.deepClone(
                Array.isArray(iniSols)
                    ? iniSols
                    : []
            );

        if (population.length > this.populationSize) {
            population =
                population.slice(
                    0,
                    this.populationSize
                );
        }

        while (population.length < this.populationSize) {
            population.push(
                this.initialSolutions(1)[0]
            );
        }

        population =
            population.map(
                solution =>
                    this.repairOrRegenerate(solution)
            );

        const convergence = {
            paretoFrontSize: [],
            minResponseTime: [],
            maxPlatformReliability: [],
            maxServiceReliability: []
        };

        for (let generation = 0; generation < itr; generation++) {
            const rankedParents =
                this.rankPopulation(population);

            const offspring =
                this.makeOffspring(
                    rankedParents
                );

            population =
                this.environmentalSelection([
                    ...population,
                    ...offspring
                ]);

            const rankedCurrent =
                this.rankPopulation(population);
            const currentFront =
                this.uniqueFront(
                    rankedCurrent.fronts[0] ?? []
                );
            const record =
                this.convergenceRecord(
                    currentFront
                );

            convergence.paretoFrontSize.push(
                record.paretoFrontSize
            );
            convergence.minResponseTime.push(
                record.minResponseTime
            );
            convergence.maxPlatformReliability.push(
                record.maxPlatformReliability
            );
            convergence.maxServiceReliability.push(
                record.maxServiceReliability
            );
        }

        const finalRanked =
            this.rankPopulation(population);
        const paretoIndividuals =
            this.uniqueFront(
                finalRanked.fronts[0] ?? []
            );

        if (paretoIndividuals.length === 0) {
            throw new Error(
                'NSGA-II finished without a Pareto-front solution.'
            );
        }

        for (const individual of paretoIndividuals) {
            this.assertFeasibleSolution(
                individual.solution,
                'NSGA-II Pareto-front solution'
            );
        }

        const paretoSolutions =
            paretoIndividuals.map(
                individual =>
                    individual.solution
            );
        const scalarQualities =
            this.quality(
                paretoSolutions
            );

        if (
            scalarQualities.some(
                value => !Number.isFinite(value)
            )
        ) {
            throw new Error(
                'NSGA-II Pareto front contains a non-finite scalar quality.'
            );
        }

        let representativeIndex = 0;

        for (let i = 1; i < scalarQualities.length; i++) {
            if (
                scalarQualities[i] <
                scalarQualities[representativeIndex]
            ) {
                representativeIndex = i;
            }
        }

        const representative =
            this.deepClone(
                paretoIndividuals[
                    representativeIndex
                ].solution
            );

        this.assertFeasibleSolution(
            representative,
            'NSGA-II representative solution'
        );

        const paretoFront =
            paretoIndividuals.map(
                (individual, index) => ({
                    objectives: {
                        responseTime:
                            individual.objectives.responseTime,
                        platformReliability:
                            individual.objectives.platformReliability,
                        serviceReliability:
                            individual.objectives.serviceReliability
                    },
                    scalarQuality:
                        scalarQualities[index],
                    solution:
                        this.deepClone(
                            individual.solution
                        )
                })
            );

        const exeTime =
            performance.now() - startTime;

        return {
            servicePlacementResults:
                this.solutionAnalyser(
                    representative
                ),
            runtime:
                exeTime,
            fitness:
                scalarQualities[
                    representativeIndex
                ],
            solution:
                representative,
            representativeSolution:
                representative,
            representativeSelection:
                'lowest existing scalar quality among the final non-dominated front',
            paretoFront,
            paretoFrontSize:
                paretoFront.length,
            objectives: [
                {
                    name: 'responseTime',
                    direction: 'minimize'
                },
                {
                    name: 'platformReliability',
                    direction: 'maximize'
                },
                {
                    name: 'serviceReliability',
                    direction: 'maximize'
                }
            ],
            population:
                population,
            convergence,
            offspringRegenerated:
                this.offspringRegenerated,
            perServiceAnalysis:
                this.perServiceAnalysis(
                    representative,
                    'NSGAII-per-service'
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

                // Version choice is mutable for every component.
                gene[2] =
                    this._randomChoice(
                        versionIDs
                    );

                const endpoint =
                    this._endpoint(
                        service,
                        component
                    );

                if (endpoint !== undefined) {

                    gene[3] =
                        endpoint;

                    continue;
                }

                if (computingNodeIDs.length === 0) {
                    throw new Error(
                        `Service ${service.serviceID}, component ${component.componentID} ` +
                        `requires computing-tier mutation, but no computing nodes are available.`
                    );
                }

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

class sineCosineAlgorithm extends solutionOperation {

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

        const scaConfig =
            config.ans?.configsSCA;

        if (
            !scaConfig ||
            typeof scaConfig !== 'object' ||
            Array.isArray(scaConfig)
        ) {
            throw new Error(
                'configsSCA must be an object.'
            );
        }

        this.numSolutions =
            scaConfig.populationSize;

        this.iteration =
            scaConfig.iteration;

        this.b =
            scaConfig.b;

        this.switchingProbability =
            scaConfig.switchingProbability ??
            0.5;
    }

    deepClone(value) {
        return JSON.parse(
            JSON.stringify(value)
        );
    }

    validateConfiguration(iterationCount) {

        if (
            !Number.isInteger(this.numSolutions) ||
            this.numSolutions <= 0
        ) {
            throw new Error(
                'SCA populationSize must be a positive integer.'
            );
        }

        if (
            !Number.isInteger(iterationCount) ||
            iterationCount < 0
        ) {
            throw new Error(
                'SCA iteration must be a non-negative integer.'
            );
        }

        if (
            typeof this.b !== 'number' ||
            !Number.isFinite(this.b) ||
            this.b < 0
        ) {
            throw new Error(
                'SCA b must be a finite non-negative number.'
            );
        }

        if (
            typeof this.switchingProbability !== 'number' ||
            !Number.isFinite(this.switchingProbability) ||
            this.switchingProbability < 0 ||
            this.switchingProbability > 1
        ) {
            throw new Error(
                'SCA switchingProbability must be a finite number between 0 and 1.'
            );
        }
    }

    bestSolution(solutions, qualities) {

        if (
            !Array.isArray(solutions) ||
            !Array.isArray(qualities) ||
            solutions.length === 0 ||
            solutions.length !== qualities.length
        ) {
            throw new Error(
                'SCA bestSolution requires equal-sized non-empty solution and quality arrays.'
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

        return {
            solution:
                this.deepClone(
                    solutions[bestIndex]
                ),

            quality:
                qualities[bestIndex],

            index:
                bestIndex
        };
    }

    _updateCategoricalVector(
        current,
        target,
        r1,
        trigValue,
        r3,
        label
    ) {

        if (
            !Array.isArray(current) ||
            !Array.isArray(target) ||
            current.length === 0 ||
            current.length !== target.length
        ) {
            throw new Error(
                `${label} vectors must be equal-sized non-empty arrays.`
            );
        }

        if (current.length === 1) {
            return current.slice();
        }

        return current.map(
            (value, index) => {
                const currentValue =
                    Number(value);

                const targetValue =
                    Number(target[index]);

                if (
                    !Number.isFinite(currentValue) ||
                    !Number.isFinite(targetValue)
                ) {
                    throw new Error(
                        `${label} contains a non-finite latent value.`
                    );
                }

                const updated =
                    currentValue +
                    r1 *
                    trigValue *
                    Math.abs(
                        r3 * targetValue -
                        currentValue
                    );

                if (!Number.isFinite(updated)) {
                    throw new Error(
                        `${label} update produced a non-finite latent value.`
                    );
                }

                return updated;
            }
        );
    }

    _movePopulation(
        positions,
        globalBestPosition,
        r1
    ) {

        const moved =
            this.deepClone(
                positions
            );

        for (
            let i = 0;
            i < moved.length;
            i++
        ) {
            for (
                let geneIndex = 0;
                geneIndex < moved[i].length;
                geneIndex++
            ) {
                const gene =
                    moved[i][geneIndex];

                const bestGene =
                    globalBestPosition[geneIndex];

                if (
                    !Array.isArray(gene) ||
                    gene.length < 4 ||
                    !Array.isArray(bestGene) ||
                    bestGene.length < 4
                ) {
                    throw new Error(
                        'SCA encountered a malformed latent gene.'
                    );
                }

                const r2 =
                    2 *
                    Math.PI *
                    Math.random();

                const r3 =
                    2 *
                    Math.random();

                const useSine =
                    Math.random() <
                    this.switchingProbability;

                const trigValue =
                    useSine
                        ? Math.sin(r2)
                        : Math.cos(r2);

                gene[2] =
                    this._updateCategoricalVector(
                        gene[2],
                        bestGene[2],
                        r1,
                        trigValue,
                        r3,
                        'SCA version'
                    );

                gene[3] =
                    this._updateCategoricalVector(
                        gene[3],
                        bestGene[3],
                        r1,
                        trigValue,
                        r3,
                        'SCA node'
                    );
            }
        }

        return moved;
    }

    run(
        iniSols = undefined,
        itr = this.iteration
    ) {

        const startTime =
            performance.now();

        this.validateConfiguration(
            itr
        );

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
                    'SCA initialSolutions(1) did not return a solution.'
                );
            }

            initialSolutions.push(
                this.deepClone(
                    generated[0]
                )
            );
        }

        if (initialSolutions.length === 0) {
            throw new Error(
                'SCA requires at least one initial solution.'
            );
        }


        let positions =
            this._encodeCategoricalSolutions(
                initialSolutions
            );

        let discreteSolutions =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    positions
                )
            );

        let qualities =
            this.quality(
                discreteSolutions
            );

        const initialBest =
            this.bestSolution(
                discreteSolutions,
                qualities
            );

        if (!Number.isFinite(initialBest.quality)) {
            throw new Error(
                'SCA could not obtain a finite-quality initial solution.'
            );
        }

        let globalBestQuality =
            initialBest.quality;

        let globalBestSolution =
            this.deepClone(
                initialBest.solution
            );

        let globalBestPosition =
            this.deepClone(
                positions[
                    initialBest.index
                ]
            );

        const convergenceBest = [];
        const convergenceMedian = [];
        const convergenceWorst = [];

        for (
            let iterationIndex = 1;
            iterationIndex <= itr;
            iterationIndex++
        ) {
            const r1 =
                this.b *
                (
                    1 -
                    iterationIndex /
                    Math.max(itr, 1)
                );

            positions =
                this._movePopulation(
                    positions,
                    globalBestPosition,
                    r1
                );

            discreteSolutions =
                this._decodeCategoricalSolutions(
                    this.deepClone(
                        positions
                    )
                );

            qualities =
                this.quality(
                    discreteSolutions
                );

            const iterationBest =
                this.bestSolution(
                    discreteSolutions,
                    qualities
                );

            if (
                iterationBest.quality <
                globalBestQuality
            ) {
                globalBestQuality =
                    iterationBest.quality;

                globalBestSolution =
                    this.deepClone(
                        iterationBest.solution
                    );

                globalBestPosition =
                    this.deepClone(
                        positions[
                            iterationBest.index
                        ]
                    );
            }

            const sorted =
                this.solutionsQualitySort(
                    discreteSolutions,
                    qualities
                );

            convergenceBest.push(
                sorted.bestQuality
            );

            convergenceMedian.push(
                sorted.medianQuality
            );

            convergenceWorst.push(
                sorted.worstQuality
            );
        }

        this.assertFeasibleSolution(
            globalBestSolution,
            'SCA best solution'
        );

        const exeTime =
            performance.now() -
            startTime;

        return {
            servicePlacementResults:
                this.solutionAnalyser(
                    globalBestSolution
                ),

            runtime:
                exeTime,

            fitness:
                globalBestQuality,

            bestSolution:
                globalBestSolution,

            solutions:
                discreteSolutions,

            solution:
                globalBestSolution,

            convergence: {
                best:
                    convergenceBest,

                median:
                    convergenceMedian,

                worst:
                    convergenceWorst
            },

            perServiceAnalysis:
                this.perServiceAnalysis(
                    globalBestSolution,
                    'SCA-per-service'
                )
        };
    }
}

class whaleOptimizationAlgorithm extends solutionOperation {

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

        const woaConfig =
            config.ans?.configsWOA;

        if (
            !woaConfig ||
            typeof woaConfig !== 'object' ||
            Array.isArray(woaConfig)
        ) {
            throw new Error(
                'configsWOA must be an object.'
            );
        }

        this.numPopulation =
            woaConfig.populationSize;

        this.iteration =
            woaConfig.iteration;


        this.a =
            woaConfig.a;


        this.l =
            woaConfig.l;


        this.b =
            woaConfig.b;


        this.coefficient_A =
            woaConfig.coefficient_A;

        this.coefficient_C =
            woaConfig.coefficient_C;

        this.switchingProbability =
            woaConfig.switchingProbability ??
            0.5;
    }

    deepClone(value) {
        return JSON.parse(
            JSON.stringify(value)
        );
    }

    validateConfiguration(iterationCount) {

        if (
            !Number.isInteger(this.numPopulation) ||
            this.numPopulation <= 0
        ) {
            throw new Error(
                'WOA populationSize must be a positive integer.'
            );
        }

        if (
            !Number.isInteger(iterationCount) ||
            iterationCount < 0
        ) {
            throw new Error(
                'WOA iteration must be a non-negative integer.'
            );
        }

        const nonNegativeFinite = [
            ['a', this.a],
            ['l', this.l],
            ['b', this.b],
            ['coefficient_A', this.coefficient_A],
            ['coefficient_C', this.coefficient_C]
        ];

        for (const [name, value] of nonNegativeFinite) {
            if (
                typeof value !== 'number' ||
                !Number.isFinite(value) ||
                value < 0
            ) {
                throw new Error(
                    `WOA ${name} must be a finite non-negative number.`
                );
            }
        }

        if (
            typeof this.switchingProbability !== 'number' ||
            !Number.isFinite(this.switchingProbability) ||
            this.switchingProbability < 0 ||
            this.switchingProbability > 1
        ) {
            throw new Error(
                'WOA switchingProbability must be a finite number between 0 and 1.'
            );
        }
    }

    bestAgent(whales, qualities = this.quality(whales)) {

        if (
            !Array.isArray(whales) ||
            !Array.isArray(qualities) ||
            whales.length === 0 ||
            whales.length !== qualities.length
        ) {
            throw new Error(
                'WOA bestAgent requires equal-sized non-empty whale and quality arrays.'
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

        return {
            solution:
                this.deepClone(
                    whales[bestIndex]
                ),

            quality:
                qualities[bestIndex],

            index:
                bestIndex
        };
    }

    _validateLatentVector(vector, label) {
        if (
            !Array.isArray(vector) ||
            vector.length === 0
        ) {
            throw new Error(
                `${label} must be a non-empty latent vector.`
            );
        }

        for (const value of vector) {
            if (!Number.isFinite(Number(value))) {
                throw new Error(
                    `${label} contains a non-finite latent value.`
                );
            }
        }
    }

    _encircleOrSearchVector(
        current,
        target,
        A,
        C,
        label
    ) {
        this._validateLatentVector(
            current,
            `${label} current`
        );
        this._validateLatentVector(
            target,
            `${label} target`
        );

        if (current.length !== target.length) {
            throw new Error(
                `${label} vectors must have equal lengths.`
            );
        }


        if (current.length === 1) {
            return current.slice();
        }

        return current.map(
            (value, index) => {
                const currentValue =
                    Number(value);

                const targetValue =
                    Number(target[index]);

                const distance =
                    Math.abs(
                        C * targetValue -
                        currentValue
                    );

                return (
                    targetValue -
                    A * distance
                );
            }
        );
    }

    _spiralVector(
        current,
        best,
        lRandom,
        label
    ) {
        this._validateLatentVector(
            current,
            `${label} current`
        );
        this._validateLatentVector(
            best,
            `${label} best`
        );

        if (current.length !== best.length) {
            throw new Error(
                `${label} vectors must have equal lengths.`
            );
        }

        if (current.length === 1) {
            return current.slice();
        }

        const spiralFactor =
            Math.exp(
                this.b *
                lRandom
            ) *
            Math.cos(
                2 *
                Math.PI *
                lRandom
            );

        if (!Number.isFinite(spiralFactor)) {
            throw new Error(
                'WOA spiral update produced a non-finite factor.'
            );
        }

        return current.map(
            (value, index) => {
                const currentValue =
                    Number(value);

                const bestValue =
                    Number(best[index]);

                const distance =
                    Math.abs(
                        bestValue -
                        currentValue
                    );

                return (
                    distance *
                    spiralFactor +
                    bestValue
                );
            }
        );
    }

    updatePosition(
        bestPosition,
        whalePositions,
        currentA
    ) {

        if (
            !Array.isArray(whalePositions) ||
            whalePositions.length === 0
        ) {
            throw new Error(
                'WOA requires a non-empty whale population.'
            );
        }

        if (
            !Array.isArray(bestPosition) ||
            bestPosition.length === 0
        ) {
            throw new Error(
                'WOA requires a non-empty best position.'
            );
        }

        if (
            !Number.isFinite(currentA) ||
            currentA < 0
        ) {
            throw new Error(
                'WOA current a value must be finite and non-negative.'
            );
        }

        const sourcePopulation =
            this.deepClone(
                whalePositions
            );

        const newPopulation = [];

        for (
            let whaleIndex = 0;
            whaleIndex < sourcePopulation.length;
            whaleIndex++
        ) {
            const currentWhale =
                sourcePopulation[whaleIndex];

            if (
                !Array.isArray(currentWhale) ||
                currentWhale.length !== bestPosition.length
            ) {
                throw new Error(
                    'WOA whale and best position must contain the same genes.'
                );
            }

            const updatedWhale =
                this.deepClone(
                    currentWhale
                );

            const useEncircling =
                Math.random() <
                this.switchingProbability;

            const lRandom =
                -this.l +
                2 *
                this.l *
                Math.random();

            for (
                let geneIndex = 0;
                geneIndex < currentWhale.length;
                geneIndex++
            ) {
                const currentGene =
                    currentWhale[geneIndex];

                const bestGene =
                    bestPosition[geneIndex];

                if (
                    !Array.isArray(currentGene) ||
                    !Array.isArray(bestGene) ||
                    currentGene.length < 4 ||
                    bestGene.length < 4
                ) {
                    throw new Error(
                        'WOA encountered a malformed latent gene.'
                    );
                }

                if (useEncircling) {

                    const r =
                        Math.random();

                    const A =
                        this.coefficient_A *
                        currentA *
                        r -
                        currentA;

                    const C =
                        this.coefficient_C *
                        r;

                    let targetGene;

                    if (Math.abs(A) < 1) {
                        targetGene =
                            bestGene;
                    }
                    else {

                        const randomIndex =
                            Math.floor(
                                Math.random() *
                                sourcePopulation.length
                            );

                        targetGene =
                            sourcePopulation[
                                randomIndex
                            ][geneIndex];
                    }

                    updatedWhale[geneIndex][2] =
                        this._encircleOrSearchVector(
                            currentGene[2],
                            targetGene[2],
                            A,
                            C,
                            'WOA version'
                        );

                    updatedWhale[geneIndex][3] =
                        this._encircleOrSearchVector(
                            currentGene[3],
                            targetGene[3],
                            A,
                            C,
                            'WOA node'
                        );
                }
                else {
                    updatedWhale[geneIndex][2] =
                        this._spiralVector(
                            currentGene[2],
                            bestGene[2],
                            lRandom,
                            'WOA version'
                        );

                    updatedWhale[geneIndex][3] =
                        this._spiralVector(
                            currentGene[3],
                            bestGene[3],
                            lRandom,
                            'WOA node'
                        );
                }
            }

            newPopulation.push(
                updatedWhale
            );
        }

        return newPopulation;
    }

    run(
        iniSols = undefined,
        itr = this.iteration
    ) {
        const startTime =
            performance.now();

        this.validateConfiguration(
            itr
        );

        let initialSolutions;

        if (iniSols === undefined) {
            initialSolutions =
                this.initialSolutions(
                    this.numPopulation
                );
        }
        else {
            if (!Array.isArray(iniSols)) {
                throw new Error(
                    'WOA initial solutions must be an array.'
                );
            }

            initialSolutions =
                this.deepClone(
                    iniSols
                );
        }

        if (
            initialSolutions.length >
            this.numPopulation
        ) {
            initialSolutions =
                initialSolutions.slice(
                    0,
                    this.numPopulation
                );
        }

        while (
            initialSolutions.length <
            this.numPopulation
        ) {
            const generated =
                this.initialSolutions(1);

            if (
                !Array.isArray(generated) ||
                generated.length === 0
            ) {
                throw new Error(
                    'WOA initialSolutions(1) did not return a solution.'
                );
            }

            initialSolutions.push(
                this.deepClone(
                    generated[0]
                )
            );
        }

        if (initialSolutions.length === 0) {
            throw new Error(
                'WOA requires at least one initial solution.'
            );
        }


        let positions =
            this._encodeCategoricalSolutions(
                initialSolutions
            );

        let discreteWhales =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    positions
                )
            );

        let qualities =
            this.quality(
                discreteWhales
            );

        const initialBest =
            this.bestAgent(
                discreteWhales,
                qualities
            );

        if (!Number.isFinite(initialBest.quality)) {
            throw new Error(
                'WOA could not obtain a finite-quality initial solution.'
            );
        }

        let bestQuality =
            initialBest.quality;

        let bestSolution =
            this.deepClone(
                initialBest.solution
            );

        let bestPosition =
            this._encodeCategoricalSolutions(
                [bestSolution]
            )[0];

        const convergenceBest = [];
        const convergenceMedian = [];
        const convergenceWorst = [];

        for (
            let iterationIndex = 0;
            iterationIndex < itr;
            iterationIndex++
        ) {
            const currentA =
                this.a *
                (
                    1 -
                    iterationIndex /
                    Math.max(itr, 1)
                );

            positions =
                this.updatePosition(
                    bestPosition,
                    positions,
                    currentA
                );

            discreteWhales =
                this._decodeCategoricalSolutions(
                    this.deepClone(
                        positions
                    )
                );

            qualities =
                this.quality(
                    discreteWhales
                );

            const iterationBest =
                this.bestAgent(
                    discreteWhales,
                    qualities
                );

            if (
                iterationBest.quality <
                bestQuality
            ) {
                bestQuality =
                    iterationBest.quality;

                bestSolution =
                    this.deepClone(
                        iterationBest.solution
                    );

                bestPosition =
                    this._encodeCategoricalSolutions(
                        [bestSolution]
                    )[0];
            }

            const sorted =
                this.solutionsQualitySort(
                    discreteWhales,
                    qualities
                );

            convergenceBest.push(
                sorted.bestQuality
            );

            convergenceMedian.push(
                sorted.medianQuality
            );

            convergenceWorst.push(
                sorted.worstQuality
            );
        }

        this.assertFeasibleSolution(
            bestSolution,
            'WOA best solution'
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
                bestQuality,

            bestWhale:
                bestSolution,

            whales:
                discreteWhales,

            solution:
                bestSolution,

            convergence: {
                best:
                    convergenceBest,

                median:
                    convergenceMedian,

                worst:
                    convergenceWorst
            },

            perServiceAnalysis:
                this.perServiceAnalysis(
                    bestSolution,
                    'WOA-per-service'
                )
        };
    }
}

class greyWolfOptimizer extends solutionOperation {

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

        const gwoConfig =
            config.ans?.configsGWO;

        if (
            !gwoConfig ||
            typeof gwoConfig !== 'object' ||
            Array.isArray(gwoConfig)
        ) {
            throw new Error(
                'configsGWO must be an object.'
            );
        }

        this.numWolves =
            gwoConfig.populationSize;

        this.iteration =
            gwoConfig.iteration;


        this.a =
            gwoConfig.a;


        this.coefficient_A =
            gwoConfig.coefficient_A;

        this.coefficient_C =
            gwoConfig.coefficient_C;
    }

    deepClone(value) {
        return JSON.parse(
            JSON.stringify(value)
        );
    }

    validateConfiguration(iterationCount) {
        if (
            !Number.isInteger(this.numWolves) ||
            this.numWolves < 3
        ) {
            throw new Error(
                'GWO populationSize must be an integer greater than or equal to 3.'
            );
        }

        if (
            !Number.isInteger(iterationCount) ||
            iterationCount < 0
        ) {
            throw new Error(
                'GWO iteration must be a non-negative integer.'
            );
        }

        const nonNegativeFinite = [
            ['a', this.a],
            ['coefficient_A', this.coefficient_A],
            ['coefficient_C', this.coefficient_C]
        ];

        for (const [name, value] of nonNegativeFinite) {
            if (
                typeof value !== 'number' ||
                !Number.isFinite(value) ||
                value < 0
            ) {
                throw new Error(
                    `GWO ${name} must be a finite non-negative number.`
                );
            }
        }
    }

    selectAlphaBetaDelta(
        wolves,
        qualities = this.quality(wolves)
    ) {
        if (
            !Array.isArray(wolves) ||
            !Array.isArray(qualities) ||
            wolves.length < 3 ||
            wolves.length !== qualities.length
        ) {
            throw new Error(
                'GWO leader selection requires at least three wolves and an equal-sized quality array.'
            );
        }

        const ranked =
            qualities
                .map(
                    (quality, index) => ({
                        index,
                        quality:
                            Number.isFinite(quality)
                                ? quality
                                : Infinity
                    })
                )
                .sort(
                    (left, right) =>
                        left.quality - right.quality
                );

        return {
            alpha:
                this.deepClone(
                    wolves[ranked[0].index]
                ),

            alphaQuality:
                ranked[0].quality,

            beta:
                this.deepClone(
                    wolves[ranked[1].index]
                ),

            betaQuality:
                ranked[1].quality,

            delta:
                this.deepClone(
                    wolves[ranked[2].index]
                ),

            deltaQuality:
                ranked[2].quality,

            omega:
                ranked.map(
                    item =>
                        this.deepClone(
                            wolves[item.index]
                        )
                )
        };
    }

    _validateLatentVector(vector, label) {
        if (
            !Array.isArray(vector) ||
            vector.length === 0
        ) {
            throw new Error(
                `${label} must be a non-empty latent vector.`
            );
        }

        for (const value of vector) {
            if (!Number.isFinite(Number(value))) {
                throw new Error(
                    `${label} contains a non-finite latent value.`
                );
            }
        }
    }

    _updateVectorFromLeaders(
        current,
        alpha,
        beta,
        delta,
        currentA,
        label
    ) {
        this._validateLatentVector(
            current,
            `${label} current`
        );
        this._validateLatentVector(
            alpha,
            `${label} alpha`
        );
        this._validateLatentVector(
            beta,
            `${label} beta`
        );
        this._validateLatentVector(
            delta,
            `${label} delta`
        );

        if (
            current.length !== alpha.length ||
            current.length !== beta.length ||
            current.length !== delta.length
        ) {
            throw new Error(
                `${label} latent vectors must have equal lengths.`
            );
        }

        if (current.length === 1) {
            return current.slice();
        }

        return current.map(
            (value, index) => {
                const x = Number(value);
                const leaders = [
                    Number(alpha[index]),
                    Number(beta[index]),
                    Number(delta[index])
                ];

                const leaderEstimates =
                    leaders.map(
                        leaderValue => {
                            const A =
                                this.coefficient_A *
                                currentA *
                                Math.random() -
                                currentA;

                            const C =
                                this.coefficient_C *
                                Math.random();

                            const distance =
                                Math.abs(
                                    C * leaderValue - x
                                );

                            return (
                                leaderValue -
                                A * distance
                            );
                        }
                    );

                const updated =
                    (
                        leaderEstimates[0] +
                        leaderEstimates[1] +
                        leaderEstimates[2]
                    ) / 3;

                if (!Number.isFinite(updated)) {
                    throw new Error(
                        `${label} update produced a non-finite latent value.`
                    );
                }

                return updated;
            }
        );
    }

    updatePosition(
        alphaPosition,
        betaPosition,
        deltaPosition,
        wolfPositions,
        currentA
    ) {
        if (
            !Array.isArray(wolfPositions) ||
            wolfPositions.length < 3
        ) {
            throw new Error(
                'GWO requires at least three latent wolf positions.'
            );
        }

        if (
            !Number.isFinite(currentA) ||
            currentA < 0
        ) {
            throw new Error(
                'GWO current a value must be finite and non-negative.'
            );
        }

        const newPositions = [];

        for (
            let wolfIndex = 0;
            wolfIndex < wolfPositions.length;
            wolfIndex++
        ) {
            const currentWolf =
                wolfPositions[wolfIndex];

            if (
                currentWolf.length !== alphaPosition.length ||
                currentWolf.length !== betaPosition.length ||
                currentWolf.length !== deltaPosition.length
            ) {
                throw new Error(
                    'GWO leader and wolf positions must contain the same number of genes.'
                );
            }

            const updatedWolf =
                this.deepClone(
                    currentWolf
                );

            for (
                let geneIndex = 0;
                geneIndex < currentWolf.length;
                geneIndex++
            ) {
                const currentGene =
                    currentWolf[geneIndex];

                const alphaGene =
                    alphaPosition[geneIndex];

                const betaGene =
                    betaPosition[geneIndex];

                const deltaGene =
                    deltaPosition[geneIndex];

                updatedWolf[geneIndex][2] =
                    this._updateVectorFromLeaders(
                        currentGene[2],
                        alphaGene[2],
                        betaGene[2],
                        deltaGene[2],
                        currentA,
                        'GWO version'
                    );

                updatedWolf[geneIndex][3] =
                    this._updateVectorFromLeaders(
                        currentGene[3],
                        alphaGene[3],
                        betaGene[3],
                        deltaGene[3],
                        currentA,
                        'GWO node'
                    );
            }

            newPositions.push(
                updatedWolf
            );
        }

        return newPositions;
    }

    run(
        iniSols = undefined,
        itr = this.iteration
    ) {
        const startTime =
            performance.now();

        this.validateConfiguration(
            itr
        );

        let initialSolutions;

        if (iniSols === undefined) {
            initialSolutions =
                this.initialSolutions(
                    this.numWolves
                );
        }
        else {
            if (!Array.isArray(iniSols)) {
                throw new Error(
                    'GWO initial solutions must be an array.'
                );
            }

            initialSolutions =
                this.deepClone(
                    iniSols
                );
        }

        if (
            initialSolutions.length >
            this.numWolves
        ) {
            initialSolutions =
                initialSolutions.slice(
                    0,
                    this.numWolves
                );
        }

        while (
            initialSolutions.length <
            this.numWolves
        ) {
            const generated =
                this.initialSolutions(1);

            if (
                !Array.isArray(generated) ||
                generated.length === 0
            ) {
                throw new Error(
                    'GWO initialSolutions(1) did not return a solution.'
                );
            }

            initialSolutions.push(
                this.deepClone(
                    generated[0]
                )
            );
        }

        if (initialSolutions.length < 3) {
            throw new Error(
                'GWO requires at least three initial solutions.'
            );
        }


        let positions =
            this._encodeCategoricalSolutions(
                initialSolutions
            );

        let discreteWolves =
            this._decodeCategoricalSolutions(
                this.deepClone(
                    positions
                )
            );

        let qualities =
            this.quality(
                discreteWolves
            );

        let leaders =
            this.selectAlphaBetaDelta(
                discreteWolves,
                qualities
            );

        if (!Number.isFinite(leaders.alphaQuality)) {
            throw new Error(
                'GWO could not obtain a finite-quality initial alpha wolf.'
            );
        }

        let globalBestQuality =
            leaders.alphaQuality;

        let globalBestSolution =
            this.deepClone(
                leaders.alpha
            );

        let alphaPosition =
            this._encodeCategoricalSolutions(
                [leaders.alpha]
            )[0];

        let betaPosition =
            this._encodeCategoricalSolutions(
                [leaders.beta]
            )[0];

        let deltaPosition =
            this._encodeCategoricalSolutions(
                [leaders.delta]
            )[0];

        const convergenceBest = [];
        const convergenceMedian = [];
        const convergenceWorst = [];

        for (
            let iterationIndex = 0;
            iterationIndex < itr;
            iterationIndex++
        ) {
            const currentA =
                this.a *
                (
                    1 -
                    iterationIndex /
                    Math.max(itr, 1)
                );

            positions =
                this.updatePosition(
                    alphaPosition,
                    betaPosition,
                    deltaPosition,
                    positions,
                    currentA
                );

            discreteWolves =
                this._decodeCategoricalSolutions(
                    this.deepClone(
                        positions
                    )
                );

            qualities =
                this.quality(
                    discreteWolves
                );

            leaders =
                this.selectAlphaBetaDelta(
                    discreteWolves,
                    qualities
                );

            if (
                leaders.alphaQuality <
                globalBestQuality
            ) {
                globalBestQuality =
                    leaders.alphaQuality;

                globalBestSolution =
                    this.deepClone(
                        leaders.alpha
                    );
            }

            alphaPosition =
                this._encodeCategoricalSolutions(
                    [leaders.alpha]
                )[0];

            betaPosition =
                this._encodeCategoricalSolutions(
                    [leaders.beta]
                )[0];

            deltaPosition =
                this._encodeCategoricalSolutions(
                    [leaders.delta]
                )[0];

            const sorted =
                this.solutionsQualitySort(
                    discreteWolves,
                    qualities
                );

            convergenceBest.push(
                sorted.bestQuality
            );

            convergenceMedian.push(
                sorted.medianQuality
            );

            convergenceWorst.push(
                sorted.worstQuality
            );
        }

        this.assertFeasibleSolution(
            globalBestSolution,
            'GWO best solution'
        );

        const exeTime =
            performance.now() -
            startTime;

        return {
            servicePlacementResults:
                this.solutionAnalyser(
                    globalBestSolution
                ),

            runtime:
                exeTime,

            fitness:
                globalBestQuality,

            bestWolf:
                globalBestSolution,

            wolves:
                discreteWolves,

            solution:
                globalBestSolution,

            convergence: {
                best:
                    convergenceBest,

                median:
                    convergenceMedian,

                worst:
                    convergenceWorst
            },

            perServiceAnalysis:
                this.perServiceAnalysis(
                    globalBestSolution,
                    'GWO-per-service'
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
    exactOptimizationBaseline,
    nsgaII,
    NCO,
    geneticAlgorithm,
    particleSwarmOptimization,
    differentialEvolution,
    sineCosineAlgorithm,
    whaleOptimizationAlgorithm,
    greyWolfOptimizer,
    simulatedAnnealing,
}