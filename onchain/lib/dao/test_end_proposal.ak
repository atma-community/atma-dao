use cardano/transaction.{Transaction, placeholder}
use dao/types.{
  GOVDatum, Proposal, Votes, BasketState, ChangeBasketFeePercent,
  ChangePoolComposition, ChangeGovState, GOVState,
}
use dao/end_proposal.{handle_end_proposal}
use dao/test_helpers.{
  mock_params, mock_oref, mock_basket_state, mock_gov_state,
  dao_nft_value, value_without_dao_nft, gov_script_input, gov_script_output,
  mock_validity_range,
}

// --- Helpers ---

fn proposal_passed_fee_change() -> Proposal {
  Proposal {
    start_time: 1000,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes: 500, no: 100 },
    shards_created: 3,
  }
}

fn proposal_failed() -> Proposal {
  Proposal {
    start_time: 1000,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes: 100, no: 500 },
    shards_created: 3,
  }
}

fn datum_with(proposal: Proposal) -> GOVDatum {
  GOVDatum {
    basket_state: mock_basket_state(),
    gov_state: mock_gov_state(),
    ongoing_proposal: Some(proposal),
  }
}

// voting_period=100_000, start_time=1000 => can end after 101_000
const end_lb = 101_001

const end_ub = 101_005

// --- Success cases ---

test end_proposal_passed_changes_basket_fee() {
  let params = mock_params()
  let proposal = proposal_passed_fee_change()
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let expected_datum =
    GOVDatum {
      basket_state: BasketState {
        basket_pool_composition: mock_basket_state().basket_pool_composition,
        basket_fee_percent: 10,
      },
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(end_lb, end_ub),
    }

  handle_end_proposal(params, datum, oref, tx)
}

test end_proposal_passed_changes_pool_composition() {
  let params = mock_params()
  let new_comp = [Pair(#"aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd", 100)]
  let proposal =
    Proposal {
      start_time: 1000,
      action: ChangePoolComposition { new_composition: new_comp },
      votes: Votes { yes: 500, no: 100 },
      shards_created: 3,
    }
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let expected_datum =
    GOVDatum {
      basket_state: BasketState {
        basket_pool_composition: new_comp,
        basket_fee_percent: mock_basket_state().basket_fee_percent,
      },
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(end_lb, end_ub),
    }

  handle_end_proposal(params, datum, oref, tx)
}

test end_proposal_passed_changes_gov_state() {
  let params = mock_params()
  let new_gov =
    GOVState {
      proposal_deposit: 200_000_000,
      max_shards_amt: 20,
      voting_period: 200_000,
      effective_delay: 100_000,
      expiration_period: 400_000,
      quorum_threshold: 2000,
    }
  let proposal =
    Proposal {
      start_time: 1000,
      action: ChangeGovState { new_gov_state: new_gov },
      votes: Votes { yes: 500, no: 100 },
      shards_created: 3,
    }
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: new_gov,
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(end_lb, end_ub),
    }

  handle_end_proposal(params, datum, oref, tx)
}

test end_proposal_failed_clears_proposal() {
  let params = mock_params()
  let datum = datum_with(proposal_failed())
  let oref = mock_oref(0)

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(end_lb, end_ub),
    }

  handle_end_proposal(params, datum, oref, tx)
}

// --- Failure cases ---

test end_proposal_fails_during_voting_period() fail {
  let params = mock_params()
  let datum = datum_with(proposal_passed_fee_change())
  let oref = mock_oref(0)

  let expected_datum =
    GOVDatum {
      basket_state: BasketState {
        basket_pool_composition: mock_basket_state().basket_pool_composition,
        basket_fee_percent: 10,
      },
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  // lb = 50_000 < 101_000 (start_time + voting_period), still in voting period
  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(50_000, 50_005),
    }

  handle_end_proposal(params, datum, oref, tx)
}

test end_proposal_fails_no_dao_nft_input() fail {
  let params = mock_params()
  let datum = datum_with(proposal_passed_fee_change())
  let oref = mock_oref(0)

  let expected_datum =
    GOVDatum {
      basket_state: BasketState {
        basket_pool_composition: mock_basket_state().basket_pool_composition,
        basket_fee_percent: 10,
      },
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, value_without_dao_nft(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(end_lb, end_ub),
    }

  handle_end_proposal(params, datum, oref, tx)
}

test end_proposal_fails_no_dao_nft_output() fail {
  let params = mock_params()
  let datum = datum_with(proposal_passed_fee_change())
  let oref = mock_oref(0)

  let expected_datum =
    GOVDatum {
      basket_state: BasketState {
        basket_pool_composition: mock_basket_state().basket_pool_composition,
        basket_fee_percent: 10,
      },
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(value_without_dao_nft(), expected_datum)],
      validity_range: mock_validity_range(end_lb, end_ub),
    }

  handle_end_proposal(params, datum, oref, tx)
}

test end_proposal_fails_wrong_output_datum() fail {
  let params = mock_params()
  let datum = datum_with(proposal_passed_fee_change())
  let oref = mock_oref(0)

  // Wrong: proposal not cleared, basket not updated
  let wrong_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), wrong_datum)],
      validity_range: mock_validity_range(end_lb, end_ub),
    }

  handle_end_proposal(params, datum, oref, tx)
}
