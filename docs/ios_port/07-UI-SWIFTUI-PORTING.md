# UI Architecture & SwiftUI Porting Guide

## Web UI Component Structure

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        App.tsx                                                   │
│                                   (Main Application)                                             │
│                                                                                                  │
│  State Management:                                                                               │
│  • useState<SliderState> for all parameters                                                      │
│  • useState<boolean> for isPlaying, showAdvanced, etc.                                          │
│  • useState<SavedPreset[]> for presets                                                          │
│  • useRef for audio element (iOS media session)                                                 │
│  • useCallback for memoized handlers                                                            │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                    UI MODES                                                │ │
│  │                                                                                            │ │
│  │   ┌──────────────────────────────┐         ┌──────────────────────────────┐               │ │
│  │   │      SnowflakeUI.tsx         │◄────────►│     Advanced Panel           │               │ │
│  │   │   (Main Visual Interface)    │  Toggle  │   (Full Parameter Control)   │               │ │
│  │   │                              │          │                              │               │ │
│  │   │  • 6 macro slider arms      │          │  Sections:                   │               │ │
│  │   │  • Center hexagon (tension) │          │  • Mixer                     │               │ │
│  │   │  • Outer ring (master vol)  │          │  • Harmony                   │               │ │
│  │   │  • Play/Pause button        │          │  • Timbre                    │               │ │
│  │   │  • Settings icon            │          │  • Space (Reverb)            │               │ │
│  │   │  • Preset selector          │          │  • Granular                  │               │ │
│  │   │                              │          │  • Lead                      │               │ │
│  │   │  ┌────────────────────────┐ │          │  • Ocean                     │               │ │
│  │   │  │ CircleOfFifths.tsx    │ │          │  • Circle of Fifths          │               │ │
│  │   │  │ (Key visualization)    │ │          │                              │               │ │
│  │   │  └────────────────────────┘ │          │  100+ sliders, toggles,      │               │ │
│  │   │                              │          │  dropdowns                   │               │ │
│  │   └──────────────────────────────┘         └──────────────────────────────┘               │ │
│  │                                                                                            │ │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                  │
│  Audio Connection:                                                                               │
│  • audioEngine.start(sliderState)                                                               │
│  • audioEngine.updateParams(sliderState)                                                        │
│  • audioEngine.stop()                                                                           │
│  • setupIOSMediaSession() for lock screen controls                                              │
│                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## SnowflakeUI Component

### Visual Layout

```
                                    ╱╲
                                   ╱  ╲
                                  ╱    ╲
                                 ╱      ╲
                     arm[5]     ╱   ⬡    ╲     arm[1]
                               ╱  tension ╲
                              ╱     ○      ╲
                             ╱   master    ╲
               arm[4]       ╱    volume     ╲       arm[2]
                           ╱                 ╲
                          ╱                   ╲
                         ╱                     ╲
                        ╱                       ╲
                                arm[3]

        arm[0]: reverbLevel      arm[1]: synthLevel
        arm[2]: granularLevel    arm[3]: leadLevel
        arm[4]: granularReverbSend   arm[5]: synthReverbSend
        
        Hexagon: tension (0-1)
        Outer Ring: masterVolume (0-1)
```

### Interaction Model

| Interaction | Target | Action |
|-------------|--------|--------|
| Drag on arm | Arm segment | Adjust arm's parameter (log scale) |
| Drag on hexagon | Center hexagon | Adjust tension |
| Drag on outer ring | Ring perimeter | Adjust masterVolume |
| Tap center play button | Play/Pause | Toggle audio engine |
| Tap settings icon | Bottom right | Show advanced panel |
| Tap presets | Top area | Open preset selector |

### Arm Drawing Algorithm

Each arm is drawn with recursive branching based on its value:

