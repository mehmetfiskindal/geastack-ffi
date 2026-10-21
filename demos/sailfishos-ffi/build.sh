#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
cd "$(dirname "$0")"

jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j"$jobs"
exec ./build/gea-sailfish-demo
