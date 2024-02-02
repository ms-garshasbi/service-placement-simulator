const axios = require('axios');
const fs = require('fs');
const configurations = readJSON("configurations.json");

//const args = process.argv.slice(2);
const ip = configurations['address']['ip'];
const port = configurations['address']['port'];
let url = `http://${ip}:${port}/json`;


function sendAxiosPost(url, dataObj) {
    axios.post(url, dataObj)
        .then((res) => {
            console.log(res.data);
        })
        .catch((err) => {
            console.log(err);
        })
}

function saveJSON(jsonResult,str) {
    fs.writeFile(str, JSON.stringify(jsonResult, null, 2), 'utf8', (err) => {
        if (err) 
        {
            console.error('An error occurred while saving the file:', err);
        }
    });
}

function getRandomValue(min, max) {
    return (Math.random() * (max - min) + min);
}

function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  
  return JSON.parse(result);
}

class computingNodesGenerator {
    constructor(systemConfig) {
        const config = systemConfig;
        
        //Access point nodes
        this.minAPCPUMIPS = config.minAPCPUMIPS;
        this.maxAPCPUMIPS = config.maxAPCPUMIPS;
        this.minAPMemoryMB = config.minAPMemoryMB;
        this.maxAPMemoryMB = config.maxAPMemoryMB;
        this.minAPDiskGB = config.minAPDiskGB;
        this.maxAPDiskGB = config.maxAPDiskGB;
        this.minAPReliability = config.minAPReliability;
        this.maxAPReliability = config.maxAPReliability;
        this.APNumNode = config.APNumNode;
        this.APplatform = config.APplatform;

        //Edge nodes
        this.minENCPUMIPS = config.minENCPUMIPS;
        this.maxENCPUMIPS = config.maxENCPUMIPS;
        this.minENMemoryMB = config.minENMemoryMB;
        this.maxENMemoryMB = config.maxENMemoryMB;
        this.minENDiskGB = config.minENDiskGB;
        this.maxENDiskGB = config.maxENDiskGB;
        this.minENReliability = config.minENReliability;
        this.maxENReliability = config.maxENReliability;
        this.ENNumNode = config.ENNumNode;
        this.ENplatform = config.ENplatform;

        //Cloud nodes
        this.minCNCPUMIPS = config.minCNCPUMIPS;
        this.maxCNCPUMIPS = config.maxCNCPUMIPS;
        this.minCNMemoryMB = config.minCNMemoryMB;
        this.maxCNMemoryMB = config.maxCNMemoryMB;
        this.minCNDiskGB = config.minCNDiskGB;
        this.maxCNDiskGB = config.maxCNDiskGB;
        this.minCNReliability = config.minCNReliability;
        this.maxCNReliability = config.maxCNReliability;
        this.CNNumNode = config.CNNumNode;
        this.CNplatform = config.CNplatform;

        //Connection information
        this.numUsers = config.numUsers;
        this.numHelpers = config.numHelpers;

        this.maxBandwidthInTier1 = config.maxBandwidthInTier1;
        this.minBandwidthInTier1 = config.minBandwidthInTier1;
        this.maxRttInTier1 = config.maxRttInTier1;
        this.minRttInTier1 = config.minRttInTier1;

        this.maxBandwidthInTier2 = config.maxBandwidthInTier2;
        this.minBandwidthInTier2 = config.minBandwidthInTier2;
        this.maxRttInTier2 = config.maxRttInTier2;
        this.minRttInTier2 = config.minRttInTier2;

        this.maxBandwidthInTier3 = config.maxBandwidthInTier3;
        this.minBandwidthInTier3 = config.minBandwidthInTier3;
        this.maxRttInTier3 = config.maxRttInTier3;
        this.minRttInTier3 = config.minRttInTier3;

        this.maxBandwidthFromTier1ToTier2 = config.maxBandwidthFromTier1ToTier2;
        this.minBandwidthFromTier1ToTier2 = config.minBandwidthFromTier1ToTier2;
        this.maxRttFromTier1ToTier2 = config.maxRttFromTier1ToTier2;
        this.minRttFromTier1ToTier2 = config.minRttFromTier1ToTier2;

        this.maxBandwidthFromTier1ToTier3 = config.maxBandwidthFromTier1ToTier3;
        this.minBandwidthFromTier1ToTier3 = config.minBandwidthFromTier1ToTier3;
        this.maxRttFromTier1ToTier3 = config.maxRttFromTier1ToTier3;
        this.minRttFromTier1ToTier3 = config.minRttFromTier1ToTier3;

        this.maxBandwidthFromTier2ToTier3 = config.maxBandwidthFromTier2ToTier3;
        this.minBandwidthFromTier2ToTier3 = config.minBandwidthFromTier2ToTier3;
        this.maxRttFromTier2ToTier3 = config.maxRttFromTier2ToTier3;
        this.minRttFromTier2ToTier3 = config.minRttFromTier2ToTier3;
        
        this.maxBandwidthFromUserToTier1 = config.maxBandwidthFromUserToTier1;
        this.minBandwidthFromUserToTier1 = config.minBandwidthFromUserToTier1;
        this.maxRttFromUserToTier1 = config.maxRttFromUserToTier1;
        this.minRttFromUserToTier1 = config.minRttFromUserToTier1;

        this.maxBandwidthFromUserToTier2 = config.maxBandwidthFromUserToTier2;
        this.minBandwidthFromUserToTier2 = config.minBandwidthFromUserToTier2;
        this.maxRttFromUserToTier2 = config.maxRttFromUserToTier2;
        this.minRttFromUserToTier2 = config.minRttFromUserToTier2;

        this.maxBandwidthFromUserToTier3 = config.maxBandwidthFromUserToTier3;
        this.minBandwidthFromUserToTier3 = config.minBandwidthFromUserToTier3;
        this.maxRttFromUserToTier3 = config.maxRttFromUserToTier3;
        this.minRttFromUserToTier3 = config.minRttFromUserToTier3;

        this.maxBandwidthFromHelperToInfrastructure = config.maxBandwidthFromHelperToInfrastructure;
        this.minBandwidthFromHelperToInfrastructure = config.minBandwidthFromHelperToInfrastructure;
        this.maxRttFromHelperToInfrastructure = config.maxRttFromHelperToInfrastructure;
        this.minRttFromHelperToInfrastructure = config.minRttFromHelperToInfrastructure;

        this.maxBandwidthFromUsersToHelpers = config.maxBandwidthFromUsersToHelpers;
        this.minBandwidthFromUsersToHelpers = config.minBandwidthFromUsersToHelpers;
        this.maxRttFromHelperUsersToHelpers = config.maxRttFromHelperUsersToHelpers;
        this.minRttFromHelperUsersToHelpers = config.minRttFromHelperUsersToHelpers;

        this.numTier = config.numTier;
        this.jsonResult = [];
    }

