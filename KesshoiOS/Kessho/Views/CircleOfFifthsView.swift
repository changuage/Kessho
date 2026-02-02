import SwiftUI

/// Circle of Fifths visualization with current key, drift indicator, and morph path
struct CircleOfFifthsView: View {
    @EnvironmentObject var appState: AppState
    
    private let noteNames = ["C", "G", "D", "A", "E", "B", "F#", "C#", "Ab", "Eb", "Bb", "F"]
    
    /// Check if a morph is in progress with different root notes
    private var isMorphing: Bool {
        guard let presetA = appState.morphPresetA,
              let presetB = appState.morphPresetB,
              appState.morphPosition > 0 && appState.morphPosition < 100 else {
            return false
        }
        return presetA.state.rootNote != presetB.state.rootNote
    }
    
    /// Get morph start root (from preset A)
    private var morphStartRoot: Int? {
        appState.morphPresetA?.state.rootNote
    }
    
    /// Get morph target root (from preset B)
    private var morphTargetRoot: Int? {
        appState.morphPresetB?.state.rootNote
    }
    
    /// Get indices that are part of the morph path
    private var morphPathIndices: Set<Int> {
        guard isMorphing,
              let startRoot = morphStartRoot,
              let targetRoot = morphTargetRoot else {
            return []
        }
        
        let startIndex = COF_SEMITONES.firstIndex(of: startRoot) ?? 0
        let targetIndex = COF_SEMITONES.firstIndex(of: targetRoot) ?? 0
        
        // Calculate shortest path
        let cwDistance = (targetIndex - startIndex + 12) % 12
        let ccwDistance = (startIndex - targetIndex + 12) % 12
        let useCW = cwDistance <= ccwDistance
        let steps = useCW ? cwDistance : ccwDistance
        let direction = useCW ? 1 : -1
        
        var indices = Set<Int>()
        for i in 0...steps {
            let pathIndex = (startIndex + i * direction + 12) % 12
            indices.insert(pathIndex)
        }
        return indices
    }
    
    private var morphTargetIndex: Int? {
        guard let targetRoot = morphTargetRoot else { return nil }
        return COF_SEMITONES.firstIndex(of: targetRoot)
    }
    
    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height) * 0.85
            let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
            let radius = size / 2
            
            ZStack {
                // Outer ring - purple during morph
                Circle()
                    .stroke(isMorphing ? Color.purple.opacity(0.6) : Color.white.opacity(0.1), lineWidth: isMorphing ? 3 : 2)
                    .frame(width: size, height: size)
                
                // Note positions
                ForEach(0..<12, id: \.self) { index in
                    let angle = Angle(degrees: Double(index) * 30 - 90)
                    let noteCenter = pointOnCircle(center: center, radius: radius * 0.85, angle: angle)
                    
                    NoteIndicator(
                        name: noteNames[index],
                        isHome: isHomeKey(index),
                        isCurrent: isCurrentKey(index),
                        isInRange: isInDriftRange(index),
                        isMorphPath: morphPathIndices.contains(index),
                        isMorphTarget: index == morphTargetIndex,
                        onTap: {
                            // Set root note to the tapped note (semitone value)
                            appState.state.rootNote = COF_SEMITONES[index]
                            // Reset CoF drift when manually changing root
                            appState.audioEngine.resetCofDrift()
                        }
                    )
                    .position(noteCenter)
                }
                
                // Direction indicator arrow
                if appState.state.cofDriftEnabled && appState.state.cofDriftDirection != "random" {
                    DirectionArrow(
                        direction: appState.state.cofDriftDirection,
                        radius: radius * 1.0
                    )
                    .position(center)
                }
                
                // Center info
                VStack(spacing: 8) {
                    Text(currentNoteName)
                        .font(.system(size: 48, weight: .light))
                        .foregroundColor(isMorphing ? .purple : .white)
                    
                    Text("Current Key")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.5))
                    
                    if isMorphing, let targetIdx = morphTargetIndex {
                        // Show morph progress
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.right")
                                .font(.caption)
                            Text("\(noteNames[targetIdx]) (\(Int(appState.morphPosition))%)")
                                .font(.caption)
                        }
                        .foregroundColor(.purple.opacity(0.8))
                    } else if appState.state.cofDriftEnabled {
                        HStack(spacing: 4) {
                            Image(systemName: driftDirectionIcon)
                                .font(.caption)
                            Text("\(abs(appState.cofCurrentStep)) steps")
                                .font(.caption)
                        }
                        .foregroundColor(.white.opacity(0.4))
                    }
                }
                
                // Drift arc indicator
                if appState.state.cofDriftEnabled {
                    DriftRangeArc(
                        homeIndex: homeKeyIndex,
                        range: appState.state.cofDriftRange,
                        currentStep: appState.cofCurrentStep,
                        radius: radius * 0.65
                    )
                    .position(center)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding()
    }
    
    private var homeKeyIndex: Int {
        // Find the index of home root in CoF order
        let semitone = appState.state.rootNote
        return COF_SEMITONES.firstIndex(of: semitone) ?? 4  // Default to E
    }
    
    private var currentKeyIndex: Int {
        let effectiveStep = (homeKeyIndex + appState.cofCurrentStep + 12) % 12
        return effectiveStep
    }
    
    private var currentNoteName: String {
        return noteNames[currentKeyIndex]
    }
    
    private var driftDirectionIcon: String {
        if appState.cofCurrentStep > 0 {
            return "arrow.clockwise"
        } else if appState.cofCurrentStep < 0 {
            return "arrow.counterclockwise"
        }
        return "circle"
    }
    
    private func isHomeKey(_ index: Int) -> Bool {
        return index == homeKeyIndex
    }
    
    private func isCurrentKey(_ index: Int) -> Bool {
        return index == currentKeyIndex
    }
    
    private func isInDriftRange(_ index: Int) -> Bool {
        guard appState.state.cofDriftEnabled else { return false }
        let range = appState.state.cofDriftRange
        let distance = min(abs(index - homeKeyIndex), 12 - abs(index - homeKeyIndex))
        return distance <= range
    }
    
    private func pointOnCircle(center: CGPoint, radius: CGFloat, angle: Angle) -> CGPoint {
        CGPoint(
            x: center.x + radius * cos(CGFloat(angle.radians)),
            y: center.y + radius * sin(CGFloat(angle.radians))
        )
    }
}

