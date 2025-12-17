const fs = require('fs');
const express = require('express');

// --- CONFIGURATION ---
const DB_FILENAME = 'users.jsonl';
const IDX_FILENAME = 'users.idx';
const PORT = process.env.PORT || 3000;

// ==========================================
// PART 1: THE DATABASE ENGINE (GigaDB)
// ==========================================

class Node {
    constructor(id, filePosition) {
        this.id = id;
        this.filePosition = filePosition;
        this.left = null;
        this.right = null;
    }
}

class IndexTree {
    constructor() { this.root = null; }

    insert(id, filePosition) {
        const newNode = new Node(id, filePosition);
        if (this.root === null) { this.root = newNode; return; }
        let current = this.root;
        while (true) {
            if (id === current.id) { current.filePosition = filePosition; return; }
            if (id < current.id) {
                if (current.left === null) { current.left = newNode; return; }
                current = current.left;
            } else {
                if (current.right === null) { current.right = newNode; return; }
                current = current.right;
            }
        }
    }

    findPosition(id) {
        let current = this.root;
        while (current) {
            if (id === current.id) return current.filePosition;
            if (id < current.id) current = current.left;
            else current = current.right;
        }
        return null;
    }

    // --- 🛡️ FIXED: ITERATIVE TO_ARRAY ---
    toArray() {
        const result = [];
        const stack = [];
        let current = this.root;

        while (current !== null || stack.length > 0) {
            while (current !== null) {
                stack.push(current);
                current = current.left;
            }
            current = stack.pop();
            result.push({ i: current.id, p: current.filePosition });
            current = current.right;
        }
        return result;
    }

    fromArray(list) {
        this.root = null;
        for (const item of list) { this.insert(item.i, item.p); }
    }
}

class GigaDB {
    constructor() {
        this.index = new IndexTree();
        
        // Startup Logic
        if (fs.existsSync(IDX_FILENAME)) {
            console.log("⚡ Fast Boot: Loading Index from 'users.idx'...");
            try {
                const rawData = fs.readFileSync(IDX_FILENAME, 'utf8');
                this.index.fromArray(JSON.parse(rawData));
            } catch (e) { 
                console.log("⚠️ Index corrupted, rebuilding...");
                this.rebuildIndex(); 
            }
        } else if (fs.existsSync(DB_FILENAME)) {
            console.log("⚠️ Index missing. Rebuilding...");
            this.rebuildIndex();
            this.saveIndex();
        } else {
            fs.writeFileSync(DB_FILENAME, '');
            console.log("🔥 New Database Created.");
            
            // --- 1 LAKH DATA ENTRY ---
            console.log("⚠️ 1 Lakh data insert ho raha hai, please wait...");
            this.seed(100000); 
        }
    }

    saveIndex() { 
        const list = this.index.toArray();
        fs.writeFileSync(IDX_FILENAME, JSON.stringify(list)); 
    }

    rebuildIndex() {
        const content = fs.readFileSync(DB_FILENAME, 'utf8');
        const lines = content.split('\n');
        let currentPos = 0;
        lines.forEach(line => {
            if (!line) return;
            const len = Buffer.byteLength(line, 'utf8') + 1;
            const match = line.match(/"id":(\d+)/);
            if (match) this.index.insert(parseInt(match[1]), currentPos);
            currentPos += len;
        });
    }

    seed(count) {
        console.log(`🚀 Starting Seed: Inserting ${count} records...`);
        console.time("SeedTime");

        for (let i = 1; i <= count; i++) {
            const user = { 
                id: i, 
                name: `User_${i}`, 
                role: i % 100 === 0 ? "Admin" : "User", 
                bio: `Auto-generated bio for User ${i}.` 
            };
            const stats = fs.statSync(DB_FILENAME);
            const pos = stats.size;
            fs.appendFileSync(DB_FILENAME, JSON.stringify(user) + '\n');
            this.index.insert(i, pos);
            
            if(i % 20000 === 0) console.log(`👉 Inserted ${i} records...`);
        }
        
        console.log("💾 Saving Index to Disk...");
        this.saveIndex(); 
        console.timeEnd("SeedTime");
        console.log("✅ Seeding Complete!");
    }

