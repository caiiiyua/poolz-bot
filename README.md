# Poolz Bot
 
A sample Nodejs application to buy tokens from `POOLZ` pool when it open to public and withdraw when the tokens are unlocked.
 
## software version
 
Ensure your `node` and `web3` version is higher than these:
```sh
$ node -v
v15.10.0
$ npm list
├── bignumber.js@9.0.1
├── dotenv@8.2.0
└── web3@1.3.5
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
