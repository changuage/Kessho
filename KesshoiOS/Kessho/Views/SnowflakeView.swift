import SwiftUI

// MARK: - Macro Slider Configuration (matches web app)
struct MacroSlider {
    let key: WritableKeyPath<SliderState, Double>
    let label: String
    let color: Color
    let min: Double
    let max: Double
}

/// Macro sliders for the 6 snowflake arms (matches web MACRO_SLIDERS)
private let MACRO_SLIDERS: [MacroSlider] = [
    MacroSlider(key: \.reverbLevel, label: "Reverb", color: Color(red: 0.2, green: 0.6, blue: 0.9), min: 0, max: 1),
    MacroSlider(key: \.synthLevel, label: "Synth", color: Color(red: 0.9, green: 0.6, blue: 0.2), min: 0, max: 1),
    MacroSlider(key: \.granularLevel, label: "Granular", color: Color(red: 0.4, green: 0.8, blue: 0.4), min: 0, max: 1),
    MacroSlider(key: \.leadLevel, label: "Lead", color: Color(red: 0.8, green: 0.4, blue: 0.6), min: 0, max: 1),
    MacroSlider(key: \.synthReverbSend, label: "Synth Verb", color: Color(red: 0.5, green: 0.4, blue: 0.9), min: 0, max: 1),
    MacroSlider(key: \.granularReverbSend, label: "Gran Verb", color: Color(red: 0.3, green: 0.7, blue: 0.7), min: 0, max: 1)
]

/// Logarithmic curve for slider position (matches web LOG_CURVE = 2.5)
private let LOG_CURVE: Double = 2.5

/// Convert actual value to slider position (0-1) with logarithmic scaling
private func valueToSliderPosition(_ value: Double, min: Double, max: Double) -> Double {
    if max <= min { return 0 }
    let normalized = (value - min) / (max - min)
    // Inverse of log curve: position = value^(1/curve)
    return pow(max(0, min(1, normalized)), 1 / LOG_CURVE)
}

/// Convert slider position (0-1) to actual value with logarithmic scaling
private func sliderPositionToValue(_ position: Double, min: Double, max: Double) -> Double {
    // Apply log curve: value = position^curve
    let curved = pow(max(0, Swift.min(1, position)), LOG_CURVE)
    return min + curved * (max - min)
}

/// Interactive Snowflake UI with draggable arms (matches web SnowflakeUI.tsx)
struct SnowflakeView: View {
    @EnvironmentObject var appState: AppState
    
    // Drag state
    @State private var draggingArm: Int? = nil
    @State private var hoveringArm: Int? = nil
    @State private var draggingCenter: Bool = false  // For tension
    @State private var draggingRing: Bool = false    // For master volume
    
