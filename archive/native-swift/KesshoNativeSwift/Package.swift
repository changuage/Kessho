// swift-tools-version: 5.9
import PackageDescription

let productCoreIncludeFlags = [
    "-I../cpp/KesshoCore/include",
    "-I../cpp/KesshoCore/generated",
    "-I../wasm/dynamics-character",
    "-I../wasm/dynamics-degrade",
    "-I../wasm/reverb",
    "-I../wasm/granular-fx",
    "-I../wasm/spectral-freeze",
    "-I../wasm/lead-fm",
    "-I../wasm/pad",
    "-I../wasm/drum",
    "-I../wasm/soundscapes",
]

let package = Package(
    name: "KesshoNativeCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .executable(
            name: "KesshoMac",
            targets: ["KesshoMac"]
        ),
        .executable(
            name: "KesshoProductSnapshotSmoke",
            targets: ["KesshoProductSnapshotSmoke"]
        ),
        .executable(
            name: "KesshoProductNativeReleaseSmoke",
            targets: ["KesshoProductNativeReleaseSmoke"]
        ),
        .library(
            name: "KesshoNativeCore",
            targets: ["KesshoNativeCore"]
        ),
        .library(
            name: "KesshoDSP",
            targets: ["KesshoDSP"]
        ),
        .library(
            name: "KesshoProductCoreBridge",
            targets: ["KesshoProductCoreBridge"]
        ),
        .library(
            name: "KesshoProductSchema",
            targets: ["KesshoProductSchema"]
        )
    ],
    targets: [
        .target(
            name: "KesshoProductSchema",
            path: "Generated"
        ),
        .target(
            name: "KesshoDSP",
            path: "NativeDSP",
            sources: [
                "kessho_dynamics_character_unified.cpp",
                "kessho_reverb_unified.cpp",
            ],
            publicHeadersPath: "include"
        ),
        .target(
            name: "KesshoProductCoreBridge",
            dependencies: ["KesshoDSP"],
            path: "CoreBridge",
            sources: [
                "KesshoProductCoreBridge.mm",
                "kessho_product_core_engine.cpp",
                "kessho_product_core_product_components.cpp",
                "kessho_product_core_modules.cpp",
                "kessho_product_core_dynamics_character_module.cpp",
                "kessho_product_core_dynamics_erosion_module.cpp",
                "kessho_product_core_reverb_module.cpp",
                "kessho_product_core_granular_module.cpp",
                "kessho_product_core_spectral_freeze_module.cpp",
                "kessho_product_core_lead_fm_module.cpp",
                "kessho_product_core_pad_module.cpp",
                "kessho_product_core_drum_module.cpp",
                "kessho_product_core_soundscapes_module.cpp",
                "kessho_product_core_delay_a_module.cpp",
                "kessho_product_core_delay_b_module.cpp",
                "kessho_product_core_wasm_dynamics_degrade.cpp",
                "kessho_product_core_wasm_granular.cpp",
                "kessho_product_core_wasm_spectral_freeze.cpp",
                "kessho_product_core_wasm_lead_fm.cpp",
                "kessho_product_core_wasm_pad.cpp",
                "kessho_product_core_wasm_drum.cpp",
                "kessho_product_core_wasm_soundscapes.cpp",
            ],
            publicHeadersPath: "include",
            cxxSettings: [
                .unsafeFlags(productCoreIncludeFlags)
            ]
        ),
        .target(
            name: "KesshoNativeCore",
            dependencies: [
                "KesshoDSP",
                "KesshoProductCoreBridge",
                "KesshoProductSchema",
            ],
            path: "Kessho",
            exclude: [
                "Assets.xcassets",
                "Info.plist",
                "Kessho-Bridging-Header.h",
                "KesshoApp.swift",
            ],
            sources: [
                "Audio",
                "ContentView.swift",
                "CoreBridge",
                "Harmony",
                "MIDI",
                "Platform",
                "Services",
                "State",
                "Views",
            ],
            resources: [
                .copy("Presets"),
            ]
        ),
        .executableTarget(
            name: "KesshoMac",
            dependencies: ["KesshoNativeCore"],
            path: "KesshoMac"
        ),
        .executableTarget(
            name: "KesshoProductSnapshotSmoke",
            dependencies: ["KesshoNativeCore"],
            path: "KesshoProductSnapshotSmoke"
        ),
        .executableTarget(
            name: "KesshoProductNativeReleaseSmoke",
            dependencies: ["KesshoNativeCore"],
            path: "KesshoProductNativeReleaseSmoke"
        )
    ],
    cxxLanguageStandard: .cxx17
)
