import SwiftUI

struct KesshoMacCard<Content: View>: View {
    let title: String
    let symbol: String
    let accent: Color
    var trailing: AnyView?
    @ViewBuilder let content: Content

    init(
        title: String,
        symbol: String,
        accent: Color,
        trailing: AnyView? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.symbol = symbol
        self.accent = accent
        self.trailing = trailing
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 18)

                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(KesshoMacDesign.text)

                Spacer(minLength: 8)

                if let trailing {
                    trailing
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.23))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(KesshoMacDesign.border.opacity(0.8))
                    .frame(height: 1)
            }

            content
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(KesshoMacDesign.panel)
        .clipShape(RoundedRectangle(cornerRadius: KesshoMacDesign.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: KesshoMacDesign.cardRadius, style: .continuous)
                .stroke(KesshoMacDesign.border, lineWidth: 1)
        }
    }
}

struct KesshoMacSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    @State private var isExpanded = true

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.16)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(KesshoMacDesign.mutedText)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    Text(title)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.text)
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.black.opacity(0.2))

            if isExpanded {
                content
                    .padding(10)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(KesshoMacDesign.elevated)
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .stroke(KesshoMacDesign.border.opacity(0.65), lineWidth: 1)
        }
    }
}

struct KesshoMacSliderRow: View {
    @EnvironmentObject private var appState: AppState
    let spec: KesshoMacSliderSpec
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 7) {
                Image(systemName: spec.icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                    .frame(width: 16)

                Text(spec.label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)

                Spacer(minLength: 6)

                Button {
                    cycleSliderMode()
                } label: {
                    Image(systemName: modeSymbol)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(isDualMode ? accent : KesshoMacDesign.mutedText)
                        .frame(width: 18, height: 18)
                }
                .buttonStyle(.plain)
                .help(modeHelp)

                Text(displayValue)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                    .frame(minWidth: 68, alignment: .trailing)
            }

            if let dualRange {
                dualSliderStack(dualRange)
            } else {
                Slider(value: binding, in: spec.range)
                    .tint(accent)
                    .controlSize(.small)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            cycleSliderMode()
        }
    }

    private var binding: Binding<Double> {
        Binding(
            get: {
                appState.state[keyPath: spec.value]
            },
            set: { newValue in
                appState.setSliderValue(key: spec.key, value: newValue)
            }
        )
    }

    private var dualRange: DualRange? {
        appState.dualRanges[spec.key]
    }

    private var isDualMode: Bool {
        dualRange != nil
    }

    private var sliderMode: NativeSliderMode {
        appState.sliderModes[spec.key] ?? .single
    }

    private var modeSymbol: String {
        switch sliderMode {
        case .single: return "slider.horizontal.3"
        case .walk: return "waveform.path.ecg"
        case .sampleHold: return "square.grid.2x2"
        }
    }

    private var modeHelp: String {
        switch sliderMode {
        case .single: return "Single value"
        case .walk: return "Walk range"
        case .sampleHold: return "Sample and hold range"
        }
    }

    private var walkValue: Double {
        appState.randomWalkValues[spec.key] ?? appState.state[keyPath: spec.value]
    }

    private var displayValue: String {
        guard let dualRange else {
            return spec.style.text(for: appState.state[keyPath: spec.value])
        }
        return "\(spec.style.text(for: dualRange.min))~\(spec.style.text(for: dualRange.max))"
    }

    private func cycleSliderMode() {
        appState.cycleSliderMode(
            for: spec.key,
            currentValue: appState.state[keyPath: spec.value],
            rangeMin: spec.range.lowerBound,
            rangeMax: spec.range.upperBound
        )
    }

    private func dualSliderStack(_ dualRange: DualRange) -> some View {
        VStack(spacing: 4) {
            dualSlider(
                title: "Min",
                value: dualRange.min,
                tint: KesshoMacDesign.cyan
            ) { newMin in
                appState.updateDualRange(
                    for: spec.key,
                    min: min(newMin, dualRange.max),
                    max: dualRange.max
                )
            }

            dualSlider(
                title: "Max",
                value: dualRange.max,
                tint: accent
            ) { newMax in
                appState.updateDualRange(
                    for: spec.key,
                    min: dualRange.min,
                    max: max(newMax, dualRange.min)
                )
            }

            GeometryReader { geo in
                let width = max(geo.size.width - 8, 1)
                let rangeWidth = max(dualRange.max - dualRange.min, 0.0001)
                let normalizedPosition = min(1, max(0, (walkValue - dualRange.min) / rangeWidth))

                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(KesshoMacDesign.control)

                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [KesshoMacDesign.cyan.opacity(0.55), accent.opacity(0.65)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )

                    Circle()
                        .fill(KesshoMacDesign.text)
                        .frame(width: 8, height: 8)
                        .offset(x: width * normalizedPosition)
                        .animation(.easeInOut(duration: 0.12), value: walkValue)
                }
            }
            .frame(height: 8)

            HStack {
                Text(modeText)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                Text(spec.style.text(for: walkValue))
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(accent)
                Spacer()
                Text("\(String(format: "%.1f", appState.state.randomWalkSpeed))x")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(KesshoMacDesign.mutedText)
            }
        }
        .padding(7)
        .background(KesshoMacDesign.control.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }

    private var modeText: String {
        switch sliderMode {
        case .single: return "Single"
        case .walk: return "Walk"
        case .sampleHold: return "S&H"
        }
    }

    private func dualSlider(
        title: String,
        value: Double,
        tint: Color,
        onChange: @escaping (Double) -> Void
    ) -> some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(KesshoMacDesign.mutedText)
                .frame(width: 26, alignment: .leading)

            Slider(
                value: Binding(
                    get: { value },
                    set: onChange
                ),
                in: spec.range
            )
            .tint(tint)
            .controlSize(.small)

            Text(spec.style.text(for: value))
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(tint)
                .frame(width: 58, alignment: .trailing)
        }
    }
}