/// Individual note indicator on the circle
struct NoteIndicator: View {
    let name: String
    let isHome: Bool
    let isCurrent: Bool
    let isInRange: Bool
    var isMorphPath: Bool = false   // Part of morph path
    var isMorphTarget: Bool = false // Target key during morph
    var onTap: (() -> Void)? = nil  // Optional tap handler for root note selection
    
    var body: some View {
        ZStack {
            // Background circle
            Circle()
                .fill(backgroundColor)
                .frame(width: 44, height: 44)
            
            // Border for home/current/morph
            if isHome || isCurrent || isMorphPath {
                Circle()
                    .stroke(borderColor, lineWidth: isMorphTarget ? 3 : 2)
                    .frame(width: 44, height: 44)
            }
            
            // Note name
            Text(name)
                .font(.system(size: 14, weight: isCurrent || isMorphTarget ? .bold : .regular))
                .foregroundColor(textColor)
        }
        .contentShape(Circle())
        .onTapGesture {
            onTap?()
        }
    }
    
    private var backgroundColor: Color {
        if isMorphTarget {
            return Color.purple.opacity(0.7)
        } else if isMorphPath && isCurrent {
            return Color.purple.opacity(0.5)
        } else if isMorphPath {
            return Color.purple.opacity(0.25)
        } else if isCurrent {
            return Color.blue.opacity(0.6)
        } else if isHome {
            return Color.green.opacity(0.3)
        } else if isInRange {
            return Color.white.opacity(0.1)
        }
        return Color.white.opacity(0.05)
    }
    
    private var borderColor: Color {
        if isMorphTarget {
            return Color.purple
        } else if isMorphPath {
            return Color.purple.opacity(0.6)
        } else if isCurrent {
            return Color.blue
        } else if isHome {
            return Color.green.opacity(0.6)
        }
        return Color.clear
    }
    
    private var textColor: Color {
        if isMorphTarget || (isMorphPath && isCurrent) {
            return .white
        } else if isMorphPath {
            return .purple.opacity(0.9)
        } else if isCurrent {
            return .white
        } else if isHome {
            return .green.opacity(0.9)
        } else if isInRange {
            return .white.opacity(0.7)
        }
        return .white.opacity(0.3)
    }
}

/// Direction indicator arrow (CW/CCW)
struct DirectionArrow: View {
    let direction: String  // "cw" or "ccw"
    let radius: CGFloat
    
    var body: some View {
        let angle = direction == "cw" ? Angle(degrees: -45) : Angle(degrees: -135)
        let rotation = direction == "cw" ? 45.0 : -45.0
        
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let arrowPos = CGPoint(
                x: center.x + radius * cos(CGFloat(angle.radians)),
                y: center.y + radius * sin(CGFloat(angle.radians))
            )
            
            // Draw arrow triangle
            var path = Path()
            let arrowSize: CGFloat = 10
            path.move(to: CGPoint(x: 0, y: -arrowSize))
            path.addLine(to: CGPoint(x: arrowSize, y: arrowSize))
            path.addLine(to: CGPoint(x: -arrowSize, y: arrowSize))
            path.closeSubpath()
            
            // Transform and draw
            let transform = CGAffineTransform(translationX: arrowPos.x, y: arrowPos.y)
                .rotated(by: rotation * .pi / 180)
            
            context.fill(
                path.applying(transform),
                with: .color(.gray.opacity(0.6))
            )
        }
        .frame(width: radius * 2 + 30, height: radius * 2 + 30)
    }
}

/// Arc showing the drift range
struct DriftRangeArc: View {
    let homeIndex: Int
    let range: Int
    let currentStep: Int
    let radius: CGFloat
    
    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            
            // Draw range arc
            let startAngle = Angle(degrees: Double(homeIndex - range) * 30 - 90)
            let endAngle = Angle(degrees: Double(homeIndex + range) * 30 - 90)
            
            var path = Path()
            path.addArc(
                center: center,
                radius: radius,
                startAngle: startAngle,
                endAngle: endAngle,
                clockwise: false
            )
            
            context.stroke(
                path,
                with: .color(.white.opacity(0.2)),
                lineWidth: 4
            )
            
            // Draw current position indicator
            let currentAngle = Angle(degrees: Double(homeIndex + currentStep) * 30 - 90)
            let indicatorPos = CGPoint(
                x: center.x + radius * cos(CGFloat(currentAngle.radians)),
                y: center.y + radius * sin(CGFloat(currentAngle.radians))
            )
            
            var indicatorPath = Path()
            indicatorPath.addEllipse(in: CGRect(
                x: indicatorPos.x - 6,
                y: indicatorPos.y - 6,
                width: 12,
                height: 12
            ))
            
            context.fill(indicatorPath, with: .color(.blue))
        }
        .frame(width: radius * 2 + 20, height: radius * 2 + 20)
    }
}

#Preview {
    CircleOfFifthsView()
        .background(Color.black)
        .environmentObject(AppState())
}
