import SwiftUI

struct KesshoMacPageHost: View {
    let page: KesshoMacPage

    var body: some View {
        switch page {
        case .journey:
            KesshoMacJourneyPage()
        case .global:
            KesshoMacGlobalPage()
        case .synth:
            KesshoMacSynthPage()
        case .drums:
            KesshoMacDrumsPage()
        case .earth:
            KesshoMacEarthPage()
        case .granular:
            KesshoMacGranularPage()
        case .delay:
            KesshoMacDelayPage()
        case .reverb:
            KesshoMacReverbPage()
        case .dynamics:
            KesshoMacDynamicsPage()
        case .routing:
            KesshoMacRoutingPage()
        }
    }
}

struct KesshoMacJourneyPage: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .journey)

    var body: some View {
        KesshoMacPageFrame(page: .journey) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    journeyTransport
                    journeyGraphCard
                    presetAssignmentCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    nodeEditor
                    connectionEditor
                    morphTimeline
                    visualStack
                }
            }
        }
    }

    private var journeyTransport: some View {
        KesshoMacCard(title: "Journey Transport", symbol: "sparkles.rectangle.stack", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Button {
                        appState.toggleJourneyPlayback()
                    } label: {
                        Label(appState.journeyPhase.isActive ? "Stop" : "Play", systemImage: appState.journeyPhase.isActive ? "stop.fill" : "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(appState.journeyPhase.isActive ? KesshoMacDesign.red : KesshoMacDesign.green)
                    .controlSize(.small)

                    Button {
                        appState.connectJourneyClockwise()
                    } label: {
                        Label("Auto Wire", systemImage: "arrow.triangle.branch")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    if appState.journeyConnectionSourceID != nil {
                        Button {
                            appState.journeyConnectionSourceID = nil
                        } label: {
                            Label("Cancel Link", systemImage: "xmark")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }

                HStack(spacing: 8) {
                    KesshoMacStatusPill(title: "Phase", value: appState.journeyPhase.displayName.uppercased(), accent: accent)
                    KesshoMacStatusPill(title: "Now", value: appState.journeyCurrentNodeName, accent: accent)
                    KesshoMacStatusPill(title: "Next", value: appState.journeyNextNodeName, accent: accent)
                }

                if appState.journeyPhase.isActive {
                    VStack(spacing: 5) {
                        ProgressView(value: appState.journeyPhraseProgress)
                            .tint(accent)
                        ProgressView(value: appState.journeyMorphProgress)
                            .tint(KesshoMacDesign.cyan)
                    }
                }
            }
        }
    }

    private var journeyGraphCard: some View {
        KesshoMacCard(title: "Diamond Graph", symbol: "point.topleft.down.curvedto.point.bottomright.up", accent: accent) {
            JourneyDiamondView(accent: accent)
                .frame(height: horizontalSizeClass == .compact ? 300 : 390)
        }
    }

    private var presetAssignmentCard: some View {
        KesshoMacCard(title: "Assign Presets", symbol: "tray.full", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 2),
                    spacing: 6
                ) {
                    ForEach(JourneyPosition.cardinalCases) { position in
                        journeySlotButton(position)
                    }
                }

                if appState.savedPresets.isEmpty {
                    Text("No saved presets")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.secondaryText)
                } else if let selectedPosition = selectedAssignablePosition {
                    VStack(spacing: 6) {
                        ForEach(appState.savedPresets.prefix(horizontalSizeClass == .compact ? 6 : 8)) { preset in
                            Button {
                                appState.assignJourneyPreset(preset, to: selectedPosition)
                            } label: {
                                HStack {
                                    Text(preset.name.replacingOccurrences(of: "_", with: " "))
                                        .font(.system(size: 11, weight: .semibold))
                                        .lineLimit(1)
                                    Spacer()
                                    Image(systemName: "plus.circle")
                                        .font(.system(size: 11, weight: .bold))
                                }
                                .foregroundStyle(KesshoMacDesign.text)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(KesshoMacDesign.control)
                                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var nodeEditor: some View {
        KesshoMacCard(title: "Node", symbol: "circle.hexagongrid", accent: accent) {
            if let node = selectedNode {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Text(node.position.title)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(accent)
                        Text(node.presetName.isEmpty ? "Empty" : node.presetName.replacingOccurrences(of: "_", with: " "))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(KesshoMacDesign.text)
                            .lineLimit(1)
                        Spacer()
                    }

                    if node.position != .center {
                        journeyPhraseControls(node)

                        HStack(spacing: 8) {
                            Button {
                                appState.beginJourneyConnection(from: node.id)
                            } label: {
                                Label("Link From", systemImage: "arrow.up.right.circle")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)

                            Button {
                                appState.clearJourneyNode(node.id)
                            } label: {
                                Label("Clear", systemImage: "trash")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .tint(KesshoMacDesign.red)
                        }
                    } else {
                        Button {
                            appState.beginJourneyConnection(from: node.id)
                        } label: {
                            Label("Choose Start Target", systemImage: "arrow.up.right.circle")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
            } else {
                Text("Select a diamond node")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
            }
        }
    }

    private var connectionEditor: some View {
        KesshoMacCard(title: "Connections", symbol: "arrow.triangle.branch", accent: accent) {
            VStack(alignment: .leading, spacing: 8) {
                if appState.journeyConnections.isEmpty {
                    Text("No connections yet")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.secondaryText)
                } else {
                    ForEach(appState.journeyConnections) { connection in
                        connectionRow(connection)
                    }
                }

                if let connection = selectedConnection {
                    Divider().overlay(KesshoMacDesign.border)
                    journeyConnectionControls(connection)
                }
            }
        }
    }

    private var morphTimeline: some View {
        KesshoMacCard(title: "Morph Timeline", symbol: "circle.lefthalf.filled", accent: accent) {
            VStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text("Morph")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(KesshoMacDesign.text)
                        Spacer()
                        Text("\(Int(appState.morphPosition.rounded()))%")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(KesshoMacDesign.secondaryText)
                    }
                    Slider(
                        value: Binding(
                            get: { appState.morphPosition },
                            set: { appState.setMorphPosition($0) }
                        ),
                        in: 0...100
                    )
                    .tint(accent)
                    .disabled(appState.autoMorphEnabled)
                }

                HStack(spacing: 12) {
                    phraseStepper(title: "Hold", value: $appState.morphPlayPhrases, range: 1...64)
                    phraseStepper(title: "Morph", value: $appState.morphTransitionPhrases, range: 1...64)
                }
            }
        }
    }

    private var visualStack: some View {
        KesshoMacCard(title: "Visuals", symbol: "snowflake", accent: accent) {
            if horizontalSizeClass == .compact {
                VStack(spacing: 8) {
                    SnowflakeView()
                        .frame(height: 240)
                    CircleOfFifthsView()
                        .frame(height: 240)
                }
            } else {
                HStack(spacing: 8) {
                    SnowflakeView()
                        .frame(minHeight: 320)
                    CircleOfFifthsView()
                        .frame(minHeight: 320)
                }
            }
        }
    }

    private func phraseStepper(title: String, value: Binding<Int>, range: ClosedRange<Int>) -> some View {
        Stepper(value: value, in: range) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.mutedText)
                Text("\(value.wrappedValue)")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(accent)
            }
        }
        .controlSize(.small)
    }

    private var selectedNode: JourneyNode? {
        appState.journeyNode(id: appState.journeySelectedNodeID)
    }

    private var selectedConnection: JourneyConnection? {
        appState.journeyConnections.first { $0.id == appState.journeySelectedConnectionID }
    }

    private var selectedAssignablePosition: JourneyPosition? {
        guard let node = selectedNode, node.position != .center else {
            return .left
        }
        return node.position
    }

    private func journeySlotButton(_ position: JourneyPosition) -> some View {
        let node = appState.journeyNode(position: position)
        let isSelected = appState.journeySelectedNodeID == node?.id
        return Button {
            appState.journeySelectedNodeID = node?.id
            appState.journeySelectedConnectionID = nil
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(position.title)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(isSelected ? accent : KesshoMacDesign.secondaryText)
                Text(node?.presetName.replacingOccurrences(of: "_", with: " ") ?? "Empty")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)
                    .lineLimit(1)
            }
            .padding(7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? accent.opacity(0.24) : KesshoMacDesign.control)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .stroke(isSelected ? accent.opacity(0.75) : KesshoMacDesign.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private func journeyPhraseControls(_ node: JourneyNode) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(node.phraseLengthMax == nil ? "Phrase" : "Phrase Range")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                Spacer()
                Button(node.phraseLengthMax == nil ? "Range" : "Single") {
                    appState.toggleJourneyNodePhraseRange(node.id)
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
            }

            Slider(
                value: Binding(
                    get: { node.phraseLength },
                    set: { appState.setJourneyNodePhraseMin(node.id, $0) }
                ),
                in: 1...100,
                step: 1
            )
            .tint(accent)

            if let maxValue = node.phraseLengthMax {
                Slider(
                    value: Binding(
                        get: { maxValue },
                        set: { appState.setJourneyNodePhraseMax(node.id, $0) }
                    ),
                    in: 1...100,
                    step: 1
                )
                .tint(KesshoMacDesign.cyan)
            }

            Text(node.phraseLengthMax.map { "\(Int(node.phraseLength))-\(Int($0)) phrases" } ?? "\(Int(node.phraseLength)) phrases")
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(KesshoMacDesign.mutedText)
        }
    }

    private func connectionRow(_ connection: JourneyConnection) -> some View {
        Button {
            appState.journeySelectedConnectionID = connection.id
            appState.journeySelectedNodeID = nil
        } label: {
            HStack(spacing: 8) {
                Image(systemName: connection.toNodeID == connection.fromNodeID ? "arrow.clockwise" : "arrow.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(accent)
                    .frame(width: 16)
                Text(connectionLabel(connection))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.text)
                    .lineLimit(1)
                Spacer()
                Text("\(Int((connection.probability * 100).rounded()))%")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
            }
            .padding(7)
            .background(appState.journeySelectedConnectionID == connection.id ? accent.opacity(0.22) : KesshoMacDesign.control)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func journeyConnectionControls(_ connection: JourneyConnection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(connection.morphDurationMax == nil ? "Morph" : "Morph Range")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                Spacer()
                Button(connection.morphDurationMax == nil ? "Range" : "Single") {
                    appState.toggleJourneyConnectionDurationRange(connection.id)
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
                Button {
                    appState.removeJourneyConnection(connection.id)
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
                .tint(KesshoMacDesign.red)
            }

            Slider(
                value: Binding(
                    get: { connection.morphDuration },
                    set: { appState.setJourneyConnectionDurationMin(connection.id, $0) }
                ),
                in: 0.25...64,
                step: 0.25
            )
            .tint(accent)

            if let maxValue = connection.morphDurationMax {
                Slider(
                    value: Binding(
                        get: { maxValue },
                        set: { appState.setJourneyConnectionDurationMax(connection.id, $0) }
                    ),
                    in: 0.25...64,
                    step: 0.25
                )
                .tint(KesshoMacDesign.cyan)
            }

            HStack {
                Text("Probability")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                Slider(
                    value: Binding(
                        get: { connection.probability },
                        set: { appState.setJourneyConnectionProbability(connection.id, $0) }
                    ),
                    in: 0...1
                )
                .tint(KesshoMacDesign.amber)
                Text("\(Int((connection.probability * 100).rounded()))%")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                    .frame(width: 38, alignment: .trailing)
            }
        }
    }

    private func connectionLabel(_ connection: JourneyConnection) -> String {
        let fromTitle = appState.journeyNode(id: connection.fromNodeID)?.position.title ?? "?"
        let toTitle = appState.journeyNode(id: connection.toNodeID)?.position.title ?? "?"
        return "\(fromTitle) -> \(toTitle)"
    }
}

private struct JourneyDiamondView: View {
    @EnvironmentObject private var appState: AppState
    let accent: Color

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Canvas { context, size in
                    drawConnections(context: context, size: size)
                }

                ForEach(appState.journeyNodes) { node in
                    journeyNodeButton(node)
                        .position(Self.point(for: node.position, in: geometry.size))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                RadialGradient(
                    colors: [accent.opacity(0.16), KesshoMacDesign.control.opacity(0.42), Color.clear],
                    center: .center,
                    startRadius: 20,
                    endRadius: 260
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private func drawConnections(context: GraphicsContext, size: CGSize) {
        for connection in appState.journeyConnections {
            guard let fromNode = appState.journeyNode(id: connection.fromNodeID),
                  let toNode = appState.journeyNode(id: connection.toNodeID) else { continue }

            let fromPoint = Self.point(for: fromNode.position, in: size)
            let toPoint = Self.point(for: toNode.position, in: size)
            let isSelected = appState.journeySelectedConnectionID == connection.id
            let strokeColor = isSelected ? accent : accent.opacity(0.48)
            let lineWidth = isSelected ? 3.0 : 1.6

            if fromNode.id == toNode.id {
                let rect = CGRect(x: fromPoint.x - 42, y: fromPoint.y - 58, width: 84, height: 56)
                var path = Path(ellipseIn: rect)
                context.stroke(path, with: .color(strokeColor), lineWidth: lineWidth)
                path = Path()
                path.addEllipse(in: CGRect(x: fromPoint.x + 30, y: fromPoint.y - 42, width: 7, height: 7))
                context.fill(path, with: .color(strokeColor))
            } else {
                var path = Path()
                path.move(to: fromPoint)
                path.addLine(to: toPoint)
                context.stroke(path, with: .color(strokeColor), lineWidth: lineWidth)

                let midpoint = CGPoint(x: (fromPoint.x + toPoint.x) / 2, y: (fromPoint.y + toPoint.y) / 2)
                var marker = Path()
                marker.addEllipse(in: CGRect(x: midpoint.x - 3, y: midpoint.y - 3, width: 6, height: 6))
                context.fill(marker, with: .color(strokeColor))
            }
        }
    }

    private func journeyNodeButton(_ node: JourneyNode) -> some View {
        let isSelected = appState.journeySelectedNodeID == node.id
        let isCurrent = appState.journeyCurrentNodeID == node.id
        let isNext = appState.journeyNextNodeID == node.id || appState.journeyPlannedNextNodeID == node.id
        let isConnectionTarget = appState.journeyConnectionSourceID != nil
        let color = nodeColor(node)

        return Button {
            if appState.journeyConnectionSourceID != nil {
                appState.finishJourneyConnection(to: node.id)
            } else {
                appState.journeySelectedNodeID = node.id
                appState.journeySelectedConnectionID = nil
            }
        } label: {
            VStack(spacing: 5) {
                Image(systemName: node.position == .center ? "play.circle" : node.hasPreset ? "circle.fill" : "plus.circle")
                    .font(.system(size: node.position == .center ? 20 : 16, weight: .semibold))
                    .foregroundStyle(node.position == .center ? accent : color)

                Text(node.position == .center ? "START" : node.position.title.uppercased())
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(KesshoMacDesign.secondaryText)

                if node.position != .center {
                    Text(node.presetName.isEmpty ? "Empty" : node.presetName.replacingOccurrences(of: "_", with: " "))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(node.hasPreset ? KesshoMacDesign.text : KesshoMacDesign.mutedText)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .frame(width: 78, height: 28)
                }
            }
            .frame(width: node.position == .center ? 76 : 96, height: node.position == .center ? 76 : 94)
            .background(nodeBackground(color: color, selected: isSelected, current: isCurrent, target: isConnectionTarget))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(nodeBorder(color: color, selected: isSelected, current: isCurrent, next: isNext), lineWidth: isSelected || isCurrent ? 2 : 1)
            }
        }
        .buttonStyle(.plain)
        .help(node.position == .center ? "Journey start" : node.position.title)
    }

    private func nodeBackground(color: Color, selected: Bool, current: Bool, target: Bool) -> Color {
        if current { return KesshoMacDesign.green.opacity(0.26) }
        if selected { return color.opacity(0.26) }
        if target { return accent.opacity(0.16) }
        return KesshoMacDesign.control.opacity(0.88)
    }

    private func nodeBorder(color: Color, selected: Bool, current: Bool, next: Bool) -> Color {
        if current { return KesshoMacDesign.green.opacity(0.86) }
        if next { return KesshoMacDesign.cyan.opacity(0.72) }
        if selected { return color.opacity(0.82) }
        return KesshoMacDesign.borderStrong
    }

    private func nodeColor(_ node: JourneyNode) -> Color {
        Self.nodeColors[node.colorIndex % Self.nodeColors.count]
    }

    private static func point(for position: JourneyPosition, in size: CGSize) -> CGPoint {
        let width = max(size.width, 1)
        let height = max(size.height, 1)
        let center = CGPoint(x: width / 2, y: height / 2)
        let horizontal = max(112, min(width * 0.34, 220))
        let vertical = max(94, min(height * 0.31, 155))

        switch position {
        case .center:
            return center
        case .top:
            return CGPoint(x: center.x, y: center.y - vertical)
        case .right:
            return CGPoint(x: center.x + horizontal, y: center.y)
        case .bottom:
            return CGPoint(x: center.x, y: center.y + vertical)
        case .left:
            return CGPoint(x: center.x - horizontal, y: center.y)
        }
    }

    private static let nodeColors: [Color] = [
        KesshoMacDesign.purple,
        Color(red: 0.78, green: 0.45, blue: 0.28),
        Color(red: 0.48, green: 0.66, blue: 0.42),
        KesshoMacDesign.amber,
        KesshoMacDesign.cyan,
        Color(red: 0.54, green: 0.62, blue: 0.78)
    ]
}

struct KesshoMacGlobalPage: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .global)
    private var usesCompactLayout: Bool { horizontalSizeClass == .compact }

    var body: some View {
        KesshoMacPageFrame(page: .global) {
            if usesCompactLayout {
                VStack(spacing: 10) {
                    pageIdentity
                    masterMixer
                    seedScaleCard
                    presetCard
                    morphCard
                    harmonyCard
                    transportCard
                    chordProgressionCard
                    playbackTimerCard
                    midiCard
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 10) {
                        pageIdentity
                        masterMixer
                        seedScaleCard
                        presetCard
                    }
                    .frame(width: KesshoMacDesign.sidePanelWidth)

                    VStack(spacing: 10) {
                        morphCard
                        harmonyCard
                        transportCard
                        chordProgressionCard
                        playbackTimerCard
                        midiCard
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var pageIdentity: some View {
        HStack(spacing: 10) {
            Text("◎ Global")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(accent)
            Spacer()
            KesshoMacStatusPill(title: "State", value: appState.isPlaying ? "PLAYING" : "READY", accent: appState.isPlaying ? KesshoMacDesign.green : accent)
        }
    }

    private var masterMixer: some View {
        KesshoMacCard(title: "Master Mixer", symbol: "slider.horizontal.3", accent: accent) {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                alignment: .leading,
                spacing: 10
            ) {
                mixerGroup("Pad", [
                    .init("Pad", key: "synthLevel", icon: "waveform", value: \.synthLevel),
                    .init("Reverb", key: "synthReverbSend", icon: "diamond", value: \.synthReverbSend),
                    .init("Delay A", key: "pad1DelayASend", icon: "repeat", value: \.pad1DelayASend),
                    .init("Delay B", key: "pad1DelayBSend", icon: "repeat.circle", value: \.pad1DelayBSend),
                ])

                mixerGroup("Lead", [
                    .init("Lead 1", key: "leadLevel", icon: "music.note", value: \.leadLevel),
                    .init("Lead 2", key: "lead2Level", icon: "music.quarternote.3", value: \.lead2Level),
                    .init("Reverb 1", key: "leadReverbSend", icon: "diamond", value: \.leadReverbSend),
                    .init("Reverb 2", key: "lead2ReverbSend", icon: "diamond", value: \.lead2ReverbSend),
                ])

                mixerGroup("Drum", [
                    .init("Level", key: "drumLevel", icon: "circle.grid.cross", value: \.drumLevel),
                    .init("Reverb", key: "drumReverbSend", icon: "diamond", value: \.drumReverbSend),
                    .init("Delay A", key: "drumDelayASend", icon: "repeat", value: \.drumDelayASend),
                    .init("Delay B", key: "drumDelayBSend", icon: "repeat.circle", value: \.drumDelayBSend),
                ])

                mixerGroup("Granular", [
                    .init("Level", key: "granularLevel", icon: "sparkles", value: \.granularLevel),
                    .init("Reverb", key: "granularReverbSend", icon: "diamond", value: \.granularReverbSend),
                    .init("Delay A", key: "granularDelayASend", icon: "repeat", value: \.granularDelayASend),
                    .init("Delay B", key: "granularDelayBSend", icon: "repeat.circle", value: \.granularDelayBSend),
                    .init("Delay Mix", key: "granularDelayMix", icon: "repeat", value: \.granularDelayMix),
                    .init("Delay Rev", key: "granularDelayReverbSend", icon: "diamond", value: \.granularDelayReverbSend),
                ])

                mixerGroup("Earth", [
                    .init("Waves", key: "oceanSampleLevel", icon: "water.waves", value: \.oceanSampleLevel),
                    .init("Water", key: "waterLevel", icon: "drop", value: \.waterLevel),
                    .init("Insects", key: "insectsSharedLevel", icon: "antenna.radiowaves.left.and.right", value: \.insectsSharedLevel),
                    .init("Nature", key: "natureLevel", icon: "leaf", value: \.natureLevel),
                ])

                mixerGroup("Output", [
                    .init("Master", key: "masterVolume", icon: "speaker.wave.2", value: \.masterVolume),
                    .init("Reverb", key: "reverbLevel", icon: "diamond", value: \.reverbLevel),
                    .init("Earth Bus", key: "earthLevel", icon: "globe", value: \.earthLevel),
                ])
            }
        }
    }

    private var presetCard: some View {
        KesshoMacCard(title: "Presets", symbol: "tray.full", accent: accent) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Button("Save Snapshot") {
                        let formatter = DateFormatter()
                        formatter.dateFormat = "yyyy-MM-dd HH.mm"
                        appState.saveCurrentAsPreset(name: "Mac Snapshot \(formatter.string(from: Date()))")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    Spacer()

                    Text("\(appState.savedPresets.count) loaded")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.secondaryText)
                }

                VStack(spacing: 6) {
                    ForEach(appState.savedPresets.prefix(6)) { preset in
                        Button {
                            appState.loadPreset(preset)
                        } label: {
                            HStack {
                                Text(preset.name)
                                    .lineLimit(1)
                                    .font(.system(size: 11, weight: .semibold))
                                Spacer()
                                Image(systemName: "arrow.down.circle")
                                    .font(.system(size: 11, weight: .bold))
                            }
                            .foregroundStyle(KesshoMacDesign.text)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(KesshoMacDesign.control)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var morphCard: some View {
        KesshoMacCard(title: "Preset Morph", symbol: "arrow.triangle.2.circlepath", accent: accent) {
            VStack(spacing: 10) {
                HStack {
                    KesshoMacStatusPill(title: "A", value: appState.morphPresetA?.name ?? "EMPTY", accent: accent)
                    KesshoMacStatusPill(title: "B", value: appState.morphPresetB?.name ?? "EMPTY", accent: accent)
                    Spacer()
                    KesshoMacToggleRow(
                        title: "Auto",
                        symbol: "clock.arrow.circlepath",
                        accent: accent,
                        isOn: Binding(
                            get: { appState.autoMorphEnabled },
                            set: { newValue in
                                if appState.autoMorphEnabled != newValue {
                                    appState.toggleAutoMorph()
                                }
                            }
                        )
                    )
                    .frame(width: 120)
                }

                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text("Morph")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(KesshoMacDesign.text)
                        Spacer()
                        Text("\(Int(appState.morphPosition.rounded()))%")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(KesshoMacDesign.secondaryText)
                    }
                    Slider(
                        value: Binding(
                            get: { appState.morphPosition },
                            set: { appState.setMorphPosition($0) }
                        ),
                        in: 0...100
                    )
                    .tint(accent)
                }
            }
        }
    }

    private var seedScaleCard: some View {
        KesshoMacCard(title: "Seed + Scale", symbol: "circle.hexagongrid", accent: accent) {
            VStack(spacing: 8) {
                KesshoMacPickerRow(
                    title: "Seed Window",
                    symbol: "calendar",
                    accent: accent,
                    selection: $appState.state.seedWindow,
                    options: [
                        ("hour", "Hour"),
                        ("day", "Day"),
                    ]
                )

                KesshoMacPickerRow(
                    title: "Scale Mode",
                    symbol: "wand.and.stars",
                    accent: accent,
                    selection: $appState.state.scaleMode,
                    options: [
                        ("auto", "Auto"),
                        ("manual", "Manual"),
                    ]
                )

                if appState.state.scaleMode == "manual" {
                    KesshoMacPickerRow(
                        title: "Manual Scale",
                        symbol: "music.note.list",
                        accent: accent,
                        selection: $appState.state.manualScale,
                        options: Self.scaleOptions
                    )
                }

                KesshoMacPickerRow(
                    title: "Root",
                    symbol: "smallcircle.filled.circle",
                    accent: accent,
                    selection: $appState.state.rootNote,
                    options: Self.rootOptions
                )

                KesshoMacToggleRow(title: "Circle Drift", symbol: "circle.dashed", accent: accent, isOn: $appState.state.cofDriftEnabled)

                if appState.state.cofDriftEnabled {
                    KesshoMacPickerRow(
                        title: "Direction",
                        symbol: "arrow.triangle.2.circlepath",
                        accent: accent,
                        selection: $appState.state.cofDriftDirection,
                        options: [
                            ("cw", "Clockwise"),
                            ("ccw", "Counter"),
                            ("random", "Random"),
                        ]
                    )
                    KesshoMacStepperRow(title: "Rate", symbol: "metronome", accent: accent, value: $appState.state.cofDriftRate, range: 1...16)
                    KesshoMacStepperRow(title: "Range", symbol: "arrow.left.and.right", accent: accent, value: $appState.state.cofDriftRange, range: 1...12)
                }
            }
        }
    }

    private var harmonyCard: some View {
        KesshoMacCard(title: "Scale + Tension", symbol: "circle.hexagongrid", accent: accent) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    KesshoMacStatusPill(title: "Scale", value: appState.currentScaleName.isEmpty ? appState.state.manualScale : appState.currentScaleName, accent: accent)
                    KesshoMacStatusPill(title: "Root", value: "\(appState.state.rootNote)", accent: accent)
                    Spacer()
                }

                KesshoMacSliderGrid(specs: [
                    .init("Tension", key: "tension", icon: "gauge.with.dots.needle.33percent", value: \.tension),
                    .init("Randomness", key: "randomness", icon: "shuffle", value: \.randomness),
                    .init("Voicing", key: "voicingSpread", icon: "pianokeys", value: \.voicingSpread),
                    .init("Chord Rate", key: "chordRate", icon: "metronome", value: \.chordRateDouble, range: 4...64, style: .integer),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var transportCard: some View {
        KesshoMacCard(title: "Transport Sync", symbol: "metronome", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                KesshoMacPickerRow(
                    title: "Primary Clock",
                    symbol: "clock",
                    accent: accent,
                    selection: $appState.state.transportPrimaryClock,
                    options: [
                        ("seconds", "Phrase Seconds"),
                        ("bpm", "Shared BPM"),
                        ("decoupled", "Decoupled"),
                    ]
                )

                KesshoMacSliderGrid(specs: [
                    .init("Phrase", key: "phraseLength", icon: "timer", value: \.phraseLength, range: 4...128, style: .seconds),
                    .init("Shared BPM", key: "sequencerMasterBPM", icon: "metronome", value: \.sequencerMasterBPM, range: 40...300, style: .integer),
                ], accent: accent, columns: 2)

                HStack(spacing: 10) {
                    KesshoMacStepperRow(title: "Bars", symbol: "rectangle.3.group", accent: accent, value: $appState.state.transportBarsPerPhrase, range: 1...16)
                    KesshoMacStepperRow(title: "Beats", symbol: "music.quarternote.3", accent: accent, value: $appState.state.transportBeatsPerBar, range: 2...12)
                }

                KesshoMacPickerRow(
                    title: "Harmony Clock",
                    symbol: "point.3.connected.trianglepath.dotted",
                    accent: accent,
                    selection: $appState.state.harmonyClockSource,
                    options: [
                        ("globalPhrase", "Global Phrase"),
                        ("localPhrase", "Local Phrase"),
                        ("globalBeat", "Global Beat Phrase"),
                        ("localBeat", "Local Beat Phrase"),
                    ]
                )

                HStack(spacing: 8) {
                    KesshoMacStatusPill(
                        title: "Phrase",
                        value: "\(String(format: "%.2f", appState.state.effectivePhraseLength))s",
                        accent: appState.state.transportPrimaryClock == "bpm" ? KesshoMacDesign.cyan : accent
                    )
                    KesshoMacStatusPill(
                        title: "Beat Phrase",
                        value: "\(String(format: "%.2f", appState.state.phraseDurationFromBeatClock))s",
                        accent: KesshoMacDesign.secondaryText
                    )
                    KesshoMacStatusPill(
                        title: "Eq BPM",
                        value: String(format: "%.1f", appState.state.equivalentBPMFromPhraseClock),
                        accent: KesshoMacDesign.secondaryText
                    )
                }

                KesshoMacSection(title: "Motion + Filter") {
                    KesshoMacSliderGrid(specs: [
                        .init("Walk Speed", key: "randomWalkSpeed", icon: "waveform.path", value: \.randomWalkSpeed, range: 0.1...5),
                        .init("Filter Min", key: "filterCutoffMin", icon: "line.3.horizontal.decrease", value: \.filterCutoffMin, range: 80...3_000, style: .hertz),
                        .init("Filter Max", key: "filterCutoffMax", icon: "line.3.horizontal.decrease.circle", value: \.filterCutoffMax, range: 400...14_000, style: .hertz),
                        .init("Resonance", key: "filterResonance", icon: "dot.radiowaves.left.and.right", value: \.filterResonance),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }

    private var chordProgressionCard: some View {
        KesshoMacCard(title: "Chord Progression", symbol: "square.grid.3x3", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    KesshoMacToggleRow(title: "Progression", symbol: "power", accent: accent, isOn: $appState.state.chordProgressionEnabled)
                    Spacer()
                    KesshoMacStatusPill(
                        title: "Step",
                        value: "\(appState.state.chordProgressionPhraseMultiplier)x phrase",
                        accent: appState.state.chordProgressionEnabled ? KesshoMacDesign.green : KesshoMacDesign.secondaryText
                    )
                }

                if appState.state.chordProgressionEnabled {
                    KesshoMacPickerRow(
                        title: "Clock",
                        symbol: "clock.arrow.2.circlepath",
                        accent: accent,
                        selection: $appState.state.chordProgressionClockSource,
                        options: [
                            ("harmony", "Follow Harmony"),
                            ("globalPhrase", "Global Phrase"),
                            ("localPhrase", "Local Phrase"),
                        ]
                    )

                    KesshoMacPickerRow(
                        title: "Step Length",
                        symbol: "timer",
                        accent: accent,
                        selection: $appState.state.chordProgressionPhraseMultiplier,
                        options: [
                            (1, "1 Phrase"),
                            (2, "2 Phrases"),
                            (4, "4 Phrases"),
                            (8, "8 Phrases"),
                        ]
                    )

                    KesshoMacSliderGrid(specs: [
                        .init("Pattern Length", key: "chordProgressionSteps", icon: "number", value: \.chordProgressionStepsDouble, range: 2...8, style: .integer),
                    ], accent: accent)

                    Menu {
                        ForEach(Self.progressionPresets.indices, id: \.self) { index in
                            let preset = Self.progressionPresets[index]
                            Button(preset.label) {
                                applyProgressionPreset(preset.pattern)
                            }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "music.note.list")
                            Text("Preset")
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.text)
                        .padding(8)
                        .background(KesshoMacDesign.control)
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                    }
                    .menuStyle(.button)
                    .buttonStyle(.plain)

                    LazyVGrid(
                        columns: Array(repeating: GridItem(.flexible(minimum: 74), spacing: 8), count: usesCompactLayout ? 2 : 4),
                        spacing: 8
                    ) {
                        ForEach(0..<max(1, min(8, appState.state.chordProgressionSteps)), id: \.self) { index in
                            progressionStepCell(index)
                        }
                    }
                }
            }
        }
    }

    private func applyProgressionPreset(_ pattern: [Int]) {
        appState.state.chordProgressionPattern = pattern
        appState.state.chordProgressionSteps = pattern.count
        appState.state.chordProgressionStepEnabled = Array(repeating: true, count: pattern.count)
    }

    private func progressionStepCell(_ index: Int) -> some View {
        let degree = index < appState.state.chordProgressionPattern.count ? appState.state.chordProgressionPattern[index] : 0
        let isOn = index < appState.state.chordProgressionStepEnabled.count ? appState.state.chordProgressionStepEnabled[index] : true

        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("S\(index + 1)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(KesshoMacDesign.secondaryText)
                Spacer()
                Button {
                    var enabled = appState.state.chordProgressionStepEnabled
                    while enabled.count <= index {
                        enabled.append(true)
                    }
                    enabled[index].toggle()
                    appState.state.chordProgressionStepEnabled = enabled
                } label: {
                    Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(isOn ? KesshoMacDesign.green : KesshoMacDesign.mutedText)
                }
                .buttonStyle(.plain)
                .help("Enable progression step")
            }

            Picker("Degree", selection: Binding(
                get: { degree },
                set: { newValue in
                    var pattern = appState.state.chordProgressionPattern
                    while pattern.count <= index {
                        pattern.append(0)
                    }
                    pattern[index] = newValue
                    appState.state.chordProgressionPattern = pattern
                }
            )) {
                ForEach(Self.degreeLabels.indices, id: \.self) { degreeIndex in
                    Text(Self.degreeLabels[degreeIndex]).tag(degreeIndex)
                }
            }
            .pickerStyle(.menu)
            .controlSize(.small)
        }
        .padding(8)
        .background(isOn ? accent.opacity(0.14) : KesshoMacDesign.control)
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .stroke(isOn ? accent.opacity(0.55) : KesshoMacDesign.border, lineWidth: 1)
        }
    }

    private var playbackTimerCard: some View {
        KesshoMacCard(title: "Playback Timer", symbol: "timer", accent: accent) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    KesshoMacToggleRow(
                        title: "Timer",
                        symbol: "power",
                        accent: accent,
                        isOn: Binding(
                            get: { appState.playbackTimerEnabled },
                            set: { appState.setPlaybackTimerEnabled($0) }
                        )
                    )
                    .frame(maxWidth: 140)

                    Spacer(minLength: 8)

                    KesshoMacStatusPill(
                        title: appState.isPlaying && appState.playbackTimerEnabled ? "Left" : "Duration",
                        value: appState.formattedPlaybackTimerRemaining,
                        accent: appState.playbackTimerEnabled ? KesshoMacDesign.amber : KesshoMacDesign.secondaryText
                    )

                    Button {
                        appState.resetPlaybackTimer()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 12, weight: .bold))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Reset playback timer")
                    .disabled(!appState.playbackTimerEnabled)
                }

                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(minimum: 44), spacing: 6), count: usesCompactLayout ? 3 : 6),
                    spacing: 6
                ) {
                    ForEach(Self.playbackTimerDurations, id: \.self) { minutes in
                        timerDurationButton(minutes)
                    }
                }

                Stepper(
                    value: Binding(
                        get: { appState.playbackTimerMinutes },
                        set: { appState.setPlaybackTimerMinutes($0) }
                    ),
                    in: 1...480
                ) {
                    HStack(spacing: 8) {
                        Image(systemName: "number")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(accent)
                            .frame(width: 16)
                        Text("Custom")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(KesshoMacDesign.text)
                        Spacer()
                        Text("\(appState.playbackTimerMinutes)m")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(KesshoMacDesign.secondaryText)
                    }
                }
                .controlSize(.small)
            }
        }
    }

    private var midiCard: some View {
        KesshoMacCard(title: "MIDI", symbol: "cable.connector", accent: accent) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(appState.latestMIDISummary)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.secondaryText)
                        .lineLimit(1)
                    Spacer()
                    Button("Refresh") {
                        appState.refreshMIDIInputs()
                    }
                    .controlSize(.small)
                }

                ForEach(appState.midiManager.availableInputs) { input in
                    KesshoMacToggleRow(
                        title: input.name,
                        symbol: "pianokeys",
                        accent: accent,
                        isOn: Binding(
                            get: { appState.midiManager.connectedInputIDs.contains(input.uniqueID) },
                            set: { appState.setMIDIInputConnected(input.uniqueID, isConnected: $0) }
                        )
                    )
                }
            }
        }
    }

    private func mixerGroup(_ title: String, _ specs: [KesshoMacSliderSpec]) -> some View {
        KesshoMacSection(title: title) {
            KesshoMacSliderGrid(specs: specs, accent: accent)
        }
    }

    private func timerDurationButton(_ minutes: Int) -> some View {
        Button {
            appState.setPlaybackTimerMinutes(minutes)
        } label: {
            Text("\(minutes)m")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(appState.playbackTimerMinutes == minutes ? .white : KesshoMacDesign.text)
                .frame(maxWidth: .infinity, minHeight: 28)
                .background(appState.playbackTimerMinutes == minutes ? accent.opacity(0.45) : KesshoMacDesign.control)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .stroke(appState.playbackTimerMinutes == minutes ? accent.opacity(0.8) : KesshoMacDesign.border, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .help("Set timer to \(minutes) minutes")
    }

    private static let playbackTimerDurations = [5, 15, 30, 60, 90, 120]

    private static let degreeLabels = ["I", "ii", "iii", "IV", "V", "vi", "VII", "I+"]

    private static let progressionPresets: [(label: String, pattern: [Int])] = [
        ("I - IV - V - I", [0, 3, 4, 0]),
        ("I - vi - IV - V", [0, 5, 3, 4]),
        ("ii - V - I - I", [1, 4, 0, 0]),
        ("I - iii - vi - IV", [0, 2, 5, 3]),
        ("I - V - vi - IV", [0, 4, 5, 3]),
        ("I - IV - ii - V", [0, 3, 1, 4]),
        ("i - VII - VI - VII", [0, 6, 5, 6]),
        ("I - VII - IV - I", [0, 6, 3, 0]),
    ]

    private static let rootOptions: [(value: Int, label: String)] = [
        (0, "C"),
        (1, "C#"),
        (2, "D"),
        (3, "D#"),
        (4, "E"),
        (5, "F"),
        (6, "F#"),
        (7, "G"),
        (8, "G#"),
        (9, "A"),
        (10, "A#"),
        (11, "B"),
    ]

    private static let scaleOptions: [(value: String, label: String)] = [
        ("Major (Ionian)", "Major"),
        ("Minor (Aeolian)", "Minor"),
        ("Dorian", "Dorian"),
        ("Phrygian", "Phrygian"),
        ("Lydian", "Lydian"),
        ("Mixolydian", "Mixolydian"),
        ("Locrian", "Locrian"),
        ("Harmonic Minor", "Harmonic Minor"),
        ("Melodic Minor", "Melodic Minor"),
        ("Pentatonic Major", "Pentatonic Major"),
        ("Pentatonic Minor", "Pentatonic Minor"),
    ]
}

private struct KesshoMacSynthPage: View {
    @EnvironmentObject private var appState: AppState
    @State private var auditionSource = "lead"
    private let accent = KesshoMacDesign.accent(for: .synth)

    var body: some View {
        KesshoMacPageFrame(page: .synth) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    sourceCard
                    padEnvelopeCard
                    padMotionCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    filterToneCard
                    leadOneCard
                    leadTwoCard
                    pianoCard
                    auditionCard
                    synthEuclideanCard
                }
            }
        }
    }

    private var sourceCard: some View {
        KesshoMacCard(title: "Sources", symbol: "waveform", accent: accent) {
            KesshoMacSliderGrid(specs: [
                .init("Pad Level", key: "synthLevel", icon: "waveform", value: \.synthLevel),
                .init("Pad Reverb", key: "synthReverbSend", icon: "diamond", value: \.synthReverbSend),
                .init("Lead 1", key: "leadLevel", icon: "music.note", value: \.leadLevel),
                .init("Lead 2", key: "lead2Level", icon: "music.quarternote.3", value: \.lead2Level),
                .init("Piano", key: "pianoLevel", icon: "pianokeys", value: \.pianoLevel),
                .init("Piano Reverb", key: "pianoReverbSend", icon: "diamond", value: \.pianoReverbSend),
            ], accent: accent, columns: 2)
        }
    }

    private var padEnvelopeCard: some View {
        KesshoMacCard(title: "Pad Envelope", symbol: "waveform.path", accent: accent) {
            KesshoMacSliderGrid(specs: [
                .init("Attack", key: "synthAttack", icon: "arrow.up.right", value: \.synthAttack, range: 0.01...20, style: .seconds),
                .init("Decay", key: "synthDecay", icon: "arrow.down.right", value: \.synthDecay, range: 0.01...10, style: .seconds),
                .init("Sustain", key: "synthSustain", icon: "equal", value: \.synthSustain, style: .percent),
                .init("Release", key: "synthRelease", icon: "arrow.down.forward", value: \.synthRelease, range: 0.1...30, style: .seconds),
            ], accent: accent, columns: 2)
        }
    }

    private var padMotionCard: some View {
        KesshoMacCard(title: "Pad Motion", symbol: "circle.hexagongrid", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(
                    title: "Chord Sequencer",
                    symbol: "point.3.connected.trianglepath.dotted",
                    accent: accent,
                    isOn: $appState.state.synthChordSequencerEnabled
                )

                VoiceMaskControl(voiceMask: $appState.state.synthVoiceMask)

                KesshoMacSliderGrid(specs: [
                    .init("Wave Spread", key: "waveSpread", icon: "waveform.path.ecg", value: \.waveSpread, range: 0...12),
                    .init("Detune", key: "detune", icon: "tuningfork", value: \.detune, range: 0...50),
                    .init("Octave", key: "synthOctave", icon: "arrow.up.arrow.down", value: \.synthOctaveDouble, range: -2...2, style: .integer),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var filterToneCard: some View {
        KesshoMacCard(title: "Filter + Tone", symbol: "line.3.horizontal.decrease", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacPickerRow(
                    title: "Filter Type",
                    symbol: "line.3.horizontal.decrease",
                    accent: accent,
                    selection: $appState.state.filterType,
                    options: [
                        ("lowpass", "Lowpass"),
                        ("bandpass", "Bandpass"),
                        ("highpass", "Highpass"),
                    ]
                )

                KesshoMacSliderGrid(specs: [
                    .init("Hardness", key: "hardness", icon: "hammer", value: \.hardness),
                    .init("Brightness", key: "oscBrightness", icon: "sun.max", value: \.oscBrightnessDouble, range: 0...3, style: .integer),
                    .init("Warmth", key: "warmth", icon: "thermometer.medium", value: \.warmth),
                    .init("Presence", key: "presence", icon: "sparkle.magnifyingglass", value: \.presence),
                    .init("Air", key: "airNoise", icon: "wind", value: \.airNoise),
                    .init("Cutoff Min", key: "filterCutoffMin", icon: "line.3.horizontal.decrease", value: \.filterCutoffMin, range: 80...3_000, style: .hertz),
                    .init("Cutoff Max", key: "filterCutoffMax", icon: "line.3.horizontal.decrease.circle", value: \.filterCutoffMax, range: 400...14_000, style: .hertz),
                    .init("Mod Speed", key: "filterModSpeed", icon: "speedometer", value: \.filterModSpeed, range: 0.05...12),
                    .init("Resonance", key: "filterResonance", icon: "dot.radiowaves.left.and.right", value: \.filterResonance),
                    .init("Q", key: "filterQ", icon: "q.circle", value: \.filterQ, range: 0.1...12),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var leadOneCard: some View {
        KesshoMacCard(title: "Lead 1", symbol: "music.note", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Lead 1 Engine", symbol: "power", accent: accent, isOn: $appState.state.leadEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Level", key: "leadLevel", icon: "speaker.wave.2", value: \.leadLevel),
                    .init("Density", key: "leadDensity", icon: "circle.grid.3x3", value: \.leadDensity),
                    .init("Attack", key: "leadAttack", icon: "arrow.up.right", value: \.leadAttack, range: 0.001...6, style: .seconds),
                    .init("Decay", key: "leadDecay", icon: "arrow.down.right", value: \.leadDecay, range: 0.01...8, style: .seconds),
                    .init("Sustain", key: "leadSustain", icon: "equal", value: \.leadSustain, style: .percent),
                    .init("Hold", key: "leadHold", icon: "pause", value: \.leadHold, range: 0...8, style: .seconds),
                    .init("Release", key: "leadRelease", icon: "arrow.down.forward", value: \.leadRelease, range: 0.05...12, style: .seconds),
                    .init("Timbre Min", key: "leadTimbreMin", icon: "dial.low", value: \.leadTimbreMin),
                    .init("Timbre Max", key: "leadTimbreMax", icon: "dial.high", value: \.leadTimbreMax),
                    .init("Delay Time", key: "leadDelayTimeMin", icon: "clock", value: \.leadDelayTimeMin, range: 60...1_500, style: .milliseconds),
                    .init("Delay Feedback", key: "leadDelayFeedbackMin", icon: "repeat", value: \.leadDelayFeedbackMin),
                    .init("Delay Mix", key: "leadDelayMixMin", icon: "slider.horizontal.3", value: \.leadDelayMixMin),
                    .init("Vibrato Depth", key: "leadVibratoDepthMin", icon: "waveform", value: \.leadVibratoDepthMin),
                    .init("Vibrato Rate", key: "leadVibratoRateMin", icon: "speedometer", value: \.leadVibratoRateMin),
                    .init("Glide", key: "leadGlideMin", icon: "arrow.right.to.line.compact", value: \.leadGlideMin),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var leadTwoCard: some View {
        KesshoMacCard(title: "Lead 2", symbol: "music.quarternote.3", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Lead 2 Engine", symbol: "power", accent: accent, isOn: $appState.state.lead2Enabled)
                HStack(spacing: 8) {
                    KesshoMacPickerRow(
                        title: "Preset C",
                        symbol: "c.circle",
                        accent: accent,
                        selection: $appState.state.lead2PresetC,
                        options: Self.lead2PresetOptions
                    )
                    KesshoMacPickerRow(
                        title: "Preset D",
                        symbol: "d.circle",
                        accent: accent,
                        selection: $appState.state.lead2PresetD,
                        options: Self.lead2PresetOptions
                    )
                }
                KesshoMacPickerRow(
                    title: "Algorithm",
                    symbol: "point.3.connected.trianglepath.dotted",
                    accent: accent,
                    selection: $appState.state.lead2AlgorithmMode,
                    options: [
                        ("snap", "Snap"),
                        ("smooth", "Smooth"),
                    ]
                )
                KesshoMacToggleRow(title: "Auto Morph", symbol: "arrow.triangle.2.circlepath", accent: accent, isOn: $appState.state.lead2MorphAuto)
                KesshoMacSliderGrid(specs: [
                    .init("Level", key: "lead2Level", icon: "speaker.wave.2", value: \.lead2Level),
                    .init("Morph", key: "lead2Morph", icon: "circle.lefthalf.filled", value: \.lead2Morph, style: .percent),
                    .init("Morph Speed", key: "lead2MorphSpeed", icon: "speedometer", value: \.lead2MorphSpeed, range: 0.5...32),
                    .init("Density", key: "lead2Density", icon: "circle.grid.3x3", value: \.lead2Density),
                    .init("Attack", key: "lead2Attack", icon: "arrow.up.right", value: \.lead2Attack, range: 0.001...6, style: .seconds),
                    .init("Decay", key: "lead2Decay", icon: "arrow.down.right", value: \.lead2Decay, range: 0.01...8, style: .seconds),
                    .init("Sustain", key: "lead2Sustain", icon: "equal", value: \.lead2Sustain, style: .percent),
                    .init("Hold", key: "lead2Hold", icon: "pause", value: \.lead2Hold, range: 0...8, style: .seconds),
                    .init("Release", key: "lead2Release", icon: "arrow.down.forward", value: \.lead2Release, range: 0.05...12, style: .seconds),
                    .init("Post LPF", key: "lead2PostLPF", icon: "line.3.horizontal.decrease", value: \.lead2PostLPF, range: 200...20_000, style: .hertz),
                    .init("Stereo", key: "lead2StereoWidth", icon: "arrow.left.and.right", value: \.lead2StereoWidth),
                    .init("Diffuse", key: "lead2DiffuseSend", icon: "sparkles", value: \.lead2DiffuseSend),
                    .init("Reverb", key: "lead2ReverbSend", icon: "diamond", value: \.lead2ReverbSend),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var pianoCard: some View {
        KesshoMacCard(title: "Piano", symbol: "pianokeys", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Piano Engine", symbol: "power", accent: accent, isOn: $appState.state.pianoEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Level", key: "pianoLevel", icon: "speaker.wave.2", value: \.pianoLevel),
                    .init("Attack", key: "pianoAttack", icon: "arrow.up.right", value: \.pianoAttack, range: 0.001...6, style: .seconds),
                    .init("Decay", key: "pianoDecay", icon: "arrow.down.right", value: \.pianoDecay, range: 0.01...8, style: .seconds),
                    .init("Sustain", key: "pianoSustain", icon: "equal", value: \.pianoSustain, style: .percent),
                    .init("Hold", key: "pianoHold", icon: "pause", value: \.pianoHold, range: 0...8, style: .seconds),
                    .init("Release", key: "pianoRelease", icon: "arrow.down.forward", value: \.pianoRelease, range: 0.05...12, style: .seconds),
                    .init("Post LPF", key: "pianoPostLPF", icon: "line.3.horizontal.decrease", value: \.pianoPostLPF, range: 200...20_000, style: .hertz),
                    .init("Stereo", key: "pianoStereoWidth", icon: "arrow.left.and.right", value: \.pianoStereoWidth),
                    .init("Diffuse", key: "pianoDiffuseSend", icon: "sparkles", value: \.pianoDiffuseSend),
                    .init("Delay A", key: "pianoDelayASend", icon: "repeat", value: \.pianoDelayASend),
                    .init("Delay B", key: "pianoDelayBSend", icon: "repeat.circle", value: \.pianoDelayBSend),
                    .init("Granular", key: "granularPianoSend", icon: "sparkles", value: \.granularPianoSend),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var auditionCard: some View {
        KesshoMacCard(title: "Manual Audition", symbol: "pianokeys.inverse", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacPickerRow(
                    title: "Source",
                    symbol: "music.note",
                    accent: accent,
                    selection: $auditionSource,
                    options: [
                        ("lead", "Lead 1"),
                        ("lead2", "Lead 2"),
                        ("piano", "Piano"),
                    ]
                )

                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(minimum: 38), spacing: 6), count: 7),
                    spacing: 6
                ) {
                    ForEach(Self.auditionNotes, id: \.midi) { note in
                        Button {
                            appState.auditionMelodicSource(auditionSource, midiNote: note.midi)
                        } label: {
                            VStack(spacing: 2) {
                                Text(note.name)
                                    .font(.system(size: 12, weight: .bold))
                                Text("\(note.midi)")
                                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(KesshoMacDesign.secondaryText)
                            }
                            .frame(maxWidth: .infinity, minHeight: 42)
                        }
                        .buttonStyle(.bordered)
                        .tint(note.isBlack ? KesshoMacDesign.cyan : accent)
                    }
                }
            }
        }
    }

    private var synthEuclideanCard: some View {
        KesshoMacCard(title: "Synth Euclidean", symbol: "circle.dotted", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Euclidean Notes", symbol: "metronome", accent: accent, isOn: $appState.state.synthEuclideanMasterEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Tempo", key: "synthEuclideanTempo", icon: "speedometer", value: \.synthEuclideanTempo, range: 0.25...4),
                ], accent: accent)

                EuclideanLaneView(
                    laneNumber: 1,
                    enabled: $appState.state.synthEuclid1Enabled,
                    preset: $appState.state.synthEuclid1Preset,
                    steps: $appState.state.synthEuclid1Steps,
                    hits: $appState.state.synthEuclid1Hits,
                    rotation: $appState.state.synthEuclid1Rotation,
                    noteMin: $appState.state.synthEuclid1NoteMin,
                    noteMax: $appState.state.synthEuclid1NoteMax,
                    level: $appState.state.synthEuclid1Level,
                    probability: $appState.state.synthEuclid1Probability,
                    source: $appState.state.synthEuclid1Source
                )

                EuclideanLaneView(
                    laneNumber: 2,
                    enabled: $appState.state.synthEuclid2Enabled,
                    preset: $appState.state.synthEuclid2Preset,
                    steps: $appState.state.synthEuclid2Steps,
                    hits: $appState.state.synthEuclid2Hits,
                    rotation: $appState.state.synthEuclid2Rotation,
                    noteMin: $appState.state.synthEuclid2NoteMin,
                    noteMax: $appState.state.synthEuclid2NoteMax,
                    level: $appState.state.synthEuclid2Level,
                    probability: $appState.state.synthEuclid2Probability,
                    source: $appState.state.synthEuclid2Source
                )

                EuclideanLaneView(
                    laneNumber: 3,
                    enabled: $appState.state.synthEuclid3Enabled,
                    preset: $appState.state.synthEuclid3Preset,
                    steps: $appState.state.synthEuclid3Steps,
                    hits: $appState.state.synthEuclid3Hits,
                    rotation: $appState.state.synthEuclid3Rotation,
                    noteMin: $appState.state.synthEuclid3NoteMin,
                    noteMax: $appState.state.synthEuclid3NoteMax,
                    level: $appState.state.synthEuclid3Level,
                    probability: $appState.state.synthEuclid3Probability,
                    source: $appState.state.synthEuclid3Source
                )

                EuclideanLaneView(
                    laneNumber: 4,
                    enabled: $appState.state.synthEuclid4Enabled,
                    preset: $appState.state.synthEuclid4Preset,
                    steps: $appState.state.synthEuclid4Steps,
                    hits: $appState.state.synthEuclid4Hits,
                    rotation: $appState.state.synthEuclid4Rotation,
                    noteMin: $appState.state.synthEuclid4NoteMin,
                    noteMax: $appState.state.synthEuclid4NoteMax,
                    level: $appState.state.synthEuclid4Level,
                    probability: $appState.state.synthEuclid4Probability,
                    source: $appState.state.synthEuclid4Source
                )
            }
        }
    }

    private static let lead2PresetOptions: [(value: String, label: String)] = [
        ("soft_rhodes", "Soft Rhodes"),
        ("gamelan", "Gamelan"),
        ("glass", "Glass"),
        ("mallet", "Mallet"),
        ("bell", "Bell"),
        ("pluck", "Pluck"),
    ]

    private static let auditionNotes: [(name: String, midi: Int, isBlack: Bool)] = [
        ("C", 60, false),
        ("D", 62, false),
        ("E", 64, false),
        ("F#", 66, true),
        ("G", 67, false),
        ("A", 69, false),
        ("B", 71, false),
        ("C", 72, false),
        ("D", 74, false),
        ("E", 76, false),
        ("G", 79, false),
        ("A", 81, false),
        ("B", 83, false),
        ("C", 84, false),
    ]
}

private struct KesshoMacDrumsPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .drums)

    var body: some View {
        KesshoMacPageFrame(page: .drums) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    drumBusCard
                    drumDelayCard
                    randomRhythmCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    drumVoicesCard
                    euclideanCard
                }
            }
        }
    }

    private var drumBusCard: some View {
        KesshoMacCard(title: "Drum Bus", symbol: "circle.grid.cross", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Drum Engine", symbol: "power", accent: accent, isOn: $appState.state.drumEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Level", key: "drumLevel", icon: "speaker.wave.2", value: \.drumLevel),
                    .init("Reverb", key: "drumReverbSend", icon: "diamond", value: \.drumReverbSend),
                    .init("Delay A", key: "drumDelayASend", icon: "repeat", value: \.drumDelayASend),
                    .init("Delay B", key: "drumDelayBSend", icon: "repeat.circle", value: \.drumDelayBSend),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var drumDelayCard: some View {
        KesshoMacCard(title: "Drum Delay", symbol: "repeat", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Ping-Pong Delay", symbol: "power", accent: accent, isOn: $appState.state.drumDelayEnabled)

                HStack(spacing: 8) {
                    notePicker("Left", selection: $appState.state.drumDelayNoteL)
                    notePicker("Right", selection: $appState.state.drumDelayNoteR)
                }

                KesshoMacSliderGrid(specs: [
                    .init("Feedback", key: "drumDelayFeedback", icon: "repeat", value: \.drumDelayFeedback),
                    .init("Mix", key: "drumDelayMix", icon: "slider.horizontal.3", value: \.drumDelayMix),
                    .init("Filter", key: "drumDelayFilter", icon: "line.3.horizontal.decrease", value: \.drumDelayFilter),
                    .init("Sub Send", key: "drumSubDelaySend", icon: "circle.fill", value: \.drumSubDelaySend),
                    .init("Kick Send", key: "drumKickDelaySend", icon: "circle", value: \.drumKickDelaySend),
                    .init("Click Send", key: "drumClickDelaySend", icon: "smallcircle.filled.circle", value: \.drumClickDelaySend),
                    .init("Beep Hi Send", key: "drumBeepHiDelaySend", icon: "dot.circle", value: \.drumBeepHiDelaySend),
                    .init("Beep Lo Send", key: "drumBeepLoDelaySend", icon: "bell", value: \.drumBeepLoDelaySend),
                    .init("Noise Send", key: "drumNoiseDelaySend", icon: "waveform.path", value: \.drumNoiseDelaySend),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var randomRhythmCard: some View {
        KesshoMacCard(title: "Random Rhythm", symbol: "dice", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Random Drum Generator", symbol: "shuffle", accent: accent, isOn: $appState.state.drumRandomEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Density", key: "drumRandomDensity", icon: "circle.grid.3x3", value: \.drumRandomDensity),
                    .init("Sub", key: "drumRandomSubProb", icon: "circle.fill", value: \.drumRandomSubProb),
                    .init("Kick", key: "drumRandomKickProb", icon: "circle", value: \.drumRandomKickProb),
                    .init("Click", key: "drumRandomClickProb", icon: "smallcircle.filled.circle", value: \.drumRandomClickProb),
                    .init("Beep Hi", key: "drumRandomBeepHiProb", icon: "dot.circle", value: \.drumRandomBeepHiProb),
                    .init("Beep Lo", key: "drumRandomBeepLoProb", icon: "bell", value: \.drumRandomBeepLoProb),
                    .init("Noise", key: "drumRandomNoiseProb", icon: "waveform.path", value: \.drumRandomNoiseProb),
                    .init("Min Interval", key: "drumRandomMinInterval", icon: "timer", value: \.drumRandomMinInterval, range: 20...1_000, style: .milliseconds),
                    .init("Max Interval", key: "drumRandomMaxInterval", icon: "timer.circle", value: \.drumRandomMaxInterval, range: 40...2_000, style: .milliseconds),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var drumVoicesCard: some View {
        KesshoMacCard(title: "Drum Voices", symbol: "dial.high", accent: accent) {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 260), spacing: 10)],
                alignment: .leading,
                spacing: 10
            ) {
                ForEach(DrumVoiceType.allCases, id: \.rawValue) { voice in
                    KesshoMacDrumVoicePanel(voice: voice, accent: accent)
                }
            }
        }
    }

    private var euclideanCard: some View {
        KesshoMacCard(title: "Euclidean Sequencer", symbol: "circle.dotted", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(
                    title: "Euclidean Mode",
                    symbol: "metronome",
                    accent: accent,
                    isOn: Binding(
                        get: { appState.state.drumEuclidMasterEnabled },
                        set: { newValue in
                            var newState = appState.state
                            newState.drumEuclidMasterEnabled = newValue
                            if newValue { newState.drumEnabled = true }
                            if newState != appState.state {
                                appState.state = newState
                            }
                        }
                    )
                )

                HStack(spacing: 8) {
                    divisionPicker
                    Spacer(minLength: 0)
                }

                KesshoMacSliderGrid(specs: [
                    .init("Base BPM", key: "drumEuclidBaseBPM", icon: "metronome", value: \.drumEuclidBaseBPM, range: 40...240, style: .integer),
                    .init("Tempo", key: "drumEuclidTempo", icon: "speedometer", value: \.drumEuclidTempo, range: 0.25...4),
                    .init("Swing", key: "drumEuclidSwing", icon: "arrow.left.and.right", value: \.drumEuclidSwing, range: 0...100, style: .integer),
                ], accent: accent, columns: 3)

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 250), spacing: 10)],
                    alignment: .leading,
                    spacing: 10
                ) {
                    ForEach(1...4, id: \.self) { lane in
                        KesshoMacEuclidLanePanel(lane: lane, accent: accent)
                    }
                }
            }
        }
    }

    private var divisionPicker: some View {
        Picker("Division", selection: $appState.state.drumEuclidDivision) {
            Text("1/4").tag(4)
            Text("1/8").tag(8)
            Text("1/16").tag(16)
            Text("1/32").tag(32)
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 280)
    }

    private func notePicker(_ title: String, selection: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(KesshoMacDesign.mutedText)
            Picker(title, selection: selection) {
                ForEach(["1/2", "1/4", "1/4t", "1/8", "1/8d", "1/8t", "1/16", "1/16d", "1/32"], id: \.self) { note in
                    Text(note).tag(note)
                }
            }
            .pickerStyle(.menu)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct KesshoMacDrumVoicePanel: View {
    @EnvironmentObject private var appState: AppState
    let voice: DrumVoiceType
    let accent: Color

    var body: some View {
        KesshoMacSection(title: title) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Button {
                        if !appState.state.drumEnabled {
                            appState.state.drumEnabled = true
                        }
                        appState.audioEngine.triggerDrumVoice(voice, velocity: 0.8)
                    } label: {
                        Label("Trigger", systemImage: "play.fill")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    Spacer(minLength: 0)

                    Text("\(Int(morphBinding.wrappedValue * 100))%")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(KesshoMacDesign.secondaryText)
                }

                HStack(spacing: 8) {
                    presetPicker("A", selection: presetABinding, key: presetAKey)
                    presetPicker("B", selection: presetBBinding, key: presetBKey)
                }

                voiceModeControls

                Slider(
                    value: Binding(
                        get: { morphBinding.wrappedValue },
                        set: { newValue in
                            morphBinding.wrappedValue = newValue
                            appState.handleDrumMorphChange(voice: voice, morphValue: newValue)
                        }
                    ),
                    in: 0...1
                )
                .tint(accent)

                KesshoMacToggleRow(title: "Auto Morph", symbol: "arrow.triangle.2.circlepath", accent: accent, isOn: morphAutoBinding)
                KesshoMacPickerRow(
                    title: "Morph Mode",
                    symbol: "point.3.connected.trianglepath.dotted",
                    accent: accent,
                    selection: morphModeBinding,
                    options: [
                        ("linear", "Linear"),
                        ("pingpong", "Ping Pong"),
                        ("random", "Random"),
                    ]
                )

                KesshoMacSliderGrid(specs: [
                    .init("Morph Speed", key: morphSpeedKey, icon: "speedometer", value: morphSpeedKeyPath, range: 0.5...32),
                ], accent: accent)

                KesshoMacSliderGrid(specs: specs, accent: accent, columns: 2)
            }
        }
    }

    @ViewBuilder
    private var voiceModeControls: some View {
        switch voice {
        case .click:
            VStack(spacing: 8) {
                KesshoMacPickerRow(
                    title: "Click Mode",
                    symbol: "smallcircle.filled.circle",
                    accent: accent,
                    selection: $appState.state.drumClickMode,
                    options: [
                        ("impulse", "Impulse"),
                        ("noise", "Noise"),
                        ("tonal", "Tonal"),
                        ("granular", "Granular"),
                    ]
                )
                KesshoMacStepperRow(
                    title: "Grains",
                    symbol: "circle.grid.2x2",
                    accent: accent,
                    value: $appState.state.drumClickGrainCount,
                    range: 1...8
                )
            }
        case .beepHi:
            KesshoMacStepperRow(
                title: "Partials",
                symbol: "waveform.path",
                accent: accent,
                value: $appState.state.drumBeepHiPartials,
                range: 1...6
            )
        case .noise:
            KesshoMacPickerRow(
                title: "Filter Type",
                symbol: "line.3.horizontal.decrease",
                accent: accent,
                selection: $appState.state.drumNoiseFilterType,
                options: [
                    ("lowpass", "Lowpass"),
                    ("bandpass", "Bandpass"),
                    ("highpass", "Highpass"),
                ]
            )
        default:
            EmptyView()
        }
    }

    private var title: String {
        switch voice {
        case .sub: return "Sub"
        case .kick: return "Kick"
        case .click: return "Click"
        case .beepHi: return "Beep Hi"
        case .beepLo: return "Beep Lo"
        case .noise: return "Noise"
        }
    }

    private var specs: [KesshoMacSliderSpec] {
        switch voice {
        case .sub:
            return [
                .init("Freq", key: "drumSubFreq", icon: "waveform", value: \.drumSubFreq, range: 20...160, style: .hertz),
                .init("Decay", key: "drumSubDecay", icon: "timer", value: \.drumSubDecay, range: 10...1_000, style: .milliseconds),
                .init("Level", key: "drumSubLevel", icon: "speaker.wave.2", value: \.drumSubLevel),
                .init("Tone", key: "drumSubTone", icon: "slider.horizontal.3", value: \.drumSubTone),
                .init("Shape", key: "drumSubShape", icon: "waveform.path", value: \.drumSubShape),
                .init("Pitch Env", key: "drumSubPitchEnv", icon: "arrow.up.right", value: \.drumSubPitchEnv, range: -48...48, style: .integer),
                .init("Pitch Decay", key: "drumSubPitchDecay", icon: "timer", value: \.drumSubPitchDecay, range: 5...500, style: .milliseconds),
                .init("Drive", key: "drumSubDrive", icon: "flame", value: \.drumSubDrive),
                .init("Sub Oct", key: "drumSubSub", icon: "circle.circle", value: \.drumSubSub),
            ]
        case .kick:
            return [
                .init("Freq", key: "drumKickFreq", icon: "waveform", value: \.drumKickFreq, range: 30...180, style: .hertz),
                .init("Pitch Env", key: "drumKickPitchEnv", icon: "arrow.up.right", value: \.drumKickPitchEnv, range: -48...48, style: .integer),
                .init("Pitch Decay", key: "drumKickPitchDecay", icon: "timer", value: \.drumKickPitchDecay, range: 5...500, style: .milliseconds),
                .init("Decay", key: "drumKickDecay", icon: "timer.circle", value: \.drumKickDecay, range: 20...1_200, style: .milliseconds),
                .init("Level", key: "drumKickLevel", icon: "speaker.wave.2", value: \.drumKickLevel),
                .init("Click", key: "drumKickClick", icon: "smallcircle.filled.circle", value: \.drumKickClick),
                .init("Body", key: "drumKickBody", icon: "circle.circle", value: \.drumKickBody),
                .init("Punch", key: "drumKickPunch", icon: "bolt", value: \.drumKickPunch),
                .init("Tail", key: "drumKickTail", icon: "waveform.path.ecg", value: \.drumKickTail),
                .init("Tone", key: "drumKickTone", icon: "slider.horizontal.3", value: \.drumKickTone),
            ]
        case .click:
            return [
                .init("Decay", key: "drumClickDecay", icon: "timer", value: \.drumClickDecay, range: 1...200, style: .milliseconds),
                .init("Filter", key: "drumClickFilter", icon: "line.3.horizontal.decrease", value: \.drumClickFilter, range: 200...12_000, style: .hertz),
                .init("Tone", key: "drumClickTone", icon: "slider.horizontal.3", value: \.drumClickTone),
                .init("Resonance", key: "drumClickResonance", icon: "dot.radiowaves.left.and.right", value: \.drumClickResonance),
                .init("Level", key: "drumClickLevel", icon: "speaker.wave.2", value: \.drumClickLevel),
                .init("Pitch", key: "drumClickPitch", icon: "waveform", value: \.drumClickPitch, range: 200...8_000, style: .hertz),
                .init("Pitch Env", key: "drumClickPitchEnv", icon: "arrow.up.right", value: \.drumClickPitchEnv, range: -48...48, style: .integer),
                .init("Grain Spread", key: "drumClickGrainSpread", icon: "arrow.left.and.right", value: \.drumClickGrainSpread, range: 0...50, style: .milliseconds),
                .init("Stereo", key: "drumClickStereoWidth", icon: "rectangle.split.2x1", value: \.drumClickStereoWidth),
            ]
        case .beepHi:
            return [
                .init("Freq", key: "drumBeepHiFreq", icon: "waveform", value: \.drumBeepHiFreq, range: 500...8_000, style: .hertz),
                .init("Attack", key: "drumBeepHiAttack", icon: "arrow.up.right", value: \.drumBeepHiAttack, range: 0...100, style: .milliseconds),
                .init("Decay", key: "drumBeepHiDecay", icon: "timer", value: \.drumBeepHiDecay, range: 10...1_500, style: .milliseconds),
                .init("Tone", key: "drumBeepHiTone", icon: "slider.horizontal.3", value: \.drumBeepHiTone),
                .init("Level", key: "drumBeepHiLevel", icon: "speaker.wave.2", value: \.drumBeepHiLevel),
                .init("Inharmonic", key: "drumBeepHiInharmonic", icon: "sparkles", value: \.drumBeepHiInharmonic),
                .init("Shimmer", key: "drumBeepHiShimmer", icon: "wand.and.stars", value: \.drumBeepHiShimmer),
                .init("Shim Rate", key: "drumBeepHiShimmerRate", icon: "speedometer", value: \.drumBeepHiShimmerRate, range: 0.5...12),
                .init("Brightness", key: "drumBeepHiBrightness", icon: "sun.max", value: \.drumBeepHiBrightness),
            ]
        case .beepLo:
            return [
                .init("Freq", key: "drumBeepLoFreq", icon: "waveform", value: \.drumBeepLoFreq, range: 80...2_000, style: .hertz),
                .init("Attack", key: "drumBeepLoAttack", icon: "arrow.up.right", value: \.drumBeepLoAttack, range: 0...100, style: .milliseconds),
                .init("Decay", key: "drumBeepLoDecay", icon: "timer", value: \.drumBeepLoDecay, range: 10...1_500, style: .milliseconds),
                .init("Tone", key: "drumBeepLoTone", icon: "slider.horizontal.3", value: \.drumBeepLoTone),
                .init("Level", key: "drumBeepLoLevel", icon: "speaker.wave.2", value: \.drumBeepLoLevel),
                .init("Pitch Env", key: "drumBeepLoPitchEnv", icon: "arrow.up.right", value: \.drumBeepLoPitchEnv, range: -48...48, style: .integer),
                .init("Pitch Decay", key: "drumBeepLoPitchDecay", icon: "timer", value: \.drumBeepLoPitchDecay, range: 5...500, style: .milliseconds),
                .init("Body", key: "drumBeepLoBody", icon: "circle.circle", value: \.drumBeepLoBody),
                .init("Pluck", key: "drumBeepLoPluck", icon: "guitars", value: \.drumBeepLoPluck),
                .init("Damp", key: "drumBeepLoPluckDamp", icon: "line.3.horizontal.decrease", value: \.drumBeepLoPluckDamp),
            ]
        case .noise:
            return [
                .init("Filter", key: "drumNoiseFilterFreq", icon: "line.3.horizontal.decrease", value: \.drumNoiseFilterFreq, range: 200...18_000, style: .hertz),
                .init("Q", key: "drumNoiseFilterQ", icon: "q.circle", value: \.drumNoiseFilterQ, range: 0.1...12),
                .init("Attack", key: "drumNoiseAttack", icon: "arrow.up.right", value: \.drumNoiseAttack, range: 0...200, style: .milliseconds),
                .init("Decay", key: "drumNoiseDecay", icon: "timer", value: \.drumNoiseDecay, range: 5...1_500, style: .milliseconds),
                .init("Level", key: "drumNoiseLevel", icon: "speaker.wave.2", value: \.drumNoiseLevel),
                .init("Formant", key: "drumNoiseFormant", icon: "mouth", value: \.drumNoiseFormant),
                .init("Breath", key: "drumNoiseBreath", icon: "wind", value: \.drumNoiseBreath),
                .init("Env", key: "drumNoiseFilterEnv", icon: "arrow.up.and.down", value: \.drumNoiseFilterEnv, range: -1...1),
                .init("Env Decay", key: "drumNoiseFilterEnvDecay", icon: "timer", value: \.drumNoiseFilterEnvDecay, range: 5...2_000, style: .milliseconds),
                .init("Density", key: "drumNoiseDensity", icon: "circle.grid.3x3", value: \.drumNoiseDensity),
                .init("Color LFO", key: "drumNoiseColorLFO", icon: "waveform.path", value: \.drumNoiseColorLFO, range: 0...10),
            ]
        }
    }

    private var morphBinding: Binding<Double> {
        switch voice {
        case .sub: return $appState.state.drumSubMorph
        case .kick: return $appState.state.drumKickMorph
        case .click: return $appState.state.drumClickMorph
        case .beepHi: return $appState.state.drumBeepHiMorph
        case .beepLo: return $appState.state.drumBeepLoMorph
        case .noise: return $appState.state.drumNoiseMorph
        }
    }

    private var morphAutoBinding: Binding<Bool> {
        switch voice {
        case .sub: return $appState.state.drumSubMorphAuto
        case .kick: return $appState.state.drumKickMorphAuto
        case .click: return $appState.state.drumClickMorphAuto
        case .beepHi: return $appState.state.drumBeepHiMorphAuto
        case .beepLo: return $appState.state.drumBeepLoMorphAuto
        case .noise: return $appState.state.drumNoiseMorphAuto
        }
    }

    private var morphModeBinding: Binding<String> {
        switch voice {
        case .sub: return $appState.state.drumSubMorphMode
        case .kick: return $appState.state.drumKickMorphMode
        case .click: return $appState.state.drumClickMorphMode
        case .beepHi: return $appState.state.drumBeepHiMorphMode
        case .beepLo: return $appState.state.drumBeepLoMorphMode
        case .noise: return $appState.state.drumNoiseMorphMode
        }
    }

    private var morphSpeedKey: String {
        switch voice {
        case .sub: return "drumSubMorphSpeed"
        case .kick: return "drumKickMorphSpeed"
        case .click: return "drumClickMorphSpeed"
        case .beepHi: return "drumBeepHiMorphSpeed"
        case .beepLo: return "drumBeepLoMorphSpeed"
        case .noise: return "drumNoiseMorphSpeed"
        }
    }

    private var morphSpeedKeyPath: KeyPath<SliderState, Double> {
        switch voice {
        case .sub: return \.drumSubMorphSpeed
        case .kick: return \.drumKickMorphSpeed
        case .click: return \.drumClickMorphSpeed
        case .beepHi: return \.drumBeepHiMorphSpeed
        case .beepLo: return \.drumBeepLoMorphSpeed
        case .noise: return \.drumNoiseMorphSpeed
        }
    }

    private var presetABinding: Binding<String> {
        switch voice {
        case .sub: return $appState.state.drumSubPresetA
        case .kick: return $appState.state.drumKickPresetA
        case .click: return $appState.state.drumClickPresetA
        case .beepHi: return $appState.state.drumBeepHiPresetA
        case .beepLo: return $appState.state.drumBeepLoPresetA
        case .noise: return $appState.state.drumNoisePresetA
        }
    }

    private var presetBBinding: Binding<String> {
        switch voice {
        case .sub: return $appState.state.drumSubPresetB
        case .kick: return $appState.state.drumKickPresetB
        case .click: return $appState.state.drumClickPresetB
        case .beepHi: return $appState.state.drumBeepHiPresetB
        case .beepLo: return $appState.state.drumBeepLoPresetB
        case .noise: return $appState.state.drumNoisePresetB
        }
    }

    private var presetAKey: String {
        switch voice {
        case .sub: return "drumSubPresetA"
        case .kick: return "drumKickPresetA"
        case .click: return "drumClickPresetA"
        case .beepHi: return "drumBeepHiPresetA"
        case .beepLo: return "drumBeepLoPresetA"
        case .noise: return "drumNoisePresetA"
        }
    }

    private var presetBKey: String {
        switch voice {
        case .sub: return "drumSubPresetB"
        case .kick: return "drumKickPresetB"
        case .click: return "drumClickPresetB"
        case .beepHi: return "drumBeepHiPresetB"
        case .beepLo: return "drumBeepLoPresetB"
        case .noise: return "drumNoisePresetB"
        }
    }

    private func presetPicker(_ label: String, selection: Binding<String>, key: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(KesshoMacDesign.mutedText)
            Picker(label, selection: Binding(
                get: { selection.wrappedValue },
                set: { newValue in
                    selection.wrappedValue = newValue
                    appState.handleDrumPresetChange(key: key)
                }
            )) {
                ForEach(getPresetNames(voice: voice), id: \.self) { name in
                    Text(name).tag(name)
                }
            }
            .pickerStyle(.menu)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct KesshoMacEuclidLanePanel: View {
    @EnvironmentObject private var appState: AppState
    let lane: Int
    let accent: Color

    var body: some View {
        KesshoMacSection(title: "Lane \(lane)") {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Enabled", symbol: "power", accent: accent, isOn: enabled)

                EuclideanPatternView(
                    steps: max(1, stepsValue),
                    hits: min(max(0, hitsValue), max(1, stepsValue)),
                    rotation: rotationValue,
                    color: accent
                )
                .frame(height: 28)

                Picker("Preset", selection: preset) {
                    ForEach(Self.presetKeys, id: \.self) { key in
                        Text(key).tag(key)
                    }
                }
                .pickerStyle(.menu)

                KesshoMacSliderGrid(specs: specs, accent: accent, columns: 2)

                LazyVGrid(
                    columns: [GridItem(.flexible()), GridItem(.flexible())],
                    alignment: .leading,
                    spacing: 2
                ) {
                    KesshoMacToggleRow(title: "Sub", symbol: "circle.fill", accent: accent, isOn: targetSub)
                    KesshoMacToggleRow(title: "Kick", symbol: "circle", accent: accent, isOn: targetKick)
                    KesshoMacToggleRow(title: "Click", symbol: "smallcircle.filled.circle", accent: accent, isOn: targetClick)
                    KesshoMacToggleRow(title: "Hi", symbol: "dot.circle", accent: accent, isOn: targetBeepHi)
                    KesshoMacToggleRow(title: "Lo", symbol: "bell", accent: accent, isOn: targetBeepLo)
                    KesshoMacToggleRow(title: "Noise", symbol: "waveform.path", accent: accent, isOn: targetNoise)
                }
            }
        }
    }

    private static let presetKeys = [
        "custom", "lancaran", "ketawang", "ladrang", "gangsaran", "kotekan",
        "kotekan2", "srepegan", "sampak", "ayak", "bonang", "sparse", "dense", "longSparse"
    ]

    private var specs: [KesshoMacSliderSpec] {
        switch lane {
        case 1:
            return [
                .init("Steps", key: "drumEuclid1Steps", icon: "square.grid.3x3", value: \.drumEuclid1StepsDouble, range: 1...32, style: .integer),
                .init("Hits", key: "drumEuclid1Hits", icon: "circle.grid.cross", value: \.drumEuclid1HitsDouble, range: 0...32, style: .integer),
                .init("Rotation", key: "drumEuclid1Rotation", icon: "rotate.right", value: \.drumEuclid1RotationDouble, range: 0...32, style: .integer),
                .init("Probability", key: "drumEuclid1Probability", icon: "dice", value: \.drumEuclid1Probability),
                .init("Vel Min", key: "drumEuclid1VelocityMin", icon: "speaker.wave.1", value: \.drumEuclid1VelocityMin),
                .init("Vel Max", key: "drumEuclid1VelocityMax", icon: "speaker.wave.2", value: \.drumEuclid1VelocityMax),
                .init("Level", key: "drumEuclid1Level", icon: "slider.horizontal.3", value: \.drumEuclid1Level),
            ]
        case 2:
            return [
                .init("Steps", key: "drumEuclid2Steps", icon: "square.grid.3x3", value: \.drumEuclid2StepsDouble, range: 1...32, style: .integer),
                .init("Hits", key: "drumEuclid2Hits", icon: "circle.grid.cross", value: \.drumEuclid2HitsDouble, range: 0...32, style: .integer),
                .init("Rotation", key: "drumEuclid2Rotation", icon: "rotate.right", value: \.drumEuclid2RotationDouble, range: 0...32, style: .integer),
                .init("Probability", key: "drumEuclid2Probability", icon: "dice", value: \.drumEuclid2Probability),
                .init("Vel Min", key: "drumEuclid2VelocityMin", icon: "speaker.wave.1", value: \.drumEuclid2VelocityMin),
                .init("Vel Max", key: "drumEuclid2VelocityMax", icon: "speaker.wave.2", value: \.drumEuclid2VelocityMax),
                .init("Level", key: "drumEuclid2Level", icon: "slider.horizontal.3", value: \.drumEuclid2Level),
            ]
        case 3:
            return [
                .init("Steps", key: "drumEuclid3Steps", icon: "square.grid.3x3", value: \.drumEuclid3StepsDouble, range: 1...32, style: .integer),
                .init("Hits", key: "drumEuclid3Hits", icon: "circle.grid.cross", value: \.drumEuclid3HitsDouble, range: 0...32, style: .integer),
                .init("Rotation", key: "drumEuclid3Rotation", icon: "rotate.right", value: \.drumEuclid3RotationDouble, range: 0...32, style: .integer),
                .init("Probability", key: "drumEuclid3Probability", icon: "dice", value: \.drumEuclid3Probability),
                .init("Vel Min", key: "drumEuclid3VelocityMin", icon: "speaker.wave.1", value: \.drumEuclid3VelocityMin),
                .init("Vel Max", key: "drumEuclid3VelocityMax", icon: "speaker.wave.2", value: \.drumEuclid3VelocityMax),
                .init("Level", key: "drumEuclid3Level", icon: "slider.horizontal.3", value: \.drumEuclid3Level),
            ]
        default:
            return [
                .init("Steps", key: "drumEuclid4Steps", icon: "square.grid.3x3", value: \.drumEuclid4StepsDouble, range: 1...32, style: .integer),
                .init("Hits", key: "drumEuclid4Hits", icon: "circle.grid.cross", value: \.drumEuclid4HitsDouble, range: 0...32, style: .integer),
                .init("Rotation", key: "drumEuclid4Rotation", icon: "rotate.right", value: \.drumEuclid4RotationDouble, range: 0...32, style: .integer),
                .init("Probability", key: "drumEuclid4Probability", icon: "dice", value: \.drumEuclid4Probability),
                .init("Vel Min", key: "drumEuclid4VelocityMin", icon: "speaker.wave.1", value: \.drumEuclid4VelocityMin),
                .init("Vel Max", key: "drumEuclid4VelocityMax", icon: "speaker.wave.2", value: \.drumEuclid4VelocityMax),
                .init("Level", key: "drumEuclid4Level", icon: "slider.horizontal.3", value: \.drumEuclid4Level),
            ]
        }
    }

    private var enabled: Binding<Bool> {
        switch lane {
        case 1: return $appState.state.drumEuclid1Enabled
        case 2: return $appState.state.drumEuclid2Enabled
        case 3: return $appState.state.drumEuclid3Enabled
        default: return $appState.state.drumEuclid4Enabled
        }
    }

    private var stepsValue: Int {
        switch lane {
        case 1: return appState.state.drumEuclid1Steps
        case 2: return appState.state.drumEuclid2Steps
        case 3: return appState.state.drumEuclid3Steps
        default: return appState.state.drumEuclid4Steps
        }
    }

    private var hitsValue: Int {
        switch lane {
        case 1: return appState.state.drumEuclid1Hits
        case 2: return appState.state.drumEuclid2Hits
        case 3: return appState.state.drumEuclid3Hits
        default: return appState.state.drumEuclid4Hits
        }
    }

    private var rotationValue: Int {
        switch lane {
        case 1: return appState.state.drumEuclid1Rotation
        case 2: return appState.state.drumEuclid2Rotation
        case 3: return appState.state.drumEuclid3Rotation
        default: return appState.state.drumEuclid4Rotation
        }
    }

    private var preset: Binding<String> {
        switch lane {
        case 1: return $appState.state.drumEuclid1Preset
        case 2: return $appState.state.drumEuclid2Preset
        case 3: return $appState.state.drumEuclid3Preset
        default: return $appState.state.drumEuclid4Preset
        }
    }

    private var targetSub: Binding<Bool> {
        switch lane {
        case 1: return $appState.state.drumEuclid1TargetSub
        case 2: return $appState.state.drumEuclid2TargetSub
        case 3: return $appState.state.drumEuclid3TargetSub
        default: return $appState.state.drumEuclid4TargetSub
        }
    }

    private var targetKick: Binding<Bool> {
        switch lane {
        case 1: return $appState.state.drumEuclid1TargetKick
        case 2: return $appState.state.drumEuclid2TargetKick
        case 3: return $appState.state.drumEuclid3TargetKick
        default: return $appState.state.drumEuclid4TargetKick
        }
    }

    private var targetClick: Binding<Bool> {
        switch lane {
        case 1: return $appState.state.drumEuclid1TargetClick
        case 2: return $appState.state.drumEuclid2TargetClick
        case 3: return $appState.state.drumEuclid3TargetClick
        default: return $appState.state.drumEuclid4TargetClick
        }
    }

    private var targetBeepHi: Binding<Bool> {
        switch lane {
        case 1: return $appState.state.drumEuclid1TargetBeepHi
        case 2: return $appState.state.drumEuclid2TargetBeepHi
        case 3: return $appState.state.drumEuclid3TargetBeepHi
        default: return $appState.state.drumEuclid4TargetBeepHi
        }
    }

    private var targetBeepLo: Binding<Bool> {
        switch lane {
        case 1: return $appState.state.drumEuclid1TargetBeepLo
        case 2: return $appState.state.drumEuclid2TargetBeepLo
        case 3: return $appState.state.drumEuclid3TargetBeepLo
        default: return $appState.state.drumEuclid4TargetBeepLo
        }
    }

    private var targetNoise: Binding<Bool> {
        switch lane {
        case 1: return $appState.state.drumEuclid1TargetNoise
        case 2: return $appState.state.drumEuclid2TargetNoise
        case 3: return $appState.state.drumEuclid3TargetNoise
        default: return $appState.state.drumEuclid4TargetNoise
        }
    }
}

