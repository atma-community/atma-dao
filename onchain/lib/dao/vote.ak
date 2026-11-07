use cardano/address.{Script}
use cardano/transaction.{Transaction, OutputReference, find_input, Input, find_script_outputs, InlineDatum}
use dao/types.{GOVDatum, Proposal, GOVParams, ShardsDatum, Votes, VoteAction, VoteYes, VoteNo, VotePositionDatum}
use dao/utils.{trace_if_false, has_unit_value, asset_class_value_of, interval_finite_upper_bound}

pub fn handle_vote(choice: VoteAction, params: GOVParams, datum: ShardsDatum, oref: OutputReference, tx: Transaction) -> Bool {

  let Transaction{validity_range, ..} = tx
  let tx_validity_ub = interval_finite_upper_bound(validity_range)

  expect [gov_input] = tx.reference_inputs

  let gov_output = gov_input.output

  expect InlineDatum(gov_datum_data) = gov_output.datum
  expect GOVDatum{gov_state, ongoing_proposal, ..} = gov_datum_data
  expect Some(proposal) = ongoing_proposal


  expect Some(own_input) = find_input(tx.inputs, oref)
  expect Script(own_hash) = own_input.output.address.payment_credential
  expect [own_output] = find_script_outputs(tx.outputs, own_hash)

  let ShardsDatum { votes: shard_votes } = datum




  expect [voting_position_output] = find_script_outputs(tx.outputs, params.vote_position_manager_script_hash)

  let user_votes = asset_class_value_of(voting_position_output.value, params.voting_token)
  expect InlineDatum(voting_position_datum) = voting_position_output.datum
  expect VotePositionDatum{unlock_time, ..} = voting_position_datum

  let new_datum = when choice is {
    VoteYes -> ShardsDatum { votes: Votes { yes: shard_votes.yes + user_votes, no: shard_votes.no } }
    VoteNo -> ShardsDatum { votes: Votes { yes: shard_votes.yes, no: shard_votes.no + user_votes } }
  }


  and {
    trace_if_false(@"reference UTxO must have dao_nft", has_unit_value(gov_output.value, params.dao_nft)),
    trace_if_false(@"must lock positive number of voting tokens", user_votes > 0),
    trace_if_false(@"doesn't have expeted datum", InlineDatum(new_datum) == own_output.datum),
    trace_if_false(@"Voting period is over", tx_validity_ub <= proposal.start_time + params.voting_period),
    trace_if_false(@"unlock_time is not correct", (proposal.start_time + gov_state.effective_delay + gov_state.voting_period) == unlock_time),
  }
}