```javascript
function drawArm(ctx, complexity, armIndex, maxLength, baseWidth) {
    const rng = seededRandom(armIndex * 1000 + 42);
    
    // Complexity (0-1) affects:
    const maxDepth = Math.floor(1 + complexity * 3);      // 1-4 levels
    const branchProbability = 0.4 + complexity * 0.5;     // 40-90%
    const stemLength = maxLength * (0.3 + complexity * 0.7);
    const numMainShoots = Math.floor(2 + complexity * 4); // 2-6 shoots
    
    // Draw main stem
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stemLength, 0);
    ctx.stroke();
    
    // Draw shoots with recursive sub-branches
    for (let i = 0; i < numMainShoots; i++) {
        const t = 0.2 + (i / numMainShoots) * 0.7;
        const shootX = stemLength * t;
        const shootLength = stemLength * (0.5 - t * 0.3) * (0.6 + complexity * 0.4);
        
        drawBranch(shootX, 0, angle, shootLength, baseWidth * 0.7, 1);
    }
    
    function drawBranch(x, y, angle, length, width, depth) {
        if (depth > maxDepth || length < 4) return;
        
        // Draw branch
        // Recursively spawn sub-branches
    }
}
```

### Logarithmic Slider Scaling

Lower values get more visual space (important for mix levels):

```javascript
const LOG_CURVE = 2.5;

// Value → Position (for display)
function valueToSliderPosition(value, min, max) {
    const normalized = (value - min) / (max - min);
    return Math.pow(normalized, 1 / LOG_CURVE);
}

// Position → Value (for control)
function sliderPositionToValue(position, min, max) {
    const curved = Math.pow(position, LOG_CURVE);
    return min + curved * (max - min);
}
```

## Circle of Fifths Component

### SVG Layout

```
        Size: 180x180 (configurable)
        
        ┌─────────────────────────┐
        │         C               │
        │      F     G            │
        │    A#        D          │
        │   D#    ●    A          │  ● = current key (green)
        │    G#        E          │  ○ = home key (blue)
        │      C#   B             │  Shaded = in range
        │        F#               │
        └─────────────────────────┘
```

### Props & State

```typescript
interface CircleOfFifthsProps {
    homeRoot: number;         // 0-11 (C=0, E=4, etc.)
    currentStep: number;      // -6 to +6 offset from home
    driftRange: number;       // 1-6 max steps
    driftDirection: 'cw' | 'ccw' | 'random';
    enabled: boolean;
    size?: number;            // SVG dimensions
}
```

## SwiftUI Port

### Main App Structure

```swift
// GenerativeAmbientApp.swift
@main
struct GenerativeAmbientApp: App {
    @StateObject private var viewModel = AudioViewModel()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
        }
    }
}

// AudioViewModel.swift
class AudioViewModel: ObservableObject {
    @Published var state: SliderState = SliderState()
    @Published var isPlaying: Bool = false
    @Published var showAdvanced: Bool = false
    @Published var presets: [SavedPreset] = []
    
    private var engine: AudioEngine?
    
    func togglePlay() {
        if isPlaying {
            engine?.stop()
        } else {
            engine = AudioEngine()
            try? engine?.start(state: state)
        }
        isPlaying.toggle()
    }
    
    func updateParameter<T>(_ keyPath: WritableKeyPath<SliderState, T>, _ value: T) {
        state[keyPath: keyPath] = value
        engine?.updateParams(state)
    }
}
```

### SnowflakeView

