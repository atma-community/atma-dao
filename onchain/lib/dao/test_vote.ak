use cardano/transaction.{Transaction, Input, Output, InlineDatum, placeholder}
use cardano/address
use cardano/assets
use dao/types.{
  GOVDatum, Proposal, Votes, ShardsDatum,
  VoteYes, VoteNo, ChangeBasketFeePercent,
}
use dao/vote.{handle_vote}
use dao/test_helpers.{
  mock_params, mock_oref, mock_basket_state, mock_gov_state,
  dao_nft_value, gov_script_input,
  shard_script_input, shard_script_output_with_votes,
  vote_position_output, mock_validity_range,
}

// voting_period=100_000 (params), start_time=1000
// => must vote before 101_000 (tx_ub <= 101_000)
// unlock_time = start_time + effective_delay + gov_state.voting_period = 1000 + 50_000 + 100_000 = 151_000

fn active_proposal() -> Proposal {
  Proposal {
    start_time: 1000,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes: 50, no: 30 },
    shards_created: 3,
  }
}

fn gov_datum_with_proposal() -> GOVDatum {
  GOVDatum {
    basket_state: mock_basket_state(),
    gov_state: mock_gov_state(),
    ongoing_proposal: Some(active_proposal()),
  }
}

fn build_vote_tx(
  shard_oref: Int,
  shard_datum: ShardsDatum,
  new_votes: ShardsDatum,
  voting_tokens: Int,
  unlock_time: Int,
  validity_ub: Int,
) -> Transaction {
  let gov_ref_input =
    gov_script_input(mock_oref(99), dao_nft_value(), gov_datum_with_proposal())

  Transaction {
    ..placeholder,
    inputs: [shard_script_input(mock_oref(shard_oref), shard_datum)],
    reference_inputs: [gov_ref_input],
    outputs: [
      shard_script_output_with_votes(new_votes),
      vote_position_output(voting_tokens, unlock_time),
    ],
    validity_range: mock_validity_range(2000, validity_ub),
  }
}

// --- Success cases ---

test vote_yes_success() {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 10, no: 5 } }

  // Voting 100 tokens yes => yes: 10+100=110, no: 5
  let new_votes = ShardsDatum { votes: Votes { yes: 110, no: 5 } }
  let tx = build_vote_tx(0, shard_datum, new_votes, 100, 151_000, 3000)

  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

test vote_no_success() {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 10, no: 5 } }

  // Voting 50 tokens no => yes: 10, no: 5+50=55
  let new_votes = ShardsDatum{ votes: Votes { yes: 10, no: 55 } }
  let tx = build_vote_tx(0, shard_datum, new_votes, 50, 151_000, 3000)

  handle_vote(VoteNo, params, shard_datum, mock_oref(0), tx)
}

test vote_yes_on_empty_shard() {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 0, no: 0 } }

  let new_votes = ShardsDatum { votes: Votes { yes: 200, no: 0 } }
  let tx = build_vote_tx(0, shard_datum, new_votes, 200, 151_000, 3000)

  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

// --- Failure cases ---

test vote_fails_after_voting_period() fail {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 10, no: 5 } }
  let new_votes = ShardsDatum { votes: Votes { yes: 110, no: 5 } }

  // validity_ub = 102_000 > 101_000 (start_time + params.voting_period)
  let tx = build_vote_tx(0, shard_datum, new_votes, 100, 151_000, 102_000)

  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

test vote_fails_no_voting_tokens() fail {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 10, no: 5 } }
  let new_votes = ShardsDatum { votes: Votes { yes: 10, no: 5 } }

  // 0 voting tokens
  let tx = build_vote_tx(0, shard_datum, new_votes, 0, 151_000, 3000)

  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

test vote_fails_wrong_unlock_time() fail {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 10, no: 5 } }
  let new_votes = ShardsDatum { votes: Votes { yes: 110, no: 5 } }

  // Wrong unlock_time: 100_000 instead of 151_000
  let tx = build_vote_tx(0, shard_datum, new_votes, 100, 100_000, 3000)

  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

test vote_fails_wrong_output_datum() fail {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 10, no: 5 } }

  // Wrong votes in output: didn't add user_votes
  let wrong_votes = ShardsDatum { votes: Votes { yes: 10, no: 5 } }
  let tx = build_vote_tx(0, shard_datum, wrong_votes, 100, 151_000, 3000)

  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

test vote_fails_no_dao_nft_on_reference() fail {
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: Votes { yes: 10, no: 5 } }
  let new_votes = ShardsDatum { votes: Votes { yes: 110, no: 5 } }

  // Reference input without dao_nft
  let bad_ref =
    Input {
      output_reference: mock_oref(99),
      output: Output {
        address: address.from_script(
          #"00000000000000000000000000000000000000000000000000000001",
        ),
        value: assets.from_lovelace(2_000_000),
        datum: InlineDatum(gov_datum_with_proposal()),
        reference_script: None,
      },
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [shard_script_input(mock_oref(0), shard_datum)],
      reference_inputs: [bad_ref],
      outputs: [
        shard_script_output_with_votes(new_votes),
        vote_position_output(100, 151_000),
      ],
      validity_range: mock_validity_range(2000, 3000),
    }

  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}
