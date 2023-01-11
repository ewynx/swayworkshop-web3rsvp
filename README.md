# Building on Fuel with Sway - Web3RSVP

> The original workshop was given by [@camiinthisthang](https://twitter.com/camiinthisthang) and [this](https://github.com/camiinthisthang/learnsway-web3rsvp) is the original repo. This version you're looking at now is adapted to work with testnet beta-2 and contains some of the client upgrades that were added after the initial workshop. 

In this workshop, we'll build a fullstack dapp on Fuel. The workshop consists of 3 parts:
1. Create a contract in Sway
2. Deploy the contract to beta-2 testnet
3. Write a small client to connect to the contract on testnet

## RSVP dApp

This dapp is a bare-bones architectural reference for an event creation and management platform, similar to Eventbrite or Luma. Users can create a new event and RSVP to an existing event. This is the functionality we're going to build out in this workshop:

- Create a new event
- RSVP to an existing event
- Get the amount of RSVPs for event

<img width="1723" alt="Screen Shot 2022-11-14 at 5 30 07 PM" src="https://user-images.githubusercontent.com/15346823/201781695-e3530429-46ad-40ea-96d2-00d6e8f27ed5.png">


## Installation

1. Install `cargo` using [`rustup`](https://www.rust-lang.org/tools/install)

    Mac and Linux:

    ```bash
    $ curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```

2. Check for correct setup:

   ```bash
   $ cargo --version
   cargo 1.64.0
   ```

3. Install `forc` using [`fuelup`](https://fuellabs.github.io/fuelup/master/)

   Mac and Linux:

   ```bash
    $ curl --proto '=https' --tlsv1.2 -sSf https://fuellabs.github.io/fuelup/fuelup-init.sh | sh
   ```

   Install toolchain `beta-2` in order to deploy to testnet beta-2:
   ```
   $ bashfuelup toolchain install beta-2
   ```

4. Check for correct setup:

   ```bash
    $ fuelup show
   ```
   This should show `beta-2` as your active toolchain. 

### Editor

You are welcome to use your editor of choice. VSCode has a plugin for Sway. 

- [VSCode plugin](https://marketplace.visualstudio.com/items?itemName=FuelLabs.sway-vscode-plugin)
- [Vim highlighting](https://github.com/FuelLabs/sway.vim)

### Fuel & Sway Documentation

For an intro to Sway and Fuel check out the [Developer Quickstart](https://fuellabs.github.io/fuel-docs/master/developer-quickstart.html) in the Fuel book and the info in the [Sway book](https://fuellabs.github.io/sway/v0.31.3/book/). 

## 1. Create a contract in Sway

Let's get started! First we'll create a new Fuel project and then write our contract.

Create a new, empty folder. In this repo it's called `swayworkshop_web3rsvp` but you can give it your own name.

Go into the created folder and create a contract project, using `forc`: 

```sh
$ cd swayworkshop_web3rsvp
$ forc new rsvpContract
To compile, use `forc build`, and to run tests use `forc test`
```

Here is the project that `Forc` has initialized:

```console
$ tree swayworkshop_web3rsvp
rsvpContract
├── Forc.toml
└──  src
     └── main.sw
```

### Write the contract

First, we'll define the ABI. An ABI defines an interface, and there is no function body in the ABI. Our ABI will contain the following functions:
- `create_event` - create a new event with parameters
- `rsvp` - rsvp for an existing event
- `get_rsvp` - get amount of rsvps for event

Also, we'll define the struct `Event` which contains all necessary information about an event. 


> ABI stands for Application Binary Interface. ABI's inform the application the interface to interact with the VM, in other words, they provide info to the APP such as what methods a contract has, what params, types it expects, etc...

A contract must either define or import an ABI declaration and implement it. It is considered best practice to define your ABI in a separate library and import it into your contract because this allows callers of the contract to import and use the ABI in scripts to call your contract.

To define the ABI as a library, we'll create a new file in the `src` folder. Create a new file named `event_platform.sw`

Here is what your project structure should look like now:

```console
rsvpContract
├── Forc.toml
└──  src
     └── main.sw
     └── event_platform.sw
```

Add the following code to your ABI file, `event_platform.sw`:

```rust
library event_platform;

use std::{contract_id::ContractId, identity::Identity};

abi eventPlatform {
    #[storage(read, write)]
    fn create_event(max_capacity: u64, deposit: u64, event_name: str[10]) -> Event;

    #[storage(read, write)]
    fn rsvp(event_id: u64) -> Event;

    #[storage(read)]
    fn get_rsvp(event_id: u64) -> Event;
}

// The Event structure is defined here to be used from other contracts when calling the ABI. 
pub struct Event {
    unique_id: u64,
    max_capacity: u64,
    deposit: u64,
    owner: Identity,
    name: str[10],
    num_of_rsvps: u64,
}

```

Now, in the `main.sw` file, we'll implement these functions. This is where you will write out the function bodies. Here is what your `main.sw` file should look like:

```rust
contract;

dep event_platform;
use event_platform::*;

use std::{
    auth::{
        AuthError,
        msg_sender,
    },
    call_frames::msg_asset_id,
    constants::BASE_ASSET_ID,
    context::{
        msg_amount,
        this_balance,
    },
    contract_id::ContractId,
    identity::Identity,
    logging::log,
    result::Result,
    storage::StorageMap,
    token::transfer,
};

storage {
    events: StorageMap<u64, Event> = StorageMap {},
    event_id_counter: u64 = 0,
}

pub enum InvalidRSVPError {
    IncorrectAssetId: (),
    NotEnoughTokens: (),
    InvalidEventID: (),
}

impl eventPlatform for Contract {
    #[storage(read, write)]
    fn create_event(capacity: u64, price: u64, event_name: str[10]) -> Event {
        let campaign_id = storage.event_id_counter;
        let new_event = Event {
            unique_id: campaign_id,
            max_capacity: capacity,
            deposit: price,
            owner: msg_sender().unwrap(),
            name: event_name,
            num_of_rsvps: 0,
        };

        storage.events.insert(campaign_id, new_event);
        storage.event_id_counter += 1;
        let mut selectedEvent = storage.events.get(storage.event_id_counter - 1);
        return selectedEvent;
    }

    #[storage(read, write)]
    fn rsvp(event_id: u64) -> Event {
        let sender = msg_sender().unwrap();
        let asset_id = msg_asset_id();
        let amount = msg_amount();

     // get the event
        let mut selected_event = storage.events.get(event_id);

    // check to see if the eventId is greater than storage.event_id_counter, if
    // it is, revert
        require(selected_event.unique_id < storage.event_id_counter, InvalidRSVPError::InvalidEventID);
    // check to see if the asset_id and amounts are correct, etc, if they aren't revert
        require(asset_id == BASE_ASSET_ID, InvalidRSVPError::IncorrectAssetId);
        require(amount >= selected_event.deposit, InvalidRSVPError::NotEnoughTokens);
    //send the payout
        transfer(amount, asset_id, selected_event.owner);

    // edit the event
        selected_event.num_of_rsvps += 1;
        storage.events.insert(event_id, selected_event);

    // return the event
        return selected_event;
    }

    #[storage(read)]
    fn get_rsvp(event_id: u64) -> Event {
        let selected_event = storage.events.get(event_id);
        selected_event
    }
}
```

### Build the contract

From inside the `swayworkshop_web3rsvp/rsvpContract` directory, run the following command to build your contract:

```console
$ forc build
  Compiled library "core".
  Compiled library "std".
  Compiled contract "rsvpContract".
  Bytecode size is 6200 bytes.
```

## 2. Deploy the contract

Now we'll deploy the contract to testnet beta-2 using `forc`. The steps below follow the [Developer Quickstart](https://fuellabs.github.io/fuel-docs/master/developer-quickstart.html#deploy-the-contract). 

In order to deploy a contract, you need to have a wallet with funds to sign the transaction and for gas. So first, we'll create a wallet.

### Create test wallet

Follow [these steps to set up a wallet and create an account](https://github.com/FuelLabs/forc-wallet#forc-wallet).

After typing in a password, be sure to save the mnemonic phrase that is given.

With this, you'll get a fuel address that looks something like this: `fuel1efz7lf36w9da9jekqzyuzqsfrqrlzwtt3j3clvemm6eru8fe9nvqj5kar8`. Save this address as you'll need it to sign transactions when we deploy the contract.

#### Fund test wallet

With your account address in hand, head to the [testnet faucet](https://faucet-beta-1.fuel.network/) to get some coins sent to your wallet. (Note: the faucet is down sometimes, just keep trying!)

### Deploy To Testnet

> Note: make sure the test wallet is funded with test coins!

This part might be a little tricky, but hang in there! You will need 2 separate console windows, 1 for deployment and 1 to sign the transaction for deployment. We'll go step by step. 

Deploy the contract as follows:

```bash
$ forc deploy --url node-beta-2.fuel.network/graphql --gas-price 1
  Compiled library "core".
  Compiled library "std".
  Compiled contract "rsvpContract".
  Bytecode size is 6200 bytes.
Contract id: 0x0a98320d39c03337401a4e46263972a9af6ce69ec2f35a5420b1bd35784c74b1
Please provide the address of the wallet you are going to sign this transaction with:
```
> Note: this is for testnet beta-2

The terminal does 2 things:
- outputs contract id
  -> save it since we will use it later.
- asks for address of test wallet
  
In the terminal, paste the address of your test wallet (this is something like `fuel1efz7lf36w9da9jekqzyuzqsfrqrlzwtt3j3clvemm6eru8fe9nvqj5kar8` from the previous step).


Now, the terminal will output something like:
```bash
$ Transaction id to sign: 46f8b05087db6c071196d6f9124e5355d93caf6dca145ab0eec403f64ef4b74c
$ Please provide the signature:
```
Here's how to proceed (this is the tricky part):
1. Copy the transaction id 
2. Open up a separate terminal tab or window
3. Run the following command to create a signature:
```bash
$ forc wallet sign` + `[transaction id here, without brackets]` + `[the account number, without brackets]`
```
If you created a single account for the test wallet, the last number will be 0. the full command + output will look something like:
```bash
$ forc wallet sign 46f8b05087db6c071196d6f9124e5355d93caf6dca145ab0eec403f64ef4b74c 0
Please enter your password to decrypt initialized wallet's phrases: 
```
4. Enter the password of your test wallet 
5. The terminal will output a signature, like:
```bash
$ Signature: d0d286aef0839feed35fe1964824ef83aeb445d323bfb3997c7ec9041c0fc205f614c7330c54c96ba1987ebc6c43c3e686f00973de86554ed224632eb557df00
```
  Copy the signature (in above example this would be: `d0d286aef0839feed35fe1964824ef83aeb445d323bfb3997c7ec9041c0fc205f614c7330c54c96ba1987ebc6c43c3e686f00973de86554ed224632eb557df00`)

6. Go back to the first terminal tab and paste the signature, now wait for deployment. Full reference terminal output:
```bash
$ Transaction id to sign: 46f8b05087db6c071196d6f9124e5355d93caf6dca145ab0eec403f64ef4b74c
$ Please provide the signature:440019447b824de08609ca8ee8921cc91c2364534bc118c23cc74a2247ea694e9aacd6aa58cf257c4020bdaa2376e89f290f611c33a1fd0cbcb8b5764e97af35
$ Waiting 1s before retrying    
$ contract 0a98320d39c03337401a4e46263972a9af6ce69ec2f35a5420b1bd35784c74b1 deployed in block 0x977d032e67faaf33a9a71efad7d27fb736e9e611071c288706c7c1898e44d6c7
```

**Congratulations!** You've deployed your contract to beta-2 testnet.

On the the [Block explorer](https://fuellabs.github.io/block-explorer-v2/) you can verify the transaction for deployment. Grab the transaction id and prefix it with `0x`. 

> Note: searching for the contract id or block hash will not (yet) work

## 3. Create a Frontend to Interact with Contract

The final step is to create a simple client to interact with our contract on testnet. It's important to use the correct version match of the `fuels` dependencies; for testnet beta-2 the versions below will work. 

These are the steps we will take:

1. **Initialize a React project**
2. **Install the `fuels` SDK dependencies**
3. **Generate contract typings for Typescript** 
4. **Create a test wallet (again..)**
5. **Add the frontend code**
6. **Run the client 🎉**

To get started, you'll need to have Nodejs ([nodejs installation](https://nodejs.org/en/)) and npm installed. See [reactjs docs](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app) for more info. 

### 1. Initialize a React project

In the root folder, we'll create a separate folder for the client, called `frontend`. Here, we initialize a new react project with [`Create React App`](https://create-react-app.dev/). This can be done with the following command:

```console
$ cd ..
$ npx create-react-app frontend --template typescript
Success! Created frontend at /swayworkshop-web3rsvp/frontend
```
This gives the following structure:
```bash
$ swayworkshop-web3rsvp
  ├── rsvpContract
  └── frontend
```

### 2. Install the `fuels` SDK dependencies

In this step we need to install the following 3 dependencies for the project (commands follow below):

1. `fuels`: The umbrella package that includes all the main tools; `Wallet`, `Contracts`, `Providers` and more.
2. `fuelchain`: Fuelchain is the ABI TypeScript generator.
3. `typechain-target-fuels`: The Fuelchain Target is the specific interpreter for the [Fuel ABI Spec](https://fuellabs.github.io/fuel-specs/master/protocol/abi/index.html).


Move into the `frontend` folder, then install the dependencies:

```console
$ cd frontend
$ npm install fuels@0.24.2 --save
added 65 packages, and audited 1493 packages in 4s
$ npm install fuelchain@0.24.2 typechain-target-fuels@0.24.2 --save-dev
added 33 packages, and audited 1526 packages in 2s
```

### 3. Generate contract typings for Typescript

To make it easier to interact with our contract we use `fuelchain` to interpret the output ABI JSON from our contract. This JSON was created on the moment we executed the `forc build` to compile our Sway Contract into binary.

If you see the folder `swayworkshop-web3rsvp/rsvpContract/out` you will be able to see the ABI JSON there. If you want to learn more, read the [ABI Specs here](https://github.com/FuelLabs/fuel-specs/blob/master/specs/protocol/abi.md).

Inside `swayworkshop-web3rsvp/frontend` run;

```console
$ npx fuelchain --target=fuels --out-dir=./src/contracts ../rsvpContract/out/debug/*-abi.json
Successfully generated 4 typings!
```

Now you should be able to find a new folder `swayworkshop-web3rsvp/frontend/src/contracts`. This folder was auto-generated by our `fuelchain` command, and makes it easy for us to communicate with the contract by creating a Typescript interface for the contract.

> Note: when you make changes to the contract and deploy a new version of the contract to testnet, you'll have to regenerate the Typings as well.

### 4. Create a wallet (again..)

For interacting with the fuel network we have to submit signed transactions with enough funds to cover network fees. The Fuel TS SDK don't currently support Wallet integrations, requiring us to have a non-safe wallet inside the WebApp using a privateKey.

> **Note**
> This should be done only for development purpose. Never expose a web app with a private key inside. The Fuel Wallet is in active development, follow the progress [here](https://github.com/FuelLabs/fuels-wallet).
>
> **Note**
> The team is working to simplify the process of creating a wallet, and eliminate the need to create a wallet twice. Keep an eye out for these updates.

In the root of the frontend project create a file, createWallet.js

```js
const { Wallet } = require("fuels");

const wallet = Wallet.generate();

console.log("address", wallet.address.toString());
console.log("private key", wallet.privateKey);
```

In a terminal, run the following command:

```console
$ node createWallet.js
address fuel160ek8t7fzz89wzl595yz0rjrgj3xezjp6pujxzt2chn70jrdylus5apcuq
private key 0x719fb4da652f2bd4ad25ce04f4c2e491926605b40e5475a80551be68d57e0fcb
```

> **Note**
> You should use the generated address and private key.

Save the generated address and private key. You will need the private key later to set it as a string value for a variable `WALLET_SECRET` in your `App.tsx` file. More on that below.

#### Fund this test wallet as well 

Once again, take the address of your wallet and use it to get some coins from [the testnet faucet](https://faucet-beta-1.fuel.network/). Make sure your wallet is funded before moving on to the next step. 

Now you're ready to build and ship ⛽

### 5. Add the frontend code

Inside the `frontend` folder let's add code that interacts with our contract. Replace the following values in the code:
- `CONTRACT_ID` - The contract id you got when deploying the contract to testnet
- `WALLET_SECRET` - The private key you got from running createWallet.js


Read the comments to help you understand the App parts.

Change the file `swayworkshop-web3rsvp/frontend/src/App.tsx` to:

```js
import React, { useEffect, useState } from "react";
import { Wallet, Provider, WalletLocked, bn } from "fuels";
import "./App.css";
// The contract info we created with 
// $ npx fuelchain --target=fuels --out-dir=./src/contracts ../rsvpContract/out/debug/*-abi.json
import { RsvpContractAbi__factory } from "./contracts";
// The address of the contract deployed the Fuel testnet
const CONTRACT_ID = "0x0a98320d39c03337401a4e46263972a9af6ce69ec2f35a5420b1bd35784c74b1";
// The private key from createWallet.js
const WALLET_SECRET = "0x4a4f77caa6be0f262928d7ea3e65e719f39047ffd5b51b4940c1a93ee594f50e";
// Create a Wallet from secretkey
const wallet = Wallet.fromPrivateKey(
  WALLET_SECRET,
  "https://node-beta-2.fuel.network/graphql"
);
// Connects out Contract instance to the deployed contract
// address using the given wallet.
const contract = RsvpContractAbi__factory.connect(CONTRACT_ID, wallet);

export default function App(){
  const [loading, setLoading] = useState(false);
  //-----------------------------------------------//
  //state variables to capture the selection of an existing event to RSVP to
  const [eventName, setEventName] = useState('');
  const [maxCap, setMaxCap] = useState(0);
  const [eventCreation, setEventCreation] = useState(false);
  const [rsvpConfirmed, setRSVPConfirmed] = useState(false);
  const [numOfRSVPs, setNumOfRSVPs] = useState(0);
  const [eventId, setEventId] = useState('');
  //-------------------------------------------------//
  //state variables to capture the creation of an event
  const [newEventName, setNewEventName] = useState('');
  const [newEventMax, setNewEventMax] = useState(0);
  const [newEventDeposit, setNewEventDeposit] = useState(0);
  const [newEventID, setNewEventID] = useState('')
  const [newEventRSVP, setNewEventRSVP] = useState(0);

  useEffect(() => {
    console.log('Wallet address', wallet.address.toString());
    wallet.getBalances().then(balances => {
      const balancesFormatted = balances.map(balance => {
        return [balance.assetId, balance.amount.format()];
      });
      console.log('Wallet balances', balancesFormatted);
    });
  }, []);

  async function rsvpToEvent(){
    setLoading(true);
    try {
      console.log('RSVPing to event');
      // Retrieve the current RSVP data
      const { value: eventData } = await contract!.functions.get_rsvp(eventId).get();
      const requiredAmountToRSVP = eventData.deposit.toString();
      
      console.log("deposit required to rsvp", requiredAmountToRSVP.toString());
      setEventId(eventData.unique_id.toString());
      setMaxCap(eventData.max_capacity.toNumber());
      setEventName(eventData.name.toString());
      console.log("event name", eventData.name);
      console.log("event capacity", eventData.max_capacity.toString());
      console.log("eventID", eventData.unique_id.toString())
      
      // Create a transaction to RSVP to the event
      const { value: eventRSVP, transactionId } = await contract!.functions.rsvp(eventId).callParams({
        forward: [requiredAmountToRSVP]
        //variable outputs is when a transaction creates a new dynamic UTXO
        //for each transaction you do, you'll need another variable output
        //for now, you have to set it manually, but the TS team is working on an issue to set this automatically
      }).txParams({gasPrice: 1, variableOutputs: 1}).call();

      console.log(
        'Transaction created', transactionId,
        `https://fuellabs.github.io/block-explorer-v2/transaction/${transactionId}`
      );
      console.log("# of RSVPs", eventRSVP.num_of_rsvps.toString());
      setNumOfRSVPs(eventRSVP.num_of_rsvps.toNumber());
      setRSVPConfirmed(true);
      alert("rsvp successful");
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createEvent(e: any){
    e.preventDefault();
    setLoading(true);
    try {
      console.log("creating event");
      const requiredDeposit = bn.parseUnits(newEventDeposit.toString());
      console.log('requiredDeposit', requiredDeposit.toString());
      const { value } = await contract!.functions.create_event(newEventMax, requiredDeposit, newEventName).txParams({gasPrice: 1}).call();

      console.log("return of create event", value);
      console.log("deposit value", value.deposit.toString());
      console.log("event name", value.name);
      console.log("event capacity", value.max_capacity.toString());
      console.log("eventID", value.unique_id.toString())
      setNewEventID(value.unique_id.toString())
      setEventCreation(true);
      alert('Event created');
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false);
    }
  }
return (
  <div className="main">
    <div className="header">Building on Fuel with Sway - Web3RSVP</div>
      <div className="form">
        <h2>Create Your Event Today!</h2>
        <form id="createEventForm" onSubmit={createEvent}>
          <label className="label">Event Name</label>
          <input className="input" value = {newEventName} onChange={e => setNewEventName(e.target.value) }name="eventName" type="text" placeholder="Enter event name" />
          <label className="label">Max Cap</label>
          <input className="input" value = {newEventMax} onChange={e => setNewEventMax(+e.target.value)} name="maxCapacity" type="text" placeholder="Enter max capacity" />
          <label className="label">Deposit</label>
          <input className="input" value = {newEventDeposit} onChange={e => setNewEventDeposit(+e.target.value)} name="price" type="number" placeholder="Enter price" />
          <button className="button" disabled={loading}>
            {loading ? "creating..." : "create"}
          </button>
        </form>
      </div>
      <div className="form rsvp">
        <h2>RSVP to an Event</h2>
        <label className="label">Event Id</label>
        <input className="input" name="eventId" onChange={e => setEventId(e.target.value)} placeholder="pass in the eventID"/>
        <button className="button" onClick={rsvpToEvent}>RSVP</button>
      </div>
      <div className="results">
        <div className="card">
          {eventCreation &&
          <>
          <h1> New event created</h1>
          <h2> Event Name: {newEventName} </h2>
          <h2> Event ID: {newEventID}</h2>
          <h2>Max capacity: {newEventMax}</h2>
          <h2>Deposit: {newEventDeposit}</h2>
          <h2>Num of RSVPs: {newEventRSVP}</h2>
          </>
          }
        </div>
          {rsvpConfirmed && <>
          <div className="card">
            <h1>RSVP Confirmed to the following event: {eventName}</h1>
            <h2>Num of RSVPs: {numOfRSVPs}</h2>
          </div>
          </>}
      </div>
  </div>

);
}

```

### 6. Run the client 🎉

Now it's time to have fun and run the project on your browser;

Inside `swayworkshop-web3rsvp/frontend` run;

```console
$ npm start
Compiled successfully!

You can now view frontend in the browser.

  Local:            http://localhost:3001
  On Your Network:  http://192.168.4.48:3001

Note that the development build is not optimized.
To create a production build, use npm run build.
```

#### ✨⛽✨ Congrats you have completed your first DApp on Fuel ✨⛽✨

## Updating the contract

If you make changes to your contract, here are the steps you should take to get your frontend and contract back in sync:

- In your contract directory, run `forc build`
- In your contract directory, redeploy the contract by running this command and following the same steps as above to sign the transaction with your wallet: `forc deploy --url node-beta-2.fuel.network/graphql --gas-price 1`
- In your frontend directory, re-run this command: `npx fuelchain --target=fuels --out-dir=./src/contracts ../rsvpContract/out/debug/*-abi.json`
- In your frontend directory, update the contract ID in your `App.tsx` file

## Need Help?

Head over to the [Fuel discord](https://discord.com/invite/fuelnetwork) to get help.
