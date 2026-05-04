import SwiftUI

enum KesshoMacDesign {
    static let pageMaxWidth: CGFloat = 1240
    static let sidePanelWidth: CGFloat = 460
    static let cardRadius: CGFloat = 8

    static let background = Color(red: 0.06, green: 0.06, blue: 0.12)
    static let backgroundDeep = Color(red: 0.035, green: 0.035, blue: 0.08)
    static let panel = Color(red: 0.06, green: 0.09, blue: 0.14).opacity(0.94)
    static let elevated = Color.white.opacity(0.055)
    static let control = Color.white.opacity(0.08)
    static let controlHover = Color.white.opacity(0.14)
    static let border = Color.white.opacity(0.11)
    static let borderStrong = Color.white.opacity(0.2)
    static let text = Color(red: 0.88, green: 0.9, blue: 0.93)
    static let secondaryText = Color(red: 0.62, green: 0.65, blue: 0.7)
    static let mutedText = Color(red: 0.38, green: 0.4, blue: 0.45)
    static let cyan = Color(red: 0.45, green: 0.76, blue: 0.88)
    static let purple = Color(red: 0.66, green: 0.33, blue: 0.97)
    static let green = Color(red: 0.18, green: 0.8, blue: 0.44)
    static let red = Color(red: 0.95, green: 0.27, blue: 0.28)
    static let amber = Color(red: 0.94, green: 0.69, blue: 0.22)

    static func accent(for page: KesshoMacPage) -> Color {
        switch page {
        case .global:
            return purple
        case .synth:
            return Color(red: 0.45, green: 0.74, blue: 0.96)
        case .drums:
            return Color(red: 0.98, green: 0.64, blue: 0.34)
        case .earth:
            return Color(red: 0.3, green: 0.8, blue: 0.6)
        case .granular:
            return Color(red: 0.7, green: 0.62, blue: 1.0)
        case .delay:
            return Color(red: 0.38, green: 0.72, blue: 0.86)
        case .reverb:
            return Color(red: 0.85, green: 0.62, blue: 1.0)
        case .dynamics:
            return Color(red: 0.74, green: 0.9, blue: 0.54)
        case .routing:
            return Color(red: 0.62, green: 0.82, blue: 0.95)
        }
    }
}

enum KesshoMacPage: String, CaseIterable, Identifiable {
    case global
    case synth
    case drums
    case earth
    case granular
    case delay
    case reverb
    case dynamics
    case routing

    var id: String { rawValue }

    var title: String {
        switch self {
        case .global: return "Global"
        case .synth: return "Synth"
        case .drums: return "Drums"
        case .earth: return "Earth"
        case .granular: return "Granular"
        case .delay: return "Delay"
        case .reverb: return "Reverb"
        case .dynamics: return "Dynamics"
        case .routing: return "Routing"
        }
    }

    var symbol: String {
        switch self {
        case .global: return "target"
        case .synth: return "waveform"
        case .drums: return "circle.grid.cross"
        case .earth: return "water.waves"
        case .granular: return "sparkles"
        case .delay: return "repeat"
        case .reverb: return "diamond"
        case .dynamics: return "waveform.path.ecg"
        case .routing: return "square.grid.3x3"
        }
    }

    var pageTitle: String {
        "\(title)"
    }
}

enum KesshoMacValueStyle {
    case normalized
    case percent
    case integer
    case hertz
    case milliseconds
    case seconds
    case decibels

    func text(for value: Double) -> String {
        switch self {
        case .normalized:
            return String(format: "%.2f", value)
        case .percent:
            return "\(Int((value * 100).rounded()))%"
        case .integer:
            return "\(Int(value.rounded()))"
        case .hertz:
            return value >= 1_000 ? String(format: "%.1f kHz", value / 1_000) : "\(Int(value.rounded())) Hz"
        case .milliseconds:
            return "\(Int(value.rounded())) ms"
        case .seconds:
            return String(format: "%.1f s", value)
        case .decibels:
            return String(format: "%.1f dB", value)
        }
    }
}

struct KesshoMacSliderSpec: Identifiable {
    let id: String
    let label: String
    let key: String
    let icon: String
    let value: KeyPath<SliderState, Double>
    let range: ClosedRange<Double>
    let style: KesshoMacValueStyle

    init(
        _ label: String,
        key: String,
        icon: String = "slider.horizontal.3",
        value: KeyPath<SliderState, Double>,
        range: ClosedRange<Double> = 0...1,
        style: KesshoMacValueStyle = .normalized
    ) {
        self.id = key
        self.label = label
        self.key = key
        self.icon = icon
        self.value = value
        self.range = range
        self.style = style
    }
}