    generate() {
        let id = 0;
        for (let r = 1; r <= this.numTier; r++) 
        {
                if (r == 1)
                {
                    for (let i = 0; i < this.APNumNode; i++) 
                    {
                        let computingNode = {
                            nodeID: ++id,
                            nodeTier: r,
                            characteristics: {
                                cpu: getRandomValue(this.minAPCPUMIPS, this.maxAPCPUMIPS),
                                memory: getRandomValue(this.minAPMemoryMB, this.maxAPMemoryMB),
                                disk: getRandomValue(this.minAPDiskGB, this.maxAPDiskGB),
                                platform: this.APplatform[Math.floor(Math.random() * this.APplatform.length)],
                                reliabilityScore: getRandomValue(this.minAPReliability, this.maxAPReliability)
                            }
                        }
                        this.jsonResult.push(computingNode);
                    }
                }
                else if (r == 2)
                {
                    for (let i = 0; i < this.ENNumNode; i++)
                    {
                        let computingNode = {
                            nodeID: ++id,
                            nodeTier: r,
                            characteristics: {
                                cpu: getRandomValue(this.minENCPUMIPS, this.maxENCPUMIPS),
                                memory: getRandomValue(this.minENMemoryMB, this.maxENMemoryMB),
                                disk: getRandomValue(this.minENDiskGB, this.maxENDiskGB),
                                platform: this.ENplatform[Math.floor(Math.random() * this.ENplatform.length)],
                                reliabilityScore: getRandomValue(this.minENReliability, this.maxENReliability)
                            }
                        }
                        this.jsonResult.push(computingNode);
                    }
                }
                else if (r == 3)
                {
                    for (let i = 0; i < this.CNNumNode; i++)
                    {
                        let computingNode = {
                            nodeID: ++id,
                            nodeTier: r,
                            characteristics: {
                                cpu: getRandomValue(this.minCNCPUMIPS, this.maxCNCPUMIPS),
                                memory: getRandomValue(this.minCNMemoryMB, this.maxCNMemoryMB),
                                disk: getRandomValue(this.minCNDiskGB, this.maxCNDiskGB),
                                platform: this.CNplatform[Math.floor(Math.random() * this.CNplatform.length)],
                                reliabilityScore: getRandomValue(this.minCNReliability, this.maxCNReliability)
                            }
                        }
                        this.jsonResult.push(computingNode);
                    }
                }
        }
        return this.jsonResult;
    }

