#!/bin/bash
while true; do
  cd /home/z/my-project
  node node_modules/.bin/next dev -p 3000
  echo "Server crashed, restarting in 3s..."
  sleep 3
done
