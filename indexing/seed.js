const fs = require('fs');

const DB_FILE = 'main_data.bin';
const INDEX_FILE = 'index_map.json';

const TOTAL_USERS = 1000000; // 1 Crore Users 💀

function seedDatabase() {
    console.log(`🚀 Starting Seed for ${TOTAL_USERS} users...`);
    console.time("seed_time");

    // 1. Files ko 'write' mode me open karo
    const fd = fs.openSync(DB_FILE, 'w');
    
    // Index ko RAM me rakhte hain (Warning: High RAM Usage)
    const indexMap = {};
    
    let currentBytePosition = 0; // Ye track karega ki hum file me kahan hain

    for (let i = 1; i <= TOTAL_USERS; i++) {
        
        // 2. User Data Banao
        const user = {
            id: i,
            name: `User_${i}`,
            // Thoda realistic data dalte hain taaki size badhe
            email: `user${i}@gigachad.com`,
            city: "Mumbai" 
        };

        // 3. Buffer Banao
        const str = JSON.stringify(user) + '\n';
        const buffer = Buffer.from(str);

        // 4. Index me Entry Karo (RAM Update)
        // Note: Hum likhne se pehle position note kar rahe hain
        indexMap[i] = currentBytePosition; 
        // Note: Hum length store nahi kar rahe RAM bachane ke liye (Optional optimization)
        // Read karte waqt hum '\n' tak read kar lenge.

        // 5. Disk pe Write karo
        fs.writeSync(fd, buffer, 0, buffer.length, currentBytePosition);

        // 6. Position Update karo
        currentBytePosition += buffer.length;

        // Progress Bar (Har 5 Lakh pe)
        if (i % 500000 === 0) {
            console.log(`✅ Written ${i} users... (Size: ${(currentBytePosition / 1024 / 1024).toFixed(2)} MB)`);
            
            // Memory Usage check (Optional Debugging)
            const used = process.memoryUsage().heapUsed / 1024 / 1024;
            // console.log(`   RAM Used: ${Math.round(used)} MB`);
        }
    }

    fs.closeSync(fd);
    console.log("💾 Data writing complete. Now saving Index...");

    // 7. Index Save Karo (Ye sabse bhari step hai)
    try {
        fs.writeFileSync(INDEX_FILE, JSON.stringify(indexMap));
        console.log("✅ Index Saved Successfully!");
    } catch (err) {
        console.error("❌ Index Save Failed (RAM Issue):", err.message);
        console.log("Tip: Try reducing TOTAL_USERS to 1 Million or increase Node RAM.");
    }

    console.timeEnd("seed_time");
}

seedDatabase();