    insert(userData) {
        if (!userData.id) throw new Error("ID is required");
        const id = parseInt(userData.id);
        const stats = fs.statSync(DB_FILENAME);
        fs.appendFileSync(DB_FILENAME, JSON.stringify(userData) + '\n');
        this.index.insert(id, stats.size);
        this.saveIndex();
        return userData;
    }

    update(id, data) {
        id = parseInt(id);
        const stats = fs.statSync(DB_FILENAME);
        const finalData = { ...data, id };
        fs.appendFileSync(DB_FILENAME, JSON.stringify(finalData) + '\n');
        this.index.insert(id, stats.size);
        this.saveIndex();
        return finalData;
    }

    find(id) {
        id = parseInt(id);
        const pos = this.index.findPosition(id);
        if (pos === null) return null;
        const fd = fs.openSync(DB_FILENAME, 'r');
        const buffer = Buffer.alloc(5000);
        fs.readSync(fd, buffer, 0, 5000, pos);
        fs.closeSync(fd);
        try { return JSON.parse(buffer.toString('utf8').split('\n')[0]); } catch (e) { return null; }
    }

    getMany(page = 1, limit = 100) {
        const allNodes = this.index.toArray();
        const start = (page - 1) * limit;
        const target = allNodes.slice(start, start + limit);
        const results = [];
        const fd = fs.openSync(DB_FILENAME, 'r');
        const buffer = Buffer.alloc(10000);
        for (const node of target) {
            try {
                fs.readSync(fd, buffer, 0, 10000, node.p);
                results.push(JSON.parse(buffer.toString('utf8').split('\n')[0]));
            } catch (e) {}
        }
        fs.closeSync(fd);
        return { data: results, total: allNodes.length, page, totalPages: Math.ceil(allNodes.length / limit) };
    }
}

// ==========================================
// PART 2: THE API SERVER (With Timing ⏱️)
// ==========================================

const app = express();
const db = new GigaDB();

app.use(express.json());

// --- ROUTES ---

// 1. GET USERS (With Time)
app.get('/', (req, res) => {
    const start = process.hrtime(); // ⏱️ Start

    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const result = db.getMany(page, limit);
    
    const end = process.hrtime(start); // ⏱️ End
    const timeTaken = (end[0] * 1000 + end[1] / 1e6).toFixed(4); // ms calculation

    res.json({
        success: true,
        time_taken: `${timeTaken} ms`, // Speed Report
        page: page,
        total_users: result.total,
        total_pages: result.totalPages,
        users: result.data
    });
});

// 2. GET SINGLE USER (With Time)
app.get('/users/:id', (req, res) => {
    const start = process.hrtime(); // ⏱️ Start

    const user = db.find(req.params.id);

    const end = process.hrtime(start); // ⏱️ End
    const timeTaken = (end[0] * 1000 + end[1] / 1e6).toFixed(4);

    if (!user) return res.status(404).json({ success: false, message: "User Not Found", time_taken: `${timeTaken} ms` });
    
    res.json({ success: true, time_taken: `${timeTaken} ms`, user: user });
});

// 3. CREATE USER (With Time)
app.post('/users', (req, res) => {
    const start = process.hrtime(); // ⏱️ Start

    try {
        const userData = req.body;
        const savedUser = db.insert(userData);
        
        const end = process.hrtime(start); // ⏱️ End
        const timeTaken = (end[0] * 1000 + end[1] / 1e6).toFixed(4);

        res.status(201).json({ success: true, time_taken: `${timeTaken} ms`, user: savedUser });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// 4. UPDATE USER (With Time)
app.put('/users/:id', (req, res) => {
    const start = process.hrtime(); // ⏱️ Start

    try {
        const id = req.params.id;
        const updatedUser = db.update(id, req.body);
        
        const end = process.hrtime(start); // ⏱️ End
        const timeTaken = (end[0] * 1000 + end[1] / 1e6).toFixed(4);

        if (!updatedUser) return res.status(404).json({ success: false, message: "Not Found", time_taken: `${timeTaken} ms` });
        
        res.json({ success: true, time_taken: `${timeTaken} ms`, user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
});

// Keep Alive Hack (Uncommented for stability)
setInterval(() => {}, 1000 * 60);