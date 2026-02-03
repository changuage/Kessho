import SwiftUI

// MARK: - Macro Slider Configuration (matches web app)
struct MacroSlider {
    let key: WritableKeyPath<SliderState, Double>
    let reverbSendKey: WritableKeyPath<SliderState, Double>?  // Width control (reverb send, decay, or filter)
    let label: String
    let color: Color
    let min: Double
    let max: Double
}

/// Macro sliders for the 6 snowflake arms (matches web MACRO_SLIDERS)
/// Order: Reverb (top), Synth (2:00), Granular (4:00), Lead (6:00), Drum (8:00), Wave (10:00)
private let MACRO_SLIDERS: [MacroSlider] = [
    MacroSlider(key: \.reverbLevel, reverbSendKey: \.reverbDecay, label: "Reverb", color: Color(red: 232/255, green: 220/255, blue: 196/255), min: 0, max: 2),  // #E8DCC4 cream
    MacroSlider(key: \.synthLevel, reverbSendKey: \.synthReverbSend, label: "Synth", color: Color(red: 196/255, green: 114/255, blue: 78/255), min: 0, max: 1),   // #C4724E orange
    MacroSlider(key: \.granularLevel, reverbSendKey: \.granularReverbSend, label: "Granular", color: Color(red: 123/255, green: 154/255, blue: 109/255), min: 0, max: 4), // #7B9A6D sage
    MacroSlider(key: \.leadLevel, reverbSendKey: \.leadReverbSend, label: "Lead", color: Color(red: 212/255, green: 165/255, blue: 32/255), min: 0, max: 1),       // #D4A520 gold
    MacroSlider(key: \.drumLevel, reverbSendKey: \.drumReverbSend, label: "Drum", color: Color(red: 139/255, green: 92/255, blue: 246/255), min: 0, max: 1),       // #8B5CF6 purple
    MacroSlider(key: \.oceanSampleLevel, reverbSendKey: \.oceanFilterCutoff, label: "Wave", color: Color(red: 90/255, green: 123/255, blue: 138/255), min: 0, max: 1), // #5A7B8A slate
]

/// Logarithmic curve for slider position (matches web LOG_CURVE = 2.5)
private let LOG_CURVE: Double = 2.5

/// Convert actual value to slider position (0-1) with logarithmic scaling
private func valueToSliderPosition(_ value: Double, min: Double, max: Double) -> Double {
    if max <= min { return 0 }
    let normalized = (value - min) / (max - min)
    // Inverse of log curve: position = value^(1/curve)
    return pow(Swift.max(0, Swift.min(1, normalized)), 1 / LOG_CURVE)
}

/// Convert slider position (0-1) to actual value with logarithmic scaling
private func sliderPositionToValue(_ position: Double, min: Double, max: Double) -> Double {
    // Apply log curve: value = position^curve
    let curved = pow(Swift.max(0, Swift.min(1, position)), LOG_CURVE)
    return min + curved * (max - min)
}

/// Get normalized width values with exponential curves (matches web getArmValues)
private func getWidthValue(for slider: MacroSlider, state: SliderState) -> Double {
    guard let sendKey = slider.reverbSendKey else { return 0.3 }
    let sendValue = state[keyPath: sendKey]
    
    // Normalize: oceanFilterCutoff is 40-12000 Hz, others are 0-1
    let normalized: Double
    if sendKey == \SliderState.oceanFilterCutoff {
        normalized = Swift.max(0, Swift.min(1, (sendValue - 40) / (12000 - 40)))
    } else {
        normalized = Swift.max(0, Swift.min(1, sendValue))
    }
    
    // Apply exponential curve: drum gets 0.1, others get 0.5
    let exponent: Double = sendKey == \SliderState.drumReverbSend ? 0.1 : 0.5
    return pow(normalized, exponent)
}

/// Interactive Snowflake UI with draggable arms (matches web SnowflakeUI.tsx)
struct SnowflakeView: View {
    @EnvironmentObject var appState: AppState
    
