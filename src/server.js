// src/server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const empRoutes = require('./routes/employees');
const attRoutes = require('./routes/attendance');
const auditRoutes = require('./routes/audit');   

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', empRoutes);
app.use('/api/attendance', attRoutes);
app.use('/api/audit', auditRoutes);              



// SPA fallback
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// at bottom of src/server.js
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}
module.exports = app;

