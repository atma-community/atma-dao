
use dao/types.{GOVParams, GOVDatum, Proposal}

use dao/utils.{trace_if_false, interval_finite_upper_bound}
use cardano/transaction.{InlineDatum, OutputReference, Transaction, find_input, find_script_outputs}
use cardano/address.{Script}
use aiken/collection/list

pub fn handle_create_shards(params: GOVParams, datum: GOVDatum, oref: OutputReference, tx: Transaction) -> Bool {


  expect Some(own_input) = find_input(tx.inputs, oref)
  expect Script(own_hash) = own_input.output.address.payment_credential
  expect [own_output] = find_script_outputs(tx.outputs, own_hash)
  
  

  let GOVDatum { basket_state, gov_state, ongoing_proposal: opP } = datum

  expect Some(proposal) = opP
  let end_shards_create_time = proposal.start_time  + gov_state.effective_delay


  let Transaction{validity_range, ..} = tx
  let tx_validity_range_ub = interval_finite_upper_bound(validity_range)
  
  let shardsUTxOs = find_script_outputs(tx.outputs, params.shards_manager_script_hash)

  let updated_proposal = Proposal {
    start_time: proposal.start_time,
    action: proposal.action,
    shards_created: proposal.shards_created + list.length(shardsUTxOs),
    votes: proposal.votes
  }
  let expected_datum = GOVDatum { 
                        basket_state
                      , gov_state
                      , ongoing_proposal: Some( updated_proposal ) 
                      }

  and {
    trace_if_false(@"Too late to create shards", tx_validity_range_ub <= end_shards_create_time),
    trace_if_false(@"Doesn't have expected datum", InlineDatum(expected_datum) == own_output.datum)
  }
}
