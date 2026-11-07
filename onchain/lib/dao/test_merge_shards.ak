use cardano/transaction.{Transaction, placeholder}
use dao/types.{GOVDatum, Proposal, Votes, ShardsDatum, ChangeBasketFeePercent}
use dao/merge_shards.{handle_merge_shards}
use dao/test_helpers.{
  mock_params, mock_oref, mock_basket_state, mock_gov_state,
  dao_nft_value, value_without_dao_nft, gov_script_input, gov_script_output,
  shard_script_input, mock_validity_range,
}

// voting_period=100_000, start_time=1000 => merge after 101_000

fn proposal_with_shards(count: Int) -> Proposal {
  Proposal {
    start_time: 1000,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes: 0, no: 0 },
    shards_created: count,
  }
}

fn datum_with(proposal: Proposal) -> GOVDatum {
  GOVDatum {
    basket_state: mock_basket_state(),
    gov_state: mock_gov_state(),
    ongoing_proposal: Some(proposal),
  }
}

// --- Success cases ---

test merge_shards_success_single_shard() {
  let params = mock_params()
  let proposal = proposal_with_shards(1)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let shard = ShardsDatum { votes: Votes { yes: 100, no: 50 } }

  let expected_proposal =
    Proposal { ..proposal, votes: Votes { yes: 100, no: 50 } }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(expected_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, dao_nft_value(), datum),
        shard_script_input(mock_oref(1), shard),
      ],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(101_001, 101_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}

test merge_shards_success_multiple_shards() {
  let params = mock_params()
  let proposal = proposal_with_shards(3)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let shard1 = ShardsDatum { votes: Votes { yes: 100, no: 50 } }
  let shard2 = ShardsDatum { votes: Votes { yes: 200, no: 30 } }
  let shard3 = ShardsDatum { votes: Votes { yes: 50, no: 120 } }

  // Sum: yes=350, no=200
  let expected_proposal =
    Proposal { ..proposal, votes: Votes { yes: 350, no: 200 } }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(expected_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, dao_nft_value(), datum),
        shard_script_input(mock_oref(1), shard1),
        shard_script_input(mock_oref(2), shard2),
        shard_script_input(mock_oref(3), shard3),
      ],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(101_001, 101_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}

test merge_shards_success_all_zero_votes() {
  let params = mock_params()
  let proposal = proposal_with_shards(2)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let empty_shard = ShardsDatum { votes: Votes { yes: 0, no: 0 } }

  let expected_proposal =
    Proposal { ..proposal, votes: Votes { yes: 0, no: 0 } }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(expected_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, dao_nft_value(), datum),
        shard_script_input(mock_oref(1), empty_shard),
        shard_script_input(mock_oref(2), empty_shard),
      ],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(101_001, 101_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}

// --- Failure cases ---

test merge_shards_fails_during_voting_period() fail {
  let params = mock_params()
  let proposal = proposal_with_shards(1)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let shard = ShardsDatum { votes: Votes { yes: 100, no: 50 } }

  let expected_proposal =
    Proposal { ..proposal, votes: Votes { yes: 100, no: 50 } }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(expected_proposal),
    }

  // lb = 50_000 < 101_000, voting period not over
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, dao_nft_value(), datum),
        shard_script_input(mock_oref(1), shard),
      ],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(50_000, 50_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}

test merge_shards_fails_shard_count_mismatch() fail {
  let params = mock_params()
  // Expects 3 shards but only 1 provided
  let proposal = proposal_with_shards(3)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let shard = ShardsDatum { votes: Votes { yes: 100, no: 50 } }

  let expected_proposal =
    Proposal { ..proposal, votes: Votes { yes: 100, no: 50 } }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(expected_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, dao_nft_value(), datum),
        shard_script_input(mock_oref(1), shard),
      ],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(101_001, 101_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}

test merge_shards_fails_no_dao_nft_input() fail {
  let params = mock_params()
  let proposal = proposal_with_shards(1)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let shard = ShardsDatum { votes: Votes { yes: 100, no: 50 } }

  let expected_proposal =
    Proposal { ..proposal, votes: Votes { yes: 100, no: 50 } }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(expected_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, value_without_dao_nft(), datum),
        shard_script_input(mock_oref(1), shard),
      ],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(101_001, 101_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}

test merge_shards_fails_no_dao_nft_output() fail {
  let params = mock_params()
  let proposal = proposal_with_shards(1)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let shard = ShardsDatum { votes: Votes { yes: 100, no: 50 } }

  let expected_proposal =
    Proposal { ..proposal, votes: Votes { yes: 100, no: 50 } }

  let expected_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(expected_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, dao_nft_value(), datum),
        shard_script_input(mock_oref(1), shard),
      ],
      outputs: [gov_script_output(value_without_dao_nft(), expected_datum)],
      validity_range: mock_validity_range(101_001, 101_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}

test merge_shards_fails_wrong_vote_totals() fail {
  let params = mock_params()
  let proposal = proposal_with_shards(2)
  let datum = datum_with(proposal)
  let oref = mock_oref(0)

  let shard1 = ShardsDatum { votes: Votes { yes: 100, no: 50 } }
  let shard2 = ShardsDatum { votes: Votes { yes: 200, no: 30 } }

  // Wrong totals: should be yes=300, no=80
  let wrong_proposal =
    Proposal { ..proposal, votes: Votes { yes: 999, no: 999 } }

  let wrong_datum =
    GOVDatum {
      basket_state: mock_basket_state(),
      gov_state: mock_gov_state(),
      ongoing_proposal: Some(wrong_proposal),
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        gov_script_input(oref, dao_nft_value(), datum),
        shard_script_input(mock_oref(1), shard1),
        shard_script_input(mock_oref(2), shard2),
      ],
      outputs: [gov_script_output(dao_nft_value(), wrong_datum)],
      validity_range: mock_validity_range(101_001, 101_005),
    }

  handle_merge_shards(params, datum, oref, tx)
}
