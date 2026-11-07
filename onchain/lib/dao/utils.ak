use cardano/assets.{Value}
use cardano/assets as value
use dao/types.{AssetClass}

use cardano/transaction.{ValidityRange, Transaction}

use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/crypto.{VerificationKeyHash}
use aiken/collection/list as list


pub fn trace_if_false(str: String, res: Bool) -> Bool {
  if !res {
    trace str
    False
  } else {
    res
  }
}

pub fn only_ada_value(val: Value) -> Value {
  value.from_lovelace(value.lovelace_of(val))
}

pub fn unit_value(ac: AssetClass) -> Value {
  value.from_asset(ac.policy_id, ac.asset_name, 1)
}

pub fn has_unit_value(val: Value, ac: AssetClass) -> Bool {
  value.quantity_of(val, ac.policy_id, ac.asset_name) == 1
}

pub fn asset_class_value_of(val: Value, ac: AssetClass) -> Int {
  value.quantity_of(val, ac.policy_id, ac.asset_name)
}

pub fn value_of_asset_class(val: Value, ac: AssetClass) -> Value {
  asset_class_value(ac, asset_class_value_of(val, ac))
}

pub fn asset_class_value(ac: AssetClass, amount: Int) -> Value {
  value.from_asset(ac.policy_id, ac.asset_name, amount)
}


pub fn interval_duration(interval: ValidityRange) -> Int {
  let Interval { lower_bound: lower_interval, upper_bound: upper_interval } =
    interval

  expect IntervalBound { bound_type: Finite(lower_bound), .. } = lower_interval
  expect IntervalBound { bound_type: Finite(upper_bound), .. } = upper_interval
  upper_bound - lower_bound
}


pub fn interval_finite_lower_bound(interval: ValidityRange) -> Int {
  let Interval { lower_bound, .. } = interval
  expect IntervalBound { bound_type: Finite(lb), .. } = lower_bound
  lb
}

pub fn interval_finite_upper_bound(interval: ValidityRange) -> Int {
  let Interval { upper_bound, .. } = interval
  expect IntervalBound { bound_type: Finite(ub), .. } = upper_bound
  ub
}


pub fn must_be_signed_by(transaction: Transaction, vk: VerificationKeyHash) {
  list.has(transaction.extra_signatories, vk)
}

