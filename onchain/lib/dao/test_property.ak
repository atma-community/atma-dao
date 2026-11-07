//// Property-based tests for the DAO validators.
////
//// These complement the example-based unit tests (attack vectors) by
//// exercising the core validator invariants against a wide range of randomly
//// generated inputs via `aiken-lang/fuzz`. Each `test ... via <fuzzer>`
//// declaration is run many times with shrinking on failure, systematically
//// exploring edge cases (0 votes, huge tallies, ties, many shards, ...).

use aiken/fuzz
use cardano/transaction.{Transaction, Input, placeholder}
use dao/types.{
  GOVDatum, Proposal, Votes, ShardsDatum, VoteYes, VoteNo, BasketState,
  ChangeBasketFeePercent,
}
use dao/vote.{handle_vote}
use dao/merge_shards.{handle_merge_shards}
use dao/end_proposal.{handle_end_proposal}
use dao/utils.{interval_duration, interval_finite_lower_bound,
  interval_finite_upper_bound}
use dao/test_helpers.{
  mock_params, mock_oref, mock_basket_state, mock_gov_state,
  dao_nft_value, gov_script_input, gov_script_output,
  shard_script_input, shard_script_output_with_votes,
  vote_position_output, mock_validity_range,
}

// Timing constants derived from the mocks:
//   params.voting_period       = 100_000
//   gov_state.voting_period    = 100_000
//   gov_state.effective_delay  = 50_000
//   proposal.start_time        = 1000
// => vote before  start_time + params.voting_period = 101_000
// => unlock_time = start_time + effective_delay + gov_state.voting_period = 151_000
// => merge/end   after start_time + params.voting_period = 101_000
const start_time = 1000

const unlock_time = 151_000

const merge_lb = 101_001

// --- Fuzzers ---

/// A non-negative vote/token count, kept well within Int range so that
/// arithmetic never overflows any downstream reasoning.
fn count() -> Fuzzer<Int> {
  fuzz.int_between(0, 1_000_000_000)
}

/// A strictly positive count (e.g. voting tokens must be > 0).
fn positive_count() -> Fuzzer<Int> {
  fuzz.int_between(1, 1_000_000_000)
}

fn votes_fuzzer() -> Fuzzer<Votes> {
  fuzz.map2(count(), count(), fn(yes, no) { Votes { yes, no } })
}

/// A shard's existing tally paired with a positive number of tokens being cast.
fn votes_and_tokens() -> Fuzzer<(Votes, Int)> {
  fuzz.both(votes_fuzzer(), positive_count())
}

/// Two independent non-negative ints (used to build arbitrary intervals).
fn two_counts() -> Fuzzer<(Int, Int)> {
  fuzz.both(fuzz.int_between(0, 1_000_000), fuzz.int_between(0, 1_000_000))
}

// --- Shared builders ---

fn gov_datum(proposal: Proposal) -> GOVDatum {
  GOVDatum {
    basket_state: mock_basket_state(),
    gov_state: mock_gov_state(),
    ongoing_proposal: Some(proposal),
  }
}

fn active_proposal(shards: Int) -> Proposal {
  Proposal {
    start_time,
    action: ChangeBasketFeePercent { new_fee_percent: 10 },
    votes: Votes { yes: 0, no: 0 },
    shards_created: shards,
  }
}

// --- vote: tally accumulation ------------------------------------------------

// Casting a YES vote of `tokens` tokens onto a shard that already holds
// `existing` votes must always leave the shard datum as
// {yes: existing.yes + tokens, no: existing.no}. For every valid combination
// the validator must accept exactly that output and nothing else.
test prop_vote_yes_accumulates(input via votes_and_tokens()) {
  let (existing, tokens) = input
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: existing }
  let new_votes =
    ShardsDatum { votes: Votes { yes: existing.yes + tokens, no: existing.no } }

  let tx = build_vote_tx(shard_datum, new_votes, tokens)
  handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

test prop_vote_no_accumulates(input via votes_and_tokens()) {
  let (existing, tokens) = input
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: existing }
  let new_votes =
    ShardsDatum { votes: Votes { yes: existing.yes, no: existing.no + tokens } }

  let tx = build_vote_tx(shard_datum, new_votes, tokens)
  handle_vote(VoteNo, params, shard_datum, mock_oref(0), tx)
}

