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