    // Animation
    @State private var pulsePhase: Double = 0
    private let timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()
    
    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height) * 0.85
            let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
            let scaleFactor = size / 600
            
            // Tension controls hexagon size (1x to 3x)
            let hexagonScale = 1 + appState.state.tension * 2
            let baseRadius: CGFloat = 35 * scaleFactor * hexagonScale
            let outerRingRadius: CGFloat = 250 * scaleFactor
            
            // Master volume controls arm length
            let masterScale = appState.state.masterVolume
            let maxArmLength: CGFloat = 160 * scaleFactor * masterScale
            
            ZStack {
                // Canvas for snowflake branches (decorative, drawn based on current values)
                Canvas { context, canvasSize in
                    let canvasCenter = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                    
                    // Draw decorative branches for each arm
                    for arm in 0..<6 {
                        let value = appState.state[keyPath: MACRO_SLIDERS[arm].key]
                        let position = valueToSliderPosition(value, min: MACRO_SLIDERS[arm].min, max: MACRO_SLIDERS[arm].max)
                        let armLength = baseRadius * 0.7 + position * maxArmLength
                        let angle = Angle(degrees: Double(arm) * 60 - 90)
                        
                        // Draw arm with branches (both mirror directions)
                        for mirror in [-1.0, 1.0] {
                            drawBranch(
                                context: context,
                                from: canvasCenter,
                                angle: angle.radians + mirror * 0.1,
                                length: armLength,
                                depth: 3,
                                seed: arm * 1000 + Int(mirror * 100)
                            )
                        }
                    }
                }
                .frame(width: size, height: size)
                .position(center)
                
                // Outer ring for Master Volume
                Circle()
                    .stroke(
                        draggingRing ? Color(red: 0.24, green: 0.44, blue: 0.5) : Color(red: 0.24, green: 0.44, blue: 0.5).opacity(0.35),
                        lineWidth: draggingRing ? 8 : 4
                    )
                    .frame(width: outerRingRadius * 2, height: outerRingRadius * 2)
                    .position(center)
                    .shadow(color: draggingRing ? Color(red: 0.24, green: 0.44, blue: 0.5).opacity(0.7) : .clear, radius: 12)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                draggingRing = true
                                let dx = value.location.x - center.x
                                let dy = value.location.y - center.y
                                let distance = sqrt(dx * dx + dy * dy)
                                let minRadius = 35 * scaleFactor * 1.5
                                let maxRadius = outerRingRadius
                                let normalized = max(0, min(1, (distance - minRadius) / (maxRadius - minRadius)))
                                appState.state.masterVolume = normalized
                            }
                            .onEnded { _ in
                                draggingRing = false
                            }
                    )
                
                // Center hexagon for Tension
                HexagonShape()
                    .fill(draggingCenter ? Color(red: 0.76, green: 0.58, blue: 0.04).opacity(0.25) : Color.white.opacity(0.05))
                    .overlay(
                        HexagonShape()
                            .stroke(
                                draggingCenter ? Color(red: 0.76, green: 0.58, blue: 0.04) : Color(red: 0.96, green: 0.91, blue: 0.84).opacity(0.4),
                                lineWidth: draggingCenter ? 3 : 2
                            )
                    )
                    .frame(width: baseRadius * 1.4, height: baseRadius * 1.4)
                    .position(center)
                    .shadow(color: draggingCenter ? Color(red: 0.76, green: 0.58, blue: 0.04).opacity(0.7) : .clear, radius: 10)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                draggingCenter = true
                                let dx = value.location.x - center.x
                                let dy = value.location.y - center.y
                                let distance = sqrt(dx * dx + dy * dy)
                                let minRadius = 35 * scaleFactor * 0.5
                                let maxRadius = 35 * scaleFactor * 2.5
                                let normalized = max(0, min(1, (distance - minRadius) / (maxRadius - minRadius)))
                                appState.state.tension = normalized
                            }
                            .onEnded { _ in
                                draggingCenter = false
                            }
                    )
                
                // Play/pause indicator in center
                Image(systemName: appState.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: max(14, 20 * hexagonScale * scaleFactor)))
                    .foregroundColor(appState.isPlaying ? Color(red: 0.23, green: 0.44, blue: 0.73) : Color.gray.opacity(0.5))
                    .position(center)
                
                // Interactive arm handles
                ForEach(0..<6, id: \.self) { arm in
                    let slider = MACRO_SLIDERS[arm]
                    let value = appState.state[keyPath: slider.key]
                    let position = valueToSliderPosition(value, min: slider.min, max: slider.max)
                    let angle = Angle(degrees: Double(arm) * 60 - 90)
                    
                    let interactionBaseRadius: CGFloat = 35 * scaleFactor
                    let interactionMaxLength: CGFloat = 160 * scaleFactor
                    let armLength = interactionBaseRadius + position * interactionMaxLength
                    
                    let handlePos = CGPoint(
                        x: center.x + cos(angle.radians) * armLength,
                        y: center.y + sin(angle.radians) * armLength
                    )
                    
                    let isActive = draggingArm == arm || hoveringArm == arm
                    let handleRadius: CGFloat = isActive ? 18 * scaleFactor : 14 * scaleFactor
                    
                    // Arm line
                    Path { path in
                        let lineStart = CGPoint(
                            x: center.x + cos(angle.radians) * (35 * scaleFactor * 0.7),
                            y: center.y + sin(angle.radians) * (35 * scaleFactor * 0.7)
                        )
                        path.move(to: lineStart)
                        path.addLine(to: handlePos)
                    }
                    .stroke(
                        isActive ? slider.color : Color.white.opacity(0.3),
                        style: StrokeStyle(lineWidth: isActive ? 3 : 2, lineCap: .round)
                    )
                    .shadow(color: isActive ? slider.color.opacity(0.8) : .clear, radius: 8)
                    
                    // Handle circle
                    Circle()
                        .fill(slider.color)
                        .overlay(Circle().stroke(Color.white, lineWidth: 2))
                        .frame(width: handleRadius * 2, height: handleRadius * 2)
                        .position(handlePos)
                        .shadow(color: isActive ? slider.color.opacity(0.8) : Color.black.opacity(0.3), radius: isActive ? 12 : 4)
                        .gesture(
                            DragGesture()
                                .onChanged { gestureValue in
                                    draggingArm = arm
                                    let dx = gestureValue.location.x - center.x
                                    let dy = gestureValue.location.y - center.y
                                    let distance = sqrt(dx * dx + dy * dy)
                                    let normalizedDistance = max(0, min(1, (distance - interactionBaseRadius) / interactionMaxLength))
                                    let newValue = sliderPositionToValue(normalizedDistance, min: slider.min, max: slider.max)
                                    appState.state[keyPath: slider.key] = newValue
                                }
                                .onEnded { _ in
                                    draggingArm = nil
                                }
                        )
                    
                    // Label
                    Text("\(slider.label): \(Int(value * 100))%")
                        .font(.system(size: max(9, 11 * scaleFactor), weight: .bold))
                        .foregroundColor(.white)
                        .shadow(color: .black, radius: 3)
                        .position(
                            x: handlePos.x,
                            y: handlePos.y + (handlePos.y > center.y ? 25 * scaleFactor : -25 * scaleFactor)
                        )
                }
                
                // Volume/Tension labels when dragging
                if draggingRing {
                    Text("Volume: \(Int(appState.state.masterVolume * 100))%")
                        .font(.system(size: 11 * scaleFactor, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.black.opacity(0.85))
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(red: 0.24, green: 0.44, blue: 0.5), lineWidth: 1))
                        .cornerRadius(4)
                        .position(x: center.x, y: center.y - outerRingRadius - 30 * scaleFactor)
                }
                
                if draggingCenter {
                    Text("Tension: \(Int(appState.state.tension * 100))%")
                        .font(.system(size: 11 * scaleFactor, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.black.opacity(0.85))
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(red: 0.76, green: 0.58, blue: 0.04), lineWidth: 1))
                        .cornerRadius(4)
                        .position(x: center.x, y: center.y + baseRadius + 30 * scaleFactor)
                }
            }
        }
        .onReceive(timer) { _ in
            if appState.isPlaying {
                pulsePhase += 0.02
                if pulsePhase > .pi * 2 { pulsePhase -= .pi * 2 }
            }
        }
    }
    
    /// Draw recursive branch (simplified version of web's drawArm)
    private func drawBranch(context: GraphicsContext, from origin: CGPoint, angle: Double, length: CGFloat, depth: Int, seed: Int) {
        guard depth > 0 && length > 5 else { return }
        
        let endPoint = CGPoint(
            x: origin.x + cos(angle) * length,
            y: origin.y + sin(angle) * length
        )
        
        var path = Path()
        path.move(to: origin)
        path.addLine(to: endPoint)
        
        let opacity = 0.1 + Double(depth) * 0.15
        context.stroke(path, with: .color(.white.opacity(opacity)), lineWidth: CGFloat(depth) * 0.5)
        
        // Add sub-branches
        if depth > 1 {
            let branchAngleOffset = 0.4 + Double(seed % 100) / 200.0
            let branchLengthRatio = 0.5 + Double(seed % 50) / 100.0
            
            // Left branch
            drawBranch(
                context: context,
                from: CGPoint(x: origin.x + cos(angle) * length * 0.5, y: origin.y + sin(angle) * length * 0.5),
                angle: angle - branchAngleOffset,
                length: length * branchLengthRatio,
                depth: depth - 1,
                seed: seed * 2
            )
            
            // Right branch
            drawBranch(
                context: context,
                from: CGPoint(x: origin.x + cos(angle) * length * 0.5, y: origin.y + sin(angle) * length * 0.5),
                angle: angle + branchAngleOffset,
                length: length * branchLengthRatio,
                depth: depth - 1,
                seed: seed * 2 + 1
            )
        }
    }
}

/// Hexagon shape for center
struct HexagonShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        
        for i in 0..<6 {
            let angle = Double(i) * .pi / 3 - .pi / 2
            let point = CGPoint(
                x: center.x + cos(angle) * radius,
                y: center.y + sin(angle) * radius
            )
            if i == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }
}

/// Single arm of the snowflake (DEPRECATED - now using interactive draggable arms)
// Old SnowflakeArm, CenterCrystal, ParameterRing, and ParameterIndicator have been
// replaced by the new interactive snowflake UI with draggable handles.

#Preview {
    SnowflakeView()
        .background(Color.black)
        .environmentObject(AppState())
}