// Any output datum that does NOT reflect the exact tally must be rejected.
// Here the attacker inflates the recorded YES votes by one extra token.
test prop_vote_rejects_inflated_tally(input via votes_and_tokens()) {
  let (existing, tokens) = input
  let params = mock_params()
  let shard_datum = ShardsDatum { votes: existing }
  let inflated =
    ShardsDatum {
      votes: Votes { yes: existing.yes + tokens + 1, no: existing.no },
    }

  let tx = build_vote_tx(shard_datum, inflated, tokens)
  !handle_vote(VoteYes, params, shard_datum, mock_oref(0), tx)
}

fn build_vote_tx(
  shard_datum: ShardsDatum,
  new_votes: ShardsDatum,
  tokens: Int,
) -> Transaction {
  let gov_ref =
    gov_script_input(mock_oref(99), dao_nft_value(), gov_datum(active_proposal(3)))

  Transaction {
    ..placeholder,
    inputs: [shard_script_input(mock_oref(0), shard_datum)],
    reference_inputs: [gov_ref],
    outputs: [
      shard_script_output_with_votes(new_votes),
      vote_position_output(tokens, unlock_time),
    ],
    validity_range: mock_validity_range(2000, 3000),
  }
}

// --- merge_shards: votes are conserved ---------------------------------------

// Merging N shards must produce a proposal whose tally equals the element-wise
// sum of every shard's votes, regardless of how many shards or how the votes
// are distributed among them.
test prop_merge_sums_all_shards(
  shards via fuzz.list_between(votes_fuzzer(), 1, 12),
) {
  let params = mock_params()
  let count = list_length(shards)
  let proposal = active_proposal(count)
  let datum = gov_datum(proposal)
  let oref = mock_oref(0)

  let total =
    fold_votes(shards, Votes { yes: 0, no: 0 })

  let expected_datum =
    gov_datum(Proposal { ..proposal, votes: total })

  let shard_inputs = shard_inputs_from(shards, 1)

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum), ..shard_inputs],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(merge_lb, merge_lb + 4),
    }

  handle_merge_shards(params, datum, oref, tx)
}

fn fold_votes(vs: List<Votes>, acc: Votes) -> Votes {
  when vs is {
    [] -> acc
    [v, ..rest] ->
      fold_votes(rest, Votes { yes: acc.yes + v.yes, no: acc.no + v.no })
  }
}

fn shard_inputs_from(vs: List<Votes>, idx: Int) -> List<Input> {
  when vs is {
    [] -> []
    [v, ..rest] ->
      [
        shard_script_input(mock_oref(idx), ShardsDatum { votes: v }),
        ..shard_inputs_from(rest, idx + 1)
      ]
  }
}

fn list_length(vs: List<Votes>) -> Int {
  when vs is {
    [] -> 0
    [_, ..rest] -> 1 + list_length(rest)
  }
}

// --- end_proposal: passes iff yes > no ---------------------------------------

// A proposal is enacted (fee changes to 10) exactly when yes > no; otherwise
// the basket state is left untouched. This must hold for every possible tally,
// including ties (which must NOT pass).
test prop_end_proposal_passes_iff_yes_gt_no(tally via votes_fuzzer()) {
  let params = mock_params()
  let proposal =
    Proposal { ..active_proposal(3), votes: tally }
  let datum = gov_datum(proposal)
  let oref = mock_oref(0)

  let passed = tally.yes > tally.no

  let expected_fee =
    if passed {
      10
    } else {
      mock_basket_state().basket_fee_percent
    }

  let expected_datum =
    GOVDatum {
      basket_state: BasketState {
        basket_pool_composition: mock_basket_state().basket_pool_composition,
        basket_fee_percent: expected_fee,
      },
      gov_state: mock_gov_state(),
      ongoing_proposal: None,
    }

  let tx =
    Transaction {
      ..placeholder,
      inputs: [gov_script_input(oref, dao_nft_value(), datum)],
      outputs: [gov_script_output(dao_nft_value(), expected_datum)],
      validity_range: mock_validity_range(merge_lb, merge_lb + 4),
    }

  handle_end_proposal(params, datum, oref, tx)
}

// --- utils: interval helpers -------------------------------------------------

// For any finite interval [lo, hi] with lo <= hi, the helpers must round-trip
// the bounds and report a non-negative, exact duration.
test prop_interval_helpers_are_consistent(input via two_counts()) {
  let (a, b) = input
  let lo = if a <= b { a } else { b }
  let hi = if a <= b { b } else { a }
  let range = mock_validity_range(lo, hi)

  and {
    interval_finite_lower_bound(range) == lo,
    interval_finite_upper_bound(range) == hi,
    interval_duration(range) == hi - lo,
    interval_duration(range) >= 0,
  }
}
