#!/bin/bash -ue

echo "$0"

for i in *; do
    if [[ $i == $(basename "$0") || $i == hero-* ]]; then
        continue
    fi
    convert "$i" -resize 300x "hero-${i%%.*}.jpg"
    mv "$i" ~/.Trash
done
