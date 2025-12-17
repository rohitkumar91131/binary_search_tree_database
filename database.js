const fs = require('fs');
const express = require('express');
const path = require('path');

// --- CONFIGURATION ---
const DB_FILENAME = 'users.jsonl';
const IDX_FILENAME = 'users.idx';
const PORT = process.env.PORT || 3000; // Cloud Ready Port

// ==========================================
// PART 1: THE DATABASE ENGINE (GigaDB)
// ==========================================

// 1. NODE CLASS
class Node {
    constructor(id, filePosition) {
        this.id = id;
        this.filePosition = filePosition;
        this.left = null;
        this.right = null;
    }
}

// 2. INDEX TREE CLASS
class IndexTree {
    constructor() {
        this.root = null;
    }

    insert(id, filePosition) {
        const newNode = new Node(id, filePosition);
        if (this.root === null) {
            this.root = newNode;
            return;
        }
        let current = this.root;
        while (true) {
            if (id === current.id) {
                current.filePosition = filePosition;
                return;
            }
            if (id < current.id) {
                if (current.left === null) {
                    current.left = newNode;
                    return;
                }
                current = current.left;
            } else {
                if (current.right === null) {
                    current.right = newNode;
                    return;
                }
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

    toArray() {
        const result = [];
        function traverse(node) {
            if (!node) return;
            traverse(node.left);
            result.push({ i: node.id, p: node.filePosition });
            traverse(node.right);
        }
        traverse(this.root);
        return result;
    }

    fromArray(list) {
        this.root = null;
        for (const item of list) {
            this.insert(item.i, item.p);
        }
    }
}

// 3. MAIN GIGADB CLASS
class GigaDB {
    constructor() {
        this.index = new IndexTree();

        // Startup Logic
        if (fs.existsSync(IDX_FILENAME)) {
            console.log("⚡ Fast Boot: Loading Index from 'users.idx'...");
            const rawData = fs.readFileSync(IDX_FILENAME, 'utf8');
            try {
                const list = JSON.parse(rawData);
                this.index.fromArray(list);
            } catch (e) {
                console.log("⚠️ Index corrupted, rebuilding...");
                this.rebuildIndex();
            }
        }
        else if (fs.existsSync(DB_FILENAME)) {
            console.log("⚠️ Index missing. Rebuilding from Data file...");
            this.rebuildIndex();
            this.saveIndex();
        }
        else {
            fs.writeFileSync(DB_FILENAME, '');
            console.log("🔥 New Database Created.");
            // Auto Seed for demo
            this.seed(1000);
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
            if (match) {
                this.index.insert(parseInt(match[1]), currentPos);
            }
            currentPos += len;
        });
    }

    seed(count) {
        console.log(`🚀 Starting Seed: Inserting ${count} records...`);
        for (let i = 1; i <= count; i++) {
            const user = {
                id: i,
                name: `User_${i}`,
                role: i % 10 === 0 ? "Admin" : "User",
                bio: `Auto-generated bio for User ${i}.`
            };
            const stats = fs.statSync(DB_FILENAME);
            const pos = stats.size;
            const str = JSON.stringify(user) + '\n';
            fs.appendFileSync(DB_FILENAME, str);
            this.index.insert(i, pos);
        }
        this.saveIndex();
        console.log("✅ Seeding Complete!");
    }

    insert(userData) {
        if (!userData.id) throw new Error("ID is required");
        const id = parseInt(userData.id);
        const stats = fs.statSync(DB_FILENAME);
        const filePosition = stats.size;
        const dataStr = JSON.stringify(userData) + '\n';
        fs.appendFileSync(DB_FILENAME, dataStr);
        this.index.insert(id, filePosition);
        this.saveIndex();
        console.log(`✅ Saved ID: ${id}`);
        return userData;
    }

    update(id, newUserData) {
        id = parseInt(id);
        const oldPos = this.index.findPosition(id);
        if (oldPos === null) return null;
        const stats = fs.statSync(DB_FILENAME);
        const newPosition = stats.size;
        const finalData = { ...newUserData, id: id };
        const dataStr = JSON.stringify(finalData) + '\n';
        fs.appendFileSync(DB_FILENAME, dataStr);
        this.index.insert(id, newPosition);
        this.saveIndex();
        console.log(`🔄 Updated ID: ${id}`);
        return finalData;
    }

    find(id) {
        id = parseInt(id);
        const position = this.index.findPosition(id);
        if (position === null) return null;
        const fd = fs.openSync(DB_FILENAME, 'r');
        const buffer = Buffer.alloc(5000);
        fs.readSync(fd, buffer, 0, 5000, position);
        fs.closeSync(fd);
        try {
            const str = buffer.toString('utf8').split('\n')[0];
            return JSON.parse(str);
        } catch (e) { return null; }
    }

    getMany(page = 1, limit = 100) {
        const allNodes = this.index.toArray(); 
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const targetNodes = allNodes.slice(startIndex, endIndex);
        const results = [];
        const fd = fs.openSync(DB_FILENAME, 'r');
        const buffer = Buffer.alloc(10000);
        for (const node of targetNodes) {
            try {
                fs.readSync(fd, buffer, 0, 10000, node.p);
                const str = buffer.toString('utf8').split('\n')[0];
                results.push(JSON.parse(str));
            } catch (e) { }
        }
        fs.closeSync(fd);
        return {
            data: results,
            total: allNodes.length,
            page: page,
            totalPages: Math.ceil(allNodes.length / limit)
        };
    }
}

// ==========================================
// PART 2: THE SERVER LOGIC (Express + EJS)
// ==========================================

const app = express();

// Initialize Database
const db = new GigaDB();

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());

// --- ROUTES ---

// A. List Users
app.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const result = db.getMany(page, limit);
    res.render('index', { users: result.data, pagination: result });
});

// B. Show Create Form
app.get('/new', (req, res) => {
    res.render('form', { user: null, mode: 'Create' });
});

// C. Insert Action
app.post('/save', (req, res) => {
    const { id, name, bio, role } = req.body;
    db.insert({ id, name, bio, role });
    res.redirect('/');
});

// D. Show Single User
app.get('/user/:id', (req, res) => {
    const user = db.find(req.params.id);
    if (!user) return res.send("User Not Found");
    res.render('show', { user });
});

// E. Show Edit Form
app.get('/edit/:id', (req, res) => {
    const user = db.find(req.params.id);
    if (!user) return res.send("User Not Found");
    res.render('form', { user: user, mode: 'Update' });
});

// F. Update Action
app.post('/update/:id', (req, res) => {
    const { name, bio, role } = req.body;
    const id = req.params.id; 
    db.update(id, { name, bio, role });
    res.redirect(`/user/${id}`);
});

// START SERVER
app.listen(PORT, () => {
    console.log(`🚀 Server running on Port: ${PORT}`);
});

// ... (Upar app.listen code hai)

app.listen(PORT, () => {
    console.log(`🚀 Server running on Port: ${PORT}`);
});

// --- 👇 YE NEW CODE ADD KARO (Jugaad) 👇 ---
// Ye server ko force karega zinda rehne ke liye
setInterval(() => {
    console.log("❤️ Server Heartbeat: I am alive");
}, 1000 ); // Har 1 ghante me bas ping karega (Background process)