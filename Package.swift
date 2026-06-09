// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoProductCore",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "KesshoProductCore",
            targets: ["KesshoProductCore"]
        ),
        .executable(
            name: "KesshoProductCoreMacOSSmoke",
            targets: ["KesshoProductCoreMacOSSmoke"]
        )
    ],
    targets: [
        .target(
            name: "KesshoProductCore",
            path: ".",
            exclude: [
                "build",
                "dist",
                "docs",
                "ios",
                "node_modules",
                "plugins",
                "public",
                "scripts",
                "src",
                "supabase",
                "wasm/common"
            ],
            sources: [
                "cpp/KesshoCore/src",
                "wasm/dynamics-drift/kessho_dynamics_drift.cpp",
                "wasm/dynamics-degrade/kessho_dynamics_degrade.cpp",
                "wasm/reverb/kessho_reverb.cpp",
                "wasm/granular-fx/kessho_granular.cpp",
                "wasm/spectral-freeze/kessho_spectral_freeze.cpp",
                "wasm/lead-fm/kessho_lead_fm.cpp",
                "wasm/pad/kessho_pad.cpp",
                "wasm/drum/kessho_drum.cpp",
                "wasm/soundscapes/kessho_soundscapes.cpp"
            ],
            publicHeadersPath: "cpp/KesshoCore/include",
            cSettings: [
                .headerSearchPath("cpp/KesshoCore/generated")
            ],
            cxxSettings: [
                .headerSearchPath("cpp/KesshoCore/generated"),
                .headerSearchPath("wasm/dynamics-drift"),
                .headerSearchPath("wasm/dynamics-degrade"),
                .headerSearchPath("wasm/reverb"),
                .headerSearchPath("wasm/granular-fx"),
                .headerSearchPath("wasm/spectral-freeze"),
                .headerSearchPath("wasm/lead-fm"),
                .headerSearchPath("wasm/pad"),
                .headerSearchPath("wasm/drum"),
                .headerSearchPath("wasm/soundscapes")
            ],
            linkerSettings: [
                .linkedFramework("AVFoundation"),
                .linkedFramework("Foundation"),
                .linkedLibrary("objc")
            ]
        ),
        .executableTarget(
            name: "KesshoProductCoreMacOSSmoke",
            dependencies: ["KesshoProductCore"],
            path: "macos/KesshoProductCoreMacOSSmoke",
            sources: ["main.mm"],
            cxxSettings: [
                .headerSearchPath("../../cpp/KesshoCore/generated")
            ],
            linkerSettings: [
                .linkedFramework("AVFoundation"),
                .linkedFramework("Foundation"),
                .linkedLibrary("objc")
            ]
        )
    ],
    cxxLanguageStandard: .cxx17
)
