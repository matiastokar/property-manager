#!/bin/bash
# Guarda la DB desde /tmp al proyecto (ejecutar antes de cerrar Claude Code)
SRC="/tmp/pm_backend/property_manager.db"
DST="/Users/matias/Documents/Claude/Projects/property-manager/backend/property_manager.db"

if [ -f "$SRC" ]; then
    cp "$SRC" "$DST"
    echo "✓ DB guardada en $DST ($(du -h "$DST" | cut -f1))"
else
    echo "✗ No se encontró $SRC"
fi
