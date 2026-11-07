#!/bin/bash
# Script de inicio rápido para el Simulador 3D de IPS

set -e

# Directorio del proyecto
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo "  🏥 SIMULADOR 3D IPS - MODELO DE COLAS M/M/s CON SIMPY   "
echo "=========================================================="

# Verificar entorno virtual
if [ ! -d "venv" ]; then
    echo "[+] Creando entorno virtual..."
    python3 -m venv venv
    ./venv/bin/pip install -r requirements.txt
fi

echo "[+] Iniciando servidor web Flask en http://127.0.0.1:5000 ..."
echo "[+] Abre tu navegador en: http://127.0.0.1:5000"
echo "    Presiona Ctrl+C para detener el servidor."
echo "=========================================================="

./venv/bin/python3 app.py