    connections() {
        const numCNTier1 = this.APNumNode;
        const numCNTier2 = this.ENNumNode;
        const numCNTier3 = this.CNNumNode;
        const totalNodes = numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers + this.numHelpers;

        const nodeConnections = [];
        for (let i = 0; i < totalNodes; i++){
            nodeConnections[i] = [];
            for (let j = 0; j < totalNodes; j++)
            {
                if (i == j)
                {
                    nodeConnections[i][j] = [
                        0,
                        0
                    ];
                }
                else if (i < numCNTier1 && j < numCNTier1) //Inside of Tier1
                {
                    nodeConnections[i][j] = [
                            Math.floor(getRandomValue(this.minBandwidthInTier1, this.maxBandwidthInTier1)),
                            getRandomValue(this.minRttInTier1, this.maxRttInTier1)
                        ];
                }
                else if (i >= numCNTier1 && i < numCNTier1 + numCNTier2 && j >= numCNTier1 && j < numCNTier1 + numCNTier2) //Inside of Tier2
                {
                    nodeConnections[i][j] = [
                            Math.floor(getRandomValue(this.minBandwidthInTier2, this.maxBandwidthInTier2)),
                            getRandomValue(this.minRttInTier2, this.maxRttInTier2)
                        ];
                }
                else if (i >= numCNTier1 + numCNTier2 && i < numCNTier1 + numCNTier2 + numCNTier3 && j >= numCNTier1 + numCNTier2 && j < numCNTier1 + numCNTier2 + numCNTier3) //Inside of Tier3
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthInTier3, this.maxBandwidthInTier3)),
                        getRandomValue(this.minRttInTier3, this.maxRttInTier3)
                    ];
                }
                else if (i < numCNTier1 && j >= numCNTier1 && j < numCNTier1 + numCNTier2) //Tier1  to Tier 2
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromTier1ToTier2, this.maxBandwidthFromTier1ToTier2)),
                        getRandomValue(this.minRttFromTier1ToTier2, this.maxRttFromTier1ToTier2)
                    ];
                }
                else if (i < numCNTier1 && j >= numCNTier1 + numCNTier2 && j < numCNTier1 + numCNTier2 + numCNTier3) //Tier1  to Tier 3
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromTier1ToTier3, this.maxBandwidthFromTier1ToTier3)),
                        getRandomValue(this.minRttFromTier1ToTier3, this.maxRttFromTier1ToTier3)
                    ];
                }
                else if (i >= numCNTier1 && i < numCNTier1 + numCNTier2 && j >= numCNTier1 + numCNTier2 && j < numCNTier1 + numCNTier2 + numCNTier3) //Tier2  to Tier 3
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromTier2ToTier3, this.maxBandwidthFromTier2ToTier3)),
                        getRandomValue(this.minRttFromTier2ToTier3, this.maxRttFromTier2ToTier3)
                    ];
                }
                else if (i < numCNTier1 && j >= numCNTier1 + numCNTier2 + numCNTier3 && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers) //Users to Tier1
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromUserToTier1, this.maxBandwidthFromUserToTier1)),
                        getRandomValue(this.minRttFromUserToTier1, this.maxRttFromUserToTier1)
                    ];
                }
                else if (i >= numCNTier1 && i < numCNTier1 + numCNTier2 && j >= numCNTier1 + numCNTier2 + numCNTier3 && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers) //Users to Tier2
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromUserToTier2, this.maxBandwidthFromUserToTier2)),
                        getRandomValue(this.minRttFromUserToTier2, this.maxRttFromUserToTier2)
                    ];
                }
                else if (i >= numCNTier1 + numCNTier2 && i < numCNTier1 + numCNTier2 + numCNTier3 && j >= numCNTier1 + numCNTier2 + numCNTier3 && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers) //Users to Tier3
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromUserToTier3, this.maxBandwidthFromUserToTier3)),
                        getRandomValue(this.minRttFromUserToTier3, this.maxRttFromUserToTier3)
                    ];
                }
                else if (i < numCNTier1 + numCNTier2 + numCNTier3 && j >= numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers + this.numHelpers) //Helpers to infrastructure
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromHelperToInfrastructure, this.maxBandwidthFromHelperToInfrastructure)),
                        getRandomValue(this.minRttFromHelperToInfrastructure, this.maxRttFromHelperToInfrastructure)
                    ];
                }
                else if (i >= numCNTier1 + numCNTier2 + numCNTier3 && i < numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers && j >= numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numUsers + this.numHelpers) //Users to helpers
                {
                    nodeConnections[i][j] = [
                        Math.floor(getRandomValue(this.minBandwidthFromUsersToHelpers, this.maxBandwidthFromUsersToHelpers)),
                        getRandomValue(this.minRttFromHelperUsersToHelpers, this.maxRttFromHelperUsersToHelpers)
                    ];
                }
                else
                {
                    nodeConnections[i][j] = [
                        0,
                        0
                    ];
                }
            }
        }
        for (let i = 0; i < totalNodes; i++)
        {
            for (let j = 0; j < totalNodes; j++)
            {
                nodeConnections[j][i] = nodeConnections[i][j];
            }

        }

        //Save the infrastructure connections matrix in a file.
        fs.writeFile('./newUsecase/infraConnections.json', JSON.stringify(nodeConnections), (err) => {
            if (err) {
              console.error('Error writing file:', err);
            }
          });
        
        return nodeConnections;
    }

    capacity(computingNodes, connections)
    {
        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;
        for (let i = 0; i < computingNodes.length; i++)
        {
            totalComputationalCapacity += computingNodes[i]['characteristics']['cpu'];
            totalMemoryCapacity += computingNodes[i]['characteristics']['memory'];
            totalDiskCapacity += computingNodes[i]['characteristics']['disk'];
        }

        let totalBW = 0;
        for (let i = 0; i < connections.length; i++)
        {
            for (let j = 0; j < connections[0].length; j++)
            {
                if (j >= i)
                {  
                    totalBW = totalBW + connections[i][j][0];
                }
            }
        }

        return {
            totalComputationalCapacity: totalComputationalCapacity,
            totalMemoryCapacity: totalMemoryCapacity,
            totalDiskCapacity: totalDiskCapacity,
            totalBandwidthCapacitiy: totalBW
        }
    }
}

class helpersGenerator {
    constructor(helperConfig) {
        const config = helperConfig;
        this.minCPUMIPS = config.minCPUMIPS;
        this.maxCPUMIPS = config.maxCPUMIPS;
        this.minMemoryMB = config.minMemoryMB;
        this.maxMemoryMB = config.maxMemoryMB;
        this.minDiskGB = config.minDiskGB;
        this.maxDiskGB = config.maxDiskGB;
        this.minReliability = config.minReliability;
        this.maxReliability = config.maxReliability;
        this.os = config.os;
        this.numHelpers = config.numHelpers;
        this.numComputingNodes = config.numComputingNodes;
        this.jsonResult = [];
    }

    generate() {
        for (let i = 0; i < this.numHelpers; i++) {
            let helper = {
                nodeID: i + 1 + this.numComputingNodes,
                nodeTier: 4, //helper tier ID
                characteristics: {
                    cpu: getRandomValue(this.minCPUMIPS, this.maxCPUMIPS),
                    memory: getRandomValue(this.minMemoryMB, this.maxMemoryMB),
                    disk: getRandomValue(this.minDiskGB, this.maxDiskGB),
                    os: this.os[Math.floor(Math.random() * this.os.length)],
                    reliability: getRandomValue(this.minReliability, this.maxReliability)
                }
            };
            this.jsonResult.push(helper);
        }
        return this.jsonResult;
    }

