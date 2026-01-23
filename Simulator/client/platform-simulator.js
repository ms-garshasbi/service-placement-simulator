const axios = require('axios');
const fs = require('fs');
const configurations = readJSON("configurations.json");
const ip = configurations['address']['ip'];
const port = configurations['address']['port'];
let url = `http://${ip}:${port}/json`;


function readJSON(filePath)
{
  const result = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  });
  return JSON.parse(result);
}

function getRandomDivisibleByN(a, b, N) 
{
    const min = Math.ceil(a / N);
    const max = Math.floor(b / N);
    const randMultiple = Math.floor(Math.random() * (max - min + 1)) + min;
    return randMultiple * N;
}


let counter = 1
function sendAxiosPost(url, dataObj) {
    const config = {
        timeout: 0 
    };

    function convertToFlatServiceArray(mappings)
    {
        return mappings.map(([serviceID, componentID, versionID, nodeID]) => ({
        serviceID,
        componentID,
        versionID,
        nodeID
        }));
    } 

    function convertMultilineToServiceMap(input) 
    {
        const result = {};
        Object.entries(input).forEach(([key, value]) => {
            const lines = value.trim().split('\n'); 
            const mapped = {};

            lines.forEach((val, index) => {
            mapped[`service${index + 1}`] = parseFloat(val);
            });

            result[key] = mapped;
        });
        return result;
    }

    function saveAll(resData)
    {
        const usersNodes = readJSON(`./${configurations['scale']}/users.json`);
        const helperNodes = readJSON(`./${configurations['scale']}/helpers.json`);
        const computingNodes = readJSON(`./${configurations['scale']}/nodes.json`);
        const services = readJSON(`./${configurations['scale']}/services.json`);
        const componentConnections = readJSON(`./${configurations['scale']}/componentsConnections.json`);
        const data = readJSON(`./${configurations['scale']}/infraConnections.json`);
        const infraConnections = data.map(row =>
        row.map(triplet => triplet.slice(0, 2))
        );

        const combinedData = {
            comment: "CPU unit = MIPS, Mem unit = MB, Disk unit = GB, BW = Mbps, Datasize = Mb, Response time = second",
            computingNodes,
            helperNodes,
            usersNodes,
            services,
            componentConnections,
            infraConnections,
            results: {
                algorithm: `${configurations['algo']}`,
                totalResponseTime: Number(resData[`${configurations['algo']}_result`]['totalResponseTime'].toFixed(4)) ,
                aveResponseTime:  Number(resData[`${configurations['algo']}_result`]['aveResponseTime'].toFixed(4)),
                platformReliability: Number(resData[`${configurations['algo']}_result`]['platformReliability'].toFixed(4)),
                serviceReliability: Number(resData[`${configurations['algo']}_result`]['serviceReliability'].toFixed(4)),
                infrastructureMemoryEntropy: Number(resData[`${configurations['algo']}_result`]['entropyAnalysis']['memory_entropy_infrastructure'].toFixed(4)),
                infrastructureCPUEntropy: Number(resData[`${configurations['algo']}_result`]['entropyAnalysis']['cpu_entropy_infrastructure'].toFixed(4)),
                algorithmRuntime: Number(resData[`${configurations['algo']}_runtime`].toFixed(4)),
                totalComponentsTier1: Number(resData[`${configurations['algo']}_result`]['loadTier1'].toFixed(4)),
                totalComponentsTier2: Number(resData[`${configurations['algo']}_result`]['loadTier2'].toFixed(4)),
                totalComponentsTier3: Number(resData[`${configurations['algo']}_result`]['loadTier3'].toFixed(4)),
                totalComponentsTierUser: Number(resData[`${configurations['algo']}_result`]['loadTierUser'].toFixed(4)),
                totalComponentsTierHelper: Number(resData[`${configurations['algo']}_result`]['loadTierHelper'].toFixed(4)),
                responseTimePerService: convertMultilineToServiceMap(resData[`${configurations['algo']}_perService_result`]),
                finalSolution: convertToFlatServiceArray(resData[`${configurations['algo']}_finalSolution`])
            }
        };

        fs.writeFileSync(
            `./${configurations['scale']}/${configurations['algo']}_allResults_${counter}.json`,
            JSON.stringify(combinedData, null, 2),
            'utf8'
        ); 
    }

    axios.post(url, dataObj, config)
        .then((res) => {
            if (configurations['dataGenration'] == "true")
            {
                console.log(`🚀 Instance ${counter} was solved using ${configurations['algo']}!`)
                console.log(`✅ The results was saved in ./${configurations['scale']}`)
                console.log("-----------------------------------------------------------------")
                saveAll(res.data)       
                
                counter++;
                if (counter > configurations['numOfInstances'])
                {
                    return 1;
                }
                const cmd = new commands();
                cmd.newUseCase()
                setTimeout(() => {
                    //sendAxiosPost(url, dataObj);
                    cmd.runAlgorithms()
                }, 1000); // 1 second delay
            }
            else
            {
                console.log(res.data)
            }
        })
        .catch((err) => {
            // This will catch both timeout and other network issues
            if (err.code === 'ECONNABORTED') {
                console.log('Axios request timed out');
            } else {
                console.log("-------------------------------------------------------------------")
                console.log(err);
                console.log("-------------------------------------------------------------------")
                console.log("ℹ️ If you are training the NCOGA model, please ignore the above error.")
            }
        });
}
    

