import { conStr0, deserializeDatum, Unit, conStr1, conStr3, slotToBeginUnixTime, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { BUFFER_SLOT, MIN_ADA } from "../utils";

import { DAOContext, BasketState, GOVState } from "../daoContext";

export async function end_proposal(ctx: DAOContext) {

  const { utxos, walletAddress, collateral } = await ctx.getWalletInfoForTx();
  const { input: collateralInput, output: collateralOutput } = collateral;
  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);

  const govDatum = deserializeDatum(daoUTxO.output.plutusData!);

  // GOVDatum: fields[0]=basket_state, fields[1]=gov_state, fields[2]=ongoing_proposal
  const proposalPlutus = govDatum.fields[2].fields[0];
  const votes = proposalPlutus.fields[3]; // votes is now at index 3 (after shards_created)
  const action = proposalPlutus.fields[1];

  const yesVotes = votes.fields[0].int;
  const noVotes = votes.fields[1].int;

  if (yesVotes > noVotes) {
    // Proposal passed — apply the action
    // BasketState = fields[0], GOVState = fields[1]
    if (action.constructor == 0n) {
      // ChangePoolComposition: update basket_state.pool_composition
      govDatum.fields[0].fields[0] = action.fields[0];
    } else if (action.constructor == 1n) {
      // ChangeBasketFeePercent: update basket_state.fee_percent
      govDatum.fields[0].fields[1] = action.fields[0];
    } else {
      // ChangeGovState: replace entire gov_state
      govDatum.fields[1] = action.fields[0];
    }
  }

  // Clear ongoing_proposal
  govDatum.fields[2] = conStr1([]);
  const govNFT: Unit = ctx.daoParams.dao_nft.toUnit();

  const nowTime = proposalPlutus.fields[0].int + ctx.daoParams.voting_period + 1n;

  // GOVRedeemer: EndProposal = ConStr3([])
  const unsignedTx = await ctx.txBuilder
			      .spendingPlutusScript("V3")
			      .txIn(daoUTxO.input.txHash
				   , daoUTxO.input.outputIndex
				   , daoUTxO.output.amount
				   , ctx.daoParams.governance_address
				   )
			      .txInRedeemerValue(conStr3([]), "JSON")
			      .txInInlineDatumPresent()
			      .txInScript(ctx.daoParams.governance_validator)
			      .txOut(ctx.daoParams.governance_address, [{unit: "lovelace", quantity: MIN_ADA.toString()}, {unit: govNFT, quantity: "1"}])
			      .txOutInlineDatumValue(govDatum, "JSON")
			      .changeAddress(walletAddress)
			      .selectUtxosFrom(utxos)
			      .txInCollateral(collateralInput.txHash,
					      collateralInput.outputIndex,
					      collateralOutput.amount,
					      collateralOutput.address,
					      )

			      .invalidBefore(unixTimeToEnclosingSlot(Number(nowTime), ctx.daoParams.slot_config))
			      .setNetwork("preview")
			      .complete();

  const signedTx = await ctx.wallet.signTx(unsignedTx);
  const txhash = await ctx.wallet.submitTx(signedTx);
  console.log(txhash);
}