    capacity(helpers)
    {
        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;
        for (let i = 0; i < helpers.length; i++)
        {
            totalComputationalCapacity += helpers[i]['characteristics']['cpu'];
            totalMemoryCapacity += helpers[i]['characteristics']['memory'];
            totalDiskCapacity += helpers[i]['characteristics']['disk'];
        }
        return {
            totalComputationalCapacity: totalComputationalCapacity,
            totalMemoryCapacity: totalMemoryCapacity,
            totalDiskCapacity: totalDiskCapacity
        }
    }

}

class usersGenerator {
    constructor(userConfig) {
        const config = userConfig;
        this.minCPUMIPS = config.minCPUMIPS;
        this.maxCPUMIPS = config.maxCPUMIPS;
        this.minMemoryMB = config.minMemoryMB;
        this.maxMemoryMB = config.maxMemoryMB;
        this.minDiskGB = config.minDiskGB;
        this.maxDiskGB = config.maxDiskGB;
        this.minReliability = config.minReliability;
        this.maxReliability = config.maxReliability;
        this.os = config.os;
        this.numUsers = config.numUsers;
        this.numComputingNodes = config.numComputingNodes;
        this.numHelpers = config.numHelpers;
        this.jsonResult = [];
    }
    generate() {
        for (let i = 0; i < this.numUsers; i++) {
            let user = {
                nodeID: i + 1 + this.numComputingNodes + this.numHelpers,
                nodeTier: 0, //user tier ID
                characteristics: {
                    cpu: getRandomValue(this.minCPUMIPS, this.maxCPUMIPS),
                    memory: getRandomValue(this.minMemoryMB, this.maxMemoryMB),
                    disk: getRandomValue(this.minDiskGB, this.maxDiskGB),
                    os: this.os[Math.floor(Math.random() * this.os.length)],
                    reliability: getRandomValue(this.minReliability, this.maxReliability)
                }
            };
            this.jsonResult.push(user);
        }
        return this.jsonResult;
    }

    capacity(users)
    {
        let totalComputationalCapacity = 0;
        let totalMemoryCapacity = 0;
        let totalDiskCapacity = 0;
        for (let i = 0; i < users.length; i++)
        {
            totalComputationalCapacity += users[i]['characteristics']['cpu'];
            totalMemoryCapacity += users[i]['characteristics']['memory'];
            totalDiskCapacity += users[i]['characteristics']['disk'];
        }
        return {
            totalComputationalCapacity: totalComputationalCapacity,
            totalMemoryCapacity: totalMemoryCapacity,
            totalDiskCapacity: totalDiskCapacity
        }
    }
}

class serviceGenerator {
    constructor(serviceConfig) {
        const config = serviceConfig;
        this.minCapacity = config.minCapacity;
        this.maxCapacity = config.maxCapacity;
        this.platformComputationalCapacity = config.platformComputationalCapacity;
        this.platformDiskCapacity = config.platformDiskCapacity;
        this.platformMemoryCapacity = config.platformMemoryCapacity;
        this.platformNetworkCapacity = config.platformNetworkCapacity;
        this.internalProvider = config.internalProvider;
        this.externalProvider = config.externalProvider;
        this.codecType = config.codecType;
        this.minReliability = config.minReliability;
        this.maxReliability = config.maxReliability;
        this.minCPUMIPS = config.minCPUMIPS;
        this.maxCPUMIPS = config.maxCPUMIPS;
        this.minDataSizeCommunication = config.minDataSizeCommunication,
        this.maxDataSizeCommunication = config.maxDataSizeCommunication,
        this.numVersions = config.numVersions;
        this.numComputingNodes = config.numComputingNodes;
        this.numHelpers = config.numHelpers;
        this.numUsers = config.numUsers;

        this.capacityPercentage = config.capacityPercentage;
        this.numServiceComponents = config.numServiceComponents;

        this.jsonResult = [];

    }

    getReliabilityScore(min, max) {
        let rl = Math.random();
        if (rl <= 0.4)
        {
            return getRandomValue(0.98, 0.999);
            //return getRandomValue(min, max);
        }
        else
        {
            return getRandomValue(min, max);
        }
        
    }

    getProvider() {
        let p = Math.round(getRandomValue(0, 1));
        if (p == 0) {
            let randomIndex = Math.floor(Math.random() * this.internalProvider.length);
            return this.internalProvider[randomIndex];
        }
        else if (p == 1) {
            let randomIndex = Math.floor(Math.random() * this.externalProvider.length);
            return this.externalProvider[randomIndex];
        }
    }

    getCodecType() {
        let randomIndex = Math.floor(Math.random() * this.codecType.length);
        return this.codecType[randomIndex];
    }

