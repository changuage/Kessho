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

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(KesshoMacDesign.mutedText)
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.black.opacity(0.2))

            content
                .padding(10)
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
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                Image(systemName: spec.icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                    .frame(width: 16)

                Text(spec.label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)

                Spacer(minLength: 6)

                Text(spec.style.text(for: appState.state[keyPath: spec.value]))
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                    .frame(minWidth: 54, alignment: .trailing)
            }

            Slider(value: binding, in: spec.range)
                .tint(accent)
                .controlSize(.small)
        }
        .padding(.vertical, 4)
    }

    private var binding: Binding<Double> {
        Binding(
            get: {
                appState.state[keyPath: spec.value]
            },
            set: { newValue in
                appState.handleSliderChange(key: spec.key, value: newValue)
            }
        )
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

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(KesshoMacPage.allCases) { page in
                    Button {
                        activePage = page
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: page.symbol)
                                .font(.system(size: 17, weight: .medium))
                            Text(page.title)
                                .font(.system(size: 12, weight: .bold))
                        }
                        .foregroundStyle(activePage == page ? KesshoMacDesign.accent(for: page) : KesshoMacDesign.secondaryText)
                        .frame(width: 112, height: 68)
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
        .frame(maxWidth: .infinity)
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