    // Drag state for prong handles (level)
    @State private var draggingArm: Int? = nil
    @State private var hoveringArm: Int? = nil
    
    // Drag state for prong body (width/reverb send)
    @State private var draggingWidth: Int? = nil
    @State private var hoveringWidth: Int? = nil
    @State private var dragStartPoint: CGPoint = .zero
    @State private var dragStartValue: Double = 0
    
    // Special drag states for center hexagon (tension) and outer ring (master volume)
    @State private var draggingCenter: Bool = false
    @State private var draggingRing: Bool = false
    
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
            let baseHexRadius: CGFloat = 35 * scaleFactor  // Fixed for interaction calculations
            let outerRingRadius: CGFloat = 250 * scaleFactor
            
            // Master volume controls arm length
            let masterScale = appState.state.masterVolume
            let maxArmLength: CGFloat = 140 * scaleFactor * masterScale
            
            ZStack {
                // Canvas for snowflake branches (decorative, drawn based on current values)
                Canvas { context, canvasSize in
                    let canvasCenter = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                    
                    // Draw decorative branches for each arm
                    for arm in 0..<6 {
                        let value = appState.state[keyPath: MACRO_SLIDERS[arm].key]
                        let position = valueToSliderPosition(value, min: MACRO_SLIDERS[arm].min, max: MACRO_SLIDERS[arm].max)
                        let width = getWidthValue(for: MACRO_SLIDERS[arm], state: appState.state)
                        let armLength = baseRadius * 0.7 + position * maxArmLength
                        let angle = Angle(degrees: Double(arm) * 60 - 90)
                        
                        // Check if this arm's width is being dragged (highlight)
                        let isWidthActive = draggingWidth == arm || hoveringWidth == arm
                        let highlightColor = isWidthActive ? MACRO_SLIDERS[arm].color : nil
                        
                        // Draw arm with branches (both mirror directions)
                        for mirror in [-1.0, 1.0] {
                            drawBranch(
                                context: context,
                                from: canvasCenter,
                                angle: angle.radians + mirror * 0.1,
                                length: armLength,
                                width: width,
                                depth: 3,
                                seed: arm * 1000 + Int(mirror * 100),
                                highlightColor: highlightColor
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
                                let minRadius = baseHexRadius * 1.5
                                let maxRadius = outerRingRadius
                                let normalized = Swift.max(0, Swift.min(1, (distance - minRadius) / (maxRadius - minRadius)))
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
                                let minRadius = baseHexRadius * 0.5
                                let maxRadius = baseHexRadius * 2.5
                                let normalized = Swift.max(0, Swift.min(1, (distance - minRadius) / (maxRadius - minRadius)))
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
                
                // Interactive arm handles + invisible hit areas for width
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
                    
                    let lineStart = CGPoint(
                        x: center.x + cos(angle.radians) * interactionBaseRadius,
                        y: center.y + sin(angle.radians) * interactionBaseRadius
                    )
                    
                    let isActive = draggingArm == arm || hoveringArm == arm
                    let isWidthActive = draggingWidth == arm || hoveringWidth == arm
                    let handleRadius: CGFloat = isActive ? 18 * scaleFactor : 14 * scaleFactor
                    
                    // Wide invisible hit area for width drag (4x wider than prong)
                    Path { path in
                        path.move(to: lineStart)
                        path.addLine(to: handlePos)
                    }
                    .stroke(Color.clear, style: StrokeStyle(lineWidth: 32 * scaleFactor, lineCap: .round))
                    .contentShape(
                        Path { path in
                            path.move(to: lineStart)
                            path.addLine(to: handlePos)
                        }.strokedPath(StrokeStyle(lineWidth: 32 * scaleFactor, lineCap: .round))
                    )
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { gestureValue in
                                if draggingWidth == nil {
                                    // Start of drag - capture initial position and value
                                    draggingWidth = arm
                                    dragStartPoint = gestureValue.startLocation
                                    if let sendKey = slider.reverbSendKey {
                                        let sendValue = appState.state[keyPath: sendKey]
                                        // Normalize: oceanFilterCutoff is 40-12000 Hz
                                        if sendKey == \SliderState.oceanFilterCutoff {
                                            dragStartValue = (sendValue - 40) / (12000 - 40)
                                        } else {
                                            dragStartValue = sendValue
                                        }
                                    }
                                }
                                
                                // Calculate tangential movement (perpendicular to prong direction)
                                let prongAngle = angle.radians
                                let tangentX = -sin(prongAngle)
                                let tangentY = cos(prongAngle)
                                let deltaX = gestureValue.location.x - dragStartPoint.x
                                let deltaY = gestureValue.location.y - dragStartPoint.y
                                let tangentMovement = deltaX * tangentX + deltaY * tangentY
                                
                                // Scale: ~100 pixels = full range
                                let sensitivity: CGFloat = 100
                                let normalizedValue = Swift.max(0, Swift.min(1, dragStartValue + Double(tangentMovement / sensitivity)))
                                
                                // Update the appropriate parameter
                                if let sendKey = slider.reverbSendKey {
                                    if sendKey == \SliderState.oceanFilterCutoff {
                                        let hzValue = 40 + normalizedValue * (12000 - 40)
                                        appState.state[keyPath: sendKey] = hzValue
                                    } else {
                                        appState.state[keyPath: sendKey] = normalizedValue
                                    }
                                }
                            }
                            .onEnded { _ in
                                draggingWidth = nil
                            }
                    )
                    
                    // Arm line (visible)
                    Path { path in
                        path.move(to: lineStart)
                        path.addLine(to: handlePos)
                    }
                    .stroke(
                        isWidthActive ? slider.color : (isActive ? slider.color : Color.white.opacity(0.3)),
                        style: StrokeStyle(lineWidth: isWidthActive ? 8 : (isActive ? 3 : 2), lineCap: .round)
                    )
                    .shadow(color: isWidthActive ? slider.color.opacity(0.8) : (isActive ? slider.color.opacity(0.8) : .clear), radius: isWidthActive ? 12 : 8)
                    .allowsHitTesting(false)  // Let the invisible hit area handle touches
                    
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
                                    let normalizedDistance = Swift.max(0, Swift.min(1, (distance - interactionBaseRadius) / interactionMaxLength))
                                    let newValue = sliderPositionToValue(normalizedDistance, min: slider.min, max: slider.max)
                                    appState.state[keyPath: slider.key] = newValue
                                }
                                .onEnded { _ in
                                    draggingArm = nil
                                }
                        )
                    
                    // Width label (shown when dragging/hovering prong body)
                    if isWidthActive, let sendKey = slider.reverbSendKey {
                        let sendValue = appState.state[keyPath: sendKey]
                        let labelText: String = {
                            if sendKey == \SliderState.oceanFilterCutoff {
                                return "Filter: \(Int(sendValue / 1000))kHz"
                            } else if sendKey == \SliderState.reverbDecay {
                                return "Decay: \(Int(sendValue * 100))%"
                            } else {
                                return "Verb: \(Int(sendValue * 100))%"
                            }
                        }()
                        
                        Text(labelText)
                            .font(.system(size: max(9, 10 * scaleFactor), weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.black.opacity(0.85))
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(slider.color, lineWidth: 1))
                            .cornerRadius(4)
                            .position(
                                x: handlePos.x,
                                y: handlePos.y + (handlePos.y > center.y ? -35 * scaleFactor : 35 * scaleFactor)
                            )
                            .allowsHitTesting(false)
                    }
                    
                    // Level label
                    Text("\(slider.label): \(slider.max > 1 ? String(format: "%.1f", value) : "\(Int(value * 100))%")")
                        .font(.system(size: max(9, 11 * scaleFactor), weight: .bold))
                        .foregroundColor(.white)
                        .shadow(color: .black, radius: 3)
                        .position(
                            x: handlePos.x,
                            y: handlePos.y + (handlePos.y > center.y ? 25 * scaleFactor : -25 * scaleFactor)
                        )
                        .allowsHitTesting(false)
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
    
    /// Draw recursive branch with width-based complexity (matches web drawArm)
    /// - width: Controls line thickness and branch density (0-1)
    /// - highlightColor: Optional glow color when width is being dragged
    private func drawBranch(
        context: GraphicsContext,
        from origin: CGPoint,
        angle: Double,
        length: CGFloat,
        width: Double,
        depth: Int,
        seed: Int,
        highlightColor: Color? = nil
    ) {
        guard depth > 0 && length > 5 else { return }
        
        let endPoint = CGPoint(
            x: origin.x + cos(angle) * length,
            y: origin.y + sin(angle) * length
        )
        
        var path = Path()
        path.move(to: origin)
        path.addLine(to: endPoint)
        
        // Width affects line thickness (reduced by ~20% for cleaner look)
        let widthMultiplier = 0.4 + width * 1.2  // 0.4x to 1.6x
        let lineWidth = CGFloat(depth) * 0.5 * widthMultiplier
        
        let opacity = 0.1 + Double(depth) * 0.15
        
        if let highlight = highlightColor {
            // Draw with glow when highlighted
            var glowContext = context
            glowContext.addFilter(.shadow(color: highlight.opacity(0.7), radius: 8))
            glowContext.stroke(path, with: .color(highlight), lineWidth: max(1, lineWidth))
        } else {
            context.stroke(path, with: .color(.white.opacity(opacity)), lineWidth: max(1, lineWidth))
        }
        
        // Add sub-branches based on width (reverb send controls complexity)
        if depth > 1 {
            // Branch probability based on width
            let branchDensity = 0.2 + width * 0.6  // 20-80%
            let numBranches = Int(1 + branchDensity * 2.5)  // 1-3 branches
            
            let rng = seededRandom(seed)
            
            for i in 0..<numBranches {
                if rng() > branchDensity { continue }
                
                let branchAngleOffset = 0.4 + rng() * 0.3
                let branchLengthRatio = 0.45 + rng() * 0.25
                let t = 0.25 + rng() * 0.6  // Position along branch
                
                let branchX = origin.x + cos(angle) * length * t
                let branchY = origin.y + sin(angle) * length * t
                
                drawBranch(
                    context: context,
                    from: CGPoint(x: branchX, y: branchY),
                    angle: angle + branchAngleOffset,
                    length: length * branchLengthRatio,
                    width: width,
                    depth: depth - 1,
                    seed: seed * 2 + i,
                    highlightColor: highlightColor
                )
            }
        }
        
        // End crystal (reduced by 20%)
        if depth >= 2 || length < 10 {
            let crystalSize = max(1, lineWidth * 0.65)
            let crystalPath = Path(ellipseIn: CGRect(
                x: endPoint.x - crystalSize / 2,
                y: endPoint.y - crystalSize / 2,
                width: crystalSize,
                height: crystalSize
            ))
            if let highlight = highlightColor {
                var glowContext = context
                glowContext.addFilter(.shadow(color: highlight.opacity(0.6), radius: 6))
                glowContext.fill(crystalPath, with: .color(highlight))
            } else {
                context.fill(crystalPath, with: .color(.white.opacity(0.8)))
            }
        }
    }
    
    /// Seeded random for consistent branch patterns
    private func seededRandom(_ seed: Int) -> () -> Double {
        var s = seed
        return {
            s = (s * 1103515245 + 12345) & 0x7fffffff
            return Double(s) / Double(0x7fffffff)
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

#Preview {
    SnowflakeView()
        .background(Color.black)
        .environmentObject(AppState())
}
