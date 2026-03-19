#!/bin/bash -eu

wd="$(mktemp -d)"

trap 'rm -rf $wd' EXIT

git archive master | tar -x -C "$wd"

cd "$wd"

test -f ~/Desktop/*-resume-digital.pdf && cp "$_" resume/.
test -f ~/Desktop/*-resume-paper.pdf && cp "$_" resume/.

rsync -av --chmod=a+r --rsh=ssh \
    .htaccess \
    favicon.ico \
    index.html \
    darwi \
    github \
    lists \
    nanodbc \
    pancake \
    resume \
    town \
    www \
    "$PUSER@$PHOST:$PDEST"

# To copy specific additional files, use:
# PUSER="..." PHOST="..." rsync -av --chmod=a+r --rsh=ssh /path/to/file "$PUSER@$PHOST:/path/to/dest"
