const path = require('node:path');
module.exports = {
  content: [path.join(__dirname, '../index.html'), path.join(__dirname, '../*.js')],
  safelist: Array.from({length:12}, (_, i) => `grid-cols-${i + 1}`),
  theme: {extend:{}},
  plugins: []
};
