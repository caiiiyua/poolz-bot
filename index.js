require('dotenv').config();
const Web3 = require('web3');
const abi = require('./poolzabi.js')
const HDWalletProvider = require("@truffle/hdwallet-provider");

const accountAddress = process.env.WALLET_ADDRESS;

const contractAddress = process.env.POOLZ_CONTRACT_ADDRESS;
const poolId = process.env.POOLZ_POOL_ID;

const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.INFURA_WSS));
const web3Wallet = new Web3(new HDWalletProvider([process.env.PRIVATE_KEY], process.env.INFURA_HTTPS) );

const defaultInvestGasPrice = web3.utils.toWei(process.env.POOLZ_INVEST_GAS_PRICE, 'gwei');
const defaultClaimGasPrice = web3.utils.toWei(process.env.POOLZ_CLAIM_GAS_PRICE, 'gwei');

const poolzContract = new web3Wallet.eth.Contract(abi, contractAddress);

function investPool(id, maxInvest) {
    return poolzContract.methods.InvestETH(id).send({ value: maxInvest, from: accountAddress, gasPrice: defaultInvestGasPrice, gas: process.env.POOLZ_GAS_LIMIT })
}

function withdrawPool(investId) {
    return poolzContract.methods.WithdrawInvestment(investId).send({ from: accountAddress, gasPrice: defaultClaimGasPrice, gas: process.env.POOLZ_GAS_LIMIT })
}

var maxEthInvest = 0
var leftToken = 0
var startTime = 0
var stopTime = 0
var claimTime = 0
var tokenRate = 0
var lastBlockTime = []
var avgBlockTime = 0
var invested = 0
var transactionInProgress = false
var failed = 0

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

const init = async () => {
    web3.eth.subscribe('newBlockHeaders', function(error, result){
        if (!error) {
            let blockTime = result['timestamp']
            addBlockTime(blockTime)
            let countdown = startTime - blockTime
            let countdown2 = startTime - Date.now()/1000
            console.log("startTime:", startTime, "leftToken: ", leftToken, "maxEthInvest: ", maxEthInvest, "timestamp: ", blockTime);
            avgBlockTime = calculateAvgBlockTime()
            console.log("countdown:", countdown, "countdown2", countdown2, "average Blocktime:", avgBlockTime)
            if (blockTime >= stopTime) {
                console.log("Pool has been closed...")
                return;
            }
            if (invested > 0 || failed == process.env.MAX_RETRY) {
                console.log("Invested: ", invested)
                process.exit(-1)
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
            return;
        }
    
        console.error(error);
    })
    .on("connected", function(subscriptionId){
        console.log("connected:", subscriptionId);
    })
    .on("data", function(error, blockHeader){
        if (!error) {
            console.log("data:", blockHeader);
        }
        console.error(error)
    })
    .on("error", console.error);
}

init();
