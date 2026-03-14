const app = require('./api');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Pixel Asset Generator API running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /api/generate/sprite   - Generate character sprites');
  console.log('  POST /api/generate/tileset   - Generate tilesets');
  console.log('  POST /api/generate/effect    - Generate particle effects');
  console.log('  GET  /api/palettes           - List palettes');
  console.log('  GET  /api/animations         - List animation templates');
  console.log('  POST /api/export             - Export asset to format');
  console.log('  GET  /api/health             - Health check');
});
