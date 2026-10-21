# SPDX-License-Identifier: Apache-2.0
cmake_minimum_required(VERSION 3.16)
project(gea_sailfish_demo LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_subdirectory(../../src/native ${CMAKE_CURRENT_BINARY_DIR}/gea_ffi)

add_executable(gea-sailfish-demo demo.cpp)
target_link_libraries(gea-sailfish-demo PRIVATE gea_ffi)