function saveJSON(jsonResult,str) 
{
    fs.writeFile(str, JSON.stringify(jsonResult, null, 2), 'utf8', (err) => {
        if (err) 
        {
            console.error('An error occurred while saving the file:', err);
        }
    });
}

function getRandomValue(min, max) 
{
    return (Math.random() * (max - min) + min);
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

    getReliabilityScore(min, max) {
        let rl = Math.random();
        if (rl <= 0.7 /*false*/)
        {
            return getRandomValue(0.98, 0.999);
            //return getRandomValue(min, max);
        }
        else
        {
            return getRandomValue(min, max);
        }
        
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
                                cpu: getRandomDivisibleByN(this.minAPCPUMIPS, this.maxAPCPUMIPS, 1),
                                memory: getRandomDivisibleByN(this.minAPMemoryMB, this.maxAPMemoryMB, 1),
                                disk: Number(getRandomValue(this.minAPDiskGB, this.maxAPDiskGB).toFixed(1)),
                                platform: this.APplatform[Math.floor(Math.random() * this.APplatform.length)],
                                reliabilityScore: this.getReliabilityScore(this.minAPReliability, this.maxAPReliability),
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
                                cpu: getRandomDivisibleByN(this.minENCPUMIPS, this.maxENCPUMIPS, 1),
                                memory: getRandomDivisibleByN(this.minENMemoryMB, this.maxENMemoryMB, 1),
                                disk: Number(getRandomValue(this.minENDiskGB, this.maxENDiskGB).toFixed(1)),
                                platform: this.ENplatform[Math.floor(Math.random() * this.ENplatform.length)],
                                reliabilityScore: this.getReliabilityScore(this.minAPReliability, this.maxAPReliability),
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
                                cpu: getRandomDivisibleByN(this.minCNCPUMIPS, this.maxCNCPUMIPS,1),
                                memory: getRandomDivisibleByN(this.minCNMemoryMB, this.maxCNMemoryMB,1),
                                disk: Number(getRandomValue(this.minCNDiskGB, this.maxCNDiskGB).toFixed(1)),
                                platform: this.CNplatform[Math.floor(Math.random() * this.CNplatform.length)],
                                reliabilityScore: this.getReliabilityScore(this.minAPReliability, this.maxAPReliability),
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
                        0,
                        0
                    ];
                }
                else if (i < numCNTier1 && j < numCNTier1) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthInTier1, this.maxBandwidthInTier1))
                    nodeConnections[i][j] = [
                            bw,
                            Number(getRandomValue(this.minRttInTier1, this.maxRttInTier1).toFixed(4)),
                            bw
                        ];
                }
                else if (i >= numCNTier1 && i < numCNTier1 + numCNTier2 && j >= numCNTier1 && j < numCNTier1 + numCNTier2) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthInTier2, this.maxBandwidthInTier2))
                    nodeConnections[i][j] = [
                            bw,
                            Number(getRandomValue(this.minRttInTier2, this.maxRttInTier2).toFixed(4)),
                            bw
                        ];
                }
                else if (i >= numCNTier1 + numCNTier2 && i < numCNTier1 + numCNTier2 + numCNTier3 && j >= numCNTier1 + numCNTier2 && j < numCNTier1 + numCNTier2 + numCNTier3) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthInTier3, this.maxBandwidthInTier3))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttInTier3, this.maxRttInTier3).toFixed(4)),
                        bw
                    ];
                }
                else if (i < numCNTier1 && j >= numCNTier1 && j < numCNTier1 + numCNTier2) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthFromTier1ToTier2, this.maxBandwidthFromTier1ToTier2))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttFromTier1ToTier2, this.maxRttFromTier1ToTier2).toFixed(4)),
                        bw
                    ];
                }
                else if (i < numCNTier1 && j >= numCNTier1 + numCNTier2 && j < numCNTier1 + numCNTier2 + numCNTier3) 
                {
                    const bw =  Math.floor(getRandomValue(this.minBandwidthFromTier1ToTier3, this.maxBandwidthFromTier1ToTier3))
                    nodeConnections[i][j] = [
                       bw,
                        Number(getRandomValue(this.minRttFromTier1ToTier3, this.maxRttFromTier1ToTier3).toFixed(4)),
                        bw
                    ];
                }
                else if (i >= numCNTier1 && i < numCNTier1 + numCNTier2 && j >= numCNTier1 + numCNTier2 && j < numCNTier1 + numCNTier2 + numCNTier3) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthFromTier2ToTier3, this.maxBandwidthFromTier2ToTier3))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttFromTier2ToTier3, this.maxRttFromTier2ToTier3).toFixed(4)),
                        bw
                    ];
                }
                else if (i < numCNTier1 && j >= numCNTier1 + numCNTier2 + numCNTier3 && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthFromUserToTier1, this.maxBandwidthFromUserToTier1))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttFromUserToTier1, this.maxRttFromUserToTier1).toFixed(4)),
                        bw
                    ];
                }
                else if (i >= numCNTier1 && i < numCNTier1 + numCNTier2 && j >= numCNTier1 + numCNTier2 + numCNTier3 && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthFromUserToTier2, this.maxBandwidthFromUserToTier2))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttFromUserToTier2, this.maxRttFromUserToTier2).toFixed(4)),
                        bw
                    ];
                }
                else if (i >= numCNTier1 + numCNTier2 && i < numCNTier1 + numCNTier2 + numCNTier3 && j >= numCNTier1 + numCNTier2 + numCNTier3 && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthFromUserToTier3, this.maxBandwidthFromUserToTier3))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttFromUserToTier3, this.maxRttFromUserToTier3).toFixed(4)),
                        bw
                    ];
                }
                else if (i < numCNTier1 + numCNTier2 + numCNTier3 && j >= numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers + this.numUsers) 
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthFromHelperToInfrastructure, this.maxBandwidthFromHelperToInfrastructure))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttFromHelperToInfrastructure, this.maxRttFromHelperToInfrastructure).toFixed(4)),
                        bw
                    ];
                }
                else if (i >= numCNTier1 + numCNTier2 + numCNTier3 && i < numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers && j >= numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers && j < numCNTier1 + numCNTier2 + numCNTier3 + this.numHelpers + this.numUsers) //Users to helpers
                {
                    const bw = Math.floor(getRandomValue(this.minBandwidthFromUsersToHelpers, this.maxBandwidthFromUsersToHelpers))
                    nodeConnections[i][j] = [
                        bw,
                        Number(getRandomValue(this.minRttFromHelperUsersToHelpers, this.maxRttFromHelperUsersToHelpers).toFixed(4)),
                        bw
                    ];
                }
                else
                {
                    nodeConnections[i][j] = [
                        0,
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

        fs.writeFile(`./${configurations['scale']}/infraConnections.json`, JSON.stringify(nodeConnections), (err) => {
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
                    cpu: getRandomDivisibleByN(this.minCPUMIPS, this.maxCPUMIPS, 1),
                    memory: getRandomDivisibleByN(this.minMemoryMB, this.maxMemoryMB, 1),
                    disk: Number(getRandomValue(this.minDiskGB, this.maxDiskGB).toFixed(1)),
                    os: this.os[Math.floor(Math.random() * this.os.length)],
                    reliability: getRandomValue(this.minReliability, this.maxReliability),
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
                    cpu: getRandomDivisibleByN(this.minCPUMIPS, this.maxCPUMIPS, 1),
                    memory: getRandomDivisibleByN(this.minMemoryMB, this.maxMemoryMB, 1),
                    disk: Number(getRandomValue(this.minDiskGB, this.maxDiskGB).toFixed(1)),
                    os: this.os[Math.floor(Math.random() * this.os.length)],
                    reliability: getRandomValue(this.minReliability, this.maxReliability),
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
        if (rl <= 0.9)
        {
            return getRandomValue(0.99, 1);
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

    shuffleArray(arr) 
    {
        for (let i = arr.length - 1; i > 0; i--) 
        {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    generate()
    {
            const totalSCs = this.numUsers * this.numServiceComponents;

            const platformComputation = this.platformComputationalCapacity * (this.capacityPercentage);
            const platformMemory = this.platformMemoryCapacity * (this.capacityPercentage);
            const platformDisk = this.platformDiskCapacity * 0.2;
            const maxMemPerSC = platformMemory / totalSCs;
            const maxDiskPerSC = platformDisk / totalSCs;
            const maxComPerSC = this.maxCPUMIPS
            const minComPerSC = this.minCPUMIPS

            const p1 = 0.8;
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
                    helperID: hID,
                    deadline: 6
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

                        const provider = this.getProvider();
                        const codec = this.getCodecType();
                        let w1 = 1;
                        let w2 = 1;
                        if (provider == 'AWS')
                        {
                            //w1 = 1.1
                        }
                        else if (provider == 'Azure')
                        {
                            //w1 = 1.2
                        }
                        else if (provider == 'Ericsson')
                        {
                            //w1 = 1.3
                        }
                        else if (provider == 'K8w')
                        {
                            //w1 = 0.90
                        }

                        if (codec == 'H256')
                        {
                            //w2 = 1
                        }
                        else if (codec == 'H264')
                        {
                            //w2 = 1.3
                        }
                        const is = getRandomValue(2, 5)
                        const version = {
                            versionNumber: v + 1,
                            characteristics: {
                                cpu: getRandomDivisibleByN(minComPerSC, maxComPerSC, 1),
                                memory:getRandomDivisibleByN(maxMemPerSC * p1* w1, maxMemPerSC * p2* w1, 1), 
                                dataSize: Number(getRandomValue(this.minDataSizeCommunication* w1,this.maxDataSizeCommunication* w1).toFixed(1)),
                                disk: Number(getRandomValue(maxDiskPerSC * p1* w1, maxDiskPerSC * p2* w1).toFixed(1)),
                                provider: provider,
                                codecType: codec,
                                reliabilityScore: this.getReliabilityScore(this.minReliability - (w1 * 0.025), this.maxReliability),
                                imageSize: 1,
                                installingTime: is * 1
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

    requiredCapacity(services)
    {
        let totalComputationalRequirement = 0;
        let totalMemoryRequirement = 0;
        let totalDiskRequirement = 0;
        let totalNetworkRequirement = 0;
        for (let i = 0; i < services.length; i++)
        {
            for (let c = 0; c < services[i]['components'].length; c++)
            {
                for (let v = 0; v < services[i]['components'][c]['versions'].length; v++)
                {
                    totalComputationalRequirement += services[i]['components'][c]['versions'][v]['characteristics']['cpu'];
                    totalMemoryRequirement += services[i]['components'][c]['versions'][v]['characteristics']['memory'];
                    totalDiskRequirement += services[i]['components'][c]['versions'][v]['characteristics']['disk'];
                    //totalNetworkRequirement += services[i]['components'][c]['versions'][v]['characteristics']['dataSize'];
                }
            }
        }
        return {
            totalComputationalRequirement: totalComputationalRequirement / this.numVersions,
            totalMemoryRequirement: totalMemoryRequirement / this.numVersions,
            totalDiskRequirement: totalDiskRequirement / this.numVersions
            //totalNetworkRequirement: totalNetworkRequirement / this.numVersions
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
                    if (j > i+1 && Math.random() < 0.7) // 70% of service components are connected in service chain
                    {
                        matrix[i][j] = 1;
                    }
                    else if (j == i+1)
                    {
                        matrix[i][j] = 1;
                    }
                    else if (i > numComponents - 3 && j > i)
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
        
        fs.writeFile(`./${configurations['scale']}/componentsConnections.json`, JSON.stringify(matrix), (err) => {
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
        fs.readFile(`${configurations['scale']}/infraConnections.json`, 'utf8', (err, data) => {
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

        const platformComputingCapacity = computingNodesCapacity['totalComputationalCapacity']
        const platformMemoryCapacity = computingNodesCapacity['totalMemoryCapacity']
        const platformDiskCapacity = computingNodesCapacity['totalDiskCapacity']
        const platformNetworkCapacity = computingNodesCapacity['totalBandwidthCapaciti'];

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
        const servicesRequirement =  service.requiredCapacity(services['services']);

        const dataSize = [configurations['useCase']['serviceConfig']['minDataSize'], configurations['useCase']['serviceConfig']['maxDataSize']] 
        
        const componentConnections = service.connections(services); //DAG

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

        console.log("✅ New instance was created!")

        if (!fs.existsSync(`${configurations['scale']}`)) {
            fs.mkdir(`${configurations['scale']}`, (err) => {
              if (err) 
              {
                console.error(`Error creating folder: ${err.message}`);
              }
            });}

        saveJSON(services['services'],`./${configurations['scale']}/services.json`)
        saveJSON(computingNodes,`./${configurations['scale']}/nodes.json`)
        saveJSON(helperNodes,`./${configurations['scale']}/helpers.json`)
        saveJSON(usersNodes,`./${configurations['scale']}/users.json`)
        saveJSON(dataSetting,`./${configurations['scale']}/setup.txt`)

        return { services: services['services'],
            computingNodes: computingNodes,
            helperNodes: helperNodes,
            usersNodes: usersNodes,
            componentConnections: componentConnections,
            infraConnections: computingNodesConnections,
            dataSetting: dataSetting
        }

    }

     runAlgorithms (input = "")
    {
        let usersNodes
        let helperNodes
        let computingNodes
        let services
        let componentConnections
        let infraConnections
        if (input == "")
        {
            usersNodes = readJSON(`./${configurations['scale']}/users.json`);
            helperNodes = readJSON(`./${configurations['scale']}/helpers.json`);
            computingNodes = readJSON(`./${configurations['scale']}/nodes.json`);
            services = readJSON(`./${configurations['scale']}/services.json`);
            componentConnections = readJSON(`./${configurations['scale']}/componentsConnections.json`);
            infraConnections = readJSON(`./${configurations['scale']}/infraConnections.json`);
        }
        else
        {
            usersNodes = input['usersNodes']
            helperNodes = input['helperNodes']
            computingNodes = input['computingNodes']
            services = input['services']
            componentConnections = input['componentConnections']
            infraConnections = input['infraConnections']
        }   
        if (configurations['algo'] == "GA")
        {
        sendAxiosPost(url, {
            computingNodes: computingNodes,
            helperNodes: helperNodes,
            usersNodes: usersNodes,
            services: services,
            componentConnections: componentConnections,
            infraConnections: infraConnections,
    
            type: configurations['type'],
            scale: configurations['scale'],
            algo: configurations['algo'],
            configsGA: {
                iteration: configurations['geneticAlgorithm']['iterations'],
                crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                populationSize: configurations['geneticAlgorithm']['populationSize']
            }
        });
        }
        else if (configurations['algo'] == "SBGA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsGA: {
                    iteration: configurations['geneticAlgorithm']['iterations'],
                    crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                    mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                    selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                    populationSize: configurations['geneticAlgorithm']['populationSize']
                }
            });
        }
        else if (configurations['algo'] == "rnd")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
            });
        }
        else if (configurations['algo'] == "PGA")
        {
        sendAxiosPost(url, {
            computingNodes: computingNodes,
            helperNodes: helperNodes,
            usersNodes: usersNodes,
            services: services,
            componentConnections: componentConnections,
            infraConnections: infraConnections,
    
            type: configurations['type'],
            scale: configurations['scale'],
            algo: configurations['algo'],
            configsPGA: {
                iteration: configurations['geneticAlgorithm']['iterations'],
                crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                populationSize: configurations['geneticAlgorithm']['populationSize']
            }
        });
        }
        else if (configurations['algo'] == "SA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsSA: {
                    termination: configurations['simulatedAnnealing']['terminationValue'],
                    temperature: configurations['simulatedAnnealing']['temperature'],
                    alpha: configurations['simulatedAnnealing']['alpha'],
                    rate: configurations['simulatedAnnealing']['updatingRate']
                }
            })
        }
        else if (configurations['algo'] == "popSA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsPopSA: {
                    termination: configurations['popSimulatedAnnealing']['terminationValue'],
                    temperature: configurations['popSimulatedAnnealing']['temperature'],
                    alpha: configurations['popSimulatedAnnealing']['alpha'],
                    rate: configurations['popSimulatedAnnealing']['updatingRate'],
                    popSize: configurations['popSimulatedAnnealing']['populationSize'],
                    selectionSize: configurations['popSimulatedAnnealing']['selectionPressure']
                }
            })
        }
        else if (configurations['algo'] == "PSO")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsPSO: {
                    populationSize: configurations['particleSwarmOptimization']['populationSize'],
                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2'],
                    iteration: configurations['particleSwarmOptimization']['iteration']
                }
            })
        }
        else if (configurations['algo'] == "SCA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsSCA: {
                    populationSize: configurations['sineCosineAlgorithm']['populationSize'],
                    iteration: configurations['sineCosineAlgorithm']['iteration'],
                    b: configurations['sineCosineAlgorithm']['b']
                }
            })
        }
        else if (configurations['algo'] == "GWO")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsGWO: {
                    populationSize: configurations['greyWolfOptimizer']['populationSize'],
                    a: configurations['greyWolfOptimizer']['a'],
                    coefficient_A: configurations['greyWolfOptimizer']['coefficient_A'],
                    coefficient_C: configurations['greyWolfOptimizer']['coefficient_C'],
                    iteration: configurations['greyWolfOptimizer']['iteration']
                }
            })
        }
        else if (configurations['algo'] == "WOA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsWOA: {
                    populationSize: configurations['whaleOptimizationAlgorithm']['populationSize'],
                    a: configurations['whaleOptimizationAlgorithm']['a'],
                    l: configurations['whaleOptimizationAlgorithm']['l'],
                    coefficient_A: configurations['whaleOptimizationAlgorithm']['coefficient_A'],
                    coefficient_C: configurations['whaleOptimizationAlgorithm']['coefficient_C'],
                    iteration: configurations['whaleOptimizationAlgorithm']['iteration']
                }
            })
        }
        else if (configurations['algo'] == "DE")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsDE: {
                    populationSize: configurations['differentialEvolution']['populationSize'],
                    crossoverRate: configurations['differentialEvolution']['crossoverRate'],
                    F: configurations['differentialEvolution']['F'],
                    iteration: configurations['differentialEvolution']['iteration'],
                }
            })
        }
        else if (configurations['algo'] == "FA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsFA: {
                    populationSize: configurations['firefly']['populationSize'],
                    beta: configurations['firefly']['beta'],
                    landa: configurations['firefly']['landa'],
                    alpha: configurations['firefly']['alpha'],
                    iteration: configurations['firefly']['iteration']
                }
            })
        }
        else if (configurations['algo'] == "GASA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsGA: {
                    iteration: configurations['geneticAlgorithm']['iterations'],
                    crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                    mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                    selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                    populationSize: configurations['geneticAlgorithm']['populationSize']
                },
                configsSA: {
                    termination: configurations['simulatedAnnealing']['terminationValue'],
                    temperature: configurations['simulatedAnnealing']['temperature'],
                    alpha: configurations['simulatedAnnealing']['alpha'],
                    rate: configurations['simulatedAnnealing']['updatingRate']
                }
            })
        }
        else if (configurations['algo'] == "PSODE")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsDE: {
                    iteration: configurations['differentialEvolution']['iteration'],
                    F: configurations['differentialEvolution']['F'],
                    crossoverRate: configurations['differentialEvolution']['crossoverRate'],
                    populationSize: configurations['differentialEvolution']['populationSize']
                },
                configsPSO: {
                    populationSize: configurations['particleSwarmOptimization']['populationSize'],
                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2'],
                    iteration: configurations['particleSwarmOptimization']['iteration']
                }
            })
        }
        else if (configurations['algo'] == "PSOGA" || configurations['algo'] == "GAPSO")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsGA: {
                    iteration: configurations['geneticAlgorithm']['iterations'],
                    crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                    mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                    selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                    populationSize: configurations['geneticAlgorithm']['populationSize']
                },
                configsPSO: {
                    populationSize: configurations['particleSwarmOptimization']['populationSize'],
                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2'],
                    iteration: configurations['particleSwarmOptimization']['iteration']
                }
            })
        }
        else if (configurations['algo'] == "PSOGApopSA" || configurations['algo'] == "popSAPSOGA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsGA: {
                    iteration: configurations['geneticAlgorithm']['iterations'],
                    crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                    mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                    selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                    populationSize: configurations['geneticAlgorithm']['populationSize']
                },
                configsPSO: {
                    populationSize: configurations['particleSwarmOptimization']['populationSize'],
                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2'],
                    iteration: configurations['particleSwarmOptimization']['iteration']
                },
                configsPopSA: {
                    termination: configurations['popSimulatedAnnealing']['terminationValue'],
                    temperature: configurations['popSimulatedAnnealing']['temperature'],
                    alpha: configurations['popSimulatedAnnealing']['alpha'],
                    rate: configurations['popSimulatedAnnealing']['updatingRate'],
                    popSize: configurations['popSimulatedAnnealing']['populationSize'],
                    selectionSize: configurations['popSimulatedAnnealing']['selectionPressure']
                }
            })
        }
        else if (configurations['algo'] == "pHybrid")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsGA: {
                    iteration: configurations['geneticAlgorithm']['iterations'],
                    crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                    mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                    selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                    populationSize: configurations['geneticAlgorithm']['populationSize']
                },
                configsPSO: {
                    populationSize: configurations['particleSwarmOptimization']['populationSize'],
                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2'],
                    iteration: configurations['particleSwarmOptimization']['iteration']
                },
                configsSCA: {
                    populationSize: configurations['sineCosineAlgorithm']['populationSize'],
                    iteration: configurations['sineCosineAlgorithm']['iteration'],
                    b: configurations['sineCosineAlgorithm']['b'],
                    p: configurations['sineCosineAlgorithm']['p'],
                    landa: configurations['sineCosineAlgorithm']['landa'],
                    mRate: configurations['sineCosineAlgorithm']['mRate']
                },
                configsGWO: {
                    populationSize: configurations['greyWolfOptimizer']['populationSize'],
                    a: configurations['greyWolfOptimizer']['a'],
                    coefficient_A: configurations['greyWolfOptimizer']['coefficient_A'],
                    coefficient_C: configurations['greyWolfOptimizer']['coefficient_C'],
                    iteration: configurations['greyWolfOptimizer']['iteration']
                },
                configsWOA: {
                    populationSize: configurations['whaleOptimizationAlgorithm']['populationSize'],
                    a: configurations['whaleOptimizationAlgorithm']['a'],
                    l: configurations['whaleOptimizationAlgorithm']['l'],
                    coefficient_A: configurations['whaleOptimizationAlgorithm']['coefficient_A'],
                    coefficient_C: configurations['whaleOptimizationAlgorithm']['coefficient_C'],
                    iteration: configurations['whaleOptimizationAlgorithm']['iteration']
                },
                configsDE: {
                    populationSize: configurations['differentialEvolution']['populationSize'],
                    crossoverRate: configurations['differentialEvolution']['crossoverRate'],
                    F: configurations['differentialEvolution']['F'],
                    iteration: configurations['differentialEvolution']['iteration'],
                },
                configsFA: {
                    populationSize: configurations['firefly']['populationSize'],
                    beta: configurations['firefly']['beta'],
                    landa: configurations['firefly']['landa'],
                    alpha: configurations['firefly']['alpha'],
                    iteration: configurations['firefly']['iteration']
                },
                configspHybrid: {
                    subIteration: configurations['pHybrid']['subIteration'],
                    iteration: configurations['pHybrid']['iteration'],
                    algorithms: configurations['pHybrid']['algorithms']
                }
            })
        }
        else if (configurations['algo'] == "PpopSA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsPpopSA: {
                    termination: configurations['parallelPopSimulatedAnnealingConfigs']['terminationValue'],
                    temperature: configurations['parallelPopSimulatedAnnealingConfigs']['temperature'],
                    alpha: configurations['parallelPopSimulatedAnnealingConfigs']['alpha'],
                    updatingRate: configurations['parallelPopSimulatedAnnealingConfigs']['updatingRate'],
                    populationSize: configurations['parallelPopSimulatedAnnealingConfigs']['populationSize'],
                    selectionSize: configurations['parallelPopSimulatedAnnealingConfigs']['selectionPressure'],
                    numOfSlaves: configurations['parallelPopSimulatedAnnealingConfigs']['numberOfSlaves']
                }
            })
        }
        else if (configurations['algo'] == "TCA" || configurations['algo'] == "LRC" || configurations['algo'] == "MDS" || configurations['algo'] == "MR" || configurations['algo'] == "MP" || configurations['algo'] == "LP")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo']
            })
        }
        else if (configurations['algo'] == "heuristics")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo']
            })
        }
        else if (configurations['algo'] == "NCOtrainGA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsGA: {
                    iteration: configurations['geneticAlgorithm']['iterations'],
                    crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                    mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                    selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                    populationSize: configurations['geneticAlgorithm']['populationSize'],
                    termination: configurations['geneticAlgorithm']['termination']
                }
            })
        }
        else if (configurations['algo'] == "NCOtrainSA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo']
            })
        }
        else if (configurations['algo'] == "NCOtrainPSO")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsPSO: {
                    populationSize: configurations['particleSwarmOptimization']['populationSize'],
                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2'],
                    iteration: configurations['particleSwarmOptimization']['iteration'],
                    termination: configurations['particleSwarmOptimization']['termination']
                }
            })
        }
        else if (configurations['algo'] == "NCOtrainPSOGA")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsPSOGA: {
                    populationSizeGA: configurations['geneticAlgorithm']['populationSize'],
                    iterationGA: configurations['geneticAlgorithm']['iterations'],
                    terminationGA: configurations['geneticAlgorithm']['termination'],
                    populationSizePSO: configurations['particleSwarmOptimization']['populationSize'],
                    iterationPSO: configurations['particleSwarmOptimization']['iteration'],
                    terminationPSO: configurations['particleSwarmOptimization']['termination'],

                    crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                    mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                    selectionSize: configurations['geneticAlgorithm']['selectionPressure'],

                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2']
                }
            })
        }
        else if (configurations['algo'] == "NCOtrainPSODE")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsPSODE: {
                    populationSizeDE: configurations['differentialEvolution']['populationSize'],
                    iterationDE: configurations['differentialEvolution']['iteration'],
                    terminationDE: configurations['differentialEvolution']['termination'],
                    populationSizePSO: configurations['particleSwarmOptimization']['populationSize'],
                    iterationPSO: configurations['particleSwarmOptimization']['iteration'],
                    terminationPSO: configurations['particleSwarmOptimization']['termination'],

                    crossoverRate: configurations['differentialEvolution']['crossoverRate'],
                    F: configurations['differentialEvolution']['F'],

                    w: configurations['particleSwarmOptimization']['w'],
                    c1: configurations['particleSwarmOptimization']['c1'],
                    c2: configurations['particleSwarmOptimization']['c2']
                }
            })
        }
        else if (configurations['algo'] == "NCOtrainDE")
        {
            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo'],
                configsDE: {
                    populationSize: configurations['differentialEvolution']['populationSize'],
                    crossoverRate: configurations['differentialEvolution']['crossoverRate'],
                    F: configurations['differentialEvolution']['F'],
                    iteration: configurations['differentialEvolution']['iteration'],
                    termination: configurations['differentialEvolution']['termination']
                }
            })
        }
        else if (configurations['algo'] == "NCOtest" || configurations['algo'] == "NCOGA")
        {
            const sizeInBytes = Buffer.byteLength(JSON.stringify( {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo']
            }));
            console.log("Size:", (sizeInBytes / 1024).toFixed(2), "KB");
            console.log("Size:", (sizeInBytes / (1024 * 1024)).toFixed(2), "MB");

            sendAxiosPost(url, {
                computingNodes: computingNodes,
                helperNodes: helperNodes,
                usersNodes: usersNodes,
                services: services,
                componentConnections: componentConnections,
                infraConnections: infraConnections,
        
                type: configurations['type'],
                scale: configurations['scale'],
                algo: configurations['algo']
            })
        }
        else if (configurations['algo'] == 'FLUDL' || configurations['algo'] == 'FLRAS' || configurations['algo'] == 'FLGAPSO' || configurations['algo'] == 'FLPSOGA' || configurations['algo'] == 'FLSA' || configurations['algo'] == 'FLWOA' || configurations['algo'] == 'FLDE' || configurations['algo'] == 'FLPSO' || configurations['algo'] == "FLGA" || configurations['algo'] == 'FLTCA' || configurations['algo'] == 'FLRecTime' || configurations['algo'] == 'FLRelScore' || configurations['algo'] == 'FLExeTime'  || configurations['algo'] == 'FLResTime')
        {
            if (configurations['algo'] == 'FLRAS' || configurations['algo'] == 'FLGAPSO' || configurations['algo'] == "FLPSOGA" || configurations['algo'] == "FLGA" || configurations['algo'] == 'FLPSO' || configurations['algo'] == 'FLDE' || configurations['algo'] == 'FLWOA' || configurations['algo'] == 'FLSA')
            {
                sendAxiosPost(url, {
                    computingNodes: computingNodes,
                    helperNodes: helperNodes,
                    usersNodes: usersNodes,
                    services: services,
                    componentConnections: componentConnections,
                    infraConnections: infraConnections,
            
                    type: configurations['type'],
                    scale: configurations['scale'],
                    algo: configurations['algo'],

                    configsGA: {
                        iteration: configurations['geneticAlgorithm']['iterations'],
                        crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                        mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                        selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                        populationSize: configurations['geneticAlgorithm']['populationSize'],
                        termination: configurations['geneticAlgorithm']['termination']
                    },

                    configsPSO: {
                        iteration: configurations['particleSwarmOptimization']['iteration'],
                        populationSize: configurations['particleSwarmOptimization']['populationSize'],
                        w: configurations['particleSwarmOptimization']['w'],
                        c1: configurations['particleSwarmOptimization']['c1'],
                        c2: configurations['particleSwarmOptimization']['c2'],
                        termination: configurations['particleSwarmOptimization']['termination']
                    },

                    configsDE: {
                        iteration: configurations['differentialEvolution']['iteration'],
                        populationSize: configurations['differentialEvolution']['populationSize'],
                        crossoverRate: configurations['differentialEvolution']['crossoverRate'],
                        F: configurations['differentialEvolution']['F'],
                        termination: configurations['differentialEvolution']['termination']
                    },

                    configsWOA: {
                        iteration: configurations['whaleOptimizationAlgorithm']['iteration'],
                        populationSize: configurations['whaleOptimizationAlgorithm']['populationSize'],
                        coefficient_A: configurations['whaleOptimizationAlgorithm']['coefficient_A'],
                        coefficient_C: configurations['whaleOptimizationAlgorithm']['coefficient_C'],
                        a: configurations['whaleOptimizationAlgorithm']['a'],
                        b: configurations['whaleOptimizationAlgorithm']['b'],
                        l: configurations['whaleOptimizationAlgorithm']['l']
                    },

                    configsSA: {
                        terminationValue: configurations['popSimulatedAnnealing']['terminationValue'],
                        temperature: configurations['popSimulatedAnnealing']['temperature'],
                        alpha: configurations['popSimulatedAnnealing']['alpha'],
                        updatingRate: configurations['popSimulatedAnnealing']['updatingRate'],
                        populationSize: configurations['popSimulatedAnnealing']['populationSize'],
                        selectionPressure: configurations['popSimulatedAnnealing']['selectionPressure']
                    }

                })
            }
            else
            {
                sendAxiosPost(url, {
                    computingNodes: computingNodes,
                    helperNodes: helperNodes,
                    usersNodes: usersNodes,
                    services: services,
                    componentConnections: componentConnections,
                    infraConnections: infraConnections,
            
                    type: configurations['type'],
                    scale: configurations['scale'],
                    algo: configurations['algo'],

                    configsGA: {
                        iteration: configurations['geneticAlgorithm']['iterations'],
                        crossoverRate: configurations['geneticAlgorithm']['crossoverRate'],
                        mutationRate: configurations['geneticAlgorithm']['mutationRate'],
                        selectionSize: configurations['geneticAlgorithm']['selectionPressure'],
                        populationSize: configurations['geneticAlgorithm']['populationSize'],
                        termination: configurations['geneticAlgorithm']['termination']
                    }
                })
            }
        }
    }

    tuningCommand()
    {
        if (configurations['scale'] != 'ave')
        {
            const usersNodes = readJSON(`./${configurations['scale']}/users.json`);
            const helperNodes = readJSON(`./${configurations['scale']}/helpers.json`);
            const computingNodes = readJSON(`./${configurations['scale']}/nodes.json`);
            const services = readJSON(`./${configurations['scale']}/services.json`);
            const componentConnections = readJSON(`./${configurations['scale']}/componentsConnections.json`);
            const infraConnections = readJSON(`./${configurations['scale']}/infraConnections.json`);
            
            let grid;
            if (configurations['algo'] == 'GA')
            {
                grid = configurations['gridTuning']['GA']
            }
            else if (configurations['algo'] == "SA")
            {
                grid = configurations['gridTuning']['SA']
            }
            else if (configurations['algo'] == "popSA")
            {
                grid = configurations['gridTuning']['popSA']
            }
            else if (configurations['algo'] == "PSO")
            {
                grid = configurations['gridTuning']['PSO']
            }
            else if (configurations['algo'] == "SCA")
            {
                grid = configurations['gridTuning']['SCA']
            }
            else if (configurations['algo'] == "DE")
            {
                grid = configurations['gridTuning']['DE']
            }
            else if (configurations['algo'] == "GWO")
            {
                grid = configurations['gridTuning']['GWO']
            }
            else if (configurations['algo'] == "WOA")
            {
                grid = configurations['gridTuning']['WOA']
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
                type: configurations['type'],
                algo: configurations['algo'],
                scale: configurations['scale'],
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
                type: configurations['type'],
                algo: configurations['algo'],
                scale: "ave"
            })
        }
    }

    optConfigCommand()
    {
        sendAxiosPost(url, {
            type: configurations['type'],
            algo: configurations['algo'],
            scale: configurations['scale']
        })
    }
}

const cmd = new commands();

if (configurations['type'] == 'new')
{
    cmd.newUseCase();
}
else if (configurations['type'] == 'current')
{
    cmd.runAlgorithms();
}
else if (configurations['type'] == 'tuning')
{
    cmd.tuningCommand();
}
else if (configurations['type'] == 'optConfig')
{
    cmd.optConfigCommand();
}