#!/bin/bash -eu

wd="$(mktemp -d)"

trap 'rm -rf $wd' EXIT

git archive master | tar -x -C "$wd"

cd "$wd"

rsync -av --chmod=a+r --rsh=ssh .htaccess "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh favicon.ico "$PUSER@$PHOST:$PDEST"

rsync -av --chmod=a+r --rsh=ssh darwi "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh github "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh nanodbc "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh pancake "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh resume "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh town "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh games "$PUSER@$PHOST:$PDEST"
rsync -av --chmod=a+r --rsh=ssh www "$PUSER@$PHOST:$PDEST"

rsync -av --chmod=a+r --rsh=ssh index.html "$PUSER@$PHOST:$PDEST"

# To copy specific additional files, use:
# PUSER="..." PHOST="..." rsync -av --chmod=a+r --rsh=ssh /path/to/file "$PUSER@$PHOST:/path/to/dest"
