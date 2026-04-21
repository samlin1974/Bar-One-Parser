import sys
import re
import json
import zipfile
import io
import xml.etree.ElementTree as ET

def parse_nlbl(content, filename):
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            # Usually nlbl 3.0 has label.xml
            target_xml = None
            for name in z.namelist():
                if name.endswith('label.xml') or name == 'label.xml':
                    target_xml = name
                    break
            
            if not target_xml:
                return {"error": "No label.xml found in nlbl"}
                
            xml_content = z.read(target_xml)
            root = ET.fromstring(xml_content)
            
            # Simple metadata extraction
            fields = []
            # Look for Variables and Text with IDs
            for elem in root.iter():
                item_id = elem.get("Id")
                if item_id and item_id.startswith("ID_"):
                    # Try to get Name and DefaultValue
                    name = elem.get("Name") or item_id
                    value = elem.get("DefaultValue") or elem.findtext(".//Value") or "(空)"
                    fields.append({
                        "id": item_id,
                        "name": name,
                        "value": value,
                        "type": "Python XML Engine"
                    })
            
            # Sort by ID number
            def get_id_num(f):
                try: return int(f['id'].split('_')[1])
                except: return 0
            fields.sort(key=get_id_num)
            
            category = "銘版" if filename.upper().startswith("CC80") else ("貼紙" if filename.upper().startswith("CC81") else "")
            return {"fileName": filename, "category": category, "fields": fields}
            
    except Exception as e:
        return {"error": f"NLBL Error: {str(e)}"}

def parse_lbl(content, filename):
    # Regex for ID_XX
    id_pattern = re.compile(rb'ID_(\d{2})')
    
    metadata = [
        "Arial", "Arial Bold", "Arial Black", "Times New Roman", "Courier New",
        "ZDesigner", "zpl.dll", "Tahoma", "Verdana", "MS Sans Serif",
        "Microsoft JhengHei", "Microsoft YaHei", "SimSun", "PMingLiU", "MingLiU",
        "Bold", "Italic", "Regular"
    ]
    
    found_ids = {}
    matches = list(id_pattern.finditer(content))
    
    for i, match in enumerate(matches):
        id_num = match.group(1).decode('ascii')
        id_str = f"ID_{id_num}"
        start = match.end()
        
        end_search = matches[i+1].start() if i + 1 < len(matches) else len(content)
        end_search = min(end_search, start + 256)
        
        chunk = content[start:end_search]
        text_match = re.search(rb'[\x20-\x7E\x09\x0A\x0D]+', chunk)
        
        if text_match:
            val = text_match.group(0).decode('ascii', errors='ignore').strip()
            
            if re.search(r'ID_\d{2}', val):
                val = re.split(r'ID_\d{2}', val)[0].strip()

            for m in metadata:
                val = re.sub(rf'\b{re.escape(m)}\b', '', val, flags=re.IGNORECASE)
            
            val = re.sub(r'[\t\r\n\s]{2,}', '@', val)
            val = re.sub(r'[\t\r\n\s]', '@', val)
            
            parts = [p.strip() for p in val.split('@') if p.strip()]
            if len(parts) >= 2:
                if parts[0] == parts[1] and len(parts[0]) > 1:
                    if all(p == parts[0] for p in parts):
                        parts = [parts[0]]
                    else:
                        parts = parts[1:]
            
            val = "@".join(parts)
            if val == id_str: val = ""
            found_ids[id_str] = val if val else "(空)"
        else:
            found_ids[id_str] = "(空)"
            
    category = "銘版" if filename.upper().startswith("CC80") else ("貼紙" if filename.upper().startswith("CC81") else "")
    sorted_ids = sorted(found_ids.keys(), key=lambda x: int(x.split('_')[1]))
    fields = [{"id": k, "name": k, "value": found_ids[k], "type": "Python Pattern"} for k in sorted_ids]
    
    return {"fileName": filename, "category": category, "fields": fields}

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input: return
            
        data = json.loads(raw_input)
        filename = data.get('filename', 'unknown')
        content_hex = data.get('content_hex', '')
        content = bytes.fromhex(content_hex)
        
        if filename.lower().endswith('.nlbl'):
            result = parse_nlbl(content, filename)
        else:
            result = parse_lbl(content, filename)
            
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
