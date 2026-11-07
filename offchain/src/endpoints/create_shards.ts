
import { conStr1, deserializeDatum, resolvePlutusScriptAddress, scriptHash, slotToBeginUnixTime, Unit, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { MIN_ADA, BUFFER_SLOT } from "../utils";

import { DAOContext, Proposal, ShardsDatum, Votes } from "../daoContext";
import { OfflineEvaluator } from "@meshsdk/core-csl";

export async function create_shards(shard_count: number, ctx: DAOContext) {

  const { utxos, walletAddress, collateral } = await ctx.getWalletInfoForTx();
  const { input: collateralInput, output: collateralOutput } = collateral;
  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);

  const govDatum = deserializeDatum(daoUTxO.output.plutusData!);
  console.log(govDatum);

  // Read current proposal and update shards_created
  const proposalPlutus = govDatum.fields[2].fields[0];
  const currentShardsCreated = proposalPlutus.fields[2].int;
  proposalPlutus.fields[2].int = currentShardsCreated + BigInt(shard_count);

  console.log(govDatum.fields[2].fields[0])

  const govNFT: Unit = ctx.daoParams.dao_nft.toUnit();

  const nowTime = await ctx.provider.fetchLatestBlock().then(x => slotToBeginUnixTime(Number(x.slot) - BUFFER_SLOT, ctx.daoParams.slot_config));
  const txValidEndSlot = unixTimeToEnclosingSlot(nowTime + Number(ctx.daoParams.tx_validity_time), ctx.daoParams.slot_config) - 1;

  // GOVRedeemer: CreateShards = ConStr1([])
  let txBuilder = ctx.txBuilder
    .spendingPlutusScript("V3")
    .txIn(daoUTxO.input.txHash, daoUTxO.input.outputIndex, daoUTxO.output.amount, ctx.daoParams.governance_address)
    .txInRedeemerValue(conStr1([]), "JSON")
    .txInInlineDatumPresent()
    .txInScript(ctx.daoParams.governance_validator)
    .txOut(ctx.daoParams.governance_address, [{unit: "lovelace", quantity: MIN_ADA.toString()}, {unit: govNFT, quantity: "1"}])
    .txOutInlineDatumValue(govDatum, "JSON");

  // Create shard outputs at shards_manager address
  // console.log(scriptHash(ctx.daoParams.shards_manager_validator));
  // console.log(resolvePlutusScriptAddress(ctx.daoParams.shards_manager_address))
  const emptyShardDatum = new ShardsDatum(new Votes(0n, 0n));
  for (let i = 0; i < shard_count; i++) {
    txBuilder = txBuilder
      .txOut(ctx.daoParams.shards_manager_address, [{unit: "lovelace", quantity: MIN_ADA.toString()}])
      .txOutInlineDatumValue(emptyShardDatum.toPlutus(), "JSON");
  }


  const unsignedTx = await txBuilder
    .changeAddress(walletAddress)
    .selectUtxosFrom(utxos)
    .txInCollateral(collateralInput.txHash, collateralInput.outputIndex, collateralOutput.amount, collateralOutput.address)
    .invalidBefore(unixTimeToEnclosingSlot(nowTime, ctx.daoParams.slot_config))
    .invalidHereafter(txValidEndSlot)
    .setNetwork("preview")
    .complete();

  const signedTx = await ctx.wallet.signTx(unsignedTx);
  const txhash = await ctx.wallet.submitTx(signedTx);
  console.log(txhash);

  // const evaluator = new OfflineEvaluator(ctx.provider, "preview");
  // const evaluateTx = await evaluator.evaluateTx(unsignedTx,[],[]);
  // console.log(evaluateTx);

}
