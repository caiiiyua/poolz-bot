require('dotenv').config();
const Web3 = require('web3');
const abi = require('./poolzabi.js');
const winston = require('winston');
const format = winston.format;

const logger = winston.createLogger({
    level: 'debug',
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.splat(),
        format.colorize(),
        format.simple()
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'poolzbot.log' })
    ]
  });

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
    let avg = sum / lastBlockTime.length
    return avg
}

function doInvest(blockNumber, blockTime, avgBlockTime) {
    let countdown = startTime - blockTime
    logger.debug("startTime: %s, leftToken: %s, maxEthInvest: %s, timestamp: %s, average Blocktime: %s, blockNumber: %s",
    startTime, leftToken, maxEthInvest, blockNumber, avgBlockTime, blockNumber);
    
    if (countdown - avgBlockTime <= 0) {
        if (blockTime >= stopTime) {
            logger.debug("Pool has been closed...")
            return;
        }
        if (transactionInProgress == true) {
            logger.debug("Transaction in progress, wait for a while...")
            return;
        }
        if (invested > 0 || failed == process.env.MAX_RETRY) {
            logger.debug("Invested: %s", invested)
            // process.exit(-1)
            if (myInvestmentIds.length == 0) {
                getInvestmentIds()
            }
            return;
        }
        for (let index = 0; index < process.env.MAX_INVESTMENT; index++) {
            transactionInProgress = true
            investPool(poolId, maxEthInvest).then(result => {
                invested += maxEthInvest
                transactionInProgress = false
                logger.debug(result)
            }).catch(error => {
                transactionInProgress = false
                failed = failed + 1
                console.error(error)
            })
        }
    } else {
        logger.debug("Pool is open to public in %s", countdown)
    }
}

function doWithdraw(blockNumber, blockTime, avgBlockTime) {
    let countdown = claimTime - blockTime
    logger.debug("claimTime: %s, countdown: %s, timestamp: %s, average Blocktime: %s, blockNumber: %s", claimTime, countdown, blockTime, avgBlockTime, blockNumber);

    if (countdown - avgBlockTime <= 0) {
        if (withdrawInProgress.size == 0) {
            logger.debug("Withdraw completed! %s", myInvestmentIds)
            return;
        }
        if ([...withdrawInProgress.values()].reduce(inProgressReducer) == true) {
            logger.debug("Transaction in progress, wait for a while...")
            return;
        }
        myInvestmentIds.forEach(investId => {
            if (withdrawInProgress.has(investId) && withdrawInProgress.get(investId) == false) {
                withdrawInProgress.set(investId, true)
                withdrawPool(investId).then(result => {
                    withdrawInProgress.delete(investId)
                    logger.debug(result)
                }).catch(error => {
                    withdrawInProgress.set(investId, false)
                    console.error(error)
                })
            }
        });
    } else {
        logger.debug("Token is unlock in %s", countdown)
    }
}

const inProgressReducer = (a, b) => a && b;

const init = async () => {
    web3.eth.subscribe('newBlockHeaders')
    .on("connected", function(subscriptionId){
        logger.debug("connected: %s", subscriptionId);
    })
    .on("data", function(blockHeader){
        logger.debug("%s", blockHeader)
        let blockTime = blockHeader['timestamp']
        let blockNumber = blockHeader['number']
        let avgBlockTime = calculateAvgBlockTime()
        addBlockTime(blockTime)

        doInvest(blockNumber, blockTime, avgBlockTime)
        doWithdraw(blockNumber, blockTime, avgBlockTime)
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

function getInvestmentIds() {
    poolzContract.methods.GetMyInvestmentIds().call({ from: accountAddress }).then(function(investIds) {
        logger.debug("My investment Ids: %s Last investmentId: %s", investIds, process.env.POOLZ_LAST_INVESTMENT_ID)
        investIds.forEach(id => {
            if (id > process.env.POOLZ_LAST_INVESTMENT_ID) {
                myInvestmentIds.push(id)
                withdrawInProgress.set(id, false)
            }
        });
        logger.debug("Waiting to claim Ids: %s", myInvestmentIds)
    })
}

init();
