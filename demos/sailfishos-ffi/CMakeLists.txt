# SPDX-License-Identifier: Apache-2.0
cmake_minimum_required(VERSION 3.16)
project(gea_sailfish_demo LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_subdirectory(../../src/native ${CMAKE_CURRENT_BINARY_DIR}/gea_ffi)

find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
    pkg_check_modules(DEMO_DBUS QUIET dbus-1)
endif()

add_executable(gea-sailfish-demo demo.cpp)
target_link_libraries(gea-sailfish-demo PRIVATE gea_ffi)

if(NOT DEMO_DBUS_FOUND)
    message(WARNING "libdbus headers were not found; the D-Bus checks will be skipped")
    target_compile_definitions(gea-sailfish-demo PRIVATE GEA_FFI_DEMO_NO_DBUS=1)
endif()
