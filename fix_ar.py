import json

with open("src/locales/ar.json", encoding="utf-8") as f:
    s = f.read()

lines = s.split("\n")

# Fix 1: line 1189 (resubmit) needs comma
if not lines[1189].rstrip().endswith(","):
    lines[1189] = lines[1189].rstrip() + ","
    print("Fixed comma after resubmit")

# Fix 2: form object - line 1207 is not-covered, 1208 is empty, 1209 is unknownPayer
# Check if form object is missing closing brace
if lines[1208].strip() == "" and "unknownPayer" in lines[1209]:
    lines[1208] = "    },"
    print("Fixed form object closing")

new_s = "\n".join(lines)
json.loads(new_s)
with open("src/locales/ar.json", "w", encoding="utf-8") as f:
    f.write(new_s)
print("ar.json Fixed!")