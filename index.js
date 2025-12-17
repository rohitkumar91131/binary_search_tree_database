const express = require('express');
const GigaDB = require('./database');
const path = require('path');

const app = express();
const PORT = 3000;
const db = new GigaDB();

// 1. EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Middleware (Form Data Padhne ke liye)
app.use(express.urlencoded({ extended: true })); // HTML Forms ke liye zaroori hai
app.use(express.json());

// --- ROUTES ---

// A. LIST ALL USERS (Home Page)
app.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    
    // DB se 100 users mango
    const result = db.getMany(page, limit);
    
    // index.ejs render karo data ke sath
    res.render('index', { 
        users: result.data, 
        pagination: result 
    });
});

// B. SHOW CREATE FORM
app.get('/new', (req, res) => {
    res.render('form', { user: null, mode: 'Create' });
});

// C. ACTION: INSERT USER
app.post('/save', (req, res) => {
    const { id, name, bio, role } = req.body;
    db.insert({ id, name, bio, role });
    res.redirect('/'); // Wapas home page bhejo
});

// D. SHOW SINGLE USER
app.get('/user/:id', (req, res) => {
    const user = db.find(req.params.id);
    if (!user) return res.send("User Not Found");
    res.render('show', { user });
});

// E. SHOW EDIT FORM
app.get('/edit/:id', (req, res) => {
    const user = db.find(req.params.id);
    if (!user) return res.send("User Not Found");
    res.render('form', { user: user, mode: 'Update' });
});

// F. ACTION: UPDATE USER
app.post('/update/:id', (req, res) => {
    const { name, bio, role } = req.body;
    const id = req.params.id; // URL se ID lo
    
    db.update(id, { name, bio, role });
    res.redirect(`/user/${id}`); // User ki profile pe bhejo
});

app.listen(PORT, () => {
    console.log(`🚀 Frontend running at http://localhost:${PORT}`);
});