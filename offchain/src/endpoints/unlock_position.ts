
import { conStr0, deserializeDatum, slotToBeginUnixTime, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { BUFFER_SLOT, MIN_ADA } from "../utils";

import { DAOContext } from "../daoContext";
import { OfflineEvaluator } from "@meshsdk/core-csl";

export async function unlock_position(txHash: string, txIndex: number, ctx: DAOContext) {

  const { utxos, walletAddress, collateral } = await ctx.getWalletInfoForTx();
  const { input: collateralInput, output: collateralOutput } = collateral;

  const [voting_position_utxo] = await ctx.provider.fetchUTxOs(txHash, 1);

  const voting_position_datum = deserializeDatum(voting_position_utxo.output.plutusData!);
  console.log(voting_position_datum);

  // VotePositionDatum: ConStr0([owner, unlock_time])
  const unlock_time = voting_position_datum.fields[1].int;

  // VotePositionRedeemer: UnlockPosition = ConStr0([])
  const unsignedTx = await ctx.txBuilder
			      .spendingPlutusScript("V3")
			      .txIn(voting_position_utxo.input.txHash
				   , voting_position_utxo.input.outputIndex
				   , voting_position_utxo.output.amount
				   , ctx.daoParams.voting_position_address
				   )
			      .txInRedeemerValue(conStr0([]), "JSON")
			      .txInInlineDatumPresent()
			      .txInScript(ctx.daoParams.voting_position_validator)
			      .changeAddress(walletAddress)
			      .selectUtxosFrom(utxos)
			      .txInCollateral(collateralInput.txHash,
					      collateralInput.outputIndex,
					      collateralOutput.amount,
					      collateralOutput.address,
					      )
			      .invalidBefore(unixTimeToEnclosingSlot(Number(unlock_time), ctx.daoParams.slot_config))
			      .requiredSignerHash(voting_position_datum.fields[0].bytes)
			      .setNetwork("preview")
			      .complete();

  // const signedTx = await ctx.wallet.signTx(unsignedTx);
  // const txhash = await ctx.wallet.submitTx(signedTx);
  // console.log(txhash);

  const evaluator = new OfflineEvaluator(ctx.provider, "preview");
  const evaluateTx = await evaluator.evaluateTx(unsignedTx,[],[]);
  console.log(evaluateTx);
}
