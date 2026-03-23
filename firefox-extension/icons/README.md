# Extension Icons

Place two PNG icon files here before packaging for AMO submission:

- `icon-48.png`  — 48×48 px
- `icon-96.png`  — 96×96 px

**Recommended design:** Use the One Cloud Utopia logo (oculogo.png from the root)
resized and exported as PNG at the sizes above. Any image editor (GIMP, Photoshop,
Figma, or even `convert` from ImageMagick) can produce these:

```bash
# Using ImageMagick (if available):
magick oculogo.png -resize 48x48  firefox-extension/icons/icon-48.png
magick oculogo.png -resize 96x96  firefox-extension/icons/icon-96.png
```

Firefox will show a default puzzle-piece icon if the files are missing, so the
extension functions normally without them during local testing.