    generate()
    {
            const totalSCs = this.numUsers * this.numServiceComponents;

            const platformComputation = this.platformComputationalCapacity * this.capacityPercentage;
            const platformMemory = this.platformMemoryCapacity * this.capacityPercentage;
            const platformDisk = this.platformDiskCapacity * 0.2; //Disk is not a serious challenge.

            const maxComPerSC = platformComputation / totalSCs;
            const maxMemPerSC = platformMemory / totalSCs;
            const maxDiskPerSC = platformDisk / totalSCs;

            const p1 = 0.7;
            const p2 = 1.2;


            let jsonResult = [];
            let hID = this.numComputingNodes + 1
            let uID = this.numComputingNodes + this.numHelpers + 1;
            let comID = 1;

            for (let s = 0; s < this.numUsers; s++)
            {
                const service = {
                    serviceID: s + 1,
                    components: [],
                    userID: uID,
                    helperID: hID
                }
                uID ++;
                hID ++;
                if (hID >= this.numComputingNodes + 1 + this.numHelpers)
                {
                    hID = this.numComputingNodes + 1;
                }

                for (let sc = 0; sc < this.numServiceComponents; sc++)
                {
                    const component = {
                        componentID: comID,
                        versions: []
                    };
                    for (let v = 0; v < this.numVersions; v++)
                    {

                        const version = {
                            versionNumber: v + 1,
                            characteristics: {
                                cpu: getRandomValue(maxComPerSC * p1, maxComPerSC * p2),
                                memory:getRandomValue(maxMemPerSC * p1, maxMemPerSC * p2),
                                dataSize: getRandomValue(this.minDataSizeCommunication,this.maxDataSizeCommunication),
                                disk: getRandomValue(maxDiskPerSC * p1, maxDiskPerSC * p2),
                                provider: this.getProvider(),
                                codecType: this.getCodecType(),
                                reliabilityScore: this.getReliabilityScore(this.minReliability, this.maxReliability)
                            }
                        };
                        component.versions.push(version);
                    }
                    comID++;
                    service.components.push(component);
                }
                comID = 1;
                jsonResult.push(service);
            }


            return {
                services: jsonResult,
                min_max_CPUrequired: [maxComPerSC * p1, maxComPerSC * p2],
                min_max_MAMORYrequired: [maxMemPerSC * p1, maxMemPerSC * p2],
                min_max_DISKrequired: [maxDiskPerSC * p1, maxDiskPerSC * p2],
                min_max_DATASIZE: [this.minDataSizeCommunication, this.maxDataSizeCommunication],
                num_serviceComponentEach: this.numServiceComponents,
                num_services: this.numUsers
            }

    }

    connections(services) 
    {
        const numComponents = services['services'][0]['components'].length;
        let matrix = new Array(numComponents).fill(0).map(() => new Array(numComponents).fill(0));
        for (let i = 0; i < numComponents; i++) 
        {
            for (let j = 0; j < numComponents; j++) 
            {
                {
                    if (j > i && Math.random() < 0.7) // 70% of service components are connected in service chain
                    {
                        matrix[i][j] = 1;
                    }
                    else 
                    {
                        matrix[i][j] = 0;  // Set value to 0 for lower triangular elements 
                    }
                }
            }
        }
        
        //Save the connection matrix in a file.
        fs.writeFile('./newUsecase/componentsConnections.json', JSON.stringify(matrix), (err) => {
                if (err) 
                {
                    console.error('Error writing file:', err);
                }
            });
        return matrix
    }
}

class commands {
    constructor ()
    {
    }

