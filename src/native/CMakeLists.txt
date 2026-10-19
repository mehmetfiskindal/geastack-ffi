# SPDX-License-Identifier: Apache-2.0
cmake_minimum_required(VERSION 3.16)
project(gea_ffi LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(GEA_FFI_INCLUDE_DIRS
    ${CMAKE_CURRENT_SOURCE_DIR}/../../include
)

set(GEA_FFI_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/gea_ffi_core.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/gea_ffi_embedded.cpp
)

if(APPLE)
    enable_language(OBJCXX)
    list(APPEND GEA_FFI_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/gea_ffi_apple.mm)
    find_library(FOUNDATION_FRAMEWORK Foundation)
endif()

if(ANDROID)
    list(APPEND GEA_FFI_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/gea_ffi_android.cpp)
endif()

if(WIN32)
    list(APPEND GEA_FFI_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/gea_ffi_windows.cpp)
endif()

if(UNIX AND NOT APPLE AND NOT ANDROID)
    list(APPEND GEA_FFI_SOURCES
        ${CMAKE_CURRENT_SOURCE_DIR}/gea_ffi_linux.cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/gea_ffi_sailfishos.cpp
    )
endif()

add_library(gea_ffi STATIC ${GEA_FFI_SOURCES})

target_include_directories(gea_ffi PUBLIC
    $<BUILD_INTERFACE:${GEA_FFI_INCLUDE_DIRS}>
    $<INSTALL_INTERFACE:include>
)

if(APPLE)
    target_link_libraries(gea_ffi PUBLIC ${FOUNDATION_FRAMEWORK})
endif()

if(WIN32)
    target_link_libraries(gea_ffi PUBLIC ole32 advapi32 user32)
endif()

if(UNIX AND NOT APPLE AND NOT ANDROID)
    target_link_libraries(gea_ffi PUBLIC dl pthread)
endif()
