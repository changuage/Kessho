import Foundation

/// xmur3 hash function - creates a seed generator from a string
/// Returns a function that produces UInt32 values
func xmur3(_ str: String) -> () -> UInt32 {
    var h: UInt32 = 1779033703 ^ UInt32(str.count)
    
    for char in str.utf8 {
        h = h ^ UInt32(char)
        h = h &* 3432918353
        h = (h << 13) | (h >> 19)
    }
    
    var state = h
    return {
        state = state ^ (state >> 16)
        state = state &* 2246822507
        state = state ^ (state >> 13)
        state = state &* 3266489909
        state = state ^ (state >> 16)
        return state
    }
}

/// mulberry32 PRNG - fast, good quality 32-bit PRNG
/// Returns a function that produces values in [0, 1)
func mulberry32(_ seed: UInt32) -> () -> Double {
    var state = seed
    return {
        state = state &+ 0x6d2b79f5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        let result = (t ^ (t >> 14))
        return Double(result) / 4294967296.0
    }
}

/// Creates a seeded RNG from a string
func createRng(_ seedMaterial: String) -> () -> Double {
    let hashFn = xmur3(seedMaterial)
    let seed = hashFn()
    return mulberry32(seed)
}

/// RNG helper: get integer in range [min, max] inclusive
func rngInt(_ rng: () -> Double, min: Int, max: Int) -> Int {
    return Int(floor(rng() * Double(max - min + 1))) + min
}

/// RNG helper: get float in range [min, max]
func rngFloat(_ rng: () -> Double, min: Double, max: Double) -> Double {
    return rng() * (max - min) + min
}

/// RNG helper: pick random element from array
func rngPick<T>(_ rng: () -> Double, _ arr: [T]) -> T {
    return arr[Int(floor(rng() * Double(arr.count)))]
}

/// RNG helper: shuffle array (Fisher-Yates)
func rngShuffle<T>(_ rng: () -> Double, _ arr: [T]) -> [T] {
    var result = arr
    for i in stride(from: result.count - 1, through: 1, by: -1) {
        let j = Int(floor(rng() * Double(i + 1)))
        result.swapAt(i, j)
    }
    return result
}

/// RNG helper: weighted random selection
func rngWeighted<T>(_ rng: () -> Double, items: [T], weights: [Double]) -> T {
    let totalWeight = weights.reduce(0, +)
    var random = rng() * totalWeight
    
    for (i, item) in items.enumerated() {
        random -= weights[i]
        if random <= 0 { return item }
    }
    
    return items[items.count - 1]
}

/// Get UTC bucket string for seed generation
func getUtcBucket(_ seedWindow: String) -> String {
    let now = Date()
    let calendar = Calendar(identifier: .gregorian)
    let components = calendar.dateComponents(in: TimeZone(identifier: "UTC")!, from: now)
    
    let year = components.year!
    let month = String(format: "%02d", components.month!)
    let day = String(format: "%02d", components.day!)
    
    if seedWindow == "day" {
        return "\(year)-\(month)-\(day)"
    }
    
    let hour = String(format: "%02d", components.hour!)
    return "\(year)-\(month)-\(day)T\(hour)"
}

/// Compute deterministic seed from bucket and slider state
func computeSeed(bucket: String, sliderStateJson: String) -> UInt32 {
    let seedMaterial = "\(bucket)|\(sliderStateJson)|E_ROOT"
    let hashFn = xmur3(seedMaterial)
    return hashFn()
}

/// Pre-generate a sequence of random numbers for worklet use
func generateRandomSequence(_ rng: () -> Double, count: Int) -> [Float] {
    var sequence = [Float](repeating: 0, count: count)
    for i in 0..<count {
        sequence[i] = Float(rng())
    }
    return sequence
}