```swift
// SnowflakeView.swift
import SwiftUI

struct SnowflakeView: View {
    @EnvironmentObject var viewModel: AudioViewModel
    @GestureState private var dragState: DragState = .inactive
    
    enum DragState {
        case inactive
        case draggingArm(Int)
        case draggingHexagon
        case draggingRing
    }
    
    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height - 100) * 0.7
            let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
            
            ZStack {
                // Background
                Color.black.opacity(0.95)
                
                // Snowflake Canvas
                Canvas { context, canvasSize in
                    drawSnowflake(context: context, 
                                  size: canvasSize, 
                                  state: viewModel.state)
                }
                .frame(width: size, height: size)
                .position(center)
                .gesture(snowflakeDragGesture(center: center, size: size))
                
                // Play button overlay
                PlayButton(isPlaying: viewModel.isPlaying) {
                    viewModel.togglePlay()
                }
                .position(center)
                
                // Settings button
                SettingsButton {
                    viewModel.showAdvanced = true
                }
                .position(x: geometry.size.width - 40, y: geometry.size.height - 40)
            }
        }
        .sheet(isPresented: $viewModel.showAdvanced) {
            AdvancedControlsView()
        }
    }
    
    func drawSnowflake(context: GraphicsContext, size: CGSize, state: SliderState) {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let scaleFactor = size.width / 600
        
        // Draw each arm
        for arm in 0..<6 {
            let complexity = getArmValue(state, arm: arm)
            let rotation = Angle(degrees: Double(arm) * 60 - 90)
            
            // Draw with 2-fold mirror symmetry
            for mirror in [-1.0, 1.0] {
                var armContext = context
                armContext.translateBy(x: center.x, y: center.y)
                armContext.rotate(by: rotation)
                armContext.scaleBy(x: 1, y: CGFloat(mirror))
                
                drawArm(context: &armContext, 
                        complexity: complexity,
                        armIndex: arm,
                        maxLength: 140 * scaleFactor * CGFloat(state.masterVolume),
                        baseWidth: 2 * scaleFactor)
            }
        }
        
        // Draw center hexagon
        drawHexagon(context: context, 
                    center: center, 
                    radius: 35 * scaleFactor * CGFloat(1 + state.tension * 2))
        
        // Draw outer ring indicator
        drawOuterRing(context: context,
                      center: center,
                      radius: 250 * scaleFactor,
                      value: state.masterVolume)
    }
    
    func getArmValue(_ state: SliderState, arm: Int) -> Double {
        let sliders: [(keyPath: KeyPath<SliderState, Double>, min: Double, max: Double)] = [
            (\.reverbLevel, 0, 2),
            (\.synthLevel, 0, 1),
            (\.granularLevel, 0, 4),
            (\.leadLevel, 0, 1),
            (\.granularReverbSend, 0, 1),
            (\.synthReverbSend, 0, 1)
        ]
        
        let value = state[keyPath: sliders[arm].keyPath]
        let normalized = (value - sliders[arm].min) / (sliders[arm].max - sliders[arm].min)
        return pow(normalized, 1 / 2.5)  // Log scaling
    }
}
```

### CircleOfFifthsView

```swift
// CircleOfFifthsView.swift
import SwiftUI

struct CircleOfFifthsView: View {
    let homeRoot: Int
    let currentStep: Int
    let driftRange: Int
    let driftDirection: String
    let enabled: Bool
    var size: CGFloat = 180
    
    private let cofSequence = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]
    private let cofLabels = ["C", "G", "D", "A", "E", "B", "F♯", "C♯", "G♯", "D♯", "A♯", "F"]
    
    private var homeIndex: Int {
        cofSequence.firstIndex(of: homeRoot % 12) ?? 0
    }
    
    private var currentIndex: Int {
        ((homeIndex + currentStep) % 12 + 12) % 12
    }
    
    var body: some View {
        Canvas { context, canvasSize in
            let center = CGPoint(x: size / 2, y: size / 2)
            let outerRadius = size * 0.42
            let innerRadius = size * 0.25
            let labelRadius = size * 0.34
            
            // Draw segments
            for index in 0..<12 {
                let path = arcPath(index: index, innerRadius: innerRadius, outerRadius: outerRadius, center: center)
                context.fill(path, with: .color(segmentColor(index)))
                context.stroke(path, with: .color(.black), lineWidth: 1)
            }
            
            // Draw labels
            for index in 0..<12 {
                let pos = labelPosition(index: index, radius: labelRadius, center: center)
                let text = Text(cofLabels[index])
                    .font(.system(size: size * 0.08, weight: index == currentIndex || index == homeIndex ? .bold : .regular))
                    .foregroundColor(labelColor(index))
                
                context.draw(text, at: pos)
            }
            
            // Center indicator
            let centerText = Text(cofLabels[currentIndex])
                .font(.system(size: size * 0.12, weight: .bold))
                .foregroundColor(enabled ? .green : .gray)
            
            context.draw(centerText, at: CGPoint(x: center.x, y: center.y - size * 0.04))
            
            let stepText = Text(currentStep == 0 ? "home" : "\(currentStep > 0 ? "+" : "")\(currentStep)")
                .font(.system(size: size * 0.06))
                .foregroundColor(enabled ? .gray : Color.gray.opacity(0.5))
            
            context.draw(stepText, at: CGPoint(x: center.x, y: center.y + size * 0.08))
        }
        .frame(width: size, height: size)
    }
    
    func segmentColor(_ index: Int) -> Color {
        guard enabled else { return Color(white: 0.15) }
        if index == currentIndex { return .green }
        if index == homeIndex { return .blue }
        if isInRange(index) { return Color(white: 0.2) }
        return Color(white: 0.1)
    }
    
    func isInRange(_ index: Int) -> Bool {
        for i in -driftRange...driftRange {
            if ((homeIndex + i) % 12 + 12) % 12 == index {
                return true
            }
        }
        return false
    }
}
```