    newUseCase ()
    {
        const newUseCase = {
            number_users: configurations['useCase']['new']['numberOfUsers'],
            number_helpers: configurations['useCase']['new']['numberOfHelpers'],
            number_tier1: configurations['useCase']['new']['numberOfAccessPoints'],
            number_tier2: configurations['useCase']['new']['numberOfEdgeNodes'],
            number_tier3: configurations['useCase']['new']['numberOfCloudNodes'],
            number_versions: configurations['useCase']['new']['numbeOfServiceComponentsVersions'],
        }
        const numUsers = parseInt(newUseCase['number_users']);
        const numHelpers = parseInt(newUseCase['number_helpers']);
        const numAPs = parseInt(newUseCase['number_tier1']);
        const numEdgeNodes = parseInt(newUseCase['number_tier2']);
        const numCloudNodes = parseInt(newUseCase['number_tier3']);
        const numVersions = parseInt(newUseCase['number_versions']);
        const totalComputingNodes = numAPs + numEdgeNodes + numCloudNodes;

        //Platform
        const computingNodesConfig = {
            //Tier one configuration (APs)
            minAPCPUMIPS: parseInt(configurations['useCase']['computingNodesConfig']['minAPCPUMIPS']),
            maxAPCPUMIPS: parseInt(configurations['useCase']['computingNodesConfig']['maxAPCPUMIPS']),
            minAPMemoryMB: parseInt(configurations['useCase']['computingNodesConfig']['minAPMemoryMB']),
            maxAPMemoryMB: parseInt(configurations['useCase']['computingNodesConfig']['maxAPMemoryMB']),
            minAPDiskGB: parseInt(configurations['useCase']['computingNodesConfig']['minAPDiskGB']),
            maxAPDiskGB: parseInt(configurations['useCase']['computingNodesConfig']['maxAPDiskGB']),
            minAPReliability: parseFloat(configurations['useCase']['computingNodesConfig']['minAPReliability']),
            maxAPReliability: parseFloat(configurations['useCase']['computingNodesConfig']['maxAPReliability']),
            APplatform: configurations['useCase']['computingNodesConfig']['APplatform'],
            APNumNode: numAPs,

            //Tier two configuration (Edge nodes)
            minENCPUMIPS: parseInt(configurations['useCase']['computingNodesConfig']['minENCPUMIPS']),
            maxENCPUMIPS: parseInt(configurations['useCase']['computingNodesConfig']['maxENCPUMIPS']),
            minENMemoryMB: parseInt(configurations['useCase']['computingNodesConfig']['minENMemoryMB']),
            maxENMemoryMB: parseInt(configurations['useCase']['computingNodesConfig']['maxENMemoryMB']),
            minENDiskGB: parseInt(configurations['useCase']['computingNodesConfig']['minENDiskGB']),
            maxENDiskGB: parseInt(configurations['useCase']['computingNodesConfig']['maxENDiskGB']),
            minENReliability: parseFloat(configurations['useCase']['computingNodesConfig']['minENReliability']),
            maxENReliability: parseFloat(configurations['useCase']['computingNodesConfig']['maxENReliability']),
            ENplatform: configurations['useCase']['computingNodesConfig']['ENplatform'],
            ENNumNode: numEdgeNodes,

            //Tier three configuration (Cloud nodes)
            minCNCPUMIPS: parseInt(configurations['useCase']['computingNodesConfig']['minCNCPUMIPS']),
            maxCNCPUMIPS: parseInt(configurations['useCase']['computingNodesConfig']['maxCNCPUMIPS']),
            minCNMemoryMB: parseInt(configurations['useCase']['computingNodesConfig']['minCNMemoryMB']),
            maxCNMemoryMB: parseInt(configurations['useCase']['computingNodesConfig']['maxCNMemoryMB']),
            minCNDiskGB: parseInt(configurations['useCase']['computingNodesConfig']['minCNDiskGB']),
            maxCNDiskGB: parseInt(configurations['useCase']['computingNodesConfig']['maxCNDiskGB']),
            minCNReliability: parseFloat(configurations['useCase']['computingNodesConfig']['minCNReliability']),
            maxCNReliability: parseFloat(configurations['useCase']['computingNodesConfig']['maxCNReliability']),
            CNplatform: configurations['useCase']['computingNodesConfig']['CNplatform'],
            CNNumNode: numCloudNodes,

            //Connection information
            numUsers: numUsers,
            numHelpers: numHelpers,
            maxBandwidthInTier1: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthInTier1']),
            minBandwidthInTier1: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthInTier1']),
            maxRttInTier1: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttInTier1']),
            minRttInTier1: parseFloat(configurations['useCase']['computingNodesConfig']['minRttInTier1']),
            maxBandwidthInTier2: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthInTier2']),
            minBandwidthInTier2: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthInTier2']),
            maxRttInTier2: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttInTier2']),
            minRttInTier2: parseFloat(configurations['useCase']['computingNodesConfig']['minRttInTier2']),
            maxBandwidthInTier3: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthInTier3']),
            minBandwidthInTier3: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthInTier3']),
            maxRttInTier3: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttInTier3']),
            minRttInTier3: parseFloat(configurations['useCase']['computingNodesConfig']['minRttInTier3']),
            maxBandwidthFromTier1ToTier2: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromTier1ToTier2']),
            minBandwidthFromTier1ToTier2: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromTier1ToTier2']),
            maxRttFromTier1ToTier2: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromTier1ToTier2']),
            minRttFromTier1ToTier2: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromTier1ToTier2']),
            maxBandwidthFromTier1ToTier3: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromTier1ToTier3']),
            minBandwidthFromTier1ToTier3: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromTier1ToTier3']),
            maxRttFromTier1ToTier3: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromTier1ToTier3']),
            minRttFromTier1ToTier3: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromTier1ToTier3']),
            maxBandwidthFromTier2ToTier3: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromTier2ToTier3']),
            minBandwidthFromTier2ToTier3: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromTier2ToTier3']),
            maxRttFromTier2ToTier3: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromTier2ToTier3']),
            minRttFromTier2ToTier3: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromTier2ToTier3']),
            maxBandwidthFromUserToTier1: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromUserToTier1']),
            minBandwidthFromUserToTier1: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromUserToTier1']),
            maxRttFromUserToTier1: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromUserToTier1']),
            minRttFromUserToTier1: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromUserToTier1']),
            maxBandwidthFromUserToTier2: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromUserToTier2']),
            minBandwidthFromUserToTier2: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromUserToTier2']),
            maxRttFromUserToTier2: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromUserToTier2']),
            minRttFromUserToTier2: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromUserToTier2']),
            maxBandwidthFromUserToTier3: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromUserToTier3']),
            minBandwidthFromUserToTier3: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromUserToTier3']),
            maxRttFromUserToTier3: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromUserToTier3']),
            minRttFromUserToTier3: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromUserToTier3']),
            maxBandwidthFromHelperToInfrastructure: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromHelperToInfrastructure']),
            minBandwidthFromHelperToInfrastructure: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromHelperToInfrastructure']),
            maxRttFromHelperToInfrastructure: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromHelperToInfrastructure']),
            minRttFromHelperToInfrastructure: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromHelperToInfrastructure']),
            maxBandwidthFromUsersToHelpers: parseInt(configurations['useCase']['computingNodesConfig']['maxBandwidthFromUsersToHelpers']),
            minBandwidthFromUsersToHelpers: parseInt(configurations['useCase']['computingNodesConfig']['minBandwidthFromUsersToHelpers']),
            maxRttFromHelperUsersToHelpers: parseFloat(configurations['useCase']['computingNodesConfig']['maxRttFromHelperUsersToHelpers']),
            minRttFromHelperUsersToHelpers: parseFloat(configurations['useCase']['computingNodesConfig']['minRttFromHelperUsersToHelpers']),

            numTier: 3,
        };

        const helpersConfig = {
            minCPUMIPS: parseInt(configurations['useCase']['helpersConfig']['minCPUMIPS']),
            maxCPUMIPS: parseInt(configurations['useCase']['helpersConfig']['maxCPUMIPS']),
            minMemoryMB: parseInt(configurations['useCase']['helpersConfig']['minMemoryMB']),
            maxMemoryMB: parseInt(configurations['useCase']['helpersConfig']['maxMemoryMB']),
            minDiskGB: parseInt(configurations['useCase']['helpersConfig']['minDiskGB']),
            maxDiskGB: parseInt(configurations['useCase']['helpersConfig']['maxDiskGB']),
            minReliability: parseFloat(configurations['useCase']['helpersConfig']['minReliability']),
            maxReliability: parseFloat(configurations['useCase']['helpersConfig']['maxReliability']),
            os: configurations['useCase']['helpersConfig']['os'],
            numComputingNodes: totalComputingNodes,
            numHelpers: numHelpers
        };

        const userConfig = {
            minCPUMIPS: parseInt(configurations['useCase']['usersConfig']['minCPUMIPS']),
            maxCPUMIPS: parseInt(configurations['useCase']['usersConfig']['maxCPUMIPS']),
            minMemoryMB: parseInt(configurations['useCase']['usersConfig']['minMemoryMB']),
            maxMemoryMB: parseInt(configurations['useCase']['usersConfig']['maxMemoryMB']),
            minDiskGB: parseInt(configurations['useCase']['usersConfig']['minDiskGB']),
            maxDiskGB: parseInt(configurations['useCase']['usersConfig']['maxDiskGB']),
            minReliability: parseFloat(configurations['useCase']['usersConfig']['minReliability']),
            maxReliability: parseFloat(configurations['useCase']['usersConfig']['maxReliability']),
            os: configurations['useCase']['usersConfig']['os'],
            numUsers: numUsers,
            numComputingNodes: totalComputingNodes,
            numHelpers: numHelpers,
        };

        const nodes = new computingNodesGenerator(computingNodesConfig);
        const computingNodes = nodes.generate();
        const computingNodesConnections = nodes.connections();
        fs.readFile("newUsecase/infraConnections.json", 'utf8', (err, data) => {
            if (err) 
                {
                console.error('Error reading file:', err);
                }
          });

        const computingNodesCapacity = nodes.capacity(computingNodes, computingNodesConnections);

        const helpers = new helpersGenerator(helpersConfig);
        const helperNodes = helpers.generate();
        const helperNodesCapacity = helpers.capacity(helperNodes);

        const users = new usersGenerator(userConfig);
        const usersNodes = users.generate();
        const usersNodesCapacity = users.capacity(usersNodes);

        const platformComputingCapacity = computingNodesCapacity['totalComputationalCapacity'] + helperNodesCapacity['totalComputationalCapacity'] + usersNodesCapacity['totalComputationalCapacity'];
        const platformMemoryCapacity = computingNodesCapacity['totalMemoryCapacity'] + helperNodesCapacity['totalMemoryCapacity'] + usersNodesCapacity['totalMemoryCapacity'];
        const platformDiskCapacity = computingNodesCapacity['totalDiskCapacity'] + helperNodesCapacity['totalDiskCapacity'] + usersNodesCapacity['totalDiskCapacity'];

        //Services
        const serviceConfig = {
            platformComputationalCapacity: platformComputingCapacity,
            platformDiskCapacity: platformDiskCapacity,
            platformMemoryCapacity: platformMemoryCapacity,

            minCPUMIPS: parseInt(configurations['useCase']['serviceConfig']['minCPUMIPS']),
            maxCPUMIPS: parseInt(configurations['useCase']['serviceConfig']['maxCPUMIPS']),
            internalProvider: ['K8w'],
            externalProvider: ['AWS', 'Azure', 'Ericsson'],
            codecType: ['H256', 'H264'],
            minReliability: parseFloat(configurations['useCase']['serviceConfig']['minReliability']),
            maxReliability: parseFloat(configurations['useCase']['serviceConfig']['maxReliability']),

            numServices: numUsers,
            numVersions: numVersions,
            numComputingNodes: totalComputingNodes,
            numHelpers: numHelpers,
            numUsers: numUsers,

            minDataSizeCommunication: parseInt(configurations['useCase']['serviceConfig']['minDataSize']),
            maxDataSizeCommunication: parseInt(configurations['useCase']['serviceConfig']['maxDataSize']),

            capacityPercentage: parseFloat(configurations['useCase']['serviceConfig']['capacityPercentage']),
            numServiceComponents: parseInt(configurations['useCase']['new']['numberOfServiceComponentsPerService'])
        };

        const service = new serviceGenerator(serviceConfig);
        const services = service.generate();   
        service.connections(services); //DAG

        //setting
        const dataSetting = 'Total CPU Capacity:' + ` ${platformComputingCapacity}` +
                            '\nTotal Memory Capacity:' + ` ${platformMemoryCapacity}` +
                            '\nTotal Disk Capacity:' + ` ${platformDiskCapacity}` +

                            '\n\nCPU requirement range:' + ` ${services['min_max_CPUrequired']}` +
                            '\nMemory requrement range:' + ` ${services['min_max_MAMORYrequired']}` +
                            '\nDisk requirment range:' + ` ${services['min_max_DISKrequired']}` +
                            '\nData size range:' + ` ${services['min_max_DATASIZE']}` +

                            '\n\nNumber of total services:' + ` ${services['num_services']}` +
                            '\nNumber of components per service:' + ` ${services['num_serviceComponentEach']}` +
                            '\nNumber of component versions:' + ` ${numVersions}` +

                            '\n\nNumber of users:' + ` ${numUsers}` +
                            '\nNumber of helpers:' + ` ${numHelpers}` +
                            '\nNumber of APs:' + ` ${numAPs}` +
                            '\nNumber of edge nodes:' + ` ${numEdgeNodes}` +
                            '\nNumber of cloud nodes:' + ` ${numCloudNodes}`;


        console.log(dataSetting);

        if (!fs.existsSync('newUsecase')) {
            fs.mkdir('newUsecase', (err) => {
              if (err) 
              {
                console.error(`Error creating folder: ${err.message}`);
              }
            });}

        saveJSON(services['services'],'./newUsecase/services.json')
        saveJSON(computingNodes,'./newUsecase/nodes.json')
        saveJSON(helperNodes,'./newUsecase/helpers.json')
        saveJSON(usersNodes,'./newUsecase/users.json')
        saveJSON(dataSetting,'./newUsecase/setup.txt')
    }

