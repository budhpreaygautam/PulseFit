import app from './server.js';

const PORT = process.env.PORT || 5004; // Changed from 5003 to 5004 to avoid conflict

app.listen(PORT, () => {
  console.log(`⚡ PulseFit Gym Server running on http://localhost:${PORT}`);
});
