# Local Fonts

This directory contains locally hosted fonts for the Robo Fleet Control application.

## Fonts Included

### JetBrains Mono (Monospace)
- **Version**: 2.304
- **License**: OFL (Open Font License)
- **Usage**: Code blocks, data display, technical information
- **Source**: https://github.com/JetBrains/JetBrainsMono
- **Format**: WOFF2 (optimized for web)
- **Size**: ~1.5MB (16 font files)

**Weights available**: 100, 200, 300, 400, 500, 600, 700, 800

### IBM Plex Sans (UI Font)
- **Version**: 6.4.0
- **License**: OFL (Open Font License)
- **Usage**: UI elements, labels, headings
- **Source**: https://github.com/IBM/plex
- **Format**: WOFF2 (converted from OTF)
- **Size**: ~332KB (5 font files)

**Weights available**: 300, 400, 500, 600, 700

## Font Loading

Fonts are loaded via `@font-face` declarations in `/src/styles/fonts.css` with:
- `font-display: swap` - Ensures text is visible while fonts load
- WOFF2 format - Modern, highly compressed format with excellent browser support

## Browser Support

WOFF2 is supported by:
- Chrome 36+
- Firefox 39+
- Safari 12+
- Edge 14+

This covers 95%+ of modern browsers.

## Performance

Using local fonts provides:
- ✅ No external DNS lookups
- ✅ No Google Fonts CDN dependency
- ✅ Faster initial page load
- ✅ Works offline
- ✅ Privacy-friendly (no tracking)
- ✅ Consistent font availability

Total font size: ~1.9MB (only requested fonts are downloaded by the browser)
