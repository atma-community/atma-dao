use cardano/address.{Script}
use cardano/transaction.{Transaction, OutputReference, find_input, find_script_outputs, InlineDatum}
use dao/types.{GOVParams, GOVDatum, Proposal, Votes, ShardsDatum}
use dao/utils.{trace_if_false, has_unit_value, interval_finite_lower_bound}
use aiken/collection/list

pub fn handle_merge_shards(params: GOVParams, datum: GOVDatum, oref: OutputReference, tx: Transaction) -> Bool {
  let Transaction{validity_range, ..} = tx
  let tx_validity_range_lb = interval_finite_lower_bound(validity_range)

  expect Some(own_input) = find_input(tx.inputs, oref)
  expect Script(own_hash) = own_input.output.address.payment_credential
  expect [own_output] = find_script_outputs(tx.outputs, own_hash)

  let GOVDatum { basket_state, gov_state, ongoing_proposal } = datum
  expect Some(proposal) = ongoing_proposal

  // Get all shard inputs from the shards manager script
  let shard_inputs = list.filter(tx.inputs, fn(input) {
    input.output.address.payment_credential == Script(params.shards_manager_script_hash)
  })

  let shard_count = list.length(shard_inputs)

  // Sum votes from all shard inputs
  let merged_votes = list.foldl(shard_inputs, Votes { yes: 0, no: 0 }, fn(input, acc) {
    expect InlineDatum(datum_data) = input.output.datum
    expect ShardsDatum { votes } = datum_data
    Votes { yes: acc.yes + votes.yes, no: acc.no + votes.no }
  })

  let updated_proposal = Proposal {
    start_time: proposal.start_time,
    action: proposal.action,
    shards_created: proposal.shards_created,
    votes: merged_votes,
  }

  let expected_datum = GOVDatum {
    basket_state,
    gov_state,
    ongoing_proposal: Some(updated_proposal),
  }

  and {
    trace_if_false(@"input UTxO must have dao_nft", has_unit_value(own_input.output.value, params.dao_nft)),
    trace_if_false(@"output UTxO must have dao_nft", has_unit_value(own_output.value, params.dao_nft)),
    trace_if_false(@"Voting period is not over", proposal.start_time + params.voting_period <= tx_validity_range_lb),
    trace_if_false(@"Shard count doesn't match shards_created", shard_count == proposal.shards_created),
    trace_if_false(@"Output datum doesn't match", own_output.datum == InlineDatum(expected_datum)),
  }
}
