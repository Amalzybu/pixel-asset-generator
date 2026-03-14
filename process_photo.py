#!/usr/bin/env python3
import os
import sys
from PIL import Image

# The image should be saved in the current directory
# since the user uploaded it. Let's process it with the Node.js tool.

# Check if image exists in common locations
possible_paths = [
    'person-photo.jpg',
    'photo.jpg',
    'image.jpg',
    os.path.expanduser('~/Downloads/person.jpg'),
]

image_path = None
for path in possible_paths:
    if os.path.exists(path):
        image_path = path
        print(f"Found image at: {image_path}")
        break

if not image_path:
    print("Image file not found. Please save the image as 'person-photo.jpg' in the current directory.")
    sys.exit(1)

# Verify it's a valid image
try:
    img = Image.open(image_path)
    print(f"Image loaded: {img.size[0]}x{img.size[1]} pixels, mode: {img.mode}")
except Exception as e:
    print(f"Error loading image: {e}")
    sys.exit(1)
