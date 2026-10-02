import xml.etree.ElementTree as ET
import sys

filename = sys.argv[1] if len(sys.argv) > 1 else 'scratch_devices.xml'
tree = ET.parse(filename)
for node in tree.iter():
    t = node.attrib.get('text', '')
    c = node.attrib.get('content-desc', '')
    b = node.attrib.get('bounds', '')
    clickable = node.attrib.get('clickable', '')
    if t or c:
        print(f"text='{t}' | desc='{c}' | bounds={b} | clickable={clickable}")