struct KesshoMacSliderGrid: View {
    let specs: [KesshoMacSliderSpec]
    let accent: Color
    var columns = 1

    var body: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(minimum: 160), spacing: 12), count: max(1, columns)),
            alignment: .leading,
            spacing: 4
        ) {
            ForEach(specs) { spec in
                KesshoMacSliderRow(spec: spec, accent: accent)
            }
        }
    }
}

struct KesshoMacToggleRow: View {
    let title: String
    let symbol: String
    let accent: Color
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 16)
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)
            }
        }
        .toggleStyle(.switch)
        .controlSize(.small)
        .tint(accent)
        .padding(.vertical, 3)
    }
}

struct KesshoMacPickerRow<Value: Hashable>: View {
    let title: String
    let symbol: String
    let accent: Color
    @Binding var selection: Value
    let options: [(value: Value, label: String)]

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 16)

            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(KesshoMacDesign.text)

            Spacer(minLength: 8)

            Picker(title, selection: $selection) {
                ForEach(options.indices, id: \.self) { index in
                    let option = options[index]
                    Text(option.label).tag(option.value)
                }
            }
            .pickerStyle(.menu)
            .tint(accent)
            .controlSize(.small)
        }
        .padding(.vertical, 3)
    }
}

struct KesshoMacStepperRow: View {
    let title: String
    let symbol: String
    let accent: Color
    @Binding var value: Int
    let range: ClosedRange<Int>

    var body: some View {
        Stepper(value: $value, in: range) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 16)

                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)

                Spacer(minLength: 8)

                Text("\(value)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
            }
        }
        .controlSize(.small)
        .padding(.vertical, 3)
    }
}

struct KesshoMacIconButton: View {
    let title: String
    let symbol: String
    let accent: Color
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: symbol)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(isActive ? .white : KesshoMacDesign.text)
            .frame(width: 66, height: 52)
            .background(isActive ? accent.opacity(0.36) : KesshoMacDesign.control)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(isActive ? accent.opacity(0.7) : KesshoMacDesign.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .help(title)
    }
}

struct KesshoMacTabBar: View {
    @Binding var activePage: KesshoMacPage
    var pages: [KesshoMacPage] = KesshoMacPage.allCases

    var body: some View {
        GeometryReader { proxy in
            let spacing: CGFloat = 8
            let totalSpacing = spacing * CGFloat(max(0, pages.count - 1))
            let fittedWidth = (proxy.size.width - totalSpacing - 4) / CGFloat(max(1, pages.count))
            let tabWidth = min(112, max(82, fittedWidth))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: spacing) {
                    ForEach(pages) { page in
                        Button {
                            activePage = page
                        } label: {
                            VStack(spacing: 6) {
                                Image(systemName: page.symbol)
                                    .font(.system(size: 17, weight: .medium))
                                Text(page.title)
                                    .font(.system(size: 12, weight: .bold))
                                    .lineLimit(1)
                            }
                            .foregroundStyle(activePage == page ? KesshoMacDesign.accent(for: page) : KesshoMacDesign.secondaryText)
                            .frame(width: tabWidth, height: 68)
                            .background(tabBackground(for: page))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(activePage == page ? KesshoMacDesign.accent(for: page).opacity(0.62) : KesshoMacDesign.border, lineWidth: 1)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 68)
    }

    private func tabBackground(for page: KesshoMacPage) -> Color {
        activePage == page
            ? KesshoMacDesign.accent(for: page).opacity(0.18)
            : KesshoMacDesign.control
    }
}

struct KesshoMacStatusPill: View {
    let title: String
    let value: String
    let accent: Color

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(KesshoMacDesign.mutedText)
            Text(value)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(accent)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(KesshoMacDesign.control)
        .clipShape(Capsule())
        .overlay {
            Capsule()
                .stroke(KesshoMacDesign.border, lineWidth: 1)
        }
    }
}
