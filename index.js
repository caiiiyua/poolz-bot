require('dotenv').config();
const Web3 = require('web3');
const abi = require('./poolzabi.js')

const contractAddress = process.env.POOLZ_CONTRACT_ADDRESS;
const poolId = process.env.POOLZ_POOL_ID;

const options = {
    timeout: 30000, // ms
    clientConfig: {
      // Useful to keep a connection alive
      keepalive: true,
      keepaliveInterval: 60000 // ms
    },
    // Enable auto reconnection
    reconnect: {
        auto: true,
        delay: 5000, // ms
        maxAttempts: 5,
        onTimeout: false
    }
};
const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.INFURA_WSS, options));
web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);
const accountAddress = web3.eth.accounts.wallet[0].address

const defaultInvestGasPrice = web3.utils.toWei(process.env.POOLZ_INVEST_GAS_PRICE, 'gwei');
const defaultClaimGasPrice = web3.utils.toWei(process.env.POOLZ_CLAIM_GAS_PRICE, 'gwei');

const poolzContract = new web3.eth.Contract(abi, contractAddress);

var maxEthInvest = 0
var leftToken = 0
var startTime = 0
var stopTime = 0
var claimTime = 0
var tokenRate = 0
var lastBlockTime = []
var invested = 0
var transactionInProgress = false
var failed = 0
const myInvestmentIds = []
const withdrawInProgress = new Map()

function investPool(id, maxInvest) {
    return poolzContract.methods.InvestETH(id).send({ value: maxInvest, from: accountAddress, gasPrice: defaultInvestGasPrice, gas: process.env.POOLZ_GAS_LIMIT })
}

function withdrawPool(investId) {
    return poolzContract.methods.WithdrawInvestment(investId).send({ from: accountAddress, gasPrice: defaultClaimGasPrice, gas: process.env.POOLZ_GAS_LIMIT })
}

function addBlockTime(blockTime) {
    if (lastBlockTime.length < 5) {
        lastBlockTime.push(blockTime)
    } else {
        lastBlockTime.shift()
        lastBlockTime.push(blockTime)
    }
}

function calculateAvgBlockTime() {
    if (lastBlockTime.length == 0) return - 1
    let sum = lastBlockTime[lastBlockTime.length - 1] - lastBlockTime[0]
    return sum / lastBlockTime.length
}

function doInvest(blockTime, avgBlockTime) {
    let countdown = startTime - blockTime
    let countdown2 = startTime - Date.now()/1000
    console.log("startTime:", startTime, "leftToken: ", leftToken, "maxEthInvest: ", maxEthInvest, "timestamp: ", blockTime);
    console.log("countdown:", countdown, "countdown2", countdown2, "average Blocktime:", avgBlockTime)
    if (blockTime >= stopTime) {
        console.log("Pool has been closed...")
        return;
    }
    if (invested > 0 || failed == process.env.MAX_RETRY) {
        console.log("Invested: ", invested)
        // process.exit(-1)
        return;
    }
    if (transactionInProgress == true) {
        console.log("Transaction in progress, wait for a while...")
        return;
    }
    if (countdown - avgBlockTime <= 0) {
        for (let index = 0; index < process.env.MAX_INVESTMENT; index++) {
            transactionInProgress = true
            investPool(poolId, maxEthInvest).then(result => {
                invested += maxEthInvest
                transactionInProgress = false
                console.log(result)
            }).catch(error => {
                transactionInProgress = false
                failed = failed + 1
                console.error(error)
            })
        }
    }
}

function doWithdraw(blockTime, avgBlockTime) {
    let countdown = claimTime - blockTime
    console.log("claimTime:", claimTime, "leftToken: ", leftToken, "timestamp: ", blockTime);
    console.log("countdown:", countdown, "average Blocktime:", avgBlockTime)

    if (withdrawInProgress.size == 0) {
        console.log("Withdraw completed! ", myInvestmentIds)
        return;
    }

    if ([...withdrawInProgress.values()].reduce(inProgressReducer) == true) {
        console.log("Transaction in progress, wait for a while...")
        return;
    }

    if (countdown - avgBlockTime <= 0) {
        myInvestmentIds.forEach(investId => {
            if (withdrawInProgress.has(investId) && withdrawInProgress.get(investId) == false) {
                withdrawInProgress.set(investId, true)
                withdrawPool(investId).then(result => {
                    withdrawInProgress.delete(investId)
                    console.log(result)
                }).catch(error => {
                    withdrawInProgress.set(investId, false)
                    console.error(error)
                })
            }
        });
    }
}

const inProgressReducer = (a, b) => a && b;

const init = async () => {
    web3.eth.subscribe('newBlockHeaders')
    .on("connected", function(subscriptionId){
        console.log("connected:", subscriptionId);
    })
    .on("data", function(blockHeader){
        console.log(blockHeader)
        let blockTime = blockHeader['timestamp']
        let avgBlockTime = calculateAvgBlockTime()
        addBlockTime(blockTime)

        doInvest(blockTime, avgBlockTime)
        doWithdraw(blockTime, avgBlockTime)
        return;
    })
    .on("error", console.error);
}

poolzContract.methods.GetPoolBaseData(poolId).call().then(function(poolBaseData) {
    stopTime = poolBaseData[2]
    tokenRate = poolBaseData[3]
})

poolzContract.methods.GetPoolMoreData(poolId).call().then(function(poolData) {
    startTime = poolData[3]
    leftToken = poolData[1]
    claimTime = poolData[0]
})
poolzContract.methods.MaxETHInvest().call().then(function(result) {
    maxEthInvest = result
})

poolzContract.methods.GetMyInvestmentIds().call({ from: accountAddress }).then(function(investIds) {
    console.log("My investment Ids:", investIds, "Last investmentId: ", process.env.POOLZ_LAST_INVESTMENT_ID)
    investIds.forEach(id => {
        if (id > process.env.POOLZ_LAST_INVESTMENT_ID) {
            myInvestmentIds.push(id)
            withdrawInProgress.set(id, false)
        }
    });
    console.log("Waiting to claim Ids:", myInvestmentIds)
})

init();
