const fs = require('fs');

const DB_FILENAME = 'users.jsonl';
const IDX_FILENAME = 'users.idx'; 

// ==========================================
// 1. NODE CLASS
// ==========================================
class Node {
    constructor(id, filePosition) {
        this.id = id;
        this.filePosition = filePosition;
        this.left = null;
        this.right = null;
    }
}

// ==========================================
// 2. INDEX TREE
// ==========================================
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

// ==========================================
// 3. MAIN GIGADB CLASS
// ==========================================
class GigaDB {
    constructor() {
        this.index = new IndexTree();

        if (fs.existsSync(IDX_FILENAME)) {
            console.log("⚡ Fast Boot: Loading Index from 'users.idx'...");
            const rawData = fs.readFileSync(IDX_FILENAME, 'utf8');
            const list = JSON.parse(rawData);
            this.index.fromArray(list);
        }
        else if (fs.existsSync(DB_FILENAME)) {
            console.log("⚠️ Index missing. Rebuilding from Data file...");
            this.rebuildIndex();
            this.saveIndex();
        }
        else {
            fs.writeFileSync(DB_FILENAME, '');
            console.log("🔥 New Database Created.");
            
            // --- AUTO SEED MAGIC 🪄 ---
            // Agar database naya hai, to turant 1000 data bhar do
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

    // --- NEW: BULK SEED FUNCTION 🌱 ---
    seed(count) {
        console.log(`🚀 Starting Seed: Inserting ${count} records...`);
        console.time("seedTime");

        // Loop chalayenge
        for (let i = 1; i <= count; i++) {
            
            // 1. Fake Data Banao
            const user = {
                id: i,
                name: `User_${i}`,
                role: i % 10 === 0 ? "Admin" : "User", // Har 10th banda Admin
                bio: `This is an auto-generated bio for User number ${i}.`
            };

            // 2. Direct Write (Fast)
            const stats = fs.statSync(DB_FILENAME);
            const pos = stats.size;
            
            const str = JSON.stringify(user) + '\n';
            fs.appendFileSync(DB_FILENAME, str);

            // 3. RAM Index Update
            this.index.insert(i, pos);
        }

        // 4. Sab hone ke baad EK BAAR Index save karo (Super Fast)
        this.saveIndex();
        
        console.timeEnd("seedTime");
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
        } catch (e) {
            return null;
        }
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

module.exports = GigaDB;