    runAlgorithms (scale)
    {
        const usersNodes = readJSON(`./${scale}/users.json`);
        const helperNodes = readJSON(`./${scale}/helpers.json`);
        const computingNodes = readJSON(`./${scale}/nodes.json`);
        const services = readJSON(`./${scale}/services.json`);
        const componentConnections = readJSON(`./${scale}/componentsConnections.json`);
        const infraConnections = readJSON(`./${scale}/infraConnections.json`);
        
        if (configurations['cmd'] == "GA")
        {
        sendAxiosPost(url, {
            computingNodes: computingNodes,
            helperNodes: helperNodes,
            usersNodes: usersNodes,
            services: services,
            componentConnections: componentConnections,
            infraConnections: infraConnections,
    
            scale: scale,
            cmd: "GA",
            configsGA: {
                iteration: configurations['geneticAlgorithmConfigs']['iterations'],
                crossoverRate: configurations['geneticAlgorithmConfigs']['crossoverRate'],
                mutationRate: configurations['geneticAlgorithmConfigs']['mutationRate'],
                selectionSize: configurations['geneticAlgorithmConfigs']['selectionPressure'],
                populationSize: configurations['geneticAlgorithmConfigs']['populationSize']
            }
        });
        }
        else if (configurations['cmd'] == "heuristics")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                scale: scale,
                cmd: "heuristics"
            })
        }
    }

    tuningCommand(scale, tCommand)
    {
        if (scale != 'ave')
        {
            const usersNodes = readJSON(`./${scale}/users.json`);
            const helperNodes = readJSON(`./${scale}/helpers.json`);
            const computingNodes = readJSON(`./${scale}/nodes.json`);
            const services = readJSON(`./${scale}/services.json`);
            const componentConnections = readJSON(`./${scale}/componentsConnections.json`);
            const infraConnections = readJSON(`./${scale}/infraConnections.json`);
            
            let grid;
            if (tCommand == 'tGA')
            {
                grid = configurations['gridTuning']['GA']
            }
            sendAxiosPost(url, {
                characteristics: {
                usersNodes: usersNodes,
                helperNodes: helperNodes,
                computingNodes: computingNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
                },
                cmd: tCommand,
                scale: scale,
                gridSearch: grid
            })
        }
        else if (scale == 'ave')
        {
            const usersNodes_Small = readJSON('./small/users.json');
            const helperNodes_Small = readJSON('./small/helpers.json');
            const computingNodes_Small = readJSON('./small/nodes.json');
            const services_Small = readJSON('./small/services.json');
            const componentConnections_Small = readJSON('./small/connections.json');
        
            const usersNodes_Medium = readJSON('./medium/users.json');
            const helperNodes_Medium = readJSON('./medium/helpers.json');
            const computingNodes_Medium = readJSON('./medium/nodes.json');
            const services_Medium = readJSON('./medium/services.json');
            const componentConnections_Medium = readJSON('./medium/connections.json');
        
            const usersNodes_Larg = readJSON('./large/users.json');
            const helperNodes_Larg = readJSON('./large/helpers.json');
            const computingNodes_Larg = readJSON('./large/nodes.json');
            const services_Larg = readJSON('./large/services.json');
            const componentConnections_Larg = readJSON('./large/connections.json');
        
            const usersNodes_xLarg = readJSON('./xLarge/users.json');
            const helperNodes_xLarg = readJSON('./xLarge/helpers.json');
            const computingNodes_xLarg = readJSON('./xLarge/nodes.json');
            const services_xLarg = readJSON('./xLarge/services.json');
            const componentConnections_xLarg = readJSON('./xLarge/connections.json');
        
            sendAxiosPost(url, {
                small: {
                usersNodes: usersNodes_Small,
                helperNodes: helperNodes_Small,
                computingNodes: computingNodes_Small,
                services: services_Small,
                componentConnections: componentConnections_Small,
                },
                medium: {
                usersNodes: usersNodes_Medium,
                helperNodes: helperNodes_Medium,
                computingNodes: computingNodes_Medium,
                services: services_Medium,
                componentConnections: componentConnections_Medium,
                },
                large: {
                usersNodes: usersNodes_Larg,
                helperNodes: helperNodes_Larg,
                computingNodes: computingNodes_Larg,
                services: services_Larg,
                componentConnections: componentConnections_Larg,
                },
                xLarge: {
                usersNodes: usersNodes_xLarg,
                helperNodes: helperNodes_xLarg,
                computingNodes: computingNodes_xLarg,
                services: services_xLarg,
                componentConnections: componentConnections_xLarg,
                },
                cmd: tCommand,
                scale: "ave"
            })
        }
    }
}

const cmd = new commands();

if (configurations['type'] == 'new')
{
    cmd.newUseCase();
}
else if (configurations['type'] == 'current')
{
    cmd.runAlgorithms(configurations['scale']);
}
else if (configurations['type'] == 'tuning')
{
    cmd.tuningCommand(configurations['scale'], configurations['cmd']);
}