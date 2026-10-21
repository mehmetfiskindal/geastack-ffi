#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
cd "$(dirname "$0")"

case "$(uname -s)" in
  Linux) ;;
  *)
    echo "This demo builds on Sailfish OS or Linux; current host: $(uname -s)" >&2
    exit 2
    ;;
esac

jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j"$jobs"
exec ./build/gea-sailfish-demo
