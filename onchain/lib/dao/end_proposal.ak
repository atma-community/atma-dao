use cardano/address.{Script}
use cardano/transaction.{Transaction, OutputReference, find_input, Input, find_script_outputs, InlineDatum}
use dao/types.{GOVDatum, Proposal, GOVParams, Votes, ChangePoolComposition, ChangeBasketFeePercent, ChangeGovState, BasketState}
use dao/utils.{trace_if_false, has_unit_value, interval_finite_lower_bound}

pub fn handle_end_proposal(params: GOVParams, datum: GOVDatum, oref: OutputReference, tx: Transaction) -> Bool {

  let Transaction{validity_range, ..} = tx
  let tx_validity_range_lb = interval_finite_lower_bound(validity_range)

  expect Some(own_input) = find_input(tx.inputs, oref)
  let GOVDatum{ basket_state, gov_state, ongoing_proposal } = datum

  expect Script(own_hash) = own_input.output.address.payment_credential

  expect [own_output] = find_script_outputs(tx.outputs, own_hash)
  expect Some(proposal) = ongoing_proposal

  let proposal_passed = proposal.votes.yes > proposal.votes.no

  let proposal_passed_datum = when proposal.action is {

    ChangePoolComposition { new_composition: comp } -> GOVDatum { basket_state: BasketState { basket_pool_composition: comp,  basket_fee_percent: basket_state.basket_fee_percent }
                                                                , gov_state , ongoing_proposal: None}

    ChangeBasketFeePercent { new_fee_percent: fee } -> GOVDatum { basket_state: BasketState { basket_pool_composition: basket_state.basket_pool_composition
                                                                                            ,  basket_fee_percent: fee }
                                                                , gov_state
                                                                , ongoing_proposal: None
                                                                }
    ChangeGovState { new_gov_state } -> GOVDatum { basket_state, gov_state: new_gov_state, ongoing_proposal: None }

  }

  let proposal_failed_datum = GOVDatum { basket_state, gov_state, ongoing_proposal: None }

  let has_expected_datum = if proposal_passed {
    own_output.datum == InlineDatum(proposal_passed_datum)
  } else {
    own_output.datum == InlineDatum(proposal_failed_datum)
  }

  and {
    trace_if_false(@"input UTxO must have dao_nft", has_unit_value(own_input.output.value, params.dao_nft)),
    trace_if_false(@"output UTxO must have dao_nft", has_unit_value(own_output.value, params.dao_nft)),
    trace_if_false(@"output doesn't have expected datum", has_expected_datum),
    trace_if_false(@"proposal is still in voting period", proposal.start_time + params.voting_period <= tx_validity_range_lb),
  }
  
}
