const fs = require('fs');

const DB_FILE = 'main_data.bin';
const INDEX_FILE = 'index_map.json';

console.log("⏳ Loading Index into RAM...");
// Note: Badi file load hone me thoda time lagega
const indexMap = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
console.log("✅ Index Loaded.");

function findUserById(id) {
    console.time("search_time");

    // 1. Index se sirf POSITION nikalo (Ab object nahi hai, direct number hai)
    const position = indexMap[id];

    // Check karo position valid hai ya nahi
    if (position === undefined || position === null) {
        console.log(`❌ User ID ${id} not found in Index.`);
        console.timeEnd("search_time");
        return;
    }

    // 2. Disk Read (Estimation Technique)
    const fd = fs.openSync(DB_FILE, 'r');
    
    // Hume length nahi pata, to hum ek bada chunk (e.g., 500 bytes) uthayenge.
    // Assuming ek user ka data 500 bytes se chhota hoga.
    const ESTIMATED_CHUNK_SIZE = 500; 
    const buffer = Buffer.alloc(ESTIMATED_CHUNK_SIZE);

    // Position se read karna start karo
    const bytesRead = fs.readSync(fd, buffer, 0, ESTIMATED_CHUNK_SIZE, position);
    fs.closeSync(fd);

    // 3. Data Extract karo (Parsing)
    // Buffer me se string nikalo aur '\n' pe tod do
    // Isse hume exact JSON mil jayega, aur aage ka kachra (next user data) hat jayega
    const rawString = buffer.toString('utf8', 0, bytesRead);
    const jsonString = rawString.split('\n')[0]; 

    try {
        const user = JSON.parse(jsonString);
        console.log("🔍 Found User:", user);
    } catch (err) {
        console.error("⚠️ Error Parsing JSON. Maybe chunk size was too small?", err.message);
    }
    
    console.timeEnd("search_time");
}

// --- TEST ---
// Koi aisa ID dalo jo tumne seed kiya ho
// Agar tumne 10 Million seed kiye hain, to ye try karo:
console.log("\n--- Searching User ---");
//findUserById(102); 
findUserById(1000000); // 5 Lakh-th user