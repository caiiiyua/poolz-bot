# Poolz Bot
 
A sample application to buy tokens from `POOLZ` pool when it open to public and withdraw when the tokens are unlocked.
 
## software version
 
Ensure your `node` and `truffle` version is higher than these:
```sh
$ node -v
v15.10.0
$ truffle version
Truffle v5.3.0 (core: 5.3.0)
Solidity v0.5.16 (solc-js)
Node v15.10.0
Web3.js v1.2.9
```
   
## environment variables
 
```
WALLET_ADDRESS=<account address>
PRIVATE_KEY=<private key>
INFURA_WSS=<infura websocket endpoint>
INFURA_HTTPS=<infura https endpoint>

POOLZ_CONTRACT_ADDRESS=0x99896ba5fde6ced06569cf848982d2c7779d2694
POOLZ_POOL_ID=<pool id>
POOLZ_INVEST_GAS_PRICE=251
POOLZ_CLAIM_GAS_PRICE=125
POOLZ_GAS_LIMIT=450000

MAX_RETRY=6
MAX_INVESTMENT=<max transactions to invest with MaxETHInvest>
```
 
## setup steps
  
1. Rename `.env.template` to `.env` and fill out required information
2. Install node.js packages and compile a smart contract code
```sh
npm install
```
3. Run
```sh
npm start
```
 
## License
 
This library is licensed under the MIT License.
