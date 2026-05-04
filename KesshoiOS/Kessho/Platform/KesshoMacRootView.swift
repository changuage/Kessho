import SwiftUI

/// macOS host for the same native SwiftUI surface used by the iOS app.
public struct KesshoMacRootView: View {
    @StateObject private var appState = AppState()

    public init() {}

    public var body: some View {
        ContentView()
            .environmentObject(appState)
            .preferredColorScheme(.dark)
            .frame(minWidth: 960, minHeight: 680)
    }
}
