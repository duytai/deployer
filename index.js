const path = require('path')
const fs = require('fs')
const Web3 = require('web3')
const Q = require('q')
const rimraf = require('rimraf')
const shell = require('shelljs')

const web3 = new Web3('http://localhost:8545')
const abis = path.join(__dirname, './test/verified_contract_abis')
const addrmap = path.join(__dirname, './test/fuzzer/config/addrmap.csv')
const ctrList = path.join(__dirname, './test/fuzzer/config/contracts.list')
const addressSeed = path.join(__dirname, './test/fuzzer/config/addressSeed.json')
const reporter = path.join(__dirname, './test/fuzzer/reporter')
const bug = path.join(__dirname, './test/fuzzer/reporter/bug')

const updateConfig = async ({ address, name, abi }) => {
  const l = `${address},\t${name}\n`
  fs.appendFileSync(addrmap, l)
  fs.appendFileSync(ctrList, `${name}\n`)
  fs.writeFileSync(path.join(abis, `${name}.abi`), abi, 'utf8')
  const content = fs.readFileSync(addressSeed, 'utf8')
  const json = JSON.parse(content)
  json.seeds2.push(address)
  fs.writeFileSync(addressSeed, JSON.stringify(json, null, 2), 'utf8')
}

const clearConfig = async () => {
  fs.writeFileSync(addrmap, '')
  fs.writeFileSync(ctrList, '')
  const content = fs.readFileSync(addressSeed, 'utf8')
  const json = JSON.parse(content)
  json.seeds2 = []
  fs.writeFileSync(addressSeed, JSON.stringify(json, null, 2), 'utf8')
  rimraf.sync(abis)
  rimraf.sync(reporter)
  fs.mkdirSync(abis)
  fs.mkdirSync(reporter)
  fs.mkdirSync(bug)
}

const deploy = ({ abi, bin, account, con }) => Q.Promise((resolve, reject) => {
  new web3.eth.Contract(abi)
    .deploy({
      data: `0x${bin}`,
    })
    .send({
      from: account,
      gas: 500000000000,
      value: con && con.payable ? 1000000 : 0,
    })
    .on('error', reject)
    .on('receipt', resolve)
})

const setupContract = async() => {
  const accounts = await web3.eth.getAccounts()
  const account = accounts[0]
  const isUnlocked = await web3.eth.personal.unlockAccount(account, '123456', 200 * 60 * 60)
  if (isUnlocked) {
    const contractsDir = path.join(__dirname, './contracts')
    const fullNames = fs
      .readdirSync(contractsDir)
      .filter(f => f.endsWith('.sol.json'))
    for (let i = 0; i < fullNames.length; i++) {
      const fullName = fullNames[i]
      const name = fullName.split('.sol.json')[0]
      const content = fs.readFileSync(path.join(contractsDir, fullName), 'utf8')
      const { contracts } = JSON.parse(content)
      const key = Object.keys(contracts).find(k => k.includes(name))
      const contract = contracts[key]
      let abi = JSON.parse(contract.abi)
      let con = abi.find(({ type }) => type == 'constructor')
      if (con) {
        con.inputs = []
      } else {
        con = {
          inputs: [],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'constructor',
        }
        abi.push(con)
      }
      console.log(`>> deploying: ${name}`)
      deploy({ abi, bin: contract.bin, account, con }).then(({ contractAddress }) => {
        updateConfig({ address: contractAddress, name, abi: JSON.stringify(abi, null, 2) })
        console.log(`>> deployed: ${name} to ${contractAddress}`)
      })
      //const { contractAddress } = await deploy({ abi, bin: contract.bin, account, con })
    }
  }
}

const main = async () => {
  await clearConfig()
  await setupContract()
}

main().then(() => {
}).catch(console.log)
