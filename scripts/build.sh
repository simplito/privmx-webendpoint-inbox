#!/bin/bash

set -e

SCRIPT_DIR=$(dirname $(readlink -f "$0"))
MAIN_DIR="$(dirname $SCRIPT_DIR)"
cd $MAIN_DIR

if ! [ -x "$(command -v browserify)" ]; then
    echo "browserify could not be found, run npm i -g browserify"
    exit 1
fi
if ! [ -x "$(command -v terser)" ]; then
    echo "terser could not be found, run npm i -g terser"
    exit 1
fi

browserify -r ./dist/index.js:privmx-rpc -o public/build/privmx-rpc.js
terser public/build/privmx-rpc.js -o public/build/privmx-rpc.min.js
terser public/build/privmx-rpc.js -c -m -o public/build/privmx-rpc.min-x.js

du public/build/privmx-rpc.js
du public/build/privmx-rpc.min.js
du public/build/privmx-rpc.min-x.js
