cmake_minimum_required(VERSION 3.16)
project(digitone_reference LANGUAGES CXX)

add_library(digitone_reference STATIC
    src/Calibration.cpp
    src/Engine.cpp
)
target_include_directories(digitone_reference PUBLIC include)
target_compile_features(digitone_reference PUBLIC cxx_std_17)
if(MSVC)
    target_compile_options(digitone_reference PRIVATE /W4)
else()
    target_compile_options(digitone_reference PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_executable(digitone-render app/render.cpp)
target_link_libraries(digitone-render PRIVATE digitone_reference)
target_compile_features(digitone-render PRIVATE cxx_std_17)

option(DIGITONE_BUILD_TESTS "Build the dependency-free DSP tests" ON)
if(DIGITONE_BUILD_TESTS)
    enable_testing()
    add_executable(digitone-engine-tests tests/test_engine.cpp)
    target_link_libraries(digitone-engine-tests PRIVATE digitone_reference)
    target_compile_features(digitone-engine-tests PRIVATE cxx_std_17)
    add_test(NAME digitone-engine-tests COMMAND digitone-engine-tests)
endif()
