const express = require('express');
const GigaDB = require('./database');
const path = require('path');

const app = express();

// --- CRITICAL FIX FOR RENDER/CLOUD ---
// Agar Cloud ne Port diya hai to wo lo, nahi to 3000
const PORT = process.env.PORT || 3000; 

const db = new GigaDB();

// 1. EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Middleware
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());

// --- ROUTES ---

// A. LIST ALL USERS
app.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 100;
    const result = db.getMany(page, limit);
    res.render('index', { users: result.data, pagination: result });
});

// B. SHOW CREATE FORM
app.get('/new', (req, res) => {
    res.render('form', { user: null, mode: 'Create' });
});

// C. ACTION: INSERT USER
app.post('/save', (req, res) => {
    const { id, name, bio, role } = req.body;
    db.insert({ id, name, bio, role });
    res.redirect('/'); 
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
    const id = req.params.id; 
    db.update(id, { name, bio, role });
    res.redirect(`/user/${id}`); 
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on Port: ${PORT}`);
});