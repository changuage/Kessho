import KesshoNativeCore
import SwiftUI

@main
struct KesshoMacApp: App {
    var body: some Scene {
        WindowGroup {
            KesshoMacRootView()
        }
        .windowStyle(.hiddenTitleBar)
    }
}
