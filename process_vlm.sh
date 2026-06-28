#!/bin/bash
CROPS_DIR="/tmp/head_crops"
DATASET_DIR="/home/z/my-project/dataset"
PROGRESS="/home/z/my-project/caption_progress.json"

# Process each crop
for i in $(seq 1 175); do
  CROP_FILE="$CROPS_DIR/n1pl3fk ($i).jpg"
  TXT_FILE="$DATASET_DIR/n1pl3fk ($i).txt"
  
  # Skip if txt already exists
  if [ -f "$TXT_FILE" ]; then
    continue
  fi
  
  # Skip if crop doesn't exist
  if [ ! -f "$CROP_FILE" ]; then
    echo "[$i] No crop file"
    continue
  fi
  
  echo -n "[$i] Analyzing... "
  
  # Run VLM with timeout
  RESULT=$(timeout 30 z-ai vision -p "Describe this anime character: hair color/style, eye color, skin tone, expression, accessories, background. Be concise." -i "$CROP_FILE" -o /tmp/vlm_result.json 2>&1)
  
  if [ $? -eq 0 ] && [ -f /tmp/vlm_result.json ]; then
    echo "OK"
    # Extract the content from result
    CONTENT=$(python3 -c "import json; d=json.load(open('/tmp/vlm_result.json')); print(d.get('choices',[{}])[0].get('message',{}).get('content','No description'))" 2>/dev/null)
    
    if [ -z "$CONTENT" ]; then
      CONTENT="Character details not available"
    fi
    
    # Save to temp file for later caption generation
    echo "$CONTENT" > "/tmp/vlm_desc_$i.txt"
  else
    # Check if it's a content filter error
    if echo "$RESULT" | grep -q "1301\|sensitive"; then
      echo "BLOCKED"
      echo "Character details not available" > "/tmp/vlm_desc_$i.txt"
    elif echo "$RESULT" | grep -q "429\|Too many"; then
      echo "RATE LIMITED - waiting 20s"
      sleep 20
      # Retry
      RESULT=$(timeout 30 z-ai vision -p "Hair color? Eye color? Be very brief." -i "$CROP_FILE" -o /tmp/vlm_result.json 2>&1)
      if [ $? -eq 0 ] && [ -f /tmp/vlm_result.json ]; then
        CONTENT=$(python3 -c "import json; d=json.load(open('/tmp/vlm_result.json')); print(d.get('choices',[{}])[0].get('message',{}).get('content','Limited info'))" 2>/dev/null)
        echo "(Limited) $CONTENT" > "/tmp/vlm_desc_$i.txt"
        echo "  Retry OK"
      else
        echo "Character details not available" > "/tmp/vlm_desc_$i.txt"
        echo "  Retry failed"
      fi
    else
      echo "ERROR"
      echo "Character details not available" > "/tmp/vlm_desc_$i.txt"
    fi
  fi
  
  rm -f /tmp/vlm_result.json
  
  # Rate limit delay
  sleep 2
done

echo "VLM analysis complete"
