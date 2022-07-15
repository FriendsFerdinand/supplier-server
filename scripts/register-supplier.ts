import { prompt } from 'inquirer';
import 'cross-fetch/polyfill';
import { stacksProvider, bridgeContract } from '../src/stacks';
import { bpsToPercent, btcToSats, satsToBtc, shiftInt, stxToUstx } from '../src/utils';
import {
  getBtcAddress,
  getPublicKey,
  getStxAddress,
  getStxNetwork,
  getStxPrivateKey,
  validateKeys,
} from '../src/config';
import {
  PostConditionMode,
  makeContractCall,
  broadcastTransaction,
} from 'micro-stacks/transactions';
import BigNumber from 'bignumber.js';
import { getBalances } from '../src/wallet';
import { AnchorMode } from 'micro-stacks/transactions';

interface Answers {
  inboundFee: number;
  inboundBaseFee: number;
  outboundFee: number;
  outboundBaseFee: number;
  xbtcFunds: number;
  name: string;
  stxFee: number;
}

async function run() {
  const provider = stacksProvider();
  const bridge = bridgeContract();

  try {
    validateKeys();
  } catch (error) {
    console.error('Unable to register supplier - environment not configured');
    console.error(error);
    return;
  }

  const stxAddress = getStxAddress();
  const btcAddress = getBtcAddress();
  const balances = await getBalances();

  const stxBalance = balances.stx.stx;
  const xbtcBalance = balances.stx.xbtc;
  const btcBalance = balances.btc.btc;

  console.log(`STX Address: ${stxAddress}`);
  console.log(`BTC Address: ${btcAddress}`);
  console.log(`STX Balance: ${stxBalance} STX`);
  console.log(`xBTC Balance: ${xbtcBalance} xBTC`);
  console.log(`BTC Balance: ${btcBalance} BTC`);

  const answers = await prompt<Answers>([
    { name: 'inboundFee', message: 'Inbound fee (basis points)', type: 'number', default: '10' },
    {
      name: 'inboundBaseFee',
      message: 'Inbound base fee (satoshis)',
      type: 'number',
      default: '500',
    },
    { name: 'outboundFee', message: 'Outbound fee (basis points)', type: 'number', default: '10' },
    {
      name: 'outboundBaseFee',
      message: 'Outbound base fee (satoshis)',
      type: 'number',
      default: '500',
    },
    {
      name: 'xbtcFunds',
      message: `How much xBTC do you want to supply (in xBTC)? Max: ${xbtcBalance}`,
      type: 'number',
    },
    {
      name: 'stxFee',
      message: `How many STX to spend on the network fee for this transaction (in STX)? Max: ${stxBalance} STX`,
      type: 'number',
    },
  ]);

  const inboundFee = BigInt(answers.inboundFee);
  const inboundBaseFee = BigInt(answers.inboundBaseFee);
  const outboundFee = BigInt(answers.outboundFee);
  const outboundBaseFee = BigInt(answers.outboundBaseFee);
  // const xbtcFunds = BigInt(answers.xbtcFunds);
  const xbtcFunds = new BigNumber(answers.xbtcFunds).decimalPlaces(8);
  const xbtcFundsSats = btcToSats(xbtcFunds.toString());

  const stxFee = answers.stxFee;
  const fee = stxToUstx(stxFee.toString()).toString();

  console.log(`Inbound fee: ${inboundFee} bips (${bpsToPercent(inboundFee)}%)`);
  console.log(`Inbound base fee: ${inboundBaseFee} sats (${satsToBtc(inboundBaseFee)} BTC)`);

  console.log(`Outbound fee: ${outboundFee} bips (${bpsToPercent(outboundFee)}%)`);
  console.log(`Outbound base fee: ${outboundBaseFee} sats (${satsToBtc(outboundBaseFee)} BTC)`);

  console.log(`xBTC funds: ${xbtcFunds.toFormat()} xBTC (${xbtcFundsSats} sats)`);

  console.log(`Transaction fee: ${stxFee} STX (${fee} uSTX)`);

  const { ok } = await prompt<{ ok: boolean }>([
    { name: 'ok', type: 'confirm', message: 'Please confirm the above information is correct' },
  ]);

  if (!ok) return;

  const btcPublicKey = getPublicKey();
  const registerTx = bridge.registerSupplier(
    Uint8Array.from(btcPublicKey),
    inboundFee,
    outboundFee,
    outboundBaseFee,
    inboundBaseFee,
    BigInt(xbtcFundsSats)
  );

  const tx = await makeContractCall({
    contractAddress: registerTx.contractAddress,
    contractName: registerTx.contractName,
    functionArgs: registerTx.functionArgs,
    functionName: registerTx.function.name,
    anchorMode: AnchorMode.Any,
    // or, set fee manually:
    // fee: 500
    fee,
    postConditionMode: PostConditionMode.Allow,
    senderKey: getStxPrivateKey(),
    network: getStxNetwork(),
  });

  // const receipt = await broadcastTransaction(tx, getStxNetwork());

  // console.log(receipt);

  // const { txId } = await provider.tx(registerTx, {
  //   postConditionMode: PostConditionMode.Allow,
  //   fee,
  // });
  // console.log('TXID:', txId);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
