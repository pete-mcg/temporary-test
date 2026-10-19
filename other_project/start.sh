#!/bin/bash
echo ""
echo "Installing python packages"
echo ""
if [[ "$1" = "uv" ]]; then
    uv pip install -r requirements.txt
else
    python -m pip install -r requirements.txt
fi

echo ""
echo "Installing frontend packages"
echo ""
cd frontend
npm install
if [[ $? -ne 0 ]]; then
    echo "Failed to install frontend npm packages"
    exit $?
fi

echo ""
echo "Starting backend & frontend"
echo ""
cd ..
python -m quart run --port=50505 --host=127.0.0.1 --reload & cd frontend && npm run dev && fg