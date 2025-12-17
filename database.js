const fs = require('fs');

const DB_FILENAME = 'users.jsonl';
const IDX_FILENAME = 'users.idx'; // Fast Boot ke liye Index file

// ==========================================
// 1. NODE CLASS (Tree ka Dabba)
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
// 2. INDEX TREE (RAM Logic + Save/Load)
// ==========================================
class IndexTree {
    constructor() {
        this.root = null;
    }

    // --- Insert Logic ---
    insert(id, filePosition) {
        const newNode = new Node(id, filePosition);

        if (this.root === null) {
            this.root = newNode;
            return;
        }

        let current = this.root;
        while (true) {
            // Case 1: ID pehle se hai (Update Pointer)
            if (id === current.id) {
                current.filePosition = filePosition;
                return;
            }
            // Case 2: Left ya Right jao
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

    // --- Find Logic ---
    findPosition(id) {
        let current = this.root;
        while (current) {
            if (id === current.id) return current.filePosition;
            if (id < current.id) current = current.left;
            else current = current.right;
        }
        return null;
    }

    // --- SNAPSHOT: Tree to Array (Save karne ke liye) ---
    toArray() {
        const result = [];
        // In-Order Traversal (Sorted: Small ID -> Big ID)
        function traverse(node) {
            if (!node) return;
            traverse(node.left); // Pehle chhote IDs
            result.push({ i: node.id, p: node.filePosition }); // Fir khud
            traverse(node.right); // Fir bade IDs
        }
        traverse(this.root);
        return result;
    }

    // --- SNAPSHOT: Array to Tree (Load karne ke liye) ---
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

        // STARTUP LOGIC:
        // 1. Pehle dekho Index File hai kya? (Fast Boot)
        if (fs.existsSync(IDX_FILENAME)) {
            console.log("⚡ Fast Boot: Loading Index from 'users.idx'...");
            const rawData = fs.readFileSync(IDX_FILENAME, 'utf8');
            const list = JSON.parse(rawData);
            this.index.fromArray(list);
        }
        // 2. Agar Index nahi hai par Data hai (Crash Recovery)
        else if (fs.existsSync(DB_FILENAME)) {
            console.log("⚠️ Index missing. Rebuilding from Data file...");
            this.rebuildIndex();
            this.saveIndex();
        }
        // 3. Bilkul New Start
        else {
            fs.writeFileSync(DB_FILENAME, '');
            console.log("🔥 New Database Created.");
        }
    }

    // --- Helper: Save Index to Disk ---
    saveIndex() {
        const list = this.index.toArray();
        fs.writeFileSync(IDX_FILENAME, JSON.stringify(list));
    }

    // --- Helper: Rebuild Index (Slow scan) ---
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

    // --- CREATE (Insert Dynamic Object) ---
    insert(userData) {
        if (!userData.id) throw new Error("ID is required");
        const id = parseInt(userData.id);

        const stats = fs.statSync(DB_FILENAME);
        const filePosition = stats.size;

        const dataStr = JSON.stringify(userData) + '\n';
        fs.appendFileSync(DB_FILENAME, dataStr);

        this.index.insert(id, filePosition);
        this.saveIndex(); // Index bhi save kar lo
        
        console.log(`✅ Saved ID: ${id}`);
        return userData;
    }

    // --- UPDATE (Append Only) ---
    update(id, newUserData) {
        id = parseInt(id);
        const oldPos = this.index.findPosition(id);
        if (oldPos === null) return null;

        const stats = fs.statSync(DB_FILENAME);
        const newPosition = stats.size;

        // ID maintain karna zaroori hai
        const finalData = { ...newUserData, id: id };
        const dataStr = JSON.stringify(finalData) + '\n';
        
        fs.appendFileSync(DB_FILENAME, dataStr);
        this.index.insert(id, newPosition);
        this.saveIndex();

        console.log(`🔄 Updated ID: ${id}`);
        return finalData;
    }

    // --- READ (Find Single) ---
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

    // --- NEW: PAGINATION (List 100 Users) ---
    getMany(page = 1, limit = 100) {
        // 1. RAM se saare IDs le ao (Sorted)
        const allNodes = this.index.toArray(); 

        // 2. Math lagao (Kahan se kahan tak chahiye)
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        // Sirf utne nodes uthao (Slice)
        const targetNodes = allNodes.slice(startIndex, endIndex);

        // 3. Disk se Data padho
        const results = [];
        const fd = fs.openSync(DB_FILENAME, 'r');
        const buffer = Buffer.alloc(10000); // Thoda bada buffer safe side ke liye

        for (const node of targetNodes) {
            try {
                // Har node ki position par jump maro
                fs.readSync(fd, buffer, 0, 10000, node.p);
                const str = buffer.toString('utf8').split('\n')[0];
                results.push(JSON.parse(str));
            } catch (e) {
                // Agar koi data corrupt hai to skip karo
            }
        }
        
        fs.closeSync(fd);

        // Frontend ke liye pura package return karo
        return {
            data: results,
            total: allNodes.length,
            page: page,
            totalPages: Math.ceil(allNodes.length / limit)
        };
    }
}

module.exports = GigaDB;