private struct KesshoMacEarthPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .earth)

    var body: some View {
        KesshoMacPageFrame(page: .earth) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    activeEarthMatrixCard
                    oceanCard
                    waterCard
                    waterLayersCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    natureCard
                    insectsCard
                }
            }
        }
    }

    private var activeEarthMatrixCard: some View {
        KesshoMacCard(title: "Active Earth Matrix", symbol: "square.grid.3x3", accent: accent) {
            VStack(spacing: 10) {
                LazyVGrid(
                    columns: [GridItem(.flexible()), GridItem(.flexible())],
                    spacing: 8
                ) {
                    earthSourceChip(
                        title: "Waves",
                        symbol: "water.waves",
                        isActive: appState.state.oceanSampleEnabled,
                        action: toggleWaves
                    )
                    earthSourceChip(
                        title: "Water",
                        symbol: "drop",
                        isActive: appState.state.waterEnabled,
                        action: toggleWater
                    )
                    earthSourceChip(
                        title: "Nature",
                        symbol: "leaf",
                        isActive: appState.state.birdsEnabled || appState.state.birds2Enabled || appState.state.frogsEnabled,
                        action: toggleNature
                    )
                    earthSourceChip(
                        title: "Insects",
                        symbol: "antenna.radiowaves.left.and.right",
                        isActive: appState.state.insectsEnabled || appState.state.insects2Enabled,
                        action: toggleInsects
                    )
                }

                KesshoMacSliderGrid(specs: [
                    .init("Earth Bus", key: "earthLevel", icon: "globe", value: \.earthLevel),
                    .init("Nature Bus", key: "natureLevel", icon: "leaf", value: \.natureLevel),
                    .init("Insect Bus", key: "insectsSharedLevel", icon: "antenna.radiowaves.left.and.right", value: \.insectsSharedLevel),
                    .init("Water Bus", key: "waterLevel", icon: "drop", value: \.waterLevel),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var oceanCard: some View {
        KesshoMacCard(title: "Ocean", symbol: "water.waves", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Ocean Samples", symbol: "power", accent: accent, isOn: $appState.state.oceanSampleEnabled)
                KesshoMacToggleRow(title: "Wave Synth", symbol: "waveform", accent: accent, isOn: $appState.state.oceanWaveSynthEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Ocean Level", key: "oceanSampleLevel", icon: "water.waves", value: \.oceanSampleLevel),
                    .init("Wave Synth", key: "oceanWaveSynthLevel", icon: "waveform", value: \.oceanWaveSynthLevel),
                    .init("Reverb", key: "oceanReverbSend", icon: "diamond", value: \.oceanReverbSend),
                    .init("Delay A", key: "oceanDelayASend", icon: "repeat", value: \.oceanDelayASend),
                    .init("Delay B", key: "oceanDelayBSend", icon: "repeat.circle", value: \.oceanDelayBSend),
                    .init("Slice Duration", key: "oceanSliceDuration", icon: "timer", value: \.oceanSliceDuration, range: 2...60, style: .seconds),
                    .init("Slice Density", key: "oceanSliceDensity", icon: "square.grid.3x3", value: \.oceanSliceDensity),
                    .init("Filter", key: "oceanFilterCutoff", icon: "line.3.horizontal.decrease", value: \.oceanFilterCutoff, range: 200...18_000, style: .hertz),
                    .init("Resonance", key: "oceanFilterResonance", icon: "dot.radiowaves.left.and.right", value: \.oceanFilterResonance),
                    .init("Duration Min", key: "oceanDurationMin", icon: "arrow.down.left.and.arrow.up.right", value: \.oceanDurationMin, range: 1...30, style: .seconds),
                    .init("Duration Max", key: "oceanDurationMax", icon: "arrow.up.left.and.arrow.down.right", value: \.oceanDurationMax, range: 2...45, style: .seconds),
                    .init("Interval Min", key: "oceanIntervalMin", icon: "clock", value: \.oceanIntervalMin, range: 1...45, style: .seconds),
                    .init("Interval Max", key: "oceanIntervalMax", icon: "clock.badge", value: \.oceanIntervalMax, range: 2...60, style: .seconds),
                    .init("Foam Min", key: "oceanFoamMin", icon: "cloud", value: \.oceanFoamMin),
                    .init("Foam Max", key: "oceanFoamMax", icon: "cloud.fill", value: \.oceanFoamMax),
                    .init("Depth Min", key: "oceanDepthMin", icon: "arrow.down", value: \.oceanDepthMin),
                    .init("Depth Max", key: "oceanDepthMax", icon: "arrow.down.circle", value: \.oceanDepthMax),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var waterCard: some View {
        KesshoMacCard(title: "Water Body", symbol: "drop", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Water Engine", symbol: "power", accent: accent, isOn: $appState.state.waterEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Level", key: "waterLevel", icon: "speaker.wave.2", value: \.waterLevel),
                    .init("Intensity", key: "waterIntensity", icon: "drop.degreesign", value: \.waterIntensity),
                    .init("Distance", key: "waterDistance", icon: "arrow.up.left.and.down.right.magnifyingglass", value: \.waterDistance),
                    .init("Base Freq", key: "waterBaseFreq", icon: "waveform", value: \.waterBaseFreq, range: 200...8_000, style: .hertz),
                    .init("Drop Size", key: "waterDropSize", icon: "drop.circle", value: \.waterDropSize),
                    .init("Hardness", key: "waterHardness", icon: "hammer", value: \.waterHardness),
                    .init("Glass", key: "waterGlassThickness", icon: "square.on.square", value: \.waterGlassThickness),
                    .init("Reverb", key: "waterReverbSend", icon: "diamond", value: \.waterReverbSend),
                    .init("Delay A", key: "waterDelayASend", icon: "repeat", value: \.waterDelayASend),
                    .init("Delay B", key: "waterDelayBSend", icon: "repeat.circle", value: \.waterDelayBSend),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var waterLayersCard: some View {
        KesshoMacCard(title: "Water Layers", symbol: "square.3.layers.3d", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacSection(title: "Layer Levels") {
                    KesshoMacSliderGrid(specs: [
                        .init("Hard Drops", key: "waterLayerHardDrops", icon: "drop.triangle", value: \.waterLayerHardDrops),
                        .init("Water Drops", key: "waterLayerWaterDrops", icon: "drop", value: \.waterLayerWaterDrops),
                        .init("Bubbling", key: "waterLayerBubbling", icon: "circle.grid.2x2", value: \.waterLayerBubbling),
                        .init("Turbulence", key: "waterLayerTurbulence", icon: "tornado", value: \.waterLayerTurbulence),
                        .init("Surf", key: "waterLayerSurf", icon: "water.waves", value: \.waterLayerSurf),
                    ], accent: accent, columns: 2)
                }

                KesshoMacSection(title: "Hard Drops") {
                    KesshoMacSliderGrid(specs: [
                        .init("Base Freq", key: "waterHardDropBaseFreq", icon: "waveform", value: \.waterHardDropBaseFreq, range: 100...8_000, style: .hertz),
                        .init("Event Rate", key: "waterHardDropRate", icon: "metronome", value: \.waterHardDropRate, range: 0...2),
                        .init("Low Pass", key: "waterHardDropLPF", icon: "line.3.horizontal.decrease", value: \.waterHardDropLPF, range: 50...16_000, style: .hertz),
                        .init("Character", key: "waterHardDropTone", icon: "dial.medium", value: \.waterHardDropTone),
                        .init("Hardness", key: "waterHardness", icon: "hammer", value: \.waterHardness),
                    ], accent: accent, columns: 2)
                }

                KesshoMacSection(title: "Water Drops") {
                    KesshoMacSliderGrid(specs: [
                        .init("Base Freq", key: "waterWaterDropBaseFreq", icon: "waveform", value: \.waterWaterDropBaseFreq, range: 100...8_000, style: .hertz),
                        .init("Event Rate", key: "waterWaterDropRate", icon: "metronome", value: \.waterWaterDropRate, range: 0...2),
                        .init("Low Pass", key: "waterWaterDropLPF", icon: "line.3.horizontal.decrease", value: \.waterWaterDropLPF, range: 50...16_000, style: .hertz),
                        .init("Drop Size", key: "waterDropSize", icon: "drop.circle", value: \.waterDropSize),
                    ], accent: accent, columns: 2)
                }

                KesshoMacSection(title: "Bubbling") {
                    KesshoMacSliderGrid(specs: [
                        .init("Event Rate", key: "waterBubblingRate", icon: "metronome", value: \.waterBubblingRate, range: 0...2),
                        .init("Low Pass", key: "waterBubblingLPF", icon: "line.3.horizontal.decrease", value: \.waterBubblingLPF, range: 50...8_000, style: .hertz),
                    ], accent: accent, columns: 2)
                }

                KesshoMacSection(title: "Surf") {
                    KesshoMacSliderGrid(specs: [
                        .init("Duration", key: "waterSurfDuration", icon: "timer", value: \.waterSurfDuration, range: 2...20, style: .seconds),
                        .init("Interval", key: "waterSurfInterval", icon: "clock", value: \.waterSurfInterval, range: 3...25, style: .seconds),
                        .init("Foam", key: "waterSurfFoam", icon: "cloud", value: \.waterSurfFoam),
                        .init("Foam Bright", key: "waterSurfFoamBright", icon: "sparkle", value: \.waterSurfFoamBright),
                        .init("Proximity", key: "waterSurfProximity", icon: "dot.viewfinder", value: \.waterSurfProximity),
                        .init("Depth", key: "waterSurfDepth", icon: "arrow.down", value: \.waterSurfDepth),
                        .init("Body Freq", key: "waterSurfBody", icon: "waveform", value: \.waterSurfBody, range: 150...800, style: .hertz),
                        .init("Spray Freq", key: "waterSurfSpray", icon: "water.waves", value: \.waterSurfSpray, range: 2_000...8_000, style: .hertz),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }

    private var natureCard: some View {
        KesshoMacCard(title: "Nature Beds", symbol: "leaf", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Birds", symbol: "bird", accent: accent, isOn: $appState.state.birdsEnabled)
                KesshoMacToggleRow(title: "Birds 2", symbol: "bird.fill", accent: accent, isOn: $appState.state.birds2Enabled)
                KesshoMacToggleRow(title: "Frogs", symbol: "speaker.wave.1", accent: accent, isOn: $appState.state.frogsEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Nature Bus", key: "natureLevel", icon: "leaf", value: \.natureLevel),
                    .init("Nature Reverb", key: "natureReverbSend", icon: "diamond", value: \.natureReverbSend),
                    .init("Nature Delay A", key: "natureDelayASend", icon: "repeat", value: \.natureDelayASend),
                    .init("Nature Delay B", key: "natureDelayBSend", icon: "repeat.circle", value: \.natureDelayBSend),
                    .init("Birds Level", key: "birdsLevel", icon: "bird", value: \.birdsLevel),
                    .init("Birds Reverb", key: "birdsReverbSend", icon: "diamond", value: \.birdsReverbSend),
                    .init("Birds Delay A", key: "birdsDelayASend", icon: "repeat", value: \.birdsDelayASend),
                    .init("Birds Delay B", key: "birdsDelayBSend", icon: "repeat.circle", value: \.birdsDelayBSend),
                    .init("Birds Slice", key: "birdsSliceDuration", icon: "timer", value: \.birdsSliceDuration, range: 2...60, style: .seconds),
                    .init("Birds Density", key: "birdsSliceDensity", icon: "square.grid.3x3", value: \.birdsSliceDensity),
                    .init("Birds 2 Level", key: "birds2Level", icon: "bird.fill", value: \.birds2Level),
                    .init("Birds 2 Reverb", key: "birds2ReverbSend", icon: "diamond", value: \.birds2ReverbSend),
                    .init("Birds 2 Delay A", key: "birds2DelayASend", icon: "repeat", value: \.birds2DelayASend),
                    .init("Birds 2 Delay B", key: "birds2DelayBSend", icon: "repeat.circle", value: \.birds2DelayBSend),
                    .init("Birds 2 Slice", key: "birds2SliceDuration", icon: "timer", value: \.birds2SliceDuration, range: 2...60, style: .seconds),
                    .init("Birds 2 Density", key: "birds2SliceDensity", icon: "square.grid.3x3", value: \.birds2SliceDensity),
                    .init("Frogs Level", key: "frogsLevel", icon: "speaker.wave.1", value: \.frogsLevel),
                    .init("Frogs Reverb", key: "frogsReverbSend", icon: "diamond", value: \.frogsReverbSend),
                    .init("Frogs Delay A", key: "frogsDelayASend", icon: "repeat", value: \.frogsDelayASend),
                    .init("Frogs Delay B", key: "frogsDelayBSend", icon: "repeat.circle", value: \.frogsDelayBSend),
                    .init("Frogs Slice", key: "frogsSliceDuration", icon: "timer", value: \.frogsSliceDuration, range: 2...60, style: .seconds),
                    .init("Frogs Density", key: "frogsSliceDensity", icon: "square.grid.3x3", value: \.frogsSliceDensity),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var insectsCard: some View {
        KesshoMacCard(title: "Insects", symbol: "antenna.radiowaves.left.and.right", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Insect Engine 1", symbol: "power", accent: accent, isOn: $appState.state.insectsEnabled)
                KesshoMacToggleRow(title: "Insect Engine 2", symbol: "power.circle", accent: accent, isOn: $appState.state.insects2Enabled)
                KesshoMacSliderGrid(specs: [
                    .init("Shared Level", key: "insectsSharedLevel", icon: "speaker.wave.2", value: \.insectsSharedLevel),
                    .init("Reverb", key: "insectsReverbSend", icon: "diamond", value: \.insectsReverbSend),
                    .init("Delay A", key: "insDelayASend", icon: "repeat", value: \.insDelayASend),
                    .init("Delay B", key: "insDelayBSend", icon: "repeat.circle", value: \.insDelayBSend),
                    .init("Level 1", key: "insectsLevel", icon: "speaker.wave.1", value: \.insectsLevel),
                    .init("Density 1", key: "insectsDensity", icon: "circle.grid.3x3", value: \.insectsDensity),
                    .init("Temp 1", key: "insectsTemperature", icon: "thermometer.medium", value: \.insectsTemperature),
                    .init("Distance 1", key: "insectsDistance", icon: "arrow.up.left.and.down.right.magnifyingglass", value: \.insectsDistance),
                    .init("Proximity 1", key: "insectsProximity", icon: "dot.viewfinder", value: \.insectsProximity),
                    .init("Antiphony 1", key: "insectsAntiphony", icon: "arrow.left.arrow.right", value: \.insectsAntiphony),
                    .init("Click Rate 1", key: "insectsClickRate", icon: "metronome", value: \.insectsClickRate),
                    .init("Motion 1", key: "insectsMotion", icon: "waveform.path", value: \.insectsMotion),
                    .init("Level 2", key: "insects2Level", icon: "speaker.wave.1", value: \.insects2Level),
                    .init("Density 2", key: "insects2Density", icon: "circle.grid.3x3", value: \.insects2Density),
                    .init("Temp 2", key: "insects2Temperature", icon: "thermometer.medium", value: \.insects2Temperature),
                    .init("Distance 2", key: "insects2Distance", icon: "arrow.up.left.and.down.right.magnifyingglass", value: \.insects2Distance),
                    .init("Proximity 2", key: "insects2Proximity", icon: "dot.viewfinder", value: \.insects2Proximity),
                    .init("Antiphony 2", key: "insects2Antiphony", icon: "arrow.left.arrow.right", value: \.insects2Antiphony),
                    .init("Click Rate 2", key: "insects2ClickRate", icon: "metronome", value: \.insects2ClickRate),
                    .init("Motion 2", key: "insects2Motion", icon: "waveform.path", value: \.insects2Motion),
                ], accent: accent, columns: 2)
            }
        }
    }

    private func earthSourceChip(title: String, symbol: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 13, weight: .semibold))
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                Spacer()
                Circle()
                    .fill(isActive ? KesshoMacDesign.green : KesshoMacDesign.mutedText)
                    .frame(width: 7, height: 7)
            }
            .foregroundStyle(isActive ? KesshoMacDesign.text : KesshoMacDesign.secondaryText)
            .padding(.horizontal, 9)
            .padding(.vertical, 8)
            .background(isActive ? accent.opacity(0.18) : KesshoMacDesign.control)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .stroke(isActive ? accent.opacity(0.55) : KesshoMacDesign.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private func toggleWaves() {
        appState.state.oceanSampleEnabled.toggle()
        if appState.state.oceanSampleEnabled && appState.state.oceanSampleLevel < 0.05 {
            appState.state.oceanSampleLevel = 0.5
        }
    }

    private func toggleWater() {
        appState.state.waterEnabled.toggle()
        if appState.state.waterEnabled && appState.state.waterLevel < 0.05 {
            appState.state.waterLevel = 0.8
        }
    }

    private func toggleNature() {
        let shouldEnable = !(appState.state.birdsEnabled || appState.state.birds2Enabled || appState.state.frogsEnabled)
        appState.state.birdsEnabled = shouldEnable
        appState.state.birds2Enabled = shouldEnable
        appState.state.frogsEnabled = shouldEnable
        if shouldEnable && appState.state.natureLevel < 0.05 {
            appState.state.natureLevel = 1.0
        }
    }

    private func toggleInsects() {
        let shouldEnable = !(appState.state.insectsEnabled || appState.state.insects2Enabled)
        appState.state.insectsEnabled = shouldEnable
        appState.state.insects2Enabled = shouldEnable
        if shouldEnable && appState.state.insectsSharedLevel < 0.05 {
            appState.state.insectsSharedLevel = 1.0
        }
    }
}

private struct KesshoMacGranularPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .granular)

    var body: some View {
        KesshoMacPageFrame(page: .granular) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    scenesCard
                    macroCard
                    voiceCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    voicesCard
                    shapeCard
                    sourcesCard
                    delayCard
                }
            }
        }
    }

    private var scenesCard: some View {
        KesshoMacCard(title: "Granular Scenes", symbol: "sparkles.rectangle.stack", accent: accent) {
            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: 8
            ) {
                ForEach(NativeGranularScene.allCases) { scene in
                    Button {
                        appState.applyGranularScene(scene)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: scene.symbol)
                                .font(.system(size: 13, weight: .semibold))
                            Text(scene.title)
                                .font(.system(size: 12, weight: .bold))
                            Spacer()
                        }
                        .foregroundStyle(KesshoMacDesign.text)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 8)
                        .background(KesshoMacDesign.control)
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .stroke(KesshoMacDesign.border, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var macroCard: some View {
        KesshoMacCard(title: "Modes + Macros", symbol: "slider.horizontal.3", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacPickerRow(
                    title: "Space",
                    symbol: "sparkles",
                    accent: accent,
                    selection: $appState.state.granularSpaceMode,
                    options: [
                        ("clocked", "Clocked"),
                        ("diffuse", "Diffuse"),
                    ]
                )
                KesshoMacPickerRow(
                    title: "Behavior",
                    symbol: "wand.and.stars",
                    accent: accent,
                    selection: $appState.state.granularPresetBehavior,
                    options: [
                        ("expressive", "Expressive"),
                        ("pure", "Pure"),
                    ]
                )
                KesshoMacPickerRow(
                    title: "Shape",
                    symbol: "waveform.path",
                    accent: accent,
                    selection: $appState.state.granularShape,
                    options: [
                        ("triangle", "Triangle"),
                        ("sawUp", "Rise"),
                        ("sawDown", "Fall"),
                        ("square", "Square"),
                    ]
                )
                KesshoMacSliderGrid(specs: [
                    .init("Smear", key: "granularDiffusion", icon: "water.waves", value: \.granularDiffusion),
                    .init("Activity", key: "granularMacroActivity", icon: "circle.grid.3x3", value: \.granularMacroActivity),
                    .init("Texture", key: "granularMacroTexture", icon: "sparkles", value: \.granularMacroTexture),
                    .init("Motion", key: "granularMacroComplexity", icon: "point.3.connected.trianglepath.dotted", value: \.granularMacroComplexity),
                    .init("Tone", key: "granularMacroDarkness", icon: "line.3.horizontal.decrease", value: \.granularMacroDarkness),
                    .init("Chaos", key: "granularMacroChaos", icon: "shuffle", value: \.granularMacroChaos),
                    .init("Chord Bias", key: "granularChordBias", icon: "music.note.list", value: \.granularChordBias),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var voiceCard: some View {
        KesshoMacCard(title: "Granular Voice", symbol: "sparkles", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Granular Engine", symbol: "power", accent: accent, isOn: $appState.state.granularEnabled)
                KesshoMacToggleRow(title: "Freeze Buffer", symbol: "snowflake", accent: accent, isOn: $appState.state.granularFreeze)
                KesshoMacPickerRow(
                    title: "Pitch Mode",
                    symbol: "music.note",
                    accent: accent,
                    selection: $appState.state.grainPitchMode,
                    options: [
                        ("harmonic", "Harmonic"),
                        ("free", "Free"),
                        ("quantized", "Quantized"),
                    ]
                )
                KesshoMacSliderGrid(specs: [
                    .init("Level", key: "granularLevel", icon: "speaker.wave.2", value: \.granularLevel),
                    .init("Reverb", key: "granularReverbSend", icon: "diamond", value: \.granularReverbSend),
                    .init("Delay A", key: "granularDelayASend", icon: "repeat", value: \.granularDelayASend),
                    .init("Delay B", key: "granularDelayBSend", icon: "repeat.circle", value: \.granularDelayBSend),
                    .init("Feedback", key: "granularFeedback", icon: "arrow.triangle.2.circlepath", value: \.granularFeedback, range: 0...0.85),
                    .init("FB LPF", key: "granularFeedbackLPF", icon: "line.3.horizontal.decrease", value: \.granularFeedbackLPF, range: 200...12_000, style: .hertz),
                    .init("Output LPF", key: "granularOutputLPF", icon: "line.3.horizontal.decrease.circle", value: \.granularOutputLPF, range: 300...18_000, style: .hertz),
                    .init("Reverb LPF", key: "granularReverbLPF", icon: "diamond.lefthalf.filled", value: \.granularReverbLPF, range: 220...12_000, style: .hertz),
                    .init("Probability", key: "grainProbability", icon: "dice", value: \.grainProbability),
                    .init("Density", key: "density", icon: "circle.grid.3x3", value: \.density, range: 1...80, style: .integer),
                    .init("Spray", key: "spray", icon: "wind", value: \.spray, range: 0...500, style: .milliseconds),
                    .init("Size Min", key: "grainSizeMin", icon: "arrow.down.left.and.arrow.up.right", value: \.grainSizeMin, range: 5...200, style: .milliseconds),
                    .init("Size Max", key: "grainSizeMax", icon: "arrow.up.left.and.arrow.down.right", value: \.grainSizeMax, range: 10...400, style: .milliseconds),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var voicesCard: some View {
        KesshoMacCard(title: "Four Voices", symbol: "square.grid.2x2", accent: accent) {
            VStack(spacing: 8) {
                granularVoiceSection(
                    title: "Voice 1",
                    symbol: "1.circle",
                    enabled: $appState.state.granularV1Enabled,
                    mode: $appState.state.granularV1Mode,
                    reverse: $appState.state.granularV1Reverse,
                    tempoSync: $appState.state.granularV1TempoSync,
                    tempoDiv: $appState.state.granularV1TempoDiv,
                    specs: [
                        .init("Slice", key: "granularV1Slice", icon: "square.grid.4x3.fill", value: \.granularV1Slice, range: 0...15, style: .integer),
                        .init("Speed", key: "granularV1Speed", icon: "forward", value: \.granularV1Speed, range: 0...4),
                        .init("Scan", key: "granularV1ScanRate", icon: "waveform.path", value: \.granularV1ScanRate, range: 0...4),
                        .init("Pitch", key: "granularV1Pitch", icon: "music.note", value: \.granularV1Pitch, range: -24...24, style: .integer),
                        .init("Fade In", key: "granularV1Attack", icon: "arrow.up.right", value: \.granularV1Attack, range: 0.003...1, style: .seconds),
                        .init("Fade Out", key: "granularV1Decay", icon: "arrow.down.right", value: \.granularV1Decay, range: 0.01...4, style: .seconds),
                        .init("Blur", key: "granularV1Blur", icon: "camera.filters", value: \.granularV1Blur),
                        .init("Look Back", key: "granularV1Spray", icon: "backward", value: \.granularV1Spray),
                        .init("Density", key: "granularV1Density", icon: "circle.grid.3x3", value: \.granularV1Density, range: 1...64, style: .integer),
                        .init("Size", key: "granularV1GrainSize", icon: "arrow.left.and.right", value: \.granularV1GrainSize, range: 10...500, style: .milliseconds),
                        .init("Shimmer", key: "granularV1GrainOct", icon: "sparkles", value: \.granularV1GrainOct),
                        .init("Gain", key: "granularV1Gain", icon: "speaker.wave.2", value: \.granularV1Gain),
                        .init("Pan", key: "granularV1Pan", icon: "arrow.left.and.right", value: \.granularV1Pan, range: -1...1),
                        .init("Spread", key: "granularV1StereoSpread", icon: "arrow.up.left.and.arrow.down.right", value: \.granularV1StereoSpread),
                        .init("Pos Rate", key: "granularV1PosLFORate", icon: "waveform", value: \.granularV1PosLFORate),
                        .init("Pos Depth", key: "granularV1PosLFODepth", icon: "point.3.connected.trianglepath.dotted", value: \.granularV1PosLFODepth),
                        .init("Pan LFO", key: "granularV1PanLFORate", icon: "arrow.left.arrow.right", value: \.granularV1PanLFORate),
                        .init("Rev LFO", key: "granularV1ReverseLFORate", icon: "arrow.counterclockwise", value: \.granularV1ReverseLFORate),
                        .init("Follow", key: "granularV1WriteFollow", icon: "record.circle", value: \.granularV1WriteFollow),
                        .init("Record", key: "granularV1RecordLFORate", icon: "waveform.badge.magnifyingglass", value: \.granularV1RecordLFORate),
                    ]
                )
                granularVoiceSection(
                    title: "Voice 2",
                    symbol: "2.circle",
                    enabled: $appState.state.granularV2Enabled,
                    mode: $appState.state.granularV2Mode,
                    reverse: $appState.state.granularV2Reverse,
                    tempoSync: $appState.state.granularV2TempoSync,
                    tempoDiv: $appState.state.granularV2TempoDiv,
                    specs: [
                        .init("Slice", key: "granularV2Slice", icon: "square.grid.4x3.fill", value: \.granularV2Slice, range: 0...15, style: .integer),
                        .init("Speed", key: "granularV2Speed", icon: "forward", value: \.granularV2Speed, range: 0...4),
                        .init("Scan", key: "granularV2ScanRate", icon: "waveform.path", value: \.granularV2ScanRate, range: 0...4),
                        .init("Pitch", key: "granularV2Pitch", icon: "music.note", value: \.granularV2Pitch, range: -24...24, style: .integer),
                        .init("Fade In", key: "granularV2Attack", icon: "arrow.up.right", value: \.granularV2Attack, range: 0.003...1, style: .seconds),
                        .init("Fade Out", key: "granularV2Decay", icon: "arrow.down.right", value: \.granularV2Decay, range: 0.01...4, style: .seconds),
                        .init("Blur", key: "granularV2Blur", icon: "camera.filters", value: \.granularV2Blur),
                        .init("Look Back", key: "granularV2Spray", icon: "backward", value: \.granularV2Spray),
                        .init("Density", key: "granularV2Density", icon: "circle.grid.3x3", value: \.granularV2Density, range: 1...64, style: .integer),
                        .init("Size", key: "granularV2GrainSize", icon: "arrow.left.and.right", value: \.granularV2GrainSize, range: 10...500, style: .milliseconds),
                        .init("Shimmer", key: "granularV2GrainOct", icon: "sparkles", value: \.granularV2GrainOct),
                        .init("Gain", key: "granularV2Gain", icon: "speaker.wave.2", value: \.granularV2Gain),
                        .init("Pan", key: "granularV2Pan", icon: "arrow.left.and.right", value: \.granularV2Pan, range: -1...1),
                        .init("Spread", key: "granularV2StereoSpread", icon: "arrow.up.left.and.arrow.down.right", value: \.granularV2StereoSpread),
                        .init("Pos Rate", key: "granularV2PosLFORate", icon: "waveform", value: \.granularV2PosLFORate),
                        .init("Pos Depth", key: "granularV2PosLFODepth", icon: "point.3.connected.trianglepath.dotted", value: \.granularV2PosLFODepth),
                        .init("Pan LFO", key: "granularV2PanLFORate", icon: "arrow.left.arrow.right", value: \.granularV2PanLFORate),
                        .init("Rev LFO", key: "granularV2ReverseLFORate", icon: "arrow.counterclockwise", value: \.granularV2ReverseLFORate),
                        .init("Follow", key: "granularV2WriteFollow", icon: "record.circle", value: \.granularV2WriteFollow),
                        .init("Record", key: "granularV2RecordLFORate", icon: "waveform.badge.magnifyingglass", value: \.granularV2RecordLFORate),
                    ]
                )
                granularVoiceSection(
                    title: "Voice 3",
                    symbol: "3.circle",
                    enabled: $appState.state.granularV3Enabled,
                    mode: $appState.state.granularV3Mode,
                    reverse: $appState.state.granularV3Reverse,
                    tempoSync: $appState.state.granularV3TempoSync,
                    tempoDiv: $appState.state.granularV3TempoDiv,
                    specs: [
                        .init("Slice", key: "granularV3Slice", icon: "square.grid.4x3.fill", value: \.granularV3Slice, range: 0...15, style: .integer),
                        .init("Speed", key: "granularV3Speed", icon: "forward", value: \.granularV3Speed, range: 0...4),
                        .init("Scan", key: "granularV3ScanRate", icon: "waveform.path", value: \.granularV3ScanRate, range: 0...4),
                        .init("Pitch", key: "granularV3Pitch", icon: "music.note", value: \.granularV3Pitch, range: -24...24, style: .integer),
                        .init("Fade In", key: "granularV3Attack", icon: "arrow.up.right", value: \.granularV3Attack, range: 0.003...1, style: .seconds),
                        .init("Fade Out", key: "granularV3Decay", icon: "arrow.down.right", value: \.granularV3Decay, range: 0.01...4, style: .seconds),
                        .init("Blur", key: "granularV3Blur", icon: "camera.filters", value: \.granularV3Blur),
                        .init("Look Back", key: "granularV3Spray", icon: "backward", value: \.granularV3Spray),
                        .init("Density", key: "granularV3Density", icon: "circle.grid.3x3", value: \.granularV3Density, range: 1...64, style: .integer),
                        .init("Size", key: "granularV3GrainSize", icon: "arrow.left.and.right", value: \.granularV3GrainSize, range: 10...500, style: .milliseconds),
                        .init("Shimmer", key: "granularV3GrainOct", icon: "sparkles", value: \.granularV3GrainOct),
                        .init("Gain", key: "granularV3Gain", icon: "speaker.wave.2", value: \.granularV3Gain),
                        .init("Pan", key: "granularV3Pan", icon: "arrow.left.and.right", value: \.granularV3Pan, range: -1...1),
                        .init("Spread", key: "granularV3StereoSpread", icon: "arrow.up.left.and.arrow.down.right", value: \.granularV3StereoSpread),
                        .init("Pos Rate", key: "granularV3PosLFORate", icon: "waveform", value: \.granularV3PosLFORate),
                        .init("Pos Depth", key: "granularV3PosLFODepth", icon: "point.3.connected.trianglepath.dotted", value: \.granularV3PosLFODepth),
                        .init("Pan LFO", key: "granularV3PanLFORate", icon: "arrow.left.arrow.right", value: \.granularV3PanLFORate),
                        .init("Rev LFO", key: "granularV3ReverseLFORate", icon: "arrow.counterclockwise", value: \.granularV3ReverseLFORate),
                        .init("Follow", key: "granularV3WriteFollow", icon: "record.circle", value: \.granularV3WriteFollow),
                        .init("Record", key: "granularV3RecordLFORate", icon: "waveform.badge.magnifyingglass", value: \.granularV3RecordLFORate),
                    ]
                )
                granularVoiceSection(
                    title: "Voice 4",
                    symbol: "4.circle",
                    enabled: $appState.state.granularV4Enabled,
                    mode: $appState.state.granularV4Mode,
                    reverse: $appState.state.granularV4Reverse,
                    tempoSync: $appState.state.granularV4TempoSync,
                    tempoDiv: $appState.state.granularV4TempoDiv,
                    specs: [
                        .init("Slice", key: "granularV4Slice", icon: "square.grid.4x3.fill", value: \.granularV4Slice, range: 0...15, style: .integer),
                        .init("Speed", key: "granularV4Speed", icon: "forward", value: \.granularV4Speed, range: 0...4),
                        .init("Scan", key: "granularV4ScanRate", icon: "waveform.path", value: \.granularV4ScanRate, range: 0...4),
                        .init("Pitch", key: "granularV4Pitch", icon: "music.note", value: \.granularV4Pitch, range: -24...24, style: .integer),
                        .init("Fade In", key: "granularV4Attack", icon: "arrow.up.right", value: \.granularV4Attack, range: 0.003...1, style: .seconds),
                        .init("Fade Out", key: "granularV4Decay", icon: "arrow.down.right", value: \.granularV4Decay, range: 0.01...4, style: .seconds),
                        .init("Blur", key: "granularV4Blur", icon: "camera.filters", value: \.granularV4Blur),
                        .init("Look Back", key: "granularV4Spray", icon: "backward", value: \.granularV4Spray),
                        .init("Density", key: "granularV4Density", icon: "circle.grid.3x3", value: \.granularV4Density, range: 1...64, style: .integer),
                        .init("Size", key: "granularV4GrainSize", icon: "arrow.left.and.right", value: \.granularV4GrainSize, range: 10...500, style: .milliseconds),
                        .init("Shimmer", key: "granularV4GrainOct", icon: "sparkles", value: \.granularV4GrainOct),
                        .init("Gain", key: "granularV4Gain", icon: "speaker.wave.2", value: \.granularV4Gain),
                        .init("Pan", key: "granularV4Pan", icon: "arrow.left.and.right", value: \.granularV4Pan, range: -1...1),
                        .init("Spread", key: "granularV4StereoSpread", icon: "arrow.up.left.and.arrow.down.right", value: \.granularV4StereoSpread),
                        .init("Pos Rate", key: "granularV4PosLFORate", icon: "waveform", value: \.granularV4PosLFORate),
                        .init("Pos Depth", key: "granularV4PosLFODepth", icon: "point.3.connected.trianglepath.dotted", value: \.granularV4PosLFODepth),
                        .init("Pan LFO", key: "granularV4PanLFORate", icon: "arrow.left.arrow.right", value: \.granularV4PanLFORate),
                        .init("Rev LFO", key: "granularV4ReverseLFORate", icon: "arrow.counterclockwise", value: \.granularV4ReverseLFORate),
                        .init("Follow", key: "granularV4WriteFollow", icon: "record.circle", value: \.granularV4WriteFollow),
                        .init("Record", key: "granularV4RecordLFORate", icon: "waveform.badge.magnifyingglass", value: \.granularV4RecordLFORate),
                    ]
                )
            }
        }
    }

    private func granularVoiceSection(
        title: String,
        symbol: String,
        enabled: Binding<Bool>,
        mode: Binding<String>,
        reverse: Binding<Bool>,
        tempoSync: Binding<Bool>,
        tempoDiv: Binding<String>,
        specs: [KesshoMacSliderSpec]
    ) -> some View {
        KesshoMacSection(title: title) {
            VStack(spacing: 8) {
                KesshoMacToggleRow(title: "Enabled", symbol: symbol, accent: accent, isOn: enabled)
                KesshoMacPickerRow(
                    title: "Mode",
                    symbol: "switch.2",
                    accent: accent,
                    selection: mode,
                    options: [
                        ("clean", "Clean"),
                        ("granular", "Granular"),
                        ("legacy", "Legacy"),
                    ]
                )
                HStack(spacing: 10) {
                    KesshoMacToggleRow(title: "Reverse", symbol: "arrow.counterclockwise", accent: accent, isOn: reverse)
                    KesshoMacToggleRow(title: "Tempo", symbol: "metronome", accent: accent, isOn: tempoSync)
                }
                if tempoSync.wrappedValue {
                    KesshoMacPickerRow(
                        title: "Clock",
                        symbol: "clock",
                        accent: accent,
                        selection: tempoDiv,
                        options: [
                            ("1/4", "1/4"),
                            ("1/8", "1/8"),
                            ("1/16", "1/16"),
                            ("1/32", "1/32"),
                            ("1/64", "1/64"),
                            ("1/8T", "1/8T"),
                        ]
                    )
                }
                KesshoMacSliderGrid(specs: specs, accent: accent, columns: 2)
            }
        }
    }

    private var shapeCard: some View {
        KesshoMacCard(title: "Shape + Space", symbol: "waveform.path", accent: accent) {
            KesshoMacSliderGrid(specs: [
                .init("Jitter", key: "jitter", icon: "shuffle", value: \.jitter, range: 0...100, style: .milliseconds),
                .init("Pitch Spread", key: "pitchSpread", icon: "music.note", value: \.pitchSpread, range: 0...24, style: .integer),
                .init("Stereo Spread", key: "stereoSpread", icon: "arrow.left.and.right", value: \.stereoSpread),
                .init("Feedback", key: "feedback", icon: "arrow.triangle.2.circlepath", value: \.feedback),
                .init("Feedback LPF", key: "granularFeedbackLPF", icon: "line.3.horizontal.decrease", value: \.granularFeedbackLPF, range: 200...20_000, style: .hertz),
                .init("Buffer", key: "granularBufferSeconds", icon: "externaldrive", value: \.granularBufferSeconds, range: 1...16, style: .seconds),
                .init("Wet HPF", key: "wetHPF", icon: "line.3.horizontal.decrease.circle", value: \.wetHPF, range: 20...8_000, style: .hertz),
                .init("Wet LPF", key: "wetLPF", icon: "line.3.horizontal.decrease", value: \.wetLPF, range: 500...18_000, style: .hertz),
            ], accent: accent, columns: 2)
        }
    }

    private var sourcesCard: some View {
        KesshoMacCard(title: "Input Sources", symbol: "point.3.connected.trianglepath.dotted", accent: accent) {
            KesshoMacSliderGrid(specs: [
                .init("Pad 1", key: "granularPad1Send", icon: "waveform", value: \.granularPad1Send),
                .init("Pad 2", key: "granularPad2Send", icon: "waveform.path", value: \.granularPad2Send),
                .init("Lead 1", key: "granularLead1Send", icon: "music.note", value: \.granularLead1Send),
                .init("Lead 2", key: "granularLead2Send", icon: "music.quarternote.3", value: \.granularLead2Send),
                .init("Piano", key: "granularPianoSend", icon: "pianokeys", value: \.granularPianoSend),
                .init("Drums", key: "granularDrumSend", icon: "circle.grid.cross", value: \.granularDrumSend),
                .init("Waves", key: "granularWavesSend", icon: "water.waves", value: \.granularWavesSend),
                .init("Water", key: "granularWaterSend", icon: "drop", value: \.granularWaterSend),
                .init("Nature", key: "granularNatureSend", icon: "leaf", value: \.granularNatureSend),
                .init("Insects", key: "granularInsectsSend", icon: "antenna.radiowaves.left.and.right", value: \.granularInsectsSend),
            ], accent: accent, columns: 2)
        }
    }

    private var delayCard: some View {
        KesshoMacCard(title: "Granular Delay", symbol: "repeat", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Granular Delay", symbol: "power", accent: accent, isOn: $appState.state.granularDelayEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Activity", key: "granularDelayActivity", icon: "waveform.path", value: \.granularDelayActivity),
                    .init("Repeats", key: "granularDelayRepeats", icon: "repeat", value: \.granularDelayRepeats),
                    .init("Filter", key: "granularDelayFilter", icon: "line.3.horizontal.decrease", value: \.granularDelayFilter),
                    .init("Vibrato", key: "granularDelayVibrato", icon: "waveform", value: \.granularDelayVibrato),
                    .init("Mix", key: "granularDelayMix", icon: "slider.horizontal.3", value: \.granularDelayMix),
                    .init("Reverb", key: "granularDelayReverbSend", icon: "diamond", value: \.granularDelayReverbSend),
                ], accent: accent, columns: 2)
            }
        }
    }
}

private struct KesshoMacDelayPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .delay)

    var body: some View {
        KesshoMacPageFrame(page: .delay) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    delayACard
                    crossFeedCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    delayBCard
                    clockedSpaceCard
                }
            }
        }
    }

    private var delayACard: some View {
        KesshoMacCard(title: "Delay A", symbol: "repeat", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Delay A Engine", symbol: "power", accent: accent, isOn: $appState.state.delayAEnabled)
                KesshoMacToggleRow(title: "Ping Pong", symbol: "arrow.left.arrow.right", accent: accent, isOn: $appState.state.delayAPingPong)
                KesshoMacSliderGrid(specs: [
                    .init("Time", key: "delayATime", icon: "clock", value: \.delayATime, range: 40...1_500, style: .milliseconds),
                    .init("Feedback", key: "delayAFeedback", icon: "arrow.triangle.2.circlepath", value: \.delayAFeedback),
                    .init("Mix", key: "delayAMix", icon: "slider.horizontal.3", value: \.delayAMix),
                    .init("Spread", key: "delayASpread", icon: "arrow.left.and.right", value: \.delayASpread, range: 0...2),
                    .init("Width", key: "delayAWidth", icon: "rectangle.split.2x1", value: \.delayAWidth),
                    .init("Filter", key: "delayAFilter", icon: "line.3.horizontal.decrease", value: \.delayAFilter, range: 100...12_000, style: .hertz),
                    .init("Mod Rate", key: "delayAModRate", icon: "speedometer", value: \.delayAModRate, range: 0...12),
                    .init("Mod Depth", key: "delayAModDepth", icon: "waveform", value: \.delayAModDepth),
                    .init("Duck", key: "delayADuck", icon: "arrow.down.forward.and.arrow.up.backward", value: \.delayADuck),
                    .init("Reverb", key: "delayAReverbSend", icon: "diamond", value: \.delayAReverbSend),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var delayBCard: some View {
        KesshoMacCard(title: "Delay B", symbol: "repeat.circle", accent: accent) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    menuPicker("Pattern", selection: $appState.state.delayBPattern, options: ["cascade", "scatter", "bloom"])
                    menuPicker("Warp", selection: $appState.state.delayBWarp, options: ["clean", "tape", "diffuse", "pitch"])
                }

                KesshoMacSliderGrid(specs: [
                    .init("Warp", key: "delayBWarpIntensity", icon: "waveform", value: \.delayBWarpIntensity),
                    .init("Spread", key: "delayBSpread", icon: "arrow.left.and.right", value: \.delayBSpread),
                    .init("B to A", key: "delayBToASend", icon: "arrowshape.turn.up.left", value: \.delayBToASend),
                    .init("A to B", key: "delayAToBSend", icon: "arrowshape.turn.up.right", value: \.delayAToBSend),
                    .init("Cross Filter", key: "delayACrossFeedFilter", icon: "line.3.horizontal.decrease.circle", value: \.delayACrossFeedFilter),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var crossFeedCard: some View {
        KesshoMacCard(title: "Cross Sends", symbol: "point.3.connected.trianglepath.dotted", accent: accent) {
            KesshoMacSliderGrid(specs: [
                .init("Delay A Send", key: "delayASend", icon: "repeat", value: \.delayASend),
                .init("A to Granular", key: "delayAGranularSend", icon: "sparkles", value: \.delayAGranularSend),
                .init("B to Granular", key: "delayBGranularSend", icon: "sparkles", value: \.delayBGranularSend),
            ], accent: accent, columns: 2)
        }
    }

    private var clockedSpaceCard: some View {
        KesshoMacCard(title: "Clocked Space", symbol: "sparkles", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Granular Delay", symbol: "power", accent: accent, isOn: $appState.state.granularDelayEnabled)
                menuPicker("Time", selection: $appState.state.granularDelayTime, options: ["1/2", "1/4", "1/4t", "1/8", "1/8d", "1/16", "1/32"])
                KesshoMacSliderGrid(specs: [
                    .init("Activity", key: "granularDelayActivity", icon: "waveform.path", value: \.granularDelayActivity),
                    .init("Repeats", key: "granularDelayRepeats", icon: "repeat", value: \.granularDelayRepeats),
                    .init("Mix", key: "granularDelayMix", icon: "slider.horizontal.3", value: \.granularDelayMix),
                    .init("Filter", key: "granularDelayFilter", icon: "line.3.horizontal.decrease", value: \.granularDelayFilter),
                    .init("Vibrato", key: "granularDelayVibrato", icon: "waveform", value: \.granularDelayVibrato),
                    .init("Reverb", key: "granularDelayReverbSend", icon: "diamond", value: \.granularDelayReverbSend),
                ], accent: accent, columns: 2)
            }
        }
    }

    private func menuPicker(_ title: String, selection: Binding<String>, options: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(KesshoMacDesign.mutedText)
            Picker(title, selection: selection) {
                ForEach(options, id: \.self) { option in
                    Text(option).tag(option)
                }
            }
            .pickerStyle(.menu)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct KesshoMacReverbPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .reverb)

    var body: some View {
        KesshoMacPageFrame(page: .reverb) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    algorithmicCard
                    shimmerCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    toneSpaceCard
                    spectralFreezeCard
                }
            }
        }
    }

    private var algorithmicCard: some View {
        KesshoMacCard(title: "Algorithmic Reverb", symbol: "diamond", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Reverb Engine", symbol: "power", accent: accent, isOn: $appState.state.reverbEnabled)
                KesshoMacPickerRow(
                    title: "Engine",
                    symbol: "cpu",
                    accent: accent,
                    selection: $appState.state.reverbEngine,
                    options: [
                        ("algorithmic", "Algorithmic"),
                        ("convolution", "Convolution"),
                    ]
                )
                KesshoMacPickerRow(
                    title: "Type",
                    symbol: "waveform",
                    accent: accent,
                    selection: $appState.state.reverbType,
                    options: [
                        ("plate", "Plate"),
                        ("hall", "Hall"),
                        ("cathedral", "Cathedral"),
                        ("darkHall", "Dark Hall"),
                        ("dattorroPlate", "Dattorro Plate"),
                        ("dattorroShimmer", "Dattorro Shimmer"),
                    ]
                )
                KesshoMacPickerRow(
                    title: "Quality",
                    symbol: "sparkles",
                    accent: accent,
                    selection: $appState.state.reverbQuality,
                    options: [
                        ("ultra", "Ultra"),
                        ("balanced", "Balanced"),
                        ("lite", "Lite"),
                    ]
                )
                KesshoMacSliderGrid(specs: [
                    .init("Return Level", key: "reverbLevel", icon: "speaker.wave.2", value: \.reverbLevel),
                    .init("Decay", key: "reverbDecay", icon: "timer", value: \.reverbDecay),
                    .init("Size", key: "reverbSize", icon: "arrow.up.left.and.arrow.down.right", value: \.reverbSize, range: 0.5...3),
                    .init("Diffusion", key: "reverbDiffusion", icon: "circle.hexagongrid", value: \.reverbDiffusion),
                    .init("Modulation", key: "reverbModulation", icon: "waveform", value: \.reverbModulation),
                    .init("Slow Rate", key: "reverbSlowModRate", icon: "speedometer", value: \.reverbSlowModRate, range: 0.01...0.2),
                    .init("Slow Depth", key: "reverbSlowModDepth", icon: "waveform.path", value: \.reverbSlowModDepth),
                    .init("Chorus Rate", key: "reverbChorusRate", icon: "dot.radiowaves.left.and.right", value: \.reverbChorusRate, range: 0.05...2),
                    .init("Chorus Depth", key: "reverbChorusDepth", icon: "arrow.left.and.right", value: \.reverbChorusDepth, range: 0...40),
                    .init("Reverse", key: "reverbReverse", icon: "backward", value: \.reverbReverse),
                    .init("Reverse Len", key: "reverbReverseLength", icon: "timer", value: \.reverbReverseLength, range: 0.1...12, style: .seconds),
                    .init("Predelay", key: "predelay", icon: "clock", value: \.predelay, range: 0...300, style: .milliseconds),
                    .init("Transient Smooth", key: "reverbTransientSmooth", icon: "waveform.path.ecg", value: \.reverbTransientSmooth),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var toneSpaceCard: some View {
        KesshoMacCard(title: "Tone + Space", symbol: "sparkle", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacPickerRow(
                    title: "Mod Shape",
                    symbol: "waveform.path",
                    accent: accent,
                    selection: $appState.state.reverbModCharacter,
                    options: [
                        ("sine", "Sine"),
                        ("drift", "Drift"),
                        ("hybrid", "Hybrid"),
                    ]
                )
                KesshoMacPickerRow(
                    title: "Saturation",
                    symbol: "bolt",
                    accent: accent,
                    selection: $appState.state.reverbSaturationMode,
                    options: [
                        ("clean", "Clean"),
                        ("tape", "Tape"),
                        ("tube", "Tube"),
                    ]
                )
                KesshoMacSliderGrid(specs: [
                    .init("Damping", key: "damping", icon: "line.3.horizontal.decrease", value: \.damping),
                    .init("Damp Low", key: "reverbDampLow", icon: "line.3.horizontal.decrease.circle", value: \.reverbDampLow),
                    .init("Damp High", key: "reverbDampHigh", icon: "line.3.horizontal.decrease", value: \.reverbDampHigh),
                    .init("Crossover", key: "reverbCrossoverFreq", icon: "arrow.left.and.right", value: \.reverbCrossoverFreq, range: 200...4_000, style: .hertz),
                    .init("Input Tone", key: "reverbInputTone", icon: "dial.medium", value: \.reverbInputTone, range: -1...1),
                    .init("Early Refl", key: "reverbEarlyReflections", icon: "scope", value: \.reverbEarlyReflections),
                    .init("ER LPF", key: "reverbErLpFreq", icon: "line.3.horizontal.decrease", value: \.reverbErLpFreq, range: 200...12_000, style: .hertz),
                    .init("Air Absorb", key: "reverbAirAbsorption", icon: "wind", value: \.reverbAirAbsorption),
                    .init("Width", key: "width", icon: "arrow.left.and.right", value: \.width),
                    .init("Warp", key: "reverbWarp", icon: "waveform", value: \.reverbWarp),
                    .init("Cross Feed", key: "reverbCrossFeed", icon: "arrow.left.arrow.right", value: \.reverbCrossFeed),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var shimmerCard: some View {
        KesshoMacCard(title: "Shimmer", symbol: "sparkles", accent: accent) {
            KesshoMacSliderGrid(specs: [
                .init("Amount", key: "reverbShimmer", icon: "sparkles", value: \.reverbShimmer),
                .init("Pitch", key: "reverbShimmerPitch", icon: "music.note", value: \.reverbShimmerPitch, range: -24...24, style: .integer),
                .init("Feedback", key: "reverbShimmerFeedback", icon: "repeat", value: \.reverbShimmerFeedback),
            ], accent: accent, columns: 2)
        }
    }

    private var spectralFreezeCard: some View {
        KesshoMacCard(title: "Spectral Freeze", symbol: "snowflake", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Freeze Engine", symbol: "power", accent: accent, isOn: $appState.state.spectralFreezeEnabled)
                KesshoMacToggleRow(title: "Freeze Active", symbol: "snowflake", accent: accent, isOn: $appState.state.spectralFreezeActive)
                KesshoMacToggleRow(title: "Slushy", symbol: "cloud.snow", accent: accent, isOn: $appState.state.spectralFreezeSlushy)
                Picker("Routing", selection: $appState.state.spectralFreezeRouting) {
                    Text("Pre").tag("pre")
                    Text("Post").tag("post")
                }
                .pickerStyle(.segmented)

                KesshoMacSliderGrid(specs: [
                    .init("Speed", key: "spectralFreezeSpeed", icon: "speedometer", value: \.spectralFreezeSpeed),
                    .init("Mix", key: "spectralFreezeMix", icon: "slider.horizontal.3", value: \.spectralFreezeMix),
                    .init("Decay", key: "spectralFreezeDecay", icon: "timer", value: \.spectralFreezeDecay),
                    .init("Phase Jitter", key: "spectralFreezePhaseJitter", icon: "shuffle", value: \.spectralFreezePhaseJitter),
                    .init("Reverb Crossfade", key: "spectralFreezeReverbCrossfade", icon: "arrow.left.arrow.right", value: \.spectralFreezeReverbCrossfade),
                ], accent: accent, columns: 2)
            }
        }
    }
}

private struct KesshoMacDynamicsPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .dynamics)

    var body: some View {
        KesshoMacPageFrame(page: .dynamics) {
            KesshoMacTwoColumn {
                VStack(spacing: 10) {
                    characterCard
                    saturationCard
                    endChainCard
                }
            } trailing: {
                VStack(spacing: 10) {
                    sidechainCard
                    degradeCard
                }
            }
        }
    }

    private var characterCard: some View {
        KesshoMacCard(title: "Character", symbol: "waveform.path.ecg", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Dynamics", symbol: "power", accent: accent, isOn: $appState.state.dynamicsEnabled)
                KesshoMacToggleRow(title: "Character Engine", symbol: "waveform.path.ecg", accent: accent, isOn: $appState.state.characterEnabled)
                KesshoMacPickerRow(
                    title: "Mode",
                    symbol: "water.waves",
                    accent: accent,
                    selection: $appState.state.characterMode,
                    options: [
                        ("clean", "Clean"),
                        ("shallowWater", "Shallow Water"),
                        ("abyssWater", "Abyss Water"),
                    ]
                )
                KesshoMacSliderGrid(specs: [
                    .init("Mix", key: "characterMix", icon: "slider.horizontal.3", value: \.characterMix),
                    .init("Age", key: "characterAge", icon: "clock.arrow.circlepath", value: \.characterAge),
                    .init("Depth", key: "characterDepth", icon: "water.waves", value: \.characterDepth),
                    .init("Rate", key: "characterRate", icon: "speedometer", value: \.characterRate),
                    .init("Damp", key: "characterDamp", icon: "line.3.horizontal.decrease", value: \.characterDamp),
                    .init("Envelope", key: "characterEnvFollow", icon: "waveform.path", value: \.characterEnvFollow),
                    .init("Stereo", key: "characterStereo", icon: "arrow.left.and.right", value: \.characterStereo),
                    .init("Resonance", key: "characterResonance", icon: "dot.radiowaves.left.and.right", value: \.characterResonance),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var degradeCard: some View {
        KesshoMacCard(title: "Degrade", symbol: "scribble.variable", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Degrade Engine", symbol: "power", accent: accent, isOn: $appState.state.degradeEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Mix", key: "degradeMix", icon: "slider.horizontal.3", value: \.degradeMix),
                    .init("Age", key: "degradeAge", icon: "clock", value: \.degradeAge),
                    .init("Generation", key: "degradeGeneration", icon: "square.stack.3d.up", value: \.degradeGeneration),
                    .init("Alias", key: "degradeAlias", icon: "waveform.badge.magnifyingglass", value: \.degradeAlias),
                    .init("Wow", key: "degradeWow", icon: "waveform", value: \.degradeWow),
                    .init("Flutter", key: "degradeFlutter", icon: "wind", value: \.degradeFlutter),
                    .init("Drift", key: "degradeDrift", icon: "arrow.triangle.2.circlepath", value: \.degradeDrift),
                    .init("Wobble", key: "degradeWobbleSpeed", icon: "speedometer", value: \.degradeWobbleSpeed),
                    .init("Tone", key: "degradeTone", icon: "slider.horizontal.3", value: \.degradeTone),
                    .init("HP", key: "degradeHp", icon: "line.3.horizontal.decrease.circle", value: \.degradeHp),
                    .init("LP", key: "degradeLp", icon: "line.3.horizontal.decrease", value: \.degradeLp),
                    .init("Noise", key: "degradeNoise", icon: "waveform.path", value: \.degradeNoise),
                    .init("Clip", key: "degradeSaturation", icon: "bolt", value: \.degradeSaturation),
                    .init("Corrosion", key: "degradeCorrosion", icon: "aqi.medium", value: \.degradeCorrosion),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var sidechainCard: some View {
        KesshoMacCard(title: "Sidechain", symbol: "arrow.down.right.circle", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Sidechain Ducking", symbol: "power", accent: accent, isOn: $appState.state.sidechainEnabled)
                KesshoMacPickerRow(
                    title: "Key A",
                    symbol: "circle.fill",
                    accent: accent,
                    selection: $appState.state.sidechainKeyA,
                    options: sidechainKeyOptions
                )
                KesshoMacPickerRow(
                    title: "Key B",
                    symbol: "circle",
                    accent: accent,
                    selection: $appState.state.sidechainKeyB,
                    options: sidechainKeyOptions
                )
                KesshoMacSliderGrid(specs: [
                    .init("Key A Wt", key: "sidechainKeyAWeight", icon: "circle.fill", value: \.sidechainKeyAWeight),
                    .init("Key B Wt", key: "sidechainKeyBWeight", icon: "circle", value: \.sidechainKeyBWeight),
                    .init("Amount", key: "sidechainAmount", icon: "arrow.down.right", value: \.sidechainAmount),
                    .init("Mix", key: "sidechainMix", icon: "slider.horizontal.3", value: \.sidechainMix),
                    .init("Threshold", key: "sidechainThreshold", icon: "arrow.down", value: \.sidechainThreshold, range: -60...0, style: .decibels),
                    .init("Ratio", key: "sidechainRatio", icon: "divide", value: \.sidechainRatio, range: 1...20),
                    .init("Knee", key: "sidechainKnee", icon: "circle.bottomhalf.filled", value: \.sidechainKnee, range: 0...36, style: .decibels),
                    .init("Attack", key: "sidechainAttackMs", icon: "arrow.up.right", value: \.sidechainAttackMs, range: 0.1...120, style: .milliseconds),
                    .init("Hold", key: "sidechainHoldMs", icon: "pause", value: \.sidechainHoldMs, range: 0...300, style: .milliseconds),
                    .init("Release", key: "sidechainReleaseMs", icon: "arrow.down.forward", value: \.sidechainReleaseMs, range: 20...1_500, style: .milliseconds),
                    .init("Makeup", key: "sidechainMakeup", icon: "speaker.plus", value: \.sidechainMakeup, range: 0.25...4),
                    .init("Curve", key: "sidechainCurve", icon: "point.topleft.down.curvedto.point.bottomright.up", value: \.sidechainCurve),
                    .init("Det HP", key: "sidechainDetectorHp", icon: "line.3.horizontal.decrease.circle", value: \.sidechainDetectorHp),
                    .init("Det LP", key: "sidechainDetectorLp", icon: "line.3.horizontal.decrease", value: \.sidechainDetectorLp),
                    .init("Pad", key: "sidechainPad1Target", icon: "waveform", value: \.sidechainPad1Target),
                    .init("Pad 2", key: "sidechainPad2Target", icon: "waveform.path", value: \.sidechainPad2Target),
                    .init("Lead 1", key: "sidechainLead1Target", icon: "music.note", value: \.sidechainLead1Target),
                    .init("Lead 2", key: "sidechainLead2Target", icon: "music.note.list", value: \.sidechainLead2Target),
                    .init("Piano", key: "sidechainPianoTarget", icon: "pianokeys", value: \.sidechainPianoTarget),
                    .init("Granular", key: "sidechainGranularTarget", icon: "sparkles", value: \.sidechainGranularTarget),
                    .init("Delay A", key: "sidechainDelayATarget", icon: "repeat", value: \.sidechainDelayATarget),
                    .init("Delay B", key: "sidechainDelayBTarget", icon: "repeat.circle", value: \.sidechainDelayBTarget),
                    .init("Reverb", key: "sidechainReverbTarget", icon: "diamond", value: \.sidechainReverbTarget),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var sidechainKeyOptions: [(value: String, label: String)] {
        [
            ("off", "Off"),
            ("sub", "Sub"),
            ("kick", "Kick"),
            ("click", "Click"),
            ("beepHi", "Beep Hi"),
            ("beepLo", "Beep Lo"),
            ("noise", "Noise"),
        ]
    }

    private var saturationCard: some View {
        KesshoMacCard(title: "Saturation", symbol: "bolt", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Saturation FX", symbol: "power", accent: accent, isOn: $appState.state.dynamicsSaturationEnabled)
                KesshoMacPickerRow(
                    title: "Mode",
                    symbol: "waveform.path",
                    accent: accent,
                    selection: $appState.state.dynamicsSaturationMode,
                    options: [
                        ("clean", "Clean"),
                        ("tape", "Tape"),
                        ("tube", "Tube"),
                        ("diode", "Diode"),
                        ("fold", "Fold"),
                    ]
                )
                KesshoMacSliderGrid(specs: [
                    .init("Drive", key: "dynamicsSaturationDrive", icon: "bolt.fill", value: \.dynamicsSaturationDrive),
                    .init("Tone", key: "dynamicsSaturationTone", icon: "dial.medium", value: \.dynamicsSaturationTone),
                    .init("Bias", key: "dynamicsSaturationBias", icon: "circle.lefthalf.filled", value: \.dynamicsSaturationBias),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var endChainCard: some View {
        KesshoMacCard(title: "End Chain", symbol: "waveform.path.badge.minus", accent: accent) {
            VStack(spacing: 10) {
                KesshoMacToggleRow(title: "Compressor", symbol: "power", accent: accent, isOn: $appState.state.endCompEnabled)
                KesshoMacSliderGrid(specs: [
                    .init("Threshold", key: "endCompThreshold", icon: "arrow.down", value: \.endCompThreshold, range: -60...0, style: .decibels),
                    .init("Knee", key: "endCompKnee", icon: "circle.bottomhalf.filled", value: \.endCompKnee, range: 0...36, style: .decibels),
                    .init("Ratio", key: "endCompRatio", icon: "divide", value: \.endCompRatio, range: 1...20),
                    .init("Attack", key: "endCompAttackMs", icon: "arrow.up.right", value: \.endCompAttackMs, range: 0.1...120, style: .milliseconds),
                    .init("Release", key: "endCompReleaseMs", icon: "arrow.down.forward", value: \.endCompReleaseMs, range: 10...1_500, style: .milliseconds),
                    .init("Makeup", key: "endCompMakeup", icon: "speaker.plus", value: \.endCompMakeup, range: 0...3),
                    .init("Mix", key: "endCompMix", icon: "slider.horizontal.3", value: \.endCompMix),
                    .init("Detector HP", key: "endCompDetectorHp", icon: "line.3.horizontal.decrease.circle", value: \.endCompDetectorHp),
                    .init("Detector Tilt", key: "endCompDetectorTilt", icon: "dial.medium", value: \.endCompDetectorTilt),
                    .init("Auto Makeup", key: "endCompAutoMakeup", icon: "wand.and.stars", value: \.endCompAutoMakeup),
                    .init("Program Release", key: "endCompProgramRelease", icon: "timer", value: \.endCompProgramRelease),
                ], accent: accent, columns: 2)
            }
        }
    }
}

private struct KesshoMacRoutingPage: View {
    private let accent = KesshoMacDesign.accent(for: .routing)

    var body: some View {
        KesshoMacPageFrame(page: .routing) {
            KesshoMacCard(title: "Routing Matrix", symbol: "square.grid.3x3", accent: accent) {
                ScrollView(.horizontal, showsIndicators: true) {
                    LazyVGrid(
                        columns: [
                            GridItem(.fixed(104)),
                            GridItem(.fixed(150)),
                            GridItem(.fixed(150)),
                            GridItem(.fixed(150)),
                            GridItem(.fixed(150)),
                            GridItem(.fixed(150)),
                        ],
                        alignment: .leading,
                        spacing: 8
                    ) {
                        matrixHeader("")
                        matrixHeader("Level")
                        matrixHeader("Delay A")
                        matrixHeader("Delay B")
                        matrixHeader("Reverb")
                        matrixHeader("Granular")

                        routingRow("Pad", [
                            .init("Level", key: "synthLevel", value: \.synthLevel),
                            .init("A", key: "pad1DelayASend", value: \.pad1DelayASend),
                            .init("B", key: "pad1DelayBSend", value: \.pad1DelayBSend),
                            .init("Rev", key: "synthReverbSend", value: \.synthReverbSend),
                            .init("Grain", key: "granularPad1Send", value: \.granularPad1Send),
                        ])
                        routingRow("Lead 1", [
                            .init("Level", key: "leadLevel", value: \.leadLevel),
                            .init("A", key: "lead1DelayASend", value: \.lead1DelayASend),
                            .init("B", key: "lead1DelayBSend", value: \.lead1DelayBSend),
                            .init("Rev", key: "leadReverbSend", value: \.leadReverbSend),
                            .init("Grain", key: "granularLead1Send", value: \.granularLead1Send),
                        ])
                        routingRow("Lead 2", [
                            .init("Level", key: "lead2Level", value: \.lead2Level),
                            .init("A", key: "lead2DelayASend", value: \.lead2DelayASend),
                            .init("B", key: "lead2DelayBSend", value: \.lead2DelayBSend),
                            .init("Rev", key: "lead2ReverbSend", value: \.lead2ReverbSend),
                            .init("Grain", key: "granularLead2Send", value: \.granularLead2Send),
                        ])
                        routingRow("Piano", [
                            .init("Level", key: "pianoLevel", value: \.pianoLevel),
                            .init("A", key: "pianoDelayASend", value: \.pianoDelayASend),
                            .init("B", key: "pianoDelayBSend", value: \.pianoDelayBSend),
                            .init("Rev", key: "pianoReverbSend", value: \.pianoReverbSend),
                            .init("Grain", key: "granularPianoSend", value: \.granularPianoSend),
                        ])
                        routingRow("Drums", [
                            .init("Level", key: "drumLevel", value: \.drumLevel),
                            .init("A", key: "drumDelayASend", value: \.drumDelayASend),
                            .init("B", key: "drumDelayBSend", value: \.drumDelayBSend),
                            .init("Rev", key: "drumReverbSend", value: \.drumReverbSend),
                            .init("Grain", key: "granularDrumSend", value: \.granularDrumSend),
                        ])
                        Text("Granular")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(KesshoMacDesign.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        KesshoMacSliderRow(spec: .init("Level", key: "granularLevel", value: \.granularLevel), accent: accent)
                        KesshoMacSliderRow(spec: .init("A", key: "granularDelayASend", value: \.granularDelayASend), accent: accent)
                        KesshoMacSliderRow(spec: .init("B", key: "granularDelayBSend", value: \.granularDelayBSend), accent: accent)
                        KesshoMacSliderRow(spec: .init("Rev", key: "granularReverbSend", value: \.granularReverbSend), accent: accent)
                        blockedRoutingCell("Self")
                        routingRow("Waves", [
                            .init("Level", key: "oceanSampleLevel", value: \.oceanSampleLevel),
                            .init("A", key: "oceanDelayASend", value: \.oceanDelayASend),
                            .init("B", key: "oceanDelayBSend", value: \.oceanDelayBSend),
                            .init("Rev", key: "oceanReverbSend", value: \.oceanReverbSend),
                            .init("Grain", key: "granularWavesSend", value: \.granularWavesSend),
                        ])
                        routingRow("Water", [
                            .init("Level", key: "waterLevel", value: \.waterLevel),
                            .init("A", key: "waterDelayASend", value: \.waterDelayASend),
                            .init("B", key: "waterDelayBSend", value: \.waterDelayBSend),
                            .init("Rev", key: "waterReverbSend", value: \.waterReverbSend),
                            .init("Grain", key: "granularWaterSend", value: \.granularWaterSend),
                        ])
                        routingRow("Nature", [
                            .init("Level", key: "natureLevel", value: \.natureLevel),
                            .init("A", key: "natureDelayASend", value: \.natureDelayASend),
                            .init("B", key: "natureDelayBSend", value: \.natureDelayBSend),
                            .init("Rev", key: "natureReverbSend", value: \.natureReverbSend),
                            .init("Grain", key: "granularNatureSend", value: \.granularNatureSend),
                        ])
                        routingRow("Insects", [
                            .init("Level", key: "insectsSharedLevel", value: \.insectsSharedLevel),
                            .init("A", key: "insDelayASend", value: \.insDelayASend),
                            .init("B", key: "insDelayBSend", value: \.insDelayBSend),
                            .init("Rev", key: "insectsReverbSend", value: \.insectsReverbSend),
                            .init("Grain", key: "granularInsectsSend", value: \.granularInsectsSend),
                        ])
                    }
                    .frame(minWidth: 830, alignment: .leading)
                }
            }
        }
    }

    private func matrixHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(KesshoMacDesign.secondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func routingRow(_ title: String, _ specs: [KesshoMacSliderSpec]) -> some View {
        Group {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(KesshoMacDesign.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            ForEach(specs) { spec in
                KesshoMacSliderRow(spec: spec, accent: accent)
            }
        }
    }

    private func blockedRoutingCell(_ title: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "nosign")
                .font(.system(size: 11, weight: .semibold))
            Text(title)
                .font(.system(size: 11, weight: .semibold))
            Spacer()
        }
        .foregroundStyle(KesshoMacDesign.mutedText)
        .padding(.horizontal, 10)
        .frame(height: 42)
        .background(KesshoMacDesign.elevated.opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .stroke(KesshoMacDesign.border.opacity(0.55), lineWidth: 1)
        }
    }
}

private struct KesshoMacPageFrame<Content: View>: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let page: KesshoMacPage
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            content
        }
        .frame(maxWidth: KesshoMacDesign.pageMaxWidth, alignment: .top)
        .padding(.horizontal, horizontalSizeClass == .compact ? 10 : 18)
        .padding(.bottom, 28)
    }
}

private struct KesshoMacTwoColumn<Leading: View, Trailing: View>: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @ViewBuilder let leading: Leading
    @ViewBuilder let trailing: Trailing

    var body: some View {
        if horizontalSizeClass == .compact {
            VStack(alignment: .leading, spacing: 10) {
                leading
                    .frame(maxWidth: .infinity)
                trailing
                    .frame(maxWidth: .infinity)
            }
        } else {
            HStack(alignment: .top, spacing: 12) {
                leading
                    .frame(width: KesshoMacDesign.sidePanelWidth)
                trailing
                    .frame(maxWidth: .infinity)
            }
        }
    }
}

private extension SliderState {
    var chordRateDouble: Double {
        Double(chordRate)
    }

    var chordProgressionStepsDouble: Double {
        Double(chordProgressionSteps)
    }

    var oscBrightnessDouble: Double {
        Double(oscBrightness)
    }

    var synthOctaveDouble: Double {
        Double(synthOctave)
    }

    var drumEuclid1StepsDouble: Double {
        Double(drumEuclid1Steps)
    }

    var drumEuclid1HitsDouble: Double {
        Double(drumEuclid1Hits)
    }

    var drumEuclid1RotationDouble: Double {
        Double(drumEuclid1Rotation)
    }

    var drumEuclid2StepsDouble: Double {
        Double(drumEuclid2Steps)
    }

    var drumEuclid2HitsDouble: Double {
        Double(drumEuclid2Hits)
    }

    var drumEuclid2RotationDouble: Double {
        Double(drumEuclid2Rotation)
    }

    var drumEuclid3StepsDouble: Double {
        Double(drumEuclid3Steps)
    }

    var drumEuclid3HitsDouble: Double {
        Double(drumEuclid3Hits)
    }

    var drumEuclid3RotationDouble: Double {
        Double(drumEuclid3Rotation)
    }

    var drumEuclid4StepsDouble: Double {
        Double(drumEuclid4Steps)
    }

    var drumEuclid4HitsDouble: Double {
        Double(drumEuclid4Hits)
    }

    var drumEuclid4RotationDouble: Double {
        Double(drumEuclid4Rotation)
    }
}