### Advanced Controls View

```swift
// AdvancedControlsView.swift
import SwiftUI

struct AdvancedControlsView: View {
    @EnvironmentObject var viewModel: AudioViewModel
    @State private var selectedSection: Section = .mixer
    
    enum Section: String, CaseIterable {
        case mixer = "Mixer"
        case harmony = "Harmony"
        case timbre = "Timbre"
        case space = "Space"
        case granular = "Granular"
        case lead = "Lead"
        case ocean = "Ocean"
        case cof = "Circle of Fifths"
    }
    
    var body: some View {
        NavigationView {
            VStack {
                // Section picker
                Picker("Section", selection: $selectedSection) {
                    ForEach(Section.allCases, id: \.self) { section in
                        Text(section.rawValue).tag(section)
                    }
                }
                .pickerStyle(SegmentedPickerStyle())
                .padding()
                
                // Parameter list
                ScrollView {
                    VStack(spacing: 16) {
                        switch selectedSection {
                        case .mixer:
                            MixerSection()
                        case .harmony:
                            HarmonySection()
                        case .timbre:
                            TimbreSection()
                        case .space:
                            SpaceSection()
                        case .granular:
                            GranularSection()
                        case .lead:
                            LeadSection()
                        case .ocean:
                            OceanSection()
                        case .cof:
                            CircleOfFifthsSection()
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Parameters")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// Example section
struct MixerSection: View {
    @EnvironmentObject var viewModel: AudioViewModel
    
    var body: some View {
        VStack(spacing: 12) {
            ParameterSlider(
                label: "Master Volume",
                value: Binding(
                    get: { viewModel.state.masterVolume },
                    set: { viewModel.updateParameter(\.masterVolume, $0) }
                ),
                range: 0...1,
                step: 0.01
            )
            
            ParameterSlider(
                label: "Synth Level",
                value: Binding(
                    get: { viewModel.state.synthLevel },
                    set: { viewModel.updateParameter(\.synthLevel, $0) }
                ),
                range: 0...1,
                step: 0.01
            )
            
            // ... more sliders
        }
    }
}

// Reusable slider component
struct ParameterSlider: View {
    let label: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                Text(String(format: "%.2f", value))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Slider(value: $value, in: range, step: step)
        }
    }
}
```

## Auto-Hide Controls

The snowflake UI auto-hides controls after 3 seconds of inactivity:

```swift
struct SnowflakeView: View {
    @State private var showControls = true
    @State private var hideTimer: Timer?
    
    var body: some View {
        ZStack {
            // Main content
            
            if showControls {
                ControlsOverlay()
                    .transition(.opacity)
            }
        }
        .onTapGesture {
            resetHideTimer()
        }
        .onChange(of: viewModel.state) { _ in
            resetHideTimer()
        }
    }
    
    func resetHideTimer() {
        showControls = true
        hideTimer?.invalidate()
        hideTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { _ in
            withAnimation {
                showControls = false
            }
        }
    }
}
```

## Gesture Handling

