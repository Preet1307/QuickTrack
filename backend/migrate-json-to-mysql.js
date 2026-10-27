require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function main() {
  const file = path.join(__dirname, 'data', 'db.json');
  if (!fs.existsSync(file)) {
    throw new Error(`JSON data file not found: ${file}`);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  await db.initialize();
  const imported = await db.migrateFromJson(data);
  console.log(imported ? 'JSON data imported into MySQL.' : 'JSON data was already imported; nothing changed.');
}

main()
  .catch(error => {
    console.error('JSON-to-MySQL migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
