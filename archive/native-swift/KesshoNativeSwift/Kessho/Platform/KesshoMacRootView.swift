import SwiftUI

/// macOS host for the native parity surface.
public struct KesshoMacRootView: View {
    @StateObject private var appState = AppState()

    public init() {}

    public var body: some View {
        KesshoMacWebParityShell()
            .environmentObject(appState)
            .preferredColorScheme(.dark)
            .frame(minWidth: 390, idealWidth: 430, minHeight: 680, idealHeight: 760)
    }
}

private struct KesshoMacWebParityShell: View {
    @EnvironmentObject private var appState: AppState
    @State private var activePage: KesshoMacPage = .global
    @State private var showControls = false
    @State private var showingPresets = false
    @State private var showingRecording = false

    private let deckPages: [KesshoMacPage] = [
        .global,
        .synth,
        .drums,
        .earth,
        .granular,
        .delay,
        .reverb,
        .dynamics,
        .routing,
    ]

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.025, green: 0.026, blue: 0.06),
                    Color(red: 0.055, green: 0.07, blue: 0.14),
                    Color(red: 0.07, green: 0.13, blue: 0.23),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                webTransport
                    .padding(.top, 18)
                    .padding(.bottom, showControls ? 10 : 0)

                if showControls {
                    controlsDeck
                } else {
                    firstScreen
                }
            }
        }
        .sheet(isPresented: $showingPresets) {
            PresetListView()
                .environmentObject(appState)
        }
        .sheet(isPresented: $showingRecording) {
            RecordingView()
                .environmentObject(appState)
        }
    }

    private var webTransport: some View {
        HStack(spacing: 24) {
            KesshoWebIconButton(
                symbol: appState.isPlaying ? "pause.fill" : "play.fill",
                tint: .white,
                size: 19
            ) {
                appState.togglePlayback()
            }

            KesshoWebIconButton(symbol: "circle.fill", tint: KesshoMacDesign.red, size: 9) {
                showingRecording = true
            }

            if showControls {
                KesshoWebIconButton(symbol: "arrow.down", tint: KesshoMacDesign.secondaryText, size: 16) {
                    showingPresets = true
                }
                KesshoWebIconButton(symbol: "arrow.up", tint: KesshoMacDesign.secondaryText, size: 16) {
                    showingPresets = true
                }
                KesshoWebIconButton(symbol: "sparkle", tint: KesshoMacDesign.secondaryText, size: 14) {
                    showControls = false
                }
            }

            KesshoWebIconButton(
                symbol: "snowflake",
                tint: showControls ? Color(red: 0.82, green: 0.87, blue: 0.95) : KesshoMacDesign.secondaryText,
                size: 15
            ) {
                withAnimation(.easeInOut(duration: 0.2)) {
                    showControls.toggle()
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var firstScreen: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 18)

            KesshoMacSnowflakeOrb()
                .frame(maxWidth: 620, maxHeight: 620)
                .padding(.horizontal, 18)

            Spacer(minLength: 18)

            HStack(spacing: 54) {
                KesshoWebIconButton(symbol: "sparkle", tint: KesshoMacDesign.secondaryText, size: 16) {
                    showingPresets = true
                }
                KesshoWebIconButton(symbol: "snowflake", tint: Color(red: 0.82, green: 0.87, blue: 0.95), size: 17) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showControls = true
                    }
                }
            }
            .padding(.bottom, 34)
        }
    }

    private var controlsDeck: some View {
        VStack(spacing: 8) {
            KesshoMacTabBar(activePage: $activePage, pages: deckPages)
                .padding(.horizontal, 10)

            ScrollView {
                KesshoMacPageHost(page: activePage)
                    .padding(.top, 4)
            }
            .scrollIndicators(.hidden)
        }
        .frame(maxWidth: 720, maxHeight: .infinity)
        .background(Color.black.opacity(0.10))
    }
}

private struct KesshoMacSnowflakeOrb: View {
    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            let orbSide = side * 0.94

            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color.black.opacity(0.92),
                                Color.black.opacity(0.78),
                                Color(red: 0.10, green: 0.21, blue: 0.28).opacity(0.70),
                                Color.clear,
                            ],
                            center: .center,
                            startRadius: 0,
                            endRadius: orbSide * 0.55
                        )
                    )
                    .frame(width: orbSide, height: orbSide)
                    .shadow(color: Color(red: 0.25, green: 0.48, blue: 0.58).opacity(0.38), radius: 38)

                SnowflakeView()
                    .frame(width: orbSide * 0.72, height: orbSide * 0.72)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

private struct KesshoWebIconButton: View {
    let symbol: String
    let tint: Color
    let size: CGFloat
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct KesshoMacWorkbench: View {
    @EnvironmentObject private var appState: AppState
    @State private var activePage: KesshoMacPage = .global
    @State private var showingPresets = false
    @State private var showingRecording = false
    @State private var showingSettings = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    KesshoMacDesign.backgroundDeep,
                    KesshoMacDesign.background,
                    Color(red: 0.05, green: 0.07, blue: 0.1)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
                    .padding(.bottom, 10)

                KesshoMacTabBar(activePage: $activePage)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 8)

                ScrollView {
                    KesshoMacPageHost(page: activePage)
                        .padding(.top, 4)
                }
                .scrollIndicators(.hidden)

                TransportBar()
                    .frame(maxWidth: 880)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 16)
                    .padding(.top, 8)
            }
        }
        .sheet(isPresented: $showingPresets) {
            PresetListView()
                .environmentObject(appState)
        }
        .sheet(isPresented: $showingRecording) {
            RecordingView()
                .environmentObject(appState)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(appState)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Kessho")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)

                Text(appState.currentScaleName.isEmpty ? activePage.title : appState.currentScaleName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
            }

            Spacer()

            KesshoMacStatusPill(
                title: "Seed",
                value: appState.currentBucket.isEmpty ? "--" : appState.currentBucket,
                accent: KesshoMacDesign.accent(for: activePage)
            )

            KesshoMacHeaderIconButton(title: "Recordings", symbol: "record.circle", accent: KesshoMacDesign.red) {
                showingRecording = true
            }

            KesshoMacHeaderIconButton(title: "Presets", symbol: "tray.full", accent: KesshoMacDesign.accent(for: activePage)) {
                showingPresets = true
            }

            KesshoMacHeaderIconButton(title: "Settings", symbol: "gearshape", accent: KesshoMacDesign.secondaryText) {
                showingSettings = true
            }
        }
    }
}

private struct KesshoMacHeaderIconButton: View {
    let title: String
    let symbol: String
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 34, height: 34)
                .background(KesshoMacDesign.control)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(KesshoMacDesign.border, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .help(title)
    }
}