```swift
extension SnowflakeView {
    func snowflakeDragGesture(center: CGPoint, size: CGFloat) -> some Gesture {
        DragGesture()
            .updating($dragState) { value, state, _ in
                let location = value.location
                let dx = location.x - center.x
                let dy = location.y - center.y
                let distance = sqrt(dx * dx + dy * dy)
                
                let hexRadius = 35 * (size / 600) * CGFloat(1 + viewModel.state.tension * 2)
                let ringRadius = 250 * (size / 600)
                
                if distance < hexRadius {
                    state = .draggingHexagon
                } else if distance > ringRadius - 20 && distance < ringRadius + 20 {
                    state = .draggingRing
                } else {
                    // Determine which arm based on angle
                    let angle = atan2(dy, dx) + .pi / 2
                    let armIndex = Int((angle / (2 * .pi) * 6 + 6).truncatingRemainder(dividingBy: 6))
                    state = .draggingArm(armIndex)
                }
            }
            .onChanged { value in
                handleDrag(value: value, center: center, size: size)
            }
    }
    
    func handleDrag(value: DragGesture.Value, center: CGPoint, size: CGFloat) {
        switch dragState {
        case .draggingHexagon:
            // Update tension based on drag distance from center
            let distance = sqrt(pow(value.location.x - center.x, 2) + pow(value.location.y - center.y, 2))
            let maxDistance = 100.0
            let tension = min(1, max(0, distance / maxDistance))
            viewModel.updateParameter(\.tension, tension)
            
        case .draggingRing:
            // Update master volume based on angle
            let angle = atan2(value.location.y - center.y, value.location.x - center.x)
            let normalized = (angle + .pi) / (2 * .pi)
            viewModel.updateParameter(\.masterVolume, normalized)
            
        case .draggingArm(let index):
            // Update arm parameter based on distance
            let distance = sqrt(pow(value.location.x - center.x, 2) + pow(value.location.y - center.y, 2))
            let maxLength = 140 * (size / 600)
            let position = min(1, max(0, distance / maxLength))
            let value = pow(position, 2.5)  // Inverse log scale
            
            let keyPaths: [WritableKeyPath<SliderState, Double>] = [
                \.reverbLevel, \.synthLevel, \.granularLevel,
                \.leadLevel, \.granularReverbSend, \.synthReverbSend
            ]
            let ranges: [(min: Double, max: Double)] = [
                (0, 2), (0, 1), (0, 4), (0, 1), (0, 1), (0, 1)
            ]
            
            let finalValue = ranges[index].min + value * (ranges[index].max - ranges[index].min)
            viewModel.updateParameter(keyPaths[index], finalValue)
            
        case .inactive:
            break
        }
    }
}
```

## Preset Management

```swift
// PresetManager.swift
class PresetManager: ObservableObject {
    @Published var presets: [SavedPreset] = []
    
    private let fileManager = FileManager.default
    private var presetsDirectory: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Presets")
    }
    
    init() {
        loadBundledPresets()
        loadUserPresets()
    }
    
    func loadBundledPresets() {
        guard let bundlePath = Bundle.main.path(forResource: "presets", ofType: nil) else { return }
        let bundleURL = URL(fileURLWithPath: bundlePath)
        
        do {
            let files = try fileManager.contentsOfDirectory(at: bundleURL, includingPropertiesForKeys: nil)
            for file in files where file.pathExtension == "json" {
                if let preset = loadPreset(from: file) {
                    presets.append(preset)
                }
            }
        } catch {
            print("Error loading bundled presets: \(error)")
        }
    }
    
    func loadPreset(from url: URL) -> SavedPreset? {
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(SavedPreset.self, from: data)
        } catch {
            print("Error loading preset: \(error)")
            return nil
        }
    }
    
    func savePreset(_ preset: SavedPreset) throws {
        try fileManager.createDirectory(at: presetsDirectory, withIntermediateDirectories: true)
        let filename = preset.name.replacingOccurrences(of: " ", with: "_") + ".json"
        let url = presetsDirectory.appendingPathComponent(filename)
        let data = try JSONEncoder().encode(preset)
        try data.write(to: url)
        presets.append(preset)
    }
}
```
