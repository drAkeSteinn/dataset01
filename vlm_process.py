import subprocess
import json
import os
import time
import sys

CROPS_DIR = "/tmp/head_crops"
OUTPUT_DIR = "/tmp/vlm_descs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def process_image(num):
    out_file = f"{OUTPUT_DIR}/{num}.txt"
    if os.path.exists(out_file):
        return True
    
    crop_file = f"{CROPS_DIR}/n1pl3fk ({num}).jpg"
    if not os.path.exists(crop_file):
        with open(out_file, 'w') as f:
            f.write("No crop available")
        return False
    
    try:
        result = subprocess.run(
            ["z-ai", "vision", "-p", "Describe this anime character briefly: hair color/style, eye color, skin tone, expression, accessories (horns/ears/clips), background.", "-i", crop_file, "-o", f"/tmp/vlm_out_{num}.json"],
            timeout=45,
            capture_output=True,
            text=True
        )
        
        out_json = f"/tmp/vlm_out_{num}.json"
        if result.returncode == 0 and os.path.exists(out_json):
            try:
                data = json.load(open(out_json))
                content = data.get('choices', [{}])[0].get('message', {}).get('content', 'No description')
                with open(out_file, 'w') as f:
                    f.write(content)
                os.remove(out_json)
                return True
            except:
                pass
        
        # Check for content filter
        stderr = result.stderr or ''
        if '1301' in stderr or 'sensitive' in stderr:
            with open(out_file, 'w') as f:
                f.write("Content blocked - character details not available")
            return False
        
        # Check for rate limit
        if '429' in stderr or 'Too many' in stderr:
            print(f"  Rate limited at {num}, waiting 25s...")
            time.sleep(25)
            # Retry with simpler prompt
            result2 = subprocess.run(
                ["z-ai", "vision", "-p", "Hair color? Eye color? Brief.", "-i", crop_file, "-o", f"/tmp/vlm_out_{num}.json"],
                timeout=30,
                capture_output=True,
                text=True
            )
            if result2.returncode == 0 and os.path.exists(f"/tmp/vlm_out_{num}.json"):
                try:
                    data = json.load(open(f"/tmp/vlm_out_{num}.json"))
                    content = data.get('choices', [{}])[0].get('message', {}).get('content', 'Limited info')
                    with open(out_file, 'w') as f:
                        f.write(f"(Limited) {content}")
                    os.remove(f"/tmp/vlm_out_{num}.json")
                    return True
                except:
                    pass
        
        with open(out_file, 'w') as f:
            f.write("Analysis failed")
        return False
        
    except subprocess.TimeoutExpired:
        with open(out_file, 'w') as f:
            f.write("Analysis timed out")
        # Kill any hanging processes
        subprocess.run(["pkill", "-f", f"z-ai vision.*{num}"], capture_output=True)
        return False
    except Exception as e:
        with open(out_file, 'w') as f:
            f.write(f"Error: {str(e)[:50]}")
        return False

# Process all images
done = 0
errors = 0
for i in range(1, 176):
    if os.path.exists(f"{OUTPUT_DIR}/{i}.txt"):
        done += 1
        continue
    
    sys.stdout.write(f"[{i}] ")
    sys.stdout.flush()
    
    ok = process_image(i)
    if ok:
        done += 1
        print("OK")
    else:
        errors += 1
        # Read what was saved
        try:
            with open(f"{OUTPUT_DIR}/{i}.txt") as f:
                print(f"Saved: {f.read()[:40]}")
        except:
            print("Failed")
    
    # Clean up temp files
    try: os.remove(f"/tmp/vlm_out_{i}.json")
    except: pass
    
    time.sleep(2)

print(f"\nVLM Complete: {done} done, {errors} errors")

# Count actual results
results = os.listdir(OUTPUT_DIR)
print(f"Total description files: {len(results)}")
