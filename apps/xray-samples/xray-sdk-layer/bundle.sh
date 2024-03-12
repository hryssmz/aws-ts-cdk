#!/bin/sh
dirname=`dirname "$0"`
zippath=`pwd`/`basename "$dirname"`.zip

(
    cd "$dirname/nodejs"
    npm install
    cd ..
    zip -r "$zippath" *
    rm -rf nodejs/package-lock.json nodejs/node_modules
)
