use chrono::{Duration, NaiveDate};
use std::collections::BTreeMap;

pub const DEFAULT_FSRS_WEIGHTS: [f64; 19] = [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824, 1.9813,
    0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

const DECAY: f64 = -0.5;
const FACTOR: f64 = 19.0 / 81.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FsrsRating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

#[derive(Debug, Clone, Copy)]
pub struct MemoryState {
    pub stability: f64,
    pub difficulty: f64,
}

#[derive(Debug, Clone)]
pub struct ScheduledReview {
    pub due_date: String,
    pub stability: f64,
    pub difficulty: f64,
    pub scheduled_days: i64,
    pub lapses: i64,
}

#[derive(Debug, Clone)]
pub struct TrainingReview {
    pub item_id: String,
    pub reviewed_date: NaiveDate,
    pub rating: FsrsRating,
}

#[derive(Debug, Clone)]
pub struct OptimizationResult {
    pub weights: [f64; 19],
    pub previous_loss: f64,
    pub optimized_loss: f64,
    pub review_count: i64,
    pub prediction_count: i64,
}

pub fn default_weights_json() -> String {
    serde_json::to_string(&DEFAULT_FSRS_WEIGHTS).unwrap_or_else(|_| "[]".to_string())
}

pub fn parse_weights(value: &str) -> [f64; 19] {
    let parsed = serde_json::from_str::<Vec<f64>>(value).unwrap_or_default();
    let mut weights = DEFAULT_FSRS_WEIGHTS;
    for (index, weight) in parsed.into_iter().take(19).enumerate() {
        if weight.is_finite() {
            weights[index] = weight;
        }
    }
    weights
}

pub fn weights_to_vec(weights: &[f64; 19]) -> Vec<f64> {
    weights.to_vec()
}

pub fn rating_from_str(value: &str) -> Option<FsrsRating> {
    match value.to_lowercase().as_str() {
        "again" => Some(FsrsRating::Again),
        "hard" => Some(FsrsRating::Hard),
        "good" => Some(FsrsRating::Good),
        "easy" => Some(FsrsRating::Easy),
        _ => None,
    }
}

fn rating_value(rating: FsrsRating) -> f64 {
    rating as i32 as f64
}

pub fn retrievability(elapsed_days: i64, stability: f64) -> f64 {
    let safe_stability = stability.max(0.1);
    (1.0 + FACTOR * elapsed_days.max(0) as f64 / safe_stability).powf(DECAY)
}

fn init_stability(weights: &[f64; 19], rating: FsrsRating) -> f64 {
    weights[(rating as usize) - 1].max(0.1)
}

fn init_difficulty(weights: &[f64; 19], rating: FsrsRating) -> f64 {
    (weights[4] - (weights[5] * (rating_value(rating) - 1.0)).exp() + 1.0).clamp(1.0, 10.0)
}

fn mean_reversion(weights: &[f64; 19], initial: f64, current: f64) -> f64 {
    weights[7].mul_add(initial, (1.0 - weights[7]) * current)
}

fn next_difficulty(weights: &[f64; 19], difficulty: f64, rating: FsrsRating) -> f64 {
    let next = weights[6].mul_add(-(rating_value(rating) - 3.0), difficulty);
    mean_reversion(weights, init_difficulty(weights, FsrsRating::Easy), next).clamp(1.0, 10.0)
}

fn short_term_stability(weights: &[f64; 19], stability: f64, rating: FsrsRating) -> f64 {
    (stability * (weights[17] * (rating_value(rating) - 3.0 + weights[18])).exp()).max(0.1)
}

fn next_recall_stability(
    weights: &[f64; 19],
    difficulty: f64,
    stability: f64,
    retention: f64,
    rating: FsrsRating,
) -> f64 {
    let modifier = match rating {
        FsrsRating::Hard => weights[15],
        FsrsRating::Easy => weights[16],
        _ => 1.0,
    };
    let increase = (weights[8]).exp()
        * (11.0 - difficulty)
        * stability.max(0.1).powf(-weights[9])
        * ((1.0 - retention).max(0.0) * weights[10]).exp_m1()
        * modifier;
    (stability * (increase + 1.0)).max(0.1)
}

fn next_forget_stability(
    weights: &[f64; 19],
    difficulty: f64,
    stability: f64,
    retention: f64,
) -> f64 {
    (weights[11]
        * difficulty.max(1.0).powf(-weights[12])
        * ((stability.max(0.1) + 1.0).powf(weights[13]) - 1.0)
        * ((1.0 - retention).max(0.0) * weights[14]).exp())
    .max(0.1)
}

fn next_interval(stability: f64, desired_retention: f64, maximum_interval: i64) -> i64 {
    let interval =
        stability / FACTOR * (desired_retention.clamp(0.7, 0.98).powf(1.0 / DECAY) - 1.0);
    interval.round().clamp(1.0, maximum_interval.max(1) as f64) as i64
}

pub fn schedule(
    weights: &[f64; 19],
    desired_retention: f64,
    maximum_interval: i64,
    previous_state: Option<MemoryState>,
    rating: FsrsRating,
    elapsed_days: i64,
    lapses: i64,
    reviewed_date: NaiveDate,
) -> ScheduledReview {
    let (stability, difficulty, next_lapses) = match previous_state {
        None => (
            init_stability(weights, rating),
            init_difficulty(weights, rating),
            if rating == FsrsRating::Again {
                lapses + 1
            } else {
                lapses
            },
        ),
        Some(state) => {
            let next_d = next_difficulty(weights, state.difficulty, rating);
            let next_s = if elapsed_days == 0 {
                short_term_stability(weights, state.stability, rating)
            } else if rating == FsrsRating::Again {
                next_forget_stability(
                    weights,
                    state.difficulty,
                    state.stability,
                    retrievability(elapsed_days, state.stability),
                )
            } else {
                next_recall_stability(
                    weights,
                    state.difficulty,
                    state.stability,
                    retrievability(elapsed_days, state.stability),
                    rating,
                )
            };
            (
                next_s,
                next_d,
                if rating == FsrsRating::Again {
                    lapses + 1
                } else {
                    lapses
                },
            )
        }
    };

    let scheduled_days = next_interval(stability, desired_retention, maximum_interval);
    ScheduledReview {
        due_date: (reviewed_date + Duration::days(scheduled_days))
            .format("%Y-%m-%d")
            .to_string(),
        stability,
        difficulty,
        scheduled_days,
        lapses: next_lapses,
    }
}

fn valid_initial_stability(weights: &[f64; 19]) -> bool {
    weights[0] <= weights[1] && weights[1] <= weights[2] && weights[2] <= weights[3]
}

fn clamp_weight(index: usize, value: f64) -> f64 {
    let (min, max) = match index {
        0..=3 => (0.1, 60.0),
        4 => (1.0, 10.0),
        5 => (0.01, 3.0),
        6 => (0.0, 3.0),
        7 => (0.0, 1.0),
        8 => (0.0, 4.0),
        9 => (0.01, 1.5),
        10 => (0.0, 4.0),
        11 => (0.01, 10.0),
        12 => (0.0, 2.0),
        13 => (0.0, 2.0),
        14 => (0.0, 5.0),
        15 => (0.01, 1.0),
        16 => (1.0, 5.0),
        17 => (0.0, 2.0),
        18 => (0.0, 2.0),
        _ => (0.0, 10.0),
    };
    value.clamp(min, max)
}

fn replay_loss(
    reviews: &[TrainingReview],
    weights: &[f64; 19],
    desired_retention: f64,
    maximum_interval: i64,
) -> Option<(f64, i64)> {
    if !valid_initial_stability(weights) {
        return None;
    }

    let mut grouped: BTreeMap<&str, Vec<&TrainingReview>> = BTreeMap::new();
    for review in reviews {
        grouped.entry(&review.item_id).or_default().push(review);
    }

    let mut loss = 0.0;
    let mut predictions = 0i64;
    for item_reviews in grouped.values_mut() {
        item_reviews.sort_by_key(|review| review.reviewed_date);
        let mut memory: Option<MemoryState> = None;
        let mut last_reviewed: Option<NaiveDate> = None;
        let mut lapses = 0i64;

        for review in item_reviews.iter() {
            let elapsed_days = last_reviewed
                .map(|date| (review.reviewed_date - date).num_days().max(0))
                .unwrap_or(0);
            if let Some(state) = memory {
                let predicted = retrievability(elapsed_days, state.stability).clamp(0.01, 0.99);
                let remembered = review.rating != FsrsRating::Again;
                loss += if remembered {
                    -predicted.ln()
                } else {
                    -(1.0 - predicted).ln()
                };
                predictions += 1;
            }

            let scheduled = schedule(
                weights,
                desired_retention,
                maximum_interval,
                memory,
                review.rating,
                elapsed_days,
                lapses,
                review.reviewed_date,
            );
            memory = Some(MemoryState {
                stability: scheduled.stability,
                difficulty: scheduled.difficulty,
            });
            lapses = scheduled.lapses;
            last_reviewed = Some(review.reviewed_date);
        }
    }

    if predictions == 0 {
        None
    } else {
        Some((loss / predictions as f64, predictions))
    }
}

pub fn optimize_weights(
    reviews: &[TrainingReview],
    starting_weights: [f64; 19],
    desired_retention: f64,
    maximum_interval: i64,
) -> Option<OptimizationResult> {
    let (previous_loss, predictions) = replay_loss(
        reviews,
        &starting_weights,
        desired_retention,
        maximum_interval,
    )?;
    let mut best_weights = starting_weights;
    let mut best_loss = previous_loss;
    let mut steps = best_weights.map(|weight| (weight.abs() * 0.08).max(0.02));

    for _ in 0..8 {
        let mut improved = false;
        for index in 0..best_weights.len() {
            for direction in [-1.0, 1.0] {
                let mut candidate = best_weights;
                candidate[index] = clamp_weight(index, candidate[index] + direction * steps[index]);
                if !valid_initial_stability(&candidate) {
                    continue;
                }
                if let Some((loss, _)) =
                    replay_loss(reviews, &candidate, desired_retention, maximum_interval)
                {
                    if loss + 0.0001 < best_loss {
                        best_loss = loss;
                        best_weights = candidate;
                        improved = true;
                    }
                }
            }
        }
        steps = steps.map(|step| step * if improved { 0.75 } else { 0.5 });
    }

    Some(OptimizationResult {
        weights: best_weights,
        previous_loss,
        optimized_loss: best_loss,
        review_count: reviews.len() as i64,
        prediction_count: predictions,
    })
}
