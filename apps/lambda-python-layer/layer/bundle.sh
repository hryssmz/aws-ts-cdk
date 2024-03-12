#!/bin/sh
dirname=`dirname "$0"`
zippath=`pwd`/`basename "$dirname"`.zip

(
    cd "$dirname"
    zip -r python.zip python
    cd python
    pip install -r requirements.txt -t .
    cd ..
    zip -r "$zippath" *
    rm -rf python
    unzip python.zip
    rm -rf python.zip
)
