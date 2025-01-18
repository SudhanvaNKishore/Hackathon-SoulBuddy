const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const cassandra = require('cassandra-driver');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// Check for secure bundle file
const bundlePath = process.env.SECURE_CONNECT_BUNDLE_PATH;
if (!fs.existsSync(bundlePath)) {
    console.error('Secure connect bundle not found!');
    console.error('Looking for bundle at:', bundlePath);
    console.error('Please check the SECURE_CONNECT_BUNDLE_PATH in your .env file');
    process.exit(1);
}

// Initialize Cassandra client
const client = new cassandra.Client({
    cloud: {
        secureConnectBundle: bundlePath
    },
    credentials: {
        username: process.env.ASTRA_DB_USERNAME,
        password: process.env.ASTRA_DB_PASSWORD
    },
    keyspace: process.env.ASTRA_DB_KEYSPACE
});

// Add debug logging
console.log('Attempting to connect with:', {
    bundlePath,
    keyspace: process.env.ASTRA_DB_KEYSPACE,
    username: process.env.ASTRA_DB_USERNAME ? 'Set' : 'Missing',
    password: process.env.ASTRA_DB_PASSWORD ? 'Set' : 'Missing'
});

// Connect to database
client.connect()
    .then(() => {
        console.log('Successfully connected to Astra DB');
        console.log('Using keyspace:', process.env.ASTRA_DB_KEYSPACE);
        setupDatabase();
    })
    .catch(err => {
        console.error('Failed to connect to Astra DB:', err);
        process.exit(1);
    });

// Create table if it doesn't exist
async function setupDatabase() {
    const createTable = `
        CREATE TABLE IF NOT EXISTS users (
            id uuid PRIMARY KEY,
            name text,
            date_of_birth date,
            time_of_birth text,
            gender text,
            state text,
            city text,
            created_at timestamp
        )
    `;

    try {
        await client.execute(createTable);
        console.log("Database table setup completed");
    } catch (err) {
        console.error("Error setting up database table:", err);
        process.exit(1);
    }
}

// API endpoint to save user data
app.post("/api/users", async (req, res) => {
    console.log("Received request body:", req.body);

    const { name, dateOfBirth, time, gender, state, city } = req.body;

    if (!name || !dateOfBirth || !time || !gender || !state || !city) {
        return res.status(400).json({ 
            error: "All fields are required",
            received: { name, dateOfBirth, time, gender, state, city }
        });
    }

    const query = `
        INSERT INTO users (
            id, name, date_of_birth, time_of_birth, 
            gender, state, city, created_at
        ) 
        VALUES (uuid(), ?, ?, ?, ?, ?, ?, toTimestamp(now()))
    `;

    try {
        await client.execute(query, [
            name, 
            dateOfBirth, 
            time, 
            gender, 
            state, 
            city
        ], { prepare: true });

        console.log("User data saved successfully");

        res.status(201).json({ 
            message: "User profile created successfully",
            data: { name, dateOfBirth, time, gender, state, city }
        });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ 
            error: "Failed to save user data",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// API endpoint to fetch user data
app.get("/api/users", async (req, res) => {
    const query = "SELECT * FROM users";
    try {
        const result = await client.execute(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: "Failed to fetch user data" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
