use cardano/address.{Script}
use cardano/transaction.{Transaction, OutputReference, find_input, Input, find_script_outputs, InlineDatum}
use dao/types.{GOVParams, Proposal, GOVDatum, ProposalAction, Votes}
use dao/utils.{trace_if_false, has_unit_value, interval_duration, interval_finite_lower_bound}
use aiken/option.{is_none}


pub fn handle_create_proposal(params: GOVParams, datum: GOVDatum, action: ProposalAction, oref: OutputReference, tx: Transaction) -> Bool {

  let Transaction{validity_range, ..} = tx
  let tx_validity_duration = interval_duration(validity_range)

  expect Some(own_input) = find_input(tx.inputs, oref)
  let GOVDatum { basket_state, gov_state, ongoing_proposal} = datum

  expect Script(own_hash) = own_input.output.address.payment_credential

  expect [own_output] = find_script_outputs(tx.outputs, own_hash)

  let tx_validity_lower_bound = interval_finite_lower_bound(validity_range)

  let proposal = Proposal {
      start_time: tx_validity_lower_bound
      , action
      , votes: Votes {yes: 0, no:0},
      shards_created: 0
  }

  let output_datum = GOVDatum {
    basket_state,
    gov_state,
    ongoing_proposal: Some(proposal)
  }


  and {
    trace_if_false(@"input UTxO must have dao_nft", has_unit_value(own_input.output.value, params.dao_nft)),
    trace_if_false(@"There must be no ongoing proposal", is_none(ongoing_proposal)),
    trace_if_false(@"output UTxO must have dao_nft", has_unit_value(own_output.value, params.dao_nft)),
    trace_if_false(@"Output datum doesn't match", own_output.datum == InlineDatum(output_datum)),
    trace_if_false(@"Tx validity_range is not correct", tx_validity_duration <= params.max_tx_validity_duration),
  }

}
