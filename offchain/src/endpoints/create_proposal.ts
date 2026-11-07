
import {  conStr0,  deserializeDatum, slotToBeginUnixTime, Unit, unixTimeToEnclosingSlot } from "@meshsdk/core";
import {MIN_ADA,BUFFER_SLOT} from "../utils";

import { DAOContext, GOVDatum, Proposal, ProposalAction, Votes } from "../daoContext";
import { OfflineEvaluator } from "@meshsdk/core-csl";

export async function create_proposal(action: ProposalAction, ctx: DAOContext) {

  const { utxos, walletAddress, collateral } = await ctx.getWalletInfoForTx();
  const { input: collateralInput, output: collateralOutput } = collateral;
  const daoUTxO = await ctx.daoParams.daoUTxO(ctx.provider);

  const nowTime = await ctx.provider.fetchLatestBlock().then(x => slotToBeginUnixTime(Number(x.slot) - BUFFER_SLOT, ctx.daoParams.slot_config));
  const txValidEndSlot = unixTimeToEnclosingSlot(nowTime + Number(ctx.daoParams.tx_validity_time), ctx.daoParams.slot_config) - 1;

  const proposal = new Proposal(BigInt(nowTime), action, 0n, new Votes(0n, 0n));

  const govDatum = deserializeDatum(daoUTxO.output.plutusData!);
  // GOVDatum: fields[0]=basket_state, fields[1]=gov_state, fields[2]=ongoing_proposal
  govDatum.fields[2] = conStr0([proposal.toPlutus()]);

  const govNFT: Unit = ctx.daoParams.dao_nft.toUnit();

  // GOVRedeemer: CreateProposal { action } = ConStr0([action])
  const unsignedTx = await ctx.txBuilder
			      .spendingPlutusScript("V3")
			      .txIn(daoUTxO.input.txHash
				   , daoUTxO.input.outputIndex
				   , daoUTxO.output.amount
				   , ctx.daoParams.governance_address
				   )
			      .txInRedeemerValue(conStr0([action.toPlutus()]), "JSON")
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

			      .invalidBefore(unixTimeToEnclosingSlot(nowTime, ctx.daoParams.slot_config))
			      .invalidHereafter(txValidEndSlot)
			      .setNetwork("preview")
			      .complete();

  // // NOTE: For testing purpose only
  // const evaluator = new OfflineEvaluator(ctx.provider, "preview");
  // const evaluateTx = await evaluator.evaluateTx(unsignedTx,[],[]);
  // console.log(evaluateTx);

  const signedTx = await ctx.wallet.signTx(unsignedTx);
  const txhash = await ctx.wallet.submitTx(signedTx);
  console.log(txhash);